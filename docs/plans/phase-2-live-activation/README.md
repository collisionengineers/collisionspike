# Phase 2 — Live Activation (operator)

**Goal:** cross the live-services boundary — bind the live connections and turn the intake pipeline on,
**one shared mailbox first**, then scale to all three.

> **Milestone:** this whole phase is **M1's exit gate** — the DEPLOY-RUNBOOK §7 three-mailbox
> live-validation **is** the M1 "done" definition ([milestone-model](../milestone-model.md)).

**Status:** 🔒 **Operator-gated.** The digital@ intake webhook is live-verified (one mailbox produces a
real Case) **and the downstream chain is now ON live for digital@** (classify-persist, parse, provider-match,
case-resolve, status-evaluate, enrich — see `live-environment.md` §"Cloud flow inventory"); the **other two
inboxes** remain pending. The remaining `[RESERVED-FOR-USER]` work here is scaling to all three inboxes —
Claude builds offline, the operator activates. See
[../../../DEPLOY-RUNBOOK.md](../../../DEPLOY-RUNBOOK.md) §7 and [../../gated.md](../../gated.md).

## Implementation checklist (operator, in order — DEPLOY-RUNBOOK §7)

1. [ ] 🔒 Bind the Outlook shared-mailbox connection + Dataverse + parser connection references
2. [x] 🔒 Turn ON `intake` + `classify-persist` + `parse` for **ONE** inbox _(digital@ intake live; downstream chain ALSO live — classify-persist, parse, provider-match, case-resolve, status-evaluate, enrich all ON for digital@ as of 2026-06-20)_
3. [ ] 🔒 Send a test email (PDF + overview-with-plate + damage closeup) → confirm a Case appears; `new_email → ingested`; provider matched by sender domain; 12 fields pre-filled with provenance
4. [ ] 🔒 Confirm Outlook categories applied; dedup live (ADR-0010); an **intermediary** domain does **not** auto-match
5. [ ] 🔒 Scale to all three inboxes — only after single-mailbox success

## Plans in this phase

- [multi-inbox-access.md](./multi-inbox-access.md) — adding the other two Outlook shared inboxes (mailbox type, Full Access, V2 trigger; password question answered).
- Bridge/sequencing: [../phase-1-intake-and-case-tracking/phase-1-operational.md](../phase-1-intake-and-case-tracking/phase-1-operational.md) (the three structural wiring fixes that make the chain operational).

## Needs the operator

**Everything in this phase is a hard blocker** (live inboxes, live tests). Tracked in
[../../gated.md](../../gated.md). Note the live `CS Intake` still runs the **unanchored** substring
provider-match — deploy the anchored exact-domain fix **before** seeding provider domains (gated.md).
