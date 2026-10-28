"""Render synthetic client submissions as the bank would receive them, on two channels.

online  — Codeforge Digital: the portal's structured form payload, a portal-generated confirmation PDF signed
          with a (fictional) qualified e-signature, and the attachments the client uploaded.
branch  — Atelier Ceramica Horezu: paper forms filled in by hand and scanned at the counter, copies of the
          originals made by the officer, and the officer's intake record. No structured payload exists.

Each folder gets a manifest.json: the intake envelope the operator sees in the bank's system.
All companies, people, identifiers, providers and the bank are fictional.

    .venv/bin/python scripts/demo/submissions.py
"""
import json
from hashlib import sha256
from pathlib import Path

from companies import COMPANIES
from render import render, slug as ascii_slug
from templates import BANK, SYNTHETIC, esc, identity_card, page, ro_date, rows

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "fixtures" / "client_submissions"
BY_SLUG = {c["slug"]: c for c in COMPANIES}

FORM_CSS = """<style>
.hw { font-family: "Bradley Hand", "Snell Roundhand", cursive; color: #1d3f8f; font-size: 11pt; font-weight: 600; }
.box { display: inline-block; width: 11px; height: 11px; border: 1px solid #333; margin: 0 3px 0 8px; vertical-align: -1px;
       font-size: 9pt; line-height: 10px; text-align: center; }
.scan { background: #fbfaf6; }
.scanned { margin-top: 14px; font-size: 7.5pt; color: #666; border-top: 1px dotted #999; padding-top: 4px; }
.qes { border: 1px solid #2b6e4f; color: #2b6e4f; padding: 6px 8px; margin-top: 14px; font-size: 8.5pt; }
</style>"""

# --- What the client declares (the same answers on both channels) --------------------------------------------------

EXTRA = {
    "codeforge-digital": dict(
        purpose="Încasări din contracte de dezvoltare software, plata salariilor și a furnizorilor de servicii cloud",
        monthly_in="650.000", monthly_out="600.000", cash="NU", cash_monthly="0",
        countries=["România", "Germania", "Olanda", "Statele Unite ale Americii"],
        clients=["Hanse Logistik GmbH (DE)", "Polder Retail B.V. (NL)", "Brightlane Inc. (US)"],
        suppliers=["furnizori servicii cloud (UE)", "colaboratori PFA (RO)"],
        tax_residence="România", crs_status="Entitate nefinanciară activă (ENF activă)", us_person="NU",
        assets="2.350.000", profit="1.120.000", channel="online",
        mandate_person=dict(name="Cristina Radu", role="Împuternicit", cnp=BY_SLUG["codeforge-digital"]["mandate"]["cnp"],
                            series="RD 612094", birth="1988-12-12", place="București", issued="2022-12-12",
                            expiry="2032-12-12", issuer="DEPABD București",
                            address="Str. Barbu Văcărescu nr. 120, ap. 34, Sector 2, București")),
    "ceramica-horezu": dict(
        purpose="Încasări din vânzări în atelier, la târguri și online; plata furnizorilor de argilă și a utilităților",
        monthly_in="70.000", monthly_out="62.000", cash="DA", cash_monthly="15.000",
        countries=["România", "Germania"],
        clients=["persoane fizice (atelier, târguri)", "magazin online propriu", "Kunsthandwerk Weber (DE)"],
        suppliers=["furnizori locali de argilă și glazuri", "Distribuție Energie Oltenia"],
        tax_residence="România", crs_status="Entitate nefinanciară activă (ENF activă)", us_person="NU",
        assets="410.000", profit="96.000", channel="branch"),
}


