# Multi-project research engine validation

## Final validation after the identity repair

Final deliverable: `attached_assets/reports/safeloc-multi-project-engine-validation-final.html`, superseding (not overwriting) the provisional five-run report. It embeds a losslessly compressed complete diagnostic bundle, including eight governed audits, browser captures, manifests and verification logs. Its HTML is under 5 MiB; compression round-trip and credential/opaque-path scans passed.

The user authorized three further single-shot confirmations, then explicitly approved a header-only exception for the fresh browser. Actual requests still omitted all canonical/currentEvidence/dossier baselines. All authorizations are consumed; there is no permission for further live work.

| Final confirmation | Request UUID | Run UUID | Server elapsed | Candidates → physical opens / unique receipts → usable sources → packet texts → declared candidates / traced records → identity-valid → eligible |
|---|---|---|---:|---|
| AWS | `f6cc8fe3-a28e-48a9-aff4-7cbb611db62e` | `1f639d46-5a48-495b-a49b-64ccdde1e062` | 38.529 s | 10 → 10 / 10 → 6 → 2 → 7 / 9 → 7 → 0 |
| IREN | `490a2bee-63e4-473d-98e0-6d7a98a2587f` | `528ea8f3-4603-43ac-9a99-cb8e60cca9d2` | 75.133 s | 11 → 24 / 12 → 4 → 0 → 3 / 10 → 0 → 0 |
| Vantage | `95b0f986-72cd-484c-8c08-e314ea6de063` | `b0793bef-1f71-4f88-96ba-1a0aa841ecb3` | 75.125 s | 11 → 22 / 11 → 4 → 0 → 3 / 8 → 0 → 0 |

Each request has exactly one governed run and one browser POST, zero research/status GETs, zero retries and zero fallback. Code/config stayed constant: source revision `aa72edc3f5189863cc8a3bc77985ce337c0d6107`, hash `1a93819fcb5a845e775c442fde995300684a2472bd639f78efce70b69a87b334`. Vantage's interrupted browser capture was recovered read-only; its server audit records no browser disconnection before finish.

Identity primary assessment completed in all three final runs; no TypeError/upstream identity failure recurred. AWS is Complete, IREN/Vantage Partial. Four captured final exceptions are deadline cancellations before provider issue, not the repaired query failure. Source-open non-retention: AWS 4/10, IREN 8/12, Vantage 7/11. Operator/municipal blocks, related campus/phase scope and unissued assessment remain genuine limitations; they cannot establish public-evidence absence.

Correction to the provisional scope funnel: positive standalone scope verification is **unavailable**, not zero. The trace records observed/rejected/unknown/not-evaluated, not a positive independent scope certificate. Project-specific retained-source denominator is likewise unavailable. Production Vantage final unique-open count is 12 versus 11 receipt-derived unique URLs; both survive in the report.

**Final verdict: ENGINE IMPROVED BUT STILL HAS A SYSTEMIC BOTTLENECK.** Single highest-value next product action: use provider-free production-path fixtures to make retained related-campus/phase context available to identity disambiguation without promoting it to exact-project evidence or eligible claims. Final IREN/Vantage retained eight usable passages but passed zero text to assessment. This is a conversion boundary to resolve, not a public-evidence negative.

The latest verification remains 661 full / 245 focused passing tests, zero failures/skips/cancellations, plus typecheck/build. No source code changed after those checks. Original 21 initial and 23 routing-confirmation capture hashes were rechecked intact. Final export also redacts opaque bare redirect pathnames, preserving semantics/order/identities and governed originals; its updated export hashes document that sanitation.

### Offline repair evidence

The first closure attempt was not accepted because zero eligible yield plus an unresolved internal conversion failure did not satisfy the original cross-project success gate. The five-run report below preserves that historical result; it does not describe a live confirmation of the subsequent repair.

An existing production-path fixture reproduced the original identity-category exception: `TypeError: Cannot read properties of undefined (reading '0')`, captured at category orchestration. The query builder expected `id` while planned categories expose `categoryId`; the identity follow-up therefore attempted financial-variable query construction. Normalizing the category identifier repairs this generalized defect. The fixture now verifies completed identity assessment bookkeeping while preserving generic-index exclusions. Direct identity follow-up regressions cover Texas, Georgia and Arizona.

The same work preserves the original exception name/message in bounded sanitized diagnostic records, without a stack or credentials. Negative provider-failure controls also exposed vacuous completeness for the identity category's empty modeled-evidence inventory. Explicit assessment failure now prevents that false Complete state, while successful acquisition remains distinct from analyzed/failed/not-analyzed-429 outcomes.

