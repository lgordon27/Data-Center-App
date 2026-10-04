# Red Oak integrated live research acceptance

## Pre-run gate

**Recorded 2026-10-03 19:43 America/Chicago, before the authorized UI action.** The capture, persistence, history, test, build, and disk-cache gates below passed. At this checkpoint no UI research action or live provider request had been made. This is a historical pre-run record; the single authorized run and its outcome are documented below. No rerun is authorized.

### Tested source identity

- HEAD: `1410667f996175328be9b437fdfbe4067c3d7f35`.
- Relevant capture-source fingerprint: `3c51e3f6ab5fdf6d6b70894803b1297a72412b6ef555e827d53e04bba1859f98`. This is SHA-256 over the sorted relative paths, NUL separators, per-file SHA-256 values, and newlines for the four capture source/test files listed below.
- Pre-run working-tree identity: `4d6558f2221094f511368128791ecc51335b8c8f694e1d77b2f90a73cd05a7d9`. It combines the tested HEAD, SHA-256 of `git diff --binary HEAD`, and sorted path/content hashes for untracked files.
- Tracked diff SHA-256: `868578163be7bf48dac751027e7a9343b509be78cb77c3437734d23ee3478ae0`.
- The source changes at this checkpoint are limited to `server/researchAcceptanceCapture.mjs` (new), `server/researchFunnelDiagnostics.mjs`, `server/researchFunnelDiagnostics.test.mjs`, and `server/researchProjectProxy.mjs`. The remaining untracked file is the supplied authorization text. No UI, financial, database, or evidence-rule changes were made.

### Included prerequisite work

- Task #365 empty-category suppression, commit `f571e8e`, and Task #366 project-identity attribution, commit `f47c202`, are ancestors of the tested HEAD.
- Task #368 bounded conversion report and controls, commit `29e81e0`, are an ancestor of the tested HEAD.
- Task #360 result presentation is present in the current tree: its later handoff snapshot `76d3a87` has tree hash `334d2ad5a87db0c5150442d9393db5885c11d478`, matching the pre-Task-368 ancestor tree. The current `ProjectReality`, `AdvisorBrief`, and shared result-presentation files retain later changes; this capture repair does not modify them.

### Capture and verification

The request-local funnel collector now writes a restricted, bounded, opt-in JSONL trace for the exact Red Oak identity only. It captures admission-evaluated retained passage text, the final fitted packet and category-analysis user message, provider-returned claim text before application normalization, and validation records. Each text record hashes original bytes before redaction or truncation and marks any alteration; the one-use marker is consumed before capture starts. Capture is disabled by default and does not change admission, scheduling, provider limits, or financial eligibility.

The focused provider-free tests verify exact content and hashes, source/attempt lineage through validation, secret exclusion, redaction/truncation/overflow flags, default-off behavior, and rejection of a different project identity.

- `pnpm --filter @workspace/safeloc-diligence-workbench exec tsx --test server/researchFunnelDiagnostics.test.mjs server/researchProjectProxy.test.mjs` — **190 passed, 0 failed**.
- `pnpm --filter @workspace/safeloc-diligence-workbench run typecheck` — **passed**.
- `pnpm --filter @workspace/safeloc-diligence-workbench run build` — **passed**; Vite emitted its existing advisory that the main JavaScript chunk exceeds 500 kB.
- `git diff --check` — **passed**.
- The broader `test:research-funnel` baseline remains **267 passed, 1 failed**. Its sole failure is the unchanged historical test `resolves the exact saved Red Oak announcement excerpt through shared identity policy`, which raises `ENOENT` for the absent `diagnostics/red-oak-retrieval-canary-2026-10-01.json`. The fixture and test were not recreated or changed. This is separate from live-path readiness.
- Research-audit storage start/finalize/read and rollback were already verified against the intended runtime database in the prior readiness check; that check is not repeated. Its sanitized record and rollback receipt are documented in [the prior readiness report](./safeloc-red-oak-live-acceptance-readiness-2026-10-04.md).
- The prior offline report-writing check passed with no providers. The isolated readiness row was rolled back; proof-ledger and user-decision writes are outside this acceptance. Normal research-audit persistence is a separate path.

