# Phase 7 — Box-centric intake (additive hybrid)

**Goal:** make Box the durable, human-navigable case record from first contact and an account-free image
intake channel, **without** moving the source of truth. A per-Case/PO Box folder is minted at
parse-confirm; finalize augments it; File Requests collect images from senders who never log in;
a webhook advances the case on upload. **Dataverse stays the system of record; Box is a one-way mirror**
(ADR-0012). Everything is **additive and env-var-gated, default-OFF**.

> **Binding decision:** [docs/adr/0012-box-centric-intake-additive-hybrid.md](../../adr/0012-box-centric-intake-additive-hybrid.md).
> **Authoritative build order + cross-section reconciliations:** the master build plan
> [`docs/HISTORICAL/box-integration-pivot/plans/00-BUILD-PLAN.md`](../../HISTORICAL/box-integration-pivot/plans/00-BUILD-PLAN.md)
> (the reconciliation table + the verified-vs-unverified roll-up) — **it wins over the six section
> plans, which diverged on op names / connection-ref.** Read the ADR + the build plan before acting.

> **Phase vs milestone.** This is **Phase 7** on the ROADMAP work-breakdown axis (a folder of plans);
> it is **not** a milestone. Per [milestone-model.md](../milestone-model.md), Box archival at EVA-submit
> was M2.D (`phase-3-enrichment-and-eva/box-archival-pipeline.md`); this phase is the broader pivot that
> brings Box **earlier** (folder at parse-confirm) and **deeper** (File-Request chasers + webhook
> intake). It sits **on top of live M1 intake** and gates on each `BOX_*` flag independently.

**Status (2026-06-22):** approved (ADR-0012) and **BUILT in the working tree — authored + offline-verified
+ free-account REST-tested; the Phase-7 Dataverse schema + env-vars are APPLIED LIVE (all `BOX_*` gates
OFF), the `box-webhook` Function is DEPLOYED gated-off (secret-free, Gate-C-verified), and the connector/flows are authored offline, not imported/bound.** The full B0–B4 + Phase-C
`[C]` set is authored: the docs spine (this README + the two specs + ADR-0012 + architecture §Box), the
**Dataverse schema-as-code** (5 `BOX_*` gates + 2 config vars + 3 `cr1bd_box*` columns + `cr1bd_boxsyncedat`
+ the submit-signal columns + the `cr1bd_finalizedpayloadhash` drift declaration + 3 audit actions;
`verify-parity.mjs` locked), the **`box-webhook` Azure Function** (CCG mint + HMAC receiver; **pytest 79**),
the **3 new flows** (`box-folder-create`, `box-file-request-copy`, `box-blob-purge`) + the
`finalize-eva-box`/`case-resolve` reworks (**flow linter 154/154**), and the **Code App surfacing**
(`getBoxGates`, submit-signal finalize, `copy_file_request` chaser, "Open in Box" deep link; **vitest all
green, `tsc -b` clean** — the suite has since grown past the once-cited 256, so the count is no longer
pinned). **The Box Dataverse schema + env-vars ARE applied live** (verified via `az` against Dev
2026-06-22: the `cr1bd_box*` case + evidence columns and every `cr1bd_BOX_*` env-var exist; every `BOX_*`
gate is `false`, default AND current). **The `box-webhook` Function is DEPLOYED gated-off (`cespkbox-fn-v76a47`,
`BOX_API_ENABLED=false`, KV `cespkboxkvv76a47` empty/secrets pending, Gate C verified). The `cr1bd_box_rest`
custom connector and the Box flows are authored offline (`state=off`) — not imported or bound; no Box connection
is bound.** The hard unlock — a Box Platform app + Admin-Console authorization on a **Business or higher**
tenant — plus the BLOCKING `FILE.UPLOADED` live-test are operator-only and **not yet done** (the long pole;
see the two-phase live-testing note below). The B0–B4 checklist boxes below stay `[ ]` because they fold in
the **operator `[O]` step** that completes each line; the `[C]` build of each is done.

## What is in scope now (and what is not)

- **In scope (base Box Business):** per-Case/PO folders, the template File Request + per-case copies,
  webhook-driven upload intake, the status-driven Blob purge, and the Code App **"Open in Box" deep
  link**. Base Business covers all of this.
