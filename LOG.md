# CaseCheck — work log

Dated, append-only record of work, decisions and validation evidence. Newest entries at the bottom. Current status and to-dos live in [PROGRESS.md](PROGRESS.md).

- 2026-10-28: Initial planning documents created from the supplied screenshots. Recorded feature-branch and no-AI-attribution requirements. Implementation remains unstarted.

- 2026-10-28: User required a working demo and a local AI model. Updated the plan with prioritized features, local runtime constraints, and offline acceptance tests. Hardware question pending; no model installed and no implementation started.

- 2026-10-28: User clarified that cloud AI is allowed for the MVP demo. Supersedes the earlier local-only demo requirement. Final product remains local; updated architecture, schedule, acceptance criteria, risks, and repository instructions. Hardware is no longer an MVP blocker. Planning only; no provider selected or API calls made.

- 2026-10-28: User requested department-specific access, bank-function research, and AI opportunities to improve profits/time/efficiency. Documented the SD-WAN/application-access distinction and a three-role workflow; added sourced research and explicit value hypotheses. Still planning only; no application code, commits, or pushes.

- 2026-10-28: User requested easy integration, bank-scale growth and Romanian-market/rule tailoring. Added staged feature catalogue and official-source research. Romanian templates and a minimal integration contract are MVP scope; live bank/registry access, real compliance mappings and scale validation are pilot work. No application functionality implemented.

- 2026-10-28: Reviewed the user-identified external implementation outline (428 lines). Recorded scope/integration, autonomy, authorization, model hosting, policy and reliability issues. Source left unchanged; review recommendations are not implemented.

- 2026-10-28: Evaluated Lovable for the complete MVP demo. Official docs support backend, auth, storage, functions and runtime AI; mapped scoring evidence and distinguished the build assistant from the runtime agent. Automatic Git sync uses bot authorship, so proposed reviewed snapshot export into the existing feature-branch workflow. No Lovable project, purchase, sync, code generation, commit or push performed.

- 2026-10-28: User requested a conventional implementation plan rather than Lovable. Created BUILD_PLAN.md; recommended React/TypeScript/Vite, FastAPI/Python, PostgreSQL/SQLAlchemy/Alembic, private storage, a small persisted-job worker and Docker Compose. Defined the first branch/milestones and updated the main plan. Planning only: no dependencies installed, application code, commits or pushes.

- 2026-10-28: User requested market novelty and solid AI. Market scan found direct commercial overlap; recorded a candid assessment and a proposed evidence-conflict investigation agent with independent verification and baseline evaluation. No unsupported market-first claim and no automatic scope pivot. Implementation remains unstarted.

- 2026-10-28: User supplied the direction-2 Word brief and message.txt and requested an exact modular implementation plan. Read both without changing sources. Planned SME KYC validity/consistency/business/reference modules with bounded ownership investigation; corrected automatic UBO fallback and incomplete BID eligibility examples using official sources. Updated authoritative plan references, module architecture and current build order. Still planning only.

- 2026-10-28: Recorded Lovable frontend plus conventional backend decision and reviewed functional adjustments for independent modules. Updated the main/build/detailed plans: standard contracts, centralized disposition, shared review actions, approved workflow versions and generic UI. Verified planning branch and reviewed Markdown updates; no app code, runtime tests, commits or pushes. Next: freeze contract examples and fixtures before coding; implementation remains unstarted.

- 2026-10-28: User authorized building. Created codex/workflow-foundation; verified configured Git identity as Vlad Brasoveanu. Implemented case/session API, CSRF and scoped authorization, private PDF/JSON ingestion, immutable source-verified manual observations, three rules, validated registry/runner, run idempotency/versioning, audit records, migration, setup and test harness. Initial 23 tests pass. Not AI-enabled; 9 planned checks and the worker remain outstanding. User requested strong frontend emphasis with black/yellow accents; preparing a dedicated frontend branch and local React implementation because no Lovable tool is connected.

- 2026-10-28: Added a Docker-free local preview (`scripts/preview.py`, SQLite) and a hand-built React frontend on `codex/review-workspace`.

- 2026-10-28: Generated realistic synthetic demo data: 8 fictional Romanian SMEs, 31 Chrome-rendered PDFs (application, registry certificate, ID copies, beneficial-owner declaration, mandate) with valid-checksum fictional CUI/CNP and a synthetic-data banner on every page. Loaded through the API; all 8 runs matched expected dispositions (3 READY_FOR_REVIEW, 4 ESCALATED, 1 NEEDS_INFORMATION). Pushed `codex/review-workspace`.

- 2026-10-28: Removed an AI co-author trailer from the pushed commit (now `3362f50`) and force-pushed with lease, per AGENTS.md.

- 2026-10-28: Branch `codex/restructure`. Demo logins made static (`manager`/`analyst`/`supervisor`, password `12345`); Compose seeds them. Backend split into `api/` routers, `core/`, `ingestion/`, `engine/` and `modules/kyc/` (one file per check); tests grouped into `tests/api` and `tests/engine`; demo seeder split into `scripts/demo/`. Validation: 24/24 tests pass; API paths identical to `docs/openapi.json`. Consolidated 8 planning docs into PROGRESS.md and this log. Decided Featherless (OpenAI-compatible) as the demo AI provider and Lovable for the UI only.

