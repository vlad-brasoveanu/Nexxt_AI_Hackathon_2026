"""Render each company's documents to PDF with headless Chrome."""
import subprocess
import tempfile
import unicodedata
from pathlib import Path

from companies import COMPANIES
from templates import application, extract, identity_card, mandate, ownership

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "fixtures" / "demo_pdfs"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


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
