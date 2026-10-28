# CaseCheck — progress and to-do

Single source of truth for scope, decisions, status and remaining work. Dated history lives in [LOG.md](LOG.md).
Earlier planning documents (HACKATHON_PLAN, BUILD_PLAN, DIRECTION_2_IMPLEMENTATION, BANK_WORKFLOWS, ROMANIA_ENTERPRISE_FEATURES, MARKET_AND_INNOVATION, IMPLEMENTATION_PLAN_REVIEW) were condensed here on 2026-10-28; their full text remains in Git history.

Last updated: 2026-10-29 · Repository: https://github.com/vlad-brasoveanu/Nexxt_AI_Hackathon_2026.git

## Approved delivery — 2026-10-29 (current; supersedes older scope below)

Original frontend retained. Backend work resumed by the user. Delivery order: PDF workflow → Risk Planner → three roles/audit → original frontend integration. Prospecting deferred. No OCR in the MVP; scans need replacement with text PDFs. Cloud inference remains synthetic-demo only.

- [x] `codex/pdf-credit-workflow`: PDF text validation, explicit scan error, document type/company/year/currency/unit checks for supported demo templates, source-sensitive review, complete-review decision gate, missing-bureau guard, client request drafts/manual send/manual reanalysis.
- [x] Validation: 123 pytest tests pass, including real PDF upload through the API, human decision workflow, partial review rejection, scan rejection, and source-review invalidation. No live model calls in this validation.
- [x] Historical SQLite adapter (6,000 synthetic EUR cases; 3,726 RO), reproducible comparable selection and stress/capacity planner. No personalized default probability. Risk reports persist their inputs, dataset hash, policy, market and run revision. Validation: 125 tests pass, including leakage resistance, RO/product isolation, missing indicators, review gate, stress and API access.
- [x] Case officer, risk reviewer, administrator; separate authority levels, audited demo-only self-approval, user/policy administration and session revocation. Migration from the old roles preserves user IDs and authority; demo accounts are officer/risk/admin. Validation: 129 tests pass and all Alembic migrations plus seed ran on a fresh SQLite DB.
- [ ] Original frontend API integration, Risk Planner and administration tabs; live API browser smoke and build.
- [ ] Reproducible demo script and measured operational metrics. Production/local model validation remains future work.

## Goal and scope

48-hour hackathon, direction 2: an AI agent for repetitive internal banking work over documents, data and predefined rules, with live orchestration and modular APIs.

**CaseCheck** is an internal workspace that reviews a synthetic Romanian SME KYC onboarding file before substantive bank review. It extracts facts with source evidence, runs modular checks and routes the case to `READY_FOR_REVIEW`, `NEEDS_INFORMATION` or `ESCALATED`. It does not open accounts, certify compliance or make AML/lending decisions. All documents, identifiers and policies are fictional and labelled as such.

Roles: `manager` (relationship manager: creates own cases, uploads), `analyst` (operations: works team cases), `supervisor` (read and sign-off; cannot edit evidence).
Demo logins are static: all three use password `12345` (demo only).

## Multi-agent SME credit workflow (branch `codex/agentic-workflow`, 2026-10-28)

The pitch is now framed as an SME credit file prepared from application to human decision, with KYC as the first step. Agents prepare and recommend; a human with the required authority decides. Scope change: the earlier "does not make lending decisions" now reads "does not decide autonomously; it records human decisions prepared by the agents".

- **Agent model:**
  - Orchestrator (plan, state, policy guard) → Analist financiar (synthetic history, sector statistics) → seven specialists: Completitudine, Situații financiare, Fluxuri de numerar, KYB/Diligență, Politică, Memo, Critic.
  - The human acts: Aprobă / Modifică / Respinge.
  - Code: `backend/app/agents/`.
- **Autonomy fixed in code** (`agents/catalog.py`):
  - The planner may only order eligible catalogue tasks.
  - `loan.approve`/`loan.reject`/`policy.change`/`evidence.delete`/external contact are refused and recorded.
  - Missing documents and client-fixable issues go out automatically as one consolidated request through a simulated portal, and are skipped on knock-out cases.
- **Model routing by tier:**
  - Large (Qwen 14B): planning, memo.
  - Small (Qwen 7B): statement extraction, client message.
  - Deterministic: everything else.
  - Without a key, the run is labelled "Mod determinist". Every model value is re-anchored to its row label in the source text; memo numbers must appear in the data sheet.
