# CaseCheck — current scope, progress and next steps

Last updated: **2026-10-29**. Repository: https://github.com/vlad-brasoveanu/Nexxt_AI_Hackathon_2026.git. Dated history and earlier architecture decisions: [LOG.md](LOG.md).

## Current agreement

Build the modular SME credit MVP backend first. Keep the original frontend and only the controls needed to verify functionality; final visual design comes last (user clarification on 2026-10-29). Backend pause is revoked. OCR and prospecting are outside this delivery. Agents prepare evidence and recommendations; people decide.

All demo PDFs, companies, policies and source services are synthetic. The supplied historical SQLite is also synthetic; the user confirmed financials and credits are EUR. Current credit applications are RON. Cloud AI is allowed for synthetic MVP data; final-product local inference and offline verification remain future work, without silent cloud fallback.

## Delivered and verified

- [x] **PDF workflow:** actual file upload through FastAPI, stored bytes/hash/page text and literal source spans; CSV bank exports retained. Textless/scanned PDFs return an actionable `PDF_TEXT_REQUIRED` error; no OCR is called.
- [x] **Supported-template validation:** document kind, company/CUI, financial year, RON/units, requested amount/term, product and CAEN. Ambiguity blocks a favorable result. This is intentionally not a universal financial-document parser.
- [x] **Source versions:** replacement PDFs preserve the old bytes and audit trail, exclude obsolete sources from new analyses and invalidate old review. The upload supports explicit replacement; matching filenames are versioned automatically. Conflicting financial versions require reconciliation.
- [x] **Human controls:** all necessary facts must be reviewed; rejected/missing values do not become zero. Corrections/conflicts require meaningful reasons. Financial corrections recompute affected metrics. Stale/incomplete analyses cannot approve. Case/run write claims prevent stale review/decision overwrites; PostgreSQL concurrency still needs deployment validation.
- [x] **Manual communication:** one consolidated client-request draft, explicit human send through a simulated portal, explicit reanalysis after client documents arrive. No external mail/contact is sent.
- [x] **Historical adapter:** 6,000 supplied synthetic EUR credit cases, 3,726 RO; read-only SQLite schema/integrity/relation checks, financial validation and dataset SHA256 provenance. No silent fallback to the old CSV.
- [x] **Risk Planner:** RO + explicit sector/product mapping, up to 30 comparable cases and five examples. Similarity uses only pre-credit ratios/age/employees; outcomes, flags and narratives do not select neighbors. Future outcomes are censored after matching. No personalized probability of default is claimed.
- [x] **Scenarios:** request, maximum admissible amount at requested term and a permitted longer term. Capacity respects policy plus the selected combined cash-flow/rate stress. Weak comparisons, missing inputs or unresolved blockers prevent a favorable recommendation. Reports persist case/run revision, dataset hash, policy, market and assumptions. EUR history and RON current amounts remain separate.
- [x] **Three roles:** case officer, risk reviewer and administrator; signing authority L1/L2/L3 is independent. Legacy user IDs, authority and audit identities survive migration. Demo accounts: `officer`, `risk`, `admin`, password `12345`; seed does not reset existing administered accounts.
- [x] **Administration:** team-scoped active-user counts, user creation/role/authority/deactivation, session revocation, optimistic user updates, paginated/filterable audit, versioned policy thresholds and open-case reanalysis after policy publication. Closed decisions remain historical records.
- [x] **Administrator demo exception:** disabled by default in server settings; local preview explicitly opts in. Each exceptional decision requires a checkbox and meaningful reason and is stored/labelled demonstrative. Complete-evidence/current-analysis gates still apply. Normal L3 requires two different people agreeing on terms and conditions.
- [x] **Minimal original UI:** upload/replace documents, create a credit case, run/rerun agents, send draft, review source facts, Risk Planner, decision and administrator screens. No new visual redesign. New modules use the real API; the old mock preview does not simulate them.
- [x] **Reproducibility:** migrations through `g140_document_versions`, current `docs/openapi.json`, updated README, and live HTTP smoke script `scripts/demo/verify_credit.py`.

## Validation evidence

