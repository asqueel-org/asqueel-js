# VirtualRelation nella 0.6.1

La dichiarazione `table.virtualRelation({name, table, condition, ask, var_...})`
è composta e conservata integralmente nell'albero risolto, con nomi descrittivi,
binding e parametri. Una destinazione `table` richiede una condizione non vuota.
Sono ammessi anche percorsi dichiarativi `relation`.

Il `DbModel` gerarchico Python 0.6.1 registra le relazioni tra colonne, incluse
inverse e relazioni ereditate dagli alias. **Non costruisce archi per i nodi
virtualRelation**: anche JS mantiene questa distinzione. I vecchi controlli del
PoC sul grafo di `ResolvedModel` sono sostituiti dal confronto dell'intero albero
e del registro effettivamente prodotto dalla 0.6.1.

Le dichiarazioni virtualRelation non generano foreign key nel JSON migrate.
L'esempio del playground confronta modello e migrate con Python, applica la
migrazione su SQLite WASM e verifica vincoli fisici e persistenza IndexedDB.
La navigazione virtualRelation nelle query è rifiutata esplicitamente finché
non sarà portato il compilatore.

Attributi come `x_ui_color`, `inverse`, `order_by` e `limit` non appartengono alla
firma attuale e non vengono accettati. Vedi [contratto completo](model.md).
