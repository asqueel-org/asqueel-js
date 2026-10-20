# VirtualRelation nel modello

`virtualRelation` conserva una navigazione logica con eventuale filtro, binding
e richiesta di parametri. La risoluzione segue il Python di riferimento fissato
nelle fixture. Non crea colonne, tabelle o foreign key aggiuntive nel JSON migrate.

## Dichiarazione

```js
// Percorso su una relazione già dichiarata, anche inversa o virtuale.
customer.virtualRelation({
    name: 'selected_items', relation: '@items',
    condition: '$total > :var_min AND $year = :ask_year',
    var_min: '$minimum_amount',
    ask: {title: 'Anno', fields: [{name: 'year', dtype: 'I'}]},
});

// Destinazione logica esplicita con condizione obbligatoria.
item.virtualRelation({
    name: 'selected_customer', table: 'app.customer',
    condition: '$id = :var_customer', var_customer: '$customer_id',
});

item.aliasColumn({name: 'customer_name', relation_path: '@selected_customer.name'});
```

`relation` e `table` sono alternativi. `table` usa il nome logico completo del
modello, anche quando schema, prefisso, tabella o colonne hanno nomi SQL diversi.
La condizione si riferisce alla destinazione; le espressioni `var_*` si riferiscono
alla sorgente. `ask`, condizioni e binding restano dati: il resolver non li esegue,
non ne riscrive l'SQL e non mostra finestre per raccogliere parametri.

## Composizione e risoluzione

La dichiarazione ha etichetta `virtualRelation_<name>`. Ripeterla conserva
l'identità; attributi compatibili si aggiungono, conflitti nello stesso contributo
vengono rifiutati e contributi successivi possono fare override. `ask` è un valore
intero: viene sostituito, non unito per chiave. Per passare da un percorso a una
destinazione esplicita occorre azzerare `relation` con `null`.

Il modello risolto contiene le relazioni fisiche, quelle deboli, le inverse
dichiarate da queste e le virtuali. I percorsi virtuali possono attraversare più
tabelle e riferirsi a dichiarazioni successive. Il resolver completa i percorsi
finché può avanzare, poi segnala quelli sconosciuti o ciclici. Nomi in conflitto
con relazioni dirette o inverse sono rifiutati. Non genera inverse delle virtuali.

Gli alias possono attraversare le relazioni virtuali: nel modello ricevono il
target e il tipo della colonna di destinazione, con i metadati descrittivi e gli
override espliciti previsti da Python. Target inesistenti e cicli negli alias
sono errori. Sorgenti e parametri del chiamante rimangono invariati durante
composizione, copia, serializzazione e rendering.

## Limiti e verifiche

Come Python, la dichiarazione rifiuta `inverse`, `parameters`, `source_parameters`,
`reverse_name`, `order_by`, `limit` e `one_one`, anche se passati con valore `null`.
I binding devono chiamarsi `var_<identificatore>`; sono ammessi i metadati `x_*`.

Questa copertura riguarda il **modello e migrate**. Le query JS non compilano
ancora condizioni, `ask`, binding o navigazioni virtuali. Una query che usa
`@selected_customer.name` viene rifiutata esplicitamente. Le relazioni fisiche
e le normali operazioni sulle tabelle continuano a funzionare.

32 scenari eseguono dichiarazioni indipendenti in Python e JS. Confrontano:

- sorgente completo e accettazione/rifiuto delle dichiarazioni;
- dichiarazioni semantiche, relazioni risolte con attributi, destinazioni e chiavi,
  target degli alias e attributi pertinenti delle colonne;
- JSON migrate completo, oppure il rifiuto della risoluzione nei casi invalidi.

Non è una certificazione di tutte le proprietà del runtime `ResolvedModel`.
La verifica dal vivo usa Node e Bun; il corpus salvato gira anche nel worker
Chromium. Un database temporaneo verifica la migrazione reale, l'assenza di FK
virtuali, l'applicazione della FK fisica, i dati dopo riapertura IndexedDB e il
diff migrate vuoto. Il database del playground non viene cancellato dai test.

L'esempio `examples/virtual-relations.js` è selezionabile come **VirtualRelation**
nel playground su `http://127.0.0.1:8092/`. Il pulsante **Verifica composizione con
Python** esegue il corpus e i controlli SQLite reali.