- **Out of scope now:** the **metadata field** on the File-Request form (the Business Plus tier) — a
  later **Wave-2 reliability upgrade** for the orphaned image-only path only; the **Box Embed iframe**
  (`BOX_EMBED_ENABLED` stays reserved/off — evidence is **linked, not embedded**, no `frame-src` edit);
  Box Governance retention, Box AI Units, and Metadata-Query (Phase C, tier-gated). EVA stays gated OFF
  throughout; Box never gates EVA and EVA never gates Box.

## Implementation checklist (B0–B4 waves)

Legend: **[C]** = Claude-buildable offline (lint-verifiable) · **[O]** = operator-gated (a Box/Entra
credential, Admin consent, tenant CSP change, or live confirm). Section refs are to the build plan's
waves. State each line as `[ ]` until built/flipped.

### B0 — Unlock: connector + token-mint/webhook Function + schema (gate `BOX_API_ENABLED`)

Nothing else runs until the decision record exists, the gates + columns exist, the custom connector is
built and importable, and the webhook Function is built (now deployed gated-off as `cespkbox-fn-v76a47`).

1. [ ] **[C]** ADR-0012 + architecture §Box (`integrations.md`, `data-model.md` one-way-mirror rule,
   a planning-placeholder `live-environment.md` Box row). _(This README + the two specs below are the
   docs spine.)_
2. [ ] **[C]** `BOX_*` gates + `cr1bd_box*` columns + the 3 audit-action options — **owned by the
   Dataverse schema work**; every other section reads the names, none re-defines them.
3. [ ] **[C]** Custom Box REST connector OpenAPI 2.0 (`apiKey`/`x-functions-key`;
   `connectionParameters.api_key` declared) + the CCG token-mint + the `box-webhook` receiver Function +
   its FC1 bicep — **owned by the azure section**; this phase supplies the Box-side contract. See
   [box-custom-connector-and-webhook.md](./box-custom-connector-and-webhook.md).
4. [x] **[C]** Pin the **Code App → flow invocation mechanism** and the **connection-reference identity**
   — both PINNED in the build-plan reconciliation table: invocation is split (direct connector ops for
   copy/shared-link, a Dataverse-signal trigger for finalize), and the connection-ref identity is a
   **parallel `cr1bd_box_rest`** with first-party `cr1bd_box` retained for the byte path (NOT a repoint).
5. [ ] **[O]** **Register the Box Platform app** (Server Auth / CCG, App Access Only; scopes
   `root_readwrite` + `manage_webhook`) on a **Business-or-higher** tenant; **authorize + enable** it in
   the Admin Console; supply
   `client_secret` + the per-webhook signature keys into Key Vault; import the connector; bind
   `cr1bd_box`. _(The hard unlock — see [box-integration-activation.md](./box-integration-activation.md).)_

**B0 exit:** ADR + architecture landed; gates/columns/audit-actions declared and parity-locked; the
connector OpenAPI (with the `api_key` param) + the webhook Function + bicep authored and lint/bicep-green;
the invocation mechanism + connection-ref pinned; the Platform app registered + authorized and secrets in
Key Vault; **both** Box connections bound (`cr1bd_box_rest` parallel custom + first-party `cr1bd_box` for
the byte path). Nothing flipped on (`BOX_API_ENABLED` still false).

### B1 — Folder + archival at parse-confirm (gate `BOX_FOLDER_AT_INTAKE_ENABLED`)

6. [ ] **[C]** `box-folder-create` (Request+Response child): `CreateFolder name=@toUpper(casePo)` under
   `BoxArchiveRootId`; idempotent (`empty(cr1bd_boxfolderid)` guard; swallow Box 409 `item_name_in_use`);
   stamp `cr1bd_boxfolderid` + `cr1bd_boxsyncedat`; audit `box_folder_created`.
7. [ ] **[C]** Insert the folder-create invocation into live `intake` **inside `Scope_generate_casepo`,
   after `Update_case_casepo`** (where `cr1bd_casepo` first exists). **Live-edit guard:** PATCH only the
   `actions` node — never touch the live Office-365 `triggers` (byte-identical trigger; the
   `flow-webhook-trigger-provisioning` gotcha). _(REPO-TRAILS-LIVE: the repo intake def is stale; document
   the invocation, do not make the stale def worse.)_
