/** Portable declarations and runtime callbacks are separate, as model and SqlTable in Python. */
export function applicationHooks(root) {
    const pkg = root.db({name: 'hooks', implementation: 'sqlite'}).packages().package({name: 'app', sqlschema: 'main', sqlprefix: false});
    const note = pkg.table({name: 'note'});
    note.options().sys_fields({syscode: true, draft: true});
    note.column({name: 'title', dtype: 'T', notnull: true, onInserting: 'titleBefore', onUpdating: 'titleBefore',
        onDeleting: 'titleBefore', onInserted: 'titleAfter', onUpdated: 'titleAfter', onDeleted: 'titleAfter'});
    note.column({name: 'status', dtype: 'T', default: 'new', unmodifiable: true});
    const audit = pkg.table({name: 'audit', pkey: 'id'});
    audit.column({name: 'id', dtype: 'I'});
    audit.column({name: 'event', dtype: 'T'});
    audit.column({name: 'note_id', dtype: 'A', size: '22'});
    const plain = pkg.table({name: 'plain', pkey: 'id'});
    plain.column({name: 'id', dtype: 'I'});
    plain.column({name: 'title', dtype: 'T', onInserting: 'crossTitle', trigger_table: 'app.audit'});
    const simple = pkg.table({name: 'simple'});
    simple.options().sys_fields();
    simple.column({name: 'title', dtype: 'T'});
    const unsupported = pkg.table({name: 'unsupported'});
    unsupported.options().sys_fields();
    unsupported.options().record_hash();
    unsupported.column({name: 'title', dtype: 'T'});
}

/** Test/demo hooks use exactly the same event body and mutations as application_hooks.py. */
export function applicationHookHandlers(events) {
    function event(label, values, kwargs = {}) {
        const trigger = this.currentTrigger;
        events.push({event: label, table: this.fullname, record: structuredClone(values),
            old: structuredClone(kwargs.old_record ?? null), field: kwargs.fldname ?? null,
            source: kwargs.tblname ?? null, parent: trigger?.parent ? `${trigger.parent.table}:${trigger.parent.event}` : null});
    }
    function log(label) { return function(values, kwargs) { event.call(this, label, values, kwargs); }; }
    async function audit(label, values) {
        await this.db.table('app.audit').insert({event: label, note_id: values.id ?? null});
    }
    const note = {
        protect_validate(values, kwargs) {
            event.call(this, 'validate', values, kwargs);
            if (values.title === 'invalid') throw new Error('validation failure');
        },
        protect_update: log('protect_update'), protect_delete: log('protect_delete'),
        trigger_titleBefore(values, kwargs) {
            event.call(this, 'field_before', values, kwargs);
            if (typeof values.title === 'string') values.title = values.title.trim();
        },
        trigger_titleAfter: log('field_after'),
        trigger_onInserting: log('inserting'),
        trigger_assignCounters: log('counters'), trigger_releaseCounters: log('release'),
        protect_draft(values) { event.call(this, 'draft', values); return values.title === 'draft'; },
        async trigger_onInserted(values) {
            event.call(this, 'inserted', values); await audit.call(this, 'inserted', values);
            if (values.title === 'fail_insert') throw new Error('post hook failure');
        },
        trigger_onUpdating(values, kwargs) {
            event.call(this, 'updating', values, kwargs);
            if (values.title === 'mutate_old' && kwargs.old_record) kwargs.old_record.id = 'damaged';
            if (values.title === 'change_key') values.id = 'changed';
        },
        async trigger_onUpdated(values, kwargs) {
            event.call(this, 'updated', values, kwargs); await audit.call(this, 'updated', values);
            if (values.title === 'fail_update') throw new Error('post hook failure');
        },
        trigger_onDeleting(values) {
            event.call(this, 'deleting', values); values.id = 'hook_changed_key';
        },
        async trigger_onDeleted(values) {
            event.call(this, 'deleted', values); await audit.call(this, 'deleted', values);
            if (values.title === 'fail_delete') throw new Error('post hook failure');
        },
    };
    return {
        'app.note': note,
        'app.audit': {
            trigger_onInserted: log('audit_inserted'),
            trigger_crossTitle(values, kwargs) { event.call(this, 'cross_field', values, kwargs); values.title = values.title.toUpperCase(); },
        },
    };
}
