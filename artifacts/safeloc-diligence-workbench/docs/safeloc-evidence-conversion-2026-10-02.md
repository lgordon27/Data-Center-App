# SafeLoc Evidence-Conversion Instrumentation and Offline Replay

**Date:** 2026-10-02  
**Verdict:** **MULTIPLE COMPARABLE BOTTLENECKS REMAIN**

## Summary

The saved run-level counters show only **2 of 14 retained-passage hashes analysis-ready** (AWS 2/6; IREN 0/4; Vantage 0/4). They do not identify which AWS occurrences supplied those two hashes, and the saved per-occurrence rows have no category or provider-response links. The separate scheduler audit reports **8/12 issued category calls with no passage text** and **4/8 category assessments completed**. These counts establish substantial pre-provider loss, but cannot be joined to the 14 source occurrences.

In a current-code, provider-free replay, all **11 exact-hash-verified passage bodies** were rejected at category routing/identity admission: **6 explicit conflicts and 5 identity-not-established**. The other 3 bodies are not replayable because the only captured receipt text does not match the recorded passage hash. Several current resolver traces expose page chrome, publishers, or unrelated actors attributed as owner/operator; this is evidence of an identity-attribution defect, not proof that every rejected passage is relevant.

Downstream, the saved capture contains **27 legacy structured-trace records** and **13 run-level provider-declared candidate counts**, but no immutable provider-original output. Of the 27 trace records, 20 first fail retained-source restriction and 7 fail source-backed classification for missing passage support. None yields an eligible finding. The capture does not establish which rows were substantive claims, placeholders, duplicates, or unsupported values, and it does not support a post-provider mutation percentage.

The pre-provider loss and source-mapping loss are both material in the available records, but their units and historical lineage do not permit a defensible single-stage winner. The scheduler audit strengthens the pre-provider concern; the schema audit says its 51 primary `claim-not-mapped` records first failed retained-source mapping, not schema coverage. Neither audit supplies the missing historical claim-to-packet link.

## Provenance and method

- The source was the original `attached_assets/reports/safeloc-multi-project-engine-validation-final.html` and its embedded bundle, decoded offline. The available manifest/export receipts passed **87/87 checks** (21 + 23 + 43). Neither original was modified.
- HTML SHA-256: `b368babb50a1ea3b823a5e96c64c1e6d5d7238f13693b89527bc7cc9c5ddc3b4`
- Decoded bundle SHA-256: `c1a92ef53e0d8060ddb591ac215d381fe6568c93ddc7e21f73b62522bccd14a6`
- The three final identity-confirmation captures all report historical source revision `d5d45341945e6a239fc87340f77a1c87e9f9eafe`. Their project/run IDs are AWS `1f639d46-5a48-495b-a49b-64ccdde1e062`, IREN `528ea8f3-4603-43ac-9a99-cb8e60cca9d2`, and Vantage `b0793bef-1f71-4f88-96ba-1a0aa841ecb3`.
- Current replay code is **not** that historical revision. Current Git `HEAD` is `31a6ce030e72e7b4e367448cc328dce59d997a72`. The current-source manifest fingerprint is `6cf15912a4f9a0c5503f48089b9ebe9020b5e0eda788e31eac4093eaf605dbff`, calculated as SHA-256 over the ordered 15-file path / NUL / per-file-SHA-256 / newline manifest. The manifest covers `researchFunnelDiagnostics.mjs`, `redOakClaimTrace.mjs`, `redOakClaimTrace.test.mjs`, `researchProjectProxy.mjs` and its declaration/test, `researchDocumentExtraction.mjs` and its test, `researchProjectAcceptance.mjs`, and the identity, claim-verifier, scope-extractor, and source-validation implementation/declaration files. It includes the current working-tree claim-trace test.
- The two parallel audits are treated as independent supplied findings. Their own source revision identifiers were not present in the saved bundle or handoff and remain **UNAVAILABLE**; they are not presented as if they ran on the current fingerprint.
- Replay called the production `replayResearchCategoryPassageInput` with the captured project identity and the eight production categories. Each available occurrence was tested against all eight categories. This made 88 occurrence/category decisions, all prepared-only and provider-free. No request was sent to OpenAI. Because every replayable occurrence failed before deduplication, no replay result is claimed for later deduplication, category windowing, token fitting, or provider issue.
- Full SHA-256 and retained length below are the values in the saved `passageLineage`. A body was replayed only when a saved source receipt matched both URL and exact hash. No body was reconstructed.

