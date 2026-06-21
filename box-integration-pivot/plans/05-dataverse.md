# Dataverse schema & gates — build plan

## Overview

This is the **additive** Dataverse slice of the Box-centric intake pivot. Dataverse stays the
**system of record**; the Box folder/File-Request metadata is a **one-way mirror** that Dataverse
*writes* (and never reads back for case logic — Box Metadata has no joins, so dedup / status /
Case-PO sequencing cannot run off it). The work is small and entirely Claude-buildable offline: add
**5 Boolean feature-gates + 2 String per-environment config vars** to the env-var manifest, add
**3 optional String columns to `cr1bd_case`** to hold the Box folder id / File-Request id+url, add
**3 additive audit-action options** so Box folder/File-Request/webhook events are traceable, and
make **no change to `cr1bd_evidence`** (Azure Blob remains the byte source of truth) and **no change
to `cr1bd_casestatus`** (`box_synced` = 100000009 already exists). Every value flip, secret, and live
binding is operator-reserved.

## Current state (what exists today)

- **Env-var manifest** — `dataverse/environment-variables.json`. 11 variables, prefix `cr1bd_`,
  solution `CollisionSpike`. Pattern in use: Boolean gates carry `defaultValue` `"true"`/`"false"`;
  per-environment String config (`cr1bd_ENRICHMENT_API_BASE`, `cr1bd_EVA_BASE_URL`) carries
  `defaultValue: ""` and is set per environment at activation; Secrets carry a `keyVault` reference
  only (no literal). The Code App **reads** gates, never writes. **No `BOX_*` variable exists yet.**
- **Case table** — `dataverse/schema/case.json`, logical `cr1bd_case`, `m1-live`. Carries the 12
  EVA payload columns, the dedup keys, identity columns (`cr1bd_vrm`, `cr1bd_caseref`,
  `cr1bd_casepo`), `cr1bd_status` (Choice → `cr1bd_casestatus`), and `cr1bd_finalizedpayloadhash`
  (the finalize idempotency latch, written by `finalize-eva-box`). **No Box-specific column exists.**
  Note: `finalize-eva-box.definition.json` already reads/writes `cr1bd_finalizedpayloadhash`, but
  that column is **not declared in `case.json`** — flag this pre-existing drift (see Risks).
- **Evidence table** — `dataverse/schema/evidence.json`, logical `cr1bd_evidence`, `m1-live`.
  `cr1bd_storagepath` (String 1000) references the Azure Blob container; `cr1bd_filebytes` is the
  optional Dataverse File alternative. Bytes live off-row. **No change required by this pivot.**
- **Case-status choiceset** — `dataverse/choicesets/case-status.json`, global `cr1bd_casestatus`.
  Already includes `box_synced` = **100000009** (terminal). Integer values are stable identifiers,
  **must not be renumbered**. **No change required.**
- **Audit-action choiceset** — `dataverse/choicesets/audit-event.json`, global `cr1bd_auditaction`.
  Already includes `box_synced` = 100000016. Highest existing value = `inspection_override` =
  100000018. Documented as **extend-additively-only (never renumber)**.
- **Audit table** — `dataverse/schema/audit-event.json`, logical `cr1bd_auditevent`, append-only;
  `cr1bd_action` (Choice → `cr1bd_auditaction`), `cr1bd_before`/`cr1bd_after` (Memo 8000),
  `cr1bd_occurredat`. This is the domain audit trail Box folder/File-Request events write to.
- **Connection references / flow-state** — `flows/connection-references.json` declares the
  first-party `shared_box` (Standard, file-only, OAuth-only, used by `finalize-eva-box`).
  `flows/flow-state.json` lists every flow with `state=off` except `case-resolve`. These are
  **owned by the flow + connector sections**, not this one, but the Dataverse plan's gates must
  match the gate names those flows read.
