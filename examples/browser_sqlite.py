"""Independent Python model for the persistent browser SQLite scenario."""
from asqueel import SqlBuilder


def browser_model(version=1):
    model = SqlBuilder()
    packages = model.source.db("browser", implementation="sqlite").packages()
    customer = packages.package("crm").tables().table("customer")
    customer.options().sys_fields(syscode=True)
    columns = customer.columns()
    columns.column("name", dtype="T", notnull=True)
    if version == 2:
        columns.column("email", dtype="T", indexed=True)
    sales = packages.package("sales")
    sales.options().requires("crm")
    invoice = sales.tables().table("invoice")
    options = invoice.options()
    options.sys_fields(draft=True)
    options.audit("lazy")
    cols = invoice.columns()
    cols.column("customer_id").relation("crm.customer.id", onDelete_sql="restrict")
    cols.column("amount", dtype="N", size="12,2", sql_default="0")
    return model
