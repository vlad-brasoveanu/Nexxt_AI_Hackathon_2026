import json
from io import BytesIO
from pypdf import PdfReader


def parse_document(data: bytes, media_type: str) -> list[str]:
    if media_type == "application/json":
        payload = json.loads(data)
        if not isinstance(payload, dict) or set(payload) != {"pages"}:
            raise ValueError("Synthetic JSON must contain only pages")
        pages = payload["pages"]
    elif media_type == "application/pdf":
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted or len(reader.pages) > 30:
            raise ValueError("Encrypted or oversized PDF")
        pages = [page.extract_text() or "" for page in reader.pages]
    else:
        raise ValueError("Supported types: text PDF or synthetic pages JSON")
    if not isinstance(pages, list) or not 1 <= len(pages) <= 30:
        raise ValueError("Expected 1–30 pages")
    if any(not isinstance(p, str) or not p.strip() or len(p) > 100_000 for p in pages):
        raise ValueError("Empty, scanned or oversized page")
    return pages


def verify_facts(factset, documents):
    ids = set()
    for fact in factset.facts:
        if fact.id in ids:
            raise ValueError("Duplicate fact ID")
        ids.add(fact.id)
        evidence = fact.evidence
        doc = documents.get(evidence.document_id)
        if not doc or doc.sha256 != evidence.sha256 or evidence.page > len(doc.pages):
            raise ValueError("Evidence does not belong to this case/document version")
        page = doc.pages[evidence.page - 1]
        if page[evidence.start:evidence.end] != evidence.quote or evidence.end > len(page):
            raise ValueError("Evidence span does not match source")
        if fact.value not in evidence.quote:
            raise ValueError("Manual structured fact must quote its literal value")
