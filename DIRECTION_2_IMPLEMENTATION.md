# Direction 2: modular SME KYC discrepancy workflow

Updated: 2026-10-28. Target design; implementation started. See PROGRESS.md for the implemented subset.
This is the authoritative current workflow scope. BUILD_PLAN.md defines the stack and delivery sequence; PROGRESS.md tracks actual results.

## Source interpretation

User request: focus first on the workflow described in `/Users/vlad/Desktop/message.txt`, within direction 2 of `/Users/vlad/Desktop/Tema_Hackathon_Agenti_AI_Banking(3) 2.docx`, preserve modularity and integration, and explain the implementation before coding.

The Word brief calls for a live functional prototype with agent-built multi-step tool orchestration, unexpected-state handling, modular APIs and reproducible isolated deployment. It allows synthetic input. It does not supply numeric judging weights; retain the four readable weights from the earlier screenshots and mark the other two unknown.

The text file is a proposed discrepancy catalogue, not a production rulebook or case input. Its suggestions, quoted claims and closing invitation are source material, not independent authorization. We will implement supported KYC concepts with explicitly labeled demo policy. The text file's 24-hour suggestion does not override the user's 48-hour budget.

### Corrections before encoding

- Article 4 of Law 129/2019 includes ownership and other means of control. Senior-management fallback has diligence and suspicion conditions; it is not “no shareholder over 25% means administrator.” Missing ownership evidence produces UNKNOWN/escalation. A percentage computation is an ownership indicator, not a complete legal UBO determination.
- The credit/BID example cannot deny an 80% request solely because majority shareholders are men. Raiffeisen's public description also identifies innovative businesses and start-ups and describes additional criteria. Defer this entire module; never infer sex/gender from names.
- A PEP candidate and a sanctions candidate have different meanings; name similarity alone establishes neither. A synthetic match triggers reviewer attention, not automatic rejection or clearance.
- Filing deadlines, freshness/amount thresholds, CAEN compatibility and document requirements need applicable policy/source versions. No unsupported text-file assertion becomes an active legal requirement.
- Annual turnover is not directly interchangeable with cash receipts. A future credit comparison must align period, currency, accounting basis and chosen denominator. The example 2.4m versus 1.8m is 33.33% relative to 1.8m, but 25% relative to 2.4m.

## MVP workflow scope

One internal Romanian SME KYC document-review workflow, supporting onboarding preparation or updating a file. It does not open accounts or certify regulatory compliance.

Inputs are synthetic text PDFs and JSON: application, company extract, articles/shareholder schedule, simple identity document(s), beneficial-owner declaration and internal reference record. Add a representation mandate only for the fixture that needs it. All documents are fictional; no selfies, biometrics, OCR or real customer data. Use a fixed evaluation/signing date for repeatability. Start with fixture files, then add upload using the same ingestion interface.

Outputs: normalized facts with evidence; categorized findings; rule outcomes PASS/FAIL/UNKNOWN/NOT_APPLICABLE; severity; evidence/source links; required next actions; processing trace; version-bound human review. Operational disposition is READY_FOR_REVIEW, NEEDS_INFORMATION or ESCALATED. PROCESSING_FAILED is a technical run status and cannot count as a cleared case. Supervisor sign-off is a separate human workflow state.

## Runtime structure

```text
React/TypeScript UI or external API client
                    |
FastAPI: sessions, case scopes, versioned API
                    |
Workflow runner + module registry + permission gateway
                    |
Python worker: bounded investigation agent
                    |
Parse / Extract / Validity / Consistency / Business / Reference
                    |
Evidence verification + deterministic disposition + human task
                    |
PostgreSQL case/run/job history + private document storage
```

React + TypeScript + Vite; FastAPI + Pydantic; PostgreSQL + SQLAlchemy/Alembic; pypdf for text PDF parsing; Docker Compose; pytest + Playwright. One backend package has API and worker entry points. The cloud model adapter serves synthetic MVP inputs; the final local adapter uses the same contracts. No Kafka, graph database, micro-frontends or external workflow engine is needed for this first workflow.

## Modules and responsibility

