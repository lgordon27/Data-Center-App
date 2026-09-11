# SafeLoc Batch 5 Corrective-Pass Report

Read-only report for the corrective pass that followed commit `2d63b6baa2cc7f1ed72f9751697ac04dcf5211b4`.

## Commit and repository state

- **Final commit:** `3f3439b62cb6af3060122763ec027f2952644f10`
- **Parent:** `2d63b6baa2cc7f1ed72f9751697ac04dcf5211b4`
- **Commit message:** `Update research audit ledger and expand research project proxy logic`
- **Branch:** `main`
- **Working tree:** clean
- `main` is ahead of `subrepl-0i35s7ub/main` by two commits.
- No deployment or publishing occurred.

## Changed files

- `.agents/memory/research-audit-ledger.md` — records the canonical-document reuse rule.
- `artifacts/safeloc-diligence-workbench/server/researchProjectProxy.mjs` — adds Texas query targeting, bounded orchestration, provider/tool telemetry, cancellation, document access receipts, URL reuse, and Texas-aware source ranking.
- `artifacts/safeloc-diligence-workbench/server/researchProjectProxy.test.mjs` — updates the candidate-cap regression from 80 physical fetches to 10 because repeated canonical URLs are reused.
- `artifacts/safeloc-diligence-workbench/src/components/ResearchHandoffSummary.tsx` — adds overridden counts, exact-project/context/gap summaries, and collapsed search-authority detail.
- `artifacts/safeloc-diligence-workbench/src/context/DiligenceContext.tsx` — persists proposals, dispositions, overrides, restores them from the existing session payload, and validates source-proposal overrides.
- `artifacts/safeloc-diligence-workbench/src/pages/EvidenceRoom.tsx` — adds proposal history, Accept/Override/Reject/Leave unresolved controls, stale-run protection, and the override form.
- `artifacts/safeloc-diligence-workbench/src/services/researchProjectService.ts` — parses the expanded audit, query, document, budget, and provider-limitation fields.

## Texas-targeted research behavior

Texas targeting activates when the project or known-data location contains `Texas` or `TX`.

Eight categories are scheduled:

1. Project identity
2. Grid
3. Electricity
4. Water
5. Permitting/community
6. Construction/capital
7. Tenant/counterparty
8. Climate/operational hazard

Authority targeting is:

| Category | Authority names | Domains |
|---|---|---|
| Project identity | Texas project records; project/developer disclosures; ERCOT; PUCT | `ercot.com`, `puc.texas.gov`, `sec.gov`, `tx.us` |
| Grid | ERCOT; PUCT; Texas interconnection records | `ercot.com`, `puc.texas.gov` |
| Electricity | ERCOT; PUCT; EIA market context; Texas utility records | `ercot.com`, `puc.texas.gov`, `eia.gov`, `tx.us` |
| Water | TWDB; municipal water authorities; county authorities | `twdb.texas.gov`, `tx.us` |
| Permitting/community | municipal agendas; county agendas; permits; agreements | `tx.us` |
| Construction/capital | SEC EDGAR; company investor relations; official developer disclosures | `sec.gov` |
| Tenant/counterparty | SEC EDGAR; company investor relations; official project/developer disclosures | `sec.gov` |
| Climate/hazard | FEMA; NOAA; Texas geographic hazard records | `fema.gov`, `noaa.gov`, `tx.us` |

The literal Texas query templates are:

- **Project identity:** `"project" "location" Texas project permit operator disclosure ERCOT PUCT (site:ercot.com OR site:puc.texas.gov OR site:sec.gov OR site:tx.us) [suffix]`
- **Grid:** `"project" "location" ERCOT PUCT Texas interconnection queue transmission study (site:ercot.com OR site:puc.texas.gov) [suffix]`
- **Electricity:** `"project" "location" ERCOT PUCT Texas utility tariff rate case EIA market context (site:ercot.com OR site:puc.texas.gov OR site:eia.gov OR site:tx.us) [suffix]`
- **Water:** `"project" "location" TWDB municipal county water demand consumption rights permit (site:twdb.texas.gov OR site:tx.us) [suffix]`
- **Permitting/community:** `"project" "location" Texas municipal county agenda permit public hearing agreement (site:tx.us) [suffix]`
- **Construction/capital:** `"operator" "project" SEC EDGAR investor relations official developer project disclosure (site:sec.gov) [suffix]`
- **Tenant/counterparty:** `"operator" "project" SEC EDGAR investor relations official project developer disclosure customer offtake (site:sec.gov) [suffix]`
- **Climate/hazard:** `"project" "location" FEMA NOAA Texas exact site flood wildfire drought hazard (site:fema.gov OR site:noaa.gov OR site:tx.us) [suffix]`

