# Go-live readiness matrix

The single "is it safe to go" snapshot for `collisionspike`: every feature gate and go-live-relevant
setting, then every readiness dimension. Part of the [go-live doc set](./README.md) (P8 of the
[go-live sprint](./README.md)). **Go-live stays operator-triggered** — nothing here
flips a switch; each operator action names the exact command or portal path.

> **Live values are read from the registry, not restated here.** The **Live value** column links the
> canonical registry [architecture/live-environment.md](../../architecture/live-environment.md) (single
> source [LIVE_FACTS.json](../../../LIVE_FACTS.json) → `gates`) — per the
> [doc protocol](../../MAINTENANCE.md), gate values / counts / the mailbox set live there only. The
> **Go-live target** and **Owner** columns carry the decisions.
>
> **Owner** = **agent-done** (built + deployed + gate set; no operator action to go live) · **operator**
> (needs a key, a portal click, an Entra/Exchange grant, or a business decision — see
> [gated.md](../../gated.md)) · **deferred** (a later phase, not a go-live blocker).

> **One standing deadline** (gates everything, not a cutover step): the subscription is an **Azure Free
> Trial** and the whole stack disables at the ~30-day mark unless upgraded to Pay-As-You-Go —
> Portal → **Subscriptions → (this subscription) → Upgrade**; [gated.md A1](../../gated.md). Do this before
> go-live day.

## 1. Feature gates & go-live settings

Flip command shape (both apps where a gate lives on both):
`az functionapp config appsettings set -g rg-collisionspike-dev -n <cespk-api-dev|cespk-orch-dev> --settings KEY=value`.

### 1a. `cespk-api-dev` (Data API)

| Gate / setting | What it controls | Live value | Go-live target | Owner |
|---|---|---|---|---|
| `ENRICHMENT_ENABLED` | DVSA/DVLA vehicle look-ups (keyless, direct) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `PDF_MAPPER_ENABLED` | PDF→field mapping on parse | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `BOX_API_ENABLED` | Box facade calls (JWT server-auth) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `BOX_FOLDER_AT_INTAKE_ENABLED` | Mint the Case/PO folder at intake | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `BOX_FILEREQUEST_ENABLED` | Copy the upload File Request onto a case | [registry](../../architecture/live-environment.md) | ON — **no-op until** `BOX_FILE_REQUEST_TEMPLATE_ID` is set | operator ([gated.md D2](../../gated.md); template id is a Box-UI hand-build) |
| `BOX_FOLDER_ROOT_ID` | Box mirror root the facade is scope-locked to | [registry](../../architecture/live-environment.md) | dev mirror root now; **production root at cutover** | operator (TKT-004 production Box root id) |
| `BOX_FN_URL` / `BOX_FN_KEY` | box-webhook facade URL + KV-ref key (wiring) | [registry](../../architecture/live-environment.md) | stays | agent-done |
| `EVIDENCE_BLOB_ACCOUNT` / `EVIDENCE_BLOB_CONTAINER` | Provider-API Base64 image landing (wiring) | [registry](../../architecture/live-environment.md) | stays | agent-done |
| `OUTLOOK_MOVE_ENABLED` | "File to …" real Graph move of an inbound email | [registry](../../architecture/live-environment.md) | ON — moves **403 until** the Exchange `Mail.ReadWrite` cache clears + operator live-test | operator ([gated.md B4](../../gated.md) steps 2+4) |
| `OUTLOOK_MOVE_QUEUE_SERVICE_URL` | Enqueue target for the move (wiring) | [registry](../../architecture/live-environment.md) | stays | agent-done |
| `LOCATION_ASSIST_ENABLED` / `AZURE_MAPS_ENABLED` | Inspection-location text-clue suggestions (staff-picked, ADR-0013) | [registry](../../architecture/live-environment.md) | ON — stays ON (photo path is a stub) | agent-done |
| `LOCATION_ASSIST_API_BASE` / `LOCATION_SUGGEST_FN_URL` / `LOCATION_SUGGEST_FN_KEY` | location-suggest Function wiring | [registry](../../architecture/live-environment.md) | stays | agent-done |
| `AUDIT_CASES_ENABLED` | Audit/diminution case-type taxonomy (ADR-0021) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done (TKT-056 live probe on next real audit email still open) |
| `RETRO_CASE_ENABLED` | Retro any-status link rung (ADR-0022) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `AI_MODEL_ENDPOINT` / `AI_MODEL_DEPLOYMENT` | AOAI `gpt-5` endpoint/deployment (keyless, wiring) | [registry](../../architecture/live-environment.md) | stays | agent-done |
| `AI_CHAT_ENABLED` | Read-only AI chat helper drawer (TKT-060) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done (live conversational smoke pending a staff MSAL session) |
| `EVA_API_ENABLED` | EVA Sentry **REST** submission | [registry](../../architecture/live-environment.md) (absent = off) | **stays OFF** — drag-drop 12-field JSON is the live EVA path; REST blocked on Minotaur's one-principal-per-submission limit | operator/vendor ([gated.md D1](../../gated.md)) |
| `VALUATION_ENABLED` | Valuation evidence (M3) | [registry](../../architecture/live-environment.md) (absent = off) | stays OFF | deferred (later phase) |