8. [ ] **[C]** Rewrite `finalize-eva-box` to the real contract: folder pre-exists → finalize **augments**
   (not creates); keep the S2 `GetFileContentByPath_V2` real-bytes → first-party `CreateFile` byte path;
   keep the EVA photo-order loop + `EVA_API_ENABLED` gate; migrate the hard-coded `BoxArchiveRootId` to
   read `cr1bd_BOX_FOLDER_ROOT_ID`; stamp `box_synced` LAST (the idempotency latch).
9. [ ] **[C]** `case-resolve` ensures the survivor case has a folder via the **idempotent**
   `box-folder-create` on a merged single-pair (no byte move/link; status-evaluate re-runs).
10. [ ] **[O]** Designate the archive root (+ `/DropBoxes/` parent); record the root folder id →
    `BOX_FOLDER_ROOT_ID`. **[O]** Flip `BOX_API_ENABLED` then `BOX_FOLDER_AT_INTAKE_ENABLED` (test env
    first); run the live archive test: UPPERCASE casing, photo order (2 previews first, overview shows
    full registration), reflection-excluded photos absent, `.eva.json` present.

**B1 exit:** a new case mints exactly one UPPERCASE Case/PO folder at parse-confirm;
`cr1bd_boxfolderid` stamped; finalize augments and archives `.eml` + instruction PDF + images in correct
photo order; merged cases share the survivor's folder; linter green; operator live-confirmed casing +
order. Gate-publish latency (~1h) acknowledged.

### B2 — File-Request image chaser + webhook intake (gate `BOX_FILEREQUEST_ENABLED`)

The highest-value piece: account-free image collection that auto-advances the case.

11. [ ] **[O]** Hand-build the **ONE template File Request** (capture form = email + description); record
    its `file_request_id` → `BOX_FILE_REQUEST_TEMPLATE_ID`. _(On base Business the form has **no**
    metadata reg field — that is the deferred Business Plus upgrade; case-bound copies carry the case's
    parsed VRM already.)_
12. [ ] **[C]** `box-file-request-copy` (Request+Response child): input
    `{caseId, fileRequestTemplateId, folderId}`; **guard `empty(folderId)` → `folder_not_ready`** (never
    call Box with a null `folder.id`); `CopyFileRequest folder.id, status:"active"` (optional `expires_at`);
    audit `box_file_request_copied`; response `{fileRequestUrl, expiresAt, outcome}`
    (`outcome ∈ sent | gated_off | folder_not_ready`).
13. [ ] **[C/O]** Subscribe the `FILE.UPLOADED` webhook via `CreateWebhook`. **Prefer a single
    archive-root (recursive) or per-repeat-sender webhook over per-case** to stay under the per-app
    webhook-count ceiling (cited ~1000 — **unverified**, confirm at build); one webhook per item
    (duplicate target+app+user → 409).
14. [ ] **[O] LIVE-TEST (BLOCKING for B2):** drag a file into a copied File Request → confirm the target
    folder's `FILE.UPLOADED` fires the Function and the case advances Not Ready → Review. The
    File-Request → event firing is **undocumented** — this is the single biggest empirical unknown. The
    **primary** recovery is Box's own retry: the receiver returns a non-2xx (503) on a transient failure
    so Box re-delivers (B2 receiver model, [box-custom-connector-and-webhook.md](./box-custom-connector-and-webhook.md)).
    A timed `ListFolder` reconciliation sweep is **documented but NOT built** — a deferred secondary
    backstop, not yet wired.
15. [ ] **[O]** Flip `BOX_FILEREQUEST_ENABLED` (test first).