- **Policy as data:**
  - Credit standards live in `fixtures/credit/standards/*.json`, ROBOR 3M in market snapshots.
  - The engine `backend/app/credit/policy.py` gives a recommendation (APPROVE, APPROVE_WITH_CONDITIONS, COUNTER_OFFER, DECLINE, NEEDS_INFORMATION), reason codes, conditions and an authority level (L1 ≤ 500k, L2 ≤ 5M group exposure, L3 committee with 2 votes).
  - A new fixing re-prices cases waiting for a decision automatically.
- **Human controls:**
  - Batch fact review (analyst) is required before a decision.
  - Four eyes: the preparer or reviewer cannot decide.
  - Overrides need a reason; L3 needs two committee votes.
  - Decision on the current case revision only.
- **Data:** 3 synthetic credit cases (Codeforge counter-offer, Nordic CUI clarification, Transport 95-day bureau knock-out), simulated registry/bureau/exposures/sanctions, 600 synthetic past cases for benchmarks and precedents (descriptive only, never an input to the decision).

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
- **AI:** `backend/app/ai/` holds a provider-independent `InferenceProvider` interface and a Featherless adapter (OpenAI-compatible, default `Qwen/Qwen2.5-32B-Instruct`, one bounded retry, no silent fallback).
  - `POST /cases/{id}/extractions`: the model proposes field values per document. The server locates each value verbatim in the stored page text, builds the evidence span itself and drops anything it can't find. The proposal is stored with provider, model, prompt version and latency, and the call runs outside the database transaction.
  - The analyst confirms through `POST /facts` with `extraction_mode: ai_assisted`, which re-verifies every quote.
  - The UI label is "Cloud demo · featherless · <model> · date sintetice". The final product must swap in a local adapter.
- **Frontend:** React + Vite + TypeScript + Tailwind/shadcn, built to `frontend/dist` and served by the backend.
  - Generated with Lovable (project "Dosar KYC Clar"), UI only: no Lovable backend, auth, database or Git sync, because bot authorship is forbidden. The code was copied in by hand and committed under the user's name.
  - Lovable scaffolded TanStack Start (SSR). The repo uses TanStack Router as a plain SPA with hash routing, because the backend's static mount has no SPA fallback.
  - One typed client, `frontend/src/lib/api.ts`: same-origin cookie session, `x-csrf-token` from the session response on every mutation, and `Idempotency-Key` on runs. `lib/mock.ts` holds synthetic fixtures, used only on Lovable hosts or with `npm run dev:mock`.
  - PDFs are fetched as blobs and shown through an object URL, because the download endpoint sends `octet-stream` as an attachment.
  - Design: charcoal sidebar, warm off-white surfaces, yellow accents, semantic status colours, Romanian labels, self-hosted IBM Plex fonts.

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
- [x] **AI extraction via Featherless** (branch `codex/featherless-extraction`):
  - provider interface, adapter, proposals endpoint, migration, and the `scripts/demo --ai` mode
  - 6 new offline tests: valid flow, hallucinated value rejected, provider failure recorded, missing key → 503, retry, no key leak
  - Live run on all 8 demo cases: 26/26 values correct, 0 rejected, 6–14 s per case, and all verdicts as expected.
  - Model timing on one registry extract: 7B 2.0 s, 14B 5.7 s, 32B 3.3 s, 72B 15.9 s. All four were correct.
  - Caveat: the demo PDFs include machine-readable lines such as `extract_date: 2026-09-29`, which makes extraction easy. Messier documents haven't been evaluated yet.

- [x] **Lovable frontend** (branch `codex/lovable-frontend`):
  - Screens: login with demo hint; case list with disposition filters and search; case detail with Documente (PDF side by side with highlighted evidence), Extragere AI (proposal label/model/latency, proposed and rejected facts, confirm), Verificări (run, findings by outcome with evidence quotes, trace) and Istoric (client-side timeline).
  - The supervisor sees disabled actions and a "Doar citire" badge.
  - Backend: runs now include `created_at`, used by the timeline.
  - Verified in the browser against the preview for all three roles (details in LOG.md). 30/30 tests pass.

