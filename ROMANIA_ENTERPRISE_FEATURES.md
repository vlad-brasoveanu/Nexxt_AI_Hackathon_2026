# Romanian bank platform: feature catalogue and integration roadmap

Updated: 2026-10-28. Planning only; no integrations or compliance controls implemented.

## Design goal

Make the platform easy to connect to a large Romanian bank and expand gradually. Start alongside existing systems with one document-review workflow. Do not replace the core banking system, build SD-WAN infrastructure, or assume access to Raiffeisen's internal APIs. Compatibility, security approval, capacity, and compliance must be demonstrated before claiming readiness.

Stages: MVP = 48-hour synthetic demo; Pilot = limited, bank-approved deployment; Scale = validated bank-wide deployment. Cloud inference is permitted only for the synthetic MVP under the current plan. Final inference runs on bank-controlled local infrastructure; approved registry connections are separate from model inference and do not make an entirely disconnected production system necessary.

## Features and functionality

| Feature | Functionality | Stage |
| --- | --- | --- |
| Shared case workspace | One case, documents, findings, owners, status and history across manager, analyst and supervisor views | MVP |
| Scoped permissions | Server-enforced case/role access, restricted export, and prevention of self-approval | MVP; branch/entity/field scoping in Pilot |
| Romanian-first experience | Romanian navigation, diacritics, Romanian sample text PDFs, Romanian date display and RON/EUR amounts; preserve original values | MVP; evaluated English support later |
| Company information extraction | Extract denumire, CUI, registration identifier, registered address and dates with evidence | MVP |
| Identifier checks | Deterministic syntax/checksum checks where appropriate, CUI consistency across records; preserve raw values and normalization history | MVP subset; broader identifiers in Pilot |
| Document pack validation | Check missing items and conflicting facts against an explicit versioned document checklist | MVP |
| Evidence viewer | Each field/finding links to source document, page, excerpt and processing version | MVP |
| Bounded AI investigation | Targeted re-extraction or scoped reference lookup; stop and request human review when unresolved | MVP |
| Handoffs and approval | Named owner, status, timestamps and correction requests; independent operational readiness sign-off | MVP |
| Case report | Export allowed findings, evidence and decisions; identify synthetic fixtures and cloud-demo processing | MVP |
| Correct-and-recheck | Replace a document and compare changes while retaining prior results | MVP stretch |
| Bank login integration | OIDC/SAML connection to the bank's identity provider, inherited MFA, managed role mapping and revocation | Pilot |
| Integration contract | Versioned case-create/status/result API, sample JSON/CSV mapping and mock bank adapter | MVP minimal |
| Bank connectors | CRM, document management, core banking and existing screening system adapters; mappings and scoped service identities | Pilot, after interface discovery |
| Event delivery | Signed notifications of case status/results, retry/replay, deduplication and reconciliation | Pilot |
| ANAF reference checks | Approved lookup of supported tax/VAT/inactive status; capture source, query time and freshness | Synthetic fixtures in MVP; live Pilot |
| ONRC company information | Compare submitted company records to authorized registry information or approved imports | Synthetic fixtures in MVP; live Pilot |
| Beneficial ownership review | Evidence-based ownership/representative information and discrepancy review; authorized RBR access if available | Pilot, compliance-designed |
| Policy lifecycle | Rule ID, source type, source reference, effective date, owner, version and outcomes | MVP metadata; reviewed activation/rollback in Pilot |
| Workload metrics | Handling time, elapsed time, waiting time, correction count, exception quality and AI cost | Small MVP summary; expanded Pilot |
| Local AI operation | Replace cloud adapter with locally hosted model, rerun evaluations, prohibit silent cloud fallback | Pilot/final product |
| Resilience and scaling | Durable jobs, independent worker capacity, failover, recovery tests and workload isolation | Pilot/Scale |

Identifier checks establish formatting/consistency, not identity, account ownership, business legitimacy, or regulatory clearance. Avoid collecting CNP in the company-document MVP. If a later approved process needs it, mask/restrict it and define its lawful use and retention. Do not merge people or companies based only on name normalization.

## Romanian market configuration

- Start with synthetic Romanian SME cases and two supported text-document templates: application and company-record extract. Potential later templates include certificates, articles of association, representative authorizations, and beneficial-owner declarations. Their mandatory use depends on approved policy and customer circumstances.
- Preserve Romanian characters and original addresses; normalize a separate comparison value. Format timestamps in Europe/Bucharest and store unambiguous timestamps. Never treat ambiguous dates as certain.
- Capture CAEN code together with revision and source date. ONRC published the introduction of CAEN Rev.3; older documents must retain their original classification. Do not invent one-to-one mappings or hardcode a transition deadline without checking the applicable current rule.
- Separate identifiers such as CUI and registry registration number in the data model. Allow versioned formats rather than hardcoding a single historical registry-number shape.
- ANAF publishes web services for fiscal information; choose and validate the specific current interface during pilot design. Public status data does not imply access to all tax information.
- ONRC/RBR services have access procedures. Do not assume an unrestricted public API, free bulk access, or existing bank entitlements. Support authorized imports until a supported connector is agreed.
- Label unavailable or stale reference data as unavailable/stale, with query time and source. Never translate a registry outage or absent response into a successful verification.

