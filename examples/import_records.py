"""Independent declarations for Python file import comparisons."""
from asqueel import SqlTable

class ImportTable(SqlTable):
    events = None
    def trigger_onInserting(self, record):
        self.events.append('unexpected table trigger')
    def trigger_unexpected(self, record, **kwargs):
        self.events.append('unexpected field trigger')

class Upper(ImportTable):
    def adaptRecord(self, record):
        record = super().adaptRecord(record)
        record['name'] = record['name'].upper()
        return record

def declare(pkg, runtime=False):
    for name, dtype in [('item', 'L'), ('automatic', 'I'), ('upper', 'L')]:
        table = pkg.table(name, pkey='id', **({'x_table_class': Upper if name == 'upper' else ImportTable} if runtime else {}))
        table.column('id', dtype=dtype, **({'sql_default': 'NULL'} if name == 'automatic' else {}))
        table.column('name', dtype='T', onInserting='unexpected')
        table.column('price', dtype='N', size='10,2')
        table.column('stock', dtype='L')
        table.column('active', dtype='B')
        table.column('since', dtype='D')
        table.column('moment', dtype='DHZ')
        table.column('time', dtype='H')
        table.column('note', dtype='T', default='application-only', sql_default="'database'")
        table.formulaColumn('label', sql_formula='$name')
