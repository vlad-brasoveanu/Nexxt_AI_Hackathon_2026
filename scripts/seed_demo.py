"""Render realistic synthetic Romanian SME onboarding PDFs and load them into the live API.

All companies, people and identifiers are fictional (CUI/CNP checksums are valid only so the
documents look plausible). Every page is marked as synthetic. Requires Google Chrome for PDF rendering.

    .venv/bin/python scripts/seed_demo.py              # render PDFs + seed cases
    .venv/bin/python scripts/seed_demo.py --render-only
"""
import argparse
import html
import json
import os
import subprocess
import tempfile
import unicodedata
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "fixtures" / "demo_pdfs"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
EVALUATION_DATE = "2026-10-28"
BANK = "Banca Demo S.A."
SYNTHETIC = "DOCUMENT SINTETIC — FĂRĂ VALOARE JURIDICĂ · date fictive generate pentru demonstrație"


def cui(base: str) -> str:
    """Append the Romanian CUI control digit to a fictional base number."""
    key = "753217532"[-len(base):]
    check = sum(int(a) * int(b) for a, b in zip(base, key)) * 10 % 11
    return base + str(0 if check == 10 else check)


def cnp(base12: str) -> str:
    """Append the Romanian CNP control digit to a fictional 12-digit base."""
    check = sum(int(a) * int(b) for a, b in zip(base12, "279146358279")) % 11
    return base12 + str(1 if check == 10 else check)


# --- Fictional companies and scenarios ---------------------------------------------------------