## Per-project funnel

| Final capture | Retained occurrences | Exact bodies verified | Run-level analysis-ready hashes | Per-occurrence provider issue link | Provider-declared candidates* | Legacy structured trace rows | First failure among trace rows | Eligible findings | Deadline cancellations before issue |
|---|---:|---:|---:|---|---:|---:|---|---:|---:|
| AWS Butts County | 6 | 5 | 2 | UNAVAILABLE | 7 | 9 | 7 source-backed classification; 2 source restriction | 0 | 0 |
| IREN Sweetwater | 4 | 3 | 0 | UNAVAILABLE | 3 | 10 | 10 source restriction | 0 | 2 |
| Vantage Phoenix | 4 | 3 | 0 | UNAVAILABLE | 3 | 8 | 8 source restriction | 0 | 2 |
| **Aggregate** | **14** | **11** | **2** | **UNAVAILABLE** | **13** | **27** | **20 source restriction; 7 source-backed classification** | **0** | **4** |

`Analysis-ready hashes` are the saved run-level counter, not an occurrence-level packet receipt. In all 14 legacy passage rows, `analysisCategories` and `providerResponses` are empty; the exact hashes actually present in individual OpenAI requests therefore remain unavailable. The supplied scheduler audit independently reports 8/12 issued calls without passage text. Do not combine those 12 calls with the 14 occurrences.

The saved runs record 8 requested and 8 executed category IDs each. AWS reports 1 complete and 3 conclusive-no-evidence outcomes; IREN and Vantage each report 2 conclusive-no-evidence outcomes. The export also records partial and technical-incomplete outcomes, which can overlap and must not be summed as mutually exclusive category counts. The scheduler audit's 4/8 completion measure is reported separately because category outcome labels and request-issue counts are not linked to passage occurrences in this export. The bundle records no TPM waits. Its timeout counts are 0 AWS, 2 IREN, 2 Vantage; the scheduler audit identifies the four IREN/Vantage cancellations as deadline cancellations before provider issue. Their passage overlap is unavailable.

## Occurrence-level current-code replay

The requested identities used by the shared resolver were AWS Butts County Data Center Campus / Amazon Web Services / Jackson, Butts County, Georgia; IREN Sweetwater Campus / IREN (Iris Energy) / Sweetwater, Nolan County, Texas; and Vantage Phoenix Campus (Goodyear, AZ) / Vantage Data Centers / Goodyear, Maricopa County, Arizona. The capture supplies no aliases or campus/facility/phase/building variants for these identities. For all 11 replayable occurrences, captured `categoryIds` are empty and facility/phase scope is null. Each was tested against all eight production categories; every decision was the same across its eight attempts. Each was excluded at category routing/identity admission, with final supplied length 0 and final hash null. Deduplication, windowing, and token fitting were not evaluated.

The table reports the saved `passageLineage.sourceFamily`; the separate source-metadata `sourceFamily` field is `other` for the 11 replayable rows and `unavailable` for Credaily. Both captured values are retained as distinct fields rather than reconciled by inference. For this replay only, `sourceId` and `occurrenceId` are the stable key `<runId>:<retained SHA-256>`; the capture itself did not supply that occurrence ID. Category attempts use the production category ID and `primary` attempt type.

The resolver inputs below include matched requested-name token counts, location matches/conflicts, and actor role/rule. Actor spans are bounded to the captured span; only short public-page excerpts are reproduced here.

