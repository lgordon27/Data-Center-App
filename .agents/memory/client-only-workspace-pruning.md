---
name: Client-only workspace pruning
description: The dependency and TypeScript reference checks needed when retiring backend scaffolds from a client-only workspace
---

When retiring backend and generated API packages from a client-only workspace, remove both the workspace package graph and every consuming TypeScript project reference before validating the frontend.

**Why:** A stale project reference can make both TypeScript and Vite fail while resolving a deleted package, even when the application source no longer imports it.

**How to apply:** Check package manifests, lockfile importers, workspace globs, root and artifact TypeScript references, and operational scripts together; then run the frontend build, not only the source typecheck.