### 1b. `cespk-orch-dev` (orchestration)

| Gate / setting | What it controls | Live value | Go-live target | Owner |
|---|---|---|---|---|
| `ENRICHMENT_ENABLED` / `PDF_MAPPER_ENABLED` | as API above (orch side) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `BOX_API_ENABLED` / `BOX_FOLDER_AT_INTAKE_ENABLED` / `BOX_FILEREQUEST_ENABLED` / `BOX_FOLDER_ROOT_ID` | Box mirror at intake (orch side) | [registry](../../architecture/live-environment.md) | ON — stays ON (File Request no-op / prod root as in 1a) | agent-done / operator |
| `GRAPH_INTAKE_MAILBOXES` | The push-subscribed intake mailbox set | [registry](../../architecture/live-environment.md) | stays (info@ + engineers@ + desk@); a **prune** step for removed mailboxes is pending | agent (P7 hardening — [sprint P7](./README.md)) |
| `OCR_FN_URL` / `OCR_FN_KEY` | OCR Function wiring | [registry](../../architecture/live-environment.md) | stays | agent-done |
| `PLATE_OCR_ENABLED` | Registration-plate OCR (overview-photo reg check) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `OCR_SCANNED_PDF_ENABLED` | Scanned-PDF OCR fallback on empty extraction | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `EMAIL_AI_ENABLED` | AOAI suggestion-only triage assist (keyless, PII-scrubbed) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `AI_MODEL_ENDPOINT` / `AI_MODEL_DEPLOYMENT` | AOAI wiring (orch side) | [registry](../../architecture/live-environment.md) | stays | agent-done |
| `TRIAGE_REF_GATE_ENABLED` / `TRIAGE_CANCELLATION_ENABLED` / `TRIAGE_IMAGES_ROUTING_ENABLED` / `TRIAGE_CASE_UPDATE_ENABLED` | Rules-engine-v2 triage policy (acting, not shadow) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `AUDIT_CASES_ENABLED` / `RETRO_CASE_ENABLED` | as API above (orch side) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `RETRO_BOX_ARCHIVE_ROOT_IDS` (orch) + `BOX_READONLY_ROOT_IDS` (box-webhook app) | Retro **Box reconstruction** rung — read-only archive roots | [registry](../../architecture/live-environment.md) (absent = dark) | operator supplies REAL archive root id(s) + grants the Box service account **Viewer**, then set | operator ([gated.md D11](../../gated.md) step 2; blocked behind Case/PO sequence alignment) |
| `RETRO_OUTLOOK_SEARCH_ENABLED` | Retro mailbox-`$search` rung (R3) | [registry](../../architecture/live-environment.md) (absent = off) | optional — flip when wanted (own kill-switch, needs nothing else) | operator ([gated.md D11](../../gated.md) step 4) |
| `REPLAY_BACKFILL_ENABLED` | Read-only Graph replay/reprocess driver (TKT-059) | [registry](../../architecture/live-environment.md) (off — turned back off after the 2026-07-05 dry-run) | **stays OFF** until the data-correctness reprocess runs; the pivot is an **in-place reprocess** (a mailbox wipe-and-rebuild is non-viable — the Inboxes hold only a fraction of the DB; the DB is the complete record) | agent — **blocked** on the P2 classifier fix ([sprint P2/P3](./README.md)) |
| `EVA_API_ENABLED` / `VALUATION_ENABLED` | as 1a | [registry](../../architecture/live-environment.md) (absent = off) | stays OFF | operator/vendor · deferred |

### 1c. Cross-cutting go-live settings (not app-setting gates)

