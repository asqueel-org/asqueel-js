/** Independent JS counterpart of update_cascades.py. */
export const cascadeTables = ['parent', 'child', 'leaf', 'sibling', 'restricted', 'ignored', 'native_child', 'id_child', 'partitioned', 'self_node'];
export function updateCascades(root) {
    const pkg = root.db({name: 'cascades', implementation: 'sqlite'}).packages().package({name: 'app', sqlschema: 'main', sqlprefix: false});
    const parent = pkg.table('parent', {pkey: 'id'});
    parent.column('id'); parent.column('code', {unique: true}); parent.column('other', {unique: true}); parent.column('label');
    for (const name of cascadeTables.slice(1)) {
        const table = pkg.table(name, {pkey: 'id', ...(name === 'child' ? {draftField: 'draft', logicalDeletionField: 'deleted'} : {}),
            ...(name === 'partitioned' ? {partition_company: 'company'} : {})});
        table.column('id');
        if (name === 'self_node') {
            table.column('code', {unique: true});
            table.column('parent_code').relation('app.self_node.code', {onUpdate: 'cascade', onUpdate_sql: 'no action', deferred: true});
        } else {
            const target = name === 'leaf' ? 'app.child.code' : name === 'sibling' ? 'app.parent.other' : name === 'id_child' ? 'app.parent.id' : 'app.parent.code';
            const attrs = {onUpdate: name === 'restricted' ? 'raise' : name === 'ignored' ? 'ignore' : 'cascade',
                ...(name === 'ignored' ? {foreign_key: false} : {deferred: true, ...(name === 'native_child' ? {} : {onUpdate_sql: 'no action'})})};
            table.column('code', {unique: name === 'child', onUpdating: 'codeBefore', onUpdated: 'codeAfter'}).relation(target, attrs);
        }
        table.column('label');
        if (name === 'child') { table.column('draft', {dtype: 'B'}); table.column('deleted'); }
        if (name === 'partitioned') table.column('company');
    }
}
export function cascadeHandlers(events) {
    function event(label, values, kwargs = {}) {
        events.push({table: this.fullname, event: label, record: structuredClone(values), old: structuredClone(kwargs.old_record ?? null),
            field: kwargs.fldname ?? null, parent: this.currentTrigger.parent ? `${this.currentTrigger.parent.table}:${this.currentTrigger.parent.event}` : null});
    }
    const log = label => function(values, kwargs) { event.call(this, label, values, kwargs); };
    return Object.fromEntries(cascadeTables.map(name => [`app.${name}`, {
        trigger_codeBefore: log('field_before'), trigger_codeAfter: log('field_after'),
        protect_update: log('protect_update'),
        trigger_onUpdating(values, kwargs) {
            event.call(this, 'before', values, kwargs);
            if (values.label === 'change_in_hook') values.code = 'hook';
            if (values.label === 'mutate_old') kwargs.old_record.code = 'changed_old';
        },
        trigger_onUpdated(values, kwargs) {
            event.call(this, 'after', values, kwargs);
            if (values.label === 'fail') throw new Error('cascade hook failure');
        },
    }]));
}
