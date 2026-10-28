from datetime import date, timedelta, timezone
from hashlib import sha256
import json
from pathlib import Path
import secrets
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import Field
from pwdlib import PasswordHash
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import Settings
from app.contracts import Contract, Context, FactSet
from app.db import AuditEvent, Case, Document, FactSnapshot, Run, SessionToken, User, connect, now, uid
from app.ingestion import parse_document, verify_facts
from app.modules.checks import default_registry, foundation_workflow
from app.runner import execute

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash("invalid-login-placeholder")


class Login(Contract):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class NewCase(Contract):
    title: str = Field(min_length=1, max_length=200)


class ImportFacts(Contract):
    expected_revision: int = Field(ge=0)
    facts: FactSet


class RunRequest(Contract):
    expected_revision: int = Field(ge=0)
    evaluation_date: date


def create_app(settings: Settings | None = None):
    settings = settings or Settings()
    app = FastAPI(title="CaseCheck Foundation API", version="0.1.0",
                  description="Synthetic-data foundation: 3 checks, manual structured observations. AI extraction, worker and full KYC are not implemented yet.")
    engine, factory = connect(settings.database_url)
    app.state.engine, app.state.session_factory = engine, factory
    registry, workflow = default_registry(), foundation_workflow()
    registry.validate(workflow)
    storage = Path(settings.storage_dir)
    storage.mkdir(parents=True, exist_ok=True, mode=0o700)

    def db():
        with factory() as session:
            yield session

    DB = Annotated[Session, Depends(db)]

    def auth(request: Request, session: DB):
        token = request.cookies.get("casecheck_session", "")
        record = session.get(SessionToken, sha256(token.encode()).hexdigest()) if token else None
        if not record or record.expires_at.replace(tzinfo=timezone.utc) <= now():
            raise HTTPException(401, "Authentication required")
        if request.method not in {"GET", "HEAD", "OPTIONS"} and not secrets.compare_digest(request.headers.get("x-csrf-token", ""), record.csrf):
            raise HTTPException(403, "Invalid CSRF token")
        user = session.get(User, record.user_id)
        if not user:
            raise HTTPException(401, "Authentication required")
        return user, record

    Auth = Annotated[tuple, Depends(auth)]

    def case_for(session, user, case_id):
        case = session.get(Case, case_id)
        if not case or case.team != user.team or (user.role == "manager" and case.owner_id != user.id):
            raise HTTPException(404, "Case not found")
        if user.role not in {"manager", "analyst", "supervisor"}:
            raise HTTPException(403, "Role not permitted")
        return case

    def editable(user):
        if user.role not in {"manager", "analyst"}:
            raise HTTPException(403, "Role cannot modify case evidence")

    def bump(session, case, expected):
        result = session.execute(update(Case).where(Case.id == case.id, Case.revision == expected).values(revision=Case.revision + 1))
        if result.rowcount != 1:
            raise HTTPException(409, "Stale case revision; refresh before retrying")
        session.refresh(case)

    def audit(session, user, action, case_id=None, **details):
        session.add(AuditEvent(actor_id=user.id, case_id=case_id, action=action, details=details))

    def case_json(case):
        return {"id": case.id, "title": case.title, "revision": case.revision, "owner_id": case.owner_id, "created_at": case.created_at}

    def doc_json(doc):
        return {"id": doc.id, "kind": doc.kind, "filename": doc.filename, "sha256": doc.sha256, "pages": doc.pages}

    def run_json(run):
        return {"id": run.id, "case_id": run.case_id, "case_revision": run.case_revision,
                "status": run.status, "snapshot": run.snapshot, "result": run.result}

    @app.middleware("http")
    async def origin_and_headers(request, call_next):
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            if origin and origin.rstrip("/") != str(request.base_url).rstrip("/"):
                return Response(status_code=403, content="Cross-origin mutation denied")
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/health")
    def health():
        return {"status": "ok", "stage": "foundation", "ai_enabled": False}

    @app.post("/api/v1/session")
    def login(body: Login, response: Response, session: DB):
        user = session.scalar(select(User).where(User.username == body.username))
        valid = passwords.verify(body.password, user.password_hash if user else DUMMY_HASH)
        if not user or not valid:
            raise HTTPException(401, "Invalid credentials")
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        session.add(SessionToken(token_hash=sha256(token.encode()).hexdigest(), user_id=user.id, csrf=csrf, expires_at=now() + timedelta(hours=8)))
        audit(session, user, "session.created")
        session.commit()
        response.set_cookie("casecheck_session", token, httponly=True, secure=settings.secure_cookies, samesite="strict", max_age=28800)
        return {"user": {"id": user.id, "username": user.username, "role": user.role}, "csrf_token": csrf}

    @app.get("/api/v1/session")
    def me(identity: Auth):
        user, record = identity
        return {"user": {"id": user.id, "username": user.username, "role": user.role}, "csrf_token": record.csrf}

    @app.delete("/api/v1/session", status_code=204)
    def logout(response: Response, identity: Auth, session: DB):
        session.delete(identity[1])
        session.commit()
        response.delete_cookie("casecheck_session")

    @app.get("/api/v1/modules")
    def modules(identity: Auth):
        return registry.catalogue()

    @app.get("/api/v1/workflow-definitions")
    def workflows(identity: Auth):
        return [workflow.model_dump(mode="json")]

    @app.post("/api/v1/cases", status_code=201)
    def new_case(body: NewCase, identity: Auth, session: DB):
        user = identity[0]
        editable(user)
        case = Case(title=body.title, owner_id=user.id, team=user.team)
        session.add(case)
        session.flush()
        audit(session, user, "case.created", case.id)
        session.commit()
        return case_json(case)

    @app.get("/api/v1/cases")
    def list_cases(identity: Auth, session: DB, offset: int = 0):
        user = identity[0]
        if offset < 0:
            raise HTTPException(422, "Offset must be nonnegative")
        query = select(Case).where(Case.team == user.team)
        if user.role == "manager":
            query = query.where(Case.owner_id == user.id)
        return [case_json(c) for c in session.scalars(query.order_by(Case.created_at.desc()).offset(offset).limit(100))]

    @app.get("/api/v1/cases/{case_id}")
    def get_case(case_id: str, identity: Auth, session: DB):
        case = case_for(session, identity[0], case_id)
        docs = session.scalars(select(Document).where(Document.case_id == case_id))
        return {**case_json(case), "documents": [doc_json(d) for d in docs]}

    @app.post("/api/v1/cases/{case_id}/documents", status_code=201)
    def upload(case_id: str, identity: Auth, session: DB, expected_revision: Annotated[int, Form(ge=0)],
               kind: Annotated[Literal["application", "company_extract", "identity", "ownership", "declaration", "mandate"], Form()],
               file: Annotated[UploadFile, File()]):
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

    @app.get("/api/v1/documents/{document_id}/download")
    def download(document_id: str, identity: Auth, session: DB):
        doc = session.get(Document, document_id)
        if not doc:
            raise HTTPException(404, "Document not found")
        case_for(session, identity[0], doc.case_id)
        path = storage / doc.id
        if not path.is_file():
            raise HTTPException(503, "Document storage unavailable")
        return FileResponse(path, media_type="application/octet-stream", filename=doc.filename)

    @app.post("/api/v1/cases/{case_id}/facts", status_code=201)
    def import_facts(case_id: str, body: ImportFacts, identity: Auth, session: DB):
        user = identity[0]
        editable(user)
        case = case_for(session, user, case_id)
        docs = {d.id: d for d in session.scalars(select(Document).where(Document.case_id == case_id))}
        try:
            verify_facts(body.facts, docs)
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        bump(session, case, body.expected_revision)
        facts = FactSnapshot(case_id=case_id, case_revision=case.revision, payload=body.facts.model_dump(mode="json"))
        session.add(facts)
        audit(session, user, "facts.imported", case_id, mode="manual_structured", revision=case.revision)
        session.commit()
        return {"id": facts.id, "revision": case.revision, "extraction_mode": "manual_structured"}

    @app.post("/api/v1/cases/{case_id}/runs", status_code=201)
    def run_case(case_id: str, body: RunRequest, identity: Auth, session: DB,
                 idempotency_key: Annotated[str, Header(min_length=1, max_length=80)]):
        user = identity[0]
        case = case_for(session, user, case_id)
        key = f"{case_id}:{idempotency_key}"
        request_hash = sha256(body.model_dump_json().encode()).hexdigest()
        # Serialize case mutations and short deterministic runs. Move long model work to leased jobs.
        session.execute(select(Case).where(Case.id == case_id).with_for_update())
        session.refresh(case)
        previous = session.scalar(select(Run).where(Run.request_key == key))
        if previous:
            if previous.request_hash != request_hash:
                raise HTTPException(409, "Idempotency key already used with different inputs")
            return run_json(previous)
        if case.revision != body.expected_revision:
            raise HTTPException(409, "Stale case revision")
        facts = session.scalar(select(FactSnapshot).where(FactSnapshot.case_id == case_id, FactSnapshot.case_revision == case.revision))
        if not facts:
            raise HTTPException(409, "Import verified observations for the current case revision first")
        docs = {d.id: d for d in session.scalars(select(Document).where(Document.case_id == case_id))}
        inputs = FactSet.model_validate(facts.payload)
        verify_facts(inputs, docs)
        context = Context(actor_id=user.id, case_id=case_id, evaluation_date=body.evaluation_date,
                          permissions=frozenset({"case.analyze"}), document_kinds={key: d.kind for key, d in docs.items()})
        result = execute(registry, workflow, context, inputs)
        run = Run(case_id=case_id, case_revision=case.revision, request_key=key, request_hash=request_hash,
                  status=result["status"], result=result,
                  snapshot={"workflow": workflow.model_dump(mode="json"), "modules": registry.catalogue(),
                            "fact_snapshot_id": facts.id, "evaluation_date": str(body.evaluation_date),
                            "documents": {key: d.sha256 for key, d in docs.items()}})
        session.add(run)
        session.flush()
        audit(session, user, "run.completed", case_id, run_id=run.id, status=run.status)
        session.commit()
        return run_json(run)

    @app.get("/api/v1/cases/{case_id}/runs")
    def case_runs(case_id: str, identity: Auth, session: DB):
        case = case_for(session, identity[0], case_id)
        runs = session.scalars(select(Run).where(Run.case_id == case_id).order_by(Run.created_at.desc()).limit(50))
        return [{**run_json(run), "is_current": case.revision == run.case_revision} for run in runs]

    @app.get("/api/v1/cases/{case_id}/facts")
    def current_facts(case_id: str, identity: Auth, session: DB):
        case = case_for(session, identity[0], case_id)
        facts = session.scalar(select(FactSnapshot).where(FactSnapshot.case_id == case_id).order_by(FactSnapshot.created_at.desc()))
        return {"revision": facts.case_revision if facts else None, "is_current": bool(facts and facts.case_revision == case.revision),
                "facts": facts.payload if facts else None}

    def visible_run(run_id, identity, session):
        run = session.get(Run, run_id)
        if not run:
            raise HTTPException(404, "Run not found")
        case = case_for(session, identity[0], run.case_id)
        return run, case

    @app.get("/api/v1/runs/{run_id}")
    def get_run(run_id: str, identity: Auth, session: DB):
        run, case = visible_run(run_id, identity, session)
        return {**run_json(run), "is_current": case.revision == run.case_revision}

    @app.get("/api/v1/runs/{run_id}/findings")
    def findings(run_id: str, identity: Auth, session: DB):
        run, case = visible_run(run_id, identity, session)
        return {"is_current": case.revision == run.case_revision, "findings": run.result["findings"]}

    @app.get("/api/v1/runs/{run_id}/trace")
    def trace(run_id: str, identity: Auth, session: DB):
        run, _ = visible_run(run_id, identity, session)
        return run.result["trace"]

    return app
