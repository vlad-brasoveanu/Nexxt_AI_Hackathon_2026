# CaseCheck — current scope, progress and next steps

Last updated: **2026-10-29**. Repository: https://github.com/vlad-brasoveanu/Nexxt_AI_Hackathon_2026.git. Dated history and earlier architecture decisions: [LOG.md](LOG.md).

## Current agreement

The modular SME credit backend is delivered. The user authorized the professional frontend refresh on 2026-10-29: retain the original navigation/workflow and real local API, use graphite/blue surfaces and Inter, simplify employee information, and replace the compressed agent graph with large grouped cards. Backend APIs, permissions, calculations and inference remain unchanged. OCR and prospecting remain outside this delivery. Agents prepare evidence and recommendations; people decide.

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
4. **`codex/credit-workspace-integration`** — contains all stages plus minimal UI and integration hardening; integration stage.

Commits use Vlad Brasoveanu's configured identity, without AI co-author/signature. The unrelated `fixtures/demo_pdfs.zip` is preserved outside the delivery. The alternate Lovable-inspired UI remains on its separate prior branch.

## Remaining work

1. **Broader AI evaluation:** the first cloud end-to-end scenario is verified; extend live checks to the other synthetic cases and measure variability/memo quality. Keep model errors and actual processing mode visible.
2. **Operational evidence:** have a person measure the manual baseline and assisted review time. The human baseline remains unmeasured; do not claim time saved or profit improvement from automated test duration.
3. **Frontend follow-up:** user visual review of the professional refresh; broader browser/device and assistive-technology testing before production. The delivered refresh is available locally and published on `codex/evidence-review`; no merge has been performed.
4. **Bank validation:** mentor review of financial definitions, supported products, source reliability, approval authority and policies. CFADS = EBITDA − tax is a visible demo approximation. Policy and data are fictional; no compliance certification is claimed.
5. **Deployment:** verify PostgreSQL concurrency, worker/restart behavior, bank identity/SSO and real integration adapters before production claims. Current local background execution is suitable for demo, not an enterprise job queue.
6. **Prospecting module (deferred):** obtain a separate company source and current-client CUI list, then add configurable filters and human-approved contact drafts. Historical anonymous rows cannot identify prospects.
7. **OCR (deferred):** add a replaceable OCR adapter and evaluate Romanian scans/tables. Mention it as planned capability, not delivered functionality.
8. **Final product:** local inference adapter, hardware benchmark and true offline/no-cloud-fallback verification.

The activation/fix follow-up is on **`codex/featherless-demo-validation`**, stacked on the full integration branch. All five stages are now integrated into **`codex/agentic-workflow`**, the delivery branch explicitly requested by the user on 2026-10-29.

## Practical demo

Use the running isolated demo at **http://127.0.0.1:8015/**. It has its own temporary SQLite database and documents, leaving existing servers untouched. Standard reproducible startup remains `scripts/preview.py` on port 8000, followed by `scripts/demo/credit_seed.py`; commands and test flow are in README.

Verified real-AI case: http://127.0.0.1:8015/#/credit/1886c79f-ca1a-4538-bac4-0a0336abfacb. Older runs keep their original deterministic-mode label; new runs use the configured cloud models.


## Professional UI refresh — 2026-10-29

Branch: **`codex/professional-ui`**, created from delivered `codex/agentic-workflow` (`14d3728`). Preview: **http://127.0.0.1:8015/**.

Implemented:

- [x] Graphite canvas `#1C2027`, blue primary `#2563EB`, neutral light theme, locally bundled Inter and tabular financial figures. Rounded surfaces, restrained borders/elevation, visible focus, 180–200 ms transitions and reduced-motion CSS. Decorative grid/cut corners/glitch/stamp/blinking effects removed.
- [x] Full-width agent workspace: compact coordination header, eight cards in two functional groups, 4/2/1 responsive columns. Counts and statuses come from API agent/run data. Selected results include warnings, financial values, fact/PDF links, calculation sources, policy rules, memo or historical-comparison navigation. Raw summaries, actual processing mode and execution data remain expandable.
- [x] Five recent meaningful events plus expandable full chronology. Repeated dispatches remain visible as reverifications of the actual target agent; critic challenges/refusals/failures are preserved.
- [x] Employee screens have shorter Romanian copy and semantic status icons/colours. Prototype banners/login credentials, provider/model badges and routine execution details are removed from the main view. Stored PDF bytes, quotations, memo/letter contents and audit data remain intact.
- [x] Safety test and fixture-response loading are confined to collapsed administrator case tools; the explicit demo decision exception is administrator-only and collapsed. Authority, current-evidence, review and separate-person signing requirements remain enforced by the existing backend.
- [x] Decision terms use contextual empty states; approval is green, rejection red, progression blue. Alternate terms, full memo/letter and detailed provenance are expandable. DSCR/LTV explanations are available on their labels.
- [x] Queue, review, Risk Planner, decision, administration, login and shared KYC components adopt the visual system. Review supports visible confirm/reject/correct controls, an explicit corrected-value save button, keyboard selection and source-page navigation. Keyboard tabs support arrows/Home/End; signing stops when focus is lost.

