/** Model independent of the Python recipe; the application supplies Gramlot's parser. */
export function queryPeriods(root) {
    const pkg = root.db({name: 'periods', implementation: 'sqlite'}).packages().package({name: 'period', sqlschema: 'main', sqlprefix: true});
    const owner = pkg.table({name: 'owner', pkey: 'id'});
    owner.column({name: 'id', dtype: 'L'});
    owner.column({name: 'day', dtype: 'D'});
    owner.formulaColumn({name: 'within', sql_formula: '#IN_RANGE($id,:low,:high)', var_low: 0, var_high: 9});
    for (const [name, period] of [['today', 'oggi'], ['yesterday', 'ieri']])
        owner.formulaColumn({name, select: {table: 'period.event', columns: 'COUNT(*)', where: '$owner_id=#THIS.id AND #PERIOD($issued,period)', sqlparams: {period}}});
    owner.formulaColumn({name: 'inherited', var_period: 'mese scorso', select: {table: 'period.event', columns: 'COUNT(*)', where: '$owner_id=#THIS.id AND #PERIOD($issued,period)'}});
    owner.formulaColumn({name: 'environment', select: {table: 'period.event', columns: 'COUNT(*)', where: '$owner_id=#THIS.id AND #PERIOD($issued,env_period)'}});
    owner.formulaColumn({name: 'invalid_formula', sql_formula: '#PERIOD($day,period)'});
    const event = pkg.table({name: 'event', pkey: 'id'});
    event.column({name: 'id', dtype: 'L'});
    event.column({name: 'owner_id', dtype: 'L'}).relation({to: 'period.owner.id', relation_name: 'events'});
    event.column({name: 'issued', dtype: 'D'});
    event.formulaColumn({name: 'date_alias', sql_formula: '$issued', dtype: 'D'});
}
