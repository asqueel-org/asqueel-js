"""Independent Python scenarios for virtual relation source/model/migration parity."""


def definitions(call, base, skeleton, table, package):
    customer = package + '.tables.customer'

    def linked():
        return base() + [call(package, 'table', name='customer', pkey='id'),
                         call(customer, 'column', name='id', dtype='I'),
                         call(customer, 'column', name='name', dtype='T', size=':60', name_long='Customer name'),
                         call(table, 'column', name='customer_id', dtype='I'),
                         call(table + '.columns.customer_id', 'relation', to='app.customer.id', inverse='items')]

    def vr(name, **kwargs):
        return call(table, 'virtualRelation', name=name, **kwargs)

    def inline(name, extra, **kwargs):
        return dict(name='virtual_relation_' + name, mode='inline', layers=[linked() + extra],
                    inspectModel=True, inspectRelations=True, **kwargs)

    cases = [
        inline('conditional', [vr('selected', table='app.customer', condition='$id=:var_customer',
                                var_customer='$customer_id', name_long='Selected customer', name_short='SC',
                                comment='Model only', x_ui_color='green',
                                ask={'title': 'Filter', 'fields': [{'name': 'year', 'dtype': 'I'}]})]),
        inline('forward', [vr('selected', relation='@customer_id')]),
        inline('inverse_and_nested', [
            call(customer, 'virtualRelation', name='selected_items', relation='@items',
                 condition='$id>:var_min AND $name=:ask_name', var_min='$id',
                 ask={'title': 'Name', 'fields': [{'name': 'name', 'dtype': 'T'}]}),
            call(customer, 'virtualRelation', name='nested', relation='@selected_items'),
            vr('owner_again', relation='@customer_id.@nested.@customer_id')]),
        inline('forward_virtual_reference', [vr('first', relation='@second'),
                                            vr('second', relation='@customer_id')]),
        inline('self_target', [vr('same_table', table='app.item', condition='$id=:var_id', var_id='$id')]),
        inline('cross_package', [call('db.packages', 'package', name='crm', sqlschema='main', sqlprefix='registry'),
                                 call('db.packages.crm', 'table', name='contact', pkey='id'),
                                 call('db.packages.crm.tables.contact', 'column', name='id', dtype='I'),
                                 vr('contact', table='crm.contact', condition='$id=:var_id', var_id='$customer_id')]),
        inline('remapped_sql_names', [call(package, 'table', contribution='custom', name='customer', sqlname='clients'),
                                     call(customer, 'column', contribution='custom', name='id', sqlname='customer_key'),
                                     call(package, 'table', contribution='custom', name='item', sqlname='items'),
                                     vr('selected', relation='@customer_id'),
                                     call(table, 'aliasColumn', name='selected_id', relation_path='@selected.id')]),
        inline('path_without_at', [vr('selected', relation='customer_id')]),
        inline('same_contribution_conflict', [vr('selected', relation='@customer_id', var_id='$id'),
                                             vr('selected', name_long='Customer'),
                                             vr('selected', var_id='$id+1', reject=True)]),
        inline('later_override_and_ask_replacement', [
            vr('selected', relation='@customer_id', var_id='$id', ask={'title': 'Before', 'fields': []}),
            vr('selected', ask={'extra': True}, reject=True),
            vr('selected', contribution='app', var_id='$id+1', ask={'title': 'After'})]),
        inline('switch_path_to_condition', [vr('selected', relation='@customer_id'),
                                            vr('selected', contribution='app', relation=None,
                                               table='app.customer', condition='$id=:var_id', var_id='$customer_id')]),
        inline('alias_target_and_metadata', [vr('selected', relation='@customer_id'),
                                             call(table, 'aliasColumn', name='selected_name', relation_path='@selected.name'),
                                             call(table, 'aliasColumn', name='local_alias', relation_path='$selected_name')]),
        inline('alias_override_dtype', [vr('selected', relation='@customer_id'),
                                       call(table, 'aliasColumn', name='selected_name', relation_path='@selected.name',
                                            dtype='A', name_long='Own label')]),
        inline('alias_missing_field', [vr('selected', relation='@customer_id'),
                                      call(table, 'aliasColumn', name='selected_name', relation_path='@selected.missing')],
               rejectResolution=True),
        inline('alias_cycle', [vr('self', table='app.item', condition='1=1'),
                              call(table, 'aliasColumn', name='cycle', relation_path='@self.cycle')], rejectResolution=True),
        inline('neither_target', [vr('missing')], rejectResolution=True),
        inline('both_targets', [vr('bad', relation='@customer_id', table='app.customer', condition='1=1')], rejectResolution=True),
        inline('condition_required', [vr('bad', table='app.customer')], rejectResolution=True),
        inline('unknown_table', [vr('bad', table='app.missing', condition='1=1')], rejectResolution=True),
        inline('unqualified_table', [vr('bad', table='customer', condition='1=1')], rejectResolution=True),
        inline('unknown_path', [vr('bad', relation='@missing')], rejectResolution=True),
        inline('unknown_path_segment', [vr('bad', relation='@customer_id.@missing')], rejectResolution=True),
        inline('cycle', [vr('one', relation='@two'), vr('two', relation='@one')], rejectResolution=True),
        inline('forward_name_collision', [vr('customer_id', table='app.customer', condition='1=1')], rejectResolution=True),
        inline('inverse_name_collision', [call(customer, 'virtualRelation', name='items', table='app.item', condition='1=1')],
               rejectResolution=True),
        inline('invalid_attributes', [vr('bad', relation='@customer_id', reject=True, **{key: value})
               for key, value in [('inverse', 'back'), ('source_parameters', {'a': '$id'}),
                                  ('parameters', {'a': 1}), ('reverse_name', 'back'), ('var_', '$id'),
                                  ('var_1bad', '$id'), ('var_bad-name', '$id'), ('var_bad\n', '$id'), ('unapproved', True),
                                  ('limit', 1), ('limit', None), ('order_by', '$id DESC'), ('order_by', None),
                                  ('one_one', True), ('one_one', False), ('ask', []), ('table', 123)]]),
        inline('named_forward', [call(table, 'column', name='other_id', dtype='I'),
                                 call(table + '.columns.other_id', 'relation', to='app.customer.id', name='other'),
                                 vr('selected', relation='@other')]),
        inline('weak_forward', [call(table, 'column', name='weak_id', dtype='I'),
                                call(table + '.columns.weak_id', 'weak_relation', to='app.customer.id', inverse='weak_items'),
                                vr('selected', relation='@weak_id'),
                                call(customer, 'virtualRelation', name='selected_weak_items', relation='@weak_items')]),
        inline('composite_forward', [call(table, 'column', name='composite_id', dtype='I'),
                                     call(table, 'compositeColumn', name='customer_key', columns='composite_id'),
                                     call(table + '.composites.customer_key', 'relation', to='app.customer.id'),
                                     vr('selected', relation='@customer_key')]),
    ]
    overlay = skeleton() + [vr('selected', var_id='$id+1', name_long='Customized')]
    cases += [
        dict(name='virtual_relation_independent_contributions', mode='layers', inspectModel=True, inspectRelations=True,
             layers=[linked() + [vr('selected', relation='@customer_id', var_id='$id')], overlay]),
        dict(name='virtual_relation_clone', mode='clone', inspectModel=True, inspectRelations=True,
             layers=[linked() + [vr('selected', relation='@customer_id', var_id='$id')]],
             after=[vr('selected', contribution='custom', var_id='$id+2')]),
    ]
    physical = [call('', 'db', name='physical', implementation='sqlite'), call('db', 'schemas'),
                call('db.schemas', 'schema', name='main'), call('db.schemas.main', 'tables'),
                call('db.schemas.main.tables', 'table', name='item', pkey='id'),
                call('db.schemas.main.tables.item', 'column', name='id', dtype='I'),
                call('db.schemas.main.tables.item', 'virtualRelation', name='self', table='main.item', condition='1=1'),
                call('db.schemas.main.tables', 'table', name='other', pkey='id'),
                call('db.schemas.main.tables.other', 'column', name='id', dtype='I'),
                call('db.schemas.main.tables.item', 'column', name='other_id', dtype='I'),
                call('db.schemas.main.tables.item.columns.other_id', 'relation', to='main.other.id', foreign_key=True, inverse='items'),
                call('db.schemas.main.tables.other', 'virtualRelation', name='selected_items', relation='@items')]
    cases.append(dict(name='virtual_relation_physical_schema', mode='inline', layers=[physical],
                      inspectModel=True, inspectRelations=True))
    return cases