### Freshness and one-run boundary

The exact custom-project request identity is Red Oak Campus / DataBank / Red Oak, Ellis County, Texas, with only operator and location-derived city/county/state context. Its cache key is `f67c2c1590632c26b9d87179505ecacbc77b486691a5728ce826fca6bd039baf`; no matching disk cache entry existed in the configured default cache directory, and the registry had no exact name/location match. The app was restarted before submission to clear process-local in-flight/cache state. A marker for this exact identity was absent at this checkpoint and was created only immediately before the single custom-project UI action.

- The existing workbench workflow restarted successfully at 2026-10-03 19:44 America/Chicago. The home preview rendered at desktop size; current browser console output contained only Vite connection and React DevTools messages. Startup still reports the known absent proof-ledger/user-decision tables; prior audit-readiness evidence confirms these are separate from the research-audit repository.
- An offline Playwright/Chromium launch check passed. The real custom-project dialog was opened and filled with exactly the three authorized values. The submit control reads “Research project”; its compact entry point reads “Analyze Any Project — Beta.” No `/api/research-project` request occurred before submission. No provider preflight or extra research request was made.
- The marker and UI submission were created and triggered in one browser-driving step after this checkpoint; see the live-run receipt below.

## Live result

**Acceptance target not met.** The one authorized action ran through the actual custom-project form, but returned a technical partial result with no admitted category passages, analysis packets, reviewed findings, or financially eligible candidates. The run was not retried.

### Single-run receipt

- Submitted from the custom-project UI on 2026-10-03 at 19:46:35 America/Chicago (2026-10-04 00:46:35 UTC). Server run: `c613141f-5d2f-430c-8408-106cf043f6ed`; request: `e89b97a5-0b65-46b2-a738-2d410e1999d8`; initiator: `user-action`.
- The form contained exactly `Red Oak Campus`, `DataBank`, and `Red Oak, Ellis County, Texas`. The request had no project/provider ID, no focus IDs, no current evidence, and no supplied URLs. Only `city`, `county`, `operator`, and `state` appeared in its known-data keys.
- One `POST /api/research-project` was observed; no other research POST followed. The response was HTTP 200. Its cache metadata identifies the prechecked key above, state `updated`, and this run/request ID.
- The run started at 00:46:35.968 UTC and finished at 00:46:50.420 UTC (14.452 seconds), before its 00:47:50.968 UTC deadline. The final outcome was `incomplete-technical-limitation`, reason `document-access-failure`; result status `partial`, mode `research-incomplete`. The UI displayed “Source blocked” and “A technical limitation prevented conclusive research.”
- The one-use capture marker was consumed and is absent. No findings were accepted and no financial controls were changed. No proof-ledger or user-decision write was made. The readiness transaction was rolled back before the run; this report does not claim a post-run database read-back of the live run's audit row.

### Source-to-finding trace

The run made **one issued research-provider request**, a successful Google Gemini grounding request. The audit has eight additional category attempts, all `unissued-empty`; none was a retry. Observed tool calls: 0. Executed search-query count is unknown: the returned candidates have no observed originating query, and a planned query is not an execution receipt. No actual token usage was reported; estimates attached to unissued categories are not consumption.

Discovery returned 15 candidates. Their category IDs were empty and their query attribution was unavailable. The audit records 95 source receipts and 144 source-attempt records, not 95 or 144 distinct network fetches. Receipt outcomes were 57 `accessible/retrieved`, 45 `blocked/private-destination`, 15 `blocked/http-429`, 14 `low-content/control-heavy-content`, and 13 `blocked-or-shell/javascript-required-shell`. The separate physical-open counter reached 24 of 24 without reporting an overrun. These repeated candidate/receipt records must not be interpreted as unique documents or executed searches.