Latest checks: **661 full provider-free tests pass; 245 focused tests pass; zero failures, skips or cancellations; typecheck and production build pass**. Completed observed discovery with zero candidates now reaches its legitimate no-eligible result rather than an internal query exception. Unresolved identity permits the existing single bounded follow-up; no budget or retry policy was expanded.

The three separately approved confirmations above followed this repair. The highest-value next action in the historical report was repaired and confirmed, rather than deferred.

## Historical five-run verdict (superseded)

**ENGINE IMPROVED BUT STILL HAS A SYSTEMIC BOTTLENECK**

The unlabeled, exact-project retained-passage routing loss was reproduced offline and repaired without relaxing identity, source, scope or eligibility controls. Live confirmation improved assessment context and produced identity-valid records, but **all five runs produced zero scope-valid eligible findings**. Technical identity-category failures remain; these runs cannot establish genuine public-evidence insufficiency.

**Single highest-value next product action:** reproduce and repair the post-provider identity-category failure reported as “upstream” after a completed HTTP 200 assessment. Preserve the original exception/stage, distinguish technical failure from conclusive no-evidence, and use provider-free production-path fixtures before further approved paid work.

## Complete report and immutable evidence

The original five-run report is `attached_assets/reports/safeloc-multi-project-engine-validation.html`. The final eight-run report above supersedes its unresolved-identity next action and provisional scope counts. Both retain the original sanitized production evidence; neither supports an eligible-yield success claim.

Workspace diagnostic copies and SHA-256 manifests are in `diagnostics/multi-project-engine-2026-10-02/`. Original captures were preserved and their manifest hashes rechecked intact. This directory is intentionally ignored; the delivered report embeds those captures instead of depending on ignored workspace files.

## Matrix and run identities

All projects were selected through the normal Compute Atlas directory/workbench flow. Directory fields and supplied official URLs were discovery context only. No canonical project was a research target; no evidence was manually injected.

| Project | Operator / location | Project ID | Initial run UUID |
|---|---|---|---|
| AWS Butts County Campus | Amazon Web Services / Jackson, Butts County, GA | `aws-butts-county-ga` | `47383ee9-29ed-4a82-b387-e588f51c49e0` |
| IREN Sweetwater Campus | IREN (Iris Energy) / Sweetwater, Nolan County, TX | `iren-sweetwater-tx` | `97ab8e05-ef07-484c-bb3d-4b4eb16263f5` |
| Vantage Phoenix Campus | Vantage Data Centers / Goodyear, Maricopa County, AZ | `vantage-phoenix-campus-goodyear-az-az` | `b1aa9426-d6b2-49c8-9db9-f44c083b6856` |

Separately approved confirmations:

- AWS: request `9b885396-d9fb-4c3e-954c-b91e527349fd`; run `fb6d44a4-66c6-4692-9809-e062cb846a81`.
- IREN: request `fe6a2df0-182b-483e-8994-5d4ed15b8e23`; run `fa53edc1-623b-44b8-9086-e195aa8496db`.

Initial source revision `9c1ce1ee5d28c909981498b8c686c15f75768113`, working-tree hash `3d5118dc89190e981418c27f5531324f4aefae3f48777a943533faafc2a49a92`. Confirmation source revision `1440fc35417824edd0c90fd391242538ef37d01c`, hash `8fb4fd65887f9af0ae5234e323ee40bfffd7ba5ff0ee59cd3ff578fd491c87c2`; unchanged before IREN. Runtime/footer metadata retained the earlier served-build revision; that verification gap is explicitly reported.

## Measured funnels

| Run | Candidates | Physical authorizations | Unique opened receipts | Usable sources / retained passage hashes | Analysis packet text hashes | Provider-declared candidates / traced records | Identity-valid → scope-valid → eligible |
|---|---:|---:|---:|---:|---:|---:|---|
| AWS initial | 8 | 17 | 8 | 5 / 5 | 1 | 3 / 8 | 0 → 0 → 0 |
| IREN initial | 13 | 24 | 14 | 5 / 5 | 0 | 4 / 9 | 0 → 0 → 0 |
| Vantage initial | 12 | 22 | 12 | 5 / 5 | 0 | 5 / 8 | 0 → 0 → 0 |
| AWS confirmation | 9 | 9 | 9 | 6 / 6 | 2 | 7 / 7 | 4 → 0 → 0 |
| IREN confirmation | 12 | 12 | 12 | 4 / 4 | 1 | 7 / 10 | 4 → 0 → 0 |

