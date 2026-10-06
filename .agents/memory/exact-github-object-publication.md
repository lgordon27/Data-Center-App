---
name: Exact GitHub object publication
description: Safe fallback when normal Git push authentication is unavailable but the authenticated GitHub connector can publish.
---

When publishing an existing local commit chain through the GitHub Git Objects API, upload exact blob bytes, create each tree from its parent tree, and require returned blob, tree, and commit SHAs to match local before a non-force ref update.

**Why:** Durable shell callback output can normalize line endings, remove separators, and truncate long lines. Those transformations change Git object hashes even when visible text appears equivalent.

**How to apply:** Read raw Git blobs inside the authenticated execution boundary, preserve trailing commit-message LF bytes and identities, guard the starting remote SHA, and update the branch only after all exact hashes match.

Large blob exports from shell callbacks can be truncated even when a higher output cap is requested. Split base64 output into chunks below the callback limit, reassemble without text normalization, and require GitHub's returned blob SHA to match before creating the tree.

**Why:** A large source blob was shortened at the shell callback boundary and produced a different remote SHA; the exact-SHA check prevented publishing the incomplete object.

**How to apply:** For oversized blobs, export bounded chunks and verify the full expected base64 length before upload, then still compare the provider-returned Git blob SHA with the local object SHA.

For an empty commit, reuse the verified parent tree rather than sending an empty delta to GitHub's create-tree endpoint.

**Why:** GitHub rejects an empty tree-update request with “Invalid tree info,” although the local empty commit and its unchanged parent tree are valid.

**How to apply:** When the raw tree diff has no entries, confirm the local commit tree equals its parent's tree, then create only the exact commit object.