The request-local trace contains 80 passage-selection records: ten for each category, repeating the same source set. In every category, six entries had no retained text and were blocked before routing or identity evaluation. The other four had text, but all four were rejected before deduplication with `source-has-no-route-to-requested-category`. The four distinct exact text bodies were:

- TDLR TABS `TABS2026009183`, facility `DFW13`: the text names “Databank Red Oak - DFW13,” Red Oak, and Ellis County; it lists owner `DB Data Center Red Oak, LLC`. The trace records actor `databank` as `contractor-architect-publisher-or-author` while also setting `admittedAsOperator: true`; the resolver returned ambiguous because it did not establish the requested location/project link.
- TDLR TABS `TABS2026015329`, facility `DFW10 TFO`: the text names “Databank Red Oak - DFW10 TFO,” Red Oak, and Ellis County; it lists the same owner name. The trace labels actor `databank` `resolver-attributed-owner-operator-developer` with `admittedAsOperator: true`, but the resolver likewise returned ambiguous on requested location/project identity.
- R-O’s `DFW9`/`DFW11` page: the text identifies those facilities, Red Oak, and DataBank as owner, but the recorded identity reason says operator attribution to DataBank is not established; the trace instead labels JHET Architects as an operator actor. This remains ambiguous, not an accepted relationship.
- Winstead’s general data-center/digital-infrastructure page: no requested project, alias, or operator was established; the resolver returned unrelated.

The exact retained bodies and original hashes are in the trace. In contrast, nested location-match and conflict objects in identity lineage were depth-limited (`[metadata-depth-limit]`); their detailed match/conflict basis is not preserved. I do not infer whether any genuine location conflict existed. The recorded identity reasons, token-match counts, facility identifiers, and actor spans are diagnostic only and do not override the route rejection.

**First demonstrated conversion blocker:** category/query provenance was absent at discovery and category routing. All 15 candidates lacked category IDs and query attribution; every text-bearing category selection then failed the route gate. Consequently, all eight category analyses were unissued-empty—not timed out, cancelled, or rejected downstream. The separate document-access failures explain the technical partial terminal status, but no scheduling or validation failure is evidenced.

| Category | Passage selections | Routing / admission | Analysis and assessment |
|---|---:|---|---|
| Project identity | 10 (4 text, 6 empty) | 4 route-rejected; 6 blocked before evaluation; 0 admitted | Unissued-empty; no packet; not assessed |
| Tenant / counterparty | 10 (4 text, 6 empty) | 4 route-rejected; 6 blocked before evaluation; 0 admitted | Unissued-empty; no packet; not assessed |
| Climate / operational hazard | 10 (4 text, 6 empty) | 4 route-rejected; 6 blocked before evaluation; 0 admitted | Unissued-empty; no packet; not assessed |
| Electricity | 10 (4 text, 6 empty) | 4 route-rejected; 6 blocked before evaluation; 0 admitted | Unissued-empty; no packet; not assessed |
| Water | 10 (4 text, 6 empty) | 4 route-rejected; 6 blocked before evaluation; 0 admitted | Unissued-empty; no packet; not assessed |
| Grid | 10 (4 text, 6 empty) | 4 route-rejected; 6 blocked before evaluation; 0 admitted | Unissued-empty; no packet; not assessed |
| Construction / capital | 10 (4 text, 6 empty) | 4 route-rejected; 6 blocked before evaluation; 0 admitted | Unissued-empty; no packet; not assessed |
| Permitting / community | 10 (4 text, 6 empty) | 4 route-rejected; 6 blocked before evaluation; 0 admitted | Unissued-empty; no packet; not assessed |

### Independent outcome counts

- Discovery candidates: 15. Passage-selection records: 80. Source receipts: 95. Source-attempt records: 144. Physical document opens: 24/24; no unique network-fetch count is inferred.
- Nonempty category-analysis packets: 0/8. Category analyses issued: 0/8. Provider-returned category claims: 0. Claim-to-passage mapping receipts: 0. Validation records: 0. Engine failures: 0.
- Reviewable findings: 0. The response contains 16 evidence items, all `Missing Evidence` with unknown status; its project summary says capacity and provenance are unknown. These are not negative findings.
- Eligible evidence: 0. Proposed inputs: 0. Accepted model inputs: 0. Financial eligibility was not established; no finding changed an input.

