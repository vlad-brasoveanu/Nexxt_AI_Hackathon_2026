from hashlib import sha256
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.deps import DB, Auth, bump, case_for, editable
from app.api.serializers import doc_json
from app.core.audit import audit
from app.db import Document, uid
from app.ingestion import extract
from app.ingestion.parsing import DocumentParseError

router = APIRouter(prefix="/api/v1", tags=["documents"])
DocumentKind = Literal["application", "company_extract", "identity", "ownership", "declaration", "mandate",
                       "credit_application", "financial_statements", "bank_statement", "collateral_valuation", "articles", "client_letter"]


@router.post("/cases/{case_id}/documents", status_code=201)
def upload(case_id: str, request: Request, identity: Auth, session: DB, expected_revision: Annotated[int, Form(ge=0)],
           kind: Annotated[DocumentKind, Form()], file: Annotated[UploadFile, File()],
           supersedes_document_id: Annotated[str | None, Form()] = None):
    settings = request.app.state.settings
    user = identity[0]
    editable(user)
    case = case_for(session, user, case_id)
    data = file.file.read(settings.max_document_bytes + 1)
    document = store(request, session, user, case, expected_revision, kind, file.filename, file.content_type, data, supersedes_document_id)
    return {"document": doc_json(document), "revision": case.revision}


def store(request, session, user, case, expected_revision, kind, filename, media_type, data, supersedes_id=None):
    """Validate, parse and persist one document; bumps the case revision and commits."""
    settings, storage = request.app.state.settings, request.app.state.storage
    if not data or len(data) > settings.max_document_bytes:
        raise HTTPException(413, "Document empty or exceeds size limit")
    try:
        pages, ocr_pages = extract(data, media_type)
    except DocumentParseError as exc:
        raise HTTPException(422, {"code": exc.code, "message": str(exc)})
    except Exception:
        raise HTTPException(422, "Unsupported document; supply a text PDF (max 30 pages), a CSV bank export or synthetic pages JSON")
    replaced = []
    if supersedes_id:
        previous = session.get(Document, supersedes_id)
        if not previous or previous.case_id != case.id or previous.kind != kind or previous.superseded_by:
            raise HTTPException(409, "Documentul înlocuit trebuie să fie o versiune activă de același tip din acest dosar.")
        replaced = [previous]
    else:
        replaced = list(session.scalars(select(Document).where(Document.case_id == case.id, Document.kind == kind,
                        Document.filename == Path(filename or "document").name[:200], Document.superseded_by.is_(None))))
    bump(session, case, expected_revision)
    document = Document(id=uid(), case_id=case.id, kind=kind, filename=Path(filename or "document").name[:200],
                        media_type=media_type, sha256=sha256(data).hexdigest(), pages=pages, ocr_pages=ocr_pages)
    destination = storage / document.id
    try:
        with destination.open("xb") as output:
            output.write(data)
        destination.chmod(0o600)
        session.add(document)
        session.flush()
        for previous in replaced:
            previous.superseded_by = document.id
        audit(session, user, "document.uploaded", case.id, document_id=document.id, sha256=document.sha256, supersedes=[d.id for d in replaced])
        session.commit()
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return document


@router.get("/documents/{document_id}/download")
def download(document_id: str, request: Request, identity: Auth, session: DB):
    doc = session.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    case_for(session, identity[0], doc.case_id)
    path = request.app.state.storage / doc.id
    if not path.is_file():
        raise HTTPException(503, "Document storage unavailable")
    return FileResponse(path, media_type="application/octet-stream", filename=doc.filename)
