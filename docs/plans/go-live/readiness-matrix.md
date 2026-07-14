# Go-live readiness matrix

The single "is it safe to go" snapshot for `collisionspike`: every feature gate and go-live-relevant
setting, then every readiness dimension. Part of the [go-live doc set](./README.md) (P8 of the
[go-live sprint](./README.md)). **Go-live stays operator-triggered** — nothing here
flips a switch; each operator action names the exact command or portal path.

> **Current answer: no — TKT-178 is blocked.** A production cutover requires the signed/checksummed job
> spreadsheet, authenticated contract-verified production EVA API evidence, and the exact production
> Archive root with proven explicit write/rename/merge/retarget authority in one approved pack, followed by
> backup/restore proof, a frozen approved zero-write ledger hash and a named live window. Manual EVA
> drag-drop and test, mirror, configured-default or Viewer-only roots are not substitutes.
>
> **Rows and commands are not mutation authority.** This plan-hardening pass authorises no live change.
> TKT-178 needs its named run ID, signed ledger/hash, exact artifact hashes, named window and live fence
> token; every other mutation also needs separate explicit operator approval. Otherwise reads only—no Graph
> change/renew, ad hoc retro starter, Outlook mutation, manual case creation, DB/Archive/config write or EVA
> call/submission. Rollback authority is limited to the signed inverse journal.

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
| `BOX_FILEREQUEST_ENABLED` | Copy the upload File Request onto a case | [registry](../../architecture/live-environment.md) | stays ON; the exact template ID plus exact production-target webhook become pre-root hard gates only after the signed-run staging operation and Box-event buffer are implemented/proved | engineering + operator ([TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)) |
| `BOX_FOLDER_ROOT_ID` | Box mirror root the facade is scope-locked to | [registry](../../architecture/live-environment.md) | **stay on the dev mirror root**; a production-root change is blocked inside TKT-178 until the signed spreadsheet, verified EVA API, approved production root/write scope, restore proof, frozen ledger and named window all pass | operator ([TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)) |
| `BOX_ALLOWED_ROOT_ID` (box-webhook Function) | Read/write scope lock; currently set on live but code treats absence as lifted | [registry](../../architecture/live-environment.md) | keep the current test/mirror root and never clear it; first implement/prove missing-value fail-closed behavior plus the signed-run exact-object executor, then set the exact destination only as the final root commit | engineering + operator ([TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)) |
| `BOX_FN_URL` / `BOX_FN_KEY` | box-webhook facade URL + KV-ref key (wiring) | [registry](../../architecture/live-environment.md) | stays | agent-done |
| `EVIDENCE_BLOB_ACCOUNT` / `EVIDENCE_BLOB_CONTAINER` | Provider-API Base64 image landing (wiring) | [registry](../../architecture/live-environment.md) | stays | agent-done |
| `OUTLOOK_MOVE_ENABLED` | "File to …" real Graph move of an inbound email | [registry](../../architecture/live-environment.md) | ON — any live move test is separately operator-approved ordinary verification before the cutover snapshot or after sign-off; TKT-178 itself is strictly read-only for Outlook, so operators and automation may not send/move/delete/categorise/mark while its fence is held | operator ([gated.md B4](../../gated.md) steps 2+4) |
| `OUTLOOK_MOVE_QUEUE_SERVICE_URL` | Enqueue target for the move (wiring) | [registry](../../architecture/live-environment.md) | stays | agent-done |
| `LOCATION_ASSIST_ENABLED` / `AZURE_MAPS_ENABLED` | Inspection-location text-clue suggestions (staff-picked, ADR-0013) | [registry](../../architecture/live-environment.md) | ON — stays ON (photo path is a stub) | agent-done |
| `LOCATION_ASSIST_API_BASE` / `LOCATION_SUGGEST_FN_URL` / `LOCATION_SUGGEST_FN_KEY` | location-suggest Function wiring | [registry](../../architecture/live-environment.md) | stays | agent-done |
| `AUDIT_CASES_ENABLED` | Audit/diminution case-type taxonomy (ADR-0021) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done (TKT-056 live probe on next real audit email still open) |
| `RETRO_CASE_ENABLED` | Retro any-status link rung (ADR-0022) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `AI_MODEL_ENDPOINT` / `AI_MODEL_DEPLOYMENT` | AOAI `gpt-5` endpoint/deployment (keyless, wiring) | [registry](../../architecture/live-environment.md) | stays | agent-done |
| `AI_CHAT_ENABLED` | Read-only AI chat helper drawer (TKT-060) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done (live conversational smoke pending a staff MSAL session) |
| `EVA_API_ENABLED` | EVA Sentry **REST** submission | [registry](../../architecture/live-environment.md) (absent = off) | **stays OFF while blocked**; authenticated, contract-verified production REST access is a mandatory TKT-178 cutover gate and drag-drop is not a substitute for reconciliation | operator/vendor ([TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md); [gated.md D1](../../gated.md)) |
| `VALUATION_ENABLED` | Valuation evidence (M3) | [registry](../../architecture/live-environment.md) (absent = off) | stays OFF | deferred (later phase) |

