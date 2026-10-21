"""Execute real Python SqlTable cycles with controlled clock/UUID, not a simulated cycle."""
import json
import re
import sqlite3
import tempfile
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import patch

from python_reference import ROOT
from asqueel import AsqueelDb, SqlBuilder, SqlDatabaseConfig, SqlTable, SqlMigrationRenderer, resolve_model
from application_hooks import declare, handlers
from model_oracle import document
from genro_toolbox.uid import get_uuid


def normalize(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: normalize(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [normalize(v) for v in value]
    return value


def recipe():
    b = SqlBuilder()
    declare(b.source.db('hooks', implementation='sqlite').packages().package('app', sqlschema='main', sqlprefix=False))
    return b


def run_case(case):
    events, statements, results, refs = [], [], [], {}
    ticks = ids = 0

    class Clock:
        @staticmethod
        def now(tz=None):
            nonlocal ticks
            value = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc) + timedelta(milliseconds=ticks)
            ticks += 1
            return value if tz else value.replace(tzinfo=None)

    def uuid():
        nonlocal ids
        ids += 1
        return 'Z' + str(ids).zfill(21)

    callbacks = handlers(events) if case.get('hooks', True) else {}
    classes = {name: type(name.split('.')[-1].title(), (SqlTable,), methods) for name, methods in callbacks.items()}
    with tempfile.TemporaryDirectory(prefix='asqueel-hooks-') as folder:
        path = str(Path(folder) / 'runtime.db')
        config = SqlDatabaseConfig()
        root = config.source.db('hooks', implementation='sqlite')
        root.connection('main', database=path)
        declare(root.packages().package('app', sqlschema='main', sqlprefix=False), classes)
        db = AsqueelDb(config)
        try:
            db.migrate()
            db.commit()
            original_execute = db.execute

            def execute(query, *args, **kwargs):
                if not isinstance(query, str) and re.match(r'^(INSERT|UPDATE|DELETE)\b', query.sql):
                    keys = set(re.findall(r':([A-Za-z_]\w*)', query.sql))
                    statements.append(dict(sql=query.sql, params=normalize({k: int(v) if isinstance(v, bool) else v
                        for k, v in query.params.items() if k in keys})))
                return original_execute(query, *args, **kwargs)

            db.execute = execute

            def steps(items):
                for step in items:
                    table = db.table(step.get('table', 'app.note'))
                    values = deepcopy(refs[step['values_from']]) if 'values_from' in step else deepcopy(step.get('values', {}))
                    if isinstance(values, dict):
                        values.update(step.get('changes', {}))
                    if 'key_from' in step:
                        values = refs[step['key_from']]['id']
                    old = deepcopy(refs[step['old_from']]) if 'old_from' in step else deepcopy(step.get('old_record'))
                    options = {k: deepcopy(step[k]) for k in ('pkey', 'ignore_partition') if k in step}
                    if step['op'] == 'update':
                        options['old_record'] = old
                    try:
                        result = getattr(table, step['op'])(values, **options)
                    except Exception:
                        results.append(dict(record=normalize(values), old=normalize(old), failed=True))
                        if step.get('catch'):
                            continue
                        raise
                    results.append(dict(record=normalize(values), old=normalize(old), result=normalize(result)))
                    if 'save' in step:
                        refs[step['save']] = deepcopy(result)

            with patch('asqueel.table_triggers.datetime', Clock), patch('asqueel.table_crud.get_uuid', uuid):
                db.currentEnv = case.get('setup_environment', {'user': 'ada'})
                steps(case.get('setup', []))
                db.commit()
                events.clear(); statements.clear(); results.clear()
                db.currentEnv = case.get('environment', {'user': 'ada'})
                failed = False
                try:
                    steps(case['steps'])
                    db.commit()
                except Exception as error:
                    failed = True
                    db.rollback()
                    if case.get('error'):
                        assert case['error'] in str(error), f'{case["name"]}: unexpected error {error}'
                assert failed == case.get('fails', False), f'{case["name"]}: unexpected outcome'
                with sqlite3.connect(path) as raw:
                    raw.row_factory = sqlite3.Row
                    rows = {name: [dict(row) for row in raw.execute(f'SELECT * FROM "{name}" ORDER BY id')]
                            for name in ('note', 'audit', 'plain', 'simple')}
                return dict(failed=failed, results=normalize(results), events=normalize(events), statements=statements, rows=rows)
        finally:
            db.closeConnection()


def oracle():
    b = recipe()
    inputs = json.loads((ROOT / 'test/hooks-inputs.json').read_text())
    ids = []
    for milliseconds, raw in [(1767323045000, list(range(9))), (1767323045123, [255] * 9)]:
        with patch('genro_toolbox.uid.time.time', lambda: milliseconds / 1000), patch('genro_toolbox.uid.os.urandom', lambda n: bytes(raw)):
            ids.append(dict(milliseconds=milliseconds, bytes=raw, expected=get_uuid()))
    return dict(model=document(resolve_model(b)), desired=SqlMigrationRenderer(b).render(), ids=ids,
                cases=[dict(name=c['name'], input=c, expected=run_case(c)) for c in inputs])


if __name__ == '__main__':
    result = oracle()
    (ROOT / 'test/fixtures/hooks.json').write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(f'Python: {len(result["cases"])} real application write-cycle cases exported')
