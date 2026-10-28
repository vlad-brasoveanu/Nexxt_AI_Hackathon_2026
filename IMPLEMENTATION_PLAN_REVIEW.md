# Review: Unified Modular Banking Platform

Date: 2026-10-28
Reviewed file: /Users/vlad/.claude/plans/outline-the-departments-of-adaptive-kernighan.md (428 lines at review time)
Status: Review only. The source document has not been modified or adopted as implementation instructions.

## Assessment

Useful long-term capability catalogue with good principles: modular monolith first, explicit interfaces, AI proposals instead of direct financial writes, field provenance, deterministic calculations, manual fallback and evaluation suites. The proposed implementation is substantially larger than a 48-hour MVP and introduces responsibilities that would make integration with an existing bank harder.

The department list is a useful orientation, not an exact bank organization model. Compliance, first-line KYC operations, fraud operations, risk oversight and audit need separately validated responsibilities. Prefer modules organized around business capabilities, with departments/roles as views and permission scopes.

## Priority findings

### 1. P1 — Initial build is too large for the delivery window

Source lines 381–414. The stack combines dynamic micro-frontends, gateway, identity server, workflow/rules engines, Kafka, CDC, warehouse, Kubernetes, RAG, OCR, model registry and multiple model types. The first vertical slice adds loan origination, Risk and Compliance, followed by financial execution. This creates many integration prerequisites before a useful demo exists.

Recommendation: one backend and one frontend with normal routes; one case store; one bounded AI orchestration path; three seeded roles; two Romanian document templates; deterministic rules; evidence viewer; one documented case API. Use a persisted workflow state machine for the first case flow. Choose the language/framework the builder can deliver reliably; Java/Spring is viable if already familiar, but an enterprise brand name alone is not a delivery advantage. Defer dynamic plugins, Kafka/CDC, workflow designer, model training, RAG and bank financial actions.

### 2. P1 — The shared core duplicates bank systems of record

Source lines 59–66, 395 and 410–412. Building a customer master, product catalogue and accounts/ledger creates migration, reconciliation and ownership obligations. That conflicts with the user's goal of easy integration into a large existing bank.

Recommendation: the platform owns cases, evidence references, extracted proposals, tasks and audit events. Existing bank systems remain authoritative for customers, products, accounts and ledger. Define adapters, external IDs, source timestamps and freshness rules; begin read-only. Cached read models must identify their source and must not become independent masters. Defer all disbursement and posting work.

### 3. P1 — Role/gateway checks do not establish case-level isolation

Source lines 93, 112–119, 180–181 and 419–422. The plan emphasizes role-filtered retrieval and tools carrying the user's token. A user can still be authorized for a module while forbidden from a particular customer, branch, case or field. Full user authority is also broader than the agent needs for an individual task.

Recommendation: evaluate role + entity/branch + case assignment + action at the service boundary for every request, job, download and export. Compute agent authority as the intersection of user authority, workflow step and tool allowlist. Keep credentials outside model context; use server-side delegation, short-lived scoped credentials where supported, and recheck authorization when queued actions execute. Bind approvals to the exact proposed action and case version. Test two users with the same role but different cases, revoked access, direct endpoints, scoped retrieval/caches and attempts to approve one's own submission.

### 4. P1 — Autonomy examples overstate safe reversibility and decision quality

Source lines 128, 270–275 and 303–307. A low amount, mismatching identity attributes, or a model confidence score does not establish that a sanctions hit is false or that a payment repair can safely execute. A format-valid change can affect the wrong beneficiary; a submitted payment cannot be assumed reversible. The promise that a human handles any true sanctions match is not an operational guardrail: the system may incorrectly classify that match as false.

Recommendation: remove auto-closure of sanctions hits and payment execution from this project. Keep evidence preparation and human recommendations. If pursued later, require a separately approved bank control design, supported transaction semantics and independently validated performance. These are engineering risk findings, not a claim that all automated screening is legally prohibited.

The tier definitions also conflict: line 128 says Tier 3 acts alone, but line 214 labels a customer-confirmed card action Tier 3. Define who authorizes an action, its side effects and its reversibility separately from model confidence.

### 5. P1 — Deployment policy conflicts with the user's local final product

Source lines 120 and 388. EU-region hosted models and cloud OCR remain cloud processing; redaction does not establish equivalence to local deployment.

Recommendation: explicitly separate synthetic cloud demo mode from bank-controlled local production mode. The latter prohibits remote inference/OCR and silent cloud fallback. Use interchangeable adapters and run the same evaluations against the actual local model. Approved registry connectivity is a separate integration decision; local inference does not require moving a full bank platform onto a single laptop.

### 6. P2 — Department-based modules and dynamic plugins add coupling

