# CaseCheck — progress and to-do

Single source of truth for scope, decisions, status and remaining work. Dated history lives in [LOG.md](LOG.md).
Earlier planning documents (HACKATHON_PLAN, BUILD_PLAN, DIRECTION_2_IMPLEMENTATION, BANK_WORKFLOWS, ROMANIA_ENTERPRISE_FEATURES, MARKET_AND_INNOVATION, IMPLEMENTATION_PLAN_REVIEW) were condensed here on 2026-10-28; their full text remains in Git history.

Last updated: 2026-10-28 · Repository: https://github.com/vlad-brasoveanu/Nexxt_AI_Hackathon_2026.git

## Goal and scope

48-hour hackathon, direction 2: an AI agent for repetitive internal banking work over documents, data and predefined rules, with live orchestration and modular APIs.

**CaseCheck** is an internal workspace that reviews a synthetic Romanian SME KYC onboarding file before substantive bank review. It extracts facts with source evidence, runs modular checks and routes the case to `READY_FOR_REVIEW`, `NEEDS_INFORMATION` or `ESCALATED`. It does not open accounts, certify compliance or make AML/lending decisions. All documents, identifiers and policies are fictional and labelled as such.

Roles: `manager` (relationship manager: creates own cases, uploads), `analyst` (operations: works team cases), `supervisor` (read and sign-off; cannot edit evidence).
Demo logins are static: all three use password `12345` (demo only).

## Architecture

- **Backend:** FastAPI + SQLAlchemy/Alembic, PostgreSQL (SQLite for local preview and tests). Packages under `backend/app/`:
  - `api/` — app factory plus one router per resource: session, cases, documents, facts, runs, catalogue
  - `core/` — contracts, security, audit
  - `ingestion/` — PDF/JSON parsing and evidence verification
  - `engine/` — module registry, workflow runner, workflow definitions
  - `modules/kyc/` — one file per check
- **Module contract:** a module declares id, version, rule IDs and permission, reads a `FactSet` and returns a `FindingSet`. The registry rejects missing versions, schema mismatches, missing dependencies and cycles. A new module joins through a new workflow version without runner changes, and a test proves this.
- **Integrity:**
  - Facts must quote their literal value from a stored document version (sha256 + page + span).
  - Any document or fact change bumps the case revision and makes earlier runs stale.
  - Runs are idempotent, and every mutation writes an audit event.
- **AI (planned, next):** a provider-independent inference interface. The demo uses a cloud adapter (Featherless, OpenAI-compatible), while the final product must use local inference with no silent cloud fallback. AI proposes facts and evidence, deterministic code verifies the quotes, and a human confirms before checks run.
- **Frontend:** React + Vite + TypeScript, served by the backend. To be regenerated with Lovable, UI only: no Lovable backend, auth or Git sync, because bot authorship is forbidden. Design is a charcoal sidebar, warm off-white surfaces, yellow accents and Romanian labels.

## Key decisions

- **Scope:** SME KYC discrepancy workflow from the participant brief and message.txt. Broad document-review AI already exists commercially, so the differentiation hypothesis is a bounded **evidence-conflict investigation agent**: it chooses the next permitted check to resolve a contradiction, with grounded evidence. Novelty is unproven; don't claim market-first.
- **Rule catalogue (12 MVP checks):**
  - VAL-01 identity expiry
  - VAL-02 CNP/CUI validity
  - CON-01 names
  - CON-02 company identifier
  - CON-03 addresses
  - CON-04 administrator/representative
  - BUS-01 mandate
  - BUS-02 shares total 100%
  - BUS-03 ownership vs declaration
  - BUS-04 bounded shareholder chain
  - BUS-05 extract age (fictional 90-day policy)
  - EXT-01 synthetic reference/sanctions/PEP candidates
  - BUS-06 (CAEN mapping) is deferred.