def answers(c, x):
    """The client's declarations, structured as the online portal stores them."""
    people = c["people"]
    reps = [p for p in people if p["role"] == "Administrator"]
    signers = reps + ([x["mandate_person"]] if "mandate_person" in x else [])
    return {
        "societate": {"denumire": c["name"], "forma_juridica": "SRL", "cui": c["cui"], "nr_orc": c["orc"], "euid": c["euid"],
                      "sediu_social": c["address"], "caen_principal": f"{c['caen']} – {c['caen_text']}",
                      "data_infiintarii": c["founded"], "capital_social_ron": c["capital"], "telefon": c["phone"], "email": c["email"]},
        "reprezentanti_legali": [{"nume": p["name"], "functie": p["role"], "cnp": p["cnp"], "act_identitate": f"CI {p['series']}",
                                  "valabil_pana_la": p["expiry"], "domiciliu": p["address"]} for p in reps],
        "asociati": [{"nume": p["name"], "tip": "persoană fizică", "cota_procent": p["share"]} for p in people],
        "beneficiari_reali": [{"nume": p["name"], "cnp": p.get("cnp"), "procent": p["share"], "mod_control": "deținere directă"}
                              for p in people if p["share"] > 25],
        "persoane_autorizate_cont": [{"nume": p["name"], "calitate": p["role"], "cnp": p["cnp"],
                                      "tip_semnatura": "individuală" if p["role"] == "Administrator" else "individuală, limită 250.000 RON/tranzacție"}
                                     for p in signers],
        "profil_relatie": {"scop": x["purpose"], "produse_solicitate": c["products"], "surse_fonduri": c["funds"],
                           "rulaj_lunar_intrari_ron": x["monthly_in"], "rulaj_lunar_iesiri_ron": x["monthly_out"],
                           "operatiuni_numerar": x["cash"], "numerar_lunar_estimat_ron": x["cash_monthly"],
                           "tari_tranzactii": x["countries"], "principali_clienti": x["clients"], "principali_furnizori": x["suppliers"],
                           "cifra_afaceri_2025_ron": c["turnover"], "numar_salariati": c["employees"]},
        "fatca_crs": {"rezidenta_fiscala": x["tax_residence"], "cod_fiscal": c["cui"], "statut_crs": x["crs_status"],
                      "persoana_sua_fatca": x["us_person"]},
        "pep": [{"nume": p["name"], "este_pep": "NU", "membru_familie_pep": "NU", "asociat_apropiat_pep": "NU"}
                for p in {p["name"]: p for p in signers + people}.values()],
        "consimtaminte": {"informare_gdpr_v": "3.1", "conditii_generale_v": "2026.2", "notificare_modificari": True},
    }


# --- Form rendering --------------------------------------------------------------------------------------------------

def value(v, hw):
    return f"<span class='hw'>{esc(v)}</span>" if hw else esc(v)


def table(pairs, hw):
    return "<table>" + "".join(f"<tr><th>{esc(k)}</th><td>{value(v, hw)}</td></tr>" for k, v in pairs) + "</table>"


def grid(head, body, hw):
    cells = "".join("<tr>" + "".join(f"<td>{value(v, hw)}</td>" for v in r) + "</tr>" for r in body)
    return "<table class='grid'><tr>" + "".join(f"<th>{esc(h)}</th>" for h in head) + "</tr>" + cells + "</table>"


def choice(question, options, picked, hw):
    marks = "".join(f"<span class='box'>{value('X', hw) if o == picked else ''}</span>{esc(o)}" for o in options)
    return f"<p>{esc(question)} {marks}</p>"


