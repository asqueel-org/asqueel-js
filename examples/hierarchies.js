/** Same declarations as hierarchies.py, authored through the JS builders. */
export const behaviorTables = ['tree', 'custom', 'plain_tree', 'ranked', 'master', 'linked', 'master_xtd', 'detail', 'generated_master', 'generated_tree'];
export function hierarchies(root) {
    const pkg = root.db({name: 'behaviors', implementation: 'sqlite'}).packages().package({name: 'app', sqlschema: 'main', sqlprefix: false});
    const tree = pkg.table('tree');
    tree.options().sys_fields();
    tree.options().hierarchical({columns: 'code', root_id: true, virtual_roots: true});
    tree.options().auto_counter();
    tree.column('code'); tree.column('move_to', {size: '22'});
    const custom = pkg.table('custom', {pkey: 'id'});
    custom.column('id', {size: '22'}); custom.column('code');
    custom.options().hierarchical({columns: ['code', 'position'], parent: 'owner_id', root_id: true});
    custom.options().auto_counter({field: 'position'});
    const plain = pkg.table('plain_tree', {pkey: 'id'});
    plain.column('id', {size: '22'}); plain.column('code'); plain.options().hierarchical('code');
    const ranked = pkg.table('ranked');
    ranked.options().sys_fields(); ranked.options().auto_counter({scope: ['scope', 'group_id']});
    ranked.column('scope'); ranked.column('group_id', {dtype: 'L'}); ranked.column('value', {dtype: 'L', default: 5});
    const master = pkg.table('master'); master.options().sys_fields(); master.column('code');
    const linked = pkg.table('linked'); linked.options().sys_fields();
    linked.options().hierarchical({columns: 'code', linked_to: 'app.master', root_id: true});
    linked.options().auto_counter(); linked.column('code');
    const extension = pkg.table('master_xtd', {pkey: 'id'});
    extension.column('id', {size: '22'});
    extension.column('main_id', {size: '22'}).relation('app.master.id', {deferred: true});
    const detail = pkg.table('detail'); detail.options().sys_fields(); detail.options().relative_index('master_id');
    detail.column('master_id', {size: '22'}).relation('app.master.id', {deferred: true});
    const generated = pkg.table('generated_master', {pkey: 'id'});
    generated.column('id', {dtype: 'I', sql_default: '41'}); generated.column('code', {sql_default: "'from database'"});
    const generatedTree = pkg.table('generated_tree', {pkey: 'id'}); generatedTree.column('id', {size: '22'});
    generatedTree.column('code'); generatedTree.options().hierarchical({columns: 'code', linked_to: 'app.generated_master'});
}
export function hierarchyHandlers(events) {
    function before(values) {
        if (values.code != null) values.code = values.code.toUpperCase();
        if (values.move_to) values.parent_id = values.move_to;
    }
    function after(values) {
        events.push({table: this.fullname, event: this.currentTrigger.event, record: structuredClone(values),
            parent: this.currentTrigger.parent ? `${this.currentTrigger.parent.table}:${this.currentTrigger.parent.event}` : null});
        if (values.code === 'FAIL') throw new Error('hierarchy hook failure');
    }
    return Object.fromEntries(behaviorTables.map(name => [`app.${name}`, {
        ...(name === 'tree' || name === 'master' ? {trigger_onInserting: before, trigger_onUpdating: before} : {}),
        trigger_onInserted: after, trigger_onUpdated: after, trigger_onDeleted: after,
    }]));
}