COMPANIES = [
    dict(slug="brutaria-valea-muresului", scenario="Dosar complet", expected="READY_FOR_REVIEW",
         name="Brutăria Valea Mureșului SRL", cui=cui("4381726"), orc="J26/1184/2019", euid="ROONRC.J26/1184/2019",
         address="Str. Gheorghe Doja nr. 212, Târgu Mureș, jud. Mureș, 540185", caen="1071", caen_text="Fabricarea pâinii; fabricarea prăjiturilor și a produselor proaspete de patiserie",
         founded="2019-06-11", capital="45.000", employees=23, turnover="4.850.000",
         extract_date="2026-10-14", phone="0265 214 778", email="contabilitate@brutaria-vm.ro",
         people=[dict(name="Ioana-Maria Pop", role="Administrator", cnp=cnp("287031426201"), series="MS 482913",
                      birth="1987-03-14", place="Târgu Mureș", address="Str. Rozelor nr. 9, ap. 4, Târgu Mureș, jud. Mureș",
                      issued="2021-08-12", expiry="2031-03-14", issuer="SPCLEP Târgu Mureș", share=60),
                 dict(name="Andrei Pop", role="Asociat", share=40)],
         products=["Cont curent RON", "Cont curent EUR", "Internet & mobile banking", "Card de debit business (2)", "Încasări POS"],
         funds="Venituri din vânzarea produselor de panificație către magazine și HoReCa"),
    dict(slug="nordic-timber-solutions", scenario="CUI diferit între cerere și extras", expected="ESCALATED",
         name="Nordic Timber Solutions SRL", cui=cui("4518273"), application_cui_typo=True, orc="J33/672/2020", euid="ROONRC.J33/672/2020",
         address="Calea Unirii nr. 87, Suceava, jud. Suceava, 720043", caen="1610", caen_text="Tăierea și rindeluirea lemnului",
         founded="2020-02-27", capital="200.000", employees=41, turnover="12.300.000",
         extract_date="2026-10-02", phone="0230 528 116", email="office@nordictimber.ro",
         people=[dict(name="Mihai-Cătălin Ursu", role="Administrator", cnp=cnp("182110433002"), series="SV 731046",
                      birth="1982-11-04", place="Rădăuți", address="Str. Ștefan cel Mare nr. 41, Rădăuți, jud. Suceava",
                      issued="2022-05-19", expiry="2032-11-04", issuer="SPCLEP Rădăuți", share=70),
                 dict(name="Erik Lindqvist", role="Asociat", share=30)],
         products=["Cont curent RON", "Cont curent EUR", "Internet & mobile banking", "Scrisori de garanție bancară"],
         funds="Export cherestea către clienți din Austria și Suedia"),
    dict(slug="clinica-zambet-sanatos", scenario="Act de identitate expirat", expected="ESCALATED",
         name="Clinica Dentară Zâmbet Sănătos SRL", cui=cui("3962814"), orc="J12/3341/2018", euid="ROONRC.J12/3341/2018",
         address="Str. Observatorului nr. 118, et. 1, Cluj-Napoca, jud. Cluj, 400363", caen="8623", caen_text="Activități de asistență stomatologică",
         founded="2018-09-03", capital="10.000", employees=12, turnover="2.140.000",
         extract_date="2026-10-20", phone="0364 401 225", email="receptie@zambetsanatos.ro",
         people=[dict(name="Dr. Raluca-Elena Moldovan", role="Administrator", cnp=cnp("279070312004"), series="CJ 296451",
                      birth="1979-07-03", place="Cluj-Napoca", address="Str. Fabricii nr. 22, ap. 15, Cluj-Napoca, jud. Cluj",
                      issued="2016-07-03", expiry="2026-07-03", issuer="SPCLEP Cluj-Napoca", share=100)],
         products=["Cont curent RON", "Internet & mobile banking", "Încasări POS", "Card de credit business"],
         funds="Încasări din servicii stomatologice, decontări CAS Cluj"),
    dict(slug="agrovest-baragan", scenario="Extras ONRC mai vechi de 90 de zile", expected="ESCALATED",
         name="AgroVest Câmpia Bărăganului SRL", cui=cui("3710593"), orc="J21/215/2017", euid="ROONRC.J21/215/2017",
         address="Șos. București nr. 5, Slobozia, jud. Ialomița, 920082", caen="0111", caen_text="Cultivarea cerealelor (exclusiv orez), plantelor leguminoase și a plantelor producătoare de semințe oleaginoase",
         founded="2017-03-21", capital="350.000", employees=18, turnover="9.600.000",
         extract_date="2026-05-12", phone="0243 230 917", email="agrovest.baragan@gmail.com",
         people=[dict(name="Gheorghe Dumitrescu", role="Administrator", cnp=cnp("170042121003"), series="SZ 118724",
                      birth="1970-04-21", place="Slobozia", address="Str. Viitorului nr. 14, Slobozia, jud. Ialomița",
                      issued="2020-04-21", expiry="2030-04-21", issuer="SPCLEP Slobozia", share=55),
                 dict(name="Elena Dumitrescu", role="Asociat", share=45)],
         products=["Cont curent RON", "Linie de credit capital de lucru", "Internet & mobile banking"],
         funds="Vânzare cereale către colectori și subvenții APIA"),
    dict(slug="codeforge-digital", scenario="Dosar complet cu beneficiari reali și împuternicit", expected="READY_FOR_REVIEW",
         name="Codeforge Digital SRL", cui=cui("4627018"), orc="J40/18342/2021", euid="ROONRC.J40/18342/2021",
         address="Bd. Dimitrie Pompeiu nr. 6A, et. 3, Sector 2, București, 020337", caen="6201", caen_text="Activități de realizare a soft-ului la comandă (software orientat client)",
         founded="2021-11-08", capital="1.000", employees=34, turnover="7.900.000",
         extract_date="2026-09-29", phone="0726 418 902", email="finance@codeforge.ro",
         people=[dict(name="Vlad-Ștefan Ionescu", role="Administrator", cnp=cnp("191052240019"), series="RX 905317",
                      birth="1991-05-22", place="București", address="Str. Avrig nr. 31, ap. 12, Sector 2, București",
                      issued="2023-02-10", expiry="2033-05-22", issuer="DEPABD București", share=50),
                 dict(name="Ana-Maria Georgescu", role="Asociat", share=50, cnp=cnp("294090140027"), series="RT 448210",
                      birth="1994-09-01", place="Brașov", address="Str. Lizeanu nr. 18, Sector 2, București",
                      issued="2024-01-15", expiry="2034-09-01", issuer="DEPABD București", identity=True)],
         mandate=dict(name="Cristina Radu", cnp=cnp("288121240031"), series="RD 612094", role="Director financiar"),
         products=["Cont curent RON", "Cont curent EUR", "Cont curent USD", "Internet & mobile banking", "Carduri business (5)", "Depozit overnight"],
         funds="Venituri din contracte de dezvoltare software cu clienți din UE și SUA"),
    dict(slug="transport-rapid-dunarea", scenario="Lipsește actul de identitate", expected="NEEDS_INFORMATION",
         name="Transport Rapid Dunărea SRL", cui=cui("4105526"), orc="J17/905/2019", euid="ROONRC.J17/905/2019",
         address="Str. Brăilei nr. 154, Galați, jud. Galați, 800310", caen="4941", caen_text="Transporturi rutiere de mărfuri",
         founded="2019-08-30", capital="25.000", employees=27, turnover="6.450.000",
         extract_date="2026-10-21", phone="0236 460 312", email="dispecerat@transportrapid.ro", skip_identity=True,
         people=[dict(name="Costel Bălan", role="Administrator", share=100)],
         products=["Cont curent RON", "Cont curent EUR", "Leasing financiar (prin parteneri)", "Carduri combustibil"],
         funds="Servicii de transport intern și internațional de mărfuri"),
    dict(slug="ceramica-horezu", scenario="Dosar complet, doi administratori", expected="READY_FOR_REVIEW",
         name="Atelier Ceramica Horezu SRL", cui=cui("3841267"), orc="J38/402/2018", euid="ROONRC.J38/402/2018",
         address="Str. Olarilor nr. 3, Horezu, jud. Vâlcea, 245800", caen="2341", caen_text="Fabricarea articolelor ceramice pentru uz gospodăresc și ornamental",
         founded="2018-04-17", capital="5.000", employees=6, turnover="780.000",
         extract_date="2026-08-26", phone="0750 112 604", email="comenzi@ceramicahorezu.ro",
         people=[dict(name="Nicolae Vlăduțu", role="Administrator", cnp=cnp("165081538002"), series="VX 207731",
                      birth="1965-08-15", place="Horezu", address="Str. Olarilor nr. 3, Horezu, jud. Vâlcea",
                      issued="2019-08-15", expiry="2029-08-15", issuer="SPCLEP Horezu", share=50),
                 dict(name="Maria Vlăduțu", role="Administrator", cnp=cnp("268112038005"), series="VX 207732",
                      birth="1968-11-20", place="Horezu", address="Str. Olarilor nr. 3, Horezu, jud. Vâlcea",
                      issued="2018-11-20", expiry="2028-11-20", issuer="SPCLEP Horezu", share=50, identity=True)],
         products=["Cont curent RON", "Internet & mobile banking", "Încasări online (e-commerce)"],
         funds="Vânzări de ceramică tradițională în atelier, târguri și magazin online"),
    dict(slug="pensiunea-cetatea", scenario="Act expirat și extras vechi", expected="ESCALATED",
         name="Pensiunea Cetatea de Pădure SRL", cui=cui("3519840"), orc="J08/1520/2016", euid="ROONRC.J08/1520/2016",
         address="Str. Principală nr. 287, Bran, jud. Brașov, 507025", caen="5520", caen_text="Facilități de cazare pentru vacanțe și perioade de scurtă durată",
         founded="2016-05-09", capital="200", employees=9, turnover="1.320.000",
         extract_date="2026-04-30", phone="0744 590 381", email="rezervari@cetateadepadure.ro",
         people=[dict(name="Florin Neagu", role="Administrator", cnp=cnp("176030208009"), series="BV 554219",
                      birth="1976-03-02", place="Brașov", address="Str. Principală nr. 287, Bran, jud. Brașov",
                      issued="2016-03-02", expiry="2026-03-02", issuer="SPCLEP Bran", share=100)],
         products=["Cont curent RON", "Cont curent EUR", "Încasări POS", "Credit investiții (renovare)"],
         funds="Venituri din cazare turistică și servicii de alimentație"),
]


