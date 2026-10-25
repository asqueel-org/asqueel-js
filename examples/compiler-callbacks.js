/** Independent JS declarations and synchronous table methods for Python parity. */
export function compilerCallbacks(root) {
    const pkg = root.db({name: 'callbacks', implementation: 'sqlite'}).packages().package({name: 'app', sqlschema: 'main', sqlprefix: false});
    const owner = pkg.table({name: 'owner', pkey: 'id'});
    owner.column({name: 'id', dtype: 'L'});
    owner.column({name: 'code', dtype: 'T'});
    owner.column({name: 'amount', dtype: 'L'});
    for (const name of ['scaled', 'from_formula', 'invalid', 'cycle', 'missing', 'raises'])
        owner.formulaColumn({name, sql_formula: true});
    owner.formulaColumn({name: 'total', select: 'total'});
    owner.formulaColumn({name: 'present', exists: 'present'});
    owner.formulaColumn({name: 'named', sql_formula: '#a + #b + :factor', select_a: 'total', select_b: 'total', var_factor: 3});
    owner.formulaColumn({name: 'label', sql_formula: '#ENV(label)'});
    owner.formulaColumn({name: 'foreign_label', sql_formula: '#ENV(label,app.line)'});
    owner.formulaColumn({name: 'fallback_label', sql_formula: '#ENV(label,fallback)'});
    owner.formulaColumn({name: 'nested', select: {table: 'app.line', columns: 'MAX(@owner_id.total)', where: '$owner_id=#THIS.id'}});
    owner.aliasColumn({name: 'alias', relation_path: '$scaled'});
    owner.subQueryColumn({name: 'first', query: 'first'});
    for (const name of ['invalid', 'missing', 'cycle', 'raises', 'options', 'multi', 'where'])
        owner.formulaColumn({name: 'sub_' + name, select: name});
    const line = pkg.table({name: 'line', pkey: 'id'});
    line.column({name: 'id', dtype: 'L'});
    line.column({name: 'amount', dtype: 'L'});
    line.column({name: 'owner_id', dtype: 'L'}).relation({related_column: 'app.owner.id', relation_name: 'lines'});
    line.column({name: 'other_id', dtype: 'L'}).relation({related_column: 'app.owner.id', relation_name: 'others'});
}
export function compilerMethods(events = []) {
    const methods = {};
    for (const table of ['app.owner', 'app.line']) {
        const call = (self, name) => events.push(`${self.fullname}.${name}`);
        methods[table] = {
            sql_formula_scaled(attr) { call(this, 'scaled'); attr.var_factor = this.db.currentEnv.factor ?? 2; return '$amount * :factor'; },
            sql_formula_from_formula(attr) { call(this, 'from_formula'); attr.select_result = 'total'; attr.var_factor = 5; Object.assign(attr, this.db.currentEnv.attributes ?? {}); return '#result + :factor'; },
            sql_formula_invalid() { call(this, 'invalid'); return this.db.currentEnv.invalid ?? null; },
            sql_formula_cycle() { call(this, 'cycle'); return '$cycle'; },
            sql_formula_raises() { throw new TypeError('method application error'); },
            env_label() { call(this, 'env_label'); return this.fullname === 'app.owner' ? "'owner SQL'" : "'line SQL'"; },
            subquery_total() { call(this, 'total'); return {table: 'app.line', columns: 'SUM($amount * :factor)', where: '$owner_id=#THIS.id', sqlparams: {factor: this.db.currentEnv.factor ?? (this.fullname === 'app.owner' ? 7 : 11)}}; },
            subquery_present() { call(this, 'present'); return {table: 'app.line', columns: '$id', where: '$owner_id=#THIS.id'}; },
            subquery_first() { call(this, 'first'); return {table: 'app.line', columns: '$amount', where: '$owner_id=#THIS.id', order_by: '$id', limit: 1}; },
            subquery_invalid() { return this.db.currentEnv.invalid ?? null; },
            subquery_cycle() { return {table: 'app.owner', columns: '$sub_cycle', where: '$id=#THIS.id'}; },
            subquery_raises() { throw new TypeError('method application error'); },
            subquery_options() { return {table: 'app.line', columns: '$amount', where: '$owner_id=#THIS.id', invalid: true}; },
            subquery_multi() { return {table: 'app.line', columns: '$id,$amount', where: '$owner_id=#THIS.id'}; },
            subquery_where() { return {table: 'app.line', columns: '$amount'}; },
            formulaColumn_a() {
                call(this, 'dynamic_a');
                return [{name: this.db.currentEnv.dynamic_name ?? 'twice', sql_formula: '$amount * 2'},
                    {name: 'DynamicScale', sql_formula: '$amount * ' + (this.db.currentEnv.factor ?? 2)}];
            },
            formulaColumn_b() { call(this, 'dynamic_b'); return {name: 'dynamic_method', sql_formula: true}; },
            sql_formula_dynamic_method(attr) { call(this, 'dynamic_method'); attr.var_offset = 4; return '$amount + :offset'; },
        };
    }
    return methods;
}

/** Exercise the same cache lifecycle as the independent Python oracle. */
export function callbackCacheProbe(model) {
    const environment = {factor: 3}, events = [], cases = [];
    const query = model.queries(null, {environment, methods: compilerMethods(events)});
    const request = {operation: 'select', table: 'app.owner', columns: '$dynamicscale,$scaled,$dynamic_method'};
    for (const factor of [3, 5, 7]) {
        events.length = 0;
        environment.factor = factor;
        const compiled = query.compile(factor === 7 ? {...request, environment: {factor}} : request);
        cases.push({compiled, events: [...events]});
    }
    return cases;
}
