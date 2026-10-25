"""Reference recipe, executed by Asqueel's real Python migration renderer."""
from asqueel import SqlBuilder


class Shop(SqlBuilder):
    def main(self, root):
        db = root.db(name="shop")
        packages = db.packages()
        crm = packages.package("crm", sqlschema="crm", sqlprefix=False).tables()
        customer = crm.table(name="customer", pkey="id", comment="Clienti")
        cols = customer.columns()
        cols.column(name="id", dtype="serial", indexed=True)
        cols.column(name="code", dtype="A", size="0:20", unique=True, indexed=True)
        cols.column(name="name", dtype="T", notnull=True, name_long="Ragione sociale")

        region = crm.table(name="region", pkey="key")
        cols = region.columns()
        cols.column(name="country", dtype="A", size="0:2")
        cols.column(name="code", dtype="A", size="0:8")
        region.composites().compositeColumn(name="key", columns="country,code")

        sales = packages.package("sales", sqlschema="sales", sqlprefix=False).tables()
        invoice = sales.table(name="invoice", pkey="id")
        cols = invoice.columns()
        cols.column(name="id", dtype="serial4")
        cols.column(name="customer_id", dtype="L", notnull=True).relation(
            related_column="crm.customer.id", foreign_key=True, onDelete_sql="RESTRICT")
        cols.column(name="country", dtype="A", size="0:2")
        cols.column(name="region_code", dtype="A", size="0:8")
        cols.column(name="year", dtype="I")
        cols.column(name="number", dtype="I")
        cols.column(name="issued", dtype="D")
        cols.column(name="amount", dtype="N", size="12,2", sql_default="0")
        composites = invoice.composites()
        composites.compositeColumn(name="region", columns="country,region_code").relation(
            related_column="crm.region.key", foreign_key=True, deferred=True)
        composites.compositeColumn(name="number_key", columns="year,number", unique=True)
        invoice.constraints().constraint(
            name="ck_amount", constraint_type="CHECK", check_clause="(amount >= 0)")
        indexes = invoice.indexes()
        indexes.index(name="ix_invoice_customer", columns="customer_id")
        indexes.index(name="ix_invoice_date", columns={"issued": "DESC", "id": None})
        invoice.virtual_columns().formulaColumn(
            name="gross", dtype="N", sql_formula="$amount * 1.22")

        row = sales.table(name="invoice_row", pkey="id")
        cols = row.columns()
        cols.column(name="id", dtype="serial")
        cols.column(name="invoice_id", dtype="L").relation(
            related_column="sales.invoice", foreign_key=True, onDelete_sql="CASCADE")
        cols.column(name="description", size="0:120", comment="Descrizione")
        cols.column(name="sku", dtype="T", indexed=True)
        cols.column(name="quantity", dtype="N", size="10,2")
        db.extensions().extension(name="pg_trgm")
