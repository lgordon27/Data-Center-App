# Red Oak retrieval-only canary — October 1, 2026

Diagnostic only; not evidence, a model input, or an accepted dossier change.
This is the single additional authorized live retrieval run. It stopped at
document access and did not issue structured analysis.

## Result and limits

| Observation | Result |
| --- | --- |
| Discovery requests | 1 |
| Physical opens | 4 / 8; four unused opportunities |
| Structured provider calls | 0 |
| Fallback, research retries, follow-ups, subsequent live runs | None |
| Unique bounded discovery candidates | 4; all attempted |
| Usable distinct extracted passages | 1 |
| Exact-project passages under existing identity audit | 0; identity remained unresolved |
| Blocked sources | 3 |
| Discovered unique candidates left unopened | 0 |
| Research / invocation runtime | 6,466 / 6,551 ms |
| Research / invocation limit | 75,000 / 90,000 ms |
| Deadline reached / open ceiling exhausted | No / no |
| Physical receipt completeness | All four authorized slots captured |

The command returned a nonzero status for the recorded incomplete technical
research outcome, not an absent report or a reason to retry. An earlier command
syntax error rejected a literal `--` during argument parsing; it created no
canary invocation, lock, document request, or provider request. Correcting that
syntax was followed by the one live invocation above.

The JSON's full-research terminal state remains `incomplete-technical-limitation`.
Structured identity/Grid work was intentionally not run. That absence is not
itself a retrieval failure.

## Prior versus new physical slots

These are separate discovery responses, not a replay of a shared candidate list.
No improvement in historical ordering is asserted for missing prior receipts.
The prior ledger is [red-oak-prior-candidate-ledger.md](red-oak-prior-candidate-ledger.md).

| Slot | Prior eight-open run | New retrieval-only run |
| ---: | --- | --- |
| 1 | Receipt unavailable | DataBank campus page; blocked at destination DNS validation |
| 2 | TDLR `TABS2026027681`; HTTP 200/extracted | PRNewswire DataBank campus announcement; HTTP 200/extracted, usable |
| 3 | Receipt unavailable | DataBank campus construction blog; blocked at destination DNS validation |
| 4 | Receipt unavailable | DataBank campus video page; blocked at destination DNS validation |
| 5 | Receipt unavailable | Unused |
| 6 | Business Insider financing article; HTTP 200/extracted | Unused |
| 7 | TDLR `TABS2026015329`; HTTP 200/extracted | Unused |
| 8 | Sparse `https://puc.texas.gov/` discovery lineage only | Unused |

## Every available new discovery candidate

All original URLs were opaque Google grounding redirects. The token is replaced
with a stable hash in the saved JSON; it is not a destination known before
opening. No snippets, exact project title, campus identifier, or facility
identifier were available for ranking. All four had acquisition score 100;
stable discovery ties determined the order. Operator-only title hints did not
grant exact-project identity. No source was promoted into eligibility.

| Original annotation rank | Acquisition rank / open | Pre-open title / signals | Resolved destination, known only after opening | Final result |
| ---: | ---: | --- | --- | --- |
| 1 | 1 / 1 | `databank.com`; operator hint, no project-specific metadata | `https://www.databank.com/data-centers/dallas/red-oak-campus/` | Selected and blocked; `private-destination`; no passage |
| 3 | 2 / 2 | `prnewswire.com`; text-source preference, no project-specific metadata | `https://www.prnewswire.com/news-releases/databank-announces-development-of-480mw-data-center-campus-in-south-dallas-302240719.html` | Selected and usable; HTML extracted; 4,000-character captured passage |
| 7 | 3 / 3 | `databank.com`; operator hint, no project-specific metadata | `https://www.databank.com/resources/blogs/building-the-future-inside-databanks-red-oak-campus-construction/` | Selected and blocked; `private-destination`; no passage |
| 13 | 4 / 4 | `databank.com`; operator hint, no project-specific metadata | `https://www.databank.com/resources/videos/inside-databanks-red-oak-campus-data-centers/` | Selected and blocked; `private-destination`; no passage |

The resolved video path was unavailable at ranking time. It was not silently
treated as a known text source: the recorded text preference means only that
available discovery metadata did not identify video.

