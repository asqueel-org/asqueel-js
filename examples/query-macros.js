/** Independent JavaScript recipe for #TEMPLATE and #IN_RANGE parity. */
export function queryMacros(root) {
    const pkg = root.db({name: 'macros', implementation: 'sqlite'}).packages().package({name: 'macro', sqlschema: 'main', sqlprefix: true});
    const city = pkg.table({name: 'city', pkey: 'id'});
    city.column({name: 'id', dtype: 'L'});
    city.column({name: 'name', dtype: 'T'});
    const person = pkg.table({name: 'person', pkey: 'id'});
    for (const name of ['id', 'city_id', 'amount', 'low_bound', 'high_bound']) person.column({name, dtype: 'L'});
    person.column({name: 'name', dtype: 'T'});
    person.column({name: 'surname', dtype: 'T'});
    person.column({name: 'city_id'}).relation({related_column: 'macro.city.id'});
    person.formulaColumn({name: 'label', sql_formula: "#TEMPLATE('${n} - ${s} (${c})', $name AS n, $surname AS s, @city_id.name AS c)", dtype: 'T'});
    person.formulaColumn({name: 'priced', sql_formula: "#TEMPLATE('${n}: ${v}', $label AS n, $amount * :factor AS v)", var_factor: 2, dtype: 'T'});
    person.formulaColumn({name: 'within', sql_formula: '#IN_RANGE($amount,:low,:high)', var_low: 10, var_high: 20, dtype: 'B'});
    person.formulaColumn({name: 'within_fields', sql_formula: '#IN_RANGE($amount,$low_bound,$high_bound)', dtype: 'B'});
    person.formulaColumn({name: 'range_label', sql_formula: "#TEMPLATE('within=${v}', $within AS v)", dtype: 'T'});
    person.formulaColumn({name: 'caption', sql_formula: "#TEMPLATE('${p}${n}', #ENV(prefix) AS p, #THIS.name AS n)", dtype: 'T'});
    person.formulaColumn({name: 'first_label', select: {table: 'macro.line', columns: "#TEMPLATE('${v}', $amount AS v)", where: '$person_id=#THIS.id AND #IN_RANGE($amount,:low,:high)', order_by: '$id', limit: 1, sqlparams: {low: 1, high: 15}}, dtype: 'T'});
    const line = pkg.table({name: 'line', pkey: 'id'});
    line.column({name: 'id', dtype: 'L'});
    line.column({name: 'person_id', dtype: 'L'}).relation({related_column: 'macro.person.id', relation_name: 'lines'});
    line.column({name: 'amount', dtype: 'L'});
    line.formulaColumn({name: 'label', sql_formula: "#TEMPLATE('${v}!', $amount AS v)", dtype: 'T'});
}