- 2026-10-28: Branch `codex/featherless-extraction`. Added `backend/app/ai/` (provider interface, Featherless adapter, evidence-bound extraction), `extraction_proposals` table + migration (alembic check clean), `POST /cases/{id}/extractions` and `GET .../latest`, `ai_assisted` extraction mode, health reports the AI provider, and `scripts/demo --ai`. Validation: 30/30 tests pass (6 new, offline via fake provider/mock transport). Live Featherless: model list OK; one-document timing 7B 2.0 s / 14B 5.7 s / 32B 3.3 s / 72B 15.9 s, all correct; default set to Qwen2.5-32B-Instruct. Reset preview DB and loaded all 8 cases with `--ai`: 26/26 values correct, 0 rejected, 6–14 s per case, all dispositions as expected. Found the Featherless key in tracked `.env.example` (committed in d3c7cfc); user chose to leave it.

- 2026-10-28: Branch `codex/lovable-frontend` (from `codex/featherless-extraction`). Built the UI with Lovable (project "Dosar KYC Clar", workspace "Vlad's Lovable"; no Lovable Cloud, auth, DB or GitHub sync). Gave it the `docs/openapi.json` contract shapes, sampled from the live preview. Copied the generated source into `frontend/` by hand, replacing the hand-built `App.tsx`. Converted TanStack Start to an SPA (TanStack Router, hash history), self-hosted the fonts, and adapted the client to the real API: findings come wrapped in `{is_current, findings}`, and the PDF loads as a blob. Added `created_at` to run JSON. Validation: `npm run build` (vite + `tsc --noEmit`) produces `frontend/dist`; the preview was restarted with dist deleted, so it rebuilt. Browser at http://127.0.0.1:8000:
  - Analyst: AgroVest extraction → COMPLETED 10.9 s, 4 facts; confirm r5→r6 (the old run is shown stale); run → ESCALATED (BUS-05 FAIL, 169 days; VAL-01 and CON-02 PASS) with highlighted quotes and a 3-step trace; history timeline correct.
  - Manager: Codeforge extraction → 5 facts, confirm r7→r8, run → READY_FOR_REVIEW.
  - Supervisor: extraction, confirm and run buttons are disabled, with a "Doar citire" badge. API: supervisor extraction 403, mutation without CSRF 403, but supervisor `POST /runs` returns 201 (policy gap, now in PROGRESS).
  - One extraction FAILED with "Model reply was not valid JSON". Reproduced directly: 2 of 6 Featherless calls returned malformed or garbled JSON at temperature 0. The retry succeeded.
  - `.venv/bin/pytest -q`: 30 passed.

- 2026-10-28: Restarted the preview with `CASECHECK_AI_MODEL=Qwen/Qwen2.5-14B-Instruct` (env only; code default unchanged) after a sibling session reported corrupted 32B output. `/health` reports the 14B model. A test extraction on Nordic Timber returned COMPLETED in 10.3 s, 4 facts correct (CUIs 45182753/45182735 differ, as designed), 0 rejected.

- 2026-10-28: Branch `codex/client-submissions` (from `codex/lovable-frontend`). Added `scripts/demo/submissions.py`, which renders synthetic client submissions into `fixtures/client_submissions/`.
  - Online channel, Codeforge Digital: a portal JSON payload, a 3-page confirmation PDF with a fictional QES block, and 7 uploaded PDFs.
  - Branch channel, Ceramica Horezu: 6 hand-filled forms (application, KYC questionnaire, beneficial owner, PEP, FATCA/CRS, signatories) plus 5 officer copies.
  - Each folder has a `manifest.json` intake envelope.
  - Validation:
    - all 19 PDFs pass `app.ingestion.parse_document` (text-extractable, 1–3 pages);
    - the manifest sha256 values match the files;
    - the handwritten values come out of text extraction;
    - the questionnaire and online ID photo were checked visually;
    - `pytest -q`: 30 passed (no backend changes).
  - Not loaded into the app: no seeder or UI yet.

