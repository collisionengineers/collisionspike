# Changes — TKT-139: Retro Outlook $search misses spaced-ref variants (Graph tokenization: PHA5007 vs PHA 5007)

## Status
built + deployed (2026-07-09, PLAN-003 final wave D1: orch republished, 71 functions
re-verified) — uncommitted on `feat/final-wave`; awaiting a live locate proof.

## Commits
(none yet — the wave's work is uncommitted on `feat/final-wave` per the dispatch instructions)

## Files touched
- `orchestration/src/lib/retro-envelope.ts` — new PURE `refSearchVariants(key)`: returns
  the key as given (whitespace-collapsed), the COMPACT form (whitespace stripped), and
  the SPACED form (a space at every alpha↔digit boundary of the compact form), deduped +
  order-stable (`PHA5007` → `["PHA5007","PHA 5007"]`; `PHA 5007` →
  `["PHA 5007","PHA5007"]`; `YT13 UTV` → `["YT13 UTV","YT13UTV","YT 13 UTV"]`;
  boundary-less keys like `575689` collapse to one variant — no duplicate Graph calls).
- `orchestration/src/functions/gated/retro-case.ts` — the `retroOutlookLocate` rung loop
  now issues a `$search` per (mailbox × variant) and UNIONS the hits, deduped by
  (mailbox, message id), before the single existing `selectOutlookOriginal` ranked pick;
  per-variant failures warn + continue (one throttled variant/mailbox never sinks the rung).
- `orchestration/src/lib/retro-envelope.test.ts` — the variant-generator unit suite
  (6 tests: both measured miss directions, VRM shapes, no-boundary collapse, whitespace
  trim, Case/PO shape).

## Summary
The TKT-119 memo measured that Graph `$search` tokenization makes a compact ref
(`PHA5007`) miss messages carrying the spaced form (`PHA 5007`) and vice versa. The
retro locate rung now searches BOTH variants (plus the as-given form) per key on the
strongest-first key ladder and unions the results, so a ref stored in either written
form is locatable from a request in either form. Scope note: the `retro-deleted-probe`
research function still issues single-form `$search` (out of this ticket's rung scope —
flagged as a possible follow-up). Orch suite 234 passed.