### 1b. `cespk-orch-dev` (orchestration)

| Gate / setting | What it controls | Live value | Go-live target | Owner |
|---|---|---|---|---|
| `ENRICHMENT_ENABLED` / `PDF_MAPPER_ENABLED` | as API above (orch side) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `BOX_API_ENABLED` / `BOX_FOLDER_AT_INTAKE_ENABLED` / `BOX_FILEREQUEST_ENABLED` / `BOX_FOLDER_ROOT_ID` | Box mirror at intake (orch side) | [registry](../../architecture/live-environment.md) | feature gates stay ON against the current mirror; the production root stays blocked exactly as in 1a | agent-done / operator ([TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)) |
| `GRAPH_INTAKE_MAILBOXES` | The push-subscribed intake mailbox set | [registry](../../architecture/live-environment.md) | stays (info@ + engineers@ + desk@); removed mailbox/folder subscriptions are pruned (implemented 2026-07-05); source-bearing proof of an unattended durable-monitor renewal remains blocked | agent-done for prune / agent prerequisite for source-bearing proof ([TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)) |
| `OCR_FN_URL` / `OCR_FN_KEY` | OCR Function wiring | [registry](../../architecture/live-environment.md) | stays | agent-done |
| `PLATE_OCR_ENABLED` | Registration-plate OCR (overview-photo reg check) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `OCR_SCANNED_PDF_ENABLED` | Scanned-PDF OCR fallback on empty extraction | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `EMAIL_AI_ENABLED` | AOAI suggestion-only triage assist (keyless, PII-scrubbed) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `AI_MODEL_ENDPOINT` / `AI_MODEL_DEPLOYMENT` | AOAI wiring (orch side) | [registry](../../architecture/live-environment.md) | stays | agent-done |
| `TRIAGE_REF_GATE_ENABLED` / `TRIAGE_CANCELLATION_ENABLED` / `TRIAGE_IMAGES_ROUTING_ENABLED` / `TRIAGE_CASE_UPDATE_ENABLED` | Rules-engine-v2 triage policy (acting, not shadow) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `AUDIT_CASES_ENABLED` / `RETRO_CASE_ENABLED` | as API above (orch side) | [registry](../../architecture/live-environment.md) | ON — stays ON | agent-done |
| `RETRO_BOX_ARCHIVE_ROOT_IDS` (orch) + `BOX_READONLY_ROOT_IDS` (box-webhook app) | Retro **Box reconstruction** rung — read-only archive roots | [registry](../../architecture/live-environment.md) | preserve the current suggest-only/read-only lookup state, but keep the orchestration reconstruction rung dark; no production-root wiring or reconstruction until TKT-178's exact approved root/write scope, signed spreadsheet, verified EVA API, frozen ledger and named window all pass | operator ([TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md); [gated.md D11](../../gated.md)) |
| `RETRO_OUTLOOK_SEARCH_ENABLED` | Retro mailbox-`$search` rung (R3) | [registry](../../architecture/live-environment.md) | regardless of its pre-window live value, the TKT-178 fence prevents this/ad hoc starters from mutating cases; approved reconciliation reads Outlook directly and read-only, and the manifest records the exact setting | operator ([TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)) |
| ~~`REPLAY_BACKFILL_ENABLED`~~ | **REMOVED (TKT-106, 2026-07-09)** — the replay driver + gate were deleted (code + app-setting): the wipe-and-rebuild path is non-viable per TKT-059's finding (the Inboxes hold only a fraction of the DB; the DB is the complete record). Any data-correctness pass is an **in-place reprocess**, tracked separately | [registry](../../architecture/live-environment.md) | n/a — gone | agent-done (removal) |
| `EVA_API_ENABLED` / `VALUATION_ENABLED` | as 1a | [registry](../../architecture/live-environment.md) (absent = off) | EVA stays OFF while blocked but must pass authenticated production contract verification before TKT-178; valuation stays OFF/deferred | operator/vendor |

