/** Independent JS declaration: correlated reads, reverse and virtual aggregates. */
export function subqueries(root) {
    const pkg = root.db({name: 'subqueries', implementation: 'sqlite'}).packages().package({name: 'sq'});
    const customer = pkg.table({name: 'customer', pkey: 'id', order_by: '$id'});
    customer.column({name: 'id', dtype: 'L'});
    customer.column({name: 'name', dtype: 'T'});
    customer.formulaColumn({name: 'threshold', dtype: 'R', sql_formula: '$id * :factor', var_factor: 15});
    customer.formulaColumn({name: 'total', dtype: 'R', select: {table: 'sq.invoice', columns: 'SUM($amount)', where: '$customer_id=#THIS.id'}});
    customer.formulaColumn({name: 'has_big', dtype: 'B', exists: {table: 'sq.invoice', where: '$customer_id=#THIS.id AND $amount>:minimum'}, var_minimum: 25});
    customer.formulaColumn({name: 'big_total', dtype: 'B', sql_formula: '#found AND #sum > :limit', var_limit: 40,
        exists_found: {table: 'sq.invoice', where: '$customer_id=#THIS.id AND $amount>25'},
        select_sum: {table: 'sq.invoice', columns: 'SUM($amount)', where: '$customer_id=#THIS.id'}});
    customer.formulaColumn({name: 'local_total', dtype: 'R', var_minimum: 10, select: {table: 'sq.invoice', columns: 'SUM($adjusted)', where: '$customer_id=#THIS.id AND $amount>:minimum', sqlparams: {minimum: 15}}});
    customer.formulaColumn({name: 'visible_total', dtype: 'R', select: {table: 'sq.invoice', columns: 'SUM($amount)', where: '$customer_id=#THIS.id', excludeDraft: true, excludeLogicalDeleted: true, ignorePartition: false}});
    customer.formulaColumn({name: 'first_code', dtype: 'T', select: {table: 'sq.invoice', columns: '$code', where: '$customer_id=#THIS.id', order_by: '$id DESC', limit: 1, offset: 1, cast: 'TEXT'}});
    customer.formulaColumn({name: 'nested_total', dtype: 'R', select: {table: 'sq.invoice', columns: 'SUM($tax_rate)', where: '$customer_id=#THIS.id'}});
    customer.formulaColumn({name: 'twice_total', dtype: 'R', sql_formula: '$total * 2'});
    customer.formulaColumn({name: 'above_threshold', dtype: 'R', select: {table: 'sq.invoice', columns: 'SUM($amount)', where: '$customer_id=#THIS.id AND $amount>#THIS.threshold'}});
    customer.formulaColumn({name: 'env_total', dtype: 'R', select: {table: 'sq.invoice', columns: 'SUM($amount)', where: '$customer_id=#THIS.id AND $amount>:env_minimum'}});
    customer.formulaColumn({name: 'field_parameter', dtype: 'R', select: {table: 'sq.invoice', columns: 'SUM($amount)', where: '$customer_id=#THIS.id AND $amount>:threshold', sqlparams: {threshold: '$qty'}}});
    customer.formulaColumn({name: 'multi_scalar', select: {table: 'sq.invoice', columns: '$id,$amount', where: '$customer_id=#THIS.id'}});
    customer.formulaColumn({name: 'cast_exists', exists: {table: 'sq.invoice', where: '$customer_id=#THIS.id', cast: 'TEXT'}});
    customer.formulaColumn({name: 'conflicting_options', select: {table: 'sq.invoice', columns: '$id', where: '$customer_id=#THIS.id', excludeDraft: true, exclude_draft: false}});
    customer.formulaColumn({name: 'unknown_option', select: {table: 'sq.invoice', columns: '$id', where: '$customer_id=#THIS.id', arbitrary: true}});
    customer.formulaColumn({name: 'recursive', select: {table: 'sq.customer', columns: '$recursive', where: '$id=#THIS.id'}});
    customer.subQueryColumn({name: 'legacy_json', query: {table: 'sq.invoice', columns: '$id', where: '$customer_id=#THIS.id'}, mode: 'json'});
    customer.subQueryColumn({name: 'method_query', query: 'unregistered'});
    const source = {table: 'sq.invoice', where: '$customer_id=#THIS.id'};
    customer.subQueryColumn({name: 'sub_count', dtype: 'L', query: source, aggr: 'count()'});
    customer.subQueryColumn({name: 'sub_codes', dtype: 'T', query: {...source, order_by: '$id DESC'}, aggr: "join($code, ',', '-')"});
    customer.subQueryColumn({name: 'sub_json', dtype: 'T', query: {...source, order_by: '$id'}, aggr: 'to_json($id,$amount)'});
    customer.subQueryColumn({name: 'scalar_max', dtype: 'R', query: {...source, columns: 'MAX($amount)'}});
    customer.virtualRelation({name: 'large', relation: '@invoices', condition: '$amount>:var_limit', var_limit: '$threshold'});
    customer.virtualRelation({name: 'window', relation: '@large', condition: '$amount<:var_limit', var_limit: '$id * 35'});
    customer.virtualRelation({name: 'direct', table: 'sq.invoice', condition: '$customer_id=:var_customer AND $qty>:var_min', var_customer: '$id', var_min: '$id - 1'});
    customer.virtualRelation({name: 'asking', relation: '@invoices', ask: {fields: [{name: 'minimum', dtype: 'R'}]}});
    customer.virtualRelation({name: 'cycle_a', relation: '@cycle_b'});
    customer.virtualRelation({name: 'cycle_b', relation: '@cycle_a'});
    const vat = pkg.table({name: 'vat', pkey: 'id'});
    vat.column({name: 'id', dtype: 'L'}); vat.column({name: 'rate', dtype: 'R'});
    const invoice = pkg.table({name: 'invoice', pkey: 'id', order_by: '$id', draftField: 'draft', logicalDeletionField: 'deleted', partition_region: 'region'});
    invoice.column({name: 'id', dtype: 'L'});
    invoice.column({name: 'customer_id', dtype: 'L'}).relation({to: 'customer.id', relation_name: 'invoices'});
    invoice.column({name: 'vat_id', dtype: 'L'}).relation({to: 'vat.id'});
    invoice.column({name: 'amount', dtype: 'R', sqlname: 'stored_amount'});
    invoice.column({name: 'qty', dtype: 'L'}); invoice.column({name: 'code', dtype: 'T'});
    invoice.column({name: 'draft', dtype: 'B'}); invoice.column({name: 'deleted', dtype: 'T'}); invoice.column({name: 'region', dtype: 'T'});
    invoice.formulaColumn({name: 'adjusted', dtype: 'R', sql_formula: '$amount + :offset', var_offset: 5});
    invoice.formulaColumn({name: 'tax_rate', dtype: 'R', select: {table: 'sq.vat', columns: '$rate', where: '$id=#THIS.vat_id'}});
    const pair = pkg.table({name: 'pair', pkey: 'key'});
    pair.column({name: 'code', dtype: 'T'}); pair.column({name: 'seq', dtype: 'L'}); pair.compositeColumn({name: 'key', columns: 'code,seq'});
    const member = pkg.table({name: 'member', pkey: 'id'});
    member.column({name: 'id', dtype: 'L'}); member.column({name: 'code', dtype: 'T'}); member.column({name: 'seq', dtype: 'L'}); member.column({name: 'amount', dtype: 'R'});
    member.compositeColumn({name: 'pair_key', columns: 'code,seq'}).relation({to: 'pair.key', relation_name: 'members'});
}
