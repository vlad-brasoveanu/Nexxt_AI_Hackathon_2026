# Bank departments, access, and AI opportunities

Updated: 2026-10-28. Planning research; no features implemented.

## Product direction and terminology

The user wants an internal platform where employees access capabilities and information appropriate to their tasks. SD-WAN manages connectivity across sites; the described application needs identity, role-based permissions, case-level access, and workflow routing. Recommend an internal AI operations platform deployed over the bank's existing network, which may include SD-WAN. Actual SD-WAN orchestration is not assumed to be in scope; confirm if the user intends network provisioning as well.

Do not grant access merely because a user is on the internal network. Enforce permissions in the backend for every case read, write, download, export, and agent tool call. UI navigation alone is not authorization.

## Department and opportunity map

This is a typical universal-bank functional map, not an exact Raiffeisen organizational chart. Responsibilities can be split differently between banks. Workflow bottlenecks and automation benefits below are hypotheses to validate with mentors, not observed bank findings.

| Function | Main work | Potential repetitive bottleneck | AI-assisted opportunity | Measure |
| --- | --- | --- | --- | --- |
| Retail banking / branches | Serve individuals; accounts, savings, cards, lending applications | Incomplete applications and repeated questions | Precheck document packets and draft missing-information lists | Handling time; first-time completeness |
| SME / corporate relationship management | Serve companies; onboarding, financing requests, account servicing | Re-entering company data and chasing missing documents | Extract company data, prepare case summaries and handoffs | Time to complete file; resubmissions |
| Operations / back office | Process service requests, onboarding administration, reconciliations | Manual comparison and exception queues | Evidence-backed validation and exception routing | Minutes per case; rework; queue age |
| Payments / cards / disputes | Investigate failed payments, card disputes, settlement exceptions | Reconstructing events across records | Assemble timelines and supporting evidence | Investigation time; unresolved cases |
| Credit analysis / underwriting | Assess repayment capacity and prepare credit decisions | Reading statements and assembling financial inputs | Extract financial facts, flag inconsistencies, draft sourced summaries | Preparation time; correction rate |
| Risk management | Independently oversee credit, market, liquidity and operational risks | Aggregating incidents and control evidence | Summarize exceptions and detect recurring patterns for review | Report preparation time; issue closure |
| Compliance / AML oversight | Oversee compliance controls and escalate concerns | Gathering evidence and reviewing alerts | Assemble review packets, summarize evidence, prioritize with human review | Review time; false-negative/false-positive rates |
| Fraud operations | Investigate suspected fraud and disputed activity | Fragmented transaction/device/case evidence | Summarize linked events and suggest investigation steps | Investigation time; confirmed detection quality |
| Treasury / asset-liability management | Manage liquidity, funding and balance-sheet exposures | Consolidating positions and explaining breaks | Reconcile inputs and draft exception explanations | Reconciliation time; unexplained differences |
| Finance / accounting / reporting | Close books, reconcile ledgers, prepare reports | Manual matching and commentary preparation | Suggest matches and draft variance explanations from verified figures | Close-cycle time; unresolved breaks |
| Legal | Review contracts, disputes, and legal questions | Finding clauses and comparing versions | Retrieve sourced clauses and highlight deviations | Review time; missed deviations |
| Internal audit | Independently assess controls and follow remediation | Collecting evidence and reconstructing decisions | Assemble scoped evidence trails and remediation summaries | Evidence collection time; traceability |
| IT / cybersecurity / data | Operate systems, manage access, incidents and data quality | Ticket triage and repeated diagnostics | Classify tickets and retrieve approved runbooks | Resolution time; reassignment rate |
| Customer service / complaints | Answer enquiries and resolve complaints | Reading long histories and routing cases | Summarize histories and draft reviewed responses | Resolution time; repeat contacts; satisfaction |
| HR / procurement / facilities | Staffing, training, suppliers and internal services | Repetitive forms and policy questions | Check internal requests and retrieve approved policy guidance | Processing time; incomplete requests |

Customer-facing teams and operational units own their business risks; risk and compliance provide independent oversight; internal audit provides independent assurance. Do not make auditors routine case approvers. First-line KYC operations and independent AML oversight should not be treated as interchangeable roles.

## Recommended 48-hour demonstration

Keep one workflow: a synthetic SME onboarding completeness review. Expand the existing CaseCheck concept into a shared internal case platform, not a bank-wide suite.

Three seeded users with server-side sessions and fixed permissions:

| Role | Allowed scope and actions | Explicit boundary |
| --- | --- | --- |
| Relationship manager | Create assigned cases, upload synthetic documents, view permitted findings, respond to missing-information requests | Cannot view other managers' unrelated cases or sign off own submission |
| Operations analyst | Review the assigned operations queue, run AI checks, inspect evidence, request corrections, recommend readiness | Cannot change policy or provide supervisor sign-off |
| Operations supervisor | Review scoped exceptions, accept an operational readiness recommendation or return it with a reason | Cannot edit original evidence or approve a case they submitted |

Sign-off means operational completeness only; it does not open an account or certify AML compliance. A future auditor can receive scoped read-only evidence access. A future IT administrator manages access/configuration without default entitlement to all case contents.

Flow: manager submits → AI extracts and checks → analyst reviews discrepancy → manager supplies correction → analyst rechecks → different supervisor signs off readiness. Every handoff has an owner, status, reason, and timestamp. “Needs information” remains an allowed outcome.

Feature priorities: role-specific home pages; scoped case lists; evidence-backed checks; human-owned handoffs; activity history; local report export. Keep shared UI components with role-dependent actions. Do not build three separate applications.

Access acceptance tests: manager A cannot retrieve manager B's case even by direct URL/API; analyst cannot call supervisor approval endpoint; submitter cannot self-approve; exports and AI context honor the same case scope; denied requests leave no unauthorized changes. The AI cannot assign privileges or decide who may access a record.

If time slips, cut policy editing, multilingual support, general chat, detailed dashboards, and elaborate report design before cutting real authorization or the agent workflow. Enterprise SSO/MFA, actual SD-WAN integration, broad departmental modules, and production identity lifecycle remain beyond MVP.

## AI, time savings, and profitability

The primary MVP value hypothesis is less manual preparation and rework per onboarding case. Faster complete files may also shorten time to activation and reduce abandonment, but these revenue effects need later measurement and depend on downstream approvals.

Separate three kinds of value:

1. Capacity: extraction, document comparison, and missing-information checklists reduce analyst minutes per case.
2. Operational quality: evidence-backed findings, explicit uncertainty, and structured handoffs reduce repeated corrections and lost requests.
3. Revenue enablement: faster onboarding may increase completed activations and bring revenue forward. Relationship-manager briefs and suitable next-product suggestions are future opportunities requiring consent, appropriateness controls, and independent evaluation; do not automate offers in this MVP.

Use deterministic code for arithmetic, rule thresholds, dates and access decisions. Use AI for interpreting variable documents, selecting bounded investigation steps, and drafting evidence-grounded summaries. AI adds little value to routing a known status or computing a queue count.

Measure handling time separately from elapsed time: handling time is active work; elapsed time includes waiting for another department or customer. Track first-time completeness, number of handoffs/corrections, exception-routing accuracy, unsupported findings, AI cost per case, and time awaiting each role. Do not reward speed at the expense of missed exceptions.

Illustrative capacity calculation, not a forecast: if 1,000 cases/month save 10 active minutes each, capacity released is about 167 hours. At an assumed EUR 20/hour, that is about EUR 3,333 of labor capacity value before API, infrastructure, review, maintenance, and integration costs. It is not automatically cash savings, headcount reduction, or profit.

For actual profit impact, evaluate incremental contribution from additional completed business plus realized avoidable costs minus implementation and ongoing costs. Do not count released capacity and payroll savings twice. Do not claim full customer revenue as profit. Fraud-loss reduction and revenue gains are unproven until measured against a credible comparison.

For the hackathon, benchmark matched synthetic cases manually and with assistance, include verification/corrections, disclose sample size and familiarity effects, and show measured results only. A small demo can demonstrate time saved and correct routing; it cannot establish real-bank profit gains.

## Research sources

- Cisco, SD-WAN explanation: https://www.cisco.com/site/us/en/learn/topics/networking/what-is-the-difference-between-sd-wan-and-mpls.html
- NIST, Zero Trust Architecture: https://www.nist.gov/publications/zero-trust-architecture
- Raiffeisen Bank Romania, 2025 reorganization announcement (historical published structure; not a verified current org chart): https://www.raiffeisen.ro/ro/despre-noi/comunicate-de-presa/2025/divizie-imm-reorganizare-2025.html
- BIS, Operational risk and three lines: https://www.bis.org/committees/bcbs/basel-consolidated-guidelines/module/orr/10
- BIS, Compliance functions: https://www.bis.org/committees/bcbs/basel-consolidated-guidelines/module/iac/20
- BIS, AML/CFT role distinctions: https://www.bis.org/committees/bcbs/basel-consolidated-guidelines/module/afs/10

Next mentor questions: which team owns initial document checks; where cases wait; which errors cause returns; which roles may see which fields; which approvals must be separate; monthly volumes; active minutes per case; and how successful onboarding contributes to business value.