| Project / retained URL | Retained SHA-256; chars | First current-code result | Matcher and routing inputs |
|---|---|---|---|
| AWS — government/regulator — `https://www.buttscountyida.com/` | `5c3d8f3de1a44ad51836f98d71b243b17b0037529e3237360494e96d30018ea4`; 1,985 | Identity admission excluded; `explicit-identity-conflict` / `unrelated`. | Requested-name match 2/3; Butts County and Georgia matched. Resolver attributed `explore` as owner/operator via `shared-resolver-assertedOperators` from the 26-character span `Explore Butts County&rsquo`. Secondary location conflicts were `Home Butts County` and `Explore Butts County`; these are page chrome, not project-location evidence. |
| AWS — operator — `https://www.aboutamazon.com/news/aws/aws-investment-georgia-ai-cloud-infrastructure` | `76f22a011a8e5ecd88cd1f6eb27f3efc856e1cef9350cb947c523a5a56874257`; 867 | Identity admission excluded; `identity-not-established` / `ambiguous`. | No requested-name or alias match; Georgia was the only location match; no actor attribution. Primary reason: insufficient project-specific context. |
| AWS — independent reporting/analysis — `https://www.credaily.com/briefs/amazon-web-services-invests-11b-in-georgia-data-centers` | `21411d0d0722273914950215829bf06a5bdd49d3469ae60f09bf2457addddfd1`; 2,760 | **UNAVAILABLE — not replayable.** | No receipt text matched both the recorded retained hash and length. No route, identity, or downstream result is inferred. |
| AWS — directory/aggregator — `https://dcatlas.io/en/explore/facilities/aws-gregory-road-data-center` | `70ade4d7d8d1f5e8f25ade8d64a802ffe5c197b5f129753fa12d126199e76339`; 1,827 | Identity admission excluded; `explicit-identity-conflict` / `unrelated`. | Requested-name match 3/3; Butts County and Georgia matched, while the resolver also derived “Announcement Butts County,” Douglas County, and Hinds County conflicts from directory text. `announcement` was attributed as owner/operator by `shared-resolver-assertedOperators` from a bounded span beginning `Source: epd.georgia.gov 7 January 2025 · Announcement Butts County…`; `aws cedar creek amazon aws` was separately classified contractor/author. These are not verified owner/operator assertions. |
| AWS — independent reporting/analysis — `https://barnesville.com/amazon-exploring-data-center-locations-on-huge-tract-it-bought-here-in-largest-real-estate-transaction-in-county-history` | `ed2bbcf4e1d45b5128da5f8ba5ebd32e9a88af6065646774e27fdff071f14db5`; 2,751 | Identity admission excluded; `explicit-identity-conflict` / `unrelated`. | Requested-name match 2/3; Butts County matched, but extracted location conflicts included Lamar, Monroe, Newton, and Douglas Counties. No actor was attributed. Primary reason names the Douglas/Butts county mismatch. |
| AWS — independent reporting/analysis — `https://w.media/aws-plans-new-data-center-in-georgia-usa` | `96ea2e379a9f64a9d617453a7c9acd9d6f915e60eee006e45811e2212985292b`; 1,856 | Identity admission excluded; `identity-not-established` / `ambiguous`. | Requested-name matches 2/3 and 3/3; Butts County and Georgia matched, with Covington, Douglas, and Newton conflicts. The shared resolver attributed `aws` as owner/operator from bounded spans including “City officials said the facility will serve a data center AWS is developing…”; despite that actor signal, the actual resolver did not establish the requested project/operator combination. |
| IREN — independent reporting/analysis — `https://www.enverus.com/blog/watts-next-for-iren` | `5ebcc3a738b07e7f60b9bf05e7aa1e20f7bce73b590cfd2a84c15c48c5a050dc`; 4,000 | **UNAVAILABLE — not replayable.** | No receipt text matched both the recorded retained hash and length. No route, identity, or downstream result is inferred. |
| IREN — independent reporting/analysis — `https://northwiseproject.com/research/iren-sweetwater-site` | `48f2c2ac28a4d45631033d3e075864675cefc86ac79952c7de16b41da4bddd11`; 4,000 | Identity admission excluded; `explicit-identity-conflict` / `unrelated`. | Requested-name match 2/2; Texas matched and no location conflict was returned. `northwise` was classified publisher/author, but “by Northwise Research Team” and `gw` were attributed as owner/operator by `shared-resolver-assertedOperators`. The resolver returned an operator conflict; the publisher/team actors do not establish IREN ownership. |
| IREN — independent reporting/analysis — `https://www.electricchoice.com/datacenters/texas` | `5e7c0adba59cc232ac20f38218c66db99612f8d0059fb42b967b1e5e3ffe79c7`; 4,000 | Identity admission excluded; `explicit-identity-conflict` / `unrelated`. | No requested-name or alias match; Texas matched, but the page produced eight county conflicts, including Dallas, Taylor, and Bexar. No actor was attributed. Primary reason says the passage does not identify the requested project. |
| IREN — independent reporting/analysis — `https://w.media/iren-granted-conditional-base-load-status-for-2-gw-texas-campus` | `1c1ac3e09e7be4aabf5ce24f9dee0e1be2b017cd52d07c1b04fe3f0e2ac2d5e6`; 2,772 | Identity admission excluded; `identity-not-established` / `ambiguous`. | Requested-name match 2/2; Texas matched, with no location conflicts. `ercot` was attributed as owner/operator by `shared-resolver-assertedOperators` from a bounded span about ERCOT's process. The actual resolver did not establish IREN as the requested operator. |
| Vantage — contractor/architect — `https://southlandind.com/project/vantage-az1` | `5b4cc2766a18c95304f145cda6a1105ae015d1692d86fcbb074486daa3b26ce4`; 2,669 | **UNAVAILABLE — not replayable.** | No receipt text matched both the recorded retained hash and length. No route, identity, or downstream result is inferred. |
| Vantage — contractor/architect — `https://www.corgan.com/projects/vantage-az1-data-center-campus` | `ae69bd1ace1663c463a6441f68a15ba0c9fe9b3968755f6ac695a2b054e3abe0`; 3,546 | Identity admission excluded; `identity-not-established` / `ambiguous`. | Requested-name match 2/4; Goodyear and Arizona matched in project context. “Project Stats Location Goodyear” produced a parser location conflict. `Corgan` was explicitly assigned `navigation-or-page-chrome`, with rule `rejected-navigation-page-chrome-not-operator-attribution`, `admittedAsOperator=false`, and exact 47-character span `Corgan Previous Slide Next Slide Close Projects`. |
| Vantage — directory/aggregator — `https://www.interconnection.fyi/data-center/project/vantage-data-centers-az2-69904f45` | `446beeee1bb7524c3c760bac6c73b37031f4b42bd0d8067c8a936e926e12551e`; 4,000 | Identity admission excluded; `explicit-identity-conflict` / `unrelated`. | Requested-name match 2/4; Maricopa County and Arizona matched, and the page is explicitly the separate AZ2 occurrence. The trace records 46 distinct location-conflict strings, many from unrelated state-index entries. Four actors from address, operator/menu, development-name, and grid-index text were assigned owner/operator roles via `shared-resolver-assertedOperators`; bounded examples begin “(AZ2) Status Proposed City Goodyear…” and “Alberta Electric System Operator…”. |
| Vantage — independent reporting/analysis — `https://atriumdata.ai/the-first-print/maricopa-data-center-lending` | `c354987dc9c8c8aef30cc92039a1d83945b4cc1c94b3c574926803e39f763bd7`; 4,000 | Identity admission excluded; `identity-not-established` / `ambiguous`. | Requested-name match 2/4; Maricopa County and Arizona matched, while “Data Center Dynamics” as a city and Texas produced conflicts. No actor was attributed. |

