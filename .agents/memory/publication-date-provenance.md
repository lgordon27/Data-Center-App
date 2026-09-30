---
name: Publication date provenance
description: Keep source publication/reporting dates separate from retrieval time and claimed-period scope.
---

A publication date describes the source document. It is not its access timestamp, a claim's time period, or a fallback as-of date.

**Why:** Retrieval time only says when the system read the page. Treating it as publication metadata fabricates source chronology and can mislead time-scope review.

**How to apply:** Preserve the normalized publication date and extraction basis through receipts, source records, and retained findings. Prefer semantic metadata, JSON-LD `datePublished`, a clearly labeled visible publication line, then provider/source metadata. Conflicting or ambiguous candidates fail closed to null rather than falling through. Keep access time tied to retrieval, and let genuine publication metadata reach existing time-scope handling only when no claim period is reported; it must not independently promote evidence or change financial inputs.