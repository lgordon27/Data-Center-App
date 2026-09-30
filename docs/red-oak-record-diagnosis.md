# Red Oak saved-run diagnosis and current fix status

## Scope and confidence

This report reconciles the bounded JSON records in `.local/tasks/task-311.md`,
the offline claim replay in
`artifacts/safeloc-diligence-workbench/docs/red-oak-claim-trace.md`, and the
checked-in September 23 diagnostic files. The
expected cache directory `/tmp/safeloc-research-cache` is absent in this
workspace; no original cache JSON, raw provider payloads, browser session record,
or displayed-result request metadata was available. No provider request, cache
write, or saved-record modification was performed. The development workflow was
restarted and Home was screenshotted only to confirm application startup.

The 21:59 and 22:02 records are distinct and must not be merged. The 21:59
record is the only one whose retained context includes the CivicEngage error,
corrupt PDF, source passages, physical-slot lineage, and structured-response
diagnostics described below. It matches the reported failure pattern, but there
is no browser/session provenance tying the displayed result to that cache key.
Thus it is the best-documented candidate for the displayed failure, not a
verified display attribution.

## Run provenance and freshness

| Saved record | Run and stored times (UTC) | Build/source identity | Cache/audit result |
|---|---|---|---|
| 21:59 record | Run `0b21e902-0043-48a3-8834-1bb2bc514118`; started `2026-09-30T21:58:14.280Z`; finished `2026-09-30T21:59:19.892Z`; stored `2026-09-30T21:59:20.096Z` | `dev-5eadab7174d5375c315a7aaad710ae34e59e06b1`; commit/source commit `5eadab7174d5375c315a7aaad710ae34e59e06b1`; app `1.0.0`; model `gpt-4o`; research policy 2; semantic policy 1; cache v4 | Outcome `incomplete-technical-limitation`; 24/24 physical opens; zero eligible evidence/proposals. Saved planning extract supplies cache key `ed64dc109e8977f404f16fe4cb81f45c64f1d0d14d28811540b0bf5d664d6c03`. |
| 22:02 record | Run `278cdc78-839f-4693-84f0-2c46cdacc5af`; started `2026-09-30T22:02:31.227Z`; finished `2026-09-30T22:02:51.607Z`; stored `2026-09-30T22:02:51.820Z` | Same recorded dev build and commit as 21:59 | Separate cache key `b8efb2f828d97a78d894180b71c609a9b827a57f72e0f57abc62c1a88fb29`; incomplete technical limitation; 24 opens; zero eligible evidence; only one null-category provider attempt is in the bounded extract. Its project-summary capacity is null and it has no usable source/audit detail in the supplied record. |
| September 23 single-shot | Summary generated `2026-09-23T18:15:45.357Z`; request was “DataBank Red Oak Campus” | The summary itself does not record a source/build SHA. It is not either September 30 cache record. Related Sep 18 diagnostics concern different runs/revisions and cannot be assigned to this single-shot. | Separate `diagnostics/databank-red-oak-single-shot-2026-09-23-summary.json`: 16/24 opens, no eligible evidence, timeout/provider failure. It reports 480 MW only in AI-reported summary, with no retained passage containing 480 MW; its retained phase passage is a third-party 180 MW passage. |

At the initial diagnostic inspection, the repository baseline was
`5eadab7174d5375c315a7aaad710ae34e59e06b1`, matching the two September 30
records' recorded source commit. That is not the final revision. During this
work, concurrent opened-dossier UX and merge-gate fixture changes were
incorporated in `21cdcb2bed2da24efb96a50ea03c9887c9618b7d`; the initial
diagnosis implementation was subsequently recorded in
`977be2a`. The saved-session quality follow-up is additional to those revisions.
None of these later changes establishes what code/assets were served at the
historical display time. The run cache records have stored times,
but no display time, client cache metadata, or cache-age-at-display measurement
survived. Fresh/recent/stale-at-display is therefore **unknown**. Nor can the
record be classified as a currently displayed cache result versus an older
session result.

## Capacity claim trace

### 480 MW, whole campus

The relevant retained article in the 21:59 bounded extract says the eight-building
campus will deliver up to 480 MW across eight buildings and later explicitly
calls it “480 MW of total IT load.” Its source is the third-party
`theaiconsultingnetwork.com` article, opened at physical slot 10. The recorded
source class is secondary reporting, access is `accessible`, extraction is HTML,
and the passage is retained. This establishes that a passage containing the
claim was retrieved and retained; it does not establish source authority,
independent corroboration, or the displayed claim's immutable evidence mapping.

1. **Retrieval:** observed at slot 10, source URL
   `https://www.theaiconsultingnetwork.com/blog/databank-2b-red-oak-dallas-data-center-oracle-cre-investors-2026`.
2. **Retention:** the 21:59 fixture retained an article passage that includes
   the campus-wide 480 MW / total IT load statement. The passage is cut off
   after part of the article in the normalized record; no per-claim source
   attachment from the raw provider output is available.
3. **Identity:** the historical retained `sourceRecords` and candidate lineage
   label this source's project specificity/identity `unknown` or `unresolved`.
   That is a saved diagnostic value, not proof that identity was the first
   failed gate. The unchanged retained article passes the current offline
   `matchProject` replay as the exact DataBank Red Oak project.
