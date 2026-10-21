"""Independent Python declaration and SqlTable callbacks for runtime parity."""
from copy import deepcopy


def declare(pkg, classes=None):
    classes = classes or {}
    note = pkg.table('note', **({'x_table_class': classes['app.note']} if 'app.note' in classes else {}))
    note.options().sys_fields(syscode=True, draft=True)
    note.column('title', dtype='T', notnull=True, onInserting='titleBefore', onUpdating='titleBefore',
                onDeleting='titleBefore', onInserted='titleAfter', onUpdated='titleAfter', onDeleted='titleAfter')
    note.column('status', dtype='T', default='new', unmodifiable=True)
    audit = pkg.table('audit', pkey='id', **({'x_table_class': classes['app.audit']} if 'app.audit' in classes else {}))
    audit.column('id', dtype='I')
    audit.column('event', dtype='T')
    audit.column('note_id', dtype='A', size='22')
    plain = pkg.table('plain', pkey='id')
    plain.column('id', dtype='I')
    plain.column('title', dtype='T', onInserting='crossTitle', trigger_table='app.audit')
    simple = pkg.table('simple')
    simple.options().sys_fields()
    simple.column('title', dtype='T')
    unsupported = pkg.table('unsupported')
    unsupported.options().sys_fields()
    unsupported.options().record_hash()
    unsupported.column('title', dtype='T')


def handlers(events):
    def event(self, label, values, old_record=None, fldname=None, tblname=None, **kwargs):
        trigger = self.currentTrigger
        events.append(dict(event=label, table=self.fullname, record=deepcopy(values), old=deepcopy(old_record),
                           field=fldname, source=tblname,
                           parent=f'{trigger.parent.table}:{trigger.parent.event}' if trigger and trigger.parent else None))

    def log(label):
        def callback(self, values=None, record=None, **kwargs):
            event(self, label, values if values is not None else record, **kwargs)
        return callback

    def audit(self, label, values):
        self.db.table('app.audit').insert(dict(event=label, note_id=values.get('id')))

    def validate(self, values, **kwargs):
        event(self, 'validate', values, **kwargs)
        if values.get('title') == 'invalid':
            raise ValueError('validation failure')

    def before(self, values, **kwargs):
        event(self, 'field_before', values, **kwargs)
        if isinstance(values.get('title'), str):
            values['title'] = values['title'].strip()

    def draft(self, values):
        event(self, 'draft', values)
        return values.get('title') == 'draft'

    def inserted(self, values):
        event(self, 'inserted', values)
        audit(self, 'inserted', values)
        if values.get('title') == 'fail_insert':
            raise ValueError('post hook failure')

    def updating(self, values, old_record=None):
        event(self, 'updating', values, old_record=old_record)
        if values.get('title') == 'mutate_old' and old_record:
            old_record['id'] = 'damaged'
        if values.get('title') == 'change_key':
            values['id'] = 'changed'

    def updated(self, values, old_record=None):
        event(self, 'updated', values, old_record=old_record)
        audit(self, 'updated', values)
        if values.get('title') == 'fail_update':
            raise ValueError('post hook failure')

    def deleting(self, values):
        event(self, 'deleting', values)
        values['id'] = 'hook_changed_key'

    def deleted(self, values):
        event(self, 'deleted', values)
        audit(self, 'deleted', values)
        if values.get('title') == 'fail_delete':
            raise ValueError('post hook failure')

    def cross(self, values, **kwargs):
        event(self, 'cross_field', values, **kwargs)
        values['title'] = values['title'].upper()

    return {'app.note': dict(protect_validate=validate, protect_update=log('protect_update'),
        protect_delete=log('protect_delete'), trigger_titleBefore=before, trigger_titleAfter=log('field_after'),
        trigger_onInserting=log('inserting'), trigger_assignCounters=log('counters'), trigger_releaseCounters=log('release'),
        protect_draft=draft, trigger_onInserted=inserted, trigger_onUpdating=updating, trigger_onUpdated=updated,
        trigger_onDeleting=deleting, trigger_onDeleted=deleted),
        'app.audit': dict(trigger_onInserted=log('audit_inserted'), trigger_crossTitle=cross)}
