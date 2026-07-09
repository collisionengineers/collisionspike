---
id: TKT-107
title: "Read-only Box archive assist (suggest-only) — decouple from the sequence-blocked reconstruction"
status: verify
priority: P2
area: intake
tickets-it-relates-to: [TKT-058, TKT-093, TKT-072]
research-link: docs/tickets/done/TKT-058-retro-case-creation/verification.md
plan: PLAN-001
---

# Read-only Box archive assist (suggest-only)

## Why

The `collision_engineers` archive (folder `4077648161`) is now **fully readable** by the box-webhook
facade — `BOX_READONLY_ROOT_IDS=4077648161` set + the service-account **Viewer grant confirmed**
(2026-07-07). The **auto-reconstruction rung (R2)** stays dark because `retroCreatePersist` creates a
case with the archive folder's own Case/PO (`discoveredPo`), which collides with the restarted ~001
live sequence until the **Case/PO sequence-alignment** (gated.md D11 step 1) is decided.

**But that blocker is specific to *minting*.** Read-only USES of the archive create nothing, so they
carry **no numbering risk** and can ship now — extracting value from the archive while the
sequence-alignment stays open. The raw read capability is live (`box/search`,
`box/files/{id}/content`); today the **only** consumer is the minting reconstruction rung, so a
suggest-only consumer must be wired.

## Scope — read-only, never mints (in rough value order)

1. **Suggest-only archive match** (the "reconstruct-as-a-hint" of R2): when an inbound email can't be
   matched to a *live* case, run the existing read-only `retroBoxLocate` search and, instead of
   creating, surface **"may match archive folder `<Case/PO>` · Open in Box"** on the email — mirroring
   the TKT-093 `linkSuggestionCasePo` "may belong to" hint. A human decides; nothing is created, so the
   sequence stays untouched. This is the direct, safe half of R2.
2. **Assistant archive-lookup tool** (TKT-060 read-only invariant): a new SELECT-/search-only tool in
   the AI chat drawer — "is there an archive folder for ref/VRM X?" → matching folders + Open-in-Box
   links. Read-only; no case side-effects.
3. **Archive evidence reference**: let the operator pull an archived instruction `.eml`/document onto a
   *live* case for reference (link-only, `acceptedForEva=false` so it never pollutes the EVA rules).
4. **Global-search fold-in** (TKT-072): when global search lands, include a read-only archive arm.

## Guardrails

- **No mint, ever.** This ticket must not call `retroCreatePersist` / `dataApi.retroCreate` or the live
  allocator. It surfaces suggestions/links + read-only bytes only. The moment a case would be created
  from the archive, that is the R2 rung and is gated on the sequence-alignment (TKT-058 / D11).
- Reuse the read-only facade scope lock (`BOX_READONLY_ROOT_IDS`) — list/search/download only.
- ADR-0010/0019 applies to archive matches too: a VRM-only archive match stays a suggestion, never a
  confident single-match promotion.

## Acceptance

- An unmatched email with an archive-only ref shows the "may match archive folder X" suggestion + an
  Open-in-Box link; Postgres shows **no case created**, no Case/PO minted, no allocator advance.
- The assistant can answer an archive-lookup question read-only.
- Gate/scope respected; unit + a live probe recorded in verification.md.

## Notes

Operator-raised 2026-07-07: "sequence alignment is undecided but we can still use the read-only to
assist in other areas." Correct — this ticket is that. Code change → a PR.

## Artifacts

- What was built: [changes.md](./changes.md)
- How it was proven: [verification.md](./verification.md)
