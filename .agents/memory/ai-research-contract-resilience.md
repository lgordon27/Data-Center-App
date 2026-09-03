---
name: AI research contract resilience
description: How to preserve a strict modeled-evidence contract without turning harmless empty AI fields into whole-project failures.
---

Require every modeled evidence identifier exactly once and validate classifications and numeric values strictly. If an AI response leaves a narrative field empty, use explicit unavailable/not-established language and classify unsupported claims as Missing Evidence rather than rejecting the entire research result.

**Why:** Structured output can still return empty strings for unavailable citations or descriptions. Rejecting the full response makes valid project research unusable, while inventing content would violate the evidence boundary.

**How to apply:** For custom project research, use a schema keyed by all required evidence IDs. Treat missing source support and empty narrative metadata as an explicit evidence gap; continue rejecting missing/duplicate IDs, invalid classifications, and malformed numeric values.

Second-stage evidence reassessment must carry the active project's identity and must not inherit curated-project events or facts.

**Why:** A generic assessment endpoint can otherwise produce a structurally valid classification grounded in the wrong facility, which is more dangerous than an explicit failure.

**How to apply:** Keep the provenance taxonomy shared, but build project-aware prompts. Apply curated temporal records only to their named curated case; custom projects are assessed solely from their supplied value and citation, with unsupported facility claims classified as Missing Evidence.

Custom research should use bounded evidence-domain retrieval, rank project-specific primary records ahead of secondary reporting, and preserve corroboration, conflicts, and failed search domains. Silence never establishes numeric zero or categorical none.

**Why:** One broad search can omit material regulatory records, collapse conflicting claims, and let a synthesis model turn non-mention into a modeled fact.

**How to apply:** Search identity, power/grid, environmental/land/water, and community/commercial domains separately; verify exact project identity; retain multiple claim-specific sources; and stage reviewer corrections until a human accepts them.

AI-reported project capacity must be normalized separately from its fallback and carry explicit provenance into underwriting and presentation. Behind-the-meter or other explicit zero findings must be recognized as supported when the source says so.

**Why:** A valid researched scale can materially change capacity-sensitive returns, while malformed scale or an unrecognized explicit zero can silently produce a misleading model or evidence gap.

**How to apply:** Accept only finite, positive, plausible capacity values; otherwise use the documented standardized default and label it. Preserve supported classifications when validated packet URLs are present, including explicit zero semantics.

Directory facts may ground project identity and capacity, but must not become modeled evidence. If AI research exhausts one timeout-only retry, the only safe fallback is an explicitly labeled default-assumptions case with every modeled item set to Missing Evidence.

**Why:** Directory metadata is useful for avoiding identity drift, but treating it as evidence would cross the discovery boundary. A partially researched fallback could silently change returns after provider failure.

**How to apply:** Send validated capacity, operator, status, and public directory URL as known context. Label directory capacity separately from AI-reported capacity. Preserve no AI claims after final failure; let human-accepted evidence update the case later.