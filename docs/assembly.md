# Demo assemblea offline

Pagina Gramlot autonoma, costruita con l'esportatore serverless ufficiale a directory e raccolta in un unico HTML. Il modello
è dichiarato in Python ed esportato come SourceBag TYTX: l'app crea SQLite nel browser,
usa le formule del modello per la rappresentanza e aggrega i voti tramite il compiler.
Il worker e il WASM sono incorporati nell'HTML; non serve un server o un primo avvio online.

```sh
npm run build:assembly
# Aprire output/assemblea-offline.html con file://.
```

## Prova manuale

1. Nella scheda **Costituzione**, registrare l'ingresso di Anna Rossi, Luca Bianchi e Marta Verdi.
2. Assegnare Paolo Neri in delega ad Anna: 3 presenti, 4 rappresentati, 215 millesimi.
3. In **Ordine del giorno**, aprire «Bilancio preventivo»: lo stack **Lavori** offre Argomento, Discussione, Votazione e Verbale. Nella discussione premere **＋**, scegliere chi interviene, scrivere e premere **Registra**. Per l’amministratore usare il pulsante dedicato. Poi aprire il voto. Presenze e deleghe sono bloccate fino alla chiusura.
4. Registrare Anna e Paolo favorevoli, Luca contrario, Marta astenuta.
5. Chiudere: 110 favorevoli, 55 contrari, 50 astenuti. Esito positivo secondo la regola demo.
6. Sbloccare, scrivere e salvare il blocco di verbale; **Concludi punto** lo rende non modificabile. Passare al punto successivo. **👥 Partecipanti** apre il drawer da ogni scheda.
7. Chiudere il browser anche durante una votazione; riaprire lo stesso file con lo stesso profilo.
8. «📤 Esporta» scarica modello e record TYTX. «Nuova prova» chiede conferma prima di sostituire il workspace.

## Perimetro

- 24 soggetti dimostrativi, una quota per soggetto, millesimi interi per un totale di 1.000.
- Deleghe dirette da assente a presente; revocabili tra le votazioni. Niente deleghe a sé stessi o catene.
- Un'uscita rende inattive le deleghe a quella persona finché non rientra o vengono riassegnate.
- Una sola votazione aperta. Elenco, rappresentante e peso sono copiati nei record di voto all'apertura.
- Ogni soggetto rappresentato ha una scelta distinta, anche quando vota tramite delega.
- La scelta è correggibile prima della chiusura; tutti i voti devono essere espressi per chiudere.
- Regola puramente dimostrativa: favorevoli strettamente oltre metà dei millesimi rappresentati.
  Non implementa quorum legali, limiti normativi delle deleghe, comproprietà o tabelle speciali.
- Cinque punti iniziali, modificabili ed estendibili: discussione e blocco di verbale sono campi SQLite, inclusi nel trasferimento TYTX. Una votazione per punto; è possibile concludere anche senza voto, ma il verbale non può essere vuoto.
- La discussione raccoglie interventi distinti con autore, testo e orario. Il blocco di verbale conserva il lucchetto: sbloccare 🔒, scrivere e uscire dal campo aggiorna la bozza nella Data Bag; **💾 Salva** aggiorna solo quel campo nel database. Cambiare scheda o punto mantiene le bozze senza salvarle. **Annulla** ricarica il testo salvato; una versione cambiata da un’altra finestra viene segnalata senza sovrascriverla. Prima di concludere il punto o esportare occorre salvare o annullare i testi pendenti; prima di chiudere l’app occorre salvarli.
- Il verbale è suddiviso per punto, modificabile come testo semplice e consultabile in un’anteprima HTML; cinque allegati HTML di fantasia sono salvati in SQLite e scaricabili. Non sono implementati caricamento di altri allegati, autenticazione, firma, PDF o acquisizione automatica nel gestionale.
- Ordine del giorno: aggiunta di punti, modifica del titolo e riordino tramite drag-and-drop nativo Gramlot. Un titolo già votato o concluso resta bloccato; il riordino è sospeso durante una votazione aperta. Non è prevista l’eliminazione.
- Il lucchetto abilita la modifica dell’ordine del giorno. Il focus-out aggiorna i titoli nella Data Bag; aggiunte e riordino restano anch’essi in bozza. **Salva cambiamenti** si abilita quando la bozza differisce dai dati salvati e conserva tutto in un’unica transazione SQLite/IndexedDB. **Annulla** scarta la bozza e ricarica. Bloccare di nuovo non scarta né salva. Prima dell’export occorre salvare o annullare; chiudendo con modifiche pendenti il browser segnala il rischio di perderle.
- Per spostare un punto, trascinare ⠿ sulla posizione desiderata. In alternativa, selezionare la maniglia del punto e poi quella di destinazione, anche da tastiera: non dipende dal supporto touch del drag-and-drop.
- Il salvataggio verifica che titoli e ordine di partenza non siano stati cambiati da un’altra finestra. Le note e le votazioni indipendenti restano intatte; le protezioni sui punti votati sono ricontrollate nella transazione.
- Le azioni applicative sono transazioni; l'apertura fallita non lascia testata o voti parziali.

