# Red Oak live acceptance readiness report — October 4, 2026

## Verdict

**Stopped before live research; no live run was consumed.** The research-audit repository passed its transaction-bound readiness check, and offline report assembly passed. The required exact-content capture prerequisite failed: existing diagnostics preserve hashes and bounded excerpts, not exact retained passage bodies or actual final packet contents. The provider-original trace is also a bounded, sanitized structured snapshot rather than an exact copy of the full provider claim output. Running the authorized workflow without those records would make the required conversion trace unverifiable.

The useful, attributable, scope-correct finding target was **not evaluated and was not met**. This is a capture-readiness blocker, not evidence of a live discovery, admission, scheduling, provider, claim-validation, or presentation failure.

## Capture-readiness follow-up

The capture blocker described above is now addressed in the code; this follow-up did not start another live run. Exact-content capture remains off by default and requires the dedicated live canary opt-in plus `--capture-exact-content`:

```text
pnpm --filter @workspace/safeloc-diligence-workbench research:red-oak-grid-canary -- --live --capture-exact-content --gates <passed-gates.json>
```

- The capture shares the canary's UUID run ID and remains subject to its single-invocation-per-source-revision guard, one discovery request, one structured analysis call, eight document opens, and hard runtime deadline.
- The report includes a bounded read-back of the private JSONL trace. Captured stages include retained source passages, the actual issued category packet, raw provider claim text, parsed provider-original claims, and validated evidence.
- Each evidence record carries project, run, category, attempt, and source lineage where available. The parsed structured-claim record is labeled as a JSON serialization; the companion provider-output text record can establish unchanged SDK-provided text content, not raw network response bytes.
- The capture has 512 KiB per-text, 2 MiB per-record, and 32 MiB per-run limits. Redaction, truncation, dropped records, and write errors are explicit; sensitive structured fields and transport metadata are excluded.
- The report and capture files are written with owner-only permissions. Provider-free tests cover the report round trip, record bounds, redaction, lineage, read-back integrity, and temporary-test cleanup.

The flags authorize only local capture for that bounded canary invocation. They do not authorize or imply that a live run has occurred.

## Source and baseline