| Module ID | Input → output | Responsibility |
| --- | --- | --- |
| document.parse | DocumentVersion → ParsedDocument | Text by page/span, supported-format checks; immutable source hashes |
| kyc.extract | ParsedDocument[] → FactSet | AI extraction into typed company/person/ownership/representation facts with evidence |
| kyc.validity | FactSet + reference date → FindingSet | Identifier checks, dates and required supported fields in deterministic code |
| kyc.consistency | FactSet → FindingSet | Compare entities/fields across versions/sources; flag ambiguity rather than merge blindly |
| kyc.business | FactSet + PolicyVersion → FindingSet | Demo-policy representation, ownership completeness and declarations |
| reference.lookup | Scoped entity query → ReferenceSnapshot | Synthetic registry/watchlist adapter first; explicit timestamp, version and availability |
| kyc.reference_compare | FactSet + ReferenceSnapshot → FindingSet | Compare reference facts and flag candidate list matches; no automatic sanctions decision |
| investigation.agent | Case snapshot + findings → ToolProposal[] / InvestigationSummary | Select permitted missing-information checks, observe results, stop within budget |
| evidence.verify | Findings + source versions → VerificationResult | Verify citations/entity association and rule preconditions; invalidate unsupported conclusions |
| review.disposition | Required outcomes + verification → CaseRecommendation | Deterministic routing, not an LLM decision |
| review.report | Authorized case snapshot → JSON/HTML | Generic findings report and reviewer action context |

These are code modules inside one deployable codebase, not separate microservices. The workflow core is banking-agnostic; it schedules steps, checks schemas/permissions, stores results and pauses for human tasks. Domain modules contain KYC logic. Domain checks share a fact/evidence contract rather than reading each other's database tables.

## Exact module contract

Every trusted module contains a manifest, typed input/output/config schemas, an implementation and contract tests:

```text
modules/kyc_business/
  manifest.yaml
  schemas.py
  handler.py
  tests/
```

Illustrative manifest (design, not yet runnable):

```yaml
id: kyc.business
version: 1.0.0
input_schema: FactSet.v1
output_schema: FindingSet.v1
config_schema: KycPolicy.v1
permission: case.analyze
side_effects: none
timeout_seconds: 10
```

Handler contract: `execute(context: ExecutionContext, input: InputModel, config: ConfigModel) -> ModuleResult[OutputModel]`.

ExecutionContext contains server-derived actor, case scope, run/step IDs, pinned document/policy versions, evaluation date, deadline and budget, plus narrow authorized tools. Credentials never enter prompts. ModuleResult contains execution status, schema/version, structured output, evidence references, error code and metrics. Rule results are separate from execution status: a module timeout is not PASS.

Modules are registered explicitly from reviewed application code at startup. A manifest declares required privileges; the platform grants only independently approved privileges. Users cannot upload Python, arbitrary import paths, executable expressions or SQL as a workflow. No `eval` of policy or workflow content.

Plug-and-play means a developer implements this contract, passes tests, registers the module and references it in a versioned workflow definition without rewriting the runner. New code still requires build/deployment, and new data requirements may need migrations or UI components. It is not unrestricted hot-loading of third-party code. A reusable module can be enabled in another workflow with a compatible input mapping and approved permissions.

## Workflow definition and execution

A versioned YAML/JSON definition lists installed module IDs, step dependencies, explicit input/output mappings, approved configuration versions, and required/optional semantics. A validator rejects missing modules, incompatible schemas, missing dependencies, cycles and unsupported condition operators before activation. Configuration conditions use a small typed expression set, not arbitrary code. For the first MVP, ship one reviewed preset; a visual workflow builder is deferred.

Illustrative composition:

```yaml
id: ro.sme.kyc_review
version: 1.0.0
policy: demo.ro.sme.1
steps:
  - {id: parse, module: document.parse, depends_on: []}
  - {id: extract, module: kyc.extract, depends_on: [parse]}
  - {id: validity, module: kyc.validity, depends_on: [extract]}
  - {id: consistency, module: kyc.consistency, depends_on: [extract]}
  - {id: business, module: kyc.business, depends_on: [extract]}
  - {id: investigate, module: investigation.agent, depends_on: [validity, consistency, business]}
  - {id: verify, module: evidence.verify, depends_on: [investigate]}
  - {id: route, module: review.disposition, depends_on: [verify]}
  - {id: report, module: review.report, depends_on: [route]}
```

This sketch omits input bindings for readability; the implementation requires them. The investigator can call `reference.lookup`, `kyc.reference_compare`, targeted extraction and impacted rule checks through the gateway; mandatory reference requirements must be completed even if the model fails to request them. The orchestrator may schedule the required check or leave UNKNOWN; it may never let agent omission yield a pass. The overall graph is finite; adaptive investigation is a bounded loop inside its registered step, with every tool call saved.

Pin the workflow, module, schema, policy, prompt and model versions in each run. Checkpoint each step and tool result. On restart, resume from valid checkpoints using idempotency keys. Do not reuse results after an input/policy change without explicit dependency invalidation. MVP may rerun the complete small case; selective reruns are an optimization.

