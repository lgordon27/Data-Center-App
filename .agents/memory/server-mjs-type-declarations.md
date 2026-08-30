---
name: Typed server modules
description: TypeScript declaration convention for JavaScript server modules in this workspace.
---

When a TypeScript runtime or Vite config imports a server-side `.mjs` module, keep a matching `.d.mts` declaration sidecar with the exported contract.

**Why:** The package typecheck does not infer declarations for newly added JavaScript modules, even though the existing proxy modules are imported the same way.

**How to apply:** Add the declaration sidecar with the module when introducing a new `.mjs` server proxy or handler that is imported by TypeScript.