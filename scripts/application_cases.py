"""Independent Python differential corpus for application migration semantics."""
from asqueel import SqlBuilder


def source():
    b = SqlBuilder()
    db = b.source.db("cases")
    pkg = db.packages().package("app")
    return b, db, pkg


def cases():
    options = [
        ("sys_fields", {}), ("sys_fields", {"draft": True, "syscode": True}),
        ("sys_fields", {"id": False, "ins": {"indexed": False}, "user_upd": False}),
        ("full_update", {"field": "changed"}), ("record_hash", {"field": "digest"}),
        ("audit", {"mode": "full", "version_field": "revision"}),
        ("dynamic_fields", {"templates": {"card": "a"}}),
        ("auto_counter", {"field": "position", "scope": "group"}),
        ("protection", {"tag": "admin"}), ("protection", {"rules": ["check_write"]}),
        ("partition", {"name": "company", "field": "company_id", "required": True}),
        ("numbering", {"field": "number", "parameters": {"format": "000"}}),
        ("tenant", {"field": "company_id"}), ("retention", {"field": "created", "days": 30}),
        ("broadcast", {"columns": ["name"]}), ("archive", {}),
        ("enabled_when", {"preference": "feature.enabled"}),
        ("system_records", {"enabled": False}), ("release", {"enabled": False}),
    ]
    for i, (tag, attrs) in enumerate(options):
        b, _, pkg = source()
        t = pkg.table("item")
        t.column("name", dtype="T")
        getattr(t.options(), tag)(**attrs)
        yield f"option_{i}_{tag}", b
        b, _, pkg = source()
        t = pkg.table("item")
        t.column("name", dtype="T")
        getattr(t.options(), tag)(**{**attrs, "enabled": False})
        yield f"disabled_{i}_{tag}", b

    for prefix in (True, False, "custom"):
        b, db, pkg = source()
        db.packages().package("app", sqlprefix=prefix, sqlschema="storage")
        pkg.options().type("price", dtype="N", size="10")
        t = pkg.table("invoice", pkey="identity")
        t.column("code", dtype="A", size="4:20", sqlname="code_sql")
        t.column("position", dtype="I")
        t.column("amount", dtype="price")
        t.column("bag", dtype="X")
        t.column("text", dtype="A")
        t.compositeColumn("identity", "code,position")
        t.index(columns="code,position")
        yield f"prefix_{prefix}", b

    b, db, pkg = source()
    db.attr["implementation"] = "sqlite"
    pkg.table("item").options().sys_fields()
    yield "sqlite_default_schema", b

    b = SqlBuilder()
    db = b.source.db("cases")
    t = db.schemas().schema("storage", sqlname="actual").tables().table("item", sqlname="custom_table")
    t.column("id", dtype="L", sqlname="custom_id")
    t.attr["pkey"] = "id"
    t.options().full_update()
    yield "physical_overrides", b

    b, db, pkg = source()
    pkg.table("base", pkey="id").column("id", dtype="serial4")
    pkg.table("middle", pkey="base_id").column("base_id").relation("base.id")
    pkg.table("leaf").column("middle_id").relation("middle.base_id", on_delete_sql="set_null")
    yield "foreign_key_inference_chain", b

    b, db, pkg = source()
    pkg.table("target").column("code", dtype="T")
    pkg.table("child").column("code").weak_relation("target.code")
    yield "weak_relation_indexes", b

    for reverse in (False, True):
        b, db, pkg = source()
        for name in (["document_atc", "document"] if reverse else ["document", "document_atc"]):
            t = pkg.table(name)
            if name == "document":
                t.options().sys_fields()
            else:
                t.options().attachments(master="app.document")
        yield f"attachments_reverse_{reverse}", b

    b, db, pkg = source()
    pkg.table("master", pkey="id").column("id", dtype="serial")
    t = pkg.table("branch")
    t.column("description", dtype="T")
    t.options().sys_fields()
    t.options().hierarchical([{"name": "description", "unique": True}], linked_to="master",
                             root_id=True, virtual_roots=True, depth=3)
    t.options().auto_counter()
    yield "linked_hierarchy", b

    b, db, pkg = source()
    pkg.table("master", pkey="id").column("id", dtype="L")
    pkg.table("master_xtd", pkey="id").column("id", dtype="L")
    t = pkg.table("detail")
    t.column("master_id").relation("master.id")
    t.options().relative_index("@master_id", field="sequence")
    yield "relative_index", b

    b = SqlBuilder()
    t = b.source.db("schema_options").schemas().schema("app").tables().table("item")
    t.options().sys_fields()
    yield "schema_sys_fields_keeps_logical_storage", b

    b, db, pkg = source()
    pkg.options().requires("other")
    db.packages().package("other", sqlschema="other")
    pkg.table("item", sqlschema="other").column("name")
    yield "requires_and_schema_override", b

    b, db, pkg = source()
    t = pkg.table("item", pkey="natural_key")
    t.column("natural_key", dtype="T")
    t.column("__ins_ts", dtype="DHZ", indexed=False, comment="Customized")
    t.options().sys_fields(id=False, draft=True)
    t.column("details", dtype="X").dynamic_fields(source="item.fields")
    yield "explicit_system_column_and_column_dynamic_fields", b

    b, db, pkg = source()
    target = pkg.table("target")
    target.column("a", dtype="T")
    target.column("b", dtype="T")
    target.compositeColumn("pair", "a,b", unique=True)
    owner = pkg.table("owner")
    owner.column("first", dtype="T", sqlname="first_sql")
    owner.column("second", dtype="T")
    owner.compositeColumn("pair", "first,second").relation("target.pair")
    yield "composite_foreign_key_remapping", b


def source_document(builder):
    def node(n):
        return {"tag": n.node_tag, "attributes": {k: v for k, v in n.attr.items() if k != "_meta"},
                "children": [node(c) for c in n.value] if hasattr(n.value, "get_nodes") else []}
    return [node(n) for n in builder.source]