## Rule catalogue derived from message.txt

| ID | Check | Method and uncertainty behavior | Scope |
| --- | --- | --- | --- |
| VAL-01 | Identity document expired at evaluation date | Deterministic date comparison; unreadable/missing expiry is UNKNOWN | MVP |
| VAL-02 | CNP/CUI validity and supported birth-date consistency | Versioned deterministic validators; unsupported identity formats need review; validity is not identity proof | MVP synthetic formats |
| CON-01 | Company/person names disagree | Conservative normalization; similarity creates a candidate discrepancy, not an automatic identity merge | MVP |
| CON-02 | CUI/registration identifier conflict | Exact normalized comparison tied to the entity; missing identifiers UNKNOWN | MVP |
| CON-03 | Registered addresses differ | Preserve effective dates; agent may investigate history, but unresolved differences remain reviewable | MVP |
| CON-04 | Administrator/representative differs | Compare scoped identity/role/effective dates, not name alone | MVP |
| BUS-01 | Representation missing or expired | Evidence-backed person, entity, scope and date check; no missing-mandate pass | MVP simple mandate |
| BUS-02 | Share percentages do not total 100% | Decimal arithmetic per company/capital class/effective snapshot; missing rows UNKNOWN; configured rounding tolerance | MVP simple share structure |
| BUS-03 | Ownership indicator absent from declaration | Compute supported ownership indicators; compare declared people, preserving identity ambiguity and other-control evidence | MVP simple structures |
| BUS-04 | Corporate shareholder chain incomplete | Graph traversal to natural persons with visited set/depth bound; cycles, missing entities or control evidence require escalation | MVP bounded graph |
| BUS-05 | Company extract older than allowed | Policy-configured age threshold; explicitly fictional unless approved | MVP |
| EXT-01 | Reference mismatch / synthetic sanctions or PEP candidate | Record separate source/candidate types, timestamps and matching evidence; unavailable source UNKNOWN; human review for candidates | MVP fixtures |
| BUS-06 | Declared activity versus CAEN meaning | AI-assisted mapping with versioned taxonomy; ambiguity requires review, not automatic legal incompatibility | Deferred |

Schema validation, mandatory-document presence, source freshness and evidence integrity are additional platform prerequisites. A missing declaration is not the same as a verified false declaration. NOT_APPLICABLE requires a documented applicability rule; failed execution cannot become NOT_APPLICABLE. Required FAIL/UNKNOWN outcomes prevent a ready recommendation. Blocking failures route to ESCALATED; absent required evidence routes to NEEDS_INFORMATION unless an escalation condition takes precedence. Nonblocking warnings remain visible to the reviewer.

## Ownership demonstration and agent autonomy

Use a simple disclosed synthetic structure: Person A owns 50% of Holding H; Holding H owns 60% of Applicant C; Person B owns 40% of C. For the demo's supported economic-ownership calculation, A has a 30% indirect interest along that path and B a 40% direct interest. A missing from the declaration triggers a review finding under the demo policy. These figures do not implement the complete legal control test.

The AI extracts owners, entities, percentages and control statements with citations; code computes path products and aggregates non-duplicated supported paths. All source records must describe compatible effective dates and share bases. Cap the demo at a small acyclic graph, for example three levels and ten entities. Unknown edges, conflicting records, cycles and control-through-other-means evidence produce review requirements. No automatic senior-management fallback.

Agent tools: `read_source_span`, `reextract_fields`, `lookup_reference`, `evaluate_selected_rules`, and `propose_information_request`. It chooses the next tool from available evidence and unresolved findings, not from a hardcoded case name. Permit up to four investigation tool calls and one transient retry per tool, under a total deadline/token budget; tune limits after measuring latency. Tool outcomes are structured observations. The model stops with a supported explanation or escalation; it cannot change policy or grant approval. Information requests are internal draft tasks, not automatically sent emails.

Demo variants: complete ownership chain with an omitted person; missing holding-company evidence; mismatching entity identifier; benign name formatting; synthetic reference outage. The agent should investigate different facts and may choose different tools. A changed/missing supporting source must invalidate affected conclusions. This uses the previous innovation work without claiming the general KYC concept is new.

## Data and integration contracts

Facts carry entity ID/type, field name, raw/normalized value, source document version/hash, page/span, asserted/effective date, extraction method/model version and human confirmation. No conflict is resolved by silently overwriting one source.

Findings carry rule/module/policy versions, category, outcome, severity, expected/observed values, evidence IDs, entity IDs, explanation, required action and unresolved dependencies. Graph edges carry ownership/control type, percentage where meaningful, source and date. A relational edge table or JSON is enough.

