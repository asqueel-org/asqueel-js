"""Execute ordered declarations with Python; JS independently replays the calls."""
from copy import deepcopy
import json

from python_reference import ROOT
from asqueel import SqlDatabaseConfig, SqlMigrationRenderer
from asqueel.configuration import _owned_handler

PACKAGE = 'db.packages.app'
TABLE = PACKAGE + '.tables.item'
OPTIONS = TABLE + '.options'
COLUMN = TABLE + '.columns.name'


def call(parent, tag, contribution='main', reject=False, knownPythonMutation=False, **attributes):
    return dict(parent=parent, tag=tag, attributes=attributes,
                contribution=contribution, reject=reject, knownPythonMutation=knownPythonMutation)


def skeleton():
    return [call('', 'db', name='composition', implementation='sqlite'),
            call('db', 'packages'), call('db.packages', 'package', name='app', sqlschema='main'),
            call(PACKAGE, 'table', name='item', pkey='id')]


def base():
    return skeleton() + [call(TABLE, 'column', name='id', dtype='I'),
                         call(TABLE, 'column', name='name', dtype='T'), call(TABLE, 'options')]


def definitions():
    def inline(name, extra, **kw):
        return dict(name=name, mode='inline', layers=[base() + extra], **kw)
    result = [
        inline('repeat_containers_and_declarations', [
            call('db', 'packages'), call('db.packages', 'package', name='app'),
            call(PACKAGE, 'table', name='item', name_long='Items'),
            call(PACKAGE, 'table', name='item', name_short='I'),
            call(TABLE, 'column', name='name', size=':40'), call(TABLE, 'column', name='name')]),
        inline('later_overrides_and_explicit_null', [
            call(PACKAGE, 'table', name='item', name_long='Base', foo_bar_color='blue', foo_bar_order=2),
            call(PACKAGE, 'table', contribution='application', name='item', name_long=None, foo_bar_color='green')]),
        inline('same_contribution_conflict_is_atomic', [
            call(TABLE, 'column', reject=True, name='name', comment='must not leak', dtype='A'),
            call(TABLE, 'column', name='name', name_long='Name')]),
        inline('nested_contribution_attribute_origins', [
            call(TABLE, 'column', contribution='custom', name='name', name_long='One'),
            call(TABLE, 'column', contribution='custom', reject=True, name='name', name_long='Two'),
            call(TABLE, 'column', contribution='other', name='name', name_short='N'),
            call(TABLE, 'column', contribution='custom', reject=True, name='name', name_long='Three')]),
        inline('sys_fields_merge_individual_keys', [
            call(OPTIONS, 'sys_fields', id={'type': 'uuid'}),
            call(OPTIONS, 'sys_fields', id={'name_long': 'Identifier'}),
            call(OPTIONS, 'sys_fields', reject=True, id={'indexed': True, 'name_long': 'Conflict'}),
            call(OPTIONS, 'sys_fields', contribution='app', id={'name_long': 'Code'})], render=False),
        inline('sys_fields_disable_reenable', [
            call(OPTIONS, 'sys_fields', id=False, ins={'name_long': 'Created', 'indexed': True}),
            call(OPTIONS, 'sys_fields', contribution='disable', ins=False, enabled=False),
            call(OPTIONS, 'sys_fields', contribution='enable', ins=True, enabled=True)]),
        inline('sys_fields_reenable_with_overrides', [
            call(OPTIONS, 'sys_fields', id=False, ins={'name_long': 'Created', 'indexed': True}),
            call(OPTIONS, 'sys_fields', contribution='disable', ins=False),
            call(OPTIONS, 'sys_fields', contribution='enable', ins={'name_long': 'Creation'})]),
        inline('reset_clears_configuration', [
            call(OPTIONS, 'sys_fields', id=False, draft=True),
            call(OPTIONS, 'reset', contribution='later', name='sys_fields'),
            call(OPTIONS, 'sys_fields', contribution='later', id=False)]),
        inline('reset_without_reactivation', [
            call(OPTIONS, 'sys_fields', id=False, draft=True),
            call(OPTIONS, 'reset', contribution='later', name='sys_fields')]),
        inline('invalid_reset_keeps_source', [
            call(OPTIONS, 'reset', reject=True, name='missing'),
            call(OPTIONS, 'reset', reject=True, name='requires')]),
        inline('numbering_dictionary_merges_one_level', [
            call(OPTIONS, 'numbering', field='name', parameters={'prefix': 'N', 'nested': {'a': 1}}),
            call(OPTIONS, 'numbering', field='name', parameters={'padding': 4}),
            call(OPTIONS, 'numbering', reject=True, field='name', parameters={'nested': {'b': 2}}),
            call(OPTIONS, 'numbering', contribution='later', field='name', parameters={'nested': {'b': 2}})]),
        inline('named_option_reset_removes_all_instances', [
            call(OPTIONS, 'numbering', field='name', parameters={'prefix': 'N'}),
            call(OPTIONS, 'numbering', field='id', parameters={'prefix': 'I'}),
            call(OPTIONS, 'reset', contribution='later', name='numbering'),
            call(OPTIONS, 'numbering', contribution='later', field='name', parameters={'padding': 2})]),
        inline('requires_replaced_not_concatenated', [
            call('db.packages', 'package', name='one'), call('db.packages', 'package', name='two'),
            call(PACKAGE, 'options'), call(PACKAGE + '.options', 'requires', packages=['one']),
            call(PACKAGE + '.options', 'requires', contribution='later', packages=['two'])]),
        inline('type_refinement_and_reuse', [
            call(PACKAGE, 'options'), call(PACKAGE + '.options', 'type', name='money', dtype='N'),
            call(PACKAGE + '.options', 'type', name='money', dtype='N', size='12,2'),
            call(TABLE, 'column', name='amount', dtype='money')]),
        inline('validation_flat_then_node', [
            call(TABLE, 'column', name='name', validate_len='1:20'),
            call(COLUMN, 'validation', reject=True, knownPythonMutation=True, len='2:30'),
            call(COLUMN, 'validation', contribution='later', len='2:30')]),
        inline('validation_node_then_flat', [
            call(COLUMN, 'validation', len='1:20'),
            call(TABLE, 'column', reject=True, name='name', validate_len='2:30'),
            call(TABLE, 'column', contribution='later', name='name', validate_len='2:30')]),
        inline('validation_equal_spellings', [
            call(TABLE, 'column', name='name', validate_notnull=True),
            call(COLUMN, 'validation', notnull=True)]),
        inline('virtual_kind_replaced_in_place', [
            call(TABLE, 'formulaColumn', name='before', sql_formula='1'),
            call(TABLE, 'aliasColumn', name='label', relation_path='$name', dtype='T', static=True, name_long='Label'),
            call(TABLE, 'formulaColumn', name='after', sql_formula='2'),
            call(TABLE, 'formulaColumn', name='label', sql_formula='upper($name)', name_long='Upper')]),
        inline('virtual_label_preserves_definition', [
            call(TABLE, 'formulaColumn', name='label', sql_formula='upper($name)'),
            call(TABLE, 'formulaColumn', contribution='later', name='label', name_long='Upper')]),
        inline('duplicate_database_rejected', [call('', 'db', reject=True, name='other')]),
        inline('option_defaults_not_reapplied', [
            call(OPTIONS, 'sys_fields', id=False, draft=True, group='custom'),
            call(OPTIONS, 'sys_fields', contribution='later', user_ins=False)]),
        inline('dictionary_attribute_is_copied', [
            call(OPTIONS, 'dynamic_fields', templates={'one': {'label': 'One'}}),
            call(OPTIONS, 'dynamic_fields', templates={'two': {'label': 'Two'}}),
            call(OPTIONS, 'dynamic_fields', contribution='later', templates={'one': {'label': 'New'}})]),
        inline('anonymous_index_repeated_by_columns', [
            call(TABLE, 'index', columns='name'), call(TABLE, 'index', columns='name'),
            call(TABLE, 'index', contribution='later', columns='name', method='btree')]),
        inline('records_merge_whole_record_values', [
            call(OPTIONS, 'system_records', enabled=False, records={'one': {'value': 1}}),
            call(OPTIONS, 'system_records', enabled=False, records={'two': {'value': 2}}),
            call(OPTIONS, 'system_records', enabled=False, reject=True, records={'one': {'other': 3}}),
            call(OPTIONS, 'system_records', contribution='later', enabled=False, records={'one': {'other': 3}})]),
        inline('handlers_merge_and_conflict', [
            call(OPTIONS, 'release', enabled=False, handlers={'1': 'app.first'}),
            call(OPTIONS, 'release', enabled=False, handlers={'2': 'app.second'}),
            call(OPTIONS, 'release', enabled=False, reject=True, handlers={'1': 'app.conflict'}),
            call(OPTIONS, 'release', contribution='later', enabled=False, handlers={'1': 'app.changed'})]),
        inline('named_option_invalid_identity', [
            call(OPTIONS, 'numbering', reject=True, field='name.invalid')]),
        inline('named_option_conflict_is_local', [
            call(OPTIONS, 'numbering', field='name', parameters={'prefix': 'N'}),
            call(OPTIONS, 'numbering', field='id', parameters={'prefix': 'I'}),
            call(OPTIONS, 'numbering', field='name', reject=True, parameters={'prefix': 'bad'})]),
    ]
    common = base() + [call(PACKAGE, 'table', name='item', name_long='Base', foo_bar_color='blue'),
                       call(OPTIONS, 'sys_fields', id=False, ins={'indexed': True}, draft=True)]
    overlay = skeleton() + [call(PACKAGE, 'table', name='item', name_long=None),
                            call(TABLE, 'column', name='name', comment='Overlay'), call(TABLE, 'options'),
                            call(OPTIONS, 'sys_fields', ins={'name_long': 'Created'})]
    reset = skeleton() + [call(TABLE, 'options'), call(OPTIONS, 'reset', name='sys_fields')]
    result.extend([
        dict(name='independent_models_compose_before_defaults', mode='layers', layers=[common, overlay]),
        dict(name='independent_reset_only', mode='layers', layers=[common, reset]),
        dict(name='independent_reset_then_reactivate', mode='layers', layers=[common, reset + [call(OPTIONS, 'sys_fields', id=False)]]),
        dict(name='reset_survives_recomposition', mode='recompose', layers=[common, reset]),
        dict(name='clone_preserves_contribution_origins', mode='clone', layers=[base() + [
            call(TABLE, 'column', contribution='custom', name='name', name_long='Custom')]],
             after=[call(TABLE, 'column', contribution='custom', reject=True, name='name', name_long='Conflict')]),
        dict(name='independent_virtual_kind_redefinition', mode='layers', layers=[base() + [
            call(TABLE, 'aliasColumn', name='label', relation_path='$name', dtype='T', static=True)],
            skeleton() + [call(TABLE, 'formulaColumn', name='label', sql_formula='upper($name)')]]),
        dict(name='physical_virtual_collision_rejected', mode='layers', rejectComposition=True,
             layers=[base(), skeleton() + [call(TABLE, 'formulaColumn', name='name', sql_formula="'bad'")]]),
        dict(name='several_layers_preserve_order', mode='layers', layers=[base(),
            skeleton() + [call(TABLE, 'column', name='second', dtype='I')],
            skeleton() + [call(TABLE, 'column', name='third', dtype='I'), call(TABLE, 'column', name='name', comment='final')]]),
    ])
    from group_cases import definitions as group_definitions
    return result + group_definitions(call, base, skeleton, TABLE, PACKAGE)


