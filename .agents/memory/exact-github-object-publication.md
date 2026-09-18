---
name: Exact GitHub object publication
description: Safe fallback when normal Git push authentication is unavailable but the authenticated GitHub connector can publish.
---

When publishing an existing local commit chain through the GitHub Git Objects API, upload exact blob bytes, create each tree from its parent tree, and require returned blob, tree, and commit SHAs to match local before a non-force ref update.

**Why:** Durable shell callback output can normalize line endings, remove separators, and truncate long lines. Those transformations change Git object hashes even when visible text appears equivalent.

**How to apply:** Read raw Git blobs inside the authenticated execution boundary, preserve trailing commit-message LF bytes and identities, guard the starting remote SHA, and update the branch only after all exact hashes match.