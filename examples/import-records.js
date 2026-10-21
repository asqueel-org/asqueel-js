export function importRecordsModel(root) {
    const pkg = root.db({name: 'imports', implementation: 'sqlite'}).packages().package({name: 'app', sqlschema: 'main', sqlprefix: false});
    for (const [name, dtype] of [['item', 'L'], ['automatic', 'I'], ['upper', 'L']]) {
        const table = pkg.table({name, pkey: 'id'});
        table.column({name: 'id', dtype, ...(name === 'automatic' ? {sql_default: 'NULL'} : {})});
        table.column({name: 'name', dtype: 'T', onInserting: 'unexpected'});
        table.column({name: 'price', dtype: 'N', size: '10,2'});
        table.column({name: 'stock', dtype: 'L'});
        table.column({name: 'active', dtype: 'B'});
        table.column({name: 'since', dtype: 'D'});
        table.column({name: 'moment', dtype: 'DHZ'});
        table.column({name: 'time', dtype: 'H'});
        table.column({name: 'note', dtype: 'T', default: 'application-only', sql_default: "'database'"});
        table.formulaColumn({name: 'label', sql_formula: '$name'});
    }
}
export function importHandlers(events) {
    const handlers = {};
    for (const name of ['item', 'automatic', 'upper']) handlers['app.' + name] = {
        trigger_onInserting() {events.push('unexpected table trigger');},
        trigger_unexpected() {events.push('unexpected field trigger');},
    };
    handlers['app.upper'].adaptRecord = function (values) {
        values = this.adaptRecord(values); values.name = values.name.toUpperCase(); return values;
    };
    return handlers;
}
