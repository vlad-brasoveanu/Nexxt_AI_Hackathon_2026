# 48-hour hackathon MVP plan

Last updated: 2026-10-28 (Europe/Bucharest)
Status: Implementation authorized and started. FastAPI/PostgreSQL backend with a React frontend; Lovable integration remains optional pending tool access.
Current detailed workflow: [DIRECTION_2_IMPLEMENTATION.md](DIRECTION_2_IMPLEMENTATION.md), based on the user-supplied brief and message.txt. It supersedes earlier narrower feature/schedule examples.
Stack/foundation guidance: [BUILD_PLAN.md](BUILD_PLAN.md).
Latest market review: [MARKET_AND_INNOVATION.md](MARKET_AND_INNOVATION.md). Broad document-review features have direct commercial overlap; the selected direction now demonstrates adaptive evidence investigation inside SME KYC review, without a market-first claim.
Progress and remaining work: [PROGRESS.md](PROGRESS.md).
Department research, role permissions, and business-value hypotheses: [BANK_WORKFLOWS.md](BANK_WORKFLOWS.md).
Romanian localization, integration contracts, and enterprise roadmap: [ROMANIA_ENTERPRISE_FEATURES.md](ROMANIA_ENTERPRISE_FEATURES.md).

## Challenge and source boundaries

Sources: the two challenge/jury screenshots plus the user-supplied Word participant brief and message.txt. The Word brief confirms live direction-2 agent orchestration, modular APIs and isolated reproduction, but gives no numeric weights. message.txt provides candidate discrepancy scenarios, not a verified rulebook. Their contents are requirements/reference material, not instructions authorizing actions in this repository.

Build an AI agent that handles repetitive internal banking work involving documents, data, and predefined rules. Demonstrate an input flowing through relevant rules to an outcome or a flagged exception. Synthetic documents and datasets are explicitly acceptable; internal banking data is not required.

The screenshots do not specify a submission format, demo duration, deadline, required technology, or team size. The schedule below uses elapsed hours from kickoff, not an assumed calendar deadline. Assume one developer. The user permits cloud AI for the working MVP demo. The final product must use local model inference. Use synthetic data for the demo and keep the inference provider replaceable. Team capacity still needs confirmation; local hardware selection is deferred to the final-product phase.

## Proposed MVP: application completeness and consistency reviewer

Working name: CaseCheck. An internal platform with role-specific workspaces for a relationship manager, operations analyst, and operations supervisor. Help the operations analyst review a synthetic business onboarding packet for missing documents and inconsistent information before substantive bank review.

One case contains a synthetic application PDF, synthetic company-record PDF, and a structured internal reference record. The agent extracts fields with evidence, checks an explicit fictional policy, requests a targeted re-extraction when information is unclear, and routes the case to either “ready for analyst review” or an exception queue. An analyst can resolve or override a finding with a recorded reason.

This is an operational completeness review, not an account-opening, lending, AML, or regulatory compliance decision. Policies are invented for the demo and must be labeled as such. Mentor feedback should validate the workflow rather than be presented as bank policy.

Why this scope: it visibly combines documents, structured data, rules, multiple tool steps, and exception handling. A reconciliation-only workflow is a viable fallback but gives less opportunity to demonstrate document interpretation. A general banking assistant is too broad for 48 hours.

## Jury assessment and evidence strategy

| Criterion | Screenshot weight | Evidence to prepare |
| --- | --- | --- |
| Originality and ingenuity | 15% | Evidence-linked findings and a before/after recheck showing exactly which exceptions a corrected document resolves. Deliver core workflow first. |
| Problem research and domain understanding | 15% | One-page workflow brief: analyst, input, manual steps, constraints, exceptions, mentor feedback, and explicit assumptions. |
| Agent design and orchestration | 25% | Visible tool trace: extraction, targeted lookup, deterministic validation, bounded recovery, and exception routing. Explain which decisions the model makes and which code enforces. |
| Functional completeness and stability | 20% | Working end-to-end case, seeded exception cases, repeatable evaluations, clear failure states, and recorded demo backup. |
| Architecture and reproducibility | Obscured; unconfirmed | Modular boundaries, documented setup, locked dependencies, environment example, synthetic fixtures, and repeatable run/test commands. |
| Business mentoring | Obscured; unconfirmed | Problem/user understanding, value of solution, potential for adoption, and a record of feedback that changed scope or design. |

