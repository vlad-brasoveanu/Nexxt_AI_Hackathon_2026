# CaseCheck

An internal Romanian SME KYC document-review workspace. Synthetic data only. Status, decisions and to-dos: [PROGRESS.md](PROGRESS.md). History: [LOG.md](LOG.md).

**Demo logins** (demo only): `manager`, `analyst` or `supervisor`, password `12345`.

## Run locally (no Docker)

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock
.venv/bin/python scripts/preview.py        # http://127.0.0.1:8000
.venv/bin/python scripts/demo              # in a second terminal: render + load 8 demo cases
```

`scripts/preview.py` builds the frontend if needed, migrates a SQLite database in `.runtime/` and seeds the demo accounts. Delete `.runtime/local-preview.db` for a clean start.

## Run with PostgreSQL (Docker Compose)

```sh
cp .env.example .env   # set CASECHECK_DB_PASSWORD
docker compose up --build -d
```

Migrations and demo accounts are applied automatically. API docs: http://127.0.0.1:8000/docs.

## Test

```sh
.venv/bin/pytest -q
.venv/bin/python scripts/run_fixture.py fixtures/mismatch.json   # one JSON fixture against a running API
.venv/bin/python scripts/export_openapi.py                       # regenerate docs/openapi.json
```

## Code layout

```
backend/app/
  api/            app factory + one router per resource (session, cases, documents, facts, runs, catalogue)
  core/           contracts, security, audit
  ingestion/      PDF/JSON parsing, evidence verification
  engine/         module registry, workflow runner, workflow definitions
  modules/kyc/    one file per check (validity, consistency, freshness)
frontend/         React + Vite + TypeScript
scripts/demo/     synthetic companies, document templates, PDF renderer, API seeder
fixtures/         JSON foundation packets and rendered demo PDFs
tests/            api/ and engine/ test suites
```

A new check is a module that declares its manifest (id, version, rule IDs), reads a `FactSet` and returns a `FindingSet`. Register it in its domain package and add a step to a new workflow version; the runner does not change.
