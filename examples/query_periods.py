"""Independent Python recipe for PERIOD and scoped bindings."""
from asqueel import SqlBuilder


def period_model():
    b = SqlBuilder()
    pkg = b.source.db('periods', implementation='sqlite').packages().package('period', sqlschema='main', sqlprefix=True)
    owner = pkg.table('owner', pkey='id')
    owner.column('id', dtype='L')
    owner.column('day', dtype='D')
    owner.formulaColumn('within', sql_formula='#IN_RANGE($id,:low,:high)', var_low=0, var_high=9)
    for name, period in [('today', 'oggi'), ('yesterday', 'ieri')]:
        owner.formulaColumn(name, select=dict(table='period.event', columns='COUNT(*)', where='$owner_id=#THIS.id AND #PERIOD($issued,period)', sqlparams=dict(period=period)))
    owner.formulaColumn('inherited', var_period='mese scorso', select=dict(table='period.event', columns='COUNT(*)', where='$owner_id=#THIS.id AND #PERIOD($issued,period)'))
    owner.formulaColumn('environment', select=dict(table='period.event', columns='COUNT(*)', where='$owner_id=#THIS.id AND #PERIOD($issued,env_period)'))
    owner.formulaColumn('invalid_formula', sql_formula='#PERIOD($day,period)')
    event = pkg.table('event', pkey='id')
    event.column('id', dtype='L')
    event.column('owner_id', dtype='L').relation('period.owner.id', relation_name='events')
    event.column('issued', dtype='D')
    event.formulaColumn('date_alias', sql_formula='$issued', dtype='D')
    return b
