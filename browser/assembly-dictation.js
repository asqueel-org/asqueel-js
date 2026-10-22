/** Browser-owned speech service: explicit user start; never fall back from local to remote. */
export class Dictation {
    constructor({window,onText,onStatus,onActive}){Object.assign(this,{window,onText,onStatus,onActive});this.token=0;}
    supported(){return !!(this.window.SpeechRecognition||this.window.webkitSpeechRecognition);}
    async start(mode='local'){
        this.stop();const token=++this.token,API=this.window.SpeechRecognition||this.window.webkitSpeechRecognition;
        if(!API){this.onStatus('Dettatura non disponibile in questo browser. Puoi usare la dettatura della tastiera del dispositivo.');return;}
        // Chromium's experimental local service can crash on opaque file origins.
        // Do not probe it there; preserve the standalone app and its unsaved work.
        if(mode==='local'&&this.window.location?.protocol==='file:'){this.onStatus('Dettatura locale non abilitata da file HTML. Usa la dettatura della tastiera del dispositivo oppure scegli esplicitamente il servizio online.');return;}
        const recognition=new API();this.recognition=recognition;this.onActive(true);
        try{
            if(mode==='local'){
                if(!('processLocally' in recognition)||typeof API.available!=='function')throw Error('Questo browser non espone la dettatura locale. Usa la dettatura del dispositivo o seleziona esplicitamente il servizio online.');
                this.onStatus('Verifica dell’italiano sul dispositivo…');
                const availability=await API.available({langs:['it-IT'],processLocally:true});
                if(token!==this.token)return;
                if(availability!=='available')throw Error('Pacchetto italiano locale non pronto ('+availability+'). Prepara la lingua nelle impostazioni del browser oppure usa la dettatura del dispositivo.');
                recognition.processLocally=true;
            }else if(mode==='online'){
                if(!this.window.navigator.onLine)throw Error('Il servizio di dettatura online richiede una connessione.');
                if('processLocally' in recognition)recognition.processLocally=false;
            }else throw Error('Modalità di dettatura non valida.');
            recognition.lang='it-IT';recognition.continuous=true;recognition.interimResults=true;
            recognition.onresult=event=>{
                if(token!==this.token)return;
                let interim='';
                for(let i=event.resultIndex;i<event.results.length;i++){
                    const text=event.results[i][0].transcript.trim();
                    if(event.results[i].isFinal){if(text)this.onText(text);}else interim+=text+' ';
                }
                this.onStatus(interim?'Sto ascoltando: '+interim:'In ascolto · italiano. Premi Ferma quando hai finito.');
            };
            recognition.onerror=event=>{
                if(token!==this.token)return;
                const errors={'not-allowed':'Accesso al microfono negato. Controlla i permessi del browser.','audio-capture':'Microfono non disponibile.','network':'Servizio vocale non raggiungibile.','no-speech':'Nessuna voce rilevata. Puoi riprovare.','language-not-supported':'Italiano non disponibile nel servizio selezionato.'};
                this.stop();this.onStatus(errors[event.error]??'Dettatura interrotta: '+event.error);
            };
            recognition.onend=()=>{if(token!==this.token)return;++this.token;this.recognition=null;this.onActive(false);this.onStatus('Dettatura terminata. Rivedi il testo e salva i cambiamenti.');};
            recognition.start();this.onStatus('In ascolto · italiano. Premi Ferma quando hai finito.');
        }catch(error){if(token!==this.token)return;this.stop();this.onStatus(error.message);}
    }
    stop(){++this.token;const previous=this.recognition;this.recognition=null;if(previous){try{previous.abort();}catch{}this.onStatus('Dettatura fermata. Rivedi il testo e salva i cambiamenti.');}this.onActive(false);}
}
