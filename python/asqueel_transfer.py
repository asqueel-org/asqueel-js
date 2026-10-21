"""Portable source + record snapshots. No synchronization or executable Python code.

The application selects records and owns authorization, ownership and write-back.
"""
from copy import deepcopy
from datetime import date, time, datetime
from decimal import Decimal
import json
import math
from genro_bag import Bag
from genro_builders import SourceBag
from genro_tytx import from_tytx, to_tytx
from asqueel import SqlBuilder, SqlDatabaseConfig, resolve_model, SqlMigrationRenderer, AsqueelDb
from asqueel.configuration import _compose_source

FORMAT = 'asqueel-transfer'


def source_builder(payload, configuration=False):
    source = SourceBag.from_tytx(payload)
    if not isinstance(source, SourceBag):
        raise ValueError('Expected a SourceBag')
    builder = (SqlDatabaseConfig if configuration else SqlBuilder)()
    _compose_source(builder, builder.source, source)
    builder.validate_source()
    resolve_model(builder)
    return builder


def export_transfer(builder, records, *, tables=None, packages=None):
    """Select source declarations; records is {qualified_table: iterable[dict]}.

    SQLite projection keeps explicit SQL names/prefixes and maps schemas to main.
    Missing relation targets are errors, never silently removed or downloaded.
    Connections and Python table classes are excluded and reported.
    """
    wanted = None if tables is None else set(tables)
    pkgs = None if packages is None else set(packages)
    original_model = resolve_model(builder)
    available = set(original_model.tables)
    if wanted is not None and wanted - available:
        raise ValueError(f'Unknown tables: {sorted(wanted - available)}')
    available_packages = set(original_model.packages)
    if pkgs is not None and pkgs - available_packages:
        raise ValueError(f'Unknown packages: {sorted(pkgs - available_packages)}')
    selected = {t for t in available if (wanted is None or t in wanted) and (pkgs is None or t.split('.')[0] in pkgs)}
    included_packages = (available_packages if pkgs is None else pkgs) if wanted is None else {t.split('.')[0] for t in selected} | (pkgs or set())
    omitted = []
    def copy_source(bag, package=None, path=''):
        result = SourceBag(builder=None)
        for n in bag:
            tag = n.node_tag
            attrs = deepcopy(dict(n.attr))
            name = attrs.get('name', n.label)
            nodepath = f'{path}.{n.label}'.strip('.')
            pkg = name if tag == 'package' else package
            if tag == 'package' and pkg not in included_packages:
                continue
            if tag == 'table' and f'{pkg}.{name}' not in selected:
                continue
            if tag == 'requires':
                required = attrs['packages']
                missing = set([required] if isinstance(required, str) else required) - included_packages
                if missing: raise ValueError(f'{pkg}: missing required packages {sorted(missing)}')
            if tag == 'connection':
                omitted.append(nodepath); continue
            if 'x_table_class' in attrs:
                del attrs['x_table_class']; omitted.append(nodepath + '.x_table_class')
            if tag == 'db': attrs['implementation'] = 'sqlite'
            if tag == 'package' or 'sqlschema' in attrs: attrs['sqlschema'] = 'main'
            # Runtime class objects/callables/resolvers must not cross this boundary.
            json.dumps(attrs, allow_nan=False)
            value = n.get_value(static=True)
            if value is not None and not isinstance(value, Bag):
                raise ValueError(f'{nodepath}: scalar source node is unsupported')
            result.set_item(n.label, copy_source(value, pkg, nodepath) if isinstance(value, Bag) else None,
                            _attributes=attrs, _remove_null_attributes=False, node_tag=tag)
        return result
    source = copy_source(builder.source).to_tytx()
    portable = source_builder(source)
    model = resolve_model(portable)
    sqlnames = [t.sqlname.lower() for t in model.tables.values()]
    if len(sqlnames) != len(set(sqlnames)):
        raise ValueError('SQLite table name collision after schema projection')
    SqlMigrationRenderer(portable).render()
    if set(records) - selected:
        raise ValueError(f'Data outside source selection: {sorted(set(records) - selected)}')
    data = {}
    for name, rows in records.items():
        columns = model.tables[name].columns
        if any(c.attributes['dtype'] not in {'A','B','C','D','DH','DHZ','H','I','L','N','R','T','X','O'} for c in columns.values()):
            raise ValueError(f'{name}: unsupported snapshot column type')
        lines = []
        for row in rows:
            if set(row) != set(columns): raise ValueError(f'{name}: snapshot requires every physical column exactly once')
            lines.append(json.dumps({k: column_wire(v, columns[k].attributes['dtype']) for k, v in row.items()}, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '::JS\n')
        data[name] = ''.join(lines)
    return dict(format=FORMAT, version=1, source=source, data=data, omitted=omitted)


def bag_wire(bag):
    # Keep the standard Bag wire (including labels/tags/subtypes). Replace scalar
    # payloads before transport to retain civil datetimes and six fractional digits.
    encoded = bag.to_tytx()
    payload = encoded[:-3]
    if payload.endswith('::JS'): payload = payload[:-4]
    wire = json.loads(payload)
    rows = iter(wire['rows'])
    def visit(value):
        for node in value:
            if node.resolver is not None: raise ValueError('Snapshot Bags cannot contain resolvers')
            row = next(rows)
            child = node.get_value(static=True)
            row[4] = {k: wire_value(v) for k, v in node.attr.items()}
            if isinstance(child, Bag): visit(child)
            else: row[3] = wire_value(child)
    visit(bag)
    return json.dumps(wire, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '::JS::X'


def column_wire(value, dtype):
    if value is not None:
        if dtype == 'X' and not isinstance(value, Bag): raise ValueError('X snapshot field requires a Bag or NULL')
        if dtype == 'O' and not isinstance(value, (bytes, bytearray, memoryview)): raise ValueError('O snapshot field requires bytes or NULL')
        if dtype not in {'X','O'} and isinstance(value, (Bag, bytes, bytearray, memoryview, dict, list, tuple)):
            raise ValueError('Bag/blob value in a scalar column')
    return wire_value(value)


def wire_value(value):
    if isinstance(value, Bag): return bag_wire(value)
    if isinstance(value, (bytes, bytearray, memoryview)): return to_tytx(bytes(value))
    if isinstance(value, dict):
        return {k: wire_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [wire_value(v) for v in value]

    # Generic TYTX datetime encoding normalizes UTC/milliseconds. Snapshots retain
    # civil spelling, timezone and all six Python fractional digits instead.
    if isinstance(value, datetime): return value.isoformat() + '::DHZ'
    if isinstance(value, date): return value.isoformat() + '::D'
    if isinstance(value, time): return value.isoformat() + '::H'
    if isinstance(value, Decimal):
        if not value.is_finite(): raise ValueError('Non-finite Decimal')
        return str(value) + '::N'
    if isinstance(value, str): return value + '::T'
    if isinstance(value, int) and abs(value) > 2**53-1: raise ValueError('Unsafe snapshot integer')
    if isinstance(value, float) and (not math.isfinite(value) or value.is_integer() and abs(value)>2**53-1):
        raise ValueError('Unsafe snapshot number')
    if value is None or isinstance(value, (bool, int, float)): return value
    raise ValueError(f'Unsupported snapshot value: {type(value).__name__}')


def read_transfer(bundle):
    if not isinstance(bundle, dict) or bundle.get('format') != FORMAT or bundle.get('version') != 1:
        raise ValueError('Unsupported transfer format/version')
    if not isinstance(bundle.get('data'), dict): raise ValueError('Expected table data')
    source = SourceBag.from_tytx(bundle['source'])
    if not isinstance(source, SourceBag): raise ValueError('Expected a SourceBag')
    packages, required = set(), set()
    def check_source(bag):
        for node in bag:
            if node.node_tag == 'package': packages.add(node.attr['name'])
            if node.node_tag == 'requires':
                names = node.attr['packages']; required.update([names] if isinstance(names, str) else names)
            if node.node_tag == 'connection' or 'x_table_class' in node.attr:
                raise ValueError('Runtime declarations cannot be transferred')
            value = node.get_value(static=True)
            if isinstance(value, Bag): check_source(value)
            elif value is not None: raise ValueError('Scalar source node is unsupported')
    check_source(source)
    if required - packages: raise ValueError('Missing required package in source selection')
    builder = source_builder(bundle['source'])
    model = resolve_model(builder)
    if model.db.attributes['implementation'] != 'sqlite': raise ValueError('Expected SQLite source')
    names = [t.sqlname.lower() for t in model.tables.values()]
    if len(names) != len(set(names)): raise ValueError('SQLite table name collision')
    if any(t.sqlschema != 'main' for t in model.tables.values()): raise ValueError('Expected SQLite main schema')
    if set(bundle['data']) - set(model.tables): raise ValueError('Data table absent from source')
    if any(not isinstance(v, str) for v in bundle['data'].values()): raise ValueError('Expected TYTX text')
    return builder


def quote(name): return '"' + name.replace('"', '""') + '"'


def stored_value(value):
    wire_value(value)  # Same type/precision validation on the receiving side.
    if isinstance(value, Bag): return bag_wire(value)
    if isinstance(value, (bytes, bytearray, memoryview)): return bytes(value)
    if isinstance(value, (date, time, datetime)): return value.isoformat()
    if isinstance(value, Decimal): return str(value)
    if isinstance(value, bool): return int(value)
    if value is None or isinstance(value, (str, int, float)): return value
    raise ValueError(f'Unsupported stored value: {type(value).__name__}')


def load_transfer(bundle, path):
    """Create/migrate SQLite then insert a snapshot atomically, preserving NULL.

    Returns the portable builder. Requires an empty SQLite destination.
    DDL is committed separately; a data error rolls back every imported table.
    """
    import sqlite3
    builder = read_transfer(bundle)
    # This receiver is a staging operation, never a migration of the remote DB.
    with sqlite3.connect(path) as con:
        if con.execute("SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1").fetchone():
            raise ValueError('Python receiver requires an empty SQLite destination')
    config = source_builder(bundle['source'], configuration=True)
    config.source['db'].connection('main', database=str(path))
    db = AsqueelDb(config)
    try: db.migrate(); db.commit()
    finally: db.closeConnection()
    model = resolve_model(builder)
    with sqlite3.connect(path) as con:
        con.execute('PRAGMA foreign_keys=ON')
        con.execute('BEGIN IMMEDIATE')
        con.execute('PRAGMA defer_foreign_keys=ON')
        for name, text in bundle['data'].items():
            table = model.tables[name]
            columns = list(table.columns.values())
            labels = [c.name for c in columns]
            sql = f'INSERT INTO "main".{quote(table.sqlname)} ({", ".join(quote(c.sqlname) for c in columns)}) VALUES ({", ".join(":c" + str(i) for i in range(len(columns)))})'
            for line in text.splitlines():
                if not line.strip(): continue
                row = from_tytx(line)
                if not isinstance(row, dict) or set(row) != set(labels):
                    raise ValueError(f'{name}: snapshot requires every physical column exactly once')
                for c in columns: column_wire(row[c.name], c.attributes['dtype'])
                con.execute(sql, {f'c{i}': stored_value(row[c]) for i, c in enumerate(labels)})
        if con.execute('PRAGMA foreign_key_check').fetchone(): raise ValueError('Snapshot has missing referenced records')
    return builder