def model_document(builder):
    """Feature projection of the resolved model, not a substitute for full parity."""
    from asqueel.model import resolve_model
    from asqueel.model_sections import thaw
    model = resolve_model(builder)
    keys = {'name', 'size', 'group', 'name_long', 'name_short', 'comment', 'sql_formula',
            'x_legacy__addClass', 'x_requires_compilation'}

    def declaration(d):
        return dict(kind=d.kind, name=d.name, attributes=thaw(d.attributes),
                    children=[declaration(c) for c in d.children])

    return {key: dict(declarations=[declaration(d) for d in table.declarations],
                      attributes={k: thaw(v) for k, v in table.attributes.items() if k == 'group_subtables'},
                      columns={name: dict(kind=c.kind, dtype=c.dtype, attributes={k: thaw(v)
                               for k, v in c.attributes.items() if k in keys or k.startswith('var_')})
                               for name, c in table.columns.items()})
            for key, table in model.tables.items()}


def source_document(builder):
    def walk(bag):
        result = []
        for node in bag:
            attributes = deepcopy(dict(node.attr))
            meta = {k: v for k, v in attributes.pop('_meta', {}).items()
                    if k in ('option_resets', 'disabled_fields', 'inherited_attributes', 'colgroup')}
            if meta:
                attributes['_meta'] = meta
            result.append(dict(tag=node.node_tag, label=node.label, attributes=attributes,
                               children=walk(node.value) if hasattr(node.value, 'get_node') else []))
        return result
    return walk(builder.source)


