# Market overlap and innovation proposal

Research date: 2026-10-28
Status: Public-source market scan and design proposal. No product trials, independent vendor benchmarks, patent search or exhaustive novelty determination. No pivot implemented.

## Conclusion

The current broad concept already exists commercially: AI document extraction, cross-document checks, onboarding workflows, role-specific dashboards, audit evidence and human exception handling. Romanian configuration, local deployment and an API are useful implementation requirements, but are not by themselves credible claims of a new category.

The earlier plan optimized for a feasible complete hackathon demonstration. The new user priority is stronger innovation and substantive AI. Before implementing, narrow the differentiation claim and test it against competitors and a mentor-validated operational problem. Public evidence cannot establish that no similar product, private deployment, patent or research prototype exists.

## Closest public examples

These are vendors' documented capabilities, not independent confirmation of performance. Do not repeat promotional savings percentages as measured facts.

| Provider/source | Documented overlap | Implication |
| --- | --- | --- |
| UiPath loan-origination QA/QC documentation | Document classification/extraction, institution-specific rules, cross-validation against documents and records, reviewer exceptions; integration options include a preview data component | The proposed extraction → checks → exception workflow is already described publicly |
| Fenergo FinCrime OS launch, May 2025 | Document, data sourcing, screening, significance and completion agents; role-based command centre | Multi-agent orchestration and personalized banking workspaces are not new claims |
| Fenergo Fen-AI launch, July 2026 | Governed client-lifecycle AI with recorded evidence and availability to customers | Evidence/audit/governance alone is not a sufficient differentiator |
| WorkFusion Kayla | KYC onboarding/review, harvesting documents and internal/external sources, narrative reporting | A KYC agent is already a commercial category |
| FlowX commercial-onboarding stack | Company extraction, cross-document checks, country-specific KYC, missing-document clarification, signatory and ownership checks | Localized onboarding and ask-back generation overlap strongly |
| Concentrix/Datakeen remediation, September 2026 | Reuse existing evidence before outreach and request missing information selectively | “Ask only for missing documents” is also not enough |

No claim is made that Raiffeisen uses these particular tools or that every advertised function is generally available in a given bank's deployment. An integration opportunity may still exist, but must be discovered.

## Recommended differentiation hypothesis

Build a narrow **evidence-conflict investigation agent** for Romanian SME operational review. Its central question is: “Which permitted check should we do next to resolve this contradiction, and what evidence would justify the result?”

Candidate differentiating combination, not verified market-first: explicit competing explanations, constrained next-evidence selection, permission-aware human handoff, and automated checks that the resolution remains grounded in the right evidence. Existing remediation, significance assessment and ask-back products overlap with parts of this design. Validate the exact combination through competitor demonstrations and mentor discussions before a novelty claim.

### One illustrative case

An application and company extract show different names/addresses but the same claimed CUI. Possible explanations include a historical change, extraction error, or an incorrect/mixed document. The agent must not pick whichever value looks newest and mark the case ready.

1. Extract claims with document/page/version and effective dates.
2. Record competing explanations and which evidence would distinguish them.
3. Choose an allowed check: re-read a passage, inspect an authorized historical record, consult a synthetic registry fixture, or request a specific missing document through a human.
4. Use returned evidence to update the explanation, preserving uncertainty when it does not resolve the contradiction.
5. Produce a resolution proposal: supporting evidence, unresolved requirements, affected checks and required reviewer.
6. Independently verify policy requirements and evidence links. Removing the decisive supporting evidence must return the affected conclusion to UNKNOWN; changing the CUI must prevent acceptance of unrelated-company evidence.

A registry/effective-date match can explain one discrepancy; it does not waive other current-document requirements or establish AML clearance. No automatic document edits, external outreach, or financial actions occur.

## Substantive AI implementation

| Component | AI role | Code/control role |
| --- | --- | --- |
| Claims extraction | Interpret variable Romanian document wording into structured facts with citations | Validate schema, source span and entity/document association |
| Hypothesis generation | Propose bounded explanations for conflicting facts | Restrict explanation types; hypotheses are not evidence |
| Next-step selection | Propose which available evidence check is relevant and why | Enforce action catalog, case access, budgets, timeouts and allowed state transitions |
| Evidence acquisition | Choose targeted re-extraction or lookup parameters | Run real tools; use clearly labeled fixtures for unavailable registry access |
| Resolution proposal | Explain how new evidence supports or rejects each hypothesis | Execute deterministic rules and require evidence for any cleared finding |
| Verification | Optional adversarial review only if time permits; not sole assurance | Run independent provenance, entity, rule and missing-evidence checks |