Validation performed in this refresh:

- `npm run build --prefix frontend`: passed, including `tsc --noEmit`. `git diff --check`: passed.
- Real local API browser sessions for `admin`, `officer` and `risk`: queue/case navigation; officer source selection opened the 2025 PDF at page 2 with the correct quoted value; a single existing fact was reconfirmed and saved successfully, without changing its financial value. Risk Planner recalculation produced an audit event. Officer cannot sign; risk reviewer approval against a decline remains disabled until the required reason is provided. No new final credit decision was signed during this refresh.
- Administrator users, policy and paginated audit screens rendered; test controls were absent for ordinary roles. Admin test exception was inspected as a collapsed control, not activated. Login no longer exposes test credentials.
- Dark/light visual checks and real-application responsive iframe checks at 390, 900 and 1440 px; desktop has four readable columns. All eight cards remain accessible without graph scaling. Long queue tables scroll within their container.
- Controlled presentation checks render the actual component with seven states: idle, running, completed, warning, blocked, failed and outdated. Each renders eight cards with correct completion counts; only running cards animate. These are presentation fixtures derived from an existing API response, not seven new live AI runs.
- Eleven core foreground/background token pairs pass 4.5:1 contrast. Keyboard tab selection and visible focus checked in browser; reduced-motion override reviewed in CSS. OS-level reduced-motion emulation and full screen-reader/mobile-device testing were not performed.
- Latest inspected browser session had no console errors. Temporary status/viewport harness pages are validation artifacts, removed from the served build after checks; reports remain ignored in `.runtime/` (`ui-state-validation.json`, `ui-contrast-validation.json`, `ui-build.log`).

Remaining: user visual feedback, broader accessibility/device validation, and the unchanged backend/product work listed above. This refresh is included in the published `codex/evidence-review` snapshot. The unrelated `fixtures/demo_pdfs.zip` is preserved.


## Dossier navigation, exact evidence and review UX — 2026-10-29

Follow-up branch: **`codex/evidence-review`**, preserving the in-progress professional UI refresh. User reported that clicking dossiers failed and requested exact document highlighting plus a cleaner interface.

Implemented and verified:

- [x] Reproduced the actual crash: the KYC list included credit cases, routed them into the legacy KYC screen, and dereferenced a nullable `facts` payload. The portfolio now uses the server's case kind and actual credit status, makes the full row clickable, and routes to the correct workflow. Old `/cases/<credit-id>` links redirect safely. Nullable facts/proposals are handled explicitly, and absent extraction cannot be confirmed.
- [x] Replaced embedded PDF iframes with a lazy-loaded, locally bundled Mozilla PDF.js renderer. Stored file bytes are checked against SHA256; the cited document/version/page/span is validated before highlighting. PDF text positions use unique source context to distinguish repeated numbers. Missing/ambiguous placement produces a warning instead of marking another occurrence. No OCR or cloud document viewer was added.
- [x] Highlighted original PDF glyph ranges with zoom, page navigation, return-to-citation and original download. CSV/JSON/text sources use validated exact-span highlighting. Python code-point offsets are converted correctly to DOM UTF-16 positions.
- [x] Added an expanded source dialog with native keyboard focus/escape handling, available from review and metric citations. Calculation references are grouped by indicator and display the cited fragment rather than repeated indistinguishable links.
- [x] Reworked the portfolio with real statuses/counts, search, clear row actions and short business information; removed long IDs/revision noise. Review now prioritizes data beside its source, has independent scrolling and sticky navigation, and keeps the source header visible. Agent status chips are less dominant. Existing banking calculations, backend permissions and decision gates are unchanged.

Validation evidence:

- `npm run build --prefix frontend`: passed, including TypeScript. PDF.js is lazy-loaded; Vite reports the expected optional PDF chunk size warning (~575 kB uncompressed). `git diff --check`: passed.
- `npm run test:evidence --prefix frontend`: **6 passed** (repeated values, ambiguous context, invalid spans, Unicode, PDF text splitting/ligatures and missing values).
- Read-only validation of all seven existing local cases: **804/804** references validated/located: 368 fact citations plus 436 metric sources, including PDF, 136 CSV references and 94 JSON references. Matching is verified on supported stored documents; it is not a promise of automatic positioning in every possible PDF layout.
- Browser: clicked all seven dossier rows successfully; tested an old KYC-style credit URL redirect. Verified highlights in financial statements, application, ONRC certificate, identity and valuation PDFs; zoom kept the citation visible; moving to another page removed the marker. Expanded PDF viewer and JSON/CSV markers worked (JSON `800000`, CSV `364865,50`). Fresh browser console had no errors. No loan decision, document change or inference run was triggered for these checks.
- Actual screenshots and ignored validation reports are in `.runtime/`: `dossiers-ui.png`, `evidence-review.png`, `evidence-validation.json`, `evidence-tests.log`, `evidence-build.log`. Existing fixture ZIP remains untouched. PDF.js adds no reported audit issue; the existing Vite development dependency audit warning remains a separate tooling follow-up.

