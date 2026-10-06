---
name: Startup migration authorization
description: Owner-approved startup rollout boundary and PostgreSQL session-teardown caveat.
---

The owner explicitly authorized checksum-pinned, reviewed migrations at SafeLoc
startup, superseding the earlier manual-only rollout decision. This authorization
does not grant production access from the workspace, publishing, live research,
or permission to execute newly discovered migration files.

**Why:** The requested rollout must update the attached database on the next
user-initiated publish without manual SQL; the older database-hardening document
describes the previous authorization boundary.

**How to apply:** Keep SQL files immutable. Treat a baseline as observed schema
compatibility, never as proof of historical SQL execution. Review and explicitly
pin each future migration before permitting startup execution.

Destroying a PostgreSQL client is not proof that the backend immediately releases
its transaction and session advisory lock during an active statement.

**Why:** Real isolated PostgreSQL tests showed that an executing backend can
retain its lock until its statement finishes or times out after socket closure.

**How to apply:** Bound server-side statement execution as well as client waiting.
Treat bounded lock contention on another startup as a safe refusal, not as proof
of a leaked local client. Test eventual backend release using real transactions
and locks rather than assuming socket destruction is synchronous cancellation.
