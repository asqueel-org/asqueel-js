"""Entirely fictional people and printable, self-contained HTML attachments."""
from html import escape


def people():
    names=['Anna Rossi','Luca Bianchi','Marta Verdi','Paolo Neri','Elena Conti','Marco Gallo',
           'Giulia Fontana','Davide Riva','Sara Moretti','Andrea Costa','Chiara Romano','Matteo Greco',
           'Francesca Villa','Alessandro Sala','Laura Marchetti','Stefano Ricci','Valentina Fabbri','Simone Colombo',
           'Federica De Luca','Roberto Ferretti','Silvia Martini','Giorgio Galli','Paola Lombardi','Enrico Barbieri']
    weights=[65,55,50,45,40,35,60,50,45,40,35,30,55,45,40,35,30,25,50,45,40,35,30,20]
    assert sum(weights)==1000
    delegates={'p22':'p21','p23':'p21','p24':'p20'}
    return [dict(id=f'p{i+1}',name=n,weight=weights[i],unit=f'{"ABCD"[i//6]}{i%6+1:02}',
                 email=f'unita{i+1:02}@residenti.example.test',called=f'p{i+1}' in delegates,present=False,delegate_id=delegates.get(f'p{i+1}')) for i,n in enumerate(names)]


def documents():
    offers=[
        ('d1','a1','Bilancio preventivo 2027','Studio Tiglio · amministrazione demo',[('Pulizie e aree comuni',720000),('Energia elettrica',480000),('Manutenzione ordinaria',620000),('Assicurazione fabbricato',185000),('Fondo imprevisti',395000)]),
        ('d2','a2','Cortile · proposta VerdeChiaro','VerdeChiaro · impresa immaginaria',[('Pulizia e preparazione superfici',150000),('Ripristino pavimentazione',140000),('Fioriere e messa a dimora',70000),('Oneri esemplificativi',72000)]),
        ('d3','a2','Cortile · proposta CorteFutura','CorteFutura · impresa immaginaria',[('Preparazione e smaltimento',160000),('Pavimentazione antiscivolo',180000),('Sistemazione aiuole',65000),('Oneri esemplificativi',81000)]),
        ('d4','a4','Copertura fabbricato · proposta annuale','RiparoSereno · compagnia immaginaria',[('Copertura annua dimostrativa',185000)]),
        ('d5','a5','Illuminazione LED · proposta Lume','Lume · installatore immaginario',[('24 corpi illuminanti LED',144000),('Installazione e sensori',96000),('Oneri esemplificativi',48000)]),
    ]
    euro=lambda cents:f'{cents/100:,.2f}'.replace(',','X').replace('.',',').replace('X','.')+' €'
    result=[]
    for key,agenda,title,supplier,lines in offers:
        total=sum(v for _,v in lines)
        rows=''.join(f'<tr><td>{escape(label)}</td><td>{euro(value)}</td></tr>' for label,value in lines)
        content=f'''<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)}</title>
<style>body{{font:15px/1.65 system-ui,sans-serif;color:#20344c;background:#fff;max-width:760px;margin:auto;padding:30px}}header{{border-bottom:3px solid #456bc4;padding-bottom:18px}}small{{letter-spacing:.08em;color:#526477}}h1{{font-size:25px;line-height:1.3}}table{{width:100%;border-collapse:collapse;margin:25px 0}}td{{padding:10px 4px;border-bottom:1px solid #d5dce5}}td:last-child{{text-align:right;white-space:nowrap}}.total{{font-size:21px;text-align:right;font-weight:bold}}.note{{background:#edf1f7;padding:15px;border-radius:6px}}footer{{border-top:1px solid #d5dce5;margin-top:30px;font-size:12px}}@media print{{body{{padding:0}}}}</style>
<header><small>DOCUMENTO DI FANTASIA · DEMO GRAMLOT</small><h1>{escape(title)}</h1><div>{escape(supplier)}</div></header>
<p><b>Destinatario:</b> Residenza dei Tigli, complesso dimostrativo · 24 unità<br><b>Riferimento:</b> DEMO-2027-{key.upper()}</p>
<table><thead><tr><td><b>Descrizione</b></td><td><b>Importo</b></td></tr></thead><tbody>{rows}</tbody></table><p class="total">Totale {euro(total)}</p>
<div class="note">Materiale preparatorio per la discussione assembleare. Confrontare ambito dei lavori, tempi e importi prima di verbalizzare la proposta.</div>
<p>Tempi indicativi: 20 giorni dalla conferma. Condizioni dimostrative: acconto 30%, saldo alla conclusione. Nessun fornitore, indirizzo o offerta rappresenta un soggetto reale.</p>
<footer>Documento sintetico di fantasia, privo di validità commerciale. Importi esclusivamente dimostrativi. Disponibile integralmente senza rete.</footer></html>'''
        result.append(dict(id=key,agenda_id=agenda,title=title,supplier=supplier,total_cents=total,filename=f'{key}-preventivo-demo.html',mime='text/html',content=content))
    return result
