# Project progress

Last updated: 2026-10-28 (Europe/Bucharest)
Current phase: Implementation — backend foundation and frontend kickoff
Current branch: codex/workflow-foundation
Repository: https://github.com/vlad-brasoveanu/Nexxt_AI_Hackathon_2026.git

## Achieved

- [x] Reviewed the supplied challenge and scoring screenshots.
- [x] Captured the four readable weights and marked the other weights unconfirmed.
- [x] Proposed a narrow document-completeness and consistency review MVP.
- [x] Defined scope, acceptance criteria, architecture, synthetic cases, evaluation targets, schedule, and demo narrative in HACKATHON_PLAN.md.
- [x] Created persistent instructions for progress updates, separate feature branches, and Git attribution.
- [x] Selected the dedicated planning branch and configured the supplied repository as origin.
- [x] Checked remote HEAD: no refs were returned at planning time; local checkout had no commits.

- [x] Revised architecture for cloud inference in the synthetic-data MVP and local inference in the final product, following the latest user clarification.
- [x] Prioritized working-demo features and cloud-provider go/no-go gates; moved local/offline checks to the final-product phase.
- [x] Checked official Ollama documentation for local-only configuration, structured outputs, and tool calling.

- [x] Added BANK_WORKFLOWS.md with department responsibilities, automation hypotheses, three-role access design, and profitability measurement boundaries.
- [x] Revised the MVP to one shared workflow with department-specific views, server-side permissions, and structured handoffs.

- [x] Added ROMANIA_ENTERPRISE_FEATURES.md with staged feature catalogue, official Romanian/EU references, integration path and scale acceptance criteria.
- [x] Updated MVP scope for Romanian templates/labels and a small documented case API with synthetic reference adapters.

- [x] Located and reviewed the external outline-the-departments-of-adaptive-kernighan.md; saved prioritized findings in IMPLEMENTATION_PLAN_REVIEW.md without modifying the source.

- [x] Assessed Lovable against the judging rubric and official platform docs; documented viable full-stack MVP path and Git attribution constraints.

- [x] Researched commercial overlap in official UiPath, Fenergo, WorkFusion, FlowX and Concentrix sources; saved MARKET_AND_INNOVATION.md.
- [x] Proposed a bounded evidence-conflict investigation focus and comparative evaluation; novelty remains unproven.

- [x] Read the complete participant-brief text and message.txt; confirmed direction-2 live agent/modularity requirements.
- [x] Mapped the source to four discrepancy families and 12 scoped SME KYC checks; identified beneficial-owner and BID simplifications requiring correction.
- [x] Created DIRECTION_2_IMPLEMENTATION.md with typed module contracts, workflow definition, ownership logic, API/data contracts, failure behavior and build sequence.

- [x] Recorded hybrid frontend/backend boundaries and functional adjustments for modular workflows; documented a concrete modularity acceptance gate. These are design decisions, not implemented functionality.

## Remaining — planning decisions

- [x] Created BUILD_PLAN.md for the conventional stack; latest frontend choice is Lovable-generated React with the same independent backend.
- [x] User selected message.txt-driven SME KYC work under direction 2; adaptive evidence investigation is integrated into that scope, not a separate pivot. Market novelty remains unproven.
- [ ] Confirm organizer rules on cloud AI, tool disclosure and submission evidence.
- [x] Defined a narrow build sequence with React/TypeScript, FastAPI/Python, PostgreSQL and Docker Compose; external broad outline remains a roadmap.
- [x] Documented proposed case/document versioning, state transitions, scoped agent authority and approval invalidation in BUILD_PLAN.md; implementation/testing pending.
- [ ] Confirm proposed three-role workflow and permission matrix with the user or bank mentor.
- [ ] Clarify whether actual SD-WAN network control is intended; currently interpreted as an internal platform with scoped access.
- [ ] Validate department bottlenecks, volumes, baseline handling time, and value assumptions.
- [ ] Confirm team capacity, familiar stack, cloud provider/API access and budget, and actual kickoff/deadline.
- [ ] Obtain unobscured scoring weights and submission requirements from organizers.
- [ ] Validate workflow assumptions with mentor feedback.
- [ ] Finalize five core fixture packets, supported identity formats, scoped ownership assumptions and versioned fictional policy for the 12 checks.
- [ ] Validate bank integration interfaces, identity/deployment standards and production workload targets before a pilot.
- [ ] Have bank compliance owners confirm applicable current Romanian/EU rules and internal policies; real rule activation remains outside the synthetic MVP.