The four readable weights total 75%. If the complete rubric totals 100%, the other two categories share 25%; their individual weights cannot be established from the screenshot. Do not invent them. Confirm with organizers, together with submission requirements and demo timing.

Scoring strategy: prioritize the 45% assigned to orchestration and stability. Build a complete, inspectable workflow before visual polish or extra document types. Research and business evidence must be collected early enough to influence the product. No specific score can be predicted from this rubric alone.

## Scope and acceptance criteria

### Must deliver

- Three seeded users with backend-enforced roles and case scopes; role-specific views of one shared workflow. No unrestricted role selector presented as real authorization.
- Structured handoffs with owner, status, reason, and timestamp. A submitter cannot sign off their own case; supervisor sign-off confirms operational completeness only.

- One Romanian SME packet schema and text-based PDFs only; Romanian UI labels and synthetic documents, bundled cases plus upload. Preserve diacritics and original values.
- A small documented case-create/status/result API and synthetic reference adapter; demonstrate submission by a sample client and duplicate-submission protection. Real bank and registry integrations remain outside MVP.
- Schema-validated extraction of company name, registration ID, address, and required document metadata, with source page and supporting text for each extracted field.
- Versioned fictional policy with rule source type, owner and effective date, clearly separated from real legislation and bank policy, with 12 scoped checks across validity, consistency, business and synthetic-reference families as specified in DIRECTION_2_IMPLEMENTATION.md; CAEN semantic compatibility and credit modules are deferred.
- Rule outcomes of PASS, FAIL, or UNKNOWN. Missing or unsupported evidence must never silently pass. Findings identify rule, actual value, expected condition, and evidence.
- A bounded agent loop that can choose a targeted extraction/reference lookup based on missing information. Maximum tool-call budget, one retry for a transient failure, then a visible review-required outcome.
- Result screen with case status, findings, source evidence, tool execution trace, and analyst action with reason.
- Local persistence for cases, results, policy version, and analyst actions; resettable synthetic demo data.
- Clear file/input errors and model/provider failure handling. Case failure must not crash the app.
- Evaluation fixtures with manually authored expected outcomes, reproducible setup, and a short demo script.

### Optional, only after the core is stable

- Replace one document and compare findings before/after recheck.
- Small queue summary with counts of ready and exception cases.
- Evidence highlighting beyond page number and quoted source text.

### Explicitly excluded

Real banking integrations or customer data, autonomous financial actions, real regulatory validation, handwriting/OCR, arbitrary document types, enterprise SSO/MFA and identity lifecycle (basic demo sessions and authorization are in scope), actual SD-WAN provisioning, multi-agent infrastructure, vector databases, model fine-tuning, and a broad chatbot interface.

## Proposed architecture

Current recommended stack: React + TypeScript + Vite frontend; Python + FastAPI + Pydantic backend; PostgreSQL with SQLAlchemy/Alembic; private document storage; text-PDF parsing; one worker from the same backend codebase with persisted PostgreSQL jobs; Docker Compose. See BUILD_PLAN.md for milestone gates and implementation details. Select a cloud provider/model for synthetic data during kickoff; pin compatible maintained versions then. Final inference remains local.

Use one small inference interface for structured extraction and next-action selection. Implement the cloud adapter for the demo; reserve a local adapter (for example Ollama) for the final product. Keep prompts, schemas, rules, evidence validation, persistence, and UI independent of the provider SDK. Do not build a generalized multi-provider framework. Moving to a local model requires re-running quality and performance evaluations, not merely changing a URL.

Parse PDFs and perform reference lookups locally; send only relevant synthetic text to the configured cloud model. Store credentials server-side outside Git. Display “Cloud demo · synthetic data” and record the actual provider/model in results. The final local mode must reject cloud endpoints and must never silently fall back to cloud inference.

Flow: case input → file/text parsing → agent extraction and targeted tool calls → deterministic rule evaluation → exception routing → analyst review → saved audit record.

Keep separate modules for input/parsing, extraction schemas, agent orchestration, policy rules, persistence, UI, and evaluation fixtures. Expose tools such as `extract_fields(document_id, fields)`, `lookup_reference(registration_id)`, and `evaluate_rules(case_id, policy_version)` with validated arguments and structured outputs.

The model interprets document text and chooses a bounded follow-up when needed. Code owns comparisons, dates, rule thresholds, allowed tool access, budgets, and final routing. The agent must visibly make a useful conditional choice; a sequence of hardcoded calls alone is weak evidence for orchestration. A single agent is sufficient.

