# CaseCheck: implementation plan

Updated: 2026-10-28
Status: Implementation started. React frontend and conventional backend; no Lovable tool is connected, so frontend source will be built locally with future Lovable compatibility.
Current detailed scope and module contract: [DIRECTION_2_IMPLEMENTATION.md](DIRECTION_2_IMPLEMENTATION.md). Its message.txt-based workflow and schedule supersede older narrower examples below. This file retains stack/foundation guidance; HACKATHON_PLAN.md retains challenge/scoring context and PROGRESS.md records actual completion.

## Current first outcome

The user has selected direction 2 and the SME KYC discrepancy workflow described in message.txt. Build four check families—validity, cross-document consistency, business rules and synthetic-reference checks—with ownership/declaration review as the main demo. Integrate the evidence-investigation idea as bounded tool selection; do not block implementation scope on a broader market pivot.

First define FactSet, FindingSet, ModuleResult and versioned module/workflow manifests, the scoped demo policies, and five core fixtures. Then build the registry/runner and the real KYC modules. Follow DIRECTION_2_IMPLEMENTATION.md for corrected source assumptions, the 12 MVP checks, plug-in contract, data/API design and current 48-hour sequence.

## Recommended stack

| Layer | Choice | Purpose |
| --- | --- | --- |
| Web UI | Lovable-generated React + TypeScript frontend, reviewed/exported into the repo | Single application with shared screens and role-specific actions; Romanian labels |
| API / application | Python + FastAPI + Pydantic | Typed request/output validation, documented HTTP API, document and AI integration |
| Persistence | PostgreSQL + SQLAlchemy + Alembic | Case records, runs, permissions, transitions and versioned schema migrations |
| Document parsing | pypdf for supported text PDFs | Page-indexed extraction; explicitly reject unsupported/scanned files in MVP |
| File storage | Private local volume behind an authorized storage interface | Keep files outside public web paths; add approved object storage later |
| Background processing | One worker process from the same backend codebase; PostgreSQL job records | Persist long AI runs and keep the web API responsive without a separate broker |
| AI | One cloud-provider SDK behind a small Python interface | Synthetic-data demo; replaceable with a local inference adapter later |
| Authentication | Three seeded demo accounts and server-side sessions using maintained security libraries | Backend role/case authorization; later integrate the bank's OIDC identity provider |
| Tests | pytest for rules/API; Playwright for the essential browser workflow | Verify permissions, evidence, state transitions and user flow |
| Local deployment | Docker Compose | Reproducible PostgreSQL/API/worker startup; built web UI served with the app |

Exact maintained dependency/runtime versions will be checked and pinned at implementation kickoff. No software has been installed. Cloud provider/model remains to be selected based on available access, budget and structured extraction quality; credentials belong in server environment configuration, never chat, UI or Git.

This is one modular application, with API and worker entry points sharing business logic. No micro-frontends, Kubernetes, Kafka, Redis, BPMN engine, unrestricted dynamic plugin loading, vector database or ML model training in the MVP. Use versioned workflow definitions over explicitly registered trusted modules, plus explicit case/human-review transitions in application code. PostgreSQL is chosen from the start to avoid a later SQLite concurrency/migration detour; this does not itself establish bank-scale readiness.

## Module boundaries and repository layout

```text
frontend/                    React application
backend/app/
  identity/                  users, sessions, access policy
  cases/                     ownership, versions, workflow transitions
  documents/                 private storage, parsing, source evidence
  reviews/                   rules, findings, approvals
  ai/                        model adapter, bounded tool orchestration
  integrations/              synthetic reference adapter, external contracts
  jobs/                      worker claims, attempts, status, recovery
  audit/                     append-only application events
backend/migrations/          Alembic database migrations
tests/                      API/rule/workflow tests
e2e/                        browser tests
fixtures/                   synthetic Romanian cases and expected outcomes
docs/                       setup, architecture and demo script
compose.yaml                repeatable local runtime
```

Departments use these shared capabilities. The platform does not create its own banking ledger or customer master. Its stable API is the future integration surface; bank identifiers remain external references.

## Core records and invariants

- User/session: server-derived identity, role, case scope, session expiry. Use hashed passwords through a maintained library; HttpOnly cookies, appropriate SameSite/Secure settings, CSRF protection for mutations and explicit development settings. No client-controlled role grants.
- Case/document: owner, assigned team, status and case revision; immutable document versions and content hashes. Store raw values separately from normalized comparison values.
- Review run: input document-version IDs, policy version, model/prompt version, status and timestamps. Findings store PASS/FAIL/UNKNOWN and source page/excerpt or missing-evidence explanation.
- Approval: actor, action, reason, input revision and review-run ID. Replacing a document or changing effective policy invalidates eligibility for prior approval; history remains readable.
- Job: case/run/actor IDs, attempt count, lease and error state. Claim atomically, release database locks before network inference, fence expired workers from committing stale results, and bound retries. Do not promise exactly-once external model execution; prevent duplicate published results with unique keys and transactional checks.
- Audit event: actor, action, entity/version, timestamp and correlation ID. Do not log secrets or full documents. An application append-only log is not claimed to be tamper-proof storage.

