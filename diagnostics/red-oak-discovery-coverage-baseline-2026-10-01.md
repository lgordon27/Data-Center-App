# Red Oak discovery coverage baseline — October 1, 2026

**Offline diagnostic only.** This is a read-only comparison of saved reports
and query telemetry. It is not evidence, it does not establish source authority
or project identity, and it does not authorize or describe another live request.
No source was re-fetched and no absent annotation, URL, query, or receipt was
reconstructed.

## Baseline and limits

The most recent retrieval-only canary saved one Google Grounding request, two
provider-reported search queries, four unique bounded discovery candidates, and
four physical opens (three blocked; one usable retained passage). It deliberately
stopped before structured analysis. Its query scope was power/grid discovery:

1. `DataBank Red Oak campus Texas electric power substation Oncor ERCOT`
2. `DataBank Red Oak data center campus electric grid utility power`

The report's separate `observedSearches` list is empty. The two queries above
are reported by the discovery response (`discovery.queries` and
`run.discovery.queries`); these repeated copies are one pair of provider query
observations, not four executions. The canary's dedicated prompt limited work
to exact-project identity and grid/power, and expressly excluded financing,
construction, permitting/community, water, climate, and other areas. Therefore,
this run is **not a broad source-class coverage test**.

The ordinary research plan had eight category-specific requested primary
queries. Their persisted `executedQueries` entries all say `Not searched` in
this retrieval-only report: they describe the normal plan, not queries that this
live canary executed. The ordinary project-identity request sought project
identity, permit, operator disclosure, and selected state/regulatory records;
the grid request sought interconnection, transmission, and utility records.
Other ordinary category requests included water, city/county permitting and
community records, construction/capital, counterparties, and climate. These
requested category strings are not evidence of provider execution or returned
results.

At the time of this saved run, the generic Google discovery prompt asked for
broad discovery areas and preferred company, government, utility, and reporting
sources, but the dedicated Red Oak canary overrode that breadth with the narrow
two-query power-focused prompt above. It did not formulate a bounded query
family for each of exact-project/operator aliases, facility identifiers,
government/permit records, financing/construction, power/grid, and trade/local
reporting. Any later deterministic query plan must remain reported separately
from Google-reported executed search calls.

## Candidate, source-record, and receipt counts

| Saved measure | October 1 retrieval-only report |
| --- | ---: |
| Grounding requests | 1 |
| Provider-reported discovery candidates | 4 unique bounded candidates |
| Physical opens | 4 / 8 |
| Opened destination outcomes | 3 security-blocked; 1 accessible |
| Distinct usable extracted passages | 1 |
| Structured provider calls | 0 |
| Candidate destinations left unopened | 0 |
| Duplicate normalized source-state rows | Present; do not count as additional discovery candidates or physical opens |

The saved report preserves four candidate decisions and all four open receipts,
but the Google redirect URLs were opaque before opening. It does not preserve
the full raw annotation/duplicate/rejection lists. Its three normalized source
rows for the PRNewswire destination represent the retained occurrence plus
duplicate/rejected occurrences; they are not three separate discovered sources
or document opens. The saved run narrative identifies four candidates by their
original annotation ranks 1, 3, 7, and 13; intervening/missing annotations
cannot be inferred from these ranks.

| Candidate known after governed opening | Candidate class suggested by saved destination/passage | Selection and access result | What the receipt establishes |
| --- | --- | --- | --- |
| DataBank Red Oak campus page (`databank.com`) | Operator campus/project page | Selected; blocked by destination DNS/address validation | High-value operator destination was discovered and blocked. No passage was retrieved. |
| PRNewswire DataBank 480 MW campus announcement | Syndicated company development/construction announcement | Selected; accessible; usable passage retained | The passage names DataBank, the Red Oak Campus, Red Oak, TX, a proposed Oncor substation, and construction. It is a company announcement, not independent grid approval. |
| DataBank Red Oak campus construction blog (`databank.com`) | Operator construction announcement/page | Selected; blocked by destination DNS/address validation | High-value operator destination was discovered and blocked. No passage was retrieved. |
| DataBank Red Oak campus video page (`databank.com`) | Operator video page | Selected; blocked by destination DNS/address validation | Destination was only known after opening; the saved metadata did not identify it as a video pre-open. No passage was retrieved. |