4. **Facility/phase scope:** replaying the full 4,000-character passage with
   value 480 returns unknown facility/phase scope because the article repeats
   capacity mentions. This is the first failed gate in the offline full-passage
   replay after identity passes. It is conservative ambiguity, not an
   extraction defect to relax. The isolated sentence “The 292-acre site will
   eventually host eight buildings delivering 480 MW of total IT load.”
   returns project/all-phases scope.
5. **Time scope:** the isolated whole-campus sentence has no claim period.
   Do not borrow the article headline year or the separate financing date;
   the offline replay explicitly returns null time.
6. **Claim extraction:** the offline retained-finding replay resolves the
   finding to `480 MW`, measure `IT load/capacity`. The historical structured
   provider claim and its quote were not persisted; the current replay is not
   evidence that the original provider selected this same isolated sentence.
7. **Source validation / mapping:** the offline replay establishes the source
   text's exact-project identity, but it remains secondary reporting. Capacity
   is not one of the 16 governed evidence identifiers; there is no
   `project_capacity` mapping. The appropriate financial-variable mapping is
   **not applicable**, rather than a forced grid or backup-power proposal.
8. **Evidence eligibility / proposal:** 480 MW is project/facility IT capacity,
   not one of SafeLoc's 16 governed evidence identifiers. It is not grid
   interconnection, backup-power capacity, or an electricity-price claim.
   It can be contextual capacity information, but there is no correct governed
   financial evidence slot or proposal for it as a standalone campus-capacity
   number. The summary's 480 MW in the September 23 run was explicitly only
   AI-reported, not source-validated.

**First failed gate in the offline full-passage replay:** repeated mentions
leave facility/phase scope unknown after identity passes. The isolated
whole-campus passage then fails to establish a time period. Separately, as a
financial proposal, the number has no matching modeled evidence variable; that
is a legitimate unmapped/not-applicable boundary, not a reason to force it
into grid or backup power. The historical provider claim's own downstream
trace remains unavailable.

### 180 MW, DFW9 / DFW10 / DFW11

The same retained article says the April 21, 2026 construction loan funds the
first three buildings (DFW9, DFW10, DFW11), which total 180 megawatts; later
sentences restate 180 MW for the first three. Slot 10 is the only preserved
article source in the bounded extract containing this passage.

1. **Retrieval and retention:** observed at slot 10; the cited DFW9–DFW11
   180 MW sentence is present in the retained passage.
2. **Identity:** the historical source audit says `unknown` / `unresolved`,
   but the unchanged article passes current offline `matchProject` as the
   exact DataBank Red Oak project. The historic label does not prove identity
   was the first failed gate.
3. **Facility/phase scope:** the full article's repeated 180 MW mentions return
   unknown facility/phase scope in the offline replay. For the isolated,
   exact dated sentence beginning “On April 21, 2026, DataBank closed a
   $2 billion construction loan,” the extractor returns exact-phase scope for
   the first three named buildings, DFW9/DFW10/DFW11. It is not the whole
   eight-building campus.
4. **Time scope:** the isolated dated sentence associates the 180 MW phase
   claim with `2026-04-21`. A separate later repeated 180 MW mention is not
   dated and cannot borrow that date. This is a property of the particular
   quote, not proof that every 180 MW mention is dated.
5. **Claim extraction:** the offline replay resolves the retained finding as
   capacity/IT power, distinct from 600,000 square feet and 480 MW campus IT
   load. The historic provider's selected claim and quote are unavailable.
6. **Source validation / mapping:** the isolated quote remains secondary
   reporting. There is no governed capacity evidence identifier; mapping 180
   MW to grid-interconnection or backup-power capacity is not applicable and
   would conflate measures. Offline negative tests reject those attempted
   mappings; MW also fails the backup-power semantic unit contract.
7. **Evidence eligibility / proposal:** 180 MW of facility/phase power is
   neither grid-interconnection approval nor backup-generator capacity.
   It does not fit a modeled variable absent a separate admissible variable
   and appropriately qualified claim. Do not reinterpret “power” as
   backup-power capacity.

**First failed gate in the offline full-passage replay:** repeated mentions
leave scope unknown after identity passes. For the isolated dated sentence,
identity, phase, and claim time are established, but the value is still
legitimately unmapped to the 16 governed evidence IDs. The historical
provider claim's own downstream trace remains unavailable.

### Grid and backup-power distinction

Grid and tenant structured responses were the categories with positive
claim-count diagnostics; those counts do not identify claim labels or values.
The record does not prove that either contained 480 MW or 180 MW. A project IT
load number is not evidence of a utility interconnection date or approval.
Likewise, neither claim states generator/backup capacity. The September 23
summary's finding that its 480 MW existed only in the AI project summary and
not retained source text applies only to that older run and cannot be used to
describe the September 30 record.

## Structured-response accounting and loss boundary

The 21:59 record contains these category response IDs and diagnostics. Here
`returnedClaimCount` counts non-empty/non-explicitly-unavailable response
records, not independently validated evidence. `evidenceRecordCount` is the
category's response-record count. The audits preserve no labels, values,
quotes, source URLs, or raw provider payload for these claims.

