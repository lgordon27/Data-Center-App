# Live Research Reliability Gate — offline readiness

## Acceptance boundary

This report covers deterministic implementation and offline readiness only. **Live Red Oak acceptance is still pending. Fixtures do not establish the overall proof-of-system milestone.**

No paid/live research provider request, live document or DNS probe, acceptance run, deployment, or Git push was authorized or performed for this work. The local application was restarted and its home page inspected without starting research.

## Reproduced first gate and facility scope

A six-field, prose-free synthetic TDLR record was replayed against the pre-change extraction implementation and the current shared extractor:

| Gate | Before | After |
| --- | --- | --- |
| HTML content quality | `low-content`, `genuine-prose-below-300-characters` | `extracted` |
| Retained text | No retained passage | 180 characters |
| Structured fields | Not separately retained | Six readable fields |

The record contains the DataBank Red Oak–DFW10 project name, DB Data Center Red Oak, LLC owner, $301,000,000 estimated cost, 221,434 square feet, February 1, 2025 start, and January 31, 2027 completion. This is a reproducible first failure at extraction, not a claim that the exact first failure in an earlier live run has been reconstructed. The saved October 1 canary did not retain this TDLR document; it retained a DFW9 passage and left project identity unresolved.

The shared extractor now recognizes a terse record only when usable labeled fields include project/facility/building identity, a responsible party, a quantity, and both schedule endpoints. Navigation tables, incomplete stubs, application errors, verification walls, and 404/page-not-found bodies remain rejected. This content-quality distinction does not grant identity, claim support, or eligibility.

The end-to-end fixture submits the **DataBank Red Oak DFW10 facility**, not its LLC owner as the project name. The owner remains a separate field. Building-specific facts must not become whole-campus or other-building facts. A related-facility identity can guide analysis but does not establish exact-campus identity. The DFW9-for-DFW10 and whole-campus/all-phases controls remain ineligible.

## Canonical category mapping and order

No category or modeled evidence ID was renamed.

| Requested vocabulary | Existing canonical category |
| --- | --- |
| Project identity | `project-identity` |
| Grid / power / interconnection | `grid` |
| Construction / capital | `construction-capital` |
| Permitting / entitlement / community | `permitting-community` |
| Water / cooling | `water` |
| Tenant / counterparty | `tenant-counterparty` |
| Electricity / tariff | `electricity` |
| Climate / operational | `climate-operational-hazard` |

Analysis admission follows this foundation-first order. Search completeness remains independent of claim resolution and structured-analysis completion. Budget/deadline categories that never execute retain `NOT RUN` / `SEARCH INCOMPLETE`; they are not conclusive searched-not-found outcomes.

## Input bounds, provider pacing, and recovery

- `RESEARCH_CATEGORY_INPUT_TOKEN_CAP` defaults to 5,000 estimated input tokens. The estimate counts the serialized request at three bytes per token, including instructions, schema, and request-envelope overhead.
- Existing category routing, relevance and passage deduplication are preserved. Only relevant/assigned passage windows and bounded structured fields enter category analysis. Full cleaned retrieval and original source identifiers remain separately retained for quote verification.
- Windows admit a relevant sentence and its adjacent sentences atomically. If the cap cannot fit complete context, it omits that window rather than truncating a sentence or retaining a quantity without its neighboring scope/negation. Sanitized telemetry records windowing, omissions, input estimates and cap.
- `OPENAI_TPM_LIMIT` defaults to 30,000. The existing shared OpenAI gate reserves estimated input **plus** maximum requested output over a rolling minute, conservatively accounting for token-limit pressure. Category, retry and project-fallback requests sharing that gate share reservations.
- Full-project fallback output reservation may shrink to fit the configured TPM ceiling, retaining tokenization headroom; the gate still rejects oversized requests. Discovery/open budgets and the global research deadline were not increased.
- HTTP 429 recovery is once-only per affected logical call, honors numeric seconds and HTTP-date Retry-After, and uses a bounded one-second policy when no valid header is available. Provider reset-duration syntax is parsed separately. A retry requires remaining request/spend capacity and response time before the original deadline.
- Cancellation, deadline admission, token-ceiling rejection, TPM wait exhaustion, rate-limit wait exhaustion and request-budget rejection retain distinct sanitized reasons. Single-shot request headers and acceptance-run no-retry options disable the new 429 retry as well as existing corrective/fallback paths.
- Successfully retrieved source receipts remain available after category failure, 429 exhaustion, deadline admission failure, and later structured-response failure. Existing response, audit persistence, cache and registry paths retain URLs, canonical/resolved lineage, access receipts, publisher/class, defensible available dates, passages and attribution. Retention alone never grants eligibility.
- Candidate lineage preserves provider-observed originating queries when supplied, requested category/family, rank/dedup lineage and access/use/rejection/defer outcomes. Absent observed attribution remains explicitly unavailable; query plans and result order are not used to reconstruct it.