- **Authoring schemas** — `dataverse/schema/_table.schema.json` (column `type` enum includes
  `String`, `Memo`, `Boolean`, `Choice`, …; `required` ∈ `none|recommended|required`; `format` is a
  free string) and `dataverse/schema/_choiceset.schema.json` (option = `{value:int, name:^[a-z][a-z0-9_]*$, label}`).
  New columns/options must satisfy these or the linter fails.

## Changes — ordered build steps

> Convention reused from the existing manifest: **Boolean gates ship a `defaultValue`** (`"false"`
> for everything OFF-by-default); **per-environment String config ships `defaultValue: ""`** and the
> real value is the **current value** set at solution import / activation (Microsoft Learn:
> *"In most ALM scenarios you don't need a default value unless you plan to have a default value for
> all environments… the value should be provided for the target environment during deployment"*).
> All `logicalName`s are lowercase, prefix `cr1bd_`; option `name`s match `^[a-z][a-z0-9_]*$`.

1. **Add the 5 Box feature-gate Booleans to `environment-variables.json`.** Append to `variables[]`,
   each `type:"Boolean"`, `defaultValue:"false"`, with a `gates` array naming the phase. Read by the
   Box flows (via the Dataverse `ListRecords`/`GetItem` on `environmentvariabledefinitions` idiom the
   existing `finalize-eva-box` uses) and by the Code App (read-only, to show/hide Box UI):
   - `cr1bd_BOX_API_ENABLED` — "Box API Enabled" — the unlock; gates the custom Box REST connector +
     webhook receiver. Read by every Box flow as the outer guard. Sibling to `EVA_API_ENABLED`.
   - `cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED` — "Box Folder At Intake Enabled" — gates B1 folder+archival
     at case-creation (`intake-folder-create` flow).
   - `cr1bd_BOX_FILEREQUEST_ENABLED` — "Box File Request Enabled" — gates B2/B3 File Request chaser +
     webhook intake (`filerequest-chaser` flow + `webhook-receiver` Function).
   - `cr1bd_BOX_EMBED_ENABLED` — "Box Embed Enabled" — gates the Code App iframe embed (B4); also
     needs the operator `frame-src` CSP edit. Read by the Code App only.
   - `cr1bd_BOX_METADATA_ENABLED` — "Box Metadata Enabled" — gates the Phase-C Box Metadata-Query
     enhancement. Inert until Phase C.
   · **owner: Claude-buildable** · depends-on: nothing (manifest edit) · verification:
   `dataverse/environment-variables.json` (existing pattern) ·
   https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables (env-var types +
   default-vs-current-value model) ·
   https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/environmentvariabledefinition
   (`Type` choice: 100000002 = Boolean; `DefaultValue` is a Memo).

2. **Add the 2 Box per-environment String config vars to `environment-variables.json`.** Both
   `type:"String"`, `defaultValue:""` (value is the **current value**, set at activation — never a
   hardcoded live Box id, mirroring `ENRICHMENT_API_BASE`). These are flow **parameters' source**,
   read by the Box flows at runtime:
   - `cr1bd_BOX_FOLDER_ROOT_ID` — "Box Folder Root ID" — the archive **root** Box folder id; supplied
     to `POST /2.0/folders` as `parent.id` when minting a Case/PO folder. (Box `POST /folders`
     requires `parent.id`.) Replaces the per-flow `BoxArchiveRootId` parameter the legacy
     `finalize-eva-box` carries, so the id lives in **one** governed place.
   - `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID` — "Box File Request Template ID" — the hand-built image-
     chaser **template** File-Request id; supplied to `POST /2.0/file_requests/{id}/copy` as the path
     id. One id per form shape (the `vehicle_registration` capture field is baked into the template
     and cannot be varied by the copy call).
   · **owner: Claude-buildable** (declare the definition) / **operator-gated** (the *value* at
   activation) · depends-on: step 1 · verification:
   `dataverse/environment-variables.json` (`ENRICHMENT_API_BASE`/`EVA_BASE_URL` precedent) ·
   https://learn.microsoft.com/power-apps/maker/data-platform/environment-variables-faq
   ("the values should be provided for the target environment during deployment") · Box: `POST /folders`
   requires `parent.id` (https://developer.box.com/reference/post-folders/) · Box: `POST /file_requests/{file_request_id}/copy`
   path id (https://developer.box.com/reference/post-file-requests-id-copy/).

3. **Add 3 optional String columns to `case.json` (`cr1bd_case`).** Append to `columns[]`, all
   `required:"none"` (a case can exist with no Box folder; the columns populate as Box phases
   activate). These are the **Dataverse → Box one-way mirror keys** — written by the Box flows /
   webhook Function, surfaced to the Code App; never read back to drive dedup/status/sequencing:
   - `cr1bd_boxfolderid` — "Box Folder ID" — `type:"String", maxLength:40, required:"none"`. The Box
     folder id returned by `POST /2.0/folders` (Box folder ids are numeric strings; 40 is generous
     headroom). Set when the Case/PO folder is created at intake (B1) or parse-confirm. The Code App
     reads it to enable an "Open in Box" deep link; `filerequest-chaser` reads it as the copy target
     (`folder.id`).
   - `cr1bd_boxfilerequestid` — "Box File Request ID" — `type:"String", maxLength:40, required:"none"`.
     The File-Request id returned by `POST /2.0/file_requests/{id}/copy`. Used for webhook
     correlation and expiry/lifecycle management (B3).
   - `cr1bd_boxfilerequesturl` — "Box File Request URL" — `type:"String", maxLength:400,
     format:"Url", required:"none"`. The live upload URL returned by the copy operation, served to
     the "copy chaser" UX for clipboard copy. `format:"Url"` selects the Single-Line-of-Text **URL**
     format (validated/rendered as a link; API type `StringType`); 400 chars is ample for a Box
     shared upload URL and well under the 4000 single-line ceiling.
   · **owner: Claude-buildable** (declare) / **operator-gated** (the architect applies the metadata
   at `[DEPLOY-WITH-LOGIN]`) · depends-on: nothing (additive columns) · verification:
   `dataverse/schema/case.json` + `_table.schema.json` (type/format/required vocabulary) ·
   https://learn.microsoft.com/power-apps/maker/data-platform/types-of-fields (Text max 4000;
   Email/URL/Phone are String formats; API type `StringType`) ·
   https://learn.microsoft.com/power-apps/maker/data-platform/create-edit-field-portal#column-data-types
   (URL = "validated as a URL and rendered as a link") · Box response fields `id` + `url`
   (https://developer.box.com/reference/post-file-requests-id-copy/ ;
   https://developer.box.com/reference/post-folders/).

4. **Leave `evidence.json` (`cr1bd_evidence`) UNCHANGED.** Record the decision explicitly in the
   plan: `cr1bd_storagepath` continues to reference the **Azure Blob** container — Blob is the byte
   source of truth; Box holds archival copies only. Files arriving via File Request → webhook →
   Function create Evidence rows whose `storagePath` **still points at Blob** (the Function copies the
   Box bytes back to Blob, or re-reads from Box on demand for the human view). No `cr1bd_box*` column
   on Evidence. Blob purge stays **status-driven** (on `box_synced` + a grace period), never an age
   rule. · **owner: Claude-buildable** (no-op + documented rationale) · depends-on: nothing ·
   verification: `dataverse/schema/evidence.json` (storagePath contract) · dossier
   `box-integration-pivot/07-flaws-risks-and-open-questions.md` Risk row "Vendor lock-in" (bytes also
   kept in Blob) + Open Q4 (keep Blob as byte source).

5. **Leave `case-status.json` (`cr1bd_casestatus`) UNCHANGED.** `box_synced` = 100000009 already
   exists as a terminal. `finalize-eva-box` already stamps `cr1bd_status = 100000009`. The
   `status-evaluate` change to auto-transition `eva_submitted → box_synced` on
   finalize-complete + `cr1bd_boxfolderid` non-null is a **flow** change (status-evaluate section),
   not a schema change. · **owner: Claude-buildable** (no-op; confirm) · depends-on: step 3
   (the non-null `cr1bd_boxfolderid` guard the flow will read) · verification:
   `dataverse/choicesets/case-status.json` (option present) · `flows/definitions/finalize-eva-box.definition.json`
   (`Stamp_finalized_hash` already sets 100000009).

6. **Add 3 additive options to the `cr1bd_auditaction` choiceset in `audit-event.json`.** Append
   only, continuing the integer sequence from the current max (100000018), names matching
   `^[a-z][a-z0-9_]*$`, so Box flow/webhook events are auditable in the existing append-only
   `cr1bd_auditevent` table (no new table, no renumber):
   - `100000019` `box_folder_created` "Box Folder Created" — written by `intake-folder-create` after
     `POST /2.0/folders` (and by `finalize-eva-box` if it creates the folder).
   - `100000020` `box_file_request_copied` "Box File Request Copied" — written by `filerequest-chaser`
     after `POST /2.0/file_requests/{id}/copy`.
   - `100000021` `box_upload_received` "Box Upload Received" — written by the `webhook-receiver`
     Function on a verified `FILE.UPLOADED` (lets a missed/duplicate webhook be reconciled from the
     audit trail; pairs with the dedup/idempotency requirement).
   · **owner: Claude-buildable** · depends-on: nothing (additive options) · verification:
   `dataverse/choicesets/audit-event.json` ("Extend additively only (never renumber)") +
   `_choiceset.schema.json` (option shape) · `dataverse/schema/audit-event.json` (append-only table
   the actions write to).

7. **Reconcile the docs the manifest/schema touch.** (a) `docs/architecture/integrations.md` — add a
   Box subsection + extend the feature-gate summary table with the 7 new vars (5 gates + 2 config),
   noting custom-connector-vs-first-party and the one-way Dataverse→Box authority. (b) `docs/gated.md`
   — add the operator-reserved Box items (Platform app + Admin OAuth grant; supply `client_secret`;
   build the template File Request + record its id → `BOX_FILE_REQUEST_TEMPLATE_ID`; set
   `BOX_FOLDER_ROOT_ID`; flip the `BOX_*` gates; the `frame-src` CSP edit for B4). (c) `DEPLOY-RUNBOOK.md`
   — add the Box activation sequence (env-var current-value binding for the 2 config vars + gate
   flips). · **owner: Claude-buildable** (write docs) / the *actions* they describe are
   **operator-gated** · depends-on: steps 1–3, 6 · verification: existing `docs/gated.md` format +
   `dataverse/environment-variables.json` `notes[]` style.

8. **Add the new gates to the linter's known-gate set + the env-var manifest `notes[]`.** Update the
   frozen-defaults note to list the new `BOX_*` defaults (all `false`) and call out that
   `BOX_FOLDER_ROOT_ID` / `BOX_FILE_REQUEST_TEMPLATE_ID` are per-environment (no default, value at
   activation) — exactly as the existing note does for `ENRICHMENT_API_BASE`/`EVA_BASE_URL`. Ensure
   any gate string the Box flows reference (`flows/flow-state.json` `gates[]`) resolves to a declared
   variable here (the closed-set check). · **owner: Claude-buildable** · depends-on: steps 1–2 ·
   verification: `dataverse/environment-variables.json` `notes[]` + `flows/flow-state.json` (gates
   cross-checked against declared env-vars).

## Cross-section dependencies

**This section provides to others:**
- **power-automate-flow-builder** — the exact gate `logicalName`s its flows guard on
  (`cr1bd_BOX_API_ENABLED`, `cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED`, `cr1bd_BOX_FILEREQUEST_ENABLED`),
  the config vars its flows read for `parent.id` / template id (`cr1bd_BOX_FOLDER_ROOT_ID`,
  `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID`), the Case columns its flows **write**
  (`cr1bd_boxfolderid`, `cr1bd_boxfilerequestid`, `cr1bd_boxfilerequesturl`), the `box_synced`
  status value (100000009) `status-evaluate` transitions to and the non-null `cr1bd_boxfolderid`
  guard it reads, and the 3 new audit-action values its flows log.
- **azure-integration-engineer** — the audit-action `box_upload_received` (100000021) the
  `webhook-receiver` Function logs, the confirmation that Evidence rows it writes keep
  `cr1bd_storagepath` = Blob, and that `BOX_FOLDER_ROOT_ID` is the `parent.id` source. (The
  HMAC/`BOX-SIGNATURE` verification + 10-min replay logic is that section's, not this one's.)
- **code-app-architect** — the 5 gate names + `cr1bd_BOX_EMBED_ENABLED` it reads (read-only) to
  show/hide Box UI, and the Case columns it surfaces (`cr1bd_boxfilerequesturl` for clipboard,
  `cr1bd_boxfolderid` for "Open in Box").
- **eva-sentry-integration** — no schema change; `box_synced` terminal and `cr1bd_finalizedpayloadhash`
  latch are unchanged.

**This section needs from others:**
- **power-automate-flow-builder / azure-integration-engineer** — confirmation of the **column write
  paths** so naming/length match (folder id, file-request id/url): Box folder/file-request ids are
  numeric strings (≤40 fits); the File-Request `url` fits in 400.
- **Operator** — the *current values* for the 2 config vars and the gate flips at activation (this
  section only declares definitions + defaults; values are reserved).

## Risks & open questions

- **Pre-existing drift: `cr1bd_finalizedpayloadhash` is used by `finalize-eva-box` but not declared
  in `case.json`.** Not introduced by this pivot, but the Box repoint touches the same flow — flag it
  to dataverse-data-architect to add the column declaration (String, idempotency latch) so the
  manifest matches the deployed table. **Do not** silently rely on it.
- **Folder-timing decision (07 Decision Q3) affects *when* `cr1bd_boxfolderid` is populated, not the
  schema.** Provisional-folder-then-rename (at first contact) vs mint-at-parse-confirm (recommended;
  matches today). Either way the column is the same; only the writing flow's trigger point differs.
  No schema impact — note it so the column's "set when" description stays accurate.
- **One UPPERCASE folder per Case/PO.** Box folder names are case-insensitive and a lowercase sibling
  409s (`item_name_in_use`). `cr1bd_boxfolderid` stores the **id**, not the name, so re-resolution is
  id-based and immune to casing — but the *creating* flow must uppercase the name. (Constraint lives
  in the flow; recorded here because it motivates storing the id, not the path.)
- **Box id length assumption.** Set `maxLength:40` for the id columns on the basis that Box object
  ids are numeric strings comfortably under 20 digits today; 40 is headroom. If azure/flow sections
  observe a longer/opaque id at live-test, widen before deploy (cheap pre-deploy change).
- **Gate proliferation.** Seven new variables push the manifest to 18. Microsoft notes no hard limit
  but UX degrades with too many; acceptable here and consistent with the existing per-feature gating
  philosophy.
- **`environmentvariablevalue` is unmanaged + cached up to ~1 hour.** Flipping a `BOX_*` gate or
  setting a config var won't take effect instantly across flows/Code App (async publish). Note in the
  runbook so the operator doesn't expect an instant cutover.
- **Open (live-test, not schema):** does a File-Request upload fire `FILE.UPLOADED` on the target
  folder? (07 Risk #5.) If not, the `webhook-receiver` path that writes Evidence is replaced by a
  timed poll — **no Dataverse schema change either way** (same Evidence/audit rows), but the
  `box_upload_received` audit action then logs poll-detected uploads instead.

## Verification log

Microsoft Learn (Power Platform / Dataverse):
- Environment variable **types** (String/Number/**Boolean**/JSON/Data Source/Secret) and that
  `DefaultValue` is a Memo on the definition:
  https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/environmentvariabledefinition
  (Type choice 100000002 = Boolean; SecretStore = Azure Key Vault / Dataverse).
- Env-var **default-value vs current-value** model + ALM guidance ("values should be provided for the
  target environment during deployment"; "you don't need a default value unless you plan to have a
  default for all environments"; values are unmanaged, cached up to ~1 hour, fallback to last known):
  https://learn.microsoft.com/power-apps/maker/data-platform/environmentvariables and
  https://learn.microsoft.com/power-apps/maker/data-platform/environment-variables-faq.
- `environmentvariablevalue` table (value is unmanaged customization, per-environment):
  https://learn.microsoft.com/power-apps/developer/data-platform/reference/entities/environmentvariablevalue.
- Dataverse **column data types**: Single-Line-of-Text (Text) max **4000** with **URL**/Email/Phone
  formats (URL "validated as a URL and rendered as a link"), Multiline max 1,048,576, API type
  mapping (`StringType` for Single Line of Text incl. URL format; `MemoType` for Multiline):
  https://learn.microsoft.com/power-apps/maker/data-platform/create-edit-field-portal#column-data-types ;
  https://learn.microsoft.com/power-apps/maker/data-platform/types-of-fields ;
  https://learn.microsoft.com/power-apps/maker/data-platform/create-edit-field-solution-explorer#column-data-types.

Box developer docs (developer.box.com) + local Box corpus:
- **Create folder** `POST /folders` — required `name` (1-255, case-insensitive unique) + `parent.id`;
  response `id`/`type`; 409 `item_name_in_use` on case-insensitive duplicate; OAuth2 bearer:
  https://developer.box.com/reference/post-folders/.
- **Copy File Request** `POST /file_requests/{file_request_id}/copy` — required `folder.{id,type}`;
  optional `title`/`description`/`status` (`active`|`inactive`)/`expires_at`; response includes `id`
  and the uploader **`url`**; OAuth2 (`root_readwrite`):
  https://developer.box.com/reference/post-file-requests-id-copy/.
- **Webhook** `FILE.UPLOADED` is a valid trigger on a **folder** target (`POST /webhooks` with
  `target.{id,type:"folder"}`, `address`, `triggers:["FILE.UPLOADED"]`) — confirmed in the local Box
  OpenAPI corpus `automationsresearch/box/markdown/703-box-openapi.md` (lines ~22179-22540). The
  `BOX-SIGNATURE` HMAC verification + 10-min replay window is owned by the azure webhook-receiver
  section and pre-settled in dossier 04 §1 / 07 Risk #5.

Dossier (verified research base, treated as settled):
- `box-integration-pivot/04-target-architecture.md` (env-var gate table §"Env-var gates"; the
  custom-connector unlock; B1/B2 contracts; operator/Claude boundary).
- `box-integration-pivot/07-flaws-risks-and-open-questions.md` (Dataverse authoritative / one-way
  mirror; Blob byte source; folder timing Q3; webhook live-test Risk #5).

Repo current-state files read:
- `dataverse/environment-variables.json`, `dataverse/schema/case.json`,
  `dataverse/schema/evidence.json`, `dataverse/schema/audit-event.json`,
  `dataverse/choicesets/case-status.json`, `dataverse/choicesets/audit-event.json`,
  `dataverse/schema/_table.schema.json`, `dataverse/schema/_choiceset.schema.json`,
  `flows/connection-references.json`, `flows/flow-state.json`,
  `flows/definitions/finalize-eva-box.definition.json`.