Treat document text as untrusted data. Instructions embedded in a PDF must not change policy, tool permissions, or routing. Evidence references must point to supplied text; absent evidence produces UNKNOWN. Record observable tool calls and outputs, not private model reasoning. Use fictional identities and registration identifiers. Keep secrets out of the repository.

## Synthetic demo and evaluation set

Create approximately 12 small labeled cases across these categories:

1. Complete, consistent packet.
2. Missing required document.
3. Registration ID mismatch across documents.
4. Equivalent company-name formatting that should normalize successfully.
5. Document outside the fictional age threshold, including a boundary-date case.
6. Missing reference record or ambiguous extraction requiring review.
7. Malformed or unsupported file.
8. Document containing an instruction to ignore policy; it must have no authority.

Include combined-error cases. Exercise provider timeout, rate limiting, unavailable model, and invalid model output separately through injected failures. Keep expected rule outcomes authored independently of implementation. Freeze the reference date for repeatable tests.

Targets, to be measured rather than claimed: every mandatory demo case reaches the expected route; no seeded mandatory failure is marked ready; every substantive finding has valid source evidence or an explicit missing-evidence explanation; failure injections leave the UI usable. Report rule-level correctness, routing correctness, evidence coverage, end-to-end latency, provider/model identifier, token usage, and estimated API cost per case where available. Measure local-model memory and cold/warm latency during the final-product migration. Record sample size and limitations.

For business value, time manual review and assisted review of the same synthetic cases using the same completion criteria. Label this a small demo benchmark, not proven bank savings. Estimated time saved per case = manual time − assisted time, including analyst verification. Any volume-based projection must disclose its assumptions.

## Earlier 48-hour schedule (see DIRECTION_2_IMPLEMENTATION.md for current sequence)

Elapsed hours include recovery time. Do not spend the entire window coding.

| Hours | Work | Exit criterion |
| --- | --- | --- |
| 0–3 | Confirm rubric/submission requirements, mentor questions, narrow workflow, choose familiar stack, verify cloud API access and extraction quality using synthetic data. | One-page scope, fictional policy, acceptance criteria, and a viable cloud-model smoke test. |
| 3–7 | Define role/case permissions, a small case API contract and Romanian case/extraction schemas, create initial good/bad fixtures, deterministic rules and expected results. | Rules correctly distinguish a clean case and a mismatch without a UI. |
| 7–13 | Implement parsing, evidence-backed extraction, conditional tool orchestration, and bounded recovery. | One complete packet runs end to end with a readable trace. |
| 13–18 | Add three seeded-user sessions, backend authorization, shared role-specific UI, handoffs, persistence, and review reasons. | Users can hand off a case; unauthorized case access and self-approval are denied. |
| 18–21 | First demo rehearsal and mentor feedback; fix highest-impact gaps. | Three demo cases run; feedback and scope changes recorded. |
| 21–28 | Rest/recovery buffer. | Resume with a stable checkpoint and clear next task. |
| 28–34 | Expand fixtures; test role/case isolation, self-approval denial, injection, timeouts and unsupported files; validate evidence and measure results. | Evaluation table populated; no unresolved critical routing defects. |
| 34–38 | Improve error presentation and trace clarity; optionally add corrected-document comparison. | Core demo repeatable; optional work stopped if stability slips. |
| 38–42 | Clean setup rehearsal, README, architecture sketch, results and business-value evidence. | A fresh setup can reproduce the demo with documented API configuration; provider failure is handled visibly. |
| 42–46 | Record backup, prepare submission, rehearse pitch and jury questions. | All required submission artifacts ready. |
| 46–48 | Final verification and submission buffer. Freeze features. | Submission confirmed against organizer checklist. |

If behind: at hour 13 reduce to two supported document templates; at hour 18 prioritize sample selection over flexible uploads; at hour 34 cut all optional features. Preserve the live agent path, evidence, exception handling, and reproducibility. A clearly labeled replay may support the backup recording, but cannot be presented as a live agent run.

## Suggested demo narrative

Prepare a five-minute version, then adapt to the actual organizer limit:

- 0:00–0:40: Introduce the analyst's repetitive review task and the exact scope.
- 0:40–1:30: Run a clean packet and show the input-to-outcome workflow.
- 1:30–3:00: Run an inconsistent packet; show conditional tool use, failed rule, and cited evidence.
- 3:00–3:40: Demonstrate UNKNOWN/review-required behavior and an analyst action.
- 3:40–4:20: Show measured evaluation results and the small time-saving benchmark.
- 4:20–5:00: Explain architecture, reproduction, mentor feedback, and a realistic adoption path.

Prepare answers about incorrect extraction, conflicting evidence, rule changes, provider outage, prompt injection, human accountability, and what a real pilot would require. Keep claims limited to tested behavior.

## Research, mentoring, and submission checklist

Ask a mentor: who performs this review; which checks consume time; which mistakes cause rework; what evidence analysts need; which exceptions need escalation; and what would make a limited pilot useful. Record date, role, feedback, and resulting decision. Do not invent interviews.

Ask organizers: exact remaining weights; whether mentoring is scored by participation or a deliverable; submission deadline/timezone; live-demo duration; cloud API permissions, venue connectivity, and installation constraints; repository visibility and required evidence.

Prepare a README with install/run/test/reset instructions, environment-variable example without credentials, synthetic fixtures, policy documentation, architecture diagram, measured evaluation report, demo script, backup recording, and pitch materials if required. These are proposed artifacts; the screenshots do not establish submission requirements.

## Working agreements

Planning is the only authorized phase so far. Keep this file and PROGRESS.md current during future project work. Use a separate feature branch for each new feature. Do not add an AI author, co-author trailer, or AI signature to commits; verify the user's configured identity before committing. See AGENTS.md for persistent repository instructions.


## Cloud MVP and local final product: feature priorities

A working demo is a required deliverable, not a slide mockup. Retain planning-only status for this turn: the user asked to think of features, not to start installation or implementation.

Local inference removes the need to send documents to an external model provider; it does not guarantee that data breaches cannot occur. The product must also control local storage, logs, network exposure, and tool access. Describe the MVP honestly as a cloud-assisted demo using synthetic data. Claim local-only processing for the final product only after verifying it; do not describe either version as breach-proof.

| Priority | Feature | User-visible behavior and demo evidence | Jury relevance |
| --- | --- | --- | --- |
| P0 | Case workbench | Choose a synthetic case or upload supported synthetic PDFs; parse/store locally and use the cloud model for inference. | Completeness, adoption |
| P0 | Evidence-linked discrepancy review | Select a failed rule to see conflicting values, document/page, and source excerpt side by side. | Domain understanding, stability |
| P0 | Conditional investigation | Agent requests only the missing fields or a local reference lookup; trace shows the selected action and outcome. | Orchestration, 25% |
| P0 | Exception queue and human decision | Cases show ready, exception, or needs-information status; analyst records a resolution reason without erasing the original finding. | Domain understanding, completeness |
| P0 | Processing-mode status | Show cloud-demo mode, synthetic-data scope, actual provider/model, and request health. | Reproducibility, adoption |
| P0 | Reproducible case report | Export a local JSON/HTML report containing findings, evidence, policy/model version, and human actions. No emailing or external publishing. | Reproducibility |
| P1 | Fix-and-recheck comparison | Replace a mismatching document, rerun, and show which findings changed while preserving history. First optional feature to build. | Originality, 15% |
| P1 | Missing-information checklist | Generate a local draft checklist from unresolved rule findings for analyst use; do not send it automatically. | Business value |
| P2 | Policy what-if preview | Change one fictional threshold in a sandbox, compare results, and require explicit activation of a new policy version. | Originality, explainability |
| P2 | English document support | Romanian templates are core scope; add and evaluate English fixtures before claiming bilingual support. | Adoption, domain fit |

P0 items are the target scope. Keep the report a simple template and the queue a basic list to preserve the time budget. P1/P2 features must not displace provider integration tests or a stable core demo. Defer chat, broad OCR, automatic email, dashboards beyond simple counts, and bank integrations.

### Final-product local migration (outside the 48-hour MVP critical path)

These requirements apply to the final local product, not the cloud MVP. The MVP requires internet for inference and must not claim an offline demonstration.