Core tables: users/sessions, case assignments, cases, document versions, fact observations, ownership edges, workflow definitions, runs/steps, jobs, reference snapshots, findings, approvals and audit events. Use JSONB for versioned module payloads while keeping searchable identities/status/relationships in typed columns. No permanent raw model prompts in general logs.

API outline: `/api/v1/cases`, `/cases/{id}/documents`, `/cases/{id}/runs`, `/runs/{id}`, `/runs/{id}/findings`, `/runs/{id}/trace`, `/cases/{id}/actions`, `/cases/{id}/report`, plus read-only `/modules` and `/workflow-definitions` catalogues. Run creation returns 202 and a run ID; the UI polls status in MVP. Mutations use idempotency keys where applicable and expected case revisions. A competing/stale review action returns a conflict rather than overwriting history.

Case access, file reads, exports and tool calls share server authorization. Three roles: manager submits assigned cases; analyst reviews scoped queues; supervisor signs operational readiness for another submitter. A user never selects their own privileges in a request. Queue workers recheck current actor/service scope before tool execution. Schema-valid output alone cannot bypass permission checks.

For bank integration: map external case/customer IDs into the API; source systems remain authoritative. Start with a sample API client and synthetic reference adapter. Later swap adapters for authorized bank/ONRC/ANAF sources and bank SSO. Do not claim a live integration until tested. Optional outbound webhooks need signed delivery, retries and reconciliation in a pilot.

## How another module plugs in

Example later feature: `credit.turnover_consistency`.

1. Define `FinancialObservationSet.v1` with amount, currency, period, accounting basis and source evidence.
2. Add a compatible extraction step/input adapter; the KYC fact contract alone does not contain financial statements.
3. Implement deterministic comparison and threshold configuration with explicit denominator/rounding and UNKNOWN for non-comparable inputs.
4. Return the existing FindingSet contract, so evidence display/reporting is reused.
5. Add manifest, contract tests and registry entry; create a new workflow version with its dependencies/input bindings.
6. Deploy reviewed code/migrations, run regression fixtures and activate for authorized cases. Existing runs stay pinned to their original versions.

No change to runner scheduling or identity logic is required if contracts/capabilities are already supported. New capabilities require explicit platform changes; do not promise arbitrary modules will work without integration work.

## Scale and failure behavior

API instances hold no workflow state in memory. PostgreSQL stores runs and job checkpoints; a worker claims a job using a short transaction/lease and releases locks before model calls. Completion verifies lease generation and case version. Unique step/run keys prevent duplicate published findings; retries may still duplicate billable model requests and must be counted.

Cap document sizes, page counts, concurrent jobs, model calls and queue depth. Persist failure codes; no-result execution is never a successful case. Private volume is the local-demo storage adapter; bank deployment requires approved shared object storage. Add worker replicas and local inference capacity only after throughput/recovery tests; no bank-scale claim based solely on architecture.

Workflow code, config and policy changes are reviewed deployments. Protect document contents, minimize logs, version outputs and bind approvals to exact evidence. Never auto-execute financial actions or screening clearance.

## Build sequence within 48 hours

| Hours | Deliverable | Acceptance gate |
| --- | --- | --- |
| 0–3 | Freeze schemas, 12 scoped checks, fictional policy and five core fixtures; cloud extraction smoke test | Typed owner/identifier extraction and expected outcomes documented |
| 3–7 | FastAPI/Postgres foundation, migrations, seeded sessions, private upload and module contract/registry | Case persists, unauthorized read denied, contract mismatch rejected |
| 7–13 | Parser/extractor, validity/consistency/business modules and bounded ownership calculation | Supported fixture findings cite valid sources; incomplete chain UNKNOWN |
| 13–18 | Worker runner, checkpointed tools, adaptive investigation and synthetic references | Missing ownership source triggers lookup; unavailable source escalates; real execution trace |
| 18–21 | Minimal React case/evidence/ownership views and first walkthrough | Three users can inspect and act on one case |
| 21–28 | Rest/recovery | Stable checkpoint and prioritized fixes |
| 28–34 | Human handoff/version checks and regression/failure evaluation | No self/stale approval, no false-ready seeded blocker, retry recovery |
| 34–38 | Romanian polish, report, API sample, measured baseline comparison | Integration example and understandable findings |
| 38–42 | Clean setup rehearsal, documentation and architecture evidence | Reproducible Docker setup with fixtures |
| 42–48 | Pitch, backup recording and submission buffer | Live scenario rehearsed, remaining limitations explicit |

