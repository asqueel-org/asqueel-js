"""Independent Python counterpart of the browser query model."""
from browser_sqlite import browser_model


def query_model():
    model = browser_model(2)
    tables = model.source["db.packages"].package("notes", sqlprefix="q").tables()
    person = tables.table("person", sqlname="query_people", pkey="id")
    person.column("id", dtype="I")
    person.column("name", dtype="T", sqlname="display_name", notnull=True)
    person.column("active", dtype="B", sql_default="1")
    memo = tables.table("memo", pkey="id")
    memo.column("id", dtype="I")
    memo.column("person_id").relation("person.id")
    memo.column("body", dtype="T")
    memo.column("amount", dtype="N", size="12,2")
    return model
