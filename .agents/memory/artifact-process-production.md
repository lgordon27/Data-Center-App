---
name: Artifact process production
description: How to register a process-backed production service in an artifact manifest.
---

For a process-backed artifact service, use nested `[services.production.build]` and `[services.production.run]` tables with `args` arrays. Do not put a command string in `serve`; `serve = "static"` is only for static hosting with `publicDir`.

**Why:** The artifact manifest validator rejects command strings and deployment-target names in `serve`, even though the deployment documentation describes process-backed production services in general terms.

**How to apply:** When an existing static artifact gains a same-origin runtime route, validate a temp manifest that replaces the static serve/publicDir/rewrites block with build and run argument tables.