- Tested revision: `29e81e0fc6d072fab520f172f31c28403780a6f7`.
- Before any live-stage decision, `git status --short` showed only the supplied authorization file as untracked; the tracked diff was empty (`git diff --binary HEAD` SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
- Supplied authorization file SHA-256: `49338df5547b50f3f9040ad96cd9a87320035e7652d744c8a1cde34d613d4405`.
- Relevant 18-file workbench fingerprint: `7a66971f031004cc30e1e69557a368631820e22f0c90c2fdea076a693195b8c7`.
- Pre-run source identity (revision + tracked diff + untracked file contents): `0e28be2ddc7391e2b00f88fe50bab330c40957265a7bbaccc67eac68917619cb`. It was recorded before this report was created.
- The requested work is present in the tested source: Task #365 commit `f571e8e`, Task #366 commit `f47c202`, and the Task #368 report/controls at `29e81e0` are in the current history. The Task #360 result-presentation implementation is present in the pre-run tree: its `e94fa66` implementation and the later presentation handoff snapshot `76d3a87` are reflected in the current parent tree (the parent and `76d3a87` share tree `334d2ad5…`). No product code was changed for this readiness check.
- The unchanged historical test was run directly:
  `pnpm exec tsx --test --test-name-pattern='resolves the exact saved Red Oak announcement excerpt through shared identity policy' src/data/researchClaimVerifier.test.mjs`
  Result: **0 passed, 1 failed**, exactly as the prior report described. It fails with `ENOENT` for `diagnostics/red-oak-retrieval-canary-2026-10-01.json`. The fixture remains absent, the test file is unchanged, and no fixture was reconstructed.

The historical missing fixture is a separate baseline limitation. It is not the reason the current live workflow was stopped.

## Research-audit persistence check

Used the repository implementation with a transaction-bound client against the configured runtime `DATABASE_URL` (the running development workbench environment). A unique record was started, finalized, and read back through `createResearchAuditRepository`; the read-back confirmed project fields, final status, summary, audit, and completion timestamp.

- Sanitized readiness record ID: `77e760ae-7844-4b8b-9342-31b3d9b5d58f`
- Start/read/finalize/read: **passed**
- Cleanup: transaction rolled back; the probe was read again and confirmed absent.
- No schema changes, migrations, proof-ledger writes, or user-decision writes were performed. No database connection details were recorded.

## Capture and offline report checks

The existing facilities have useful lineage, but they do not satisfy this authorization's exact-content requirement:

- `researchFunnelDiagnostics` records passage hashes and lengths at selection stages; packet entries likewise contain passage hashes and lengths rather than packet text. Its provider events associate source hashes with run, project, category, and attempt IDs.
- `redOakClaimTrace` records packet hashes and passage excerpts capped at 500 characters, with an explicit truncation flag. This does not preserve the actual final packet.
- The request-local acceptance collector records a passage hash and at most a 1,500-character sanitized excerpt; its `captureStatus` explicitly says `no-full-document-payloads`.
- Provider-original records are parsed structured snapshots. Claim fields are bounded, and text is sanitized (including URL/credential/address redaction) and truncated at field limits. They are not an exact full provider-output capture.

These limits are visible in the existing implementations and their provider-free tests:

- [Funnel diagnostics](../server/researchFunnelDiagnostics.mjs) and [diagnostic tests](../server/researchFunnelDiagnostics.test.mjs)
- [Claim trace](../server/redOakClaimTrace.mjs)
- [Acceptance collector/report](../server/researchProjectAcceptance.mjs) and [acceptance tests](../server/researchProjectAcceptance.test.mjs)
- [Prior bounded conversion report](./safeloc-bounded-conversion-check-2026-10-03.md)

Offline checks passed without provider calls:

- `pnpm exec tsx --test server/researchProjectAcceptance.test.mjs server/researchFunnelDiagnostics.test.mjs` — **32 passed, 0 failed**.
- A synthetic `buildAcceptanceReport` was written to a temporary file and read back. JSON round-trip passed, a test URL token was absent from the file, file permissions were `0600`, and temporary output was removed. **0 provider calls**.

These checks establish safe offline report assembly/writing and verify the documented capture limits. They do not create or substitute for a live acceptance artifact.

## Per-category result

No custom-project form was submitted. There is no research run ID, final response, discovery output, or saved result screen.

| Category | Admitted passage / analysis state | Work issue state |
|---|---|---|
| Project identity | Not observed; not assessed | Not issued; stopped before the run |
| Grid | Not observed; not assessed | Not issued; stopped before the run |
| Construction and capital | Not observed; not assessed | Not issued; stopped before the run |
| Permitting and community | Not observed; not assessed | Not issued; stopped before the run |
| Water | Not observed; not assessed | Not issued; stopped before the run |
| Tenant and counterparty | Not observed; not assessed | Not issued; stopped before the run |
| Electricity | Not observed; not assessed | Not issued; stopped before the run |
| Climate and operational hazard | Not observed; not assessed | Not issued; stopped before the run |

These categories were not skipped because of run budget, deadline, cancellation, or provider failure; no run began. “No admitted passage” and “no findings” are not asserted as live results.

## Counts, presentation, and unevaluated stages

- Live research actions / provider requests / public-document opens: **0**.
- Observed live source count: **0**; no discovery occurred.
- Nonempty packets issued: **0**.
- Categories completed: **0 of 8**; category completion was not evaluated.
- Reviewable findings: **0 produced**; claim validation was not evaluated.
- Financially eligible candidates: **0 produced**; eligibility was not evaluated.
- Executed provider searches, token usage/reservations, source-ledger duplicates, and per-category retrieval/admission metrics: **not applicable or unobserved** because the run was not started. No planned query is reported as executed.
- No findings were accepted and no financial input changed.
- Project Reality and Advisor Brief, the default next action, source expansion, financial controls, model/scope gating, and desktop/mobile screenshots were **not evaluated against a saved live run**. No fixture screenshot is presented as a live result.

The actual failure demonstrated by this task is at **pre-run capture readiness**. Source support, passage loss in the live run, incorrect admission, scheduling, downstream validation, financial eligibility, and result presentation remain unevaluated.

## Repair status

The bounded, sanitized capture capability above is the recommended repair and has been offline-validated. No live run was authorized or attempted as part of this implementation. Any future run still requires passing current gates and the explicit `--live --capture-exact-content` flags.

No live research or UI changes were made in this follow-up.