- Provision model weights and dependencies before local use; downloads may require internet during setup, but local-mode processing must not.
- Start with one small instruction-tuned, quantized model; benchmark a larger candidate only if hardware permits. Compare schema validity, extraction accuracy, conditional action selection, and latency on the same fixtures. Do not choose by model size alone or promise hardware performance before measuring it.
- Ollama is a proposed runner, not an assertion that any installed model supports the required behavior. Its official API documents JSON-schema outputs and tool calling. Validate both on the selected model; schema-valid JSON does not guarantee correct facts.
- Disable Ollama cloud functionality using its documented `OLLAMA_NO_CLOUD=1` setting for the actual server process and verify after restart. Pin the downloaded model identifier/digest. Reject remote model endpoints and do not silently fall back to cloud services.
- Bind the app and model server to loopback; bundle UI assets and disable telemetry/remote analytics. Restrict tools to the current case and local reference records, with no arbitrary shell, web, or filesystem access.
- Keep document bodies out of debug logs, use restricted local storage, exclude uploaded documents/databases from Git, and provide case deletion. Ordinary deletion is not a secure-erasure guarantee. Production access controls, encryption, retention, and backups require separate work beyond this synthetic-data MVP.
- Validate the data boundary with external networking blocked while preserving loopback: launch the app, upload a previously unprocessed synthetic packet, perform real inference, inspect results, and export the report. Inspect outbound attempts as well; an offline success alone does not prove that an online process never tries to transmit data.
- Stop the model server during a test: the app must show a recoverable error and must not produce an invented result. Restore it and rerun successfully.

### Demo storyboard and go/no-go gates

1. Show “Cloud demo · synthetic data”, the actual model/provider, and connection health.
2. Process a new clean synthetic packet live; inspect its evidence-backed rule results.
3. Process a discrepancy case; show the agent's conditional investigation and the exception queue.
4. Record an analyst action and export the case report locally.
5. If P1 is complete, replace the bad document and show the changed findings.

By hour 3, confirm API access and validated extraction on a synthetic case. By hour 13, run the live cloud-assisted workflow end to end. By hour 34, require correct routing on all mandatory fixtures and acceptable measured demo latency. Aim for a warm small-packet run within 60 seconds as a provisional target, not a promise. If too slow, reduce document size/context or number of calls, or evaluate another permitted model and remeasure. Bound API requests and spending. If the provider or venue internet remains unavailable, mark the live demo blocked; a recording or replay is a disclosed backup, not a substitute for a working live path.

### Technical references checked during planning

