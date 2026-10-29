# CaseCheck

Modular Romanian SME credit demo. Agents prepare evidence and recommendations; people make decisions. All documents, company records, history and policies are synthetic. Current delivery status: [PROGRESS.md](PROGRESS.md); dated validation: [LOG.md](LOG.md).

## Run the working demo

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock
npm ci --prefix frontend
npm run build --prefix frontend
.venv/bin/python scripts/preview.py
# In another terminal:
.venv/bin/python scripts/demo/credit_seed.py
```

Open http://127.0.0.1:8000. The preview migrates SQLite and seeds demo accounts. Rebuild the frontend and reload the browser after changes. The frontend uses the graphite/blue workspace with the real local API. The Dosare list opens credit and KYC cases in their corresponding workflows. Source review renders PDFs locally with Mozilla PDF.js and highlights validated citations; text/CSV/JSON sources retain exact-span text highlighting. No OCR or document upload to a third-party viewer is used.

| Demo user | Role | Password |
| --- | --- | --- |
| `officer` | Creates cases, uploads text PDFs/CSV, runs agents, reviews facts, sends consolidated requests manually | `12345` |
| `risk` | Reviews scenarios and signs decisions; L3 demo authority, separate from the preparer | `12345` |
| `admin` | All functions, user/policy administration and audit | `12345` |

Signing authority (L1/L2/L3) is independent of role. L3 normally requires two different people; an administrator can create another risk user and grant authority separately. Legacy users are migrated without changing their IDs or past audit records. Existing accounts are not reset by rerunning the seeder.

The local preview explicitly enables demo-only self-signing. It still requires a per-decision checkbox, a meaningful reason, fully reviewed evidence and a current analysis. Other deployments default to `CASECHECK_DEMO_ADMIN_OVERRIDE=false`. No real credit is granted or message sent externally.

## Walk through Codeforge

1. Log in as `officer`, open Codeforge and click **Analizează documentele**. These are uploaded PDF files, not frontend mock responses. The cash-flow critic detects related-company flows.
2. Inspect the consolidated draft and click **Am verificat ciorna · trimite solicitarea**. This records a manual send in the simulated portal.
3. Simulate the client answer, then click **Reanalizează dosarul**. The new financial PDF and valuation are parsed; an embedded instruction is flagged as untrusted document text.
4. Review the extracted facts next to their source PDF. Corrections, rejections and conflicting values require a reason. Correcting a financial fact recalculates affected indicators. Re-uploading the same filename creates a replacement source version; historical bytes remain available.
5. Open **Risk Planner**. Before complete review no favorable recommendation is produced. After review, compare the request, capacity at the requested term and a permitted longer-term option. Change cash-flow/rate stress assumptions.
6. Log in as `risk` to decide. Preparers/reviewers cannot sign their own case outside the explicit administrator demo exception. The decision remains human.
7. As `admin`, inspect users, role counts, policy versions and audit. Publishing policy thresholds makes open analyses stale; it does not rewrite closed decisions.

OCR is deliberately outside the MVP: every PDF page needs extractible text. Textless/scanned PDFs return `PDF_TEXT_REQUIRED`. Supported financial demo templates are checked for type, company, CUI, financial year, RON currency and units. Ambiguous/unsupported documents need replacement or review; this is not a universal document parser.

## Risk Planner and AI

`fixtures/credit/history/historical_cases.db` contains 6,000 supplied synthetic EUR credit cases (3,726 RO), confirmed by the user. Its provenance and SHA256 are recorded beside it. The adapter opens SQLite read-only, checks schema/integrity/relations and validates financial rows.

Matching uses pre-credit financial ratios and company age/employees where available, restricted to Romania and an explicitly mapped sector/product. It selects at most 30 neighbors and displays five examples. Outcomes, flags and retrospective narratives never select the neighbors. Future outcomes are censored conservatively because the approval day is unavailable. Outcome shares describe the selected sample with varied observation periods; they are not a personalized default probability. EUR history amounts are displayed separately from the RON application; there is no implicit FX conversion.

The deterministic policy engine computes requested terms, capacity, DSCR, LTV and stress. The planner's default extra scenario reduces CFADS by 10%; both that reduction and rate shock can be changed in simulation. The ranking maximizes admissible amount up to the request, breaking ties toward the shorter simulated term. CFADS = EBITDA minus tax is an explicit demo approximation.

Export `FEATHERLESS_API_KEY` before starting the server to enable cloud AI on synthetic documents. Qwen 7B proposes financial values; Qwen 14B plans tasks and drafts the memo. Values must match source evidence; model errors and deterministic processing are visible. Without a key, the demo runs in **Mod determinist · fără AI**. Final-product local inference remains a separate adapter and offline validation task; no local/offline readiness is claimed.

## Validate and reproduce

```sh
.venv/bin/pytest -q
npm run build --prefix frontend
# Against the running real API; creates a fresh SYNTHETIC Codeforge case:
.venv/bin/python scripts/demo/verify_credit.py
# Optional alternate port:
.venv/bin/python scripts/demo/verify_credit.py --url http://127.0.0.1:8015
PYTHONPATH=backend .venv/bin/python scripts/export_openapi.py
```

The HTTP smoke test covers upload → draft/manual send → response/manual rerun → source facts → review → history/scenarios → correction/recalculation → separate decision → audit. It writes `.runtime/credit-smoke.json`. Its duration is automated test time, not employee productivity. The human manual baseline stays unmeasured until a person completes a timed review; record that separately in `fixtures/credit/baseline.json`.

PostgreSQL deployment uses Docker Compose (`docker compose up --build -d`) with `.env` configured locally. API docs: `/docs`. SQLite is for local demo/tests; production concurrency and PostgreSQL deployment require separate validation.

## Modules and interfaces

- `agents/`: bounded orchestrator, task catalogue, specialists and source-sensitive fact review.
- `credit/`: deterministic arithmetic, versioned policy and replaceable registry/bureau/market sources.
- `risk/`: read-only historical adapter and scenario planner. Reports persist dataset hash, policy, market, assumptions and case/run revision.
- `api/routes/`: sessions, cases/documents, agent runs/review, decisions, Risk Planner and administration.
- `core/`: contracts, permissions, audit and active policy selection.
- `ingestion/`: text PDF/CSV/JSON parsing and source verification; OCR excluded.
- React frontend: existing layout and typed same-origin API with cookie/CSRF protection. `dev:mock` is only the older UI preview; the new planner/admin controls require the real API.

Key additions: `POST /api/v1/agent-runs/{id}/risk-planner`, `GET /api/v1/cases/{id}/risk-reports`, manual request `/send`, and `/api/v1/admin/{users,audit,policies}`. Full contract: `docs/openapi.json`.

Prospecting is deferred: a separate company source and an existing-client list keyed by CUI are needed. The anonymous historical database cannot identify new companies to contact.


Frontend tooling requires Node.js 22.13+ (validated with 22.23.1). Run `npm run test:evidence --prefix frontend` for citation matching regressions (repeated amounts, ambiguous context, incorrect spans, Unicode and split PDF text). If a PDF citation cannot be uniquely positioned, the viewer displays an explicit warning instead of marking a different value.


The case analysis screen includes **Execuție în timp real** (coordinator, active specialist, dispatches, critic rechecks and outcomes) and **Rezultate și surse**. The execution workspace is visible before a run starts; clicking **Analizează documentele** starts real processing. Click a specialist to inspect its result. Run `npm run test:agents --prefix frontend` for dispatch/rerun/current-state presentation regressions.