For the three unavailable bodies, retained hashes and lengths are preserved from the historical lineage row, but their source-receipt text did not verify; they have no current-code decision. “No category route” is not the reason for the 11 verified rows: each reached the shared identity resolver and was excluded by its actual resolver/admission result.

## Fourteen requested findings

### 1. IREN Sweetwater first loss

The three exact replayable bodies fail **category routing/identity admission**, before deduplication: two are explicit identity conflicts and one is identity-not-established. The retained run-level metric has 0/4 analysis-ready hashes. The `northwiseproject.com` page matches two requested-name tokens, but its trace attributes “by Northwise research team” and “GW” as owner/operator actors while separately classifying Northwise as publisher; the resolver returns an explicit operator conflict. The Texas-wide ElectricChoice page matches no requested name/operator and contains conflicting Dallas, Taylor, and Bexar county entries. The W.Media passage matches two name tokens but attributes ERCOT as owner/operator and does not establish IREN as operator. All have empty route IDs and no facility/phase metadata. Sweetwater Hub/1/2 are not separately represented in the captured scope metadata. The two deadline cancellations remain separate technical losses; neither can be assigned to one of these passages.

### 2. Vantage Phoenix first loss

The three exact replayable bodies also fail **category routing/identity admission**, before deduplication: one explicit conflict and two identity-not-established. The run-level metric has 0/4 analysis-ready hashes. The Corgan body contains AZ1 and AZ11–AZ14 references, but has no captured facility/phase route metadata and does not establish Vantage as owner/operator; the actual resolver records Corgan as `navigation-or-page-chrome`, not as an operator. The separate AZ2 page remains a distinct occurrence and is rejected; it is not merged with AZ1. The Atrium page has a Maricopa County match attached to project context, but the trace also finds unrelated city/state conflicts and no owner/operator actor. The Southland body is unavailable. The two deadline cancellations cannot be linked to these passages.

