# VirtualRelation nella 0.7.0

La dichiarazione `table.virtualRelation({name, table, condition, ask, var_...})`
è composta e conservata integralmente nell'albero risolto, con nomi descrittivi,
binding e parametri. Una destinazione `table` richiede una condizione non vuota.
Sono ammessi anche percorsi dichiarativi `relation`.

Il `DbModel` gerarchico Python 0.7.0 registra le relazioni tra colonne, incluse
inverse e relazioni ereditate dagli alias. **Non costruisce archi per i nodi
virtualRelation**: anche JS mantiene questa distinzione. I vecchi controlli del
PoC sul grafo di `ResolvedModel` sono sostituiti dal confronto dell'intero albero
e del registro effettivamente prodotto dalla 0.7.0.

Le dichiarazioni virtualRelation non generano foreign key nel JSON migrate.
L'esempio del playground confronta modello e migrate con Python, applica la
migrazione su SQLite WASM e verifica vincoli fisici e persistenza IndexedDB.
Il compilatore esegue le aggregazioni `@nome.aggr(...)` sulle virtualRelation:
supporta derivazioni `relation`, filtri cumulativi, dichiarazioni dirette
`table`/`condition` e `var_*` come espressioni del record origine. I risultati
sono confrontati con Python anche su SQLite WASM, dopo riapertura IndexedDB.
La navigazione come JOIN diretto e le aggregazioni con `ask` restano escluse.
Vedi [sottoquery e aggregazioni](parity.md#sottoquery-e-aggregazioni-inverse).

Attributi come `x_ui_color`, `inverse`, `order_by` e `limit` non appartengono alla
firma attuale e non vengono accettati. Vedi [contratto completo](model.md).