Use an explicit state machine: draft → submitted → processing → analyst_review → awaiting_correction or supervisor_review → ready. Process failure remains visible and retryable without implying a pass. Corrected documents produce a new revision and review run. Every transition checks actor permissions, allowed current state and version. Supervisor sign-off indicates operational completeness only.

## Minimal API

- Session login/logout/current user.
- Create/list/read cases with case-level authorization and idempotency on creation.
- Upload/read supported document versions with size/type limits and private-file access checks.
- Start a review and retrieve job status, findings and observable tool events.
- Record review actions and export an authorized JSON/HTML report.

Document the API using generated OpenAPI plus example requests. A sample external client must be able to submit a case and retrieve its result through the same authorization path as the UI. Do not build a generic integration designer.

## Earlier foundation schedule (superseded by direction 2 sequence)

| Elapsed hours | Milestone | Proof |
| --- | --- | --- |
| 0–3 | Freeze fixtures/checks/roles; verify runtime, API access and minimal model extraction; choose pinned dependencies | Three labeled cases and a real extraction smoke test; identify setup blockers immediately |
| 3–7 | Foundation: app skeleton, database migration, private uploads, seeded accounts, case API and access checks | Start from documented setup; create/persist a case; unrelated case read denied |
| 7–13 | First live flow: page extraction, validated AI, bounded follow-up tool, rules, worker and minimal results page | Good/mismatch/uncertain cases produce evidence-backed results; no canned AI responses |
| 13–18 | Role views, correction/handoff actions and version-bound approval | Manager → analyst → supervisor flow; denied self-approval and stale approval |
| 18–21 | Rehearse and get mentor feedback; fix core gaps | Three representative cases run; workflow assumptions documented |
| 21–28 | Rest/recovery | Stable checkpoint and next task recorded |
| 28–34 | Expand evaluation, simulate failures, test job recovery and access, measure performance | No false-ready mandatory fixture; usable failure path; metrics with sample size |
| 34–38 | Romanian UI polish, simple export, integration example; optional comparison only if stable | Jury can follow evidence and handoffs without developer help |
| 38–42 | Fresh setup verification, README, architecture and measured business evidence | Another environment can run the seeded demonstration |
| 42–46 | Pitch, recording and rehearsal | Explain orchestration, rules, permissions and limitations clearly |
| 46–48 | Feature freeze and submission buffer | Submission checked against organizer requirements |

If setup overruns, cut visual extras and optional document comparison. Keep the first live flow, authorization, evidence and failure handling. Do not build more departments to compensate for an incomplete workflow. The scoring priority remains agent orchestration (25%) and completeness/stability (20%).

## First implementation branch and task

When the user requests coding, establish a clean tracked planning baseline using the user's verified Git identity before starting feature work. The repository currently has no commits; do not silently carry all untracked files across unrelated branches. Do not push unless requested or otherwise authorized.

First feature branch: `codex/workflow-foundation`. Deliver the app scaffold, compose configuration, migration, seeded demo accounts, five core labeled fixtures, typed module contracts/registry, and authenticated case creation/upload. Then use separate feature branches for the agent flow, review workflow and demo reporting, based on the integrated preceding baseline. Preserve the no-AI-author/co-author rule.

First user-visible milestone: sign in, submit a synthetic case and see persisted documents. Next milestone: run the agent and see real evidence-backed results. Planning this sequence does not authorize installation, paid API use or application implementation in the current turn.

## Pilot/scale path

Replace demo sessions with bank identity integration; private volume with approved object storage; cloud model with validated local inference. Reuse PostgreSQL and stateless API boundaries, add workers and workload limits based on measurement, then adopt a managed job system if needed. Validate bank connectors in read-only/shadow mode before controlled write-back. Set and test capacity, recovery and availability targets with the bank; the hackathon demo does not prove these.

## Sources for stack capabilities

- FastAPI validation and OpenAPI documentation: https://fastapi.tiangolo.com/features/
- Vite React/TypeScript project support: https://vite.dev/guide/
- PostgreSQL concurrency/locking: https://www.postgresql.org/docs/current/explicit-locking.html
