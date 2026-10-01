---
name: One-shot canary persistence
description: Reliability guidance for bounded live canaries protected by a single-invocation guard.
---

For a one-shot live canary, persist sanitized request, discovery, open, identity-gate, and provider-call telemetry as soon as each stage completes, before later report assembly or client parsing. Validate every report variable reference using an offline end-to-end run with mocked providers before consuming the live invocation.

**Why:** A report-assembly exception after a live request can discard in-memory telemetry. If a source-revision guard prohibits a second invocation, the live result cannot be recovered without violating the run limit.

**How to apply:** For any bounded live canary or production acceptance run with a no-retry/one-run rule, test the complete report-writing path offline and make failure reporting preserve the last sanitized checkpoint.