| Category / attempt | Provider response ID | Evidence records | Returned claims | Recorded post-response rejection |
|---|---|---:|---:|---|
| Project identity / primary | `resp_0df0d594a16b693d006abd8607527887d299a09ae480343537` | 0 | 0 | None; upstream/provider failure is also recorded for this category in the final category state. |
| Tenant-counterparty / primary | `resp_0b24f8df58ab6bc6006abd860b96ac87d2a17e6992ff079dd7` | 2 | 2 | No specific per-claim rejection persisted. Final evidence contains only Missing Evidence. |
| Grid / primary | `resp_0e10357ec3844387006abd860fcba087d2bee69047d70300b8` | 4 | 4 | No specific per-claim rejection persisted. Final evidence contains only Missing Evidence. |
| Electricity / primary | `resp_0718b1beb5c57abc006abd8619247087d2a9c64f194e448608` | 4 | 0 | Zero claims returned. |
| Water / primary | `resp_05d8ed5276ecbbde006abd8620158c87d297538ba83ada1868` | 4 | 0 | Zero claims returned. |
| Construction-capital / primary | `resp_03d55e4d98191483006abd8627967487d29c670e0831d36c39` | 3 | 0 | Zero claims returned. |
| Permitting-community / primary | `resp_01214c6512d60a93006abd863170d487d280e02bae41b357af` | 3 | 0 | Zero claims returned. |
| Climate-operational-hazard | No completed structured call recorded | — | — | Not searched due the physical-open ceiling. |

The positive-call diagnostics are `state:"claims-received"` with
`rejectedClaimCount:0` and no validation error. This is a pre-downstream
observation, not a statement that claims passed evidence validation.
The run-level final summary has 16 records, all `Missing Evidence`, with first
eligibility failure `validated-source` (“No validated source was returned.”)
and zero proposals.

**Claim-specific loss is not diagnosable beyond that boundary.** The raw
provider response, normalized category payload, per-category evidence claim
records, and per-claim eligibility traces are not present. Consequently, no
responsible report can say whether any particular 2 or 4 returned claims were
later rejected for URL/source mismatch, identity, passage support, scope/time,
semantics, or eligibility. The first proven *recording gap* is after the
pre-validation `claims-received` diagnostic: the per-claim category data needed
to audit the path was not saved in the bounded record. It is not proof of a
production code defect or of a specific claim being dropped.

Current code paths explain what would need correlation in a full audit:

- `researchProjectProxy.mjs` records `createStructuredResponseDiagnostic`
  after parsing the provider's structured JSON. The diagnostic intentionally
  records counts, not payload fields.
- `validateCategoryResult` runs `parseResearchResponse` without accessed source
  packets for shape validation, then the category pipeline re-parses against
  accessed sources and contains it.
- `mergeCategoryResearchResults` merges only category evidence whose URLs
  canonicalize to retained URLs and whose category evidence survives
  containment; otherwise the final record is `missingResearchEvidence`.
- The final run parse rebuilds sources and eligibility, and the client makes
  proposals only from `research.proposedInputs`; `DiligenceContext` stores
  those as pending proposals. A final count of zero alone does not localize
  which earlier gate withheld each response claim.

No live response replay or payload inspection was done.

## Why unusable content survived

The run's fetched CivicEngage passage is:

> Ellis County, TX • CivicEngage Skip to Main Content An error has occurred. An
> error has occurred in this application. All information about this error has
> been logged. We apologize for any inconvenience. Please use this number to
> reference this error: 791f0f07-ab50-444d-bfdb-b4794ee54ed1 Return to HOME page.
> Live Edit Leave This Blank: Government Websites by CivicPlus … Loading …

The URL is `http://www.elliscountytx.gov/ArchiveCenter/ViewFile/Item/4224`,
opened at slot 15 and recorded accessible/extracted HTML. Current
`researchDocumentExtraction.mjs` recognizes bot verification, JavaScript and
login/paywall shell phrases, as well as prose-length / boilerplate rules, but
the pre-fix version did not recognize CivicEngage's “An error has occurred in
this application” template. The error banner and chrome passed general length
checks; it was labeled `extracted`, retained, and available to structured
analysis. This was not a DNS/SSRF validation failure.

The checkmarkpro PDF at
`https://checkmarkpro.com/assets/Case-Study-DataBank-DFW-11.pdf` (slot 4) is
recorded as `application/pdf`, `pdf-text`, `accessible`, and `extracted`.
Its retained text begins with control characters and high-entropy binary
glyphs rather than prose. Pre-fix `pdfAdapter` decoded PDF text
operators/streams without applying a text-quality test, so this content also
passed the retention path. No source passage from this PDF is evidence merely
because its title/path mentions DFW11.

### Current working-tree fix status