## Remaining — implementation

- [ ] Implement typed module/result contracts, trusted registry and workflow validation.
- [ ] Implement four discrepancy families and bounded ownership/declaration checks from DIRECTION_2_IMPLEMENTATION.md.
- [ ] Add adaptive evidence tools, checkpointed workflow runs and independent evidence/disposition checks.
- [ ] Prove a new compatible module can join a workflow without runner changes.

- [ ] Select a cloud provider/model and verify API access with synthetic inputs.
- [ ] Implement a small provider-independent inference interface and cloud adapter.
- [ ] Test provider timeout/rate limits and ensure credentials stay server-side.
- [ ] Build local case-report export.
- [ ] Establish project setup and reproducible commands.
- [ ] Create Romanian synthetic fixtures and independent expected outcomes, including CUI mismatch and diacritics.
- [ ] Build minimal documented case API, sample client and duplicate-submission protection.
- [ ] Add labeled ANAF/ONRC-style fixtures with unavailable/stale outcomes; no live registry integration in MVP.
- [ ] Build deterministic rule checks.
- [ ] Build document parsing and evidence-backed extraction.
- [ ] Build bounded agent orchestration and failure handling.
- [ ] Build three seeded-user sessions and backend role/case authorization.
- [ ] Build shared role-specific case/results UI, structured handoffs, and exception review.
- [ ] Test cross-case access denial, unauthorized actions, scoped AI context/exports, and self-approval prevention.
- [ ] Persist cases, audit events, and analyst reasons.
- [ ] Run correctness, evidence, timeout, and injection evaluations.
- [ ] Measure cloud inference latency, usage/cost, and manual-versus-assisted review time.
- [ ] Complete README, demo script, backup recording, and submission evidence.
- [ ] Verify fresh setup and rehearse jury questions.
- [ ] Submit according to confirmed organizer requirements.

## Remaining — final local product (after MVP)

- [ ] Confirm target hardware and select a local model.
- [ ] Implement the local inference adapter and rerun extraction, routing, and performance evaluations.
- [ ] Verify local-only configuration, no cloud fallback, and offline processing with outbound-attempt inspection.

## Evidence and results

Backend foundation exists: 23 automated tests pass using isolated SQLite databases. Five synthetic foundation packets, API demo client, OpenAPI export, pinned Python dependencies, Docker Compose and initial Alembic migration added. SQLite migration upgrade/schema-drift checks and PostgreSQL SQL compilation are checked separately. A PostgreSQL runtime is not available: Docker engine is stopped/unavailable. AI, full KYC, reviewer approval, worker recovery, benchmark results, mentor interviews and deployment remain unimplemented/unverified.

## Risks / unknowns

| Item | Impact | Next action |
| --- | --- | --- |
| Two rubric weights unreadable | Cannot precisely allocate the final 25% if total is 100%. | Obtain official rubric. |
| Team capacity and familiarity with proposed stack unknown | Schedule may need adjustment. | Check at implementation kickoff; recommended stack is documented. |
| Broad feature set already marketed by competitors | Weak originality claim without a narrower demonstrated contribution. | Validate the proposed investigation focus and benchmark it against simpler baselines. |
| Workflow assumptions unvalidated | Demo may miss analyst priorities. | Short mentor discussion early. |
| Cloud provider access, budget, and venue connectivity unknown | Could block the live MVP demo. | Smoke-test early; bound retries/spending and prepare a labeled recording backup. |
| Final local model/hardware unvalidated | Cloud demo quality does not prove local readiness. | Benchmark and re-evaluate during local migration. |
| Exact deadline and evidence format unknown | Submission preparation may be incomplete. | Confirm with organizers. |

## Next action

Build the frontend early on its own feature branch in response to the user's design priority. Connect cases, uploads, manual observations and live findings to the foundation API. Then add asynchronous worker/model integration and remaining KYC checks on separate feature branches. Verify PostgreSQL behavior when a server is available.

## Change log

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