Primary queries use the suffix `official primary record first broader web fallback`; follow-ups use `official record corroboration broader web fallback`.

For non-Texas projects, generic project/location queries are used. Project identity uses identity/permit terms; other categories use the configured two query angles for the first evidence identifier, including the known operator when available. Generic fallback does not inherit Texas domain filters.

## Enforced research bounds

- 16 evidence identifiers.
- 8 primary category attempts maximum.
- 1 follow-up per category.
- 8 follow-ups per run maximum.
- 16 provider requests maximum: up to 8 primaries plus 8 follow-ups.
- 32 provider web-search calls maximum.
- 10 candidates per category.
- 80 candidates per run.
- 90-second server deadline.
- 45-second client timeout.
- 3 redirects maximum.
- 1,000,000-byte document limit.
- 20 PDF pages maximum.
- 4,000-character retained passage limit.
- 10 custom research requests per client key per 60-second window.

There is no separate hard `maxDocumentOpens` counter. Physical document access is bounded by the candidate limits and canonical URL reuse. The same canonical URL is fetched once across categories; later references receive reused receipts. Therefore, physical opens are at most the number of distinct canonical URLs among retained candidates and can be less than 80.

Canonicalization removes tracking parameters such as `utm_*`, `fbclid`, `gclid`, `mc_cid`, `mc_eid`, `ref`, `referrer`, and `source`; lowercases protocol and hostname; removes default ports and fragments; preserves document-defining query parameters; and removes trailing path slashes.

## Telemetry and display

The audit distinguishes:

- **Planned:** deterministic primary/follow-up queries and authority targets.
- **Issued:** queries actually sent by the server.
- **Provider-observed:** queries found in provider `web_search_call` output.
- **Executed:** normalized provider-observed queries associated with a category.
- **Returned domains:** domains present in category results.
- **Opened documents:** original/resolved/canonical URL, opened versus reused, access state/outcome, retained passage, and extraction limitations.
- **Follow-up state:** trigger evidence IDs, executed query, count, and skip reason.

Skip reasons include deadline, tool-call budget, provider-request budget, provider failure, evidence resolved, early stop, category follow-up limit, and no justified gap.

The default handoff summary shows exact-project source count, proposal count and dispositions, material gaps, and related/comparable context. Search, authority, returned-domain, document, and follow-up detail is collapsed. Per-item search transparency is also collapsed and distinguishes tool-observed queries from AI-reported terms or unavailable telemetry.

## Cancellation, retries, and budgets

The server abort signal reaches provider requests, category orchestration, document fetches, streamed readers, PDF extraction, and the `pdftotext` child process. The document reader cancels its stream on abort, and cancellation checks run before and after provider calls, document reads, and extraction.

The client aborts the previous research controller before starting a new one, retries one timeout, uses a run-generation ID to ignore late responses, and clears progress only for the current run. The server cache deduplicates simultaneous refreshes for the same research key.

When provider output exceeds the remaining tool budget:

- excess web-search output is trimmed;
- observed and accepted tool-call counts are recorded separately;
- `toolCallBudgetExceeded` and provider limitations are recorded;
- over-budget sources cannot become source-linked evidence;
- later categories/follow-ups are skipped with truthful state and reason.

## Evidence boundaries and source selection