The current working tree adds deterministic content-quality rejection in
`src/data/researchContentQuality.mjs` for the exact CivicEngage application
error and control-heavy extracted text, as well as pure navigation/status
content. `researchDocumentExtraction.mjs` applies it after HTML/PDF/text
adaptation, returning non-retained outcomes for the application error and
corrupted PDF pattern. `researchProjectProxy.mjs` also filters unusable
passages before structured-input selection and receipt retention, and
quarantines cached/previously normalized evidence whose source or claim
passages fail the quality check. It records the content-quality failure in the
eligibility trace rather than treating a bad passage as evidence.

Regression fixtures/tests were added for the retained CivicEngage and corrupted
PDF passages, navigation/status pages, preservation of fetch receipts, and
exclusion from structured analysis/containment. The focused 480/180 MW replay
is documented in
`artifacts/safeloc-diligence-workbench/docs/red-oak-claim-trace.md` and uses
the unchanged retained article through identity, scope, source mapping,
semantic eligibility, findings, and proposal code paths. This report did not
run tests or builds, so it records the observed implementation and regression
coverage in the working tree, not a validation pass result. No saved cache or
source receipt was rewritten.

## Physical-open ledger — 21:59 record

The saved run reports 24 physical opens. The task's `physicalSlots.urls` are
the URLs recorded for indexes 1–17; some `sourceRecords` separately preserve
the original discovery URL and/or resolved URL. Do not substitute a discovery
redirect for the URL physically opened. Resolved targets are missing only for
slots 2 and 6 in this extract. Candidate lineage and official-attempt records
provide partial states and URLs for indexes 18–24.

