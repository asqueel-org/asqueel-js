"""Independent Python declarations and SqlTable hooks for application onUpdate."""
from copy import deepcopy
TABLES = ['parent', 'child', 'leaf', 'sibling', 'restricted', 'ignored', 'native_child', 'id_child', 'partitioned', 'self_node']

def declare(pkg):
    def table(name, **kwargs):
        return pkg.table(name, pkey='id', **kwargs)
    parent = table('parent')
    parent.column('id'); parent.column('code', unique=True); parent.column('other', unique=True); parent.column('label')
    for name in TABLES[1:]:
        t = table(name, **(dict(draftField='draft', logicalDeletionField='deleted') if name == 'child' else {}),
                  **(dict(partition_company='company') if name == 'partitioned' else {}))
        t.column('id')
        if name == 'self_node':
            t.column('code', unique=True)
            t.column('parent_code').relation('app.self_node.code', onUpdate='cascade', onUpdate_sql='no action', deferred=True)
        else:
            target = 'app.child.code' if name == 'leaf' else 'app.parent.other' if name == 'sibling' else 'app.parent.id' if name == 'id_child' else 'app.parent.code'
            t.column('code', unique=name == 'child', onUpdating='codeBefore', onUpdated='codeAfter').relation(target,
                onUpdate='raise' if name == 'restricted' else 'ignore' if name == 'ignored' else 'cascade',
                **(dict(foreign_key=False) if name == 'ignored' else dict(deferred=True, **({} if name == 'native_child' else dict(onUpdate_sql='no action')))))
        t.column('label')
        if name == 'child':
            t.column('draft', dtype='B'); t.column('deleted')
        if name == 'partitioned':
            t.column('company')

def handlers(events):
    def event(self, label, values, old_record=None, fldname=None, **kwargs):
        parent = self.currentTrigger.parent
        events.append(dict(table=self.fullname, event=label, record=deepcopy(values), old=deepcopy(old_record),
                           field=fldname, parent=f'{parent.table}:{parent.event}' if parent else None))
    def log(label):
        def callback(self, values, **kwargs):
            event(self, label, values, **kwargs)
        return callback
    def before(self, values, old_record=None):
        event(self, 'before', values, old_record=old_record)
        if values.get('label') == 'change_in_hook':
            values['code'] = 'hook'
        if values.get('label') == 'mutate_old':
            old_record['code'] = 'changed_old'
    def after(self, values, old_record=None):
        event(self, 'after', values, old_record=old_record)
        if values.get('label') == 'fail':
            raise ValueError('cascade hook failure')
    return {'app.' + name: dict(trigger_codeBefore=log('field_before'), trigger_codeAfter=log('field_after'),
        protect_update=log('protect_update'), trigger_onUpdating=before, trigger_onUpdated=after) for name in TABLES}