- 2026-10-28: Branch `codex/agentic-workflow`. Multi-agent SME credit workflow (agent model from the user: Orchestrator → Analist financiar → 7 specialists → human Aprobă/Modifică/Respinge).
  - **Backend:**
    - `backend/app/agents/`: catalogue + guard, board, planner, orchestrator, specialists.
    - `backend/app/credit/`: finance, policy engine, sources, history statistics.
    - New routes: agents, credit, market.
    - Alembic `c41f2a9d7e10`.
    - Roles: credit_analyst, risk_officer, committee_a/b.
    - Supervisor can no longer start KYC runs.
    - Default large model is now Qwen2.5-14B, after the 2026-10-28 measurement.
  - **Fixtures:**
    - `scripts/demo/credit_fixtures.py` (3 cases, sources);
    - `scripts/demo/history.py` (600 synthetic past cases);
    - `scripts/demo/credit_seed.py`.
    - Subagents on Sonnet/Haiku wrote the history module and most of the fixture generator. They stopped at the session limit; I finished and ran it.
  - **Frontend:** "agent control room" with:
    - queue;
    - case workspace (live agent graph, timeline, consolidated request, review, decision cockpit with hold-to-sign, evidence, memo, group, cash flow, history);
    - market and metrics screens;
    - ⌘K palette and dark/light theme.
  - **Validation:**
    - `pytest -q`: 117 passed.
    - Codeforge (deterministic mode): one consolidated request with 2 items; the Critic contests the cash-flow gap (+19.9%) with the KYB affiliate finding; the re-run gives −2.3%; COUNTER_OFFER 3.440.000 RON at L2 (DSCR 1.20x, stress 1.16x, LTV 66.2%); ROBOR 6.05% re-prices to 3.420.000; the hidden instruction in the valuation is detected.
    - Transport: DECLINE at L1 (R-BUREAU-90D).
    - Nordic: CUI clarification request.
    - Scripted-model test: `loan.approve` refused, hallucinated values rejected.
    - `npm run build` passes.
    - Preview restarted and seeded with the 3 credit cases.
  - **Not verified:** browser rendering (handed to the user) and a live Featherless run.


- 2026-10-28: Branch `codex/theme-contrast`, created from the current `codex/agentic-workflow` checkout while preserving its uncommitted frontend changes. User requested a slightly brighter dark theme and a coordinated, more legible light theme. Adjusted shared CSS tokens, initial HTML backgrounds and the light OS fallback; graph/gauge strokes and sidebar logo now use contrasting tokens. Validation: frontend production build and TypeScript pass; 11 opaque text/background pairs checked per theme, minimum contrast 5.30:1. Browser checked the task queue, dark/light switch and credit-case analysis against mock data on port 5175. No backend changes, external inference, credit decisions, commit or push. Awaiting the user's visual feedback.

- 2026-10-28: Branch `codex/employee-workspace`. Simplified the current frontend around the bank employee's task: one actionable case list, concise credit summary, next action and source-backed fact review. Removed duplicated cards/flow bar and foreground technical IDs; moved model/trace/graph/demo controls, additional metrics, financial gauges and policy metadata into closed disclosures. Preserved document access, unresolved issues, stale-result warnings and decision blockers. Added discoverable per-field review buttons and kept partial review incomplete in the UI. Made the sidebar compact on narrow windows. Validation: production frontend build + TypeScript pass; targeted whitespace check clean; browser mock smoke checks of filters, disclosures, source view, confirm/save and read-only analyst decision view, with both themes. Backend unchanged, no real inference/decision, no commit or push. Backend handoff recorded for all-required-facts review gating and queue consistency.

- 2026-10-28: User rejected the employee-workspace redesign and explicitly requested the preceding interface be pushed to `codex/agentic-workflow`. Restored the prior task cards/full queue, wide sidebar/commands, 5-step case flow, four case tabs, visible graph/timeline, original review/decision/company layouts and combined statistics/market page. Preserved accepted contrast themes and previous readability/source-view changes. Removed the rejected summary component. Retained the nonvisual pending-facts completion guard. Validation: Vite production build and TypeScript pass; browser mock check confirms task cards/full queue, flow/graph/timeline, original tabs and fact-source view. Backend untouched; no live inference or human credit decision. Delivery uses verified Vlad Brasoveanu author/committer identity with no AI trailer and a regular push (no history rewrite). The unrelated demo PDF zip remains untracked.

## 2026-10-29 — PDF workflow and review controls

Branch `codex/pdf-credit-workflow`, based on original `codex/agentic-workflow`. Disabled OCR calls; textless PDFs return PDF_TEXT_REQUIRED. Added supported-template checks for type, company, financial year, currency/unit and application amount/term; tightened row extraction, cleared stale financial metrics, invalidate review when source changes, and require all facts reviewed before decision. Client requests are drafts with explicit manual send and manual reanalysis after response. Read-only agent loading no longer updates case revision. Backend work explicitly resumed; prospecting deferred. Validation: `.venv/bin/pytest -q` → 123 passed, one dependency deprecation warning. Tests upload the actual synthetic PDF fixtures through FastAPI. Cloud model not invoked.

## 2026-10-29 — Risk Planner backend

Branch `codex/risk-planner`, stacked on validated PDF workflow. Added supplied synthetic EUR SQLite history and provenance manifest; read-only schema/integrity/relation validation, explicit RO sector/product mapping and deterministic selection on pre-credit ratios only. No FTS/narrative/outcome data enters similarity. Agent history now uses the new dataset; unavailable history does not fall back to old CSV. Added persisted, version-bound Risk Planner API with requested/capacity/longer-term options, configurable cash-flow and rate stress, complete-review/blocking gates, and EUR/RON separation. Validation: 125 pytest tests passed; no live model calls.
