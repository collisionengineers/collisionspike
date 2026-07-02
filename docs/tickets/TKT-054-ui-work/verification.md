# TKT-054 — verification

> Filled as slices deploy. **The Outlook move is operator-live-tested only** —
> no automated live move (operator ruling, 020726 E6).

## Planned checks

1. Function counts non-zero post-deploy (orch/api; bundle-crash signature is 0).
2. Fresh email → `inbound_email.source_mailbox` holds the UPN (psql; App
   Insights `evt:fetchMessage` shows the resolved mailbox).
3. Backfill: zero non-address `source_mailbox` values in `inbound_email` and
   `case_`.
4. `GET /api/inbound?view=all` → linked rows carry `casePo`;
   `GET /api/gates/outlook-move` → `{enabled:false}` until consent; move POST →
   409 while gated.
5. SPA vitest suites (inbox-status / inbox-email-type / inbox-suggested-action,
   banned-word sweeps) + `node verify-all.mjs` red-budget gate.
6. Live SPA: mailbox chips named info@/engineers@/desk@; single condensed list;
   VRM|Ref columns; no strength UI; status links open the case; suggested-action
   column display-only while gated; legacy `/inbox?category=…&view=…` deep links
   rewrite to `?type=…`; dashboard tiles 2×2-aligned at ~1024/~1440.
7. Operator: Mail.ReadWrite re-consent → `OUTLOOK_MOVE_ENABLED=true` → live move
   test → mark E6 verified here.

## Results

_(pending)_
