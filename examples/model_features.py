"""Python 0.6.0 counterparts, independently authored from the JS examples."""
from asqueel import SqlBuilder

def base():
    b=SqlBuilder();app=b.source.db('composition',implementation='sqlite').packages().package('app',sqlschema='main')
    item=app.table('item',pkey='id');item.column('id',dtype='I');item.column('name',dtype='T');item.options()
    return b,app,item

def grouped_items():
    b,app,item=base()
    group=item.colgroup('details',name_long='Details',col_dtype='T',col_size=':80')
    group.column('city')
    item.formulaColumn('active',sql_formula='$id > :minimum',dtype='B',var_minimum=0)
    return b

def virtual_relations():
    b,app,item=base();customer=app.table('customer',pkey='id');customer.column('id',dtype='I')
    customer.column('name',dtype='T',size=':60',name_long='Customer name')
    item.column('customer_id',dtype='I').relation('app.customer.id',relation_name='items')
    item.virtualRelation('selected',table='app.customer',condition='$id=:var_customer',var_customer='$customer_id',
        name_long='Selected customer',name_short='SC',comment='Model only',ask={'title':'Filter','fields':[{'name':'year','dtype':'I'}]})
    return b