Remaining: user visual feedback, broader document-layout/browser and screen-reader checks; production/local-inference items above remain open. Changes are published on `origin/codex/evidence-review`.


## GitHub publication — 2026-10-29

- User requested publishing the current work before any further changes.
- Implementation commit **`173b36b`** published to **`origin/codex/evidence-review`**; the remote hash was verified with `git ls-remote`.
- Author and committer: Vlad Brasoveanu `<brasoveanu.vlad24@gmail.com>`. No AI author/co-author trailer was added; signing settings were preserved.
- Included the professional UI refresh, dossier navigation fixes, exact source viewer, dependency lockfile, six evidence tests and project records. Ignored credentials/runtime artifacts and unrelated `fixtures/demo_pdfs.zip` were excluded.
- At publication time, duplicate Codeforge cases were still present. They have since been preserved in the backup and replaced in the active local preview by the clean reseed described below. No default/delivery branch merge or pull request was created.


## Live agent workspace, restrained controls and clean reseed — 2026-10-29

Branch: **`codex/live-agent-workspace`**, based on the published evidence-review branch. User requested the agent-work visualization back, simpler accents/corners and a fresh local demo.

Implemented:

- [x] Restored **Cum lucrează agenții** before a run and during real execution: coordinator, eight agent states, current handoff, dispatch/result history and critic-requested rechecks. **Execuție în timp real** and **Rezultate și surse** are separate views; selecting a specialist opens its result/source details. No simulated timing or fabricated activity.
- [x] SSE dispatch events now refresh the agent board as well as result events. An unfinished server dispatch identifies the active specialist immediately; the short refresh timer is scoped to its run and cancelled on unmount. Status/counts remain derived from actual API data.
- [x] Removed curved blue tab underlines, reduced general corner radii, joined the decision choices with straight internal seams, and changed permission metadata to neutral styling. Selected approve/reject choices retain soft semantic colours; the final signing control and all review/authority requirements are preserved. Financial summary now adapts to its own panel width, avoiding overlapping amounts.
- [x] Backed up the previous preview SQLite database and all **86 stored files** to `.runtime/backups/before-reseed-20261029-085149/` (Europe/Bucharest timestamp). The original database/documents in `/private/tmp/` were retained too. No active run was interrupted.
- [x] Replaced the active preview on **http://127.0.0.1:8015/** with a newly migrated isolated database, the same three accounts and **three unique companies / three initial cases / 20 intake files / zero agent runs**. Each case is ready for the user's manual analysis. Test outcomes, reviewed facts and decisions were not prefilled.

Current local runtime:

- Database/documents: `.runtime/demo-reseed-20261029-085821/`.
- Startup profile: ignored `.runtime/current-preview.json`; restart the same preview with `.venv/bin/python .runtime/start-current-preview.py`.
- Existing `scripts/preview.py` remains the portable default preview on port 8000. Existing `credit_seed.py` appends cases; the clean 8015 environment was seeded once.

Validation:

- Frontend build + TypeScript passed; the existing lazy PDF chunk-size warning remains. Five new execution-state tests plus six citation tests passed (**11 total**); diff whitespace check passed.
- An isolated server on port 8016 exercised actual Featherless inference and the PDF workflow, including draft/manual request send, a synthetic completion response and manual reanalysis. Browser observed financial-statement and memo agents in progress, critic rechecks, completion and opening a specialist result without a page reload.
- Isolated final run: **AWAITING_DECISION**, **25 steps**, **53 facts**, **3 successful cloud model records**, **0 model error records**, **1 critic challenge**, memo **0 unverified numbers**. No credit decision was signed. This validation does not consume the clean cases on 8015. The temporary 8016 server was stopped after checks.
- Light-theme browser checks: selected main tab has **0px bottom border / 4px radius**; decision children have **0px internal radius**, group **6px**. Keyboard left/right selection works, signing remains blocked while review/reason requirements are unmet, amounts no longer overlap. Browser console had no errors.
- Verified the usual port through API and browser: exactly three distinct CUIs, all runs absent, 20 documents, no duplicate Codeforge cases. Fresh login is required after the database switch; account names/passwords are unchanged.
- Evidence: ignored `.runtime/live-agent-validation.json`, `.runtime/live-tests.log`, `.runtime/live-build.log`, `.runtime/live-agents.png`, `.runtime/live-decision-style.png`, `.runtime/reseed-backup.json`.

Remaining: user testing and visual feedback, broader assistive-technology/device validation, and the existing production/local-inference work above. Published on `origin/codex/live-agent-workspace` at the user's request; implementation commit `5d2197b` was verified against the remote branch.


Publication confirmed on 2026-10-29: `codex/live-agent-workspace` includes all prior evidence-review work plus the live execution/controls follow-up. Author and committer remain Vlad Brasoveanu, without AI trailers. Local reseed data, credentials, backups and the unrelated PDF ZIP are not committed. No merge or pull request was created.