### Capture and presentation artifacts

- [Exact-text and lineage trace](../../../diagnostics/safeloc-acceptance-capture/c613141f-5d2f-430c-8408-106cf043f6ed/trace.jsonl) — 82 records: 80 passage selections, one start, and one final summary; 0 dropped records, no overflow, no write error. Trace SHA-256 `9ccb934fa9d9652efae4d44643472be938d0c0077141b60f5633ad896e329242`. The four text-bearing distinct bodies have matching original/captured hashes and are marked exact.
- [Sanitized final response and run audit](../../../diagnostics/safeloc-acceptance-capture/c613141f-5d2f-430c-8408-106cf043f6ed/final-response.json) — preserves original response SHA-256 `6a194ee14e128713c4cb6f7149925c34e9152855498ff79bbfa55b45839c718e` and original length 2,212,686 bytes. The exported body is **not byte-exact**: opaque provider redirect paths and three provider response IDs were redacted; captured body SHA-256 is `713684f96aa7b65667d3cb9f48e668ae991d1d6a75c79ce3823a0ce2d0b1d8c7`, length 1,999,495 bytes. Alteration reasons and redaction counts are embedded in the file. No claim is made that the altered response body is replayable byte-for-byte.
- [Desktop Project Reality screenshot](../../../diagnostics/safeloc-acceptance-capture/c613141f-5d2f-430c-8408-106cf043f6ed/desktop-default.png) and [mobile Project Reality screenshot](../../../diagnostics/safeloc-acceptance-capture/c613141f-5d2f-430c-8408-106cf043f6ed/mobile-default.png) — both were captured from the same live page/run with no second research POST or automatic refresh. SHA-256: desktop `9c0d57f107a0aafc3abe67f2de3063be28953f36c8bb41ece25d3be588bff379`; mobile `acf6705c86c49198906b813b8017784ec01cf074cd2aee82de93d71bb9ebb270`. All four capture files have mode `0600`.

The visible Project Reality screen is bound to Red Oak Campus / DataBank / Red Oak, Ellis County, Texas. It separates “Not established in this run” from retained reporting, states that retained passages are not promoted to structured facts, and labels the electricity, water, and grid items “Not assessed: no admitted passage text.” No other-project or canonical dossier facts appeared. The visible action was “Retry same project”; it was not clicked.

The captured viewport remained on Project Reality. Source-expansion controls were visible but not expanded, and the Advisor Brief and Financial Transmission views were not opened in that live browser session. The response has zero proposed or accepted inputs and no eligible findings, and no accept/retry/financial control was clicked; however, a before/after financial-input fingerprint and rendered Advisor Brief screenshot were not captured. Those specific UI checks remain unevaluated rather than being claimed as passing. Reopening the page in a fresh browser context would mount the diligence provider and automatically call the ERCOT queue and EIA proxy endpoints. I did not create a replay browser or risk extra data-provider requests after the one-run capture. Source inspection confirms Advisor Brief uses the shared diligence context, but is not a substitute for a rendered same-run check.

### Conclusion and one next repair

The run did **not** produce useful, attributable, scope-correct findings; it produced an honest partial/not-assessed result. No run remains authorized, and there will be no retry.

**Recommended next repair:** carry observed per-query category attribution from the grounding response into candidate routing, and route a candidate only to a category whose executed query demonstrably returned it. Keep unassigned candidates in the source ledger and keep identity, location, facility, and phase gates unchanged; do not infer routes from keywords. This is the first evidenced conversion failure: all candidates lacked category/query attribution and all text-bearing passages were rejected before any analysis packet could be issued.

The existing missing historical Red Oak fixture remains the separate baseline limitation recorded above; it was not recreated or altered. Research-audit persistence readiness remains supported by the prior rolled-back readiness receipt linked above; it was not repeated.