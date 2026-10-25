"""What the parity tests compare: the composed recipe source in TYTX and the migration JSON."""
from asqueel import AsqueelDb
from asqueel.configuration import compose_recipe


def source_tytx(recipe, parents=None):
    """The composed recipe source, as written by Python ``recipe.source.to_tytx()``."""
    return compose_recipe(recipe, parents).source.to_tytx()


def migration(recipe, parents=None):
    """The ``structure-1.0`` JSON handed to asqueel-migration."""
    return compose_recipe(recipe, parents).render(mode='migration', foreignKeys=True)


def live_model(recipe, parents=None):
    """The live DbModel built from the recipe, without opening a connection."""
    return AsqueelDb(recipe, parents=parents).model


def bind_table_classes(db, classes):
    """Install each ``Table`` class on its live table, as the package layout does.

    The package layout combines ``model/<table>.py``'s ``Table`` with ``SqlTable``;
    the oracles declare those classes in memory instead of on disk.
    """
    for name, table_class in classes.items():
        table = db.table(name)
        table.model._check_table_methods(table_class)
        table.__class__ = table_class