def sections(a, hw):
    s, p, f = a["societate"], a["profil_relatie"], a["fatca_crs"]
    return {
        "cerere": ("Cerere de deschidere cont și relație de afaceri", "F-IMM-01 v4.2",
                   "<h2>1. Date de identificare a societății</h2>" + table([
                       ("Denumire", s["denumire"]), ("CUI", s["cui"]), ("Nr. ORC", s["nr_orc"]), ("Sediu social", s["sediu_social"]),
                       ("Activitate principală (CAEN)", s["caen_principal"]), ("Telefon / e-mail", f"{s['telefon']} / {s['email']}")], hw)
                   + "<h2>2. Reprezentanți legali</h2>" + grid(["Nume", "Funcție", "CNP", "Act identitate", "Valabil până la"],
                       [(r["nume"], r["functie"], r["cnp"], r["act_identitate"], ro_date(r["valabil_pana_la"])) for r in a["reprezentanti_legali"]], hw)
                   + "<h2>3. Asociați</h2>" + grid(["Nume", "Tip", "Cotă"], [(o["nume"], o["tip"], f"{o['cota_procent']}%") for o in a["asociati"]], hw)
                   + "<h2>4. Produse solicitate</h2>" + "".join(f"<p><span class='box'>{value('X', hw)}</span>{esc(x)}</p>" for x in p["produse_solicitate"])),
        "chestionar": ("Chestionar de cunoaștere a clientelei (KYC)", "F-IMM-02 v3.0",
                       "<h2>Scopul și natura relației de afaceri</h2>" + table([
                           ("Scopul relației", p["scop"]), ("Sursa fondurilor", p["surse_fonduri"]),
                           ("Rulaj lunar estimat – intrări (RON)", p["rulaj_lunar_intrari_ron"]),
                           ("Rulaj lunar estimat – ieșiri (RON)", p["rulaj_lunar_iesiri_ron"]),
                           ("Numerar lunar estimat (RON)", p["numerar_lunar_estimat_ron"]),
                           ("Țări cu care se derulează tranzacții", ", ".join(p["tari_tranzactii"])),
                           ("Principali clienți", "; ".join(p["principali_clienti"])),
                           ("Principali furnizori", "; ".join(p["principali_furnizori"])),
                           ("Cifra de afaceri 2025 (RON)", p["cifra_afaceri_2025_ron"]), ("Număr salariați", p["numar_salariati"])], hw)
                       + choice("Societatea efectuează operațiuni cu numerar?", ["DA", "NU"], p["operatiuni_numerar"], hw)),
        "beneficiar": ("Declarație privind beneficiarul real", "Legea nr. 129/2019, art. 4 și art. 56",
                       "<p>Declar pe propria răspundere că beneficiarii reali ai societății sunt:</p>"
                       + grid(["Nume și prenume", "CNP", "Procent", "Mod de exercitare a controlului"],
                              [(b["nume"], b["cnp"] or "—", f"{b['procent']}%", b["mod_control"]) for b in a["beneficiari_reali"]], hw)
                       + "<p class='small'>Nu există alte persoane fizice care dețin sau controlează în ultimă instanță societatea. "
                         "Cunosc prevederile art. 326 din Codul penal privind falsul în declarații.</p>"),
        "pep": ("Declarație privind calitatea de persoană expusă public (PEP)", "Legea nr. 129/2019, art. 3",
                "".join(f"<h2>{esc(x['nume'])}</h2>" + choice("Dețin sau am deținut în ultimele 12 luni o funcție publică importantă:", ["DA", "NU"], x["este_pep"], hw)
                        + choice("Sunt membru de familie al unei persoane expuse public:", ["DA", "NU"], x["membru_familie_pep"], hw)
                        + choice("Sunt asociat apropiat al unei persoane expuse public:", ["DA", "NU"], x["asociat_apropiat_pep"], hw) for x in a["pep"])),
        "fatca": ("Autocertificare FATCA / CRS – entități", "Codul de procedură fiscală, anexele 1 și 2",
                  table([("Denumire entitate", s["denumire"]), ("Țara rezidenței fiscale", f["rezidenta_fiscala"]),
                         ("Cod de identificare fiscală (TIN)", f["cod_fiscal"])], hw)
                  + choice("Statut CRS:", ["Instituție financiară", "ENF activă", "ENF pasivă"], f["statut_crs"].split("(")[-1].rstrip(")"), hw)
                  + choice("Entitatea este persoană specificată din SUA (FATCA)?", ["DA", "NU"], f["persoana_sua_fatca"], hw)),
        "semnaturi": ("Fișa persoanelor autorizate și specimen de semnătură", "F-IMM-05 v2.1",
                      grid(["Nume", "Calitate", "CNP", "Tip semnătură", "Specimen semnătură"],
                           [(x["nume"], x["calitate"], x["cnp"], x["tip_semnatura"], x["nume"].split()[-1]) for x in a["persoane_autorizate_cont"]], hw)),
    }


def form(title, code, body, signer, hw, footer=""):
    header = (f"<header><div class='brand'>{BANK}<small>Divizia IMM</small></div>"
              f"<div class='meta'>Cod formular: {esc(code)}</div></header><h1>{esc(title)}</h1>")
    sign = (f"<div class='sign'><div>Data: {value(ro_date('2026-10-23'), hw)}</div>"
            f"<div>Semnătura reprezentantului legal<br>{value(signer, hw) if hw else '<b>' + esc(signer) + '</b>'}</div></div>")
    html_text = page(title, FORM_CSS + header + body + (sign if hw else "") + footer)
    return html_text.replace("<body>", "<body class='scan'>") if hw else html_text


