"""Authored inputs for colgroup/subtable parity; expected output comes from Python."""


def definitions(call, base, skeleton, table, package):
    group = table + '.colgroup_details'

    def inline(name, steps, **kwargs):
        return dict(name=name, mode='inline', layers=[base() + steps], inspectModel=True, **kwargs)

    grouped = [call(table, 'colgroup', name='details', name_long='Details', col_dtype='T', col_size=':80')]
    subtable = dict(name='active', condition='$id > :minimum', parameters={'minimum': 0})
    cases = [
        inline('colgroup_defaults_order_and_repeat', grouped + [
            call(group, 'column', name='street'), call(group, 'column', name='city', size=':40'),
            call(group, 'column', name='city'), call(table, 'column', name='plain', dtype='I'),
            call(table, 'colgroup', name='contact', col_dtype='T'),
            call(table + '.colgroup_contact', 'column', name='phone'),
            call(group, 'column', name='country')]),
        inline('colgroup_existing_attributes_win', grouped + [
            call(group, 'column', name='name'), call(group, 'column', name='name'),
            call(group, 'column', name='other', size=None)]),
        inline('colgroup_definition_conflicts', grouped + [
            call(table, 'colgroup', name='details'),
            call(table, 'colgroup', name='details', name_long='Different', reject=True),
            call(table, 'colgroup', name='details', contribution='later', col_size=':40', reject=True),
            call(table, 'colgroup', name='details', comment='New attribute', reject=True)]),
        inline('colgroup_invalid_defaults', [
            call(table, 'colgroup', name='bad', col_dtypo='T', reject=True),
            call(table, 'colgroup', name='bad', col_name='other', reject=True),
            call(table, 'colgroup', name='bad', col_notnull='yes', reject=True),
            call(table, 'colgroup', name='bad.name', reject=True),
            call(table, 'colgroup', name='bad', x_custom=True, reject=True),
            call(table, 'colgroup', name='bad', node_label='other', reject=True)]),
        inline('colgroup_membership_conflicts', grouped + [
            call(group, 'column', name='city'),
            call(group, 'column', name='street', group='details.999', reject=True),
            call(table, 'colgroup', name='other'),
            call(table + '.colgroup_other', 'column', name='city', reject=True)]),
        inline('colgroup_virtual_kind_preserves_ordinal', grouped + [
            call(group, 'column', name='city'),
            call(group, 'aliasColumn', name='label', relation_path='$name', static=True),
            call(group, 'formulaColumn', name='after', sql_formula='1'),
            call(group, 'formulaColumn', name='label', sql_formula='upper($name)')]),
        inline('colgroup_defaults_filtered_by_element', grouped + [
            call(group, 'column', name='code'),
            call(group, 'formulaColumn', name='caption', sql_formula='upper($name)')]),
        inline('colgroup_index_rejected_by_python_model', grouped + [
            call(group, 'index', name='by_name', columns='name')], rejectResolution=True),
        inline('subtable_declaration_and_bindings', [call(table, 'subtable', **subtable,
            name_long='Active', name_short='A', comment='Filtered rows', condition_minimum=5,
            condition_tenant='demo', x_ui_color='green')]),
        inline('subtable_multiple_and_empty_parameters', [
            call(table, 'subtable', **subtable),
            call(table, 'subtable', name='named', condition="$name != ''", parameters={}),
            call(table, 'subtable', name='all', condition='1=1', parameters=None)]),
        inline('subtable_parameter_composition', [
            call(table, 'subtable', **subtable),
            call(table, 'subtable', name='active', condition=subtable['condition'], parameters={'tenant': 'demo'}),
            call(table, 'subtable', name='active', condition=subtable['condition'], parameters={'minimum': 8}, reject=True),
            call(table, 'subtable', contribution='later', name='active', condition='$id >= :minimum', parameters={'minimum': 2})]),
        inline('subtable_invalid_declarations', [
            call(table, 'subtable', name='missing', reject=True),
            call(table, 'subtable', name='bad.name', condition='1=1', reject=True),
            call(table, 'subtable', name='bad', condition=4, reject=True),
            call(table, 'subtable', name='bad', condition='1=1', parameters=[], reject=True),
            call(table, 'subtable', name='bad', condition='1=1', typo=True, reject=True)]),
        inline('subtable_existing_formula_metadata', [
            call(table, 'formulaColumn', name='subtable_active', sql_formula=subtable['condition'],
                 dtype='B', name_long='Custom', group='custom', var_minimum=7),
            call(package, 'table', name='item', group_subtables='Filters'),
            call(table, 'subtable', **subtable)]),
        inline('subtable_physical_collision', [
            call(table, 'column', name='subtable_active', dtype='B'),
            call(table, 'subtable', **subtable)], rejectResolution=True),
        inline('subtable_formula_collision', [
            call(table, 'formulaColumn', name='subtable_active', sql_formula='FALSE', dtype='B'),
            call(table, 'subtable', **subtable)], rejectResolution=True),
        inline('subtable_dtype_collision', [
            call(table, 'formulaColumn', name='subtable_active', sql_formula=subtable['condition'], dtype='T'),
            call(table, 'subtable', **subtable)], rejectResolution=True),
        inline('colgroup_and_subtable_together', grouped + [
            call(group, 'column', name='city'),
            call(table, 'subtable', **subtable)]),
    ]
    cases += [
        dict(name='colgroup_layer_virtual_ordinal', mode='layers', inspectModel=True, layers=[
            base() + grouped + [call(group, 'column', name='city'),
                               call(group, 'aliasColumn', name='label', relation_path='$name', static=True)],
            skeleton() + grouped + [call(group, 'formulaColumn', name='label', sql_formula='upper($name)')]]),
        dict(name='colgroup_layer_same_kind_ordinal', mode='layers', inspectModel=True, layers=[
            base() + grouped + [call(group, 'column', name='city'), call(group, 'column', name='street')],
            skeleton() + grouped + [call(group, 'column', name='street', comment='Override'), call(group, 'column', name='country')]]),
        dict(name='colgroup_layer_defaults_override', mode='layers', inspectModel=True, layers=[
            base() + grouped + [call(group, 'column', name='city')],
            skeleton() + [call(table, 'colgroup', name='details', col_dtype='T', col_size=':40'),
                          call(group, 'column', name='country')]]),
        dict(name='subtable_independent_contributions', mode='layers', inspectModel=True, layers=[
            base() + [call(table, 'subtable', **subtable)],
            skeleton() + [call(table, 'subtable', name='active', condition='$id >= :minimum',
                               parameters={'minimum': 3, 'tenant': 'demo'}, name_long='Current')]]),
        dict(name='colgroup_clone_continues_order', mode='clone', inspectModel=True,
             layers=[base() + grouped + [call(group, 'column', name='city')]],
             after=[call(group, 'column', name='country'), call(group, 'column', name='city')]),
    ]
    # Exercise the same semantic declarations on physical schemas, without packages/options.
    physical = [call('', 'db', name='composition', implementation='sqlite'), call('db', 'schemas'),
                call('db.schemas', 'schema', name='main'), call('db.schemas.main', 'tables'),
                call('db.schemas.main.tables', 'table', name='item', pkey='id'),
                call('db.schemas.main.tables.item', 'column', name='id', dtype='I'),
                call('db.schemas.main.tables.item', 'colgroup', name='details', col_dtype='T'),
                call('db.schemas.main.tables.item.colgroup_details', 'column', name='name'),
                call('db.schemas.main.tables.item', 'subtable', **subtable)]
    cases.append(dict(name='groups_and_subtables_on_schema', mode='inline', layers=[physical], inspectModel=True))
    return cases