### 3. AWS Butts County loss points

The five exact replayable bodies fail admission before deduplication: three explicit conflicts and two identity-not-established. The run-level metric reports 2/6 analysis-ready hashes, but no occurrence-to-request link is available. AWS has 7 run-level provider-declared candidates, 9 legacy trace rows, and 0 eligible findings. Seven rows first fail source-backed classification with `missing-passage`, `claim-not-mapped`, and `not-project-specific`; two first fail source restriction because no retained source mapping exists.

The legacy `grid_interconnection` row has value `0 MW`, while its semantic-unit trace normalizes toward `months` and remains unresolved; its source validation reports missing passage, claim-not-mapped, and not-project-specific. It is **not a supported grid fact**. No retained-source claim mapping in the saved records establishes an eligible AWS grid value. Conversely, the retained passage hashes alone do not establish claim facts. One unavailable Credaily passage row carries seven evidence IDs, but it has no provider-response/category link and its body fails exact-hash verification; it cannot be treated as the claims' source.

### 4. Retained-passage exclusion before OpenAI

Historical occurrence-level exclusion percentage is **UNAVAILABLE** because the final bundle has no passage-to-category/request links. The run-level counter reports 12/14 retained unique passage hashes without an analysis-ready hash (**85.7%**), not 12 independently verified occurrence exclusions. In current-code replay, **11/11 replayable occurrences (100%)** are rejected before deduplication; **3/14 (21.4%)** cannot be replayed. These are different measurements and must not be collapsed.

### 5. Pre-OpenAI reason breakdown

For the 11 replayed occurrences, **6/11** resolve to `unrelated` / `explicit-identity-conflict` and **5/11** to `ambiguous` / `identity-not-established`. Across eight category attempts per occurrence, this is 48/88 conflict exclusions and 40/88 not-established exclusions; those are repeated category attempts, not 88 distinct passage losses. No occurrence reached deduplication, category windowing, token clipping, or provider issue. No current replay was classified as blocked, source-type-disallowed, or “other.”

Several conflict reasons show a real instrumentation-visible identity defect: the Butts County ID page attributes the navigation token `explore` as owner/operator and treats “Home Butts County” / “Explore Butts County” as location conflicts; the Northwise page attributes publisher/team text as owner/operator; the IREN W.Media page attributes ERCOT as owner/operator; and broad directory text on the AZ2 page yields unrelated actor/location signals. These observations do not prove the passages are project-specific or eligible, and no general identity-admission relaxation was made.

### 6. Structured candidates, no-claim outcomes, placeholders, and unsupported values

The historical aggregate reports **13 provider-declared candidates** (7/3/3 by project) and **27 structured trace rows** (9/10/8). No immutable provider-original JSON is embedded, so the exact number of substantive provider claims is **UNAVAILABLE**. The trace rows do not carry a reliable candidate-kind field, provider-original snapshot, or claim-to-attempt lineage.