Il database è in IndexedDB, non dentro il file HTML. Il percorso seleziona il workspace.
Il server deve acquisire lo snapshot secondo le regole dell'applicazione; nessuna sincronizzazione automatica.

## Confronto indipendente con Python

```sh
.reference/venv-current/bin/python scripts/assembly_oracle.py
node --test test/assembly.test.js
bun test test/assembly.test.js
npm run test:assembly
.reference/venv-current/bin/python scripts/assembly_oracle.py \
  --verify-return output/assembly-browser-return.json
```

Il riferimento usa il Python 0.6.1 fissato dal progetto. Le regole sono implementate
separatamente in Python e JavaScript; modello e richieste dichiarative di lettura
viaggiano dal riferimento. Si confrontano source TYTX, migrate, catalogo SQLite,
SQL, parametri, record, conteggi ed errori per 86 azioni. La sequenza contiene
votazioni approvate e respinte, revoche, ingressi/uscite, discussioni, blocchi di verbale e una votazione lasciata aperta.
Un test di aggiornamento conserva i dati del vecchio modello e verifica il recupero dopo DDL già eseguito. Altri test simulano errori di storage durante l’apertura del voto e durante il salvataggio multiplo dell’ordine del giorno, verificando il rollback integrale. Il browser verifica anche lucchetto, focus-out, drag-and-drop, riordino da tastiera, bozze obsolete e riapertura offline.

Il test Chromium usa i controlli Gramlot per le operazioni valide e il normale confine
applicativo per tentativi invalidi impediti dall'interfaccia e per le vecchie annotazioni generali, conservate per compatibilità ma non più modificabili nell’elenco interventi. Parte con rete disabilitata,
riavvia completamente il browser, rilegge la votazione parziale ed esporta un vero file.
Python reimporta quel file e ricalcola i risultati. Il verificatore confronta la sequenza
fissa di test: modifiche arbitrarie dell'utente richiedono un confronto applicativo diverso.
Questa pagina non è ancora qualificata su Safari o tablet fisici.

## Componenti Gramlot e HTML singolo

TabContainer, StackContainer e BorderContainer con drawer sono quelli della collection
`layout`, con binding alla Data Bag. Gli elenchi sono righe flex compatte, senza simulare
un componente grid ancora non disponibile. Il profilo è **Mimi**, caricato dopo Base e Compact. L’HTML usa `data-theme="dark"`: la modalità predefinita è scura, indipendentemente dalle preferenze del sistema.

L’export usa Gramlot 0.3.9 e gramlot-serverless 0.2.16: `buildDirectory()` con
le collection `layout` ed `editors` (per l’anteprima), poi incorpora script, CSS e
licenze nel singolo HTML. Discussione e verbale usano normali `textarea`:
non istanziano Jodit e non richiedono più gli adattamenti per flush o placeholder.
La CSP consente script con hash e worker/moduli Blob; il test parte già offline e
verifica che non ci siano richieste esterne. Le anteprime conservano gli iframe sandbox.