Initial aggregate: 33 candidates, 63 physical authorizations, 34 unique opened receipts, 15 usable sources, 15 retained passage hashes, one analysis packet text hash, 12 provider-declared claim candidates, 25 traced records, zero eligible findings.

Traced records include Missing Evidence placeholders; provider-declared candidates are not verified facts. Packet clipping variants can produce multiple hashes from one source. Vantage's production unique-open metric says 13, while 12 final receipts carry an opened index. Cancelled initial AWS's final physical counter says zero despite 17 observed authorizations. Both discrepancies remain visible, not silently reconciled.

## Bottlenecks, repair and yield

1. **Exact-project context lost at unresolved citation routing.** Initial IREN retained five passages but issued four empty packets. The failing provider-free packet-boundary fixture now passes; live IREN sends one passage and records four identity-valid records. Recognized categories remain restricted. Generic unlabeled indexes and mixed water/grid negatives still pass. AWS already had one initial official-context passage; its confirmation adds exact-project context/clipping variants, not a falsely reported zero-to-one improvement.
2. **Identity category completion/outcome inconsistencies.** Initial IREN/Vantage and both confirmations have completed HTTP 200 identity assessments but an upstream Provider failure category. Initial cancelled AWS records Complete without completed category analysis. Exact exception/provider response content is unavailable; no speculative root-cause patch was applied.
3. **Bounded scheduling headroom.** Vantage recorded a 41,517 ms token-window wait; confirmation AWS recorded 38,311 ms. Unissued/canceled work cannot count as a negative search. Access blocks and opaque source ranking also reduce acquisition yield, but are distinguished from internal conversion failure.

Non-retaining **unique source receipt** rates: AWS initial 3/8; IREN initial 9/14; Vantage initial 7/12; AWS confirmation 3/9; IREN confirmation 8/12. This is not physical-hop waste. Physical-hop waste is unavailable because authorization and final document indexes use different units; no fabricated numerator is supplied.

Eligible findings per retained source: 0/5, 0/5, 0/5, 0/6, 0/4. Per unique analysis packet text: 0/1, 0/0 (undefined), 0/0 (undefined), 0/2, 0/1. No eligible source family or category contributed a finding.

Six recorded category timeouts occurred across initial IREN/Vantage. Initial AWS was canceled by browser worker reset at 59.950 seconds. Confirmation AWS reached the deadline despite zero categories labeled Timed out; IREN ended after 41.889 seconds with TPM/deadline-limited unissued work. The report separates these from actual completed analysis.

## Verification

- Complete provider-free suite: **659 pass, 0 fail, 0 skip, 0 canceled**.
- Focused funnel/ranking/extraction/verifier/identity/source-policy suite: **243 pass, 0 fail, 0 skip, 0 canceled**; overlapping subset, not additive.
- Targeted routing controls: **3 pass, 0 fail, 0 skip, 0 canceled**.
- Typecheck: **one command passed**.
- Production build: **one command passed**, existing large-chunk warning.
- Four intact browser captures: one research POST and zero research-status GETs per action; correct arbitrary identity, single-shot policy, user-action initiator, no `currentEvidence` or canonical baseline. Initial AWS browser response is unavailable; its governed audit was recovered read-only.
- Offline same-request replay/coalescing and explicit fresh retry identity passed; no paid duplicate request was sent just to test idempotency.
- Homepage screenshot readable, no manifestly broken app. Reviewer screenshots captured for both confirmations.

Normal ceilings were unchanged: 75 seconds, 24 physical opens, 16 provider requests, 80 candidates, ten/category, 32 tools, eight follow-ups at most one/category. Gemini discovery and OpenAI structured analysis used no fallback or corrective/client/failed-run retry. Only the two separately approved affected projects were confirmed; no additional run is authorized.

## Material limitations

This tested live providers through the development workbench's normal production engine path, not a published deployment. Initial AWS browser capture was interrupted. Initial browsers showed a default curated header; confirmations showed the prior arbitrary header while selecting the new target, although actual requests contained no canonical baseline. The literal initial browser precondition therefore was not fully met. Missing raw pre-extraction counts, date/facility/phase metadata, opaque query/source ranks and fine-grained generic rejection causes remain unavailable.

Shared existing categories do not exhaustively evaluate land/civil, financing or incentives/taxes. Unissued assessments, blocked pages and nominal No eligible evidence states are reported conservatively as incomplete, not non-public/not-applicable/no-qualifying-evidence findings. Original proof-ledger startup warnings were not repaired; governed research audit persistence succeeded. No deployment, Git push, migration, financial policy change, manual source injection or weakened evidence/safety control occurred.