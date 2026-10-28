"""HTTP layer: builds the FastAPI app from independent resource routers."""
from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.staticfiles import StaticFiles

from app.agents.orchestrator import Orchestrator
from app.ai import ModelRouter, build_provider, build_router
from app.api.routes import ROUTERS
from app.config import Settings
from app.credit.sources import Sources
from app.db import connect
from app.engine.workflows import default_registry, foundation_workflow


def create_app(settings: Settings | None = None, inference=None, models: ModelRouter | None = None):
    settings = settings or Settings()
    app = FastAPI(title="CaseCheck Foundation API", version="0.2.0",
                  description="Synthetic data only. KYC foundation (3 checks) and a multi-agent SME credit workflow: agents prepare and recommend, humans decide on authority levels.")
    engine, factory = connect(settings.database_url)
    registry, workflow = default_registry(), foundation_workflow()
    registry.validate(workflow)
    storage = Path(settings.storage_dir)
    storage.mkdir(parents=True, exist_ok=True, mode=0o700)
    app.state.settings, app.state.storage = settings, storage
    app.state.engine, app.state.session_factory = engine, factory
    app.state.registry, app.state.workflow = registry, workflow
    app.state.inference = inference if inference is not None else build_provider(settings)
    app.state.models = models if models is not None else build_router(settings)
    app.state.sources = Sources(settings.fixtures_dir)
    app.state.sources.history_path = settings.history_path
    app.state.orchestrator = Orchestrator(factory, settings, app.state.sources, app.state.models, storage)

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