| Slot | Physical slot URL as recorded; separate source-record URLs where different | Observed receipt and cautious classification |
|---:|---|---|
| 1 | Physical: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFb5joJPbSyHS32ICzTG_vTMXr1QSkKrdeHIXq2DEVX0pNsFl3gRsZy7RQObMlBJSi8A1OoSb7AD0qPxdfrrJdB5-N5Z5YAe2hkYj5E4AVrNBG4JyJiTqnp3AkFHVkFnCLF`; source-record resolved target: `https://www.youtube.com/watch?v=-RWZWBTISKw` | Blocked `size-limit`. YouTube/media candidate; project relevance **unknown**, not proven unrelated; no passage. |
| 2 | Physical: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHMeEtfHtW9TkLfLoX6O3H90dQhM-cNQkdG9O6ULYwbHwC9lfhTulJ4-6th5AEjlxrptjI6pa751UrBPaGjLFnaGlrLE7_L2_2TvM6bsnbDvqSn8ioGed7QIdSyQXpH8xgNHkBtdHZKkNfspaELvwyt6xa6Qe8HMQ==`; resolved target unavailable | Blocked `private-destination`; target/relevance unknown. |
| 3 | Physical: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQE5R7YQC8cmTFRg08ezD5o6rrmScEn_Df4cb-97DPqdkjdRCOflLy4gvTj8PGysXdcxxn4w43XZOvGiwoK9VGr2h22KE2Az1azEvdiCu1FIwHZhAtkoVfyUinYwqCUb3NSV5w3ptBcKmpQe-DwFzh6YC_qJfHlS2mtkYdml1D7CORlZsP2mz2THqaT_4vXaoxs_N5q3Bkpp7P40LbK4yQ==`; resolved in source record: `https://www.databank.com/resources/news/inside-databanks-multibillion-dollar-red-oak-data-center-campus/` | Blocked `private-destination`. Exact-project candidate by URL/title only; no content/validated identity. |
| 4 | Physical: `https://checkmarkpro.com/assets/Case-Study-DataBank-DFW-11.pdf`; source-record original/discovery URL: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHtFJWd0BGlK75Lqp6gvwiZOsmpVUmTBwnT-Mm87Sae3VcHmkk8YWa_T8uOUfMMYMUVSStuxnvJskZ2cFl7eUO7nTYDEjr1C2rJm-VTiQxImx5oG5VPa0wFf1ubo1_Lf7rJnOcG78tGkaVwm6suYfFEa4sQZQ==` | Accessible/retrieved `pdf-text`; DFW11-looking candidate, but observed text is corrupted/control-heavy junk, not evidence. |
| 5 | Physical and source-record original: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGmYN-sTwiszSHamt8v4cGOAN8OrtxkJ_XXhms213TZTpPYxx5H7zsxz8ArZiGlnv62ya-hmCCaPdgZe4HjUXbmmbgLLD0qeeZUqb6j0esZMchTNwWHNAp2ZlZaR7IAs-JRFTUPEnSMfhghkItmIhV0BlM=`; source-record resolved target: `https://www.databank.com/data-centers/dallas/red-oak-campus/` | Blocked `private-destination`. Official exact-project page candidate; no content retrieved. |
| 6 | Physical: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGQLdz8jJBaljlG2wKX7KNS60hUQAWuoxGSg7LnfqLAsabGVBke9EdBhSiuIJO3Vf1IjWL4_9R6uMWzyBdl9GHxUGS5KE_-n4VszdjCDd0oJ2bAQSqq71jmjaDue0TlUmeA9HdZDtrdiuBDqW-Ugq51fMtvkrNkoFpF4_GBIJrcLxkWF5dxYDYeWc4gVCG9bRHDBT9hvJvLJPofM_ybHA5--rUZzuABmxEEImvnmE4ibZkP6A==`; resolved target unavailable | Blocked `private-destination`; target/relevance unknown. |
| 7 | Physical and source-record original: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFq-KcnoOm3Jx3fuZon9hAt_zi-1zWJkvG3Lfh_Qm-oMzdpNp6GlwkSNZCN7UPtn46gBTHj5mqiWZdE-1--NIKpfazrpGATrySms-7Oc4Pu9kuK6lbCV7duXYRFl96bDOZ1Yz4885hxScjpP2M0_dtM7L-hi54Y2w3jZw1zAzPpaFs1_WAbh_6l_EkpirTwgzQhYZBrRl2CCvATb2K8DK3T`; source-record resolved target: `https://www.databank.com/resources/blogs/building-the-future-inside-databanks-red-oak-campus-construction/` | Blocked `private-destination`. Official exact-project article candidate; no content retrieved. |
| 8 | Physical: `https://dallasinnovates.com/dallas-based-databank-closes-1-45b-financing-supports-data-center-project-in-red-oak`; source-record original/discovery URL: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGPmhTLey1TfaVmQs58jjyvBYDiH77WgYagolOB-HcHOh7Cs2QYsB5DlWT4P7E6Ir51XA7DUnfqNX-zybnnkHJNV082N4ZCsWFor9Yhpg1eviG8yJpXHfhfJ_V5wH4BKcZxEIrhhv8IK0OkKrv9bHA-mGb2dC3ev3bdb600xGDx-nHyk8Q3UAuJ7G6eYONCSE3XzmB63pgndFqnDUfBuzr5bg7wt5MVSg==`; source-record resolved URL adds trailing `/` | Accessible/retrieved HTML candidate; saved identity unknown; passage and claim mapping absent. |
| 9 | Physical and source-record original: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFIdycvhrGDSYYdfuCckNApzuLJxO15XUuCwY2bqP-vTDietZyEPZWbS3wZKSnq4LCWZLkSG3Z72t5JuXWkzjyPemY3SpWKPCBS6StF_XHIfuT9lErfO5YnDEWUTFgL7D83vu2EJldifBFPZlHDaOEUCpdWInUdZricTLiHSfztamozVk33uFHcOzpdrbU=`; source-record resolved target: `https://www.databank.com/resources/videos/inside-databanks-red-oak-campus-data-centers/` | Blocked `private-destination`. Official Red Oak video candidate; no content retrieved. |
| 10 | Physical: `https://www.theaiconsultingnetwork.com/blog/databank-2b-red-oak-dallas-data-center-oracle-cre-investors-2026`; source-record original/discovery URL: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHzr5HZ-vuYNlbye-0dqGQZuPdVa7WIVQBa_Dnahf4De_Edveurx0EJsxHXECd46HH9jTyiFnx2DXkukrMT0qiKeC_Nib-VTMLNUdULuauDJN04jL-TUM6yPBP1i4X3OP6yEEXlCyEmg5W2HQzcCllJwmeGIm99i9GKmsBxNgbXA0dK8o_a2dBprA5AK3x0BBUATlwxeVFzpcIAO_B6a9pVzSM=` | Accessible/retrieved HTML. Secondary-reporting candidate; retained passage has both figures, but saved identity is unknown and original provider claim mapping absent. Offline replay separately passes identity. |
| 11 | Physical: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGLfijcqZoZ1SU09IxOQ3zIntxMKnvmRpAbD0ydoWsSPQ91IXo0LIejZnUPoIDNz0OTGFO1EyYW8DV8gn7cCHz-tIJ6SKOu3Wh1T6Znn5KL8sLjtLvNr0sEJ-3MjTJk9xF17K38VTQHR4jogq_O_ciSTW6qZ2Hyx8TnHogkkD9fYEJUjw0IaW-Vqxj8jQ5pV_oEWJFwEo20TjxcHaO2iKJdry2HX1pydhs=`; resolved in source record: `https://www.costar.com/article/2064534335/databank-lands-its-biggest-construction-loan-yet-for-dallas-data-centers` | Blocked HTTP 403. Exact-project candidate by resolved URL/title only; no content retrieved. |
| 12 | Physical: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQF43sG-zEauu6VvP36BsrDQDLiDOd149dXpektfsMVHnILS3EIkgj-j1Sg2VA33g59_AYNQ0D5tWFd4fzCDMcIVjdxTLPcr62G7w3Td5HvsUD5GXBIfLB5QAHzBiNcPo2FTKSle83HuQ0CdbRNsAZbZl72imlnmx46qMHL_`; resolved in source record: `https://www.datacentermap.com/usa/texas/dallas/databank-dfw11-red-oak/` | Blocked HTTP 429. DFW11 candidate by URL/title only; no retrieved content. |
| 13 | Physical: `https://citizenportal.ai/articles/6693997/texas/ellis-county/ellis-county-adopts-new-tax-abatement-guidelines-sets-50-million-threshold-for-new-projects`; source-record original/discovery URL: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGqhk7UksRtDaE7-CRpEqxW_t5-A0VKZ9dBvlAO6cth2JsLgeCdBNanb6ilgGiQiC7W3vutrOMxctM8JVF_f5VktD_3TG3CO3V5NBGNitzHKFx4AYCDNZ6hwLRRTc219Z5czHiv28WW1VbLzgYHgCcBLQYObKhK9Y8QWSGNs6VmMdgAStnpJaiyGFVKvEYa-0CfhA_KNXCDpYaSf0keP_bTIvYG2G78ChI5hly5MZ-tmSAFKl00KQCRl1E2ZYN0q2lzfbxlK_SlQ0feONoDETc=` | Accessible/retrieved HTML. County tax-abatement candidate; campus relevance is unestablished and passage not preserved. |
| 14 | Physical: `https://www.credaily.com/briefs/red-oak-faces-data-center-boom-amid-resident-backlash`; source-record original/discovery URL: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQH-NtqZcj1sAb_zr3LenY80p2a2xnUuHBYCO7hlVTb0dJhawjvR4LMC0h2cqQkW269jI34qAwZvhwdlVPbO-HrZsJxeNF5_BR29P9G7Se0MCct-kgSZH8cYtiX86HtDDLVM427lpk004nN439AzD1K11AzzZgna0X6N3Zsv4x7CIqX3SdeAtVp_ViamIA==`; source-record resolved URL adds trailing `/` | Accessible/retrieved HTML. Red Oak reporting candidate by URL; saved identity unknown and no capacity mapping recorded. |
| 15 | Physical: `http://www.elliscountytx.gov/ArchiveCenter/ViewFile/Item/4224`; source-record original/discovery URL: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQF3I5q2mUFBBt5zIG2936hk6SG2rYYmCs3Nq0Nn9zd5TyCJTsH09evQGib74JqICG_n3ZMunnKcpZwEhgSXFnHTfw-_RPpegbmsHvLn0-Pb-NbUZiwA2vstmKsNt1AGBjAptyOtFWLzlg==` | Accessible/retrieved HTML but observed CivicEngage application error; not usable county evidence. Identity unknown. |
| 16 | Physical: `https://www.fox4news.com/news/red-oak-data-center-city-council-protest`; source-record original/discovery URL: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEvawryo7MtPVuqSFdF7XbOoR5Quz7o8yufjl5oSVYL7J2DRtcYVhCUmYv46eKxBlyzH2_pcUKs673tkSu9h6kl9L1QEkuoQhkzMKy3iHLRbU9bb9MsRPQ9trgL7aihxJaYvapLFyYcfPbZxnbeVlMhI_klCdQTBKrgvnoy` | Accessible/retrieved HTML. Red Oak/community candidate by URL; saved identity unknown and no claim mapping recorded. |
| 17 | Physical and source-record original: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGm8jurPGMZ2RXe2sp34kaOZTPwqLY7WLu0fwDQtWFjSuTMJta3EVHAxluM-WXorU8slKtX2Zbpv3T7NQavg49RzNkiUmCOIE0bdkGkWX4tPTVOwUFR2EPom1TXllMwdE8enn3NzjCE5WYrQc7kmJ_nOR4Sqh60BX-mDJ2IVa2gE5k24VQoxFlc2IoVI4kNaDgKOw==`; source-record resolved target: `https://www.dallasobserver.com/news/red-oak-data-center-meets-community-resistance-40674118/` | Blocked `private-destination`. Red Oak/community candidate by URL/title; no content retrieved. |
| 18 | Candidate/official attempt: `https://www.databank.com/resources/news/dallas-based-firm-lands-2-billion-construction-loan-for-data-center-campus/` | `fetch-error`, physical index 18. Company-loan candidate; facility/phase is not established by the URL and no content was retrieved. |
| 19 | Candidate/official attempt: `https://www.databank.com/` | `reused`, physical index 19. Original slot receipt/body is absent; page content and junk/relevance status are unknown. A homepage URL alone proves neither evidence nor junk. |
| 20 | Candidate/official attempt: `https://www.databank.com/sitemap.xml` | `reused`, physical index 20. Underlying receipt/body absent; content and junk status unknown. |
| 21 | Candidate/official attempt: `https://www.databank.com/feed/` | `reused`, physical index 21. Underlying receipt/body absent; content and junk status unknown. |
| 22 | Candidate/official attempt: `https://tdlr.texas.gov/` | `redirect-enqueued`, physical index 22. No resolved target/body is recorded; the root URL is not itself a project filing. |
| 23 | Candidate/official attempt: `https://tceq.texas.gov/` | `reused`, physical index 23. Underlying receipt/body absent; content and junk status unknown. |
| 24 | Candidate/official attempt: `https://tceq.texas.gov/sitemap.xml` | `fetch-error`, physical index 24; a separate water-category attempt for the same URL was budget-denied. No passage; do not infer page content. |

