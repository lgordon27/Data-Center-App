---
name: AI research contract resilience
description: How to preserve a strict modeled-evidence contract without turning harmless empty AI fields into whole-project failures.
---

Require every modeled evidence identifier exactly once and validate classifications and numeric values strictly. If an AI response leaves a narrative field empty, use explicit unavailable/not-established language and classify unsupported claims as Missing Evidence rather than rejecting the entire research result.

**Why:** Structured output can still return empty strings for unavailable citations or descriptions. Rejecting the full response makes valid project research unusable, while inventing content would violate the evidence boundary.

**How to apply:** For custom project research, use a schema keyed by all required evidence IDs. Treat missing source support and empty narrative metadata as an explicit evidence gap; continue rejecting missing/duplicate IDs, invalid classifications, and malformed numeric values.