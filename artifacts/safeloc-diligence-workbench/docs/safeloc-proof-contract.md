# SafeLoc Proof Contract

Version 1 is the durable, scope-qualified boundary for evidence, search outcomes, project state, transmission proposals, accepted inputs, and user decisions. Contracts live in `src/model/safelocProofContract.ts`; append-only PostgreSQL persistence is provided by migration `0005_safeloc_proof_ledger.sql` and `server/proofLedgerRepository.ts`.

## Consumer interfaces

- Expected Evidence should key expectations and search assessments by the full `ProjectIdentity` (project reference plus explicit campus, phase, facility, or unknown scope) and one `SafeLocProofDimension`. Treat `SearchAssessment.state` and `resolution` as separate fields. Only a complete search may resolve as `searched-not-found`.
- Project-state consumers should append `project-state-change` events with a versioned `ProjectStateRecord`. `unknown`, `not-applicable`, and known values are distinct. Do not infer an early or lowest state from missing evidence; state is not source quality and later events may represent regression.
- Transmission consumers should accept source evidence IDs and produce `TransmissionProposal` records. `formula` is descriptive only. This contract has no probability field, financial mapping, executable formula, or arbitrary model effect. Only a separately accepted input may be recorded as `accepted-model-input`.
- Reviewer workflows should persist user choices in `proof_user_decisions`. Only an authenticated decision matching the same project scope may be referenced by a canonical accepted-model-input event; derive authenticated actor references from verified server-side auth, never a client-supplied identity. Anonymous choices carry an opaque, non-secret session reference (not a cookie or credential) and remain outside canonical project history.
- Keep `sourceQualityClassification` on the existing `Classification` vocabulary in `cashFlowEngine.ts`. For presentation only, the existing labels can be rendered as `Verified Evidence` → “Established”, `Management Assertion` → “Reported, not independently verified”, `Model Inference` → “Analyst inference”, `User Assumption` → “User assumption”, and `Missing Evidence` → “Open / missing evidence”. These are copy mappings, not stored values or a competing classification system; never use project-state values as evidence quality.
- `recorded_at` is the database knowledge-time boundary for historical projections. Source publication dates, evidence `asOfDate`, observation/effective time, and ledger recording time are different facts and must remain distinct.

## Boundaries for later work

This contract work does not implement expected-evidence rules, maturity inference, category ladders, transmission-to-financial mappings, reviewer UI, acquisition, retrieval, or provider calls. Later acquisition/retrieval work must preserve the existing boundaries and audit behavior in:

- `server/researchProjectProxy.mjs` — research orchestration and evidence normalization
- `server/researchAcquisitionRanking.mjs` — candidate ranking and open prioritization
- `server/researchDocumentExtraction.mjs` — document access and passage extraction
- `server/officialSourceDiscovery.mjs` and `server/googleGroundedDiscovery.mjs` — source discovery

The ledger is additive. Existing dossier and research-run audit records remain unchanged. Apply migration 0005 before enabling persistence in an environment; migrations are not run automatically by this contract module.