- **Outcome logic:** `FAIL` → `ESCALATED`; `UNKNOWN` → `NEEDS_INFORMATION`; module failure → `PROCESSING_FAILED`, which never counts as cleared.
- **Agent limits (planned):**
  - Tools: `read_source_span`, `reextract_fields`, `lookup_reference`, `evaluate_selected_rules`, `propose_information_request`.
  - At most 4 tool calls with 1 retry each, under a deadline.
  - It cannot change policy or approve, and information requests are drafts only.
- **Ownership demo:** A owns 50% of H, H owns 60% of C, so A has 30% indirect; B owns 40% directly. Code computes the paths and the AI only extracts citations. The graph is capped and acyclic.
- **Romania:** Romanian labels and templates, plus synthetic ANAF/ONRC-style fixtures. No live registry or bank integrations in the MVP.
- **Git:**
  - Each feature gets a `codex/<feature>` branch.
  - Commits use the user's identity (Vlad Brasoveanu).
  - No AI co-author trailers or signatures.

## Done (verified)

- [x] Backend foundation:
  - sessions with CSRF and scoped case access
  - PDF/JSON ingestion and source-verified facts
  - registry/runner with validation
  - idempotent, versioned runs
  - audit events, Alembic migration, Docker Compose
- [x] Three checks implemented: VAL-01, CON-02, BUS-05.
- [x] Local preview without Docker (`scripts/preview.py`, SQLite).
- [x] Hand-built React frontend (case list, upload, evidence, results). It's on `codex/review-workspace` and will be replaced by Lovable.
- [x] Realistic demo data: 8 fictional companies and 31 Chrome-rendered PDFs (application, registry certificate, ID copies, beneficial-owner declaration, mandate). `scripts/demo` loads them through the API. Each case got its expected verdict: 3 ready, 4 escalated, 1 needs information.
- [x] Static demo logins (`12345`). Compose now seeds them automatically.
- [x] Modular restructure: the API split into routers, one file per check, and tests grouped by area. All 24 tests pass, and the API routes are unchanged compared with `docs/openapi.json`.
- [x] Docs consolidated into PROGRESS.md + LOG.md.

## To do (priority order)

1. **AI extraction via Featherless** (branch `codex/featherless-extraction`).
   - Build the provider interface and Featherless adapter, plus extraction proposals that are quote-verified and then confirmed by an analyst.
   - Use fake-provider tests.
   - Measure accuracy and latency on the 8 demo cases.
   - Blocked on: `FEATHERLESS_API_KEY` in `.env`.
2. **Lovable frontend** (branch `codex/lovable-frontend`).
   - Screens: login, case list, side-by-side evidence, AI review/confirm, findings, audit trail.
   - Blocked on: Lovable plugin connected, and credits.
3. **Remaining 9 checks:** VAL-02, CON-01, CON-03, CON-04, BUS-01–04, EXT-01. Add a fixture for each.
4. **KYC as a first step:** a verified customer-profile output that later department workflows require as a precondition.
5. **Bounded investigation agent** (tools above), with evaluation against a no-agent baseline.
6. Supervisor sign-off workflow, case report export, and a background worker for model jobs.
7. Run against a real PostgreSQL instance (Docker engine was unavailable earlier).
8. Evaluations: correctness, evidence grounding, timeouts, prompt injection, plus manual vs assisted review time.
9. Submission: README, demo script, backup recording, and jury rehearsal.
10. **Final product:** choose local model and hardware, add a local inference adapter, and verify offline operation with no cloud fallback.

## Blockers and open questions

| Item | Impact | Next action |
| --- | --- | --- |
| Featherless key not yet in `.env` | AI step can't be verified live | You add `FEATHERLESS_API_KEY` to `.env` |
| Lovable plugin not connected | Frontend step can't start | You install the plugin and sign in |
| Organizer rules on cloud AI, tools and submission format unconfirmed | Submission risk | Ask organizers |
| Two rubric weights unreadable | Can't allocate the final 25% precisely | Get the official rubric |
| Workflow and roles not validated by a mentor | Demo may miss analyst priorities | Short mentor discussion |
| Local model/hardware unvalidated | Cloud demo doesn't prove local readiness | Benchmark during final-product phase |
