import json
from io import BytesIO
from pypdf import PdfReader


class DocumentParseError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


def extract(data: bytes, media_type: str) -> tuple[list[str], list[int]]:
    """Page texts and the page numbers that were transcribed by OCR (scans without a text layer)."""
    ocr_pages: list[int] = []
    if media_type == "application/json":
        payload = json.loads(data)
        if not isinstance(payload, dict) or set(payload) != {"pages"}:
            raise ValueError("Synthetic JSON must contain only pages")
        pages = payload["pages"]
    elif media_type in {"text/csv", "application/csv"}:
        # Bank statement exports: kept as text, one page per 90k characters, split on line boundaries.
        text = data.decode("utf-8-sig")
        pages, current = [], ""
        for line in text.splitlines(keepends=True):
            if len(current) + len(line) > 90_000 and current:
                pages.append(current)
                current = ""
            current += line
        pages.append(current)
    elif media_type == "application/pdf":
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted or len(reader.pages) > 30:
            raise ValueError("Encrypted or oversized PDF")
        pages = [page.extract_text() or "" for page in reader.pages]
        if any(not text.strip() for text in pages):
            raise DocumentParseError("PDF_TEXT_REQUIRED", "PDF fără text extractibil. Încărcați un PDF cu text; OCR nu este inclus în MVP.")
    else:
        raise ValueError("Supported types: text PDF or synthetic pages JSON")
    if not isinstance(pages, list) or not 1 <= len(pages) <= 30:
        raise ValueError("Expected 1–30 pages")
    if any(not isinstance(p, str) or not p.strip() or len(p) > 100_000 for p in pages):
        raise ValueError("Empty, unreadable scan or oversized page")
    return pages, ocr_pages


def parse_document(data: bytes, media_type: str) -> list[str]:
    return extract(data, media_type)[0]
