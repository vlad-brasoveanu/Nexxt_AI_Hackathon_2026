# CaseCheck

An internal Romanian SME document-review platform. **Early working foundation, not the finished hackathon MVP.** Synthetic data only. Current checks: identity expiry (VAL-01), company identifier agreement (CON-02), and fictional 90-day extract freshness (BUS-05). Observations are manually supplied and source-verified; no AI extraction or agent is enabled yet. Readiness applies only to these three checks, not full KYC or account opening.

## Run with PostgreSQL

Requires Python 3.12 or Docker Compose and a running Docker engine.

```sh
cp .env.example .env
# Edit .env: choose a random URL-safe database password and match DATABASE_URL.
docker compose up --build -d
# Set a private demo password in your shell, then seed explicitly:
read -s CASECHECK_DEMO_PASSWORD
export CASECHECK_DEMO_PASSWORD
docker compose exec -e CASECHECK_DEMO_PASSWORD api python -m app.seed
```

Accounts: `manager`, `analyst`, `supervisor`, using the password you supplied. API: http://127.0.0.1:8000/docs. API sessions use HttpOnly cookies and CSRF headers. Compose binds to loopback, with insecure cookies allowed only for this local HTTP demo. No public deployment is configured. The database port is internal to Compose.

For a separately running PostgreSQL instance:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock
export PYTHONPATH=backend
.venv/bin/alembic upgrade head
.venv/bin/python -m app.seed
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Verify and exercise

```sh
.venv/bin/pytest -q
.venv/bin/python scripts/demo.py fixtures/mismatch.json
```

Five reproducible foundation packets live in `fixtures/`. Their identifiers and policy are fictional. The API client uploads source pages, submits manually defined observations, runs the checks and verifies the expected disposition. JSON fixture uploads and text PDFs use the same evidence ingestion boundary. Scans/OCR and encrypted PDFs are unsupported.

Tests use isolated SQLite files to exercise application behavior without Docker. This is not a substitute for PostgreSQL locking/concurrency verification. Production database choice remains PostgreSQL. The initial migration and Compose setup must also be exercised against a running PostgreSQL instance before the persistence milestone is complete.

## Modules and integration

- `backend/app/contracts.py`: versioned observations, evidence, finding and workflow schemas.
- `backend/app/modules/`: trusted registry and three independently callable checking modules.
- `backend/app/runner.py`: graph/schema/permission validation, execution trace and deterministic routing.
- `backend/app/api.py`: sessions, scoped cases, ingestion, immutable fact snapshots, persisted runs and audit events.
- `docs/openapi.json`: generated API contract; regenerate with `scripts/export_openapi.py`.

A compatible module declares its schema, version, permission and rule IDs, returns `FindingSet`, and joins a new workflow version. The registry rejects missing versions, mismatched schemas, missing dependencies and cycles. The tests demonstrate extension without editing the runner. This first runner supports only FactSet → FindingSet modules, no arbitrary bindings, asynchronous jobs or hot-loaded code.

Runs are synchronous and short in this foundation. Do not put model calls into this transaction; the next backend milestone adds durable worker jobs and a bounded model/tool adapter. An uploaded document or changed observations increments the case revision, invalidates current-run eligibility and requires a new observation snapshot. Historical results remain accessible and are marked stale.

## Frontend direction

Use charcoal navigation, warm neutral content surfaces, yellow highlights and semantic status colors. Prioritize case review and side-by-side evidence, readable Romanian labels, keyboard accessibility and responsive layouts. Lovable-generated React may be integrated against this API; no Lovable backend or bot-authored Git sync. Frontend work uses a separate feature branch.

## Current limits

Remaining: AI extraction/investigation, ownership graph and other planned checks, leased background worker, reviewer approval workflow, login rate limiting, hardened ingestion resource isolation, full response schemas/typed frontend client, PostgreSQL recovery/concurrency tests and UI. No bank integrations, legal compliance certification, benchmark gains or bank-scale readiness are claimed.

See `PROGRESS.md` for verified results and `DIRECTION_2_IMPLEMENTATION.md` for the full target design.