## Interventi per punto: autore, testo e orario

**Lavori → Discussione** mostra l’elenco degli interventi del punto. Non c’è più
l’area di discussione generale con lucchetto e dettatura. **＋** apre il modulo
«Chi interviene?» con la scelta del partecipante; **👤 Amministratore** apre direttamente
un intervento attribuito all’amministratore, senza aggiungerlo ai votanti o ai millesimi.

Ogni registrazione conserva autore, testo e istante di apertura del modulo, ottenuto
dall’orologio del dispositivo. L’istante viene salvato come ISO UTC e mostrato nella
zona oraria del dispositivo, con data e secondi. **Registra** salva subito offline;
**Annulla** scarta la bozza. Cambiare punto mantiene la bozza nella Bag, mentre export
e conclusione chiedono prima di registrarla o annullarla. Prima di chiudere l’app
occorre registrarla: le bozze non sono ancora nel database.

I singoli interventi restano consultabili anche dopo averli riportati nel verbale.
Usare **📥** sulla riga oppure **📥 Al verbale** per tutti quelli non ancora
riportati: il comando apre direttamente il verbale come bozza modificabile. Il testo si aggiunge
alla bozza esistente con nome e numero; non sostituisce quanto già scritto.
**💾 Salva** conserva il verbale e marca insieme gli interventi riportati.
**Annulla** nel verbale scarta gli inserimenti pendenti e li rende nuovamente disponibili.
La marca registra l’inserimento salvato, non segue successive modifiche manuali al testo.
Le registrazioni originali non si modificano o eliminano; la sintesi si rifinisce nel verbale.

Gli aggiornamenti aggiungono `assembly.intervention.recorded_at` senza riscrivere
le registrazioni precedenti. Un vecchio intervento senza timestamp mostra «Orario non
disponibile»: non viene inventata una data. Le vecchie annotazioni generali restano
consultabili se non coincidono già con un intervento. L’amministratore ha `person_id`
nullo e autore esplicito. Il confronto indipendente Python include struttura, SQL,
record, timestamp, amministratore, errori di orario e dati esportati dopo il riavvio.

## Comandi fissi e blocco di verbale

Discussione e Verbale usano la stessa disposizione: titolo e stato in alto,
strumenti a sinistra, **Annulla** e **Registra/Salva** a destra. La barra rimane
fuori dal contenuto scorrevole; i pulsanti restano nello stesso posto anche quando
sono disabilitati. La navigazione alla fase successiva resta nella barra inferiore.
Su schermi stretti gli strumenti e il salvataggio occupano due righe fisse.

La Discussione non ha un lucchetto: **＋ Intervento** e **👤 Amministratore** aprono
una nuova registrazione; gli interventi già registrati sono consultabili. Finché
c’è una bozza, occorre registrarla o annullarla prima di iniziarne un’altra.

In **Lavori → Verbale**, **🔒 Modifica / 🔓 Blocca** è l’unico comando che protegge
l’area di testo. Il focus-out aggiorna la bozza nella Bag; **💾 Salva** conserva il
testo semplice in SQLite e IndexedDB. Bloccare di nuovo non salva né scarta la bozza.
Non ci sono pulsanti, selettori o servizi di dettatura nell’app.

I testi precedentemente salvati in HTML vengono mostrati senza tag, mantenendo le
interruzioni di riga. Se non si modificano, il valore HTML originale resta intatto;
dopo una modifica e il salvataggio viene sostituito dal testo semplice.
L’anteprima del verbale resta un documento HTML impaginato; non è un editor.

Le prove browser verificano comandi fissi durante lo scorrimento a 1280 e 390 pixel,
assenza della dettatura, importazione nella bozza senza salvataggio implicito,
conservazione dei vecchi testi HTML e riapertura offline. Dati, calcoli, SQL ed export
restano confrontati con il riferimento Python.