# --- HTML templates ---------------------------------------------------------------------------

CSS = """
@page { size: A4; margin: 16mm 16mm 18mm; }
* { box-sizing: border-box; }
body { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 10pt; color: #1c1c1c; margin: 0;
       font-variant-ligatures: none; font-feature-settings: "liga" 0, "clig" 0; }
.synthetic { border: 1px dashed #b55; color: #a33; font-size: 7.5pt; padding: 3px 6px; margin-bottom: 10px; text-align: center; letter-spacing: .02em; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #222; padding-bottom: 8px; margin-bottom: 14px; }
header .brand { font-size: 15pt; font-weight: 700; letter-spacing: .02em; }
header .brand small { display: block; font-size: 8pt; font-weight: 400; color: #555; letter-spacing: 0; }
header .meta { text-align: right; font-size: 8.5pt; color: #444; line-height: 1.45; }
h1 { font-size: 13pt; margin: 0 0 4px; text-transform: uppercase; letter-spacing: .03em; }
h2 { font-size: 10pt; margin: 16px 0 6px; padding: 4px 6px; background: #efece4; border-left: 3px solid #c9a227; text-transform: uppercase; }
p { margin: 4px 0; line-height: 1.45; }
table { width: 100%; border-collapse: collapse; margin: 4px 0; }
td, th { border: 1px solid #bbb; padding: 4px 6px; vertical-align: top; text-align: left; }
th { background: #f6f4ef; font-weight: 600; width: 34%; }
table.grid th { width: auto; }
.check { font-family: monospace; }
.sign { display: flex; justify-content: space-between; margin-top: 26px; }
.sign div { width: 45%; border-top: 1px solid #555; padding-top: 4px; font-size: 8.5pt; color: #444; }
.small { font-size: 8pt; color: #555; }
.stamp { display: inline-block; border: 2px solid #2b4c7e; color: #2b4c7e; padding: 4px 10px; font-weight: 700; font-size: 8.5pt; transform: rotate(-3deg); margin-top: 10px; }
.idcard { border: 1px solid #889; border-radius: 10px; padding: 12px 14px; background: linear-gradient(135deg, #eef3f8, #f8f4ea); width: 150mm; margin: 8px 0 16px; }
.idcard .top { display: flex; justify-content: space-between; font-size: 8pt; font-weight: 700; color: #2b4c7e; margin-bottom: 8px; }
.idcard .body { display: flex; gap: 12px; }
.photo { width: 30mm; height: 38mm; border: 1px solid #99a; background: repeating-linear-gradient(45deg, #dde, #dde 4px, #eef 4px, #eef 8px); font-size: 7pt; color: #667; display: flex; align-items: center; justify-content: center; text-align: center; }
.idcard dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; font-size: 8.5pt; }
.idcard dt { color: #556; } .idcard dd { margin: 0; font-weight: 600; }
.mrz { font-family: "Courier New", monospace; font-size: 9pt; letter-spacing: .08em; margin-top: 10px; white-space: pre; }
"""