- `.venv/bin/pytest -q`: **136 passed**; one existing dependency deprecation warning.
- `npm run build --prefix frontend`: **passed**, including TypeScript.
- Alembic fresh/legacy upgrades validated; user IDs and audit references preserved. `alembic check` on the demo SQLite DB: **no new upgrade operations detected**.
- Real HTTP smoke: PDF upload → consolidated draft/manual send → response/manual rerun → 53 source-grounded facts → review → 30 comparables → correction/recalculation → separate-user decision → audit. Report in ignored `.runtime/credit-smoke.json`. Last run about 1.27 seconds in deterministic mode; this is automated smoke-test time, not employee productivity.
- Browser with real API: officer login, original queue, PDF-based agent run, draft inspection/send, simulated answer, manual rerun, 53-fact review, Risk Planner and administrator users/policy/audit page. No real lending or external contact.
- **Featherless activated and validated, 2026-10-29:** reused the prior key in Git-ignored `.env` with mode 0600; the value was never printed or added to a commit. Single real 7B PDF extraction: 24 proposed fields, 24 source-anchored, about 5 s.
- **Cloud end-to-end smoke passed:** Qwen 14B planning/memo and Qwen 7B extraction, 53 facts, 30 comparable cases (20 observed outcomes), correction/recalculation, separate-user decision and audit; 86.61 s automated elapsed time. Final memo is model-generated with zero unverified numbers; one draft was rejected by the number guard. This is one synthetic-case validation, not a broad model accuracy benchmark.
- The live run exposed a unit-suffixed valuation (`5.200.000 RON`) being omitted. Fixed numeric-format fallback with explicit rejection evidence, rejected partial-number prefixes, and require clarification when a secured loan lacks an extracted valuation. Added regression coverage and kept unit-test settings isolated from runtime credentials.
- Local reports: `.runtime/featherless-reuse-validation.json`, `.runtime/featherless-live-workflow.json`, `.runtime/credit-smoke.json`.

## Branches

Each stage is stacked on the previous verified stage, starting from the original `codex/agentic-workflow`:

1. `codex/pdf-credit-workflow` — `bd5f4b3`.
2. `codex/risk-planner` — `3276f35`.
3. `codex/roles-audit` — `d2c0be9`.
4. **`codex/credit-workspace-integration`** — contains all stages plus minimal UI and integration hardening; current delivery branch.

Commits use Vlad Brasoveanu's configured identity, without AI co-author/signature. The unrelated `fixtures/demo_pdfs.zip` is preserved outside the delivery. The alternate Lovable-inspired UI remains on its separate prior branch.

## Remaining work

1. **Broader AI evaluation:** the first cloud end-to-end scenario is verified; extend live checks to the other synthetic cases and measure variability/memo quality. Keep model errors and actual processing mode visible.
2. **Operational evidence:** have a person measure the manual baseline and assisted review time. The human baseline remains unmeasured; do not claim time saved or profit improvement from automated test duration.
3. **Final frontend:** simplify and polish the employee experience after backend review; current controls are functional verification UI.
4. **Bank validation:** mentor review of financial definitions, supported products, source reliability, approval authority and policies. CFADS = EBITDA − tax is a visible demo approximation. Policy and data are fictional; no compliance certification is claimed.
5. **Deployment:** verify PostgreSQL concurrency, worker/restart behavior, bank identity/SSO and real integration adapters before production claims. Current local background execution is suitable for demo, not an enterprise job queue.
6. **Prospecting module (deferred):** obtain a separate company source and current-client CUI list, then add configurable filters and human-approved contact drafts. Historical anonymous rows cannot identify prospects.
7. **OCR (deferred):** add a replaceable OCR adapter and evaluate Romanian scans/tables. Mention it as planned capability, not delivered functionality.
8. **Final product:** local inference adapter, hardware benchmark and true offline/no-cloud-fallback verification.

The activation/fix follow-up is on **`codex/featherless-demo-validation`**, stacked on the full integration branch.

## Practical demo

Use the running isolated demo at **http://127.0.0.1:8015/**. It has its own temporary SQLite database and documents, leaving existing servers untouched. Standard reproducible startup remains `scripts/preview.py` on port 8000, followed by `scripts/demo/credit_seed.py`; commands and test flow are in README.

Verified real-AI case: http://127.0.0.1:8015/#/credit/1886c79f-ca1a-4538-bac4-0a0336abfacb. Older runs keep their original deterministic-mode label; new runs use the configured cloud models.
