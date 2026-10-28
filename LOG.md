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