def esc(value) -> str:
    return html.escape(str(value))


def page(title: str, body: str) -> str:
    return f"<!doctype html><html lang='ro'><head><meta charset='utf-8'><title>{esc(title)}</title><style>{CSS}</style></head><body><div class='synthetic'>{SYNTHETIC}</div>{body}</body></html>"


def rows(pairs) -> str:
    return "".join(f"<tr><th>{esc(k)}</th><td>{esc(v)}</td></tr>" for k, v in pairs)


def ro_date(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}.{m}.{y}"


def application(c) -> str:
    admin = c["people"][0]
    shown_cui = c["cui"]
    if c.get("application_cui_typo"):
        shown_cui = shown_cui[:-2] + shown_cui[-1] + shown_cui[-2]
    number = f"CDC-{c['cui'][-5:]}-2026"
    owners = "".join(f"<tr><td>{esc(p['name'])}</td><td>{esc(p['role'])}</td><td>{p.get('share', 0)}%</td><td>Română</td></tr>" for p in c["people"])
    products = "".join(f"<li>☑ {esc(p)}</li>" for p in c["products"])
    body = f"""
<header><div class="brand">{BANK}<small>Divizia IMM · Sucursala {esc(c['address'].split(',')[-2].strip() if 'București' not in c['address'] else 'București')}</small></div>
<div class="meta">Nr. înregistrare: {number}<br>Data: {ro_date('2026-10-23')}<br>Cod formular: F-IMM-01 v4.2</div></header>
<h1>Cerere de deschidere cont și relație de afaceri</h1>
<p class="small">Persoane juridice înregistrate în România · Se completează cu majuscule sau electronic</p>
<h2>1. Date de identificare a societății</h2>
<table>{rows([
    ("Denumire", c['name']),
    ("Cod unic de înregistrare (CUI)", shown_cui),
    ("Nr. înregistrare ORC", c['orc']),
    ("Sediu social", c['address']),
    ("Activitate principală (CAEN)", f"{c['caen']} – {c['caen_text']}"),
    ("Data înființării", ro_date(c['founded'])),
    ("Telefon / e-mail", f"{c['phone']} / {c['email']}"),
])}</table>
<p>company_identifier: {shown_cui}</p>
<h2>2. Reprezentant legal</h2>
<table>{rows([
    ("Nume și prenume", admin['name']),
    ("Calitate", admin['role']),
    ("CNP", admin.get('cnp', '—')),
    ("Act de identitate", f"CI {admin['series']}" if admin.get('series') else "—"),
    ("Persoană expusă politic (PEP)", "NU"),
])}</table>
<h2>3. Structura acționariatului</h2>
<table class="grid"><tr><th>Asociat</th><th>Calitate</th><th>Cotă</th><th>Cetățenie / rezidență</th></tr>{owners}</table>
<h2>4. Profil financiar declarat</h2>
<table>{rows([
    ("Cifra de afaceri ultimul exercițiu (RON)", c['turnover']),
    ("Număr mediu de salariați", c['employees']),
    ("Sursa fondurilor", c['funds']),
    ("Rulaj lunar estimat prin cont (RON)", f"{int(c['turnover'].replace('.', '')) // 12:,}".replace(",", ".")),
    ("Țări cu care se derulează tranzacții", "România, state membre UE"),
])}</table>
<h2>5. Produse și servicii solicitate</h2>
<ul style="list-style:none;padding-left:4px;margin:4px 0">{products}</ul>
<h2>6. Declarații</h2>
<p class="small">Subsemnatul declar pe propria răspundere că datele de mai sus sunt reale și complete, că am luat la cunoștință
Informarea privind prelucrarea datelor cu caracter personal și că voi notifica banca în termen de 30 de zile despre orice modificare.
Declar că societatea nu desfășoară activități supuse sancțiunilor internaționale.</p>
<div class="sign"><div>Semnătura reprezentantului legal<br><b>{esc(admin['name'])}</b></div><div>Ofițer bancar · verificat identitate<br><b>A. Marinescu</b> · marca 10482</div></div>
"""
    return page("Cerere deschidere cont", body)


