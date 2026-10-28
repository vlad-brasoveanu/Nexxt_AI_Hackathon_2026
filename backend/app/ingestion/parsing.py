import json
import shutil
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader

OCR_LANGUAGES = "ron+eng"


def ocr_available() -> bool:
    return bool(shutil.which("pdftoppm") and shutil.which("tesseract"))


def ocr_page(data: bytes, number: int) -> str:
    """Transcribe one scanned PDF page locally (pdftoppm + Tesseract). No cloud call."""
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / "in.pdf"
        source.write_bytes(data)
        subprocess.run(["pdftoppm", "-r", "300", "-gray", "-f", str(number), "-l", str(number), "-png", str(source), f"{tmp}/page"],
                       check=True, capture_output=True, timeout=60)
        image = next(Path(tmp).glob("page*.png"))
        languages = OCR_LANGUAGES if "ron" in subprocess.run(["tesseract", "--list-langs"], capture_output=True, text=True).stdout else "eng"
        result = subprocess.run(["tesseract", str(image), "-", "-l", languages, "--psm", "6"], check=True, capture_output=True, text=True, timeout=120)
        return result.stdout


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
        for number, text in enumerate(pages, 1):
            if not text.strip() and ocr_available():
                pages[number - 1] = ocr_page(data, number)
                ocr_pages.append(number)
    else:
        raise ValueError("Supported types: text PDF or synthetic pages JSON")
    if not isinstance(pages, list) or not 1 <= len(pages) <= 30:
        raise ValueError("Expected 1–30 pages")
    if any(not isinstance(p, str) or not p.strip() or len(p) > 100_000 for p in pages):
        raise ValueError("Empty, unreadable scan or oversized page")
    return pages, ocr_pages


def parse_document(data: bytes, media_type: str) -> list[str]:
    return extract(data, media_type)[0]