Use one bounded agent, not several personas taking turns on the same prompt. Tool observations change the next action. Suggested limit for MVP: three investigation steps, then human escalation. Set concrete limits after latency testing. A self-reported confidence number is never proof of correctness.

Choose among a small permitted action set. Rank by declared cost/customer burden and expected ability to distinguish hypotheses. Initially this is a transparent heuristic, not a learned probability or a guaranteed globally minimal plan. If claiming minimum requests, demonstrate optimality over the small enumerated action set and disclose its scope.

The evidence dependency structure can be ordinary database rows/JSON: claims → sources → checks → findings. No graph database or model training is necessary. Deterministic evidence tests prove only the specified properties; they are not formal proof of real-world correctness.

## Evaluation that distinguishes agent value

Prepare approximately 12–16 synthetic cases, including held-out wording/layout variations. Include historical changes, wrong-entity documents, unsupported explanations, absent history, injected document instructions and provider/lookup failures. Define acceptable resolutions, required escalation and evidence independently of implementation.

Compare three approaches on the same inputs and access permissions:

1. Structured extraction plus fixed rules; no adaptive follow-up.
2. One-shot LLM review; no tools.
3. Bounded investigation agent with independent verification.

Measure correct resolution/escalation, false-clear rate, unsupported evidence links, number of tool calls/document requests, active reviewer time, latency and inference cost. Include a case where fixed rules suffice; the agent should not add unnecessary work. Repeat a few cases to expose run variability. An agent that produces longer explanations without better outcomes is not an improvement.

Test removing support or changing entity identity, and compare whether the agent/verification layer catches it. Display actual results; do not prefill a benefit percentage. A small synthetic benchmark cannot establish real-bank savings, fraud detection performance or legal compliance.

## 48-hour scope tradeoff

If the user adopts this focus, replace generic platform breadth and dashboard polish with one strong investigation path. Keep basic role/case authorization, a minimal case/evidence UI, real live AI, three small tools, synthetic records, human resolution and a reproducible evaluation. No general banking assistant, predictive revenue model, live registry integration, ML training or broad department modules.

Suggested first proof before broad UI work: demonstrate the same apparent name/address mismatch resolving as a supported historical change in one fixture, remaining unresolved without history in another, and being rejected as a wrong-entity document in a third. Changing one source should change the investigation/result for a defensible reason.

This exercises originality (15%), domain research (15%) and orchestration (25%) while retaining completeness/stability (20%). The rubric asks for an inventive approach, not evidence that no similar idea exists anywhere. Do not sacrifice a tested workflow to chase an unprovable world-first claim.

## Questions to resolve before implementation

- Do mentors identify conflicting or stale evidence as a costly source of rework?
- Which existing bank tools already resolve these cases, and what remains manual?
- Can competitor demos already show hypothesis-driven investigation and evidence-removal/entity-change verification?
- Which outcomes can be validated with synthetic records and approved fictional policy?
- Is the user willing to narrow the platform to this investigation focus for the hackathon?

If evidence shows the proposed combination is already common, revise the hypothesis again. Do not relabel existing capabilities as novel. A claim of patentable or globally unprecedented invention requires a different, deeper investigation.

## Sources

- UiPath QA/QC: https://docs.uipath.com/industry-department-solutions/automation-cloud/latest/financial-services-user-guide/about-quality-control
- Fenergo May 2025 launch: https://www.fenergo.com/newsroom/fenergo-launches-fincrime-operating-system-with-agentic-ai-layer-to-supercharge-productivity
- Fenergo July 2026 launch: https://www.fenergo.com/newsroom/fenergo-launches-fen-ai-governed-ai-for-the-regulated-client-lifecycle
- WorkFusion Kayla: https://www.workfusion.com/videos/kayla-ai-agent-for-kyc/
- FlowX onboarding stack: https://www.flowx.ai/ai-agent-stacks/commercial-onboarding
- Concentrix/Datakeen remediation: https://www.concentrix.com/insights/fact-sheet/kyc-remediation/

Searches included general banking agent/document workflows and narrower combinations of onboarding, remediation, evidence graphs, counterfactuals and information gain. Sparse search results do not establish absence from the market.
