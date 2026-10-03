# False Project Identity Attribution Repair

## Outcome

The shared project-identity resolver now attributes owner/operator and location evidence only when it is connected to the requested project context. The claim trace uses the same sentence completeness and attribution rules as admission. Publisher/byline, navigation, grid-operator, and directory/index mentions are not promoted to project ownership or location conflicts solely because they occur in the same captured page.

The repair is conservative: it removes false conflicts but does not turn their removal into positive identity evidence. No replayed passage became exact-project, and none reached the prepared analysis packet.

## Replay provenance and method

- Input: the unchanged `attached_assets/reports/safeloc-multi-project-engine-validation-final.html` capture and embedded report bundle, read offline.
- Capture HTML SHA-256: `b368babb50a1ea3b823a5e96c64c1e6d5d7238f13693b89527bc7cc9c5ddc3b4`.
- Decoded bundle SHA-256: `c1a92ef53e0d8060ddb591ac215d381fe6568c93ddc7e21f73b62522bccd14a6`.
- The 11 available bodies were selected only after their actual text hash, retained character length, and source URL matched the historical lineage record. Every body was replayed through production `replayResearchCategoryPassageInput` for all eight categories.
- The three unavailable bodies—Credaily, Enverus, and Southland—were not reconstructed and received no admission result. Some retained receipt rows have text beside the recorded hash, but recomputing the body hash fails and the body lengths differ from the historical lineage (2,762 vs. 2,760; 4,002 vs. 4,000; 2,673 vs. 2,669). These are not treated as exact source bodies.
- No provider request, source refetch, deployment, or publication was performed.

## Before/after replay

For each row, the baseline admission outcome was exclusion before deduplication. The after outcome is the actual production resolver/admission result; all eight categories returned the same identity verdict and reason for that passage.

| Project / source | Passage SHA-256 prefix | Baseline verdict and reason | Repaired verdict and actual admission reason |
|---|---|---|---|
| AWS — Butts County ID | `5c3d8f3de1a4` | `unrelated` / `explicit-identity-conflict` — “Explore” became an operator and page headings became location conflicts. | `ambiguous` / `identity-not-established` — project text remains, but attribution to Amazon Web Services is not established. |
| AWS — About Amazon | `76f22a011a8e` | `ambiguous` / `identity-not-established` — no requested name or alias; Georgia was the only location match. | `ambiguous` / `identity-not-established` — insufficient project-specific context. |
| AWS — DC Atlas | `70ade4d7d8d1` | `unrelated` / `explicit-identity-conflict` — “Announcement” was promoted to an owner/operator and directory text produced unrelated locations. | `ambiguous` / `identity-not-established` — project text remains, but AWS attribution is not established. |
| AWS — Barnesville | `ed2bbcf4e1d4` | `unrelated` / `explicit-identity-conflict` — Douglas County conflicted with Butts County. | `ambiguous` / `identity-not-established` — project text remains, but AWS attribution is not established. |
| AWS — W.Media | `96ea2e379a9f` | `ambiguous` / `identity-not-established` — an AWS actor signal existed, but the requested project/operator link was not established. | `ambiguous` / `identity-not-established` — AWS attribution is still insufficient. |
| IREN — Northwise | `48f2c2ac28a4` | `unrelated` / `explicit-identity-conflict` — publisher/byline text and “GW” were promoted to owner/operator actors. | `ambiguous` / `identity-not-established` — IREN attribution is not established. |
| IREN — ElectricChoice | `5e7c0adba59c` | `unrelated` / `explicit-identity-conflict` — no requested name or alias; unrelated Texas-wide county entries created location conflicts. | `unrelated` / `explicit-identity-conflict` — the passage still does not identify the requested name, alias, or operator. |
| IREN — W.Media | `1c1ac3e09e7b` | `ambiguous` / `identity-not-established` — ERCOT’s grid-operator role was traced as owner/operator. | `ambiguous` / `identity-not-established` — IREN attribution is not established; ERCOT is not attributed as project operator. |
| Vantage — Corgan AZ1 | `ae69bd1ace16` | `ambiguous` / `identity-not-established` — Corgan navigation was correctly excluded as an operator, but “Project Stats Location Goodyear” became a location conflict. | `ambiguous` / `identity-not-established` — Vantage attribution is not established; the unrelated location conflict is removed. |
| Vantage — AZ2 directory | `446beeee1bb7` | `unrelated` / `explicit-identity-conflict` — address, directory actors, and many unrelated index locations generated conflict signals. | `ambiguous` / `identity-not-established` — the requested Vantage operator is not established; no false actors or location conflict remain. |
| Vantage — Atrium | `c354987dc9c8` | `ambiguous` / `identity-not-established` — “Data Center Dynamics” was parsed as a city and Texas as a location conflict. | `ambiguous` / `identity-not-established` — Vantage attribution is not established; unrelated location conflicts are removed. |

Across 88 occurrence/category decisions, all 11 bodies remained excluded before deduplication: 10 were ambiguous/identity-not-established and one remained unrelated/explicit-identity-conflict. Every replay returned `prepared-but-not-issued`, zero supplied passages, and a null final passage hash. No passage reached deduplication, windowing, token fitting, provider issue, or the prepared analysis packet.

Five prior `unrelated` verdicts were corrected to `ambiguous`; none became exact-project. ERCOT’s false actor attribution and Corgan’s false location conflict were removed without changing their already-ambiguous verdicts. Positive resolver controls still accept project-specific owner/operator and location statements with unrelated page noise, preserve genuine conflicts, keep AZ1 separate from AZ2 and Sweetwater 1 separate from Sweetwater 2, and preserve Corgan navigation as non-operator.

This is an identity-attribution correction, not an evidence-conversion gain. It creates no new eligible claim, finding, or analysis packet. The prior evidence-conversion report's finding and historical-linkage limitations remain unchanged.

## Source fingerprint

Working-tree source fingerprint: `33c03ed7081d99e4bec502cfa7e5a09ead7625c918a6353c5214c468ffbb0322`.

This is SHA-256 over the lexicographically ordered nine-file manifest: each workspace-relative path, a NUL byte, that file's SHA-256, and a newline. The manifest covers:

- `artifacts/safeloc-diligence-workbench/server/redOakClaimTrace.mjs`
- `artifacts/safeloc-diligence-workbench/server/redOakClaimTrace.test.mjs`
- `artifacts/safeloc-diligence-workbench/server/researchProjectProxy.d.mts`
- `artifacts/safeloc-diligence-workbench/server/researchProjectProxy.mjs`
- `artifacts/safeloc-diligence-workbench/server/researchProjectProxy.test.mjs`
- `artifacts/safeloc-diligence-workbench/src/data/researchClaimVerifier.mjs`
- `artifacts/safeloc-diligence-workbench/src/data/researchClaimVerifier.test.mjs`
- `artifacts/safeloc-diligence-workbench/src/data/researchIdentity.d.mts`
- `artifacts/safeloc-diligence-workbench/src/data/researchIdentity.mjs`

The earlier evidence-conversion report's `6cf15912…` fingerprint used a different, broader 15-file manifest; the two fingerprints are not directly comparable.

## Validation

- `pnpm --filter @workspace/safeloc-diligence-workbench run test:research-funnel` — passed, 254 tests.
- `pnpm --filter @workspace/safeloc-diligence-workbench run typecheck` — passed.
- `pnpm --filter @workspace/safeloc-diligence-workbench run build` — passed. Vite emitted its existing-size warning for the 1,029.54 kB minified main JavaScript chunk.
- `git diff --check` — passed.