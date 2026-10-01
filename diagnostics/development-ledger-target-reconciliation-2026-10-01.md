# Development ledger target reconciliation

## Subsequent authorized baseline

The owner subsequently declared historical migration provenance unavailable and
authorized a new migration on the current development target. That migration
has now committed and been verified. See
`current-development-proof-ledger-receipt-2026-10-01.json` and
`current-development-proof-ledger-verification-2026-10-01.md`.
This changes current ledger readiness, not the unknown historical outcome.
The blocked findings below describe the earlier investigation. Task #331 was
not started.

## Outcome: blocked pending prior target evidence

Read-only investigation completed on 2026-10-01 at approximately 17:52 UTC.
The current development endpoint lacks migration 0005's objects. The actual
target of Task #328's reported migration cannot be verified from the available
records. No connection correction is justified, and none was made.

This report does **not** certify that the ledger is ready for integration.
Task #331 was not started and must remain gated on verified ledger readiness.

## Current development target

| Observation | Fresh application connection | Development startup |
| --- | --- | --- |
| Database | `heliumdb` | `heliumdb` |
| Hostname SHA-256 prefix | `cac77afa` | `cac77afa` |
| Required public columns | 29 of 43 present; 14 missing | Same 14 missing |
| Current schema | `public` | Not emitted by existing startup logger |
| Effective schemas, excluding implicit | `{public}` | Not emitted |
| Effective schemas, including implicit | `{pg_catalog,public}` | Not emitted |
| Search path | `"$user", public` | Not emitted |
| Non-system schemas | `{public}` | Not emitted |
| Proof relations/functions, every schema | None | Startup checks required public columns only |

Fresh connection hostname SHA-256:
`cac77afa6447276c543eb76ebefbc3ad54d5115f42df0ec4db4e3d29de3715da`.

This is an **endpoint fingerprint**, not a platform database-instance ID.
The workflow and fresh connection agree on the observable endpoint/database
pair. That does not establish historical instance continuity: a reset or
replacement could retain an endpoint, and a database name is not an instance
identity. No verified platform instance ID for the prior target was available.

The fresh application connection used the existing runtime attachment opaquely,
with `BEGIN READ ONLY`, a five-second local statement timeout, catalog-only
SELECTs, and `ROLLBACK`. It reported `transaction_read_only = on`.
An independent development-only platform query returned the same database,
schemas, search path, and absence of proof objects. It did not expose a platform
instance ID, so it cannot identify the prior migration target either.

### Missing required public columns

```text
proof_ledger_events.event_id
proof_ledger_events.event_type
proof_ledger_events.payload
proof_ledger_events.policy_version
proof_ledger_events.project_id
proof_ledger_events.recorded_at
proof_ledger_events.schema_version
proof_ledger_events.scope_key
proof_ledger_events.scope_kind
proof_user_decisions.actor_kind
proof_user_decisions.decision_id
proof_user_decisions.project_id
proof_user_decisions.schema_version
proof_user_decisions.session_ref
```

Catalog inspection across **all** schemas found neither relation
`proof_user_decisions` / `proof_ledger_events`, nor function
`safeloc_reject_proof_history_mutation` /
`safeloc_validate_proof_event_references`.
The 29 other startup-required columns are present; that is not a full structural
audit of those tables. Since the two proof relations themselves are absent,
this is not simply missing columns hidden by the search path.

## Prior migration evidence examined

| Record | What it proves | What it does not prove |
| --- | --- | --- |
| `2f108b951c4a26c3fc0a7aa8a7c31f1430bcd767` | Proof contract, migration SQL, repository and fixture tests were authored | SQL executed against an identified development instance |
| `8ec6a1b969f63fc298c479010da992c34399c42e`, titled “Verify SafeLoc proof ledger migration on development database” | The merged code contains the migration and contracts | The title is not an execution receipt; no target identity or SQL execution result was committed |
| `42de2c728c49d8d87d4e0b1b1192e9fd10cd8728` and `340b3dd73181233d7e31a5fb10f935569bb1178e` | Attached completion assertions say Task #328 was verified | Neither assertion includes a migration target or execution receipt |
| `server/proofLedgerRepository.test.ts` migration fixture | Migration text contains expected constraints/triggers | Fixture validation is not a live migration execution |
| `docs/safeloc-proof-contract.md` | Migration is not run automatically and must precede persistence | The migration was actually applied in this environment |

The two completion assertions are retained in
`attached_assets/Pasted-Task-328-is-verified-and-complete-on-main-at-2f108b951c_1790871080893.txt`
and the duplicate ending `1790871090008.txt`.
Search covered relevant git history and refs, attached text assertions,
project task specifications, diagnostics/docs, and saved development startup
records. No qualifying migration receipt with prior target identity was found.

**Comparison result:** current endpoint/database and object absence are verified;
the prior migrated instance is unknown. It is not possible to classify this as
an isolated task database, different endpoint, reset/replacement, or an
incorrect migration report. Those remain hypotheses, not findings. Identical
`heliumdb` names, if present in a future receipt, will not resolve that question.

## Validation performed

- Started the existing managed workflow
  `artifacts/safeloc-diligence-workbench: web`; it is running.
- Development startup emitted `requiredSchema: 'missing'` for `heliumdb`,
  fingerprint `cac77afa`, with exactly the 14 columns listed above.
- Fresh read-only application connection and independent development platform
  catalog query confirmed the schema/search path and absent proof objects.
- Focused offline diagnostics:
  `pnpm --filter @workspace/safeloc-diligence-workbench exec tsx --test server/db.test.ts`
  — **3 passed, 0 failed**. These cover hostname-only hashing, sanitized missing
  schema logging, and fixed warnings that do not expose connection errors.
- No live ledger persistence test was run: writing proof rows is outside scope.
  Fixture success is not represented as database readiness.

## Missing evidence and next safe action

Obtain the original development migration execution receipt from the Task #328
execution records or a platform record identifying its database instance and
attachment history. The evidence must tie together:

1. The development environment and stable platform instance identity (or a
   verified mapping from the migration endpoint to that identity).
2. Execution time, migration file/checksum, and successful execution/verification
   results for both proof tables and both functions.
3. The intended development attachment and whether that already-migrated target
   still exists and is accessible.

Provide sanitized identifiers/receipts, **not credentials or connection strings**.
Then compare the identified target with the current attachment. Only if the
intended, already-migrated development target is proven and accessible may a
supported platform attachment correction be considered. Runtime-managed
database variables must not be manually overwritten. After any authorized
correction, repeat fresh read-only metadata checks and development startup
diagnostics before treating the ledger as ready.

If the receipt cannot be recovered or no intended migrated target can be proven,
keep the discrepancy blocked. Applying a migration would require a separately
authorized task; it is not a permissible substitute for identifying this target.

## Change and safety boundaries

Only this diagnostic report and project-memory guidance were added. Product
code, contracts, migration SQL, persistence semantics, artifact configuration,
and database attachment were unchanged.

No migration replay, schema repair, database copy, ledger mutation, production
database access/configuration, provider/document request, DNS change, deployment,
or Git push was performed. The existing all-answer DNS rejection is unchanged.
No downstream integration task was started.