---
name: Findings background lifetime
description: Admission ownership and deployment limits for detached findings research.
---

Findings research must hold public admission until provider work and retention settle, even after the start response closes. A deadline timer may abort work but must not independently release a still-running job's lock.

**Why:** The former admission lease was shorter than the approved findings deadline, permitting overlapping paid work. HTTP acceptance is not job completion.

**How to apply:** Keep targeted research behavior separate. The deployment service independently reported Reserved VM during this implementation; run polling is VM-local and restart loss must return unavailable, never silently relaunch. Before enabling Autoscale or multiple replicas, replace local status with shared audit-row status; do not promise execution survives instance termination.