## Rules and governance

Romanian AML/KYC discovery starts with Law 129/2019 and BNR Regulation 2/2019, including applicable amendments and the bank's approved internal procedures. The sources reviewed establish a relevant framework, not a complete legal mapping or certification of this design.

Keep three categories visibly separate: legislation/regulation, bank internal policy, and synthetic demo policy. Each implemented requirement needs a responsible reviewer, applicable customer/process scope, effective date, source reference and tests. AI may propose a rule mapping; it must not activate legal changes or invent mandatory thresholds. The MVP checks operational completeness using fictional rules and does not certify AML compliance or open accounts.

For a pilot, add configurable retention with legal holds, purpose-based data minimization, field masking, access review, encryption, auditable changes and scoped evidence exports. GDPR principles motivate minimization and retention controls, but a delete button is not automatic compliance and retention duties may limit deletion.

DORA-related preparation should include service/dependency inventory, incident evidence, continuity/recovery procedures, resilience testing and third-party assessment. These controls support the bank's governance obligations; no DORA/GDPR-compliant label should be used on an unvalidated prototype. Further use-case review, including AI-specific requirements if scope expands, belongs in pilot approval.

PEP/sanctions matching should later connect to the bank's approved screening service. An LLM is not the source of sanctions lists and should not independently clear a match. Keep operational completeness separate from creditworthiness assessment and account approval.

## Low-friction integration

1. Discover the bank's identity provider, integration gateway, data model, document store, screening service, network zones, deployment standards and service owners. These are currently unknown.
2. Demo with documented versioned schemas, a small case API and synthetic connector fixtures. Prove a sample external client can submit a case and retrieve an authorized result.
3. Pilot in shadow/read-only mode: compare recommendations to analyst decisions without writing to the core banking system. Measure errors and benefit.
4. Add controlled result write-back only after bank approval, with duplicate protection, reconciliation and recovery. Financial transactions remain outside this product scope.
5. Roll out branch by branch behind feature flags, with stop/rollback controls and named operational owners.

Adapter contracts should isolate CRM/document/reference/model providers from workflow rules. Document field mappings and error semantics. Separate bank case IDs from internal IDs; track correlation IDs without logging document content. Begin with one modular application, not a fleet of microservices.

## Scaling without overstating readiness

MVP: one service, a documented API, local database abstraction and synthetic data. This is not evidence of bank-scale capacity.

Pilot/Scale: a production relational database (for example PostgreSQL, subject to bank standards), managed document/object storage, durable job queue and independently scalable workers. Keep API replicas stateless; enforce authorization on every request and job. Isolate model inference so model loading and GPU capacity do not block case browsing.

Control concurrent jobs, retries, document sizes, queue growth and per-team usage. Use idempotency for submissions and result writes; retry transient failures with bounded backoff; retain failed jobs for authorized recovery. Keep transactions short, enforce valid state transitions, and handle concurrent edits explicitly. Monitor job age, errors, evidence quality, throughput and model saturation.

Define bank-approved targets before promising volume: cases/day, peak concurrent users, documents/pages per case, P95 response/processing latency, availability, recovery time and acceptable data loss. Test realistic workloads and failure/recovery scenarios. More replicas alone do not solve database, registry or GPU bottlenecks.

## 48-hour scope and proof

Deliver one Romanian SME completeness workflow across three roles, Romanian synthetic documents and labels, evidence-backed checks, a fictional rule set with source/version metadata, labeled registry fixtures, and a small documented case API. Keep report/metrics simple. Use live cloud AI for synthetic text.

Test role isolation, submitter self-approval denial, CUI mismatch, Romanian diacritics, uncertain extraction, registry unavailable/stale states, duplicate case submission, provider failure and evidence correctness. Show a sample API client creating a case without manual UI entry. No real bank system or registry access is needed for this demonstration.

Defer enterprise SSO, live registries, broad OCR, general workflow builders, full policy-editing UI, Kubernetes/failover, multilingual breadth and real compliance sign-off. The integration story is a documented contract plus a reproducible example, not a promise of plug-and-play compatibility.

## Official sources checked

- Romanian Law 129/2019: https://legislatie.just.ro/Public/DetaliiDocument/225614
- BNR Regulation 2/2019: https://legislatie.just.ro/Public/DetaliiDocument/260129
- ANAF web services: https://static.anaf.ro/static/10/Anaf/Informatii_R/servicii_web.html
- RBR access procedure: https://legislatie.just.ro/Public/DetaliiDocument/235829
- ONRC beneficial-owner discrepancy procedure: https://www.onrc.ro/documente/legislatie/23.06.2023/Ordinul%20ministrului%20justitiei%20nr.887.pdf
- ONRC CAEN Rev.3 notice: https://www.onrc.ro/documente/anunturi/2024/INFORMARE%20CAEN%20.pdf
- European Commission, GDPR principles: https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en
- EBA, operational resilience / DORA: https://www.eba.europa.eu/regulation-and-policy/operational-resilience

Legal sources can have multiple consolidated versions. Before implementing real rules, the bank's legal/compliance team must verify the version in force, applicability, internal policy and any later amendments. This catalogue provides a design starting point, not exhaustive legal advice.