def extract(c) -> str:
    admins = [p for p in c["people"] if p["role"] == "Administrator"]
    partners = "".join(f"<tr><td>{esc(p['name'])}</td><td>persoană fizică, cetățenie română</td><td>{p.get('share', 0)}%</td></tr>" for p in c["people"])
    reps = "".join(f"<tr><td>{esc(p['name'])}</td><td>Administrator</td><td>nelimitat</td><td>puteri depline, semnătură individuală</td></tr>" for p in admins)
    body = f"""
<header><div class="brand">Oficiul Registrului Comerțului (simulare)<small>de pe lângă Tribunalul {esc(c['address'].split('jud. ')[-1].split(',')[0] if 'jud.' in c['address'] else 'București')}</small></div>
<div class="meta">Nr. certificat: {c['cui'][-4:]}{c['extract_date'][5:7]}/{c['extract_date'][:4]}<br>Cerere nr. {int(c['cui'][-6:]) % 900000 + 100000}</div></header>
<h1>Certificat constatator</h1>
<p class="small">Informații extrase din registrul comerțului la data emiterii · Furnizare informații de bază</p>
<table>{rows([
    ("Denumire", c['name']),
    ("Forma juridică", "Societate cu răspundere limitată"),
    ("Cod unic de înregistrare", c['cui']),
    ("Număr de ordine în registrul comerțului", c['orc']),
    ("EUID", c['euid']),
    ("Data înregistrării", ro_date(c['founded'])),
    ("Sediul social", c['address']),
    ("Capital social subscris și vărsat", f"{c['capital']} RON"),
    ("Stare firmă", "FUNCȚIUNE"),
])}</table>
<p>company_identifier: {c['cui']}</p>
<h2>Asociați</h2>
<table class="grid"><tr><th>Nume</th><th>Calitate</th><th>Cotă la beneficii și pierderi</th></tr>{partners}</table>
<h2>Reprezentanți legali</h2>
<table class="grid"><tr><th>Nume</th><th>Funcție</th><th>Durata mandatului</th><th>Puteri</th></tr>{reps}</table>
<h2>Obiect de activitate</h2>
<p>Activitate principală: <b>{c['caen']}</b> – {esc(c['caen_text'])}</p>
<p>Activități secundare autorizate conform art. 15 din Legea nr. 359/2004: la sediu și în afara sediului.</p>
<h2>Mențiuni</h2>
<p>Nu sunt înscrise mențiuni privind procedura insolvenței, dizolvarea sau suspendarea activității.</p>
<p>extract_date: {c['extract_date']}</p>
<p>Data emiterii: {ro_date(c['extract_date'])} · Prezentul certificat se eliberează la cererea societății, pentru: <i>relația cu instituții de credit</i>.</p>
<span class="stamp">SPECIMEN · SEMNAT ELECTRONIC</span>
"""
    return page("Certificat constatator", body)


