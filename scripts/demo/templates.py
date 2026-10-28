"""HTML templates for the synthetic onboarding documents. Every page carries the synthetic-data banner."""
import html

BANK = "Banca Demo S.A."
SYNTHETIC = "DOCUMENT SINTETIC — FĂRĂ VALOARE JURIDICĂ · date fictive generate pentru demonstrație"

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