The blocked destinations remain blocked; this report does not recommend a DNS,
SSRF, redirect, or transport-policy exception.

## Public-footprint benchmark against saved canaries

This table distinguishes (a) sources/classes established by the saved canary
records, (b) domain/title hints that do not establish a project-specific source,
and (c) known examples supplied as coverage benchmarks. The named examples in
the last column are **not** production URL targets or proof they occurred in
these canary responses.

| Source class | What the persisted September 30 / October 1 canary artifacts establish | Benchmark examples and coverage conclusion |
| --- | --- | --- |
| DataBank campus/project pages | The October 1 response surfaced a DataBank Red Oak campus page. It was selected and blocked by security; no campus-page text was obtained. | DataBank Red Oak campus/project pages are a known benchmark. Surfacing one is established; opening it is not. |
| Operator financing/construction announcements | The October 1 PRNewswire DataBank announcement was opened and yielded the single usable passage. A separate DataBank construction blog was selected but blocked. | Financing/construction is represented in the opened announcement and blocked operator blog; this does not establish full coverage of operator financing disclosures. |
| Texas project/permit records; TDLR | The September 30 canary opened TDLR records `TABS2026027681` (reported as a DataBank Red Oak DFW14 base-building record) and `TABS2026015329` (reported as a DataBank Red Oak DFW10 tenant-fit-out record). | State/TDLR source class appeared and was successfully opened in that earlier canary. These are not October 1 candidates. |
| City/county-specific records | The September 30 retained rows contain `redoaktx.org` and `civicclerk.com` citation-title/domain hints. Their URLs were opaque redirects, were not opened, and cannot be confirmed as a specific city/county project record. | A local government platform/domain hint appeared; a project-specific city/county record is **not established** by the saved receipts. |
| Financing/construction reporting | A Business Insider data-center financing article was opened in the September 30 canary; the saved ledger classifies its exact-project status as false and specificity as unknown. | Financing reporting appeared, but exact project identity remained unresolved in that saved audit. Dallas Innovates and CoStar are named benchmark examples, not confirmed candidates in the preserved canary artifacts. |
| Data-center trade reporting | The retained candidate/receipt tables do not establish a project-specific data-center trade-publication candidate. | DataCenterMap DFW11, CRE Daily, and other DFW9/DFW10/DFW11 third-party reporting are named benchmarks, not confirmed results in the preserved canary artifacts. |
| Local news/community reporting | No opened, project-specific local-news passage is established by the saved receipts. The civic-clerk title hint above is not a local-news article. | FOX 4 and other local reporting are named benchmarks, not confirmed results in the preserved canary artifacts. |
| Utility/grid/regulatory records | The September 30 canary has sparse lineage for `puc.texas.gov/` and its generic sitemap; it does not establish a project-specific PUC/grid passage. The October 1 usable announcement describes a proposed substation but is not independent approval. | Power terminology was heavily represented in the October 1 query; project-specific regulator/grid evidence was not established in either saved canary. |

The prior September 30 report records 16 provider-returned candidates, 14
normalized source-state rows (11 retained, 3 rejected), 8 physical opens, 6
accessible source-state records, and 0 structured calls. These lists are not
interchangeable: rows include repeated opened-source records and two official
source-discovery records. Its original discovery ranks and most of its physical
receipts are unavailable. The saved candidate ledger explicitly leaves those
facts unknown rather than deriving them from other rows.

## Search-term coverage: requested, observed, and not demonstrated

