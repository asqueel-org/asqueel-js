export const exampleLabels = {
    queries: 'SQLite · inserts and queries', sqlite: 'SQLite · version 1',
    'sqlite-v2': 'SQLite · version 2 with email', groups: 'Column groups and formulas',
    'virtual-relations': 'VirtualRelation', application: 'Packages and application options',
    shop: 'Schemas and physical model',
};
export const queryLabels = {
    insert_person: '1 · Insert Ada', insert_quoted: '2 · Insert a name with an apostrophe',
    insert_memo: '3 · Insert a note by Ada', insert_null: '4 · Insert an empty note',
    insert_no_return: '5 · Insert a second note', people: 'Read people',
    active_people: 'Filter active people', related_notes: 'Read notes and the person name (JOIN)',
    collection: 'IN filter', empty_collection: 'Empty IN', not_in_empty: 'Empty NOT IN',
    binding_collision: 'Parameters with similar names', page: 'Page of results',
    offset_only: 'Offset only', zero_limit: 'Zero limit', null_filter: 'IS NULL filter',
    quoted_expression: 'String literal in the query', total: 'Sum of amounts',
    grouped: 'Sums per person · GROUP BY / HAVING', distinct: 'Distinct people',
    count: 'Count notes', count_grouped: 'Count groups', count_distinct: 'Count distinct values',
    missing_binding: 'Missing parameter · NULL', ilike: 'ILIKE filter',
    pkey_alias: 'Primary key and alias', field_parameter: 'Parameter referring to a field',
    insert_default: '6 · Insert a temporary person with SQL defaults',
    update_temporary: '7 · Update the temporary person', rename_key: '8 · Change the primary key',
    read_updated: '9 · Read the updated record', delete_temporary: '10 · Delete the temporary person',
};
