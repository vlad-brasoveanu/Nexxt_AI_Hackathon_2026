"""AI extraction proposals. The model call runs outside any database transaction; the analyst confirms
the proposed facts through POST /facts, which re-verifies every quote against the stored documents."""
from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from app.ai import InferenceError
from app.ai.extraction import PROMPT_VERSION, propose
from app.api.deps import DB, Auth, case_for, editable
from app.core.audit import audit
from app.db import Document, ExtractionProposal

router = APIRouter(prefix="/api/v1/cases/{case_id}/extractions", tags=["ai"])


def label(proposal):
    return f"{'Cloud demo' if proposal.mode == 'cloud' else 'Local'} · {proposal.provider} · {proposal.model} · date sintetice"


def proposal_json(proposal, case):
    return {"id": proposal.id, "case_revision": proposal.case_revision, "is_current": proposal.case_revision == case.revision,
            "status": proposal.status, "provider": proposal.provider, "model": proposal.model, "mode": proposal.mode,
            "label": label(proposal), "prompt_version": proposal.prompt_version, "latency_ms": proposal.latency_ms,
            "facts": proposal.facts, "rejected": proposal.rejected, "calls": proposal.calls, "error": proposal.error,
            "created_at": proposal.created_at}


@router.post("", status_code=201)
def create_extraction(case_id: str, request: Request, identity: Auth, session: DB):
    provider, settings = request.app.state.inference, request.app.state.settings
    user = identity[0]
    editable(user)
    if provider is None:
        raise HTTPException(503, "AI extraction is not configured (set FEATHERLESS_API_KEY on the server)")
    case = case_for(session, user, case_id)
    revision = case.revision
    documents = list(session.scalars(select(Document).where(Document.case_id == case_id).order_by(Document.created_at)))
    if not documents:
        raise HTTPException(409, "Upload documents before running extraction")
    session.rollback()  # release the read transaction before the slow model call
    status, error, facts, rejected, calls = "COMPLETED", None, {"facts": []}, [], []
    try:
        factset, rejected, calls = propose(provider, documents, settings.ai_timeout_seconds)
        facts = factset.model_dump(mode="json")
    except (InferenceError, ValueError) as exc:
        status, error = "FAILED", str(exc)[:200]
    proposal = ExtractionProposal(case_id=case_id, case_revision=revision, status=status, provider=provider.name,
                                  model=provider.model, mode=provider.mode, prompt_version=PROMPT_VERSION,
                                  latency_ms=round(sum(c["latency_ms"] for c in calls), 1),
                                  facts=facts, rejected=rejected, calls=calls, error=error)
    session.add(proposal)
    session.flush()
    audit(session, user, "extraction.proposed", case_id, proposal_id=proposal.id, status=status,
          provider=provider.name, model=provider.model, facts=len(facts["facts"]), rejected=len(rejected))
    session.commit()
    return proposal_json(proposal, case_for(session, user, case_id))


@router.get("/latest")
def latest_extraction(case_id: str, identity: Auth, session: DB):
    case = case_for(session, identity[0], case_id)
    proposal = session.scalar(select(ExtractionProposal).where(ExtractionProposal.case_id == case_id)
                              .order_by(ExtractionProposal.created_at.desc()))
    if not proposal:
        raise HTTPException(404, "No extraction for this case yet")
    return proposal_json(proposal, case)
