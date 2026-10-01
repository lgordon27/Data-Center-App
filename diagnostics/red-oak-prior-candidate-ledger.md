# Red Oak canary: prior candidate/open ledger

**Offline diagnostic only — not evidence.** This report reconciles the saved
September 30, 2026 canary artifacts; it does not recover live data or modify the
original JSON/Markdown. No network or provider requests were made.

Full row-level data: [red-oak-prior-candidate-ledger.json](red-oak-prior-candidate-ledger.json).

## What the saved artifacts establish

| Measure | Persisted value |
| --- | ---: |
| Grounded discovery requests | 1 |
| Provider-reported discovery candidates | 16 |
| Normalized source-state records | 14 (11 retained, 3 rejected) |
| Source-state access records | 6 accessible, 8 not attempted |
| Candidate-lineage records | 16 |
| Physical document opens | 8 / 8 |
| Structured provider calls / Grid packets | 0 / 0 |

These are three different lists, not interchangeable candidate sets. The
normalized list has repeated entries for the same opened URL/open index;
candidate lineage includes those repeats and two official-source-discovery
records. The original artifacts do not permit a one-to-one mapping between the
16 discovery citations and 16 lineage records. No original discovery rank is
preserved. Ordinals below refer only to persisted ledger rows, not discovery
order.

Opaque Google redirect tokens have been redacted. For unopened Google results,
the stored “resolved URL” is still the Google redirect, not the destination;
the target URL cannot be recovered from this report without fetching it.
Queries are not reproduced. For the same reason, a title such as `texas.gov`
is treated only as a citation-title/domain hint, never as a confirmed final
source host or source-quality judgment.

## Physical-open slots

| Slot | URL/source available in retained report | Final access/content result |
| ---: | --- | --- |
| 1 | **Unavailable** — original narrative says detailed receipt was not preserved. | Unknown. |
| 2 | `https://www.tdlr.texas.gov/TABS/Search/Project/TABS2026027681` | HTTP 200, HTML extracted, passage retained. The opened text identifies a DataBank Red Oak DFW14 base-building record. Not sent to Grid. |
| 3 | **Unavailable** — detailed receipt was not preserved. | Unknown. |
| 4 | **Unavailable** — detailed receipt was not preserved. | Unknown. |
| 5 | **Unavailable** — detailed receipt was not preserved. | Unknown. |
| 6 | `https://www.businessinsider.com/databank-financing-dallas-data-center-inference-2026-4` | HTTP 200, HTML extracted, passage retained. Persisted audit says `exactProject: false`, project specificity unknown; not sent to Grid. |
| 7 | `https://www.tdlr.texas.gov/TABS/Projects/TABS2026015329` | HTTP 200, HTML extracted, passage retained. The opened text identifies a DataBank Red Oak DFW10 tenant-fit-out record. Not sent to Grid. |
| 8 | `https://puc.texas.gov/` — official-source-discovery lineage only. | Sparse lineage says parsed at physical index 8; no retained exact-project passage. Detailed receipt is unavailable. |

Slots 2, 6, and 7 are the only full receipts described in the original
narrative. Slot 8 is only a sparse official-discovery lineage reference. The
original report explicitly does not preserve URLs/results for slots 1, 3, 4,
or 5. Their identities are left unavailable here rather than inferred from
other candidate rows.

## Candidate ledger

“Pre-open” means only the title/domain/category signals present before an
attempt. No candidate snippet was preserved. `exactProject` is false in the
normalized candidate records and `sourceType` is null; later retrieval does
not retroactively add pre-open signals. Repeated lineage rows that share a
resolved URL/open index are recorded separately below because they exist in
the audit, but they are **not** treated as separate physical opens.