- [Official Ollama FAQ](https://github.com/ollama/ollama/blob/main/docs/faq.mdx): local data handling and disabling cloud functionality.
- [Official Ollama API specification](https://github.com/ollama/ollama/blob/main/docs/openapi.yaml): structured outputs and tool-calling request formats.

These sources support runtime capabilities, not a security certification for the planned application.


## Internal platform direction and business value

The user's department-specific access concept is interpreted as an internal AI workflow platform running on the bank network. SD-WAN concerns network connectivity; application permissions require identity and backend authorization. Actual SD-WAN control remains an open clarification, not an assumed implementation requirement. See BANK_WORKFLOWS.md for the functional department map, access matrix, and source references.

Keep the 48-hour scope to one workflow across three roles. Replace generic analyst overrides with permission-checked actions and an independent operational readiness sign-off. Preserve original evidence and findings. Avoid building separate apps for every department. If schedule pressure increases, cut optional features and report polish before access enforcement or the core AI path.

MVP metrics: active handling time, elapsed completion time, correction cycles, time waiting at each handoff, correct exception routing, and AI cost per case. Capacity released is not automatically cash savings or profit. Faster onboarding and lower abandonment are future revenue hypotheses requiring real-world validation. No automatic credit, AML, pricing, or account-opening decisions are included.


## Romanian integration and scale roadmap

Latest user priority: easy integration and eventual deployment at a large Romanian bank. Use ROMANIA_ENTERPRISE_FEATURES.md as the feature catalogue. The MVP proves an integration contract and Romanian workflow, not production capacity or legal compliance. Use labeled synthetic ANAF/ONRC-style reference responses; do not claim live registry access.

Keep a modular application with adapters for identity, case/document sources, reference lookups and model inference. Start a bank pilot with approved SSO and read-only/shadow integration, then add controlled write-back. Final model inference runs on bank-controlled infrastructure; separately approved registry connectivity can remain available. Do not infer the bank's actual vendors or APIs.

Add production storage, durable queues, stateless API replicas and independently scalable inference workers when measured pilot load warrants them. Establish and test throughput, latency, availability and recovery targets before claiming bank-scale readiness. Validate applicable Romanian and EU rules with the bank's compliance owners; do not auto-activate AI-generated interpretations.


## External implementation outline review

Reviewed `/Users/vlad/.claude/plans/outline-the-departments-of-adaptive-kernighan.md` on 2026-10-28. Findings and proposed improvements are saved in [IMPLEMENTATION_PLAN_REVIEW.md](IMPLEMENTATION_PLAN_REVIEW.md). The source is a broad roadmap, not adopted implementation scope. Preserve the 48-hour SME completeness workflow, existing-bank systems of record and local final-model requirement. Key open design decisions: capability-based modules, per-case delegated agent authorization, version-bound approval/state transitions, and minimal integration contracts. Review recommendations remain proposals; no code or source-outline changes were made.


## Lovable feasibility and scoring assessment (2026-10-28)

Status: historical full-stack feasibility assessment. The latest decision uses Lovable for frontend generation only; backend logic remains in our conventional stack. The user previously asked whether Lovable could deliver the entire MVP/demo. Official documentation supports building and hosting the app with database, authentication, storage, server-side functions and built-in AI. This is a feasible route for the narrow synthetic-data workflow; runtime/model support, parsing behavior, function limits, account entitlements and costs still need a smoke test. No Lovable project or paid service has been created.

The Lovable development agent is not the runtime banking agent. A generated interface, generic chat or animated execution trace does not demonstrate agent orchestration. Implement and expose real server-side extraction, conditional reference lookup/re-extraction, deterministic validation, bounded failure handling and persisted evidence. Keep the original input/output of tool steps as the trace; do not fabricate progress or chain-of-thought.

| Jury category | Weight | What a Lovable implementation must demonstrate |
| --- | --- | --- |
| Originality | 15% | A specific Romanian SME workflow with evidence and, if stable, correction/recheck; UI polish alone is insufficient. |
| Research/domain understanding | 15% | Mentor findings, realistic roles and exceptions, sourced legal context, and clear synthetic-versus-real policy distinctions. |
| Agent design/orchestration | 25% | Runtime conditional decisions, useful tools, validated outputs, bounded retries, and escalation. |
| Completeness/stability | 20% | Persisted end-to-end workflow, real role enforcement, repeatable good/bad/uncertain cases, and usable failure states. |
| Architecture/reproducibility | Unconfirmed | Exported frontend/backend source, schemas/migrations, access policies, fixtures, environment-variable instructions and verified setup. |
| Business mentoring | Unconfirmed | Validated user problem, feedback incorporated into the workflow, measured handling time and realistic adoption plan. |

The screenshots do not show a builder prohibition or a scoring penalty for Lovable. This does not establish organizer permission: confirm external tools, AI services, source disclosure and submission rules. No score prediction is justified. Agent design and completeness account for 45% of readable scoring, so reserve most engineering/verification effort for the working flow.

### Proposed Lovable-only runtime design

- Lovable-generated UI: Romanian case list, upload, evidence/results, human tasks and role-specific actions.
- Managed database/auth/private storage: three demo users, scoped cases/documents, versioned runs and approvals, real access policies.
- Backend functions: parse supported text PDFs, run bounded agent steps, apply deterministic rules, save results and audit events. Check runtime limits early and persist job states for retry/failure recovery.
- AI connector or a configured provider behind one adapter: use actual live inference on synthetic data. Verify structured outputs and tool-selection behavior in the first spike; never substitute canned outcomes without labeling them as fixtures.
- Synthetic registry adapters: explicitly labeled ANAF/ONRC-style reference data; no claim of live registry validation.
- Authorization: apply both per-record data policies and server-side action checks, including private-file access, exports, self-approval denial and stale-approval invalidation.
- Submission: working hosted URL, export, database migrations/policies, seed/reset path, tests/results, short architecture explanation, demo script and backup recording.

### Go/no-go check and time allocation

Spend the first 3–4 hours proving one supported PDF → real model extraction → conditional tool step → deterministic result → persisted evidence, plus role isolation. If parsing, runtime/tool support or export setup blocks this, use Lovable for UI and a small independent backend rather than spending the entire hackathon fighting the platform. This is a fallback proposal, not a change already authorized for implementation.

If the spike passes, use the remaining first day for role-specific workflow, evidence and failure paths; preserve rest time. On day two, prioritize correctness/authorization tests, export/setup verification, mentor/value evidence and demo rehearsal over more pages. Do not add every bank department.

### Git and final-product constraints

Official GitHub integration docs state that Lovable creates a new linked repository, supports selecting a feature branch, and authors its automatic commits as `lovable-dev[bot]`. Direct code download without GitHub is documented for paid plans. Given the user's existing repository and no-AI-authorship preference, prefer downloading a code snapshot, reviewing it, and applying it to a dedicated `codex/<feature>` branch in the existing repository with the user's verified Git identity. Do not enable automatic sync or rewrite remote history as part of this feasibility assessment. This creates an export/review step outside Lovable even if the entire app is built and hosted there. Tool usage should still be disclosed wherever organizers require it.

Exporting source alone does not move the managed database, storage, authentication configuration or AI services. Final bank-controlled deployment requires explicit migration/replacement of those services and local-model evaluations. A hosted Lovable demo is not evidence of bank-scale readiness or local-only operation.

### Official references

- Built-in backend: https://docs.lovable.dev/features/cloud
- Runtime AI versus development agent: https://docs.lovable.dev/features/ai
- Server functions: https://docs.lovable.dev/features/edge-functions
- Security/access checks: https://docs.lovable.dev/features/security
- Git sync, branching, authorship and direct download: https://docs.lovable.dev/integrations/github
- Ownership/migration: https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership


## Conventional-stack planning decision (2026-10-28)

BUILD_PLAN.md now defines the implementation sequence. Begin with labeled Romanian fixtures and an extraction smoke test, then the authenticated case foundation, then a real agent review flow. Defer general platform infrastructure and financial execution. The first proposed implementation branch is codex/app-foundation; no code has been written.


## Market evidence and proposed innovation focus (2026-10-28)

Public vendor sources establish substantial overlap with the existing platform/onboarding concept. Do not pitch role-based banking workspaces, document extraction, evidence trails, localization or ask-back generation as market-first. See MARKET_AND_INNOVATION.md for sourced comparisons and limitations.

Proposed refinement: a bounded evidence-conflict investigation agent that considers competing explanations, selects a relevant permitted check, updates on observed evidence, and independently verifies its resolution. Show historical-change, missing-evidence and wrong-entity variants; compare with fixed rules and a one-shot LLM. This is a differentiation hypothesis, not a proven market gap or accepted code change. Preserve the conventional stack; if adopted, replace dashboard breadth with this focused investigation and evaluation work.


## Direction 2 source-driven scope decision (2026-10-28)

The user selected the workflow in message.txt and requested exact implementation design before coding. DIRECTION_2_IMPLEMENTATION.md is now the source of truth for scope: four discrepancy families, SME KYC first, simple ownership/declaration investigation, 12 scoped checks, typed trusted modules and versioned workflow composition. Credit/guarantee and broad departmental expansion wait until core acceptance passes. Neither the text's 24-hour suggestion nor its unsupported legal simplifications override the user or become active policy. API/worker/framework approach remains unchanged; first branch is codex/workflow-foundation when coding is requested.


## Hybrid frontend and modular functionality decision (2026-10-28)

Use Lovable for frontend generation and the conventional FastAPI/PostgreSQL/worker stack for execution. The detailed functional adjustments are recorded in DIRECTION_2_IMPLEMENTATION.md: approved versioned workflow templates, shared facts/findings/evidence, central disposition, explicit missing-input/failure states, shared human actions and server-enforced permissions. Existing checks remain in scope. No visual workflow builder or independently deployed microservices are needed for the MVP. Prove modularity with a compatible test module appearing in the existing results UI without runner edits. Planning only; actual implementation and validation remain pending.


## Implementation kickoff and frontend priority (2026-10-28)

Backend foundation implemented on codex/workflow-foundation: authenticated/scoped case API, private ingestion, source-verified manual facts, three deterministic modules and a versioned runner. This is a subset, not the completed 12-check/AI MVP. Full scope stays unchanged. First runner uses short synchronous transactions; worker jobs precede AI integration. SQLite is used only for isolated tests/development preview while PostgreSQL/Docker runtime is unavailable; PostgreSQL remains the deployment target.

User prioritizes a slick, modern, usable frontend with black/yellow accents and complementary colors. Bring a functional React workspace forward: charcoal sidebar, warm off-white canvas, restrained yellow emphasis, semantic statuses, case queue, document workflow, side-by-side findings/evidence and genuine run trace. Build locally against the API because no Lovable tool is connected; preserve compatibility with future Lovable export. Avoid fake AI results or unsupported performance metrics. Frontend work has its own branch.
