from hashlib import sha256
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import DB, Auth, bump, case_for, editable
from app.api.serializers import doc_json
from app.core.audit import audit
from app.db import Document, uid
from app.ingestion import parse_document

router = APIRouter(prefix="/api/v1", tags=["documents"])
DocumentKind = Literal["application", "company_extract", "identity", "ownership", "declaration", "mandate"]


@router.post("/cases/{case_id}/documents", status_code=201)
def upload(case_id: str, request: Request, identity: Auth, session: DB, expected_revision: Annotated[int, Form(ge=0)],
           kind: Annotated[DocumentKind, Form()], file: Annotated[UploadFile, File()]):
    settings, storage = request.app.state.settings, request.app.state.storage
    user = identity[0]
    editable(user)
    case = case_for(session, user, case_id)
    data = file.file.read(settings.max_document_bytes + 1)
    if not data or len(data) > settings.max_document_bytes:
        raise HTTPException(413, "Document empty or exceeds size limit")
    try:
        pages = parse_document(data, file.content_type)
    except Exception:
        raise HTTPException(422, "Unsupported document; supply a text PDF (max 30 pages) or synthetic pages JSON")
    bump(session, case, expected_revision)
    document = Document(id=uid(), case_id=case_id, kind=kind, filename=Path(file.filename or "document").name[:200],
                        media_type=file.content_type, sha256=sha256(data).hexdigest(), pages=pages)
    destination = storage / document.id
    try:
        with destination.open("xb") as output:
            output.write(data)
        destination.chmod(0o600)
        session.add(document)
        audit(session, user, "document.uploaded", case_id, document_id=document.id, sha256=document.sha256)
        session.commit()
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return {"document": doc_json(document), "revision": case.revision}


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