### 1c. Cross-cutting go-live settings (not app-setting gates)

| Item | What it is | State | Go-live target | Owner |
|---|---|---|---|---|
| `case_po_floor` seeding | Case/PO sequence floor so intake numbering continues the REAL archive height (delta applied, table **empty = dark**) | [registry](../../architecture/live-environment.md) | stays empty; seed only inside TKT-178's named future window from every valid historical allocation per prefix in the closed-world signed ledger, using exact approved SQL bytes and fail-closed floor health | operator ([TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md); [case-po-sequence-cutover.md](../case-po-sequence-cutover.md)) |
| `BOX_FILE_REQUEST_TEMPLATE_ID` | Template File Request the copy-op clones (empty → copy no-ops) | [registry](../../architecture/live-environment.md) | hand-build/prove in the approved mirror, then inside the future fence record exact prior app values and stage the approved ID before the final root commit | operator ([TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)) |
| FILE.UPLOADED webhook | Archive→facade notification advancing a case on upload | mirror-root subscription is live/proven; production-destination subscription is absent/unproved; current facade rejects pre-staging outside its mirror write root and the receiver writes synchronously ([registry](../../architecture/live-environment.md)) | first implement/prove signed-run exact-target staging plus durable Box-event buffering/fence; only then verify/preserve or create and independently read back the exact production subscription before the final root commit; mirror proof is insufficient | agent/operator ([TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)) |
| Staff app-roles | Entra `CollisionSpike.User` / `CollisionSpike.Superuser` assignment | only ONE principal assigned; others 403 | Portal → **Entra → Enterprise applications → (the `cespk-api-dev` API app) → Users and groups → Add** each staff member | operator ([gated.md C1](../../gated.md)) |
| Plaintext-secret posture | Postgres app login, Graph secret, storage keys, DocIntel key, function keys | resolved — all KV-ref / identity-based | none | agent-done ([gated.md A2/A3/B2](../../gated.md)) |
| Subscription offer | Free-Trial → Pay-As-You-Go | Free Trial | Upgrade before go-live (standing deadline above) | operator ([gated.md A1](../../gated.md)) |

## 2. Readiness dimensions

Status: **ready** (agent-complete, no go-live blocker) · **operator-blocked** (needs an operator input/decision) ·
**in-progress** (agent work still open).

