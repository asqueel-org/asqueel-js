"""Application packages/options oracle; no database or executable hooks."""
from asqueel import SqlBuilder


class Application(SqlBuilder):
    def main(self, root):
        db = root.db("application")
        packages = db.packages()
        crm = packages.package("crm", sqlschema="registry", sqlprefix=False)
        customer = crm.tables().table("customer")
        customer.options().sys_fields(syscode=True, user_upd=False)
        customer.columns().column("name", dtype="T", notnull=True)
        category = crm.tables().table("category")
        category.columns().column("description", dtype="T")
        opts = category.options()
        opts.sys_fields()
        opts.hierarchical("description", root_id=True)
        opts.auto_counter()

        sales = packages.package("sales", sqlschema="business", sqlprefix="ord")
        sales.options().requires("crm")
        sales.options().type("money", dtype="N", size="14,2")
        invoice = sales.tables().table("invoice", sqlname="invoices")
        cols = invoice.columns()
        cols.column("customer_id").relation("crm.customer.id", on_delete_sql="restrict")
        cols.column("amount", dtype="money")
        cols.column("document", dtype="X")
        opts = invoice.options()
        opts.sys_fields(draft=True)
        opts.full_update()
        opts.record_hash()
        opts.audit("lazy")
        opts.dynamic_fields()
        opts.protection(tag="accounting")
        opts.broadcast("amount")
        opts.partition("company", field="customer_id")

        row = sales.tables().table("invoice_row")
        cols = row.columns()
        cols.column("invoice_id").relation("invoice.id", on_delete_sql="cascade")
        cols.column("amount", dtype="money")
        row.options().sys_fields(ins=False, upd=False, user_ins=False, user_upd=False, ldel=False)
        row.options().auto_counter("invoice_id")

        docs = packages.package("docs", sqlschema="business")
        docs.options().requires("sales")
        attachment = docs.tables().table("invoice_file")
        attachment.options().attachments(master="sales.invoice")