The legacy rows contain 13 literal `Missing Evidence` values (AWS 2, IREN 6, Vantage 5), 10 numeric zeros (AWS 7, Vantage 3), and 4 other numeric/string values (IREN). These counts describe serialized legacy values only; without provider-original fields they cannot be cleanly divided into required placeholders, substantive claims, or unsupported generated values. Repeated `downtime_cost` IDs in AWS and Vantage are not sufficient to prove duplicate claims across category attempts. The 14 passage-row “no-claim/excluded” labels are not provider no-claim receipts: their provider response links are empty. Genuine no-claim, placeholder, duplicate, and unsupported-value counts therefore remain **UNAVAILABLE**. Provider-free fixtures test those distinctions but are not historical extraction evidence.

### 7. Post-OpenAI transformations and source/quotation mapping

No historical immutable provider-original snapshot exists, so changed/dropped field counts and the percentage altered by SafeLoc are **UNAVAILABLE**, not zero. The 27 legacy trace records show:

- **20/27** first fail `sourceRestriction` with `no-retained-source-mapping` / `claim-has-no-source-url` (IREN 10, Vantage 8, AWS 2).
- **7/27** first fail `source-backed-classification` with `missing-passage` (all AWS); the saved secondary reasons include `claim-not-mapped` and `not-project-specific`.
- `wrong-phase-or-facility` appears as a secondary AWS reason on 3 rows, not as three additional first failures.
- There is no per-claim sanitized receipt of the cited URL, canonicalization, quote containment, resolved source/occurrence/passage, source authority, or clause-bound value/unit/status. Missing URL is evidenced for 20 legacy rows; unresolved URL, absent/uncontained quotation, wrong retained passage, disallowed type, and unsupported quantity/unit/status cannot be separately counted from this historical bundle.

The independent schema audit found the same boundary in its own sample: all 51 primary `claim-not-mapped` records first failed retained-source mapping. Those were not 51 demonstrated schema omissions. That audit is supporting context, not a substitute for the missing provider-original snapshots in these three runs.

### 8. Identity failure causes

On current passage replay, the actual shared resolver returns 6 `unrelated` decisions and 5 `ambiguous` decisions with per-source primary and secondary reasons, matched name-token counts, locations/conflicts, and actor-role traces. Several explicit conflict traces include actors from navigation, publishers, a grid operator, or broad directory text; those are engine-defect signals, not valid owner/operator proof. The remaining ambiguous decisions lack sufficient exact-project/operator attribution. The historical claim records' normalized `exact-project`/`not-established` labels are not counted as resolver passes. Claim-level identity pass/reject totals from provider-original claims are **UNAVAILABLE**.

### 9. Scope failures

All three historical run summaries have `scopeValidRecords: null`. Legacy scope labels show AWS 6 observed / 3 rejected, IREN 10 observed, and Vantage 8 observed, but “observed” and `exact-phase`/`exact-facility` display values are not proof of a passed requested-scope comparison. On current replay, every occurrence stops before scope evaluation; scope is **not evaluated**, not rejected. Captured facility/phase metadata is null for the 11 replayable occurrences. Historical provider-original claimed campus, phase, building, parent/child scope and actual evaluator reasons remain **UNAVAILABLE**.

### 10. Eligibility outcomes

The saved run-level result is **0 eligible findings in all three projects**. The 27 legacy trace rows fail earlier at source restriction or source-backed classification, so they do not establish 27 eligibility rejections. Exact eligibility-evaluator pass/reject reasons and downstream containment outcomes are **UNAVAILABLE**. Current replay does not reach eligibility.

### 11. Corgan navigation-attribution regression

**The specific Corgan defect is fixed.** The provider-free regression reproduces “slide next slide close projects” and confirms navigation chrome is not promoted to an operator conflict. In the exact retained Corgan page, the shared resolver records Corgan as `navigation-or-page-chrome`, `admitted=false`; the page remains ambiguous because it does not establish the requested owner/operator. This corrects the false conflict without loosening general identity admission or changing the retained source text. Other actor-attribution errors discovered in the replay were recorded, not repaired in this task.

