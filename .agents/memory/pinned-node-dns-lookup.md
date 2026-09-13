---
name: Pinned Node DNS lookup shape
description: Node HTTPS may request all-address lookup results even when SafeLoc deliberately pins one validated public address.
---

When a validated outbound document request supplies a custom DNS lookup callback, support both the legacy single-address callback and the `{ all: true }` array callback while returning only the already validated pinned address.

**Why:** In this Replit runtime, Node requested the all-address form. Returning the legacy shape produced `ERR_INVALID_IP_ADDRESS` with `Invalid IP address: undefined` before any HTTP response, making every otherwise valid source look like a generic network failure.

**How to apply:** Preserve public-address validation and DNS pinning, but branch on the lookup options and return an array containing the one pinned address when `all` is true. Keep the original transport exception sanitized and observable so future runtime changes are diagnosable.