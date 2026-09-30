# Red Oak Grid canary — September 30, 2026

## Result

Exactly one authorized live invocation ran. Its result was **incomplete technical
limitation**, not a conclusive search with no eligible evidence.

| Observation | Result |
| --- | --- |
| Grounded discovery requests | 1 |
| Physical document opens | 8 / 8 |
| Structured provider calls | 0 / 2 |
| Grid analysis packets / passages sent | 0 |
| Provider-returned Grid claims | 0; structured analysis was not issued |
| Eligible proposals / accepted inputs | 0 / 0 |
| Research runtime | 12,654 ms |
| Total invocation runtime, including cleanup | 12,816 ms |
| Research / overall ceiling | 75,000 / 90,000 ms |
| Deadline reached | No recorded deadline event |
| Fallback, retries, follow-ups, rehearsal, subsequent live runs | None |
| Discovery request size | 1,052 bytes |
| Discovery response ID / token usage | Unavailable in the captured report |
| CivicEngage error / corrupted-text pattern encountered | Neither observed in available receipts; missing receipts prevent a run-wide assertion |

## Remaining blocker

Identity and Grid did not receive a usable grounded analysis packet. The physical
open budget was exhausted. Three distinct sources remained visibly accessible,
but accessibility did not establish category applicability or model eligibility:

| Physical open | Retained URL | Access |
| --- | --- | --- |
| 2 | https://www.tdlr.texas.gov/TABS/Search/Project/TABS2026027681 | HTTP 200, extracted |
| 6 | https://www.businessinsider.com/databank-financing-dallas-data-center-inference-2026-4 | HTTP 200, extracted |
| 7 | https://www.tdlr.texas.gov/TABS/Projects/TABS2026015329 | HTTP 200, extracted |

Detailed receipts for opens **1, 3, 4, 5, and 8** were not preserved by the original
report path. Open 8 has a sparse official-discovery lineage reference only. These
details are explicitly unavailable: no sources were fetched again, no provider
responses were recovered, and no receipt details were inferred.

Discovery reported 16 candidates; the retained source-state report contained 14
entries, including category reuse, and 16 candidate-lineage entries. The original
report lacks the snapshots needed for one-to-one reconciliation. The JSON retains
all available sanitized URL lineage, access outcomes, bounded excerpts and hashes.

No claim-level rejection was observed because no structured call was issued.
Identity, facility/phase, time, semantic/unit, source-validation, containment and
proposal gates for provider claims therefore remain **not evaluated**. This is
different from malformed output, a provider returning no claims, or a claim being
rejected by an evaluated gate.

## Verification and provenance

- Before the live invocation: **456 package tests**, **29 standalone data `.mjs`
  tests**, typecheck and production build passed.
- Red Oak content-quality repairs and the Google-grounding fixture correction
  were confirmed before the request.
- Live source revision: `2ac4a5586a56b562be137065e1cab48270a742ce`.
- Live working-tree source SHA-256:
  `05678487a68976769a31efd76d88297f7099dc869533c56be1c40c9050824b7b`.
- Fresh temporary cache and registry, in-memory audit storage, production-default
  pinned document transport, no production research state reads or writes.
- Whole-campus 480 MW IT load and 180 MW building-group capacity retain their
  contextual meanings; neither was promoted into grid or backup-power evidence.

## Offline corrections after the single run

The original trace incorrectly labeled locally generated Missing Evidence records
as provider-returned claims. The saved report was corrected using its own zero-call
telemetry; original byte hash:
`ed0e01120386129ebe15236ef9d559b317792dac23e411d3dc4349d2de952e14`.
Not-attempted records were also corrected to `attempted: false`.

The original generic limitation text claimed a deadline prevented analysis.
Captured timing does not support that explanation; it is preserved as an
uncorroborated original diagnostic, not accepted as the cause.

The harness now records pre-mutation candidate snapshots, physical authorizations
and receipts, actual issued Grid packet hashes, and available provider telemetry.
These improvements were checked **offline only**: **458 package tests**, **29
standalone data regressions**, typecheck and build passed afterward. They were not
validated by another live run. The live result above remains tied to its original
source identity.

Full sanitized report: [red-oak-grid-canary-2026-09-30.json](red-oak-grid-canary-2026-09-30.json).
No report was registered as a mutable Library asset. No deployment, canonical
dossier edit, financial-input change or automatic evidence acceptance occurred.