If behind, keep validity, exact identifiers, ownership/declaration, synthetic reference and adaptive investigation; cut sophisticated fuzzy matching, mandate breadth and optional dashboard work first. Missing or unsupported checks must remain explicit. No credit/BID module until core acceptance gates pass.

Meaningful tests: module input/output compatibility and failure propagation; critical rule boundaries including exactly 25 versus over 25 under demo policy; incomplete/cyclic ownership; evidence/entity mismatch; prompt injection; outage; same-role cross-case denial; duplicate submission; worker restart; stale approval; new module returning findings without runner edits. Compare agent against fixed-rule and one-shot LLM baselines on the same fixtures and access.

First coding branch when requested: `codex/workflow-foundation`, after establishing the planning baseline with verified user Git identity. Later features use separate branches. Current work remains planning only; source documents unchanged.

## Verified source corrections

- Law 129/2019, Article 4 ownership/control and conditional senior-management fallback: https://legislatie.just.ro/public/DetaliiDocument/216157
- Raiffeisen BID program categories and eligibility summary: https://www.raiffeisen.ro/ro/imm/produse-si-servicii/finantare/credite-imm-garantate-de-bid.html

These sources correct important simplifications in message.txt; they do not constitute a complete production legal rule set. Review applicable consolidated law and internal policy before real bank deployment.


## Functional adjustments for separate modules and the hybrid frontend

Decision (2026-10-28): use Lovable to generate the React/TypeScript frontend, with the planned FastAPI/PostgreSQL/worker backend. Planning only. The SME KYC checks stay in scope. A module is a separately testable capability within the backend application, not a separate deployed service or a department-specific application.

| Functionality | Adjustment | MVP boundary |
| --- | --- | --- |
| Case creation | Select an approved workflow template; show required inputs and checks before submission | One active SME KYC template; version pinned when a run starts |
| Document ingestion | Parse once, preserve evidence, then extract typed observations for consumers | Modules use declared input contracts; financial extraction is added only with a financial module |
| Checks and findings | Every checking module returns FindingSet with the same outcome, severity, evidence and required-action fields | One shared findings/evidence screen; optional ownership panel supplements it |
| Case outcome | Modules publish findings; the central disposition policy computes readiness | Required checks cannot be disabled by a user or silently skipped; technical failures remain distinct from rule failures |
| Missing inputs and unavailable tools | Show missing prerequisites, UNKNOWN and execution failures explicitly | Missing critical evidence prevents readiness; unrelated checks can finish where dependencies allow |
| AI investigation | Give the agent only registered, authorized tools with typed inputs and bounded budgets | AI selects useful investigations; deterministic checks and independent evidence verification remain separate |
| Human review | Corrections, proposed information requests, overrides and approvals use shared case actions | Record reasons and exact evidence revision; reruns invalidate prior approval eligibility |
| Workflow configuration | Maintain versioned, reviewed definitions with dependencies and policy settings | Read-only catalogue; no visual workflow builder, arbitrary uploadable plugins or live rule-disable controls |
| Access | Apply capability permissions and case scope across API, worker, evidence and exports | Department-specific views reuse the same modules; hiding a button never grants or enforces authorization |

### Frontend/backend contract

Define the OpenAPI contract and representative success, missing-evidence, permission-denied and failed-run responses before generating UI. Lovable receives this contract and synthetic fixtures. Build a typed API client; use labeled fixtures only during UI development and replace them with real endpoints before the demo. No separate Lovable database, authentication authority, business rules or model credentials. Prefer same-origin frontend/API deployment for the demo with server-managed sessions.

The UI reads supported workflow/module metadata and generic findings from the API. It displays actual run states and tool events, not simulated progress. A newly registered module returning FindingSet can use the existing findings, evidence and report screens. A novel interaction or visualization can require a small frontend extension; this is not zero-code support for arbitrary future modules.

Export and review generated frontend source into the existing repository on its dedicated feature branch. Avoid automatic bot-authored Git sync; do not commit until the user's identity has been verified. Backend integration and exported frontend behavior still require testing.

### Concrete modularity acceptance gate

Add a small synthetic test module that consumes existing facts and returns FindingSet. Register it and create a new workflow version without changing the runner or generic results UI. Verify that its results appear, missing prerequisites cannot silently pass, incompatible schemas are rejected, unauthorized evidence is denied, and old runs retain their pinned definition. This is a test fixture, not an additional production banking feature.

Prioritize these contracts and one complete workflow over configuration UI. The plan preserves the 48-hour schedule; Lovable replaces frontend scaffolding effort, while orchestration, failure handling and evidence remain the core scoring demonstration. No separate services, marketplace or bank-wide workflow rollout is included in the MVP.