def company_doc(title, c, pairs, extra=""):
    body = (f"<header><div class='brand'>{esc(c['name'])}<small>CUI {c['cui']} · {c['orc']}</small></div>"
            f"<div class='meta'>Copie depusă la {BANK}</div></header><h1>{esc(title)}</h1>" + table(pairs, False) + extra)
    return page(title, FORM_CSS + body)


def articles(c):
    parts = int(c["capital"].replace(".", "")) // 10
    return company_doc("Act constitutiv (formă actualizată)", c, [
        ("Denumire", c["name"]), ("Formă juridică", "Societate cu răspundere limitată"), ("Sediu social", c["address"]),
        ("Durata", "nelimitată"), ("Capital social", f"{c['capital']} RON, {parts} părți sociale × 10 RON"),
        *[(f"Asociat – {p['name']}", f"{p['share']}% ({parts * p['share'] // 100} părți sociale)") for p in c["people"]],
        ("Administrare", ", ".join(p["name"] for p in c["people"] if p["role"] == "Administrator") + ", mandat nelimitat, puteri depline"),
        ("Obiect principal", f"{c['caen']} – {c['caen_text']}")])


def financials(c, x):
    return company_doc("Situații financiare anuale 2025 – extras", c, [
        ("Cifra de afaceri netă (RON)", c["turnover"]), ("Profit net (RON)", x["profit"]), ("Total active (RON)", x["assets"]),
        ("Număr mediu de salariați", c["employees"]), ("Categorie (Legea nr. 346/2004)", "întreprindere mică" if c["employees"] >= 10 else "microîntreprindere"),
        ("Depus la ANAF", "da, nr. înregistrare 2026/0417")])


def id_photo(person):
    """A client-uploaded phone photo of an identity card: same card as the branch copy, without the officer's sections."""
    full = identity_card(person)
    card = full[full.index("<div class=\"idcard\">"):full.index("<h2>")]
    body = (f"<header><div class='brand'>Fotografie act de identitate<small>Încărcată de client prin portalul {BANK}</small></div>"
            f"<div class='meta'>Sursă: cameră telefon<br>Față · 1 pagină</div></header>{card}")
    return full[:full.index("<header>")] + body + "</body></html>"


# --- Channels --------------------------------------------------------------------------------------------------------

def online(c, x, folder):
    a = answers(c, x)
    reps = [p for p in c["people"] if p["role"] == "Administrator"]
    s = sections(a, hw=False)
    qes = ("<div class='qes'>Semnat electronic cu semnătură electronică calificată · TrustSign Demo QTSP (fictiv)<br>"
           f"Semnatar: {esc(reps[0]['name'])} · 22.10.2026 21:14:07 EET · amprentă certificat 4F:9C:21:…:B7</div>")
    body = "".join(f"<h1 style='margin-top:18px'>{esc(t)}</h1><p class='small'>{esc(k)}</p>{b}" for t, k, b in s.values())
    confirmation = page("Confirmare cerere online", FORM_CSS
                        + f"<header><div class='brand'>{BANK}<small>Portal onboarding IMM</small></div>"
                          f"<div class='meta'>Cerere nr. ONL-2026-104718<br>Generat la 22.10.2026 21:14</div></header>"
                        + "<p class='small'>Rezumatul datelor introduse de client în portal și al declarațiilor acceptate.</p>" + body + qes)
    people = [p for p in c["people"] if p.get("expiry")] + [x["mandate_person"]]
    files = [("confirmare-cerere-online.pdf", "declaration", "generat de portal, semnat QES", confirmation),
             ("certificat-constatator-onrc.pdf", "company_extract", "încărcat de client (descărcat din ONRC online)", None),
             ("act-constitutiv.pdf", "declaration", "încărcat de client", articles(c)),
             ("situatii-financiare-2025.pdf", "declaration", "încărcat de client", financials(c, x)),
             ("imputernicire-semnata-qes.pdf", "mandate", "încărcat de client, semnat QES", None),
             *[(f"ci-{ascii_slug(p['name'])}-foto.pdf", "identity", "fotografie încărcată de client", id_photo(p)) for p in people]]
    (folder / "formular-online.json").write_text(json.dumps(
        {"synthetic": SYNTHETIC, "cerere": "ONL-2026-104718", "trimis_la": "2026-10-22T21:14:07+03:00",
         "precompletat_din": {"onrc": ["denumire", "nr_orc", "euid", "sediu_social", "caen_principal", "asociati"],
                              "anaf": ["cui", "platitor_tva"]},
         "formular": a}, ensure_ascii=False, indent=2), encoding="utf-8")
    return files, {
        "canal": "online", "cerere": "ONL-2026-104718", "primit_la": "2026-10-22T21:14:07+03:00", "primit_de": "portal onboarding IMM",
        "date_structurate": "formular-online.json",
        "identificare_reprezentant": {"metoda": "video-identificare", "sesiune": "VID-7731-2026", "rezultat": "reușită",
                                      "verificare_viata": "trecută", "potrivire_fata_document": 0.97, "document_citit": "OCR + MRZ",
                                      "persoana": reps[0]["name"]},
        "semnatura": {"tip": "electronică calificată", "furnizor": "TrustSign Demo QTSP (fictiv)", "semnatar": reps[0]["name"]},
        "status": "PRIMIT – în așteptarea verificării operatorului"}