| Dimension | Status | Blocking item / note |
|---|---|---|
| **Intake** | hard blocked for cutover proof | Live PUSH subscriptions exist, but current identical trace text cannot certify durable-vs-manual origin. TKT-178 needs the versioned source-bearing renewal event plus a recent `source=durable_monitor` success after the latest manual renewal at both pre-window and release. Any manual call invalidates that evidence until a fresh source-bearing `durable_monitor` event. Residual `graph-webhook` 499/cold-start must also satisfy the versioned readiness verdict. [gated.md B](../../gated.md). |
| **Archive / Box** | engineering + operator hard blocked | Filing remains on the current mirror. No production root switch, write/rename/merge, retarget, retro-root activation or production webhook target is allowed until every TKT-178 global gate passes. The exact File Request template and production-target webhook are pre-root gates only after exact-target staging and durable Box-event buffering are implemented/proved; the current facade and mirror proof are insufficient. [TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md). |
| **EVA** | operator-blocked | Drag-drop export remains available for ordinary cases but is not cutover evidence. Production REST is blocked; TKT-178 requires authenticated, contract-verified production API evidence before any Archive or sequence cutover. [TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md) · [gated.md D1](../../gated.md). |
| **Retro reconstruction** | operator-blocked | Rung-1 any-status linking is acting. Existing read-only Archive lookup evidence is not production-root or write approval; the reconstruction rung and Case/PO sequence work stay blocked within TKT-178 until the signed spreadsheet, verified EVA API, approved root/write scope and remaining window gates all pass. [TKT-178](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md). |
| **TKT-178 cutover executor** | not implemented / blocked | The job-sheet activity is an audit stub; EVA report reads are a dark skeleton; EVA replay state is process-local; case merge covers only some relationships; the Archive facade has no rename/move/merge or exact-target webhook-staging route; Box events are not durably fenced; renewal telemetry lacks a source; the floor helper is not deterministic from the ledger; and no scoped writer fence exists. All require offline implementation proof before any deployment/window request. |
| **TKT-178 composite release** | hard blocked | Release requires the exact reviewed/version-locked executor and hard-ticket verdicts; signed spreadsheet roster; authenticated per-row EVA; approved Archive object/root/write authority; template + exact production webhook; unattended Graph proof; scoped fence; backups/inverses; frozen ledger/artifacts; and read-only-nominated ingress plus pre-existing EVA-ready canaries. In the same time-bounded run, ingress Archive ID+parent+root and ready-case EVA must be hard-green; neither can be amber. |
| **AI chat** | ready | `AI_CHAT_ENABLED` on; read-only tools, RLS-scoped as staff, audited; api-app MI granted Cognitive Services OpenAI User. Only a **live conversational smoke** on a staff MSAL session remains. [sprint P5](./README.md). |
| **Reprocess / data-correctness** | in-progress (blocked) | The DB holds cases processed by since-fixed code (misclass/taxonomy-v2/provider-domain fixes landed after ingestion), so the UI shows stale classifications. Correction is an **in-place reprocess** — a mailbox wipe-and-rebuild is **non-viable** (Inboxes hold only a fraction of the DB; the DB is the complete record). The replay driver + `REPLAY_BACKFILL_ENABLED` were **removed** (TKT-106, 2026-07-09); blocked on the **P2 classifier fix-wave**. [sprint P2/P3](./README.md). |
| **Staff roles** | operator-blocked | Only one principal is app-role-assigned; all other staff 403. Entra Enterprise-app assignment (see §1c). [gated.md C1](../../gated.md). |
| **Secrets** | ready | All plaintext exposures remediated — Postgres app login + Graph secret KV-referenced, storage identity-based (shared-key disabled), DocIntel keyless, retained function keys in KV. [gated.md A2/A3/B2](../../gated.md). |
| **Monitoring** | in-progress | Per-app App Insights components live (api / orch each own theirs). Heartbeat + function-failure-rate alerts + subscription-expiry canary were pulled forward for the reprocess; remaining alert wiring + the `graph-webhook` 499 always-ready cost decision are P7. [sprint P0/P7](./README.md). |

---

Order the operator subset by dependency in [runbook.md](./runbook.md); the flat operator backlog is
[operator-checklist.md](./operator-checklist.md). Prove flips took with [day0-smoke.md](./day0-smoke.md);
reverse with [rollback.md](./rollback.md).
