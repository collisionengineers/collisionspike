---
id: TKT-061
title: Box CLI + FILE.UPLOADED webhook + sandboxed E2E
status: next
priority: P2
area: integration
tickets-it-relates-to: [TKT-003, TKT-002]
research-link: GO_LIVE_SPRINT_PLAN.md
---

# Box CLI + FILE.UPLOADED webhook + sandboxed E2E

## Problem

The Box CLI was never installed — the operator-reported "bugged out" state that blocked
hands-on Box work. It is now installed (`@box/cli` 4.9.2) and JWT-authed as the collisionspike
service account against the dev root `392761581105` (verified: 124 items listed). Two live-path
items remain before Box upload-intake is provably end-to-end: no `FILE.UPLOADED` webhook is
subscribed on the dev root, and no sandboxed end-to-end test has been run through the
`box-webhook` receiver. Until both land, uploads into a case folder do not demonstrably drive an
evidence row / status re-eval.

## Change

Create the `FILE.UPLOADED` webhook via our own facade — `POST box/webhooks`
(`create_webhook`, `functions/box-webhook/function_app.py:342`) — with target folder
`392761581105` and address pointing at the `box-webhook` receiver
(`POST /api/box-webhook`, `function_app.py:395`). Then run a sandboxed end-to-end test:
upload a test image via the facade (`POST box/folders/{folderId}/files`,
`function_app.py:166`) → `FILE.UPLOADED` fires → the receiver validates the HMAC signature →
an evidence row is written via the Data API → a `box_upload_received` audit is recorded
(`function_app.py:558`, action name `box_upload_received`, `data_api_client.py:63`) → status
re-eval runs → the SPA shows the image. Finally, a **read-only mirror audit**: every
`case_.box_folder_id` resolves, each folder name equals its `case_po`, and folder contents
match the evidence rows.

All Box sandbox writes stay strictly under root `392761581105`. The File Request **template**
id remains an operator item (hand-built in the Box UI).

## Acceptance

- [ ] Box CLI (`@box/cli` 4.9.2) confirmed JWT-authed as the service account against root
  `392761581105` (item list returns).
- [ ] `FILE.UPLOADED` webhook created via `POST box/webhooks` targeting folder `392761581105`
  → the `box-webhook` receiver address; webhook id recorded.
- [ ] Sandboxed E2E green: facade upload → `FILE.UPLOADED` → signature validated → evidence row
  via Data API → `box_upload_received` audit → status re-eval → image visible in the SPA.
- [ ] Read-only mirror audit passes: every `case_.box_folder_id` resolves, each folder name ==
  its `case_po`, and folder contents match the evidence rows.
- [ ] All sandbox writes confined to root `392761581105`.
- [ ] File Request template id left as an operator (Box-UI hand-build) item, noted not blocked.
