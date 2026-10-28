"""HTTP layer: builds the FastAPI app from independent resource routers."""
from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.staticfiles import StaticFiles

from app.ai import build_provider
from app.api.routes import ROUTERS
from app.config import Settings
from app.db import connect
from app.engine.workflows import default_registry, foundation_workflow


def create_app(settings: Settings | None = None, inference=None):
    settings = settings or Settings()
    app = FastAPI(title="CaseCheck Foundation API", version="0.1.0",
                  description="Synthetic-data foundation: 3 checks; facts entered manually or proposed by AI and confirmed by an analyst. Worker and full KYC are not implemented yet.")
    engine, factory = connect(settings.database_url)
    registry, workflow = default_registry(), foundation_workflow()
    registry.validate(workflow)
    storage = Path(settings.storage_dir)
    storage.mkdir(parents=True, exist_ok=True, mode=0o700)
    app.state.settings, app.state.storage = settings, storage
    app.state.engine, app.state.session_factory = engine, factory
    app.state.registry, app.state.workflow = registry, workflow
    app.state.inference = inference if inference is not None else build_provider(settings)

    @app.middleware("http")
    async def origin_and_headers(request, call_next):
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            if origin and origin.rstrip("/") not in {str(request.base_url).rstrip("/"), *settings.allowed_origins}:
                return Response(status_code=403, content="Cross-origin mutation denied")
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response

    for router in ROUTERS:
        app.include_router(router)
    if settings.frontend_dir:
        app.mount("/", StaticFiles(directory=settings.frontend_dir, html=True), name="frontend")
    return app
