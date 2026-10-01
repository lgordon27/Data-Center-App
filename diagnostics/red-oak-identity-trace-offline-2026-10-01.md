# Red Oak identity trace — saved retrieval excerpt only

Offline diagnostic for the retained PRNewswire passage in
`red-oak-retrieval-canary-2026-10-01.json`. This trace uses the exact saved
1,500-character `passageExcerpt`; it does not use search snippets, perform a
network request, or infer the unavailable remainder.

The canary report describes a 4,000-character captured passage, but only its
1,500-character excerpt is available here. The rest of the historical passage
and the full original retrieval response were not fetched or reconstructed.

## Source metadata and identity gates

| Gate | Saved excerpt result |
| --- | --- |
| Source metadata | Retained candidate; resolved destination `https://www.prnewswire.com/news-releases/databank-announces-development-of-480mw-data-center-campus-in-south-dallas-302240719.html`; generic candidate title `prnewswire.com`; HTML extraction succeeded; usable passage retained; source type and identity signals are null/empty; provider `exactProject` is `false`. Passage SHA-256: `aff6f9aa0b08f77d39f802ea8c6ec9040f66d6ab3008aca68c3baa2e241ad939`; document content SHA-256: `3a596deedcadab06f38116ef11a9a0fb74210d2f4d39332fe0229aa800f518a5`. The title, URL, and provider annotations do not prove identity. |
| Project-name/alias match | The passage explicitly calls the new project `"Red Oak Campus"` and also names the DataBank Red Oak campus. The requested identity is Red Oak Campus, operator DataBank, Red Oak / Ellis County / Texas. |
| Operator match, before repair | **First failed gate.** The text says `DataBank ... today announced the development of a 480MW data center campus ... in Red Oak, TX`, but the prior matcher did not recognize the announcement actor through the comma-separated company description. Result: `ambiguous`, “does not establish attribution to the requested operator (DataBank).” |
| Location match | `parseLocations` finds Red Oak, Texas, from `in Red Oak, TX`. City and state match. Ellis County is not stated in the saved excerpt; county evidence is unavailable, not inferred. |
| Facility/building match | The passage names a new campus, up to eight two-story data centers, and four Phase-1 buildings. It does not name each building. DFW1 is identified as DataBank headquarters, with six other metro facilities; those are not treated as the Red Oak campus or its buildings. |
| Conflict detection | No competing operator or conflicting attached campus location is stated in the saved excerpt. The DFW1 and other-metro-facility references remain distinct. No capacity, proposed-substation, or grid-approval conclusion follows from this identity check. |
| Final identity, before repair | `ambiguous`; operator attribution was the first failed gate. |
| Final identity, after repair | `exact-project`; retrieved text connects DataBank's announcement of development to the campus in Red Oak, Texas. |

## First offline repair and historical result

The first offline repair recognized an announcing company in the same matched
fragment when it used `announced the development of`; it also allowed the
matched project wording to appear later in that fragment. Its post-repair
`exact-project` result, recorded below, is retained as history but was
subsequently rejected as too broad.

## Post-live safety correction provenance

This correction was requested after the earlier live canary. This follow-up
used only the saved excerpt and offline tests: it made no live/network request,
did not alter the historical canary response, and did not fetch or reconstruct
the unavailable remainder of the passage.

The earlier rule could attach DataBank's development-announcement role to a
later matching name even when the announced object was an unrelated warehouse
venue, a separately named development, or an object in another clause. The
current rule requires the matched name tokens, the requested attached location,
and a data-center-campus object to occur together inside the announcement's
object-of-development text. Nearby/separate relations between the object type
and requested location, and a detected different named campus object, do not
establish the requested identity. The existing company reporting-clause
safeguards remain in place.

The final correction also rejects substantive trailing text after the siting
phrase and announcements split into multiple clauses of the same sentence.
Explicit different-development names after the location, introduced by commas
or semicolons, cannot grant operator attribution. The saved passage's exact
non-identity expansion statement remains a bounded exception. Offline shared
identity and production canary-gate regressions verify these negatives and
preserve the unchanged saved-excerpt positive. No further live invocation ran.

## Current offline reproduction and safeguards

The shared matcher recognizes a company subject through the bounded lowercase
comma-separated descriptors in the saved excerpt, but attributes it only when
the announcement's development object itself is a data-center campus with the
requested location and matching project-name tokens. It does not accept a
publisher/company mention alone, a generic candidate title, provider-supplied
`exactProject`/identity-role fields, or a later name outside that object.

The change preserves sentence/clause-local attribution. An explicitly negated
project name, a different announced operator, and an attached conflicting
location still fail closed. A campus remains distinct from its individual
buildings and from other named metro facilities. Shared client/server identity
assessment continues to delegate to the same passage matcher.

## Offline reproduction and validation

- Baseline reproduction on the unchanged saved excerpt: `ambiguous`, operator
  attribution not established.
- Historical first-repair reproduction on the same excerpt: `exact-project`;
  the matcher reports project name/alias plus matching city and state.
- Current safety-corrected reproduction on the same 1,500-character excerpt:
  `exact-project`; the matcher reports project name/alias plus matching city
  and state from the announced data-center-campus object.
- Focused `researchClaimVerifier.test.mjs`: **23 passed, 0 failed**.
- The focused suite includes the saved JSON excerpt, sufficient connected
  announcement wording, conflicting operator/location/project wording,
  warehouse-venue and nearby-campus negatives, a different named development,
  cross-clause attribution, publisher-only mentions, generic titles/provider
  identity assertions, campus/building boundaries, and the shared
  `assessResearchProjectIdentity` entry point.
- No DNS/SSRF, retrieval, source-authority, evidence-eligibility, financial
  modeling, production data, or live request was performed in this follow-up.