def identity_card(person) -> str:
    surname, *given = person["name"].replace("Dr. ", "").split(" ")[::-1]
    given = " ".join(given[::-1])
    mrz_name = f"{surname}<<{given}".upper().replace("-", "<").replace(" ", "<")
    for a, b in zip("ĂÂÎȘȚ", "AAIST"):
        mrz_name = mrz_name.replace(a, b)
    exp = person["expiry"].replace("-", "")[2:]
    birth = person["birth"].replace("-", "")[2:]
    body = f"""
<header><div class="brand">Copie act de identitate<small>Atașament la dosarul de cunoaștere a clientelei · {BANK}</small></div>
<div class="meta">Copie conformă cu originalul<br>Verificat de: A. Marinescu · {ro_date('2026-10-23')}</div></header>
<div class="idcard">
<div class="top"><span>ROMÂNIA · ROUMANIE · ROMANIA</span><span>CARTE DE IDENTITATE · SPECIMEN</span></div>
<div class="body"><div class="photo">fotografie<br>titular</div>
<dl><dt>CNP</dt><dd>{person['cnp']}</dd>
<dt>Nume / Nom / Last name</dt><dd>{esc(surname.upper())}</dd>
<dt>Prenume / Prénom / First name</dt><dd>{esc(given.upper())}</dd>
<dt>Seria / Nr.</dt><dd>{person['series']}</dd>
<dt>Cetățenie</dt><dd>Română / ROU</dd>
<dt>Loc naștere</dt><dd>{esc(person['place'])}</dd>
<dt>Domiciliu</dt><dd>{esc(person['address'])}</dd>
<dt>Emisă de</dt><dd>{esc(person['issuer'])}</dd>
<dt>Valabilitate</dt><dd>{ro_date(person['issued'])} – {ro_date(person['expiry'])}</dd></dl></div>
<div class="mrz">{esc("IDROU" + mrz_name[:25].ljust(25, "<"))}
{esc(person['series'].replace(' ', '') + "<ROU" + birth + person['cnp'][0] + exp + "<" + person['cnp'][7:13])}</div>
</div>
<h2>Date preluate de ofițerul bancar</h2>
<table>{rows([
    ("Titular", person['name']),
    ("Tip document", "Carte de identitate"),
    ("Seria și numărul", person['series']),
    ("Data eliberării", person['issued']),
])}</table>
<p>identity_expiry: {person['expiry']}</p>
<p class="small">Am verificat concordanța dintre fotografie și persoana prezentă. Copia a fost realizată în prezența titularului.</p>
<div class="sign"><div>Semnătura titularului<br><b>{esc(person['name'])}</b></div><div>Ofițer bancar<br><b>A. Marinescu</b></div></div>
"""
    return page("Copie carte de identitate", body)


