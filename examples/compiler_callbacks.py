"""Independent Python declarations and actual bound SqlTable methods."""
from asqueel import SqlBuilder


def callback_model():
    b = SqlBuilder()
    pkg = b.source.db('callbacks', implementation='sqlite').packages().package('app', sqlschema='main', sqlprefix=False)
    owner = pkg.table('owner', pkey='id')
    owner.column('id', dtype='L')
    owner.column('code', dtype='T')
    owner.column('amount', dtype='L')
    for name in ['scaled', 'from_formula', 'invalid', 'cycle', 'missing', 'raises']:
        owner.formulaColumn(name, sql_formula=True)
    owner.formulaColumn('total', select='total')
    owner.formulaColumn('present', exists='present')
    owner.formulaColumn('named', sql_formula='#a + #b + :factor', select_a='total', select_b='total', var_factor=3)
    owner.formulaColumn('label', sql_formula='#ENV(label)')
    owner.formulaColumn('foreign_label', sql_formula='#ENV(label,app.line)')
    owner.formulaColumn('fallback_label', sql_formula='#ENV(label,fallback)')
    owner.formulaColumn('nested', select=dict(table='app.line', columns='MAX(@owner_id.total)', where='$owner_id=#THIS.id'))
    owner.aliasColumn('alias', relation_path='$scaled')
    owner.subQueryColumn('first', query='first')
    for name in ['invalid', 'missing', 'cycle', 'raises', 'options', 'multi', 'where']:
        owner.formulaColumn('sub_' + name, select=name)
    line = pkg.table('line', pkey='id')
    line.column('id', dtype='L')
    line.column('amount', dtype='L')
    line.column('owner_id', dtype='L').relation('app.owner.id', relation_name='lines')
    line.column('other_id', dtype='L').relation('app.owner.id', relation_name='others')
    return b


def callback_methods(events):
    def call(self, name):
        events.append(f'{self.fullname}.{name}')

    def scaled(self, attr):
        call(self, 'scaled')
        attr['var_factor'] = self.db.currentEnv.get('factor', 2)
        return '$amount * :factor'

    def from_formula(self, attr):
        call(self, 'from_formula')
        attr['select_result'] = 'total'
        attr['var_factor'] = 5
        attr.update(self.db.currentEnv.get('attributes', {}))
        return '#result + :factor'

    def invalid(self, attr=None):
        if attr is not None:
            call(self, 'invalid')
        return self.db.currentEnv.get('invalid')

    def cycle(self, attr):
        call(self, 'cycle')
        return '$cycle'

    def raises(self, attr=None):
        raise TypeError('method application error')

    def label(self):
        call(self, 'env_label')
        return "'owner SQL'" if self.fullname == 'app.owner' else "'line SQL'"

    def total(self):
        call(self, 'total')
        return dict(table='app.line', columns='SUM($amount * :factor)', where='$owner_id=#THIS.id',
                    sqlparams=dict(factor=self.db.currentEnv.get('factor', 7 if self.fullname == 'app.owner' else 11)))

    def present(self):
        call(self, 'present')
        return dict(table='app.line', columns='$id', where='$owner_id=#THIS.id')

    def first(self):
        call(self, 'first')
        return dict(table='app.line', columns='$amount', where='$owner_id=#THIS.id', order_by='$id', limit=1)

    def sub_cycle(self):
        return dict(table='app.owner', columns='$sub_cycle', where='$id=#THIS.id')

    def options(self):
        return dict(table='app.line', columns='$amount', where='$owner_id=#THIS.id', invalid=True)

    def multi(self):
        return dict(table='app.line', columns='$id,$amount', where='$owner_id=#THIS.id')

    def where(self):
        return dict(table='app.line', columns='$amount')

    def dynamic_a(self):
        call(self, 'dynamic_a')
        return [dict(name=self.db.currentEnv.get('dynamic_name', 'twice'), sql_formula='$amount * 2'),
                dict(name='DynamicScale', sql_formula='$amount * ' + str(self.db.currentEnv.get('factor', 2)))]

    def dynamic_b(self):
        call(self, 'dynamic_b')
        return dict(name='dynamic_method', sql_formula=True)

    def dynamic_method(self, attr):
        call(self, 'dynamic_method')
        attr['var_offset'] = 4
        return '$amount + :offset'

    methods = dict(sql_formula_scaled=scaled, sql_formula_from_formula=from_formula, sql_formula_invalid=invalid,
                   sql_formula_cycle=cycle, sql_formula_raises=raises, env_label=label, subquery_total=total,
                   subquery_present=present, subquery_first=first, subquery_invalid=invalid, subquery_cycle=sub_cycle,
                   subquery_raises=raises, subquery_options=options, subquery_multi=multi, subquery_where=where,
                   formulaColumn_a=dynamic_a, formulaColumn_b=dynamic_b, sql_formula_dynamic_method=dynamic_method)
    return {name: methods for name in ['app.owner', 'app.line']}