| Item | What it is | State | Go-live target | Owner |
|---|---|---|---|---|
| `case_po_floor` seeding | Case/PO sequence floor so intake numbering continues the REAL archive height (delta applied, table **empty = dark**) | [registry](../../architecture/live-environment.md) | Seed at cutover from the archive folder-name listing: `node scripts/cutover/case-po-floor-from-folders.mjs names.txt > seed.sql` → review → apply as `csadmin`; then renumber placeholders | operator ([case-po-sequence-cutover.md](../case-po-sequence-cutover.md); [gated.md D11 step 1](../../gated.md)) |
| `BOX_FILE_REQUEST_TEMPLATE_ID` | Template File Request the copy-op clones (empty → copy no-ops) | [registry](../../architecture/live-environment.md) | Hand-build the template File Request in the Box UI, then set the id | operator ([gated.md D2](../../gated.md)) |
| FILE.UPLOADED webhook | Box→facade notification advancing a case on upload (never subscribed) | not subscribed | Create via the facade `POST box/webhooks` targeting the root → `…/api/box-webhook`; verify `GET box/webhooks/{id}` | agent (P6, after the reprocess — [sprint P6](./README.md)) |
| Staff app-roles | Entra `CollisionSpike.User` / `CollisionSpike.Superuser` assignment | only ONE principal assigned; others 403 | Portal → **Entra → Enterprise applications → (the `cespk-api-dev` API app) → Users and groups → Add** each staff member | operator ([gated.md C1](../../gated.md)) |
| Plaintext-secret posture | Postgres app login, Graph secret, storage keys, DocIntel key, function keys | resolved — all KV-ref / identity-based | none | agent-done ([gated.md A2/A3/B2](../../gated.md)) |
| Subscription offer | Free-Trial → Pay-As-You-Go | Free Trial | Upgrade before go-live (standing deadline above) | operator ([gated.md A1](../../gated.md)) |

## 2. Readiness dimensions

Status: **ready** (agent-complete, no go-live blocker) · **operator-blocked** (needs an operator input/decision) ·
**in-progress** (agent work still open).

| Dimension | Status | Blocking item / note |
|---|---|---|
| **Intake** | ready | Live PUSH subscriptions over info@ + engineers@ + desk@, durable renewer keeps them alive. Open watch-items (do not block): confirm an **unattended renew** at the ~6h durable wake, add the subscription **prune** step, residual `graph-webhook` 499/cold-start (Graph retries absorb). [gated.md B](../../gated.md) · [sprint P7](./README.md). |
| **Box** | operator-blocked | Filing is LIVE (folder-at-intake + archive mirror). Outstanding: **production root id** (TKT-004), the **template File Request** id (`BOX_FILE_REQUEST_TEMPLATE_ID`, Box-UI hand-build), and the **FILE.UPLOADED webhook** (agent P6). [gated.md D2](../../gated.md). |
| **EVA** | operator-blocked | Drag-drop 12-field JSON export is the live path. REST submission **stays off** (Minotaur one-principal-per-submission limit). Operator supplies EVA **test** creds to exercise submission. [gated.md D1](../../gated.md). |
| **Retro reconstruction** | operator-blocked | Rung-1 any-status linking is **ACTING** (`RETRO_CASE_ENABLED` on). The **Box reconstruction rung stays dark** until the operator supplies `RETRO_BOX_ARCHIVE_ROOT_IDS` + `BOX_READONLY_ROOT_IDS` + a Box **Viewer** grant, and the **Case/PO sequence alignment** is done first. [gated.md D11](../../gated.md) · [case-po-sequence-cutover.md](../case-po-sequence-cutover.md). |
| **AI chat** | ready | `AI_CHAT_ENABLED` on; read-only tools, RLS-scoped as staff, audited; api-app MI granted Cognitive Services OpenAI User. Only a **live conversational smoke** on a staff MSAL session remains. [sprint P5](./README.md). |
| **Reprocess / data-correctness** | in-progress (blocked) | The DB holds cases processed by since-fixed code (misclass/taxonomy-v2/provider-domain fixes landed after ingestion), so the UI shows stale classifications. Correction is an **in-place reprocess** — a mailbox wipe-and-rebuild is **non-viable** (Inboxes hold only a fraction of the DB; the DB is the complete record). `REPLAY_BACKFILL_ENABLED` stays OFF; blocked on the **P2 classifier fix-wave**. [sprint P2/P3](./README.md). |
| **Staff roles** | operator-blocked | Only one principal is app-role-assigned; all other staff 403. Entra Enterprise-app assignment (see §1c). [gated.md C1](../../gated.md). |
| **Secrets** | ready | All plaintext exposures remediated — Postgres app login + Graph secret KV-referenced, storage identity-based (shared-key disabled), DocIntel keyless, retained function keys in KV. [gated.md A2/A3/B2](../../gated.md). |
| **Monitoring** | in-progress | Per-app App Insights components live (api / orch each own theirs). Heartbeat + function-failure-rate alerts + subscription-expiry canary were pulled forward for the reprocess; remaining alert wiring + the `graph-webhook` 499 always-ready cost decision are P7. [sprint P0/P7](./README.md). |

---

Order the operator subset by dependency in [runbook.md](./runbook.md); the flat operator backlog is
[operator-checklist.md](./operator-checklist.md). Prove flips took with [day0-smoke.md](./day0-smoke.md);
reverse with [rollback.md](./rollback.md).
