# Importazione CSV, JSON e TYTX

`table.sql_insert(source, options)` porta il contratto di Python 0.7.0
(`SqlTable.sql_insert`, `table_io.read_records`, `adaptRecord`). L'importazione è
SQL diretta: non esegue trigger di campo/tabella, contatori, gerarchie o cascade.
Per il ciclo applicativo completo resta disponibile `table.insert(record)`.

```js
const queries = model.queries(adapter);
const products = queries.table('app.product');

// File scelto dall'utente: l'estensione determina il formato.
const count = await products.sql_insert(fileInput.files[0]);

// Testo oppure stream senza nome: formato esplicito.
await products.sql_insert('id,name,price\n1,Tea,1.50\n', {format: 'csv'});
await products.sql_insert('[{"id":2,"name":"Coffee"}]', {format: 'json'});
await products.sql_insert('{"id":3,"price":"2.25::N"}::JS\n', {format: 'tytx'});

// Record e liste: adattamento disattivato per default, come Python.
await products.sql_insert([{id: '4', price: '3.10'}], {adapt: true});
```

## Sorgenti e formati

Nel browser sono accettati `File`, `Blob`, `ReadableStream`, testo e byte UTF-8.
In Node/Bun sono accettati anche stream/iterabili asincroni; con un ReadStream
Node l'estensione si ricava da `path`. Una stringa è contenuto, non un percorso:
per un file Node usare `createReadStream(path)`. `format` prevale sull'estensione;
le estensioni non distinguono maiuscole/minuscole, i nomi di formato sono minuscoli.

- CSV: prima riga come intestazioni, separatore virgola, quoting e doppi apici
  secondo il lettore Python standard. Celle vuote e mancanti diventano `null`;
  gli spazi nei campi testuali rimangono. Non sono introdotti sniffing del
  separatore, rimappatura dei nomi o opzioni aggiuntive assenti nel riferimento.
- JSON: array di record. Il lettore incrementale segue anche la permissività
  dell'attuale Python per separatori e testo dopo la chiusura dell'array.
- TYTX: un oggetto TYTX JSON per riga, con suffisso `::JS`; righe vuote ignorate.
  Si riutilizza `@genrojs/tytx`, già presente nell'ecosistema Genro/Gramlot.
  XML e MessagePack non sono formati di questo importatore di file testuali.

Il contenuto viene letto incrementalmente, inserendo blocchi di **1.000 record**
come Python. Non è necessario caricare tutto il file in memoria. Le liste ricevute
come oggetti JS sono già in memoria. Si restituisce il numero di record per un
file, il record/lista modificato per le altre sorgenti. I record di un blocco sono
compilati prima dell'esecuzione; il SQL conserva l'ordine Python e non usa RETURNING
per le liste. L'adapter JS esegue i singoli INSERT nello stesso ordine e nella
stessa transazione; non richiede un metodo nativo `executemany`.

## Tipi, chiavi e adattamento

Per i file, `adapt` è attivo per default, anche per TYTX. Le stringhe vengono
convertite secondo il tipo della colonna; valori già tipizzati restano tali.
Sono verificati interi, booleani (yes/no, y/n, true/false, 1/0), decimali, date e
orari ISO. Una stringa vuota in una colonna tipizzata diventa `null`; il JSON
conserva invece la stringa vuota per le colonne testuali. Una colonna sconosciuta
è un errore. `adapt: false` disabilita l'adattamento, come Python.

Il passaggio a SQLite conserva il testo dei decimali e le date civili, inclusi
offset e microsecondi dei timestamp: non passa questi valori attraverso Number
o una normalizzazione UTC. SQLite mantiene comunque le proprie regole di affinità
numerica, quindi una colonna NUMERIC non offre precisione decimale arbitraria.
Restano limiti JS espliciti: interi oltre l'intervallo sicuro e float non finiti
non sono accettati; date ISO settimanali e offset orari con secondi non sono ancora
portati. Bag/oggetti annidati non hanno ancora un codec di importazione applicativo.

Le chiavi mancanti seguono `checkPkey`: le chiavi intere avanzano nel blocco,
quelle con default SQL restano al database. Gli INSERT omettono i null come Python,
lasciando agire i default SQL; i default applicativi e gli hook non vengono eseguiti.

Per specializzare `adaptRecord`, registrare il metodo nel runtime:

```js
const queries = model.queries(adapter, {hooks: {
    'app.product': {
        adaptRecord(record) {
            record = this.adaptRecord(record); // adattamento standard del modello
            record.name = record.name.toUpperCase();
            return record;
        },
    },
}});
```

Il contesto espone `db`, `model`, `fullname` e l'adattamento standard.
Con `adapt: false` il metodo non viene chiamato. Gli errori di adattamento
indicano tabella, numero del record (a partire da 1) e colonna.

## Transazioni e browser serverless

Una chiamata autonoma apre una transazione atomica. Dentro `queries.transaction`
usare la tabella del contesto `tx`; l'import partecipa alla transazione esistente.
Un errore di parsing, conversione o vincolo annulla anche i blocchi già inseriti.
Una transazione resta fallita anche se l'applicazione intercetta l'errore al suo
interno. Python lascia commit/rollback al chiamante: l'oracolo usa lo stesso
confine di transazione adottato dall'API JS.

Il playground Gramlot serverless offre la scelta di un file locale nella pagina
Query. Il File passa al worker SQLite, senza backend e senza invio a servizi
esterni. È necessario applicare prima la migrazione del modello e indicare la
tabella di destinazione. I dati sono salvati su IndexedDB. La cache offline degli
asset per riaprire l'intera app senza rete rimane un lavoro separato.

## Verifiche

49 scenari confrontano dichiarazioni indipendenti Python/JS: source TYTX,
JSON migrate, SQL e parametri degli INSERT, risultati, default, chiavi, assenza di
trigger e rollback. Il corpus include oltre 1.000 record per ciascun formato e
un errore dopo il primo blocco. Il browser riesegue gli stessi scenari e riapre
IndexedDB; ulteriori test caricano file reali dal selettore Gramlot e rileggono i
dati dopo reload. I test JS coprono anche confini UTF-8/record tra chunk, annullamento
dello stream e fallimento intercettato dentro una transazione.

`scripts/import_oracle.py` rigenera il riferimento senza modificare Python;
`scripts/verify_python.py` confronta anche questi casi dal vivo in Node e Bun.