def branch(c, x, folder):
    a = answers(c, x)
    reps = [p for p in c["people"] if p["role"] == "Administrator"]
    scanned = "<div class='scanned'>Scanat la Sucursala Râmnicu Vâlcea · 23.10.2026 10:42 · operator A. Marinescu (marca 10482)</div>"
    files = [(f"formular-{key}-scanat.pdf", "application" if key == "cerere" else "ownership" if key == "beneficiar" else "declaration",
              "formular completat de mână, scanat la ghișeu", form(t, k, b, reps[0]["name"], hw=True, footer=scanned))
             for key, (t, k, b) in sections(a, hw=True).items()]
    files += [("certificat-constatator-copie.pdf", "company_extract", "copie după original adus de client", None),
              ("act-constitutiv-copie.pdf", "declaration", "copie după original adus de client", articles(c)),
              ("situatii-financiare-2025-copie.pdf", "declaration", "copie după original adus de client", financials(c, x)),
              *[(f"ci-{ascii_slug(p['name'])}-copie.pdf", "identity",
                 "copie conformă cu originalul, făcută de operator", identity_card(p)) for p in reps]]
    return files, {
        "canal": "sucursală", "cerere": "SUC-RV-2026-0388", "primit_la": "2026-10-23T10:30:00+03:00",
        "primit_de": {"operator": "A. Marinescu", "marca": "10482", "unitate": "Sucursala Râmnicu Vâlcea"},
        "date_structurate": None,
        "identificare_reprezentant": {"metoda": "față în față", "persoane": [p["name"] for p in reps], "original_vazut": True},
        "semnatura": {"tip": "olografă", "semnatari": [p["name"] for p in reps]},
        "observatii_operator": "Clientul a adus originalele; formularele au fost completate de mână în sucursală. "
                               "Datele nu sunt încă introduse în sistem.",
        "status": "PRIMIT – în așteptarea introducerii și verificării datelor"}


def build():
    official = ROOT / "fixtures" / "demo_pdfs"
    for slug, channel in (("codeforge-digital", online), ("ceramica-horezu", branch)):
        c, x = BY_SLUG[slug], EXTRA[slug]
        folder = OUT / f"{x['channel']}-{slug}"
        folder.mkdir(parents=True, exist_ok=True)
        files, envelope = channel(c, x, folder)
        listed = []
        for name, kind, source, html_text in files:
            target = folder / name
            if html_text is None:  # reuse the official document already rendered for this company
                original = {"company_extract": "certificat-constatator.pdf", "mandate": "imputernicire.pdf"}[kind]
                target.write_bytes((official / slug / original).read_bytes())
            else:
                render(html_text, target)
            listed.append({"fisier": name, "tip_document": kind, "media_type": "application/pdf", "sursa": source,
                           "sha256": sha256(target.read_bytes()).hexdigest()})
        manifest = {"synthetic": SYNTHETIC, "client": {"denumire": c["name"], "cui": c["cui"]}, **envelope, "documente": listed}
        (folder / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{folder.name}: {len(listed)} PDFs + manifest")


if __name__ == "__main__":
    build()
