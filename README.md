# CaseCheck

An internal workspace for a Romanian bank's back office. Synthetic data only. Status, decisions and to-dos: [PROGRESS.md](PROGRESS.md). History: [LOG.md](LOG.md).

- **SME credit (multi-agent):** agents prepare the credit file end to end and humans decide. An Orchestrator (plan, state, policy guard) and a financial Analyst (synthetic history, sector statistics) coordinate seven specialists: Completitudine, Situații financiare, Fluxuri de numerar, KYB/Diligență, Politică, Memo and Critic. Smaller agents run on a smaller model (Qwen 7B); planning and the memo use the larger one (Qwen 14B). Without an API key everything runs in a labelled deterministic mode. The final decision (Aprobă / Modifică / Respinge) is signed by a human with the required authority: L1, L2, or L3 (committee, two votes).
- **KYC onboarding (foundation):** evidence-bound checks VAL-01, CON-02 and BUS-05 with AI-assisted extraction.

**Demo logins** (demo only, password `12345`):

| User | Role |
| --- | --- |
| `manager` | relationship manager: creates cases, starts the agents |
| `analyst` | operations analyst: reviews the extracted facts |
| `credit_analyst` | decides at L1 |
| `risk_officer` | decides at L2 |
| `committee_a`, `committee_b` | credit committee, L3 (two votes) |
| `supervisor` | read only |

## Run locally (no Docker)

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock
.venv/bin/python scripts/preview.py              # http://127.0.0.1:8000
.venv/bin/python scripts/demo/credit_seed.py     # in a second terminal: load the 3 synthetic credit cases
.venv/bin/python scripts/demo                    # optional: render + load the 8 KYC demo cases
```

- `scripts/preview.py` builds the frontend if needed, migrates a SQLite database in `.runtime/` and seeds the demo accounts. Delete `.runtime/local-preview.db` for a clean start.
- Start the server with `FEATHERLESS_API_KEY` exported to use the models. Without it, the agents run in deterministic mode and say so in the UI.

## Demo script (credit, about 3 minutes)

1. As `manager`, open **Codeforge Digital** and start the agents. Watch the plan, the Critic contesting the cash-flow conclusion with the KYB finding (an affiliated company), and the single consolidated client request (2024 statements and the collateral valuation).
2. Click "Simulează răspunsul clientului". The agents resume only what changed, detect the instruction hidden in the valuation report, and recommend a counter-offer at L2.
3. As `analyst`, accept the verified facts in one batch.
4. As `risk_officer`, review the decision cockpit (DSCR, LTV, precedents) and sign with hold-to-sign.
5. Under **Piață & politică**, publish a new ROBOR 3M fixing. The open cases are re-priced automatically.
6. Under **Metrici**, read the scoreboard.

**Manual baseline:** a team member processes the Codeforge file by hand with the same steps (checklist, statements, bank export, registry/bureau lookups, DSCR, memo). Record the measured seconds in `fixtures/credit/baseline.json`. The app shows "nemăsurat încă" until then.

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
  agents/         orchestrator, planner, task catalogue + guard, shared board, specialists/ (one file per agent)
  credit/         deterministic finance, policy engine (standards as data), sources, synthetic history statistics
  api/            app factory + one router per resource (session, cases, documents, facts, runs, agents, credit, market)
  ai/             provider interface, Featherless adapter, model routing by tier
  core/           contracts, security, audit
  ingestion/      PDF/CSV/JSON parsing, evidence verification
  engine/         KYC module registry, workflow runner, workflow definitions
  modules/kyc/    one file per KYC check
frontend/         React + Vite + TypeScript ("agent control room")
scripts/demo/     synthetic companies, document templates, PDF renderer, KYC and credit seeders, history generator
fixtures/credit/  credit standards (policy as data), ROBOR snapshots, synthetic sources, cases, history
tests/            api/, engine/, credit/ and agents/ suites
```

- **New KYC check:** a module that declares its manifest (id, version, rule IDs), reads a `FactSet` and returns a `FindingSet`. Register it in its domain package and add a step to a new workflow version; the runner does not change.
- **New agent:** a specialist function `(board, env) -> Report`, a catalogue entry with its dependencies and model tier, and a place in the planner's eligibility groups.