def apply(builder, steps):
    outcomes = []
    for step in steps:
        before = source_document(builder)
        try:
            with builder.contribution(step['contribution']):
                parent = builder.source[step['parent']] if step['parent'] else builder.source
                getattr(parent, step['tag'])(**deepcopy(step['attributes']))
        except (ValueError, TypeError) as error:
            if not step['reject']:
                raise RuntimeError(f"Unexpected rejection of {step}: {error}") from error
            if not step.get('knownPythonMutation'):
                assert source_document(builder) == before, (step, 'failed declaration mutated source')
            outcomes.append(False)
        else:
            assert not step['reject'], ('expected rejection', step)
            outcomes.append(True)
    return outcomes


def evaluate(case):
    layers, outcomes = [], []
    for steps in case['layers']:
        builder = SqlDatabaseConfig()
        outcomes.append(apply(builder, steps))
        layers.append(builder)
    snapshots = [source_document(layer) for layer in layers]
    try:
        if case['mode'] == 'clone':
            result = deepcopy(layers[0])
            outcomes.append(apply(result, case['after']))
        elif case['mode'] in ('layers', 'recompose'):
            result = _owned_handler(layers[-1], layers[:-1]).builder
            if case['mode'] == 'recompose':
                result = _owned_handler(result, [layers[0]]).builder
        else:
            result = layers[0]
        if case.get('rejectComposition'):
            raise AssertionError('composition should fail')
    except (ValueError, TypeError):
        if not case.get('rejectComposition'):
            raise
        assert snapshots == [source_document(layer) for layer in layers]
        return dict(outcomes=outcomes, compositionAccepted=False, inputsUnchanged=True)
    result.validate_source()
    answer = dict(outcomes=outcomes, source=source_document(result))
    if case['mode'] != 'inline':
        answer['inputsUnchanged'] = snapshots == [source_document(layer) for layer in layers]
        assert answer['inputsUnchanged']
    for key, render in [('migration', lambda: SqlMigrationRenderer(result).render()),
                        ('model', lambda: model_document(result))]:
        if not (case.get('render', True) if key == 'migration' else case.get('inspectModel')):
            continue
        try:
            value = render()
        except (ValueError, TypeError):
            if not case.get('rejectResolution'):
                raise
            answer[key + 'Accepted'] = False
        else:
            assert not case.get('rejectResolution'), 'resolution should fail'
            answer[key] = value
    assert answer['source'] == source_document(result), 'rendering mutated source'
    return answer


def composition_oracle():
    return [dict(**case, expected=evaluate(case)) for case in definitions()]


if __name__ == '__main__':
    cases = composition_oracle()
    (ROOT / 'test/fixtures/composition.json').write_text(json.dumps(cases, indent=2, ensure_ascii=False) + '\n')
    print(f'Exported {len(cases)} independent Python composition cases')