Il workspace precedente viene aggiornato aggiungendo campi per unità/appello e la
tabella documenti. Se non è ancora stato utilizzato, riceve il dataset completo da
24 partecipanti. Se contiene presenze, deleghe, voti o note, persone e millesimi
originali restano invariati; la nuova demo si carica con **Nuova prova**, dopo avere
esportato il lavoro da conservare. Non si ricalcolano i voti già registrati.

## Appello e allegati

Sia l’appello sia il drawer mostrano un LED: verde per il presente, rosso per chi
non è presente, arancione per chi ha delegato. Il testo resta visibile: «Da appellare»
non viene confuso con un’assenza già confermata e una delega a persona assente
resta segnalata. I LED seguono lo stato salvato, non una scelta di delega ancora da confermare.

L’elenco usa righe flex compatte, intestazione fissa, ricerca per nome/unità e filtri
Tutti, Da appellare, Presenti, Assenti e Con delega. **✓** registra la presenza;
**−** marca l’assenza all’appello; **↗** registra l’uscita. Per la delega, registrare prima il destinatario come presente, poi sceglierlo nella riga dell’assente e premere **✓ Conferma**. Il pulsante si abilita quando la scelta cambia; nella riga di un presente la delega è disabilitata. Scegliere Nessuna e confermare con **✓ Conferma** la revoca.

In **Lavori → Votazione**, aprire il voto dopo aver verificato presenze e deleghe. Chi conduce la riunione registra Sì, No o Astenuto per ogni soggetto rappresentato; ogni scelta è salvata subito. Le righe sono raggruppate sotto **Vota [nome]**, prima il voto personale e poi le deleghe. Ogni gruppo mostra numero di soggetti, deleghe, millesimi totali e avanzamento; ogni riga **Per [nome]** mantiene scelta e peso distinti. Lo stesso delegato può esprimere scelte diverse per soggetti diversi. Gruppi e pesi provengono dai record fissati all’apertura, anche consultando votazioni precedenti dopo una revoca o un’uscita. La query SQL aggregata `voter_groups` viene confrontata con Python per tutte le 86 operazioni, insieme alle scelte mostrate nel browser. Il contatore mostra i voti mancanti e **Chiudi voto** si abilita solo dopo averli registrati tutti. Dopo la chiusura si passa al blocco di verbale.

Le deleghe iniziali p22 → p21, p23 → p21 e p24 → p20 sono già raccolte, ma diventano
rappresentanza effettiva soltanto quando il delegato entra. Tutti i nomi e i recapiti
sono di fantasia; gli indirizzi usano il dominio riservato `example.test`.

La scheda **Documenti** e la vista Argomento danno accesso a un bilancio, due
preventivi alternativi per il cortile, una proposta di copertura del fabbricato e
un preventivo LED. Sono HTML autonomi, senza script né risorse esterne, visualizzati
in iframe sandbox e scaricabili. Contenuti, metadati e collegamenti ai punti sono
record SQLite trasferiti in TYTX, confrontati con Python anche dopo il riavvio.


## Sorgenti

- `scripts/assembly_oracle.py`: modello e regole Python, generazione riferimenti e verifica ritorno.
- `examples/assembly-seed.json`: pacchetto iniziale e letture dichiarative generate da Python.
- `browser/assembly-domain.js`: regole applicative JS e query tramite Asqueel-JS.
- `browser/assembly.js`, `browser/assembly.css`: pagina e Logic Gramlot.
- `browser/assembly-worker.js`: esecuzione locale, persistenza condivisa con il PoC di trasferimento.
- `test/assembly-actions.json`: scenario comune; `test/fixtures/assembly.json`: risultati Python.

- `browser/assembly-upgrade.js`: aggiornamento dei salvataggi precedenti.
- `scripts/build_assembly_html.js`: confezionamento del file singolo con collection layout.

- `scripts/assembly_demo.py`: 24 nominativi, millesimi e cinque documenti fittizi.
- `browser/assembly-views.js`: elenchi dinamici costruiti attraverso Source Gramlot.