- [x] **Client submission mockups** (branch `codex/client-submissions`, `scripts/demo/submissions.py` → `fixtures/client_submissions/`). These are the files as the bank receives them, on two channels, for two existing demo companies:
  - **Online (Codeforge Digital):**
    - `formular-online.json` holds the portal's structured payload, with fields prefilled from ONRC/ANAF marked as such.
    - A portal confirmation PDF combines the application, KYC questionnaire, beneficial-owner, PEP and FATCA/CRS declarations and the signatories list, signed with a fictional qualified e-signature.
    - Client uploads: registry certificate, articles of association, 2025 financials, mandate, and 3 ID photos.
  - **Branch (Ceramica Horezu):**
    - 6 paper forms filled in by hand (handwriting font) and scanned at the counter.
    - Officer-certified copies of the IDs, registry certificate, articles of association and financials.
    - No structured payload exists, so the operator must key in or extract the data.
  - Each folder's `manifest.json` is the intake envelope: channel, received at/by, identification method (video-ID or in person), signature type, status, and every file with its document kind and sha256.
  - Not yet loadable in the app: there is no seeder, UI inbox or channel field. The new forms carry no machine-readable `label: value` lines, and the online ID photos lack `identity_expiry:`, so VAL-01 needs AI or manual extraction for them.

- [x] **Multi-agent credit workflow** (branch `codex/agentic-workflow`): agents, policy engine, API (runs, SSE events, review, simulated client answer, what-if, guard test, decision, queue, market, metrics), migration `c41f2a9d7e10`, fixtures, "agent control room" frontend. `pytest -q`: 117 passed (10 end-to-end agent tests). `npm run build` passes. Not yet visually checked in the browser (the user is doing it), and no live run with the Featherless models yet.

## Decisions on 2026-10-28 (evening)

- **Rules folder (`~/Desktop/Reguli`):** it targets personal consumer credit (Flexicredit) and excludes company credit. Decision: keep the SME product. From the folder, apply only the rules that fit a company:
  - KYC and PEP (Legea 129/2019, Reg. BNR 2/2019);
  - GDPR;
  - consultation of the Central Credit Register (Reg. BNR 4/2025, art. 23: consent form F5).

  Show the source of each rule in the UI. The personal-credit rules (40% debt-to-income, ID validity by age, ANAF certificate) stay out.
- **Public news agent (under KYB):** a simulated source, because the demo companies are fictional, plus a replaceable interface for a real feed.
- **Scans (superseded 2026-10-29):** no OCR in the MVP; textless PDFs are rejected explicitly.
- **Agent stack:** we keep our own orchestrator and `InferenceProvider`, not the OpenAI Agents SDK/Bedrock from Florin Iacob's plan. The principles match: the orchestrator is code, sub-agents are tools, calculations are deterministic, every claim has a source, the human decides.

## Theme refinement (2026-10-28, branch `codex/theme-contrast`)

- [x] Dark theme lifted from near-black to layered anthracite (`#202329` canvas, `#292e35` cards), with clearer borders and secondary text.
- [x] Light theme uses a warm grey/ivory/olive palette instead of stark white; sidebar, panels, fields and status colours have distinct contrast.
- [x] Graph edges, decision-gauge strokes and the sidebar logo use contrasting theme tokens, keeping the bright agent accent for filled actions.
- [x] Initial HTML backgrounds and OS-preference fallback match the updated palettes.
- Validation: `npm run build --prefix frontend` passes (Vite + TypeScript). Eleven opaque text/background token pairs per theme measured at least 5.30:1; this is a token check, not a full accessibility audit. Browser checked theme switching, task queue and credit-case analysis using the existing mock frontend at `http://127.0.0.1:5175/`; no backend calls or credit decisions were made.
- Existing uncommitted frontend work was preserved. No commit or push for this theme refinement; user visual review remains pending.

## Frontend layout decision (2026-10-28)

The user rejected the `codex/employee-workspace` redesign and selected the previous layout with text/information-only refinements. The delivery target is `codex/agentic-workflow`, as explicitly requested.

- Restored task cards plus the full queue, full sidebar/commands, five-step case bar, four original case tabs, visible agent graph/timeline, original fact-review layout, decision gauge/terms panels, company/cash-flow views and the combined statistics/market screen.
- Retained the accepted anthracite/light contrast palette, earlier larger typography and side-by-side source document review. Removed the new summary component and compact icon-sidebar redesign.
- Retained the frontend pending-facts guard: partial review is not treated as completed. Backend remains paused and unchanged; its all-required-facts gate/queue consistency still needs verification by the backend owner.
- Only small copy changes remain (shorter explanations/labels and optional suspicious-document text). Any further content simplification must preserve the restored screen structure.
- Existing frontend work from before the redesign is retained, including the consolidated statistics route. The unrelated `fixtures/demo_pdfs.zip` remains outside this delivery.
- Validation is recorded in LOG.md. No AI authorship/trailers; use the verified user's Git identity. Regular push only; no history rewrite.

