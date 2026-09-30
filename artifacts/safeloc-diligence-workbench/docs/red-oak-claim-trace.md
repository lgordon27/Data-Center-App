# Red Oak retained-capacity claim trace (offline)

## Scope and provenance

This trace uses the 4,000-character retained article passage supplied in the
bounded task context. Its source is
`https://www.theaiconsultingnetwork.com/blog/databank-2b-red-oak-dallas-data-center-oracle-cre-investors-2026`.
The passage is preserved as a fixture at
`server/fixtures/red-oak-retained.txt`; the trailing space cut by the fixture
file format is restored in the test before it is replayed. No provider, saved
cache, production data, or deployment was contacted or modified.

The retained context identifies two separate records, not a single current
result:

| Record | Stored/run times | Runtime/source metadata | What can be concluded |
| --- | --- | --- | --- |
| 21:59 run `0b21e902-0043-48a3-8834-1bb2bc514118` | Stored 2026-09-30 21:59:20Z; run 21:58:14–21:59:19Z | Build `dev-5eadab7174d5375c315a7aaad710ae34e59e06b1`; commit and source commit `5eadab7174d5375c315a7aaad710ae34e59e06b1`; cache version 4, policy versions 1/2, model `gpt-4o` | Saved record reports 24/24 opens, 0 eligible evidence, 0 proposed inputs, and an incomplete technical outcome. It is the record with the retained junk examples and structured category-call diagnostics. |
| 22:02 run `278cdc78-839f-4693-84f0-2c46cdacc5af` | Stored 2026-09-30 22:02:51Z; run 22:02:31–22:02:51Z | Same recorded build/commit; cache version 4 | A distinct incomplete result. Its only retained provider-attempt entry has no response ID or structured diagnostic; it is not evidence that the 21:59 calls returned zero claims. |

The actual screen/session display time, selected record, and cache-age state at
display are absent from the bounded record. The saved record's build hash
matches the recorded source revision, but does not establish which result was
displayed or whether it was fresh then. No claim is made that the display
represented current code.

## Claim-by-claim gates

### Whole-campus 480 MW IT load

1. **Retrieval:** The 21:59 retained-source record includes the accessible
   article passage and an access receipt.
2. **Retention:** The article survived as a retained passage.
3. **Project identity:** Production `matchProject` resolves the unchanged
   passage as the requested DataBank Red Oak project and location.
4. **Facility/phase scope:** The production claim-scope extractor returns
   unknown scope for value 480 against the *whole* article because the value
   occurs more than once. This is the first failed gate for replaying the
   full retained passage as a single claim. It is conservative ambiguity, not
   a defect to loosen. When isolated to the exact sentence “The 292-acre site
   will eventually host eight buildings delivering 480 MW of total IT load,”
   scope is project/all-phases.
5. **Time scope:** That isolated sentence carries no claim period. A nearby
   financing date or the article's 2026 headline is not a stated period for
   this capacity claim.
6. **Claim extraction:** The retained-finding reader can isolate one
   figure-to-measure claim in the full passage: `480 MW`, `IT load/capacity`.
   That retained finding does not itself establish a modeled variable.
7. **Source validation and evidence mapping:** Capacity is not one of the
   16 governed evidence identifiers; there is no `project_capacity` mapping.
   The appropriate mapping for this IT-load fact is therefore **not
   applicable**, not a forced proposal. If misrouted to grid-interconnection
   timeline, the mapping lacks time scope and MW is not the variable's time
   dimension. If misrouted to backup-power capacity, it is still IT load, not
   backup runtime; the semantic policy uses hours.
8. **Eligibility/proposal:** The production client keeps retained findings
   `research-only` and financial effect false. Its `proposedInputs` contains
   only eligible governed evidence; this capacity finding does not enter it.

### DFW9/DFW10/DFW11 180 MW

1. **Retrieval and retention:** Same accessible retained article and receipt.
2. **Project identity:** The retained passage resolves to the exact DataBank
   Red Oak project.
3. **Facility/phase scope:** The full article contains repeated 180 MW
   mentions; whole-passage extraction returns unknown, the first failed gate
   when replaying that whole passage. The exact dated sentence beginning
   “On April 21, 2026, DataBank closed a $2 billion construction loan” ties
   the 180 MW figure to the first three buildings (DFW9, DFW10, DFW11), and
   the extractor returns exact-phase scope for that sentence. A separate
   later mention of the same 180 MW group is not dated, so the two mentions
   must not be collapsed into a single dated claim without support.
4. **Time scope:** The dated financing sentence returns `2026-04-21` as
   sentence-associated time; the later repeated claim has no explicit claim
   period. This does not license borrowing the loan date for every 180 MW
   mention.
5. **Claim extraction:** The claim is a three-building capacity/IT power
   statement, not a grid energization timeline and not hours of backup
   runtime. The full article's repeated mentions remain ambiguous to the
   generic scope extractor.
6. **Source validation and evidence mapping:** As with 480 MW, no governed
   capacity evidence identifier exists. Mapping 180 MW to grid-interconnection
   or backup-power capacity is not applicable and would conflate unlike
   measures. The offline negative test also confirms that an attempted
   grid/backup mapping with absent time scope is rejected and that MW fails
   the semantic unit validation for both variables.
7. **Eligibility/proposal:** The retained finding remains reporting context,
   not an eligible proposal or accepted model input.

The retained article is secondary reporting. “Exact project” identity and a
retrieved quotation do not independently validate the report or make its
capacity figures eligible for a financial input.

## What is and is not established

The first failure for both values when treating the full retained article as
one claim passage is ambiguous facility/phase scope, caused by repeated
mentions. Exact quoted sentences can establish whole-campus scope for 480 MW
and three-building phase scope for 180 MW, but that does not change their
measure or create a capacity input in the financial evidence contract.
Identity matching, retained findings, and reported project-summary capacity
must not be mistaken for evidence mapping or proposal eligibility.

The 21:59 record's `projectSummary.capacityMW: 480` is marked
`directory-reported`; it is summary context, separate from the article's
source-backed claim and from eligible evidence. The offline client replay
retains that summary value while producing zero proposed or accepted inputs.

No defect was demonstrated in the scope ambiguity or financial eligibility
boundary in this trace. No production policy was changed. The unrelated
CivicEngage and corrupted PDF extraction defects are outside this focused
trace and are being handled separately.

## Regression

Run from `artifacts/safeloc-diligence-workbench`:

```sh
npx tsx --test server/redOakClaimTrace.test.mjs
```

The regression uses the unchanged retained article and production identity,
scope, source mapping, semantic eligibility, retained-finding, and client
proposal code paths. It asserts that repeated whole-passage values remain
ambiguous, isolated 480 MW and 180 MW excerpts retain distinct scope, and
capacity does not leak into a financial proposal.