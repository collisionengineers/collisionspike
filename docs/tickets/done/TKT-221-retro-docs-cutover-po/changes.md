# Changes — TKT-221: Document the retro Case-PO cutover flip, correct retro ADR/spec drift, and register the retro gates

## Status
done — all documentation landed 2026-07-16 (same session as the owning TKT-219 implementation).

## What changed

- `docs/adr/0022-retroactive-case-reconstruction.md` — "Amendment — 2026-07-16" section:
  blocked-original categories + rationale; the TKT-219 parallel ladder + combined arm; the
  `RETRO_ADOPT_ARCHIVE_PO_ENABLED` dev/live Case-PO adoption split; verified Graph `$search`
  semantics (1,000 sent-date-sorted results, deep bounded paging, attachment NAMES only) replacing
  the stale "25 relevance-ranked" understanding; the TKT-222 related-correspondence directive.
- `docs/tickets/done/TKT-119-retro-locate-ack-hardening/changes.md` — dated clarification: the
  acceptance line "an acknowledgement/query email can never mint" vs the shipped-and-intended
  trigger-family allowance (wording record only, no behaviour change).
- `docs/tickets/blocked/TKT-178-production-archive-cutover-reconciliation/evidence/retro-po-adoption-flip-2026-07-16.md`
  — the cutover-runbook entry: what the gate does in each mode, the TKT-004 floors-first
  sequencing, the floors-ahead no-conflict rationale, and the A19 note that retro-adopted POs are
  valid prior allocations for the per-prefix floor maximum.
- `LIVE_FACTS.json` — `safetyGates.retroReconstruction` registers RETRO_CASE_ENABLED /
  RETRO_OUTLOOK_SEARCH_ENABLED / RETRO_BOX_ARCHIVE_ROOT_IDS / RETRO_ADOPT_ARCHIVE_PO_ENABLED with
  the dated 2026-07-16 read-only az evidence.
- The stale "[R3 — not built]" header was replaced as part of the TKT-219 rewrite of
  `services/orchestration/src/workflows/retro/retro-case.ts` (code comment; rides that deploy).

## Gates run

`node scripts/checks/check-tickets.mjs` ✓ · `node scripts/checks/check-doc-links.mjs` ✓ ·
`node scripts/maintenance/generate-agent-adapters.mjs --check` ✓.
