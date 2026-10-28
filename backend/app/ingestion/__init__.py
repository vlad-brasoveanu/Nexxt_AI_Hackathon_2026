"""Document intake: turn uploads into page text, and verify facts quote that text exactly."""
from app.ingestion.evidence import verify_facts
from app.ingestion.parsing import extract, parse_document

__all__ = ["extract", "parse_document", "verify_facts"]
