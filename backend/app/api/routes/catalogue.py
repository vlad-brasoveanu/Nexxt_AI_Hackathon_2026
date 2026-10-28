from fastapi import APIRouter, Request

from app.api.deps import Auth

router = APIRouter(tags=["catalogue"])


@router.get("/health")
def health():
    return {"status": "ok", "stage": "foundation", "ai_enabled": False}


@router.get("/api/v1/modules")
def modules(request: Request, identity: Auth):
    return request.app.state.registry.catalogue()


@router.get("/api/v1/workflow-definitions")
def workflows(request: Request, identity: Auth):
    return [request.app.state.workflow.model_dump(mode="json")]