### 12. Facility and negative controls

The captured Vantage Corgan body contains AZ1 and AZ11–AZ14 text, but these are not separate retained occurrences or provider packet links. AZ2 remains its own URL and rejection; no AZ1/AZ2 merge was observed. IREN's captured W.Media body refers to Sweetwater campus context, but no separate Hub/1/2 facility scope was captured. Existing provider-free identity controls pass for AZ1 versus AZ2 and Sweetwater 1 versus Sweetwater 2. The current replay does not turn names, directory metadata, snippets, or location-only matches into evidence.

### 13. Top three measured loss points and effect of the parallel audits

Ranks are by directly measured attrition at each boundary; occurrence, category-call, and legacy-record denominators are not interchangeable.

1. **Pre-provider passage delivery:** the historical run-level counter has only 2/14 retained hashes analysis-ready (12/14 without one); the independent scheduler audit reports 8/12 issued category calls with no passage text. The exact source-to-call overlap is unavailable.
2. **Current identity admission:** 11/11 verified bodies are denied before deduplication on replay (6 explicit conflicts, 5 not established). Actor traces show false attribution signals in some conflict decisions; the other decisions remain insufficiently project-specific.
3. **Legacy source mapping:** 20/27 structured trace rows first fail retained-source mapping and 7/27 first fail source-backed classification; eligible findings remain 0/3 projects. The 27-row denominator is not a verified substantive-provider-claim denominator.

Task 358's 4/8 category-completion and 8/12 empty-call findings make scheduler starvation a measured pre-provider concern. The schema audit makes source mapping a measured post-provider concern and weakens the case for a schema-expansion repair. Missing provider-original output, per-occurrence request linkage, and non-comparable denominators prevent either audit from proving the sole dominant bottleneck. The strongest supported verdict is therefore **MULTIPLE COMPARABLE BOTTLENECKS REMAIN**.

### 14. One recommended repair task

**Stop issuing category calls with empty passage packets while preserving current budgets and fail-closed admission.** Add a bounded issue-boundary repair that checks the prepared packet immediately before provider issue, does not spend an issue slot on an empty packet, and records prepared / unissued / issued-empty / issued-with-text states against existing category, TPM, and deadline limits. Do not retry, raise limits, admit identity-uncertain passages, or treat empty packets as negative evidence.

This would target the independently measured 8/12 empty issue calls and make scheduling-versus-admission losses explicit on the next authorized run. It would not fix the current 11/11 identity-admission replay losses, establish whether any excluded passage is relevant, prove OpenAI claim generation, repair retained-source mapping, or recover the unavailable historical provider-original output. **No part of this repair is implemented here.**

## Validation

- Focused instrumentation / identity / passage-extraction / claim-verifier / source-validation / research-proxy suite: **252 passed, 0 failed, 0 skipped, 0 cancelled**.
- Full provider-free suite: **668 passed, 0 failed, 0 skipped, 0 cancelled**.
- Typecheck: **passed**.
- Production build: **passed** (1,749 modules transformed). Vite emitted an advisory that the minified main chunk is larger than 500 kB; no build error.
- Managed workbench restarted and the home page rendered in the smoke check; no research action was activated. Startup diagnostics reported missing development-database columns for proof-ledger and user-decision tables. No migration or live research was performed; this environment warning is outside this task's scope.
- Corgan, AZ1/AZ2, Sweetwater 1/2, packet non-issue, source mapping failure-kind, immutable provider-original, and explicit not-evaluated scope fixtures all ran provider-free. No live provider request or live research was initiated.

## Remaining evidence limitations

The three historical run summaries all have `scopeValidRecords: null`. The missing bodies (Credaily, Enverus, Southland) remain not replayable; no recovery or reconstruction was attempted. Historical exact OpenAI input snapshots, occurrence-to-request links, provider-original structured JSON, field-level transformation diffs, exact claim candidate kinds, scope-evaluator receipts, and claim-level identity/eligibility receipts are unavailable. The current replay is a current-code diagnostic over recorded identity fields, not a reproduction of the historical source revision. These limitations are part of the verdict, not zero-valued measurements.