**Qualified 24-index count.** The task JSON directly lists physical receipt
outcomes for indexes 1–17: 10 blocked (7 `private-destination`, 1
`size-limit`, 1 HTTP 403, 1 HTTP 429) and 7 accessible/retrieved. Of those 7,
2 passages are identified as unusable (slot 4 corrupted PDF; slot 15
application-error HTML); the other 5 have accessible extraction receipts but
their full content is not present here. “Accessible” does not mean
exact-project evidence. Indexes 18–24 appear only through candidate lineage
and official-attempt statuses: 2 fetch errors (18, 24), 4 reused references
whose underlying receipt contents are unavailable (19–21, 23), and 1
redirect-enqueued index (22). These statuses account for 24 indexes, but they
are not 24 complete physical receipts. The 15 `openedDocuments` entries with
null URLs refer to prior indexes/reused receipts; do not count them as
additional opens.

**Candidate classification, not observed proof.** Slots 3, 5, 7, 9, 11, 12,
and 17 point by resolved URL/path at Red Oak or DFW11 but were blocked. Slots
4, 8, 10, 13, 14, 15, and 16 have accessible receipts; only slot 10's
capacity-bearing passage is present in the bounded extract. Slots 8, 10, 14,
and 16 are apparent Red Oak reporting candidates by URL, but their saved
`projectSpecificityState` is unknown; slot 10 separately passes offline
identity replay. Slot 13 is a county tax-abatement candidate whose project
relevance is unestablished. Slot 1's resolved media target is known, but its
project relevance remains unknown. Slots 2 and 6 have no resolved URL and
unknown relevance. Slots 19–23 have no receipt body here, so they are not
classified as observed junk or observed unrelated content.