- **Exact-project:** the source explicitly identifies the facility or establishes an exact entity match, and the captured passage supports the claim with valid entity, facility, phase, time, and semantic scope.
- **Related-context:** relevant but not the exact facility; context only.
- **Comparable:** similar or regional material retained for comparison; it cannot establish facility-level evidence.
- **Unresolved:** missing evidence, searched-without-support, conflicting, blocked, unsupported, scope-incomplete, or semantically mismatched material.

A source URL alone is never sufficient. The server requires packet membership, a captured passage, exact quotation validation, claim mapping, scope validation, and semantic compatibility.

For Texas, strongest-source ordering is:

1. ERCOT, PUCT, TWDB, SEC EDGAR, FEMA, NOAA, EIA.
2. Texas local authorities.
3. Texas primary utilities.
4. Other primary government sources.
5. Exact-project primary company sources.
6. Other primary company sources.
7. Secondary reporting.

Non-Texas ordering is government, utility, company, then secondary reporting. Up to four validated canonical URLs are retained per item; the strongest becomes `sourceUrl`.

## Evidence Room UX and persistence

The default handoff summary shows exact-project sources, total proposals, pending/accepted/overridden/rejected/unresolved counts, material gaps, and related/comparable context.

Query and authority detail, document receipts, extraction limitations, and per-item search terms are collapsed by default. The final implementation contains one handoff summary and no second Evidence Room or duplicate page-level handoff banner. Source proposals remain row-level review cards.

Proposal controls wrap on narrow screens. Override fields stack below the small-screen breakpoint. Source links and metadata wrap rather than forcing horizontal overflow.

### Accept

Accept requires a validated, model-eligible proposal, records the disposition, preserves provenance, and places the evidence into model evidence.

### Override

Override requires replacement value, valid classification, and non-empty rationale. It revalidates custom-project context, evidence ID, source URL, numeric validity where applicable, source identity, semantic value/unit compatibility, and model eligibility. The original proposal and replacement details remain in the override record.

### Reject

Reject records `rejected`, preserves history, removes pending actions, and does not alter model evidence.

### Leave unresolved

Leave unresolved records `unresolved`, preserves history, and does not alter model evidence.

Proposal records, dispositions, and overrides persist in the existing:

`safeloc:diligence:current-session:v1`

They restore through custom-project loading, remount, navigation, and reload. Research refreshes merge new proposals into existing history.

Financial results can change only after explicit human acceptance or a validated source-proposal override causes eligible evidence to enter `modelEvidence`. Research refreshes, rejection, unresolved status, and unvalidated reviewer corrections do not change the financial model.

## Verification totals

- **Unit/server tests:** 217 passed, 0 failed.
- **Production contract:** 1 passed, 0 failed.
- **Browser suite:** 208 total, 198 passed, 10 intentional skips, 0 failed.
  - Desktop Chromium: 104 passed, 0 skipped.
  - Mobile Chromium: 94 passed, 10 skipped.
  - Mobile skips are intentional because storage/reset and scenario suites are desktop-only.
- Typecheck passed.
- Production build passed.
- `git diff --check` passed.
- Both browser projects completed in one uninterrupted final run with local retries disabled.

No browser spec file was added or modified by the corrective commit. The existing complete browser suite was rerun.

## Deviations and known risks

- There is no independent document-open quota; document access is indirectly bounded by candidate limits and URL reuse.
- Provider-observed query telemetry may be unavailable; the UI does not infer execution from planned queries.
- Redirects that converge to the same final document may not deduplicate if their pre-fetch canonical keys differ.
- Dedicated browser coverage for every new Override/disposition/reload case was not added in this corrective commit.
- Partial, timed-out, provider-failed, and not-searched categories remain possible by design. No minimum evidence quota or synthetic fallback was added.

## Explicit exclusions

The pass introduced none of the following:

- CAM authorization.
- Quorum, veto, consensus, named approvers, or multi-party authorization.
- Retired analyst-agent architecture.
- Second Evidence Room.
- Bulk or stale-proposal workflows.
- Financial-lineage architecture.
- Financial-formula changes.
- Fund-level inference.
- Deployment or publishing.

Research can recommend and explain. Only explicit human acceptance or a validated human source-proposal override can change model inputs.