Source lines 43 and 73–90. Departments do not necessarily define stable business boundaries. Onboarding spans several departments; separate department-owned case implementations can duplicate state and complicate authorization. Adding a manifest alone also does not solve database migrations, event compatibility, UI compatibility or permission approval.

Recommendation: define modules by capability, such as Cases, Documents/Evidence, Policy Checks, Tasks/Approvals and Integrations. Departments see scoped views of these modules. Start with statically registered modules. For future plugins, specify compatibility, dependency versions, migrations, trusted package provenance and centrally approved permissions. Do not grant privileges merely because a module manifest declares them.

### 7. P2 — Confidence thresholds and legal rules are not supported

Source lines 130, 162, 194, 204, 249–250, 270, 306 and 353. Examples include a 0.9 field-confidence cutoff, mandatory 10% income discrepancy, 5–10% sampling and EUR 10k repair threshold. They are not established Romanian banking requirements. A model-generated confidence value is not a calibrated probability of correctness. Removing protected attributes alone also does not demonstrate fairness or eliminate proxies.

Recommendation: mark sample thresholds as fictional policy; require source, owner, scope, effective date and tests for real rules. Validate evidence and required fields independently; report extraction accuracy and false-ready routing rates on held-out fixtures. AI Act high-risk classification is not itself a blanket prohibition. GDPR Article 22 is conditional, with defined exceptions and safeguards; the source's shorthand is insufficient for policy implementation. Keep credit scoring, hiring and financial decisions outside the MVP.

### 8. P2 — Logging and event delivery do not yet support the promises made

Source lines 90, 94, 114, 161, 166 and 385. Raw prompts/outputs can duplicate sensitive documents in an audit store; indefinitely immutable storage needs a retention design. Recorded prompts do not guarantee identical model re-execution. A workflow engine does not configure escalation, incident ownership or recovery automatically. Kafka/CDC alone does not prevent duplicate actions or lost database/event updates.

Recommendation: retain minimal protected evidence with explicit retention/legal holds and audited access; version prompts, policies, models and original outputs. Distinguish decision reconstruction from deterministic reproduction. Require reviewed, permitted datasets before human corrections enter training. For future asynchronous integrations, define atomic event publication/outbox, idempotent consumers, versioned events, deduplication, failure queues, bounded retries, reconciliation and concurrent-update rules. Set workload and recovery targets and test them before bank-scale claims.

## Smaller corrections

- Line 76: use OpenAPI for the proposed REST interface; gRPC normally uses protobuf service definitions. Do not present them as the same contract format.
- Lines 198–204: separate fiscal/income sources from credit bureau sources; validate entitlements and current interfaces. ANAF is not interchangeable with Biroul de Credit.
- Lines 192–196: MRZ checks and age rules must be tied to supported document/customer types; do not assume every Romanian ID template has the same fields. Identity/liveness verification is a separate capability from field extraction.
- Line 226: the claimed 2–4 hours to 20 minutes needs a source or must be explicitly labeled a hypothetical benchmark.
- Lines 250 and 286: no evidence currently supports the fairness guarantee or sub-100-ms end-to-end fraud path; specify evaluation and latency targets instead.
- Lines 95 and 162: consent is not the only GDPR lawful basis and erasure is not unconditional. Real retention and processing policy needs applicability review.

## Recommended first implementation slice

Keep the current project objective: Romanian SME document-completeness review.

1. Manager submits synthetic application and company record.
2. Backend creates a case through the same API used by the UI, with duplicate-submission protection.
3. Agent extracts schema-validated facts with evidence and performs a targeted synthetic reference lookup if needed.
4. Deterministic rules return PASS, FAIL or UNKNOWN.
5. Analyst reviews findings and requests correction or recommends readiness.
6. A different authorized supervisor signs off operational completeness; no account or payment is created.
7. Export the evidence report and show measured time/error results.

Persist explicit states and allowed transitions. Bind results and approvals to document versions so replacing a document invalidates stale sign-off. Keep frontend and worker calls behind the same business authorization. Expose only the minimal API required for case creation/status/results and authorized workflow actions.

MVP proof: a successful case, a discrepancy case and an uncertain/failed-provider case; cross-case denial; no self-approval; no lost/duplicated work on retries; verifiable evidence; reproducible startup. The rest of the source document is a potential roadmap, not accepted MVP scope.

## References checked for specific corrections

- GDPR Article 22: https://eur-lex.europa.eu/legal-content/EN/TXT/?qid=1594897545294&uri=CELEX%3A32016R0679
- European Commission AI Act guidance: https://digital-strategy.ec.europa.eu/en/faqs/navigating-ai-act
- Commission employment use-case guidance: https://ai-act-service-desk.ec.europa.eu/en/employment-0
- gRPC service definition documentation: https://grpc.io/docs/what-is-grpc/core-concepts/

No model benchmarks, penetration tests, bank interfaces or application code were available for verification. The review assesses the written design and its fit to the agreed project requirements.