## DataBank DNS diagnosis: blocked, not corrected

The saved `red-oak-facility-identity-canary-2026-10-01.md` / `.json` records show five DataBank document opens blocked as `private-destination`. They do **not** contain sufficient saved resolver answers to establish the precise cause: the resolver's answer, an intervening environment/proxy, or another address-validation detail cannot be distinguished retrospectively.

No DNS correction or alternate address was licensed by those records. Deterministic fixtures verify public-only pinned transport, mixed public/prohibited answers, private/special-purpose addresses, redirect-hop revalidation, rebinding and cancellation. New diagnostics expose sanitized rejection rules, answer/family counts and public/prohibited counts, never raw resolver addresses or exception details. Every answer must independently validate; a public answer never permits connection to a different unvalidated or prohibited answer.

## Changed implementation and test files

All application paths below are under `artifacts/safeloc-diligence-workbench/`:

- `server/researchProjectProxy.mjs`: category windows/caps, foundation order, provider token gate and 429 recovery, audit telemetry, retained receipt/lineage recovery and sanitized DNS diagnostics.
- `server/researchProjectProxy.test.mjs`: offline scheduling, input-cap/context safety, fallback reservation, Retry-After, single-shot behavior, failure/skip/provenance/security controls and end-to-end DFW10 fixtures; existing prompt and deadline fixtures updated for the bounded scheduling behavior.
- `server/googleGroundedDiscovery.test.mjs`: explicit offline provider-gate isolation and current category prompt parsing. Merged discovery-attribution implementation was reused, not replaced.
- `server/researchDocumentExtraction.mjs`: shared meaningful structured-field extraction and narrow terse-record content-quality recognition.
- `server/researchDocumentExtraction.test.mjs`: readable/tag-free government fields, prose-free structured records, incomplete/navigation controls and error-body rejection.
- `src/data/researchContentQuality.mjs`: shared application-error/404/page-not-found checks.
- `src/services/researchProjectService.ts`: preserve sanitized input/cap/wait/retry telemetry through typed client audit parsing without adding a new UI or competing assessment contract.
- `src/services/researchProjectService.test.ts`: telemetry parsing/retention and rejection of untrusted omission explanations.
- `src/model/expectedEvidence.test.ts` and `src/model/financialTransmission.test.ts`: test-only corrections requested by completion validation after parallel changes merged (fixture path, separately returned capacity, and explicit reviewer-adjusted source value). No expected-evidence or financial-transmission production behavior was changed by these corrections.
- `src/model/expectedEvidenceProfile.ts`: explicitly type the existing runtime source-ID validation callback as `unknown` to avoid an empty-tuple union narrowing to `never`; validation conditions and runtime behavior are unchanged.

Supporting files: this report, `.agents/memory/offline-provider-fixtures.md`, and its memory index entry. No evidence/maturity UI, financial assumptions, accepted financial inputs, exposure/portfolio surface, discovery/open budget, deployment configuration, or source/identity/eligibility policy was changed.

## Offline validation results

All final deterministic checks passed:

- `pnpm --filter @workspace/safeloc-diligence-workbench run test`: **538 passed, 0 failed**, 17.62 seconds, fresh isolated cache, final rebased tree.
- The focused two-file troubleshooting pass passed its corrected routing, context-window/cap, fallback-reservation, Retry-After and elapsed-wait tests. The final package pass also includes corrected canonical-receipt containment, issued deadline cancellation, single-shot-header recovery and positive/negative DFW10 fixtures.
- Typecheck: passed with incremental output disabled (`pnpm --filter @workspace/safeloc-diligence-workbench exec tsc -p tsconfig.json --noEmit --incremental false`).
- Production build: passed; existing large-client-chunk warning remains (approximately 892 kB minified in the final rebased tree).
- Standalone `src/data/*.test.mjs`: 36 passed, 0 failed.
- Local application: workflow runs and the final home-page screenshot renders normally with a connected browser console and no application errors. After parallel proof-ledger changes merged, startup diagnostics report missing `proof_ledger_events` and `proof_user_decisions` schema fields. This separate schema setup was not performed by this offline task.
- Baseline six-field extraction comparison: expected pre-change failure and current extraction success confirmed entirely offline.
- Server JavaScript syntax checks and `git diff --check`: passed.