**Discovered but not opened / denied at the ceiling.** Candidate-lineage and
official-attempt arrays explicitly record budget-denied URLs:
`https://puc.texas.gov/`, `https://tceq.texas.gov/feed/`,
`https://tceq.texas.gov/sitemap.xml`, and
`https://tdlr.texas.gov/sitemap.xml`. They are potentially relevant authority
domains or indexes, not identified Red Oak project filings.
`budgetSkippedLineage` is empty; no stronger exact-project URL is documented
as skipped.

## September 23 record: keep it separate

The checked-in
`diagnostics/databank-red-oak-single-shot-2026-09-23-summary.json` is an older,
separate single-shot run, not the September 30 failure cache. It records
16 physical opens and 8 remaining, no budget exhaustion, a 90-second deadline,
and timeout/provider failures. It states:

- displayed summary capacity 480 MW, provenance `ai-reported`;
- no retained physical passage mentioned 480 MW;
- a third-party retained passage states DFW9/DFW10/DFW11 total 180 MW for the
  first-three-building phase;
- 0 eligible evidence/proposals;
- only grid and electricity primary structured calls completed; other
  categories failed/cancelled or were not issued.

That diagnostic does not include the CivicEngage/corrupted-PDF pattern from the
September 30 21:59 record. Its budget was not exhausted; it is not evidence
that the September 30 24th slot allocation or content issue occurred in
September. Related September 18 live-validation diagnostics are also separate,
and their source SHA/private-destination analysis must not be attached to
either September 30 cache run.

## Bottom line and remaining blockers

- **480 MW:** the September 30 retained article passage exists. In the offline
  replay, identity passes; the repeated full passage first fails at ambiguous
  facility/phase scope. The isolated whole-campus quote resolves to all-phase
  IT load, but has no time period. Campus IT load has no matching current
  evidence ID, so it is not a financial proposal.
- **180 MW:** the retained phase passage exists. In the offline replay,
  identity passes; repeated 180 MW mentions leave full-passage scope unknown.
  The isolated dated sentence resolves to the first-three-building phase and
  `2026-04-21`, but capacity has no matching current evidence ID. It is not
  grid or backup-power evidence and cannot be promoted into either variable.
- **Historical identity metadata:** the saved source audit says unknown /
  unresolved; offline matching of the retained article passes. That historical
  field does not prove identity was the first failed gate in the run.
- **Junk:** before the working-tree change, the CivicEngage application error
  and corrupted PDF passed extraction/retention and could enter structured
  analysis. Current working-tree quality checks filter both, reject
  navigation/status shells, and quarantine bad cached passage evidence;
  see “Current working-tree fix status” above.
- **Budget:** the bounded extract names all 24 indexes, but only slots 1–17
  have direct physical-slot URL/outcome arrays. Slots 18–24 are represented by
  candidate-lineage/official-attempt states, not complete physical receipts.
  Slots 2 and 6 have unresolved targets; the candidate URL actually attempted
  is retained. Several additional authority candidates were budget-denied.
  No allocation change is proposed here.
- **Provider claims:** two categories report four returned claims (grid) and
  two (tenant); no retained per-claim payload or trace identifies which claims
  they were or their first downstream rejection. Final evidence is all Missing
  Evidence, but that proves only the final result, not where each claim was
  refused.
- **Still blocking proposal:** both capacity claims are outside the modeled
  variables. The secondary article passes offline identity matching, but that
  does not establish independent source authority or make capacity a governed
  financial input. A different governed claim still requires a retained
  exact-project source, immutable quote/value-to-passage mapping, correct
  source class, matching facility/phase and time scope, semantic fit, and
  passing eligibility.
- **Implementation/validation status:** see the final validation below.
  No live research request or saved-cache/record write was made.

## Minimal fixes and files changed

All application paths below are relative to
`artifacts/safeloc-diligence-workbench/`.

