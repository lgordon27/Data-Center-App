# SafeLoc database and audit hardening

## Development schema reconciliation

The pre-migration catalog check was run against the authorized Replit development
database. It found exactly two missing schema objects:

- `public.proof_user_decisions` (table)
- `public.proof_ledger_events` (table)

No required columns were missing from tables that already existed. In particular,
the audit lifecycle columns `research_run_audits.started_at` and
`research_run_audits.finished_at`, all dossier columns, public safety tables, and
the research result cache were present.

Migration `migrations/0006_reconcile_proof_ledger.sql` creates only those two
tables, their indexes, the proof-history validation functions, and the append-only
and reference-checking triggers. It uses `CREATE ... IF NOT EXISTS`, checks
before creating triggers, and does not drop or rewrite data. It was applied
inside a transaction and applied a second time successfully.

### Sanitized development execution receipt

- Target: Replit managed **development** PostgreSQL
- Database: `heliumdb`
- PostgreSQL database OID: `16384`
- PostgreSQL cluster system identifier: `7679280397348728852`
- Server version: `16.10`
- Migration SHA-256: `006dcdc7540f3399e9a174f3dd50ad1d97b841f7cf2bca5980fad2ddc295b150`
- Committed at (database time): `2026-10-06 00:37:28.695211+00`
- Transaction result: `COMMIT` succeeded; the immediate repeat also committed
- Verification: both proof tables present, all expected proof triggers present,
  and a fresh catalog comparison reported `missing_tables=[]` and
  `missing_columns=[]`
- Persistence verification: test-only transactions write a user decision, an
  evidence event, an accepted-model-input event, and a research-audit row; they
  read the saved rows and roll back before releasing the development connection.
  No research request or provider call is made.

The database name, OID, and cluster identifier bind this receipt to the
development target; none of them is a connection string or credential. No
production database was queried or changed.

## Audit-download 500 diagnosis

Track C supplied the failing run ID `1791211785381-cqnc9h`. It is not a UUID,
while `research_run_audits.run_id` is a PostgreSQL `uuid` primary key. A
read-only query against the authorized development database using that value
reproduced PostgreSQL's `invalid input syntax for type uuid` error. That query
alone does **not** establish the reported 500's cause: the route at the starting
commit validated UUID syntax before calling the repository and returned 400 for
this value. The cast error could occur only if that validation were bypassed.

The available deployment logs for the reported cold-start period show `/`
health checks failing first with connection refused and then with repeated 500
responses. At the starting commit, startup awaited database diagnostics, the
stale-audit sweep, and route-app construction before calling `listen()`. A
request in that interval could not reach the audit handler; it failed at the
startup/proxy boundary instead of receiving an application response. This
pre-listener cold-start path is the supported cause of the bare startup 500.
The deployment logs do not include a request-level entry for the supplied audit
URL, so they cannot independently prove when that specific request arrived.
No production database was accessed.

The route now returns the same 404 JSON for malformed and well-formed-but-
unknown IDs. Database connection failures return a fixed 503 JSON body;
unexpected programming errors are rethrown so genuine post-readiness failures
remain visible. The early listener and readiness gate return retryable 503
responses before the route app is installed.

## Startup readiness

The HTTP listener starts before database probing, audit cleanup, and route setup.
Until those initialization steps finish, app routes return a minimal HTML 503;
API and release routes return JSON 503. Both include `Retry-After: 2`. The
`/api/health` endpoint returns `{"status":"not-ready"}` until the route app is
installed and then returns `{"status":"ready"}`. A failed transient database
connection is retried during startup. Once ready, unexpected route errors are
not converted into startup responses.

The existing startup sweep still marks stale, unfinished `running` audits as
interrupted. Its failure remains a fixed warning and does not hide errors from
normal requests.

## Applying the migration to production later

The SafeLoc server startup does not execute SQL migration files. The artifact's
configured production build and run commands only build the web bundle and start
the server; neither invokes a migration runner. Therefore
`0006_reconcile_proof_ledger.sql` is not applied automatically by the current
SafeLoc startup/publish path. No production action was taken for this task.

LeAndrew must obtain a separate production authorization before applying this
file. On an approved database-operator workstation, configure a protected
libpq service entry named `safeloc-production` in a `PGSERVICEFILE` with the
approved production host, database, user, and `sslmode=verify-full`. Do not put
a password in the service file, command line, repository, or chat. Use a
password prompt or an approved `PGPASSFILE` with filesystem mode `0600`.

First verify the selected target with the protected service configuration:

```sh
PGSERVICEFILE="$HOME/.pg_service.conf" PGSERVICE=safeloc-production \
  psql -X --set=ON_ERROR_STOP=1 \
  --command="SELECT current_database(), (SELECT oid FROM pg_database WHERE datname = current_database()), (SELECT system_identifier FROM pg_control_system());"
```

Stop unless the output identifies the production database LeAndrew separately
authorized and the change window is approved. Confirm the migration checksum
matches the reviewed file, then apply it as one transaction:

```sh
sha256sum artifacts/safeloc-diligence-workbench/migrations/0006_reconcile_proof_ledger.sql
PGSERVICEFILE="$HOME/.pg_service.conf" PGSERVICE=safeloc-production \
  psql -X --set=ON_ERROR_STOP=1 --single-transaction \
  --file=artifacts/safeloc-diligence-workbench/migrations/0006_reconcile_proof_ledger.sql
```

Finally, rerun the target-identity query and verify both proof tables, their
expected columns, indexes, and five triggers in that same production database.
Record a separate sanitized target-bound receipt. Do not use a development
connection for these commands, do not copy the production credential into the
project, and do not apply this migration without the later authorization.