### Earlier failures, separately accounted for

An earlier package run completed with 487/490 passing. Two failures were obsolete category prompt/order assumptions in existing offline fixtures; their expectations now use the current prompt and assert coverage independently of concurrent completion order. The stalled-provider deadline test passed on the pre-change baseline but failed in the changed tree: its 250 ms deadline no longer admitted a request with the unchanged response reserve, and the partial-response classifier collapsed the admission deadline into `upstream`. The response now retains the precise deadline-admission reason while reporting the existing coarse `timeout` error type; the issued-request fixture uses 1,500 ms so it actually exercises aborting a stalled request. A subsequent 493/493 pass covered this research tree before additional parallel changes merged.

Completion validation of the merged tree then found 509 passing / 3 failing tests: a relative fixture path escaped the application directory, a capacity test read a nonexistent financial evidence item rather than `acceptedCapacityMW`, and a reviewer-adjustment fixture omitted its expected source value. Minimal test-only corrections resolved these failures. Existing execution/analysis outcomes, not-run reasons and search-completeness labels now also survive typed client audit parsing. An intermediate **516/516** pass covered that merged tree, including both deadline paths and the corrected parallel fixtures. No remaining package baseline failures are being waived.

A later sync with main required combining compatible capacity/source-value test fixes with incoming decision-backed assertions. That sync also introduced duplicate stray fixture declarations and undefined projection references in the Expected Evidence tests, plus the `never` narrowing described above. These fixture references and the type annotation were repaired without changing production policy or source/identity/eligibility rules. The Expected Evidence file then passed **11/11** focused tests, and the final rebased full package passed **538/538**. The earlier 516-test result remains an intermediate checkpoint, not the final submitted-tree result.

Unrelated integration fixtures inject an accelerated token window to avoid waiting real minutes. Dedicated TPM tests retain simulated 30,000-token / 60,000-ms limits; production defaults are unchanged.

## Remaining risks and next authorized criterion

1. Actual Red Oak source availability, provider rate-limit responses and candidate attribution have not been tested live in this work. A source's publication/as-of date can remain absent; access time is not substituted.
2. The positive structured-provider fixture uses the explicit February 1, 2025–January 31, 2027 date range, retained as `rawValue`, `unit: date range`, and normalized by the existing duration contract to approximately 23.95 months (`normalizedUnit: months`). No duration sentence is added. It reaches an eligible `permitting_timeline` claim with supported exact quotation and no first eligibility failure, without applying it to accepted financial inputs. This is a synthetic transport-to-eligibility proof, not verification of the historical record, proof of a permitting delay, or permission to treat total building cost as cooling capex. Actual document layout and retained identity context still need live verification.
3. The TPM estimate is deliberately conservative, not an exact tokenizer/account-limit measurement. Actual limits may differ by model/account. A short unchanged global deadline can correctly skip later categories under a 30k ceiling; the simulated eight-category test assumes sufficient time.
4. An oversized atomic context window may be omitted from analysis while the full receipt remains retained. This is preferable to manufacturing a safely scoped quote.
5. The saved DataBank DNS root cause is unresolved. The fetch remains blocked until independently validated public-only pinning is demonstrated; no security bypass is permitted.
6. The final rebased app requires separate proof-ledger database schema setup before ledger-dependent runtime paths can be considered ready. Startup diagnostics identify missing fields in `proof_ledger_events` and `proof_user_decisions`. No database migration was performed; this is outside the research reliability gate.

**The deterministic research-code gate is ready for one separately authorized, bounded live Red Oak acceptance run.** Live authorization remains absent, and the separate proof-ledger schema issue must be resolved before claiming readiness of ledger-dependent application paths. That future run must produce at least one eligible supported claim with retained passage, source, date where defensibly available, correct project/facility and phase scope, applicable value/unit, and eligibility rationale. If it does not, live acceptance and the overall proof-of-system milestone remain pending. No automatic live retry, database migration, deployment or push follows this checkpoint.