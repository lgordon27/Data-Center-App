# Current development proof ledger verification

**CURRENT DEVELOPMENT PROOF LEDGER VERIFIED**

## Authorization and target

The owner ended the historical Task #328 provenance investigation and explicitly
authorized establishing a new baseline on the current active development
database. This verification is not retroactive evidence of the earlier migration.

- Database: `heliumdb`
- Hostname SHA-256 prefix: `cac77afa`
- Full hostname SHA-256:
  `cac77afa6447276c543eb76ebefbc3ad54d5115f42df0ec4db4e3d29de3715da`
- Schema: `public`
- Search path, unchanged: `"$user", public`
- Effective schemas: `public`, with implicit `pg_catalog`
- Git SHA at baseline: `4abbf89684288b05f3c99295ea7363f474c33384`
- Migration: `0005_safeloc_proof_ledger.sql`
- Migration SHA-256:
  `fbba0688c460eb651b697c26d94de7e3ac72cb9d7d32ac922d91b5e5c40c5407`

The endpoint hash is not a platform instance ID. The owner designated this
current target as authoritative; no different database was selected or attached.

## Preflight

Passed before execution. Every proposed relation, index, composite type,
function and trigger name was absent. Existing dossier/audit columns, types,
nullability and primary keys were compatible. Their 3 dossier rows and 6 audit
rows were readable and fingerprinted before migration; only SHA-256 digests,
counts and schema metadata were retained, not row contents or identifiers.

The migration is additive: it does not drop, truncate, rename, update, delete
or rewrite legacy dossier/audit data. Its only drops target proof-specific
triggers that were absent. The decision table is created before its referencing
ledger foreign key. All statements are transactional.

Retryability is conditional, not unconditional: `IF NOT EXISTS` does not verify
preexisting table/index compatibility; `CREATE OR REPLACE FUNCTION` and trigger
replacement can change existing definitions. Future replay requires a new
collision/compatibility preflight and authorization. Trigger reference lookups
are unqualified and use default SECURITY INVOKER, compatible with this verified
public-only effective schema; this is not a certification for hostile
multi-schema roles or protection against privileged owners disabling triggers.

## Execution and commit

An initial explicit transaction rolled back when the temporary diagnostic
checker incorrectly expected the session index to omit `recorded_at`. A separate
rollback-only catalog inspection confirmed the migration correctly creates
`(session_ref, recorded_at)`, with no persisted proof objects or legacy-data
changes. Only the temporary checker was corrected; product code and migration
SQL were not edited. Both rollback outcomes are retained in the receipt.

The successful explicit transaction rechecked the target, absent objects and
baseline under SHARE locks on legacy tables, applied the unchanged migration,
and verified objects and legacy integrity before committing:

- Transaction start: `2026-10-01T18:54:00.434Z`
- Transaction end: `2026-10-01T18:54:00.881Z`
- PostgreSQL result: **`COMMIT`**

No migration runs at startup or on deployment were added.

## Post-commit verification

A fresh connection verified:

- 2 tables and all **32** migration-defined columns, types, nullability/defaults.
- 2 zero-argument, SECURITY INVOKER trigger functions.
- 7 indexes, including both primary-key indexes, with expected definitions.
- 5 enabled triggers with correct tables, functions, timing and operations.
- 11 validated check constraints, 2 primary keys and the decision foreign key.
- All pre/post legacy content fingerprints, schema fingerprints and counts match:
  **3 dossiers and 6 research-run audits, unchanged**.

**14 database smoke checks passed**: UPDATE/DELETE/TRUNCATE rejection on both
tables; anonymous, absent, unknown and scope-mismatched decision rejection for
accepted inputs; matching authenticated acceptance; and missing/cross-scope
supersession rejection plus valid same-scope supersession.

Smoke fixtures were isolated in their own transaction and ended with
**`ROLLBACK`**. Fresh row-count checks confirmed both proof tables remain empty.
Legacy hashes were rechecked after smoke rollback and still match.

## Regression and startup

| Check | Result |
| --- | --- |
| Workbench typecheck | Passed |
| Full provider-free workbench suite | 529 passed; 0 failed; 0 skipped |
| Proof-ledger/database diagnostics focused suite | 16 passed; 0 failed; 0 skipped |
| Database smoke checks | 14 passed, fixtures rolled back |
| Development version endpoint | HTTP 200 |
| Restarted development workflow | Running |
| Startup required-schema diagnostic | `complete`; `missingColumns: []` |

Tests used fixture/mocked providers, with database access flags and provider keys
removed from their processes. No live acceptance commands or browser journeys
were invoked.

## Durable receipt and boundaries

Receipt: `diagnostics/current-development-proof-ledger-receipt-2026-10-01.json`.
It contains the pre-execution baseline, target and migration hashes, git SHA,
transaction statement results and explicit COMMIT, object inventory, rollback
inspection, pre/post legacy digests, smoke results, regression counts and startup
confirmation. It contains no credentials, connection strings, or source row data.

Production was not accessed or modified. No attachment, runtime-managed
database variable, product code, proof contract, migration SQL, DNS/provider
behavior, or persistent proof data was changed. No deployment, Git push, or
Task #331 start occurred. The only schema mutation was the authorized
development migration.