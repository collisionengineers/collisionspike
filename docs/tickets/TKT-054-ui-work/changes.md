# TKT-054 — changes made

> Rulings: [020726 review](../../reviews/020726/decisions.md). Live state:
> [the registry](../../architecture/live-environment.md).

## 2026-07-02 — built + DEPLOYED (operator items remain — see verification)

**Backend**
- `da0571b` fix(intake): `source_mailbox` now stores the mailbox **UPN** — Graph
  change notifications echo the mailbox object-id GUID; `fetchMessage` +
  `graph-lifecycle` resolve the subscribed UPN via `GET /subscriptions/{id}`
  (memoised, never blocks intake). Root cause of every chip reading "Other source".
- `751768f` feat(inbox): inbound list LEFT JOINs `case_` for **`casePo`**;
  `bodyJobref`/`conversationId` mapper gap closed.
- `bb999d4` feat(inbox): **gated Outlook filing** — SPA button → Data API
  `POST /api/inbound/{id}/outlook-move` (server-derived folder, audit, 409 while
  gated) → `outlook-move` storage queue (MSI REST enqueue) → orch mover (resolve
  by `internetMessageId`, walk/create Inbox child folders, `/move`) → outcome
  write-back (`moved` flips new→actioned). +`GET /api/gates/outlook-move`;
  `inbound_email.outlook_move_*` columns + audit codes 100000039–41.

**SPA**
- `eef56c0` pure modules: e-mail-type filter + legacy-URL migration
  (`?type=`/`?dismissed=1`), status-cell model, suggested-action model.
- `659ecda` Inbox rework: category tabs / Triage-status links / Show toggle /
  subtype dropdown REMOVED; one list (all except dismissed, handled muted,
  Show-dismissed switch); **E-mail type** rename + per-category icons; **all
  strength UI removed** (020726 E3); VRM|Ref split; status
  "Case created / Linked to case · CCPY26050 →" links; Suggested-action column.
- `653d54c` Dashboard inbox panel: 2×2 equal tiles, flush-right chevrons; deep
  links moved to `?type=` (legacy URLs still migrate).

**Live (2026-07-02 ~16:00Z)**
- DDL delta `2026-07-02-tkt054-outlook-move.sql` APPLIED; backfill
  `2026-07-02-tkt054-source-mailbox-backfill.sql` RUN — 264 `inbound_email` +
  113 `case_` rows GUID→UPN (engineers@ 120 / info@ 78 / desk@ 69; zero
  non-address values remain).
- Deployed: orch **53** functions (+`outlook-move`), api **72** (+3 routes),
  SPA rebuilt + CSP re-verified. Api MI granted Storage Queue Data Message
  Sender on `cespkorchstdev01`; `OUTLOOK_MOVE_QUEUE_SERVICE_URL` set;
  **`OUTLOOK_MOVE_ENABLED` absent (dark)** pending [gated.md B4](../../gated.md).
