"""Application packages/options oracle; no database or executable hooks."""
from asqueel import SqlBuilder


class Application(SqlBuilder):
    def main(self, root):
        db = root.db("application")
        packages = db.packages()
        crm = packages.package("crm", sqlschema="registry", sqlprefix=False)
        customer = crm.tables().table("customer")
        customer.options().sysFields(syscode=True, user_upd=False)
        customer.columns().column("name", dtype="T", notnull=True)
        category = crm.tables().table("category")
        category.columns().column("description", dtype="T")
        opts = category.options()
        opts.sysFields()
        opts.hierarchical("description", root_id=True)
        opts.counter()

        sales = packages.package("sales", sqlschema="business", sqlprefix="ord")
        sales.options().requires("crm")
        sales.options().type("money", dtype="N", size="14,2")
        invoice = sales.tables().table("invoice", sqlname="invoices", partition_customer_id="company")
        cols = invoice.columns()
        cols.column("customer_id").relation("crm.customer.id", onDelete_sql="restrict")
        cols.column("amount", dtype="money")
        cols.column("document", dtype="X")
        opts = invoice.options()
        opts.sysFields(draft=True)
        opts.fullUpd()
        opts.df()
        opts.broadcast("amount")

        row = sales.tables().table("invoice_row")
        cols = row.columns()
        cols.column("invoice_id").relation("invoice.id", onDelete_sql="cascade")
        cols.column("amount", dtype="money")
        row.options().sysFields(ins=False, upd=False, user_ins=False, user_upd=False, ldel=False)
        row.options().counter("invoice_id")