## To do (priority order)

- **Backend resumed 2026-10-29:** follow the approved delivery checklist above; the earlier pause is revoked.
- **Frontend restructured for readability (2026-10-28, build passes, not yet checked in the browser):**
  - Text 15–16 px, labels 12 px in sans, higher contrast.
  - The home page is "Sarcinile mele", with tasks by role.
  - The case page has a 5-step flow bar, a single "Ce ai de făcut acum" box and 4 tabs:
    - Analiza agenților;
    - Verificarea faptelor, with the source document alongside;
    - Decizie, with rules and memo;
    - Profilul firmei.
  - Removed the duplicates: the separate History, Evidence and Memo tabs and the KPI strip.
  - Metrici and Piață are now a single page, "Statistici și piață".
- **Still to do in the backend (from the list below):** points 2–4 (document type check, rules from the folder with citations, news agent). The frontend will show them on mock data.
- **List:**
  1. OCR deferred; textless PDFs are rejected in the MVP.
  2. Document type check: the agent verifies from the content that each document matches its declared type. A mismatch becomes an issue and goes into the consolidated client request.
  3. Rules from the folder: KYC/PEP, CRC consent and GDPR as policy rules, with a citation of the act and article.
  4. Public news agent under KYB (simulated source + interface).
  5. Frontend: more readable (larger fonts, higher contrast, larger hit areas); merge Metrici and Piață și politică into one page.
- **Then:**
  - Single-prompt comparison vs. agents (point 4 of Florin's plan; Codeforge is a good candidate).
  - Commit after the user checks the UI in the browser.

- **Credit demo:**
  - Browser check of the new UI in both themes.
  - One live run with `FEATHERLESS_API_KEY` (14B/7B) to check planning and memo quality.
  - Measure the manual baseline into `fixtures/credit/baseline.json`.
  - Optional: live BNR ROBOR feed behind the market interface (research not done; the subagent hit the session limit).

0. **Client submissions in the app:** load `fixtures/client_submissions` through the API (a seeder reading `manifest.json`), add the channel and intake metadata to cases, and decide which declared answers (purpose, cash, PEP, FATCA/CRS) feed new checks.

1. **Extraction robustness:** Featherless/Qwen-32B sometimes returns malformed JSON at temperature 0, and one bad document fails the whole proposal. Retry parse failures per document, or record that document as rejected. Workaround: start the preview with `CASECHECK_AI_MODEL=Qwen/Qwen2.5-14B-Instruct` (a sibling session measured 32B at 0/10 correct and 14B at 10/10 on 2026-10-28).
2. **Remaining 9 checks:** VAL-02, CON-01, CON-03, CON-04, BUS-01–04, EXT-01. Add a fixture for each.
3. **KYC as a first step:** a verified customer-profile output that later department workflows require as a precondition.
4. **Harder AI evaluation:** documents without machine-readable lines, DD.MM.YYYY dates, scans, and prompt-injection text.
5. **Bounded investigation agent** (tools above), with evaluation against a no-agent baseline.
6. Supervisor sign-off workflow, case report export, and a background worker for model jobs.
7. Run against a real PostgreSQL instance (Docker engine was unavailable earlier).
8. Evaluations: correctness, evidence grounding, timeouts, prompt injection, plus manual vs assisted review time.
9. Submission: README, demo script, backup recording, and jury rehearsal.
10. **Final product:** choose local model and hardware, add a local inference adapter, and verify offline operation with no cloud fallback.

## Blockers and open questions

| Item | Impact | Next action |
| --- | --- | --- |
| Featherless key sits in tracked `.env.example` (committed in `d3c7cfc`, pushed to private `codex/restructure`); you chose to leave it there | The app only reads `.env`, so the key must be exported when starting the server; the key is in Git history | Optional: copy it into `.env` (git-ignored); rotate it before the repo is ever shared |
| Supervisor can `POST /cases/{id}/runs` (no `editable()` guard; extraction and facts are blocked) | The UI blocks it, but the API allows it | Decide whether supervisors may run checks; if not, add the guard and a test |
| Organizer rules on cloud AI, tools and submission format unconfirmed | Submission risk | Ask organizers |
| Two rubric weights unreadable | Can't allocate the final 25% precisely | Get the official rubric |
| Workflow and roles not validated by a mentor | Demo may miss analyst priorities | Short mentor discussion |
| Local model/hardware unvalidated | Cloud demo doesn't prove local readiness | Benchmark during final-product phase |