**B2 exit:** the copy-chaser flow returns a live upload URL for a case with a folder (and an honest
`folder_not_ready`/`gated_off` otherwise); a File-Request upload **demonstrably** fires the webhook (and
on a transient failure Box's own retry recovers it — the receiver returns 503); the Function writes
Evidence + re-evaluates status idempotently and the case advances without a stranded or double-processed
case. (The `ListFolder` reconciliation sweep is a deferred, not-yet-built secondary backstop.)

### B3 — Permanent drop-boxes for image-only senders (gate `BOX_FILEREQUEST_ENABLED`)

16. [ ] **[O]** Create one permanent (non-expiring) File Request per repeat sender under `/DropBoxes/`
    (copied from the template); one File Request per folder. _(Operator decision: per-sender vs a shared
    drop-box.)_
17. [ ] **[C/O]** Webhook → Function reg-merges (ADR-0010) the upload to an open instruction case and
    moves/links images into the Case/PO folder; **unmatched → Held** (don't guess). Reuses the B2
    receiver + dedup latch. _(Reg routing here needs a structured reg signal — on base Business that is
    filename-VRM / emailed reg / triage; the metadata **field** that would make this robust is the
    **deferred Business Plus upgrade**.)_

**B3 exit:** an image-only sender drags photos into their permanent drop-box; they route to the right
open case's folder (or Held if no match); no anonymous upload is silently lost.

### B4 — Surface Box in the Code App (gates `BOX_API_ENABLED`; `BOX_EMBED_ENABLED` reserved)

Most of B4 can proceed in parallel from B1 (the gate-read + deep-link parts). **Evidence is linked, not
embedded** — there is no iframe and no `frame-src` edit.

18. [ ] **[C]** `BoxGates` read — `getBoxGates()` reads the same `environmentvariabledefinitions`/value
    rows the flows read (Code Apps have no native runtime env-var read); cached + `refetch`; default
    all-false on failure.
19. [ ] **[C]** Submit dialog → real `finalize-eva-box` (via the pinned invocation mechanism); the UI
    **never writes status locally** — it awaits the flow and re-reads the flow-stamped `box_synced`. The
    drag-drop JSON export stays the permanent fallback.
20. [ ] **[C]** Chaser → File-Request → clipboard: the Code App calls the **Box REST connector op
    `CopyFileRequest` DIRECTLY** (no flow in the path — the Code App runs under CSP `connect-src 'none'` and
    cannot POST to a flow Request URL; the pinned 2026-06-21 build-plan decision), reading `fileRequestUrl`;
    visible only when `fileRequestEnabled && fileRequestTemplateConfigured`; honest
    `not_connected`/`folder_not_ready`/`error` messages, never a fake link. The direct transport must also
    persist `cr1bd_boxfilerequestid`/`url` on the case. `box-file-request-copy.definition.json` is an
    authored **standby** child flow for FUTURE operator activation — **not** currently invoked by the Code App.
21. [ ] **[C]** **Evidence as a server-minted "Open in Box" deep link** via the connector's
    `GetFolderSharedLink` op (called directly under CSP, no flow) — available whenever `apiEnabled`, **no
    CSP change**. The Box Embed iframe is **not built**; `BOX_EMBED_ENABLED` stays reserved/off (no
    `frame-src` edit).
22. [ ] **[C]** Webhook-driven advance reflected via existing `refetch` (+ optional light poll); no push
    channel — never promise instant arrival. `box_synced` label/badge surfacing (label-only).
23. [ ] **[DEPLOY-WITH-LOGIN]** ALM wiring: `pac code add-data-source` for the connector(s); wire generated
    services. _(Tag corrected 2026-06-24: `pac code add-data-source` requires an authenticated `pac` session
    against the live environment and a bound connection — it is **not** a pure offline `[C]` step. Only the
    post-generation hand-wiring of the generated services in the Code App is `[C]`.)_

**B4 exit:** with the connection bound + gates on, the submit dialog drives a real finalize; the chaser
button produces a real upload link to the clipboard; **"Open in Box" works without any CSP change**;
everything degrades to honest `not_connected` when unbound; the offline build stays SDK-free.

### Phase C — Deferred, tier-gated (placeholders only)

24. [ ] **[C]** `box-blob-purge` — scheduled `Recurrence` (with `startTime`), `PurgeGraceDays` default 7,
    gate `BOX_API_ENABLED`; delete Blob evidence where `box_synced AND boxsyncedat < now-grace` via
    `DeleteFile_V2`; **never** the Box copy.
25. [ ] **(deferred)** Box Metadata instances + cascade + Metadata-Query (`BOX_METADATA_ENABLED`,
    Business Plus); Box Governance retention + legal hold (Enterprise add-on); Box AI extract/ask
    (metered AI Units — Business/Business Plus include zero). Each independently gated; each its own
    decision, possibly tier-changing.

## Two-phase live testing (the free vs Business account split)

The pivot's live verification splits across **two** tenants because the throwaway test account is
**free**, and a free account cannot exercise the service-identity path:

- **Phase A — throwaway FREE account (raw REST only).** A free Box account's **dev token** (≈60-min
  lifetime) is the **only** working credential — **CCG fails** (`unauthorized_client`), and there are
  **no File Requests and no metadata**. So the free-account testing is limited to **raw REST mechanics on
  a throwaway folder**: confirm the `CreateFolder` 409 case-insensitive collision behaviour, shared-link
  minting shape, `ListFolder`, and webhook signature/replay handling against real Box responses. This
  de-risks the connector + Function wiring **without** touching the business path. _(Test creds live OUT
  OF REPO; never printed or committed.)_
- **Phase B — the live BUSINESS tenant (the full path).** Only on a Business-or-higher tenant does the
  service-identity path light up: CCG token mint + Admin-authorized Platform app, hand-building the
  template **File Request**, the **metadata** template (if/when the deferred Business Plus upgrade is
  taken), and the **BLOCKING File-Request → `FILE.UPLOADED` live-test**. The operator drives this phase —
  see [box-integration-activation.md](./box-integration-activation.md).

The two phases gate different things: Phase A proves the **REST mechanics + receiver**; Phase B proves
the **service identity + File-Request → webhook loop**. B2 cannot be relied upon until Phase B's
live-test passes; the primary hedge against a missed delivery is **Box's own retry** on the receiver's
non-2xx (503) response (the timed `ListFolder` reconciliation sweep is a deferred, not-yet-built backstop).

## Verified vs UNVERIFIED (carry honestly — do not assert the unverified as fact)

- **CONFIRMED:** custom-connector-cannot-do-CCG; CCG `box_subject_type=enterprise` + App Access Only;
  File-Request copy-from-template only; 10-min replay; HMAC-SHA256 dual-key; folder-scoped `FILE.UPLOADED`
  (fires on move); 409 on a duplicate `CreateFolder` (case-insensitive) and on a duplicate webhook
  target+app+user; **base Business** covers File Requests + webhooks + folders + CCG; **Business Plus** is
  only the **metadata-field** gate (an optional later upgrade).
- **UNVERIFIED (confirm at build; do NOT hard-code):** Box's exact **retry/redelivery** schedule on a
  non-2xx response (the receiver returns 503 on a transient failure so Box re-delivers; confirm the cadence
  against Box docs at build); the **~1000 per-app/user webhook ceiling** (the live ref 404'd; only the
  409-on-duplicate-target is confirmed); the **~60-min CCG token / no refresh** (re-minting per cycle is
  safe regardless); and — the big one — the **File-Request → `FILE.UPLOADED`** firing (undocumented;
  live-test gates B2).

## The connection-reference identity (PINNED)

**Resolved** by the build-plan reconciliation table, reflected in `flows/connection-references.json`
and asserted in ADR-0012: a **parallel `cr1bd_box_rest`** custom connector carries folder-create +
File-Request copy + shared-link + webhook lifecycle, while first-party **`cr1bd_box` (`shared_box`) is
RETAINED** for `finalize-eva-box`'s `CreateFile` byte path. This is a **parallel ref, NOT an in-place
repoint** of `cr1bd_box` — two Box connections coexist by design and the operator binds **both** at
activation. (Earlier docs called this "the one unpinned decision"; it is now pinned — do not re-open it.)

## Plans in this phase

- [box-custom-connector-and-webhook.md](./box-custom-connector-and-webhook.md) — the BUILD spec the
  azure section implements (connector OpenAPI shape, CCG token-mint, webhook receiver, bicep, the
  `finalize-eva-box` rewrite contract).
- [box-integration-activation.md](./box-integration-activation.md) — the operator runbook: the Box
  Platform-app registration on a Business-or-higher tenant, the `BOX_*` gate-flip choreography, and the
  BUSINESS second test phase (CCG + File Requests + metadata + the FILE.UPLOADED live-test).

## Needs the operator

The Box Platform app + Admin authorization, the `client_secret` + signature keys, the connection bind,
the archive-root designation, the hand-built template File Request, the per-phase gate flips, and the
two live confirms (B1 casing/photo-order; the **BLOCKING** B2 File-Request → `FILE.UPLOADED` test) are
hard blockers — consolidated in [../../gated.md](../../gated.md). Claude never holds a Box credential.