Raw annotation diagnostics and duplicate/rejected citation lists were not
carried into the saved live report. Ranks 1, 3, 7, and 13 are preserved original
annotation positions, not proof of the missing annotations' identities or total.
Those missing duplicate/rejection details remain unavailable; no response was
re-fetched or reconstructed. The four unique candidate decisions and their
receipts are complete.

## Usable text versus exact-project validation

The PRNewswire text is a syndicated DataBank announcement, not independently
verified grid approval. Its captured excerpt explicitly names the requested
campus, operator, and Red Oak, Texas:

> DataBank ... announced the development of a 480MW data center campus on
> 292 acres of land in Red Oak, TX ...
> The South Dallas land will become home to the new " Red Oak Campus " ...

It also says:

> The Phase 1 design of the site will feature 4 buildings and a 400MW
> sub-station from Oncor that can deliver up to 240MW of critical IT power ...

The ellipses here abbreviate the report's retained excerpt; the complete bounded
excerpt is preserved in the JSON. Passage SHA-256:
`aff6f9aa0b08f77d39f802ea8c6ec9040f66d6ab3008aca68c3baa2e241ad939`.
Document content SHA-256:
`3a596deedcadab06f38116ef11a9a0fb74210d2f4d39332fe0229aa800f518a5`.

There is **one usable passage containing exact-project wording**, but **zero
passages classified exact-project by the unchanged retained identity audit**.
That audit remains unresolved and the source remains rejected for evidence;
neither ranking nor this diagnostic quotation overwrites it. Campus IT capacity,
phase capacity, proposed substation capacity, and confirmed interconnection are
not interchangeable. No claim extraction or structured provider evaluation was
performed.

## Blocked high-value sources and remaining retrieval blocker

The campus page and construction blog are high-value operator destinations by
their resolved paths. Both, and the video page, remain blocked. Each receipt
records two DNS answers: one public and one prohibited, with rejecting rule
`ipv4-special-purpose`. The destination returned no HTTP response. Addresses
are not exposed in this report. No DNS rule, redirect check, pinned transport,
or access restriction was weakened.

The remaining retrieval limitations are:

1. Opaque redirects and domain-only citation titles provide no supported
   exact-project pre-open ranking signal for this response.
2. Three operator destinations fail the existing destination-address policy.
3. The one extracted campus announcement remains unresolved in the existing
   identity audit; resolving that is outside this acquisition-only task.

The budget and deadline were not the blocker. Retrieval stopped after the one
bounded discovery batch; it did not continue through official-domain roots,
other categories, provider probes, or structured analysis.

## Validation, provenance, isolation

Before the live request: **469 package tests**, **29 standalone data `.mjs`
regressions**, typecheck, and production build passed. Focused ranking, protected
admission, blocked-source, ceiling, reuse, and retrieval-only tests are included
in that passing package suite. The first full suite failed two related selection
regressions; both were repaired without changing assertions or evidence rules
before the passing gates. The build had only the existing large-chunk warning.

- Live source revision: `131fbe250dcdb76586173d02e78406a9519a4362`.
- Live source SHA-256: `287abfed2dc58a24e1756a8848c07cfbd4bff3a380b2f62f6f054dd552c3aa8c`.
- Gate record: [red-oak-retrieval-prelive-gates-2026-10-01.json](red-oak-retrieval-prelive-gates-2026-10-01.json).
- Live report: [red-oak-retrieval-canary-2026-10-01.json](red-oak-retrieval-canary-2026-10-01.json).
- Fresh temporary cache and registry, in-memory audit storage, production-default
  pinned public document transport; cleanup completed.
- No production research state read/write, canonical dossier edits, financial
  changes, evidence acceptance, or deployment.
- Original September 30 JSON and Markdown preserved unchanged.
- Reports were not registered as mutable Library assets.

Later offline-only reporting corrections preserve duplicate annotation decisions
through the final audit. A completion check also found that duplicate deferred
receipt insertion and admission-sized audit limits could hide candidates and
authorized receipts in a maximum discovery batch. The offline repair separates
discovery-audit capacity from admission capacity and adds a persisted-audit
regression with 80 candidates, a 16-candidate admission limit, and eight opens.
These corrections do not change or replace the live source identity, recover
absent live telemetry, or authorize another live request. Their final validation
passed **472 package tests**, **29 standalone data regressions**, typecheck, and
production build. These results are recorded separately in
[red-oak-retrieval-final-offline-gates.json](red-oak-retrieval-final-offline-gates.json).