| Ledger row | Original discovery rank | URL / resolved URL | Pre-open identity and source-type signals | Selection / open | Final access and content |
| ---: | --- | --- | --- | --- | --- |
| 1 | Unavailable | Original URL is an opaque Google redirect (token redacted); target URL unavailable. | Citation title `texas.gov`; `grid`; no snippet/project name; source type beyond government-domain hint unavailable. | Not selected; `protected-opportunity`; no slot. | Not attempted; quality not evaluated. |
| 2 | Unavailable | Original URL is an opaque Google redirect; target unavailable. | Citation title `databank.com`; `grid`; operator-domain hint only; no project/facility name or snippet. | Not selected; `protected-opportunity`; no slot. | Not attempted; quality not evaluated. |
| 3 | Unavailable | Original URL is an opaque Google redirect; target unavailable. | Citation title `youtube.com`; `grid`; video-platform hint; no project name/snippet. | Not selected; `protected-opportunity`; no slot. | Not attempted; quality not evaluated. |
| 4 | Unavailable | Original URL is an opaque Google redirect; target unavailable. | Citation title `facebook.com`; `grid`; social-platform hint; no project name/snippet. | Not selected; `protected-opportunity`; no slot. | Not attempted; quality not evaluated. |
| 5 | Unavailable | Original URL is an opaque Google redirect; target unavailable. | Citation title `databank.com`; `grid`; operator-domain hint only; no project/facility name or snippet. | Not selected; `protected-opportunity`; no slot. | Not attempted; quality not evaluated. |
| 6 | Unavailable | Original URL is an opaque Google redirect; target unavailable. | Citation title `checkmarkpro.com`; `grid`; unclassified-domain hint; no project name/snippet. | Not selected; `protected-opportunity`; no slot. | Not attempted; quality not evaluated. |
| 7 | Unavailable | Original URL is an opaque Google redirect; target unavailable. | Citation title `redoaktx.org`; `grid`; domain contains “Red Oak,” but no campus/operator/facility match or snippet. | Not selected; `protected-opportunity`; no slot. | Not attempted; quality not evaluated. |
| 8 | Unavailable | Original URL is an opaque Google redirect; target unavailable. | Citation title `civicclerk.com`; `grid`; civic-meeting platform hint; no project name/snippet. | Not selected; `protected-opportunity`; no slot. | Not attempted; quality not evaluated. |
| 9 | Unavailable | Final URL: `https://www.businessinsider.com/databank-financing-dallas-data-center-inference-2026-4`; original Google redirect redacted. | Citation title only `businessinsider.com`; `project-identity`; no saved snippet or exact Red Oak signal. | Opened, slot 6. | HTTP 200 / HTML extracted / passage retained; `exactProject: false`, specificity unknown; not sent to Grid. Same open recurs at row 12. |
| 10 | Unavailable | Final URL: `https://www.tdlr.texas.gov/TABS/Projects/TABS2026015329`; original Google redirect redacted. | Citation title only `texas.gov`; `project-identity`; no pre-open record path or facility name. | Opened, slot 7. | HTTP 200 / HTML extracted / passage retained; opened page identifies DataBank Red Oak DFW10; not sent to Grid. Same open recurs at row 13. |
| 11 | Unavailable | Final URL: `https://www.tdlr.texas.gov/TABS/Search/Project/TABS2026027681`; original Google redirect redacted. | Citation title only `texas.gov`; `project-identity`; no pre-open record path or facility name. | Opened, slot 2. | HTTP 200 / HTML extracted / passage retained; opened page identifies DataBank Red Oak DFW14; not sent to Grid. Same open recurs at row 14. |
| 12 | Unavailable | Same resolved Business Insider URL as row 9; original redirect redacted. | Same title-only `businessinsider.com` metadata; no exact-project signal. | Same physical open 6; not a separate fetch. | Same accessible retained passage. This normalized record is marked rejected, but the access itself succeeded. |
| 13 | Unavailable | Same resolved TDLR DFW10 URL as row 10; original redirect redacted. | Same title-only `texas.gov` metadata; no exact-project signal. | Same physical open 7; not a separate fetch. | Same accessible retained passage. This normalized record is marked rejected, but the access itself succeeded. |
| 14 | Unavailable | Same resolved TDLR DFW14 URL as row 11; original redirect redacted. | Same title-only `texas.gov` metadata; no exact-project signal. | Same physical open 2; not a separate fetch. | Same accessible retained passage. This normalized record is marked rejected, but the access itself succeeded. |
| 15 | Not a Google discovery rank | `https://puc.texas.gov/` | Official Texas regulator root, generic page; no project-specific URL/title/snippet. | Opened by official-source discovery, slot 8. | Sparse lineage says parsed; no retained exact-project passage; discovery URL did not reach claim eligibility. |
| 16 | Not a Google discovery rank | `https://puc.texas.gov/sitemap.xml` | Generic authority sitemap endpoint; no project signal. | Not opened; budget denied after ceiling. | No request/content result; quality not evaluated. |

The rows 9–14 retain both normalized source-state occurrences. The same
resolved URLs, passage/content hashes, and physical-open indices recur; the
saved report does not say why the duplicate source-state rows exist. They
must not be counted as three additional physical opens.

## Open-order diagnosis from this saved canary

The visible pre-open metadata is weak: the eight unattempted grounded records
are domain/title hints (operator root, government root, video/social, local
domains), while the project/facility-specific TDLR paths and DFW10/DFW14
identities appear only after opening. Business Insider’s preserved pre-open
title is just its domain; its final resolved URL is visible only after the
open. The official-source-discovery PUC root is explicitly generic. This is
consistent with a candidate-ranking/admission issue upstream of structured
analysis, but incomplete receipts prevent proving the identity/order of all
eight physical requests or asserting every candidate was mistargeted.

The working-tree admission code was inspected for context, but its source
revision may differ from the live canary revision. In the current
`researchProjectProxy.mjs`, grounded prefetch walks the candidate array and
requests scheduler authorization as it goes; candidate rank is array-index
based. The separate `prioritizeResearchSources` helper sorts later sources
and is not itself the pre-open selection path. Do not treat that code read as
evidence that it was exactly the code executed by the saved run.

No result here grants evidence eligibility or concludes that accessible text
was valid Grid evidence. The original report records zero structured calls,
zero Grid packets, and zero claims evaluated; the remaining blocker was that
usable grounded text did not reach structured analysis.