def ownership(c) -> str:
    owners = "".join(
        f"<tr><td>{esc(p['name'])}</td><td>{p.get('cnp', '—')}</td><td>{p.get('share', 0)}%</td><td>directă</td><td>NU</td></tr>"
        for p in c["people"])
    body = f"""
<header><div class="brand">Declarație privind beneficiarul real<small>Conform art. 4 și art. 56 din Legea nr. 129/2019</small></div>
<div class="meta">Anexă la cererea de deschidere cont<br>{esc(c['name'])}</div></header>
<h1>Declarație pe propria răspundere</h1>
<p>Subsemnatul/Subsemnata <b>{esc(c['people'][0]['name'])}</b>, în calitate de reprezentant legal al societății <b>{esc(c['name'])}</b>,
CUI {c['cui']}, cu sediul în {esc(c['address'])}, declar pe propria răspundere că beneficiarii reali ai societății sunt:</p>
<table class="grid"><tr><th>Nume și prenume</th><th>CNP</th><th>Procent deținut</th><th>Mod de exercitare a controlului</th><th>PEP</th></tr>{owners}</table>
<p>Declar că nu există alte persoane fizice care dețin sau controlează în ultimă instanță societatea, direct sau indirect,
și că voi comunica băncii orice modificare în termen de 15 zile.</p>
<p>Cunoscând prevederile art. 326 din Codul penal privind falsul în declarații.</p>
<div class="sign"><div>Data: {ro_date('2026-10-23')}</div><div>Semnătura<br><b>{esc(c['people'][0]['name'])}</b></div></div>
"""
    return page("Declarație beneficiar real", body)


def mandate(c) -> str:
    m, admin = c["mandate"], c["people"][0]
    body = f"""
<header><div class="brand">Împuternicire<small>pentru operațiuni bancare · {BANK}</small></div>
<div class="meta">Nr. 14 / {ro_date('2026-10-20')}<br>{esc(c['name'])}</div></header>
<h1>Împuternicire</h1>
<p>Societatea <b>{esc(c['name'])}</b>, CUI {c['cui']}, nr. ORC {c['orc']}, reprezentată legal prin <b>{esc(admin['name'])}</b>
în calitate de {esc(admin['role'])}, împuternicește pe:</p>
<table>{rows([("Nume și prenume", m['name']), ("CNP", m['cnp']), ("Act de identitate", f"CI {m['series']}"), ("Funcție", m['role'])])}</table>
<p>să efectueze în numele și pe seama societății următoarele operațiuni la {BANK}:</p>
<ul><li>inițierea și autorizarea plăților prin internet banking, în limita a 250.000 RON / tranzacție;</li>
<li>solicitarea de extrase de cont și documente justificative;</li><li>depunerea de numerar.</li></ul>
<p>Împuternicirea este valabilă până la revocarea scrisă comunicată băncii.</p>
<div class="sign"><div>Reprezentant legal<br><b>{esc(admin['name'])}</b></div><div>Împuternicit<br><b>{esc(m['name'])}</b></div></div>
"""
    return page("Împuternicire", body)


# --- Rendering ---------------------------------------------------------------------------------

def slug(name: str) -> str:
    plain = unicodedata.normalize("NFKD", name.replace("Dr. ", "")).encode("ascii", "ignore").decode()
    return "-".join(plain.lower().split())