- `src/data/researchContentQuality.mjs` and `.d.mts`: shared deterministic
  rejection of the exact application-error pattern, control-heavy decoded
  text, existing verification/JavaScript/paywall patterns, and narrowly
  anchored navigation/status-only text. No claim eligibility is granted here.
- `server/researchDocumentExtraction.mjs`: apply quality rejection after
  adapter decoding, before passage retention; preserve content hash and reason.
- `server/researchProjectProxy.mjs`: apply the same quality boundary to
  retained receipt selection, structured category input selection, and
  containment of already-saved evidence. Original source-ledger receipts are
  unchanged; quality-rejected mappings cannot activate proposals.
- `src/services/researchProjectService.ts`: exclude unusable saved passages
  from retained findings and usable evidence sources. Count quality exclusions
  and their reasons separately from inaccessible sources; preserve the raw
  source ledger and never rewrite storage.
- `src/context/DiligenceContext.tsx`: also apply the shared quality boundary
  to browser-session restoration. Drop junk only from the in-memory restored
  findings passed to Project Reality and record exclusion counts/reasons.
  Response parsing alone did not cover this independent restoration path.
- `src/services/diligenceSessionRestore.test.ts`: load the exact saved
  CivicEngage and corrupted PDF fixtures alongside a legitimate finding;
  assert only the legitimate finding reaches restored project state, both
  reasons are audited, and stored session bytes remain unchanged.
- `server/researchDocumentExtraction.test.mjs`,
  `server/researchProjectProxy.test.mjs`,
  `src/services/researchProjectService.test.ts`: exact-pattern adapter,
  grounded orchestration, legacy saved-content, immutable receipt, and
  containment regressions.
- `server/redOakClaimTrace.test.mjs`, `server/fixtures/red-oak-retained.txt`,
  `server/fixtures/red-oak-quality.json`: unchanged bounded retained article
  and serialized error/corruption passages, exercised through production
  extraction/identity/scope/mapping/eligibility/client proposal boundaries.
- `package.json`: include the new claim-trace regression in the package
  offline suite so it is not silently omitted.
- This report and
  [the detailed offline claim trace](../artifacts/safeloc-diligence-workbench/docs/red-oak-claim-trace.md).

### Concurrent changes visible in the complete diff

The final integrated tree also includes separately merged opened-dossier UX
changes in `src/pages/AnalysisWorkbench.tsx` and
`src/components/conference/MarketExposure.tsx`, related
`tests/canonical-dossiers.spec.ts` / `tests/home-redesign.spec.ts` assertions,
and an offline `server/googleGroundedDiscovery.test.mjs` fixture correction.
Those were not Red Oak diagnosis repairs. In particular, canonical dossier
**presentation did change concurrently**; the claim here is only that this
diagnosis did not alter canonical dossier stored data or governing rules.

There was no demonstrated completed-provider-claim loss to repair; missing
historical payloads are not evidence of a code loss. No extraction ambiguity,
identity rule, phase/time rule, governed evidence ID, financial model,
acceptance rule, security transport, provider budget, physical-open scheduling,
24-open ceiling, canonical dossier stored data, or deployed data was changed
by the diagnosis repairs.

## Final validation

Commands were run offline with fixture transports/providers and temporary
test cache directories. No additional live run followed.

| Check | Result |
|---|---|
| Focused extraction/proxy/client regressions | 191 passed, 0 failed |
| Focused full-article claim trace | 2 passed, 0 failed |
| Final integrated package `pnpm test`, including saved-session restoration | 444 passed, 0 failed |
| Initial pre-merge diagnostic package run | 443 tests: 442 passed, 1 failed |
| Unchanged initial revision baseline in isolated archive | 434 tests: 433 passed, the same 1 failure |
| `node --test src/data/claimScopeExtractor.test.mjs src/data/researchClaimVerifier.test.mjs` (omitted by package wildcard) | 29 passed, 0 failed; unchanged baseline also 29 passed |
| `pnpm --filter @workspace/safeloc-diligence-workbench run typecheck` | Passed |
| `PORT=25519 BASE_PATH=/ pnpm --filter @workspace/safeloc-diligence-workbench run build` | Passed; existing large-chunk warning only |
| Final focused checks after correcting quality first-failure/state metadata and adding full-article extraction assertions | 5 passed, 0 failed |
| Saved-session reload regression with both exact junk fixtures and a legitimate finding | 1 passed, 0 failed |
| `git diff --check` | Passed |
| Managed workflow startup / Home screenshot | Running; Home rendered; screenshot browser logs show no application errors |

The initial unchanged-baseline failure was exactly:
`server/googleGroundedDiscovery.test.mjs`,
“runs one Google discovery request before structured extraction without OpenAI web tools”,
assertion “identity analysis must receive the retained synthetic passage”
at line 810. It also failed in the pre-merge diagnostic run. The concurrent
merge-gate change corrected this fixture; completion validation then reported
443/443 passing before the saved-session regression was added. The final
integrated suite above is 444/444 passing, and typecheck and production build
were rerun successfully after the restoration fix. Do not present the initial
failure as a current blocker or attribute the concurrent fixture repair to
the Red Oak content-quality changes.