---
name: Open-use scenario decisions
description: SafeLoc must remain open-use; human financial review decisions belong only to the user's session scenario.
---

Do not add login, sign-in, reviewer authentication, or a reviewer identity requirement to SafeLoc. Human accept, reject, and evidence-only decisions may affect only the user's personal session scenario. They must never mutate or append to canonical SafeLoc history. Canonical observations remain system-generated, append-only research records.

**Why:** The user explicitly chose an intentionally open-use product and rejected authenticated canonical human acceptance. This supersedes earlier assumptions that financial review required authenticated durable ledger decisions.

**How to apply:** Keep review actions and their disclosed model snapshots in session-scoped browser storage, separate from canonical research storage. Do not wire the legacy authenticated financial decision adapter into the open-use app, add auth dependencies, or simulate a verified reviewer identity to satisfy its contract. Retain provenance, source scope, policy checks, explicit acceptance, and synthetic/provider scenario boundaries independently of authentication.