def documents_for(c):
    docs = [("application", "cerere-deschidere-cont", application(c), [("company_identifier", "company", "company_identifier: ")]),
            ("company_extract", "certificat-constatator", extract(c), [("company_identifier", "company", "company_identifier: "),
                                                                       ("extract_date", "company", "extract_date: ")])]
    if not c.get("skip_identity"):
        for index, person in enumerate(p for p in c["people"] if p.get("expiry")):
            docs.append(("identity", f"ci-{slug(person['name'])}", identity_card(person),
                         [("identity_expiry", f"person-{index + 1}", "identity_expiry: ")]))
    if c.get("mandate") or len(c["people"]) > 1:
        docs.append(("ownership", "declaratie-beneficiar-real", ownership(c), []))
    if c.get("mandate"):
        docs.append(("mandate", "imputernicire", mandate(c), []))
    return docs


def render(html_text: str, target: Path):
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "doc.html"
        source.write_text(html_text, encoding="utf-8")
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        f"--user-data-dir={tmp}/profile", f"--print-to-pdf={target}", source.as_uri()],
                       check=True, capture_output=True)


def render_all():
    plan = []
    for c in COMPANIES:
        folder = OUT / c["slug"]
        folder.mkdir(parents=True, exist_ok=True)
        entries = []
        for kind, name, html_text, observations in documents_for(c):
            target = folder / f"{name}.pdf"
            render(html_text, target)
            entries.append((kind, target, observations))
        plan.append((c, entries))
        print(f"rendered {c['slug']}: {len(entries)} PDFs")
    return plan


# --- Seeding through the API ---------------------------------------------------------------

def locate(pages, label):
    """Find the literal value printed after an observation label in the server-extracted text."""
    for number, text in enumerate(pages, 1):
        at = text.find(label)
        if at >= 0:
            start = at + len(label)
            end = start
            while end < len(text) and not text[end].isspace():
                end += 1
            return number, start, end, text[start:end]
    raise ValueError(f"Label {label!r} not found in extracted text")


def seed(plan, url, username, password):
    with httpx.Client(base_url=url, timeout=60) as client:
        def request(method, path, **kwargs):
            response = client.request(method, path, **kwargs)
            if response.is_error:
                raise SystemExit(f"{method} {path} → {response.status_code}: {response.text}")
            return response.json()

        session = request("POST", "/api/v1/session", json={"username": username, "password": password})
        client.headers["x-csrf-token"] = session["csrf_token"]
        for c, entries in plan:
            case = request("POST", "/api/v1/cases", json={"title": f"{c['name']} · {c['scenario']}"})
            prefix = f"/api/v1/cases/{case['id']}"
            revision, facts = case["revision"], []
            for index, (kind, path, observations) in enumerate(entries):
                uploaded = request("POST", prefix + "/documents", data={"kind": kind, "expected_revision": revision},
                                   files={"file": (path.name, path.read_bytes(), "application/pdf")})
                doc, revision = uploaded["document"], uploaded["revision"]
                for field, entity, label in observations:
                    number, start, end, value = locate(doc["pages"], label)
                    facts.append({"id": f"{index}-{field}-{entity}", "field": field, "entity_id": entity, "value": value,
                                  "evidence": {"document_id": doc["id"], "sha256": doc["sha256"], "page": number,
                                               "start": start, "end": end, "quote": value}})
            revision = request("POST", prefix + "/facts", json={"expected_revision": revision, "facts": {"facts": facts}})["revision"]
            run = request("POST", prefix + "/runs", json={"expected_revision": revision, "evaluation_date": EVALUATION_DATE},
                          headers={"Idempotency-Key": str(uuid4())})
            disposition = run["result"]["disposition"]
            mark = "ok" if disposition == c["expected"] else f"EXPECTED {c['expected']}"
            print(f"{c['name']:<38} {len(entries)} docs · {disposition} ({mark})")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--username", default="manager")
    parser.add_argument("--render-only", action="store_true")
    args = parser.parse_args()
    plan = render_all()
    if args.render_only:
        return
    password = os.environ.get("CASECHECK_DEMO_PASSWORD") or (ROOT / ".runtime" / "preview-password.txt").read_text().strip()
    seed(plan, args.url, args.username, password)


if __name__ == "__main__":
    main()
