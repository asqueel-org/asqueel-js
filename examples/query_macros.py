"""Independent Python recipe for #TEMPLATE and #IN_RANGE parity."""
from asqueel import SqlBuilder


def macro_model():
    b = SqlBuilder()
    pkg = b.source.db('macros', implementation='sqlite').packages().package('macro', sqlschema='main', sqlprefix=True)
    city = pkg.table('city', pkey='id')
    city.column('id', dtype='L')
    city.column('name', dtype='T')
    person = pkg.table('person', pkey='id')
    for name in ['id', 'city_id', 'amount', 'low_bound', 'high_bound']:
        person.column(name, dtype='L')
    person.column('name', dtype='T')
    person.column('surname', dtype='T')
    person.column('city_id').relation('macro.city.id')
    person.formulaColumn('label', sql_formula="#TEMPLATE('${n} - ${s} (${c})', $name AS n, $surname AS s, @city_id.name AS c)", dtype='T')
    person.formulaColumn('priced', sql_formula="#TEMPLATE('${n}: ${v}', $label AS n, $amount * :factor AS v)", var_factor=2, dtype='T')
    person.formulaColumn('within', sql_formula='#IN_RANGE($amount,:low,:high)', var_low=10, var_high=20, dtype='B')
    person.formulaColumn('within_fields', sql_formula='#IN_RANGE($amount,$low_bound,$high_bound)', dtype='B')
    person.formulaColumn('range_label', sql_formula="#TEMPLATE('within=${v}', $within AS v)", dtype='T')
    person.formulaColumn('caption', sql_formula="#TEMPLATE('${p}${n}', #ENV(prefix) AS p, #THIS.name AS n)", dtype='T')
    person.formulaColumn('first_label', select=dict(table='macro.line', columns="#TEMPLATE('${v}', $amount AS v)", where='$person_id=#THIS.id AND #IN_RANGE($amount,:low,:high)', order_by='$id', limit=1, sqlparams=dict(low=1, high=15)), dtype='T')
    line = pkg.table('line', pkey='id')
    line.column('id', dtype='L')
    line.column('person_id', dtype='L').relation('macro.person.id', relation_name='lines')
    line.column('amount', dtype='L')
    line.formulaColumn('label', sql_formula="#TEMPLATE('${v}!', $amount AS v)", dtype='T')
    return b