| Coverage dimension | October 1 executed query text | Ordinary requested plan / saved historical findings | Baseline result |
| --- | --- | --- | --- |
| DataBank + Red Oak | Both provider-reported queries name DataBank and Red Oak. | Ordinary requested project-identity and grid primary queries name the submitted project and aliases. | Covered in this restricted run. |
| Red Oak Campus | First query says “Red Oak campus”; second also says “data center campus.” | Saved ordinary identity query requests exact project identity. | Covered in this restricted run. |
| DFW9 / DFW10 / DFW11 | Neither provider-reported October 1 query contains these identifiers. | The September 30 opened TDLR passages establish DFW10 and DFW14; no saved receipt establishes DFW9 or DFW11. DataCenterMap DFW11 is a benchmark example, not a persisted result. | Not covered by the October 1 executed queries; DFW9/DFW11 are not established by saved passage receipts. |
| Owner/operator aliases | Queries use DataBank; no additional owner/operator alias appears in the saved query strings. | Submitted alias list in the canary includes `Red Oak Campus`, `DataBank Red Oak Campus`, and `DataBank Red Oak Data Center`. The saved current response did not record alias-variant query execution. | Single operator/name formulation; alias breadth not demonstrated. |
| Red Oak / Ellis County / Texas | Queries include Red Oak and Texas; neither says Ellis County. | Ordinary project context identifies Red Oak, Ellis County, Texas. | City/state terms present; county absent from provider-reported queries. |
| Financing / construction | Neither provider-reported query includes those terms. | Excluded by the dedicated prompt. Prior canary found Business Insider financing reporting; October 1 returned an announcement about development/construction despite the narrow query. | No targeted financing/construction query in this run; a relevant announcement was nevertheless returned. |
| Power / grid / utility | Queries include electric power, substation, Oncor, ERCOT, electric grid, utility, and power. | Ordinary grid category also requests interconnection, transmission, and utility records. | Strongly covered; observed results were insufficient to establish regulator-approved interconnection. |
| Permitting / government | Neither provider-reported query includes permitting, TDLR, TABS, or government terms. | Ordinary identity/permitting plans request state, municipal/county, and permit sources. Prior canary opened Texas TDLR pages. | Excluded from the October 1 dedicated prompt; no current-run coverage test. |
| Data-center trade / local reporting | Neither provider-reported query includes trade, local news, or community reporting terms. | The ordinary prompt favors reputable project-specific reporting generally but the saved current canary did not target these classes. | Not queried by the October 1 dedicated prompt. |

## Discovery-breadth diagnosis

The October 1 outcome is consistent with an underspecified **canary query
strategy**, not proof that a broader production search engine cannot return
these sources. One provider request executed only two closely related
power-focused queries. It surfaced an operator project page, operator
construction/blog/video pages, and one syndicated operator announcement; three
of four destinations were blocked by unchanged security controls. No independent
financing, TDLR, city/county, trade, local-news, or project-specific grid source
was established in that response. Because raw annotation details and unopened
redirect destinations are unavailable, do not claim those classes were absent
from the web or reconstruct their identities.

The saved ordinary plan already describes a wider set of research categories,
but in the retrieval-only run its categories were explicitly not searched. The
plan's presence is not evidence that its terms were issued to Google. The
proposed repair should diversify a **small, bounded requested query set** across
exact name/operator and aliases; facility/building identifiers; official/state
records; financing/construction; power/grid; and trade/local reporting. Use only
identifiers/authorities in submitted project context, retain a single overall
provider-request and physical-open budget, and record actual `google_search_call`
queries separately. Search/ranking signals can order candidate access only;
they must not confer exact identity, source authority, passage validity, or
evidence eligibility.

## Provenance

- October 1 retrieval-only live report:
  [red-oak-retrieval-canary-2026-10-01.json](red-oak-retrieval-canary-2026-10-01.json)
  and its existing report
  [red-oak-retrieval-canary-2026-10-01.md](red-oak-retrieval-canary-2026-10-01.md).
- September 30 grid canary:
  [red-oak-grid-canary-2026-09-30.json](red-oak-grid-canary-2026-09-30.json).
- September 30 reconciled ledger:
  [red-oak-prior-candidate-ledger.md](red-oak-prior-candidate-ledger.md).
- These saved canaries remain distinct invocations and revisions. Historical
  telemetry gaps are preserved; the reports above do not assert a replay,
  retrofit historical ordering, or account for missing annotations.