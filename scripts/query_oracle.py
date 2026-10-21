"""Independent SQL/parameter/result oracle against the pinned Python 0.6.1 + #44."""
import json
from pathlib import Path
import sqlite3
import tempfile
from copy import deepcopy
from types import MethodType

from python_reference import ROOT

from asqueel import SqlMigrationRenderer, QueryCompiler, SqlDatabase, SqlDatabaseConfig
from asqueel.model import resolve_model
from asqueel.adapters.sqlite import SqlDbAdapter
from asqueel.write_compiler import WriteCompiler
from asqueel_migration import SqlMigrator
from asqueel_migration.adapters.sqlite_adapter import SqliteDatabase
from browser_queries import query_model
from query_features import feature_model
from read_formulas import read_model
from subqueries import subquery_model
from compiler_callbacks import callback_model, callback_methods
from asqueel import UnsupportedFeatureError
from asqueel.environment import SqlEnvironment
from asqueel.configuration import _owned_handler
from model_oracle import document


def requests(filename):
    return [(c['name'], c['request']) for c in json.loads((ROOT / 'test' / filename).read_text())]


def query_oracle(builder=None, inputs='query-inputs.json', errors=None, methods=None):
    builder = builder if builder is not None else query_model()
    desired = SqlMigrationRenderer(builder).render()
    model = resolve_model(builder)
    model_document = document(model)
    runtime, events = None, []
    if methods:
        config = SqlDatabaseConfig()
        config.source.db('callbacks', implementation='sqlite').connection('main', database=':memory:')
        runtime = SqlDatabase(model=model, config=_owned_handler(config))
        for name, handlers in methods(events).items():
            table = runtime.table(name)
            for method, handler in handlers.items():
                setattr(table, method, MethodType(handler, table))
    adapter = SqlDbAdapter(None)
    writer = WriteCompiler(adapter)
    result = {"model": model_document, "desired": desired, "cases": []}
    with tempfile.TemporaryDirectory(prefix="asqueel-query-oracle-") as directory:
        path = str(Path(directory) / "query.db")
        db = SqliteDatabase({"dbname": path}, application_schemas=["main"])
        migration = SqlMigrator(db, structure=desired)
        migration.prepareMigrationCommands()
        migration.applyChanges()
        connection = sqlite3.connect(path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        if inputs == 'query-feature-inputs.json':
            # The additive JS migrator deliberately rejects generated-column DDL.
            # Compile/execute queries against the independently migrated Python schema.
            result['ddl'] = [row['sql'] for row in connection.execute(
                "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid")]
        try:
            for name, request in requests(inputs):
                kwargs = {k: v for k, v in request.items() if k not in ("operation", "table")}
                environment = kwargs.pop('environment', {})
                if runtime:
                    runtime.currentEnv = deepcopy(environment)
                    events.clear()
                compiler = QueryCompiler(model, adapter, environment=runtime.environment if runtime else SqlEnvironment(environment))
                if request['operation'] in ('select', 'count'):
                    compiled = getattr(compiler, request['operation'])(request['table'], **kwargs)
                else:
                    values = kwargs.pop('values')
                    compiled = getattr(writer, request['operation'])(model.table(request['table']), values, environment, **kwargs)
                cursor = connection.execute(compiled.sql, dict(compiled.params))
                rows = [dict(row) for row in cursor.fetchall()]
                result["cases"].append({"name": name, "request": request,
                    "compiled": {"sql": compiled.sql, "params": dict(compiled.params)}, "rows": rows, **({"events": list(events)} if runtime else {})})
            connection.commit()
        finally:
            connection.close()
    if errors:
        result['errors'] = []
        for name, request in requests(errors):
            options = {k: v for k, v in request.items() if k not in ('operation', 'table')}
            environment = options.pop('environment', {})
            if runtime:
                runtime.currentEnv = deepcopy(environment)
            compiler = QueryCompiler(model, adapter, environment=runtime.environment if runtime else SqlEnvironment(environment))
            try:
                compiler.select(request['table'], **options)
            except (ValueError, UnsupportedFeatureError, KeyError, TypeError):
                result['errors'].append(dict(name=name, request=request, rejected=True))
            else:
                raise AssertionError(f'{name}: Python unexpectedly accepted the query')
    if runtime:
        result['cache'] = []
        runtime.currentEnv = {'factor': 3}
        for index, factor in enumerate([3, 5, 7]):
            if index == 2:
                runtime.currentEnv = {'factor': factor}
            else:
                runtime.currentEnv['factor'] = factor
            events.clear()
            compiled = QueryCompiler(model, adapter, environment=runtime.environment).select(
                'app.owner', columns='$dynamicscale,$scaled,$dynamic_method')
            result['cache'].append(dict(compiled=dict(sql=compiled.sql, params=dict(compiled.params)), events=list(events)))
        runtime.closeConnection()
    return result


if __name__ == "__main__":
    oracle = query_oracle()
    (ROOT / "test/fixtures/queries.json").write_text(json.dumps(oracle, indent=2, ensure_ascii=False) + "\n")
    print(f"Python: {len(oracle['cases'])} query cases compiled and executed on SQLite.")
    features = query_oracle(feature_model(), 'query-feature-inputs.json')
    (ROOT / 'test/fixtures/query-features.json').write_text(json.dumps(features, indent=2, ensure_ascii=False) + '\n')
    print(f"Python: {len(features['cases'])} additional feature cases compiled and executed on SQLite.")
    reads = query_oracle(read_model(), 'read-inputs.json')
    (ROOT / 'test/fixtures/reads.json').write_text(json.dumps(reads, indent=2, ensure_ascii=False) + '\n')
    print(f"Python: {len(reads['cases'])} computed-read cases compiled and executed on SQLite.")
    subqueries = query_oracle(subquery_model(), 'subquery-inputs.json', 'subquery-errors.json')
    (ROOT / 'test/fixtures/subqueries.json').write_text(json.dumps(subqueries, indent=2, ensure_ascii=False) + '\n')
    print(f"Python: {len(subqueries['cases'])} subquery/aggregate cases and {len(subqueries['errors'])} rejected queries.")

    callbacks = query_oracle(callback_model(), 'callback-inputs.json', 'callback-errors.json', callback_methods)
    (ROOT / 'test/fixtures/callbacks.json').write_text(json.dumps(callbacks, indent=2, ensure_ascii=False) + '\n')
    print(f"Python: {len(callbacks['cases'])} callback cases and {len(callbacks['errors'])} rejected queries.")
