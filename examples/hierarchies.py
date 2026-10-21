"""Independent Python hierarchy/counter model for full JSON and runtime parity."""
from copy import deepcopy

TABLES = ['tree', 'custom', 'plain_tree', 'ranked', 'master', 'linked', 'master_xtd', 'detail', 'generated_master', 'generated_tree']

def declare(pkg, classes=None):
    def table(name, **kwargs):
        return pkg.table(name, **kwargs, **({'x_table_class': classes['app.' + name]} if classes and 'app.' + name in classes else {}))
    tree = table('tree')
    tree.options().sys_fields()
    tree.options().hierarchical('code', root_id=True, virtual_roots=True)
    tree.options().auto_counter()
    tree.column('code'); tree.column('move_to', size='22')
    custom = table('custom', pkey='id')
    custom.column('id', size='22'); custom.column('code')
    custom.options().hierarchical(['code', 'position'], parent='owner_id', root_id=True)
    custom.options().auto_counter(field='position')
    plain = table('plain_tree', pkey='id')
    plain.column('id', size='22'); plain.column('code'); plain.options().hierarchical('code')
    ranked = table('ranked')
    ranked.options().sys_fields(); ranked.options().auto_counter(scope=['scope', 'group_id'])
    ranked.column('scope'); ranked.column('group_id', dtype='L'); ranked.column('value', dtype='L', default=5)
    master = table('master'); master.options().sys_fields(); master.column('code')
    linked = table('linked'); linked.options().sys_fields()
    linked.options().hierarchical('code', linked_to='app.master', root_id=True)
    linked.options().auto_counter(); linked.column('code')
    extension = table('master_xtd', pkey='id'); extension.column('id', size='22')
    extension.column('main_id', size='22').relation('app.master.id', deferred=True)
    detail = table('detail'); detail.options().sys_fields(); detail.options().relative_index('master_id')
    detail.column('master_id', size='22').relation('app.master.id', deferred=True)
    generated = table('generated_master', pkey='id')
    generated.column('id', dtype='I', sql_default='41'); generated.column('code', sql_default="'from database'")
    generated_tree = table('generated_tree', pkey='id'); generated_tree.column('id', size='22')
    generated_tree.column('code'); generated_tree.options().hierarchical('code', linked_to='app.generated_master')

def handlers(events):
    def before(self, values, old_record=None):
        if values.get('code') is not None:
            values['code'] = values['code'].upper()
        if values.get('move_to'):
            values['parent_id'] = values['move_to']
    def after(self, values, old_record=None):
        trigger = self.currentTrigger
        events.append(dict(table=self.fullname, event=trigger.event, record=deepcopy(values),
                           parent=f'{trigger.parent.table}:{trigger.parent.event}' if trigger.parent else None))
        if values.get('code') == 'FAIL':
            raise ValueError('hierarchy hook failure')
    return {'app.' + name: dict(**(dict(trigger_onInserting=before, trigger_onUpdating=before) if name in ('tree', 'master') else {}),
        trigger_onInserted=after, trigger_onUpdated=after, trigger_onDeleted=after) for name in TABLES}
