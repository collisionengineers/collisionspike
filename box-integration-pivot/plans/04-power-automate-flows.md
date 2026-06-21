# Power Automate flows (Box-centric intake pivot) — build plan

## Overview

This plan turns the verified **Option 2 (Additive Hybrid)** target architecture
([04-target-architecture.md](../04-target-architecture.md),
[07-flaws-risks-and-open-questions.md](../07-flaws-risks-and-open-questions.md)) into a concrete
flow-by-flow build. **Dataverse stays the system of record**; Box becomes the archival + human-view +
anonymous-intake layer. Three new child flows (folder-create, file-request-copy, blob-purge) plus
targeted edits to `intake`, `case-resolve` and `status-evaluate`, all gated by four new Dataverse
env-vars (`BOX_API_ENABLED`, `BOX_FOLDER_AT_INTAKE_ENABLED`, `BOX_FILEREQUEST_ENABLED`,
`BOX_EMBED_ENABLED`, all default `false`). The Box webhook **receiver is an Azure Function**, not a
flow (it lives in `functions/` under the azure-integration-engineer; it is cross-referenced here
because it re-invokes `CS Status Evaluate`). **The single load-bearing correction to the EXPLORE brief:
a Power Platform custom connector cannot perform the OAuth2 client-credentials grant** (Microsoft Learn,
verified twice). The Box REST connector is therefore an **API-key connector that fronts a thin Azure
Function facade**, exactly the established `evasentry`/`parser` pattern + the `codeapp-apikey-connector-connection`
memory — the facade mints the Box CCG service token server-side from Key Vault.

## Current state (what exists today)

Path: `C:\Users\Alex\Documents\GitHub\collisionspike\flows\` — 12 definitions, 1 ON.

- **`definitions/intake.definition.json`** (467 LOC, OFF) — the orchestrator. Trigger `OnNewEmailV3`
  (concurrency=1, `fetchOnlyWithAttachment=true`). Chain: min-date guard → Message-ID dedup → anchored
  exact provider domain match → get-or-create Case → `.eml` capture Scope → `Run_classify_persist` →
  `Run_parse` → (`Scope_generate_casepo` ∥ `Run_status_evaluate`). All children are **`Workflow`**
  (Run-a-Child-Flow) actions with placeholder `workflowReferenceName`s rebound in the designer at
  import. **`intake` does NOT call `case-resolve`** in its hot path (it owns its own single Create) —
  the EXPLORE brief's claim that intake calls case-resolve "after parse" is incorrect; the hot-path
  comment (line 463) is explicit. There is no `BoxArchiveRootId` parameter on intake today.
- **`definitions/case-resolve.definition.json`** (383 LOC, **ON**, Claude-wired 2026-06-20) —
  merge-by-registration. Request-triggered child `{ caseId }`, Response `{ caseId, merged, outcome,
  survivorCaseId }`. ONE complementary same-VRM pair → merge into the instructions case (the Case/PO
  holder), re-point evidence via `cr1bd_Caseid@odata.bind`, retire+deactivate the image case, re-run
  `CS Status Evaluate` (by GUID `4d963ff7-…`); >1 → `duplicate_risk` Held; 0 → no-op.
- **`definitions/finalize-eva-box.definition.json`** (224 LOC, OFF, gate `EVA_API_ENABLED`) — EVA + Box
  finalize in one Scope. Has a `BoxArchiveRootId` String parameter. **No fictional `CreateFolder`
  action exists in the file** (the EXPLORE "DELETE the fictional Create_box_folder_UPPERCASE" step is a
  no-op — it was already removed; the comment documents its prior deletion). The S2 fix is in place:
  `Get_blob_content_v2` (`GetFileContentByPath_V2`, `dataset=AccountNameFromSettings`) → real bytes →
  `Copy_evidence_to_box` (first-party `shared_box` `CreateFile`, `folderPath`=`/CASEPO/`). Idempotent
  by `cr1bd_finalizedpayloadhash` (`Guard_already_finalized`, stamped last; status → `box_synced`
  100000009). Photo order: 2 previews then full set, `concurrency.repetitions=1`.
- **`definitions/classify-persist.definition.json`** (213 LOC, OFF) — attachments→Blob (`CreateFile_V2`,
  `dataset=AccountNameFromSettings`, `folderPath=evidence/intake/<messageId>`) + one Evidence row each;
  returns `{ payloadHash, instructionBytesB64, instructionName, imageCount }`. **No Box interaction.**
- **`definitions/status-evaluate.definition.json`** (205 LOC, OFF) — inline image-rules + 7-field
  readiness; idempotent (no write when unchanged); terminal-lock guard treats
  `eva_submitted/box_synced/error/linked_to_instruction`+inactive as terminal.
- **`definitions/parse.definition.json`** / **`enrich.definition.json`** — parser + DVSA, gated; no Box
  interaction; the parser base64 double-encode gotcha is load-bearing (pass RAW base64, never
  `base64ToBinary`) per memory `powerplatform-connector-base64-double-encode`.
- **`connection-references.json`** (124 LOC) — 9 refs. `shared_box` (first-party, **Standard**, OAuth-only,
  `usedBy:[finalize-eva-box]`), `shared_azureblob` (Premium), `shared_commondataserviceforapps`,
  `shared_ceparser`/`shared_dvsaenrich`/`shared_evasentry` (custom, Premium, API-key/function-key).
- **`flow-state.json`** (143 LOC) — every flow `state=off` except `case-resolve` (`on` + `activatedLive`).
  Linter enforces this via `ACTIVATED_LIVE_ALLOWED`.
- **`dataverse/environment-variables.json`** (32 LOC) — 11 vars, **no Box gates**.
- **`dataverse/schema/case.json`** (76 LOC) — `cr1bd_casepo` (max 32) exists; **no `cr1bd_boxfolderid`
  / `cr1bd_boxsyncedat`**. `cr1bd_status` is the 11-value `cr1bd_casestatus` choice.
- **`validate-flows.mjs`** — offline linter (8 checks). `BOX_ID_LITERAL_RE` already guards hardcoded
  `parentId`/`folderId` literals.

### Verified API facts that shape every step (sources in the Verification log)

1. **Custom connectors cannot do client-credentials grant** — Microsoft Learn states this verbatim on
   both the connection-parameters page and the connector FAQ. ⇒ the Box REST connector is **API-Key auth
   on the connection** fronting an **Azure Function facade** (the facade does Box CCG server-side). The
   `finalize-eva-box` top comment already states this constraint for the EVA connector; we reuse it.
2. **First-party Box connector (Standard)** exposes ONLY: `CopyFile`, `CreateFile` (params
   `folderPath`/`name`/binary `body`), `DeleteFile`, `ExtractFolderV2`, `GetFileContent[ByPath]`,
   `GetFileMetadata[ByPath]`, `ListFolder`/`ListRootFolder`, `UpdateFile`; triggers `OnNewFilesV2` /
   `OnUpdatedFiles…`. **No folder-create, no file-request, no webhook subscribe, no shared-link, no
   metadata-query.** Known-issue #6: a same-name re-upload is an **update, not a 409** (so the photo
   loop is resume-safe). Limits: **75 MB write ceiling**, 10000 items/folder, **100 calls/conn/60 s**,
   triggers may lag **up to 1 day**. ⇒ confirms every folder/file-request/webhook/link verb needs the
   custom connector; confirms `finalize-eva-box` keeps the first-party `CreateFile` unchanged.
3. **Box `POST /2.0/folders`**: body `name` + `parent.id`; 201 returns `id`/`name`/`type`/`path_collection`;
   **409 `item_name_in_use`** on duplicate ⇒ idempotent re-create handled by catching 409. Scope `root_readwrite`.
4. **Box `POST /2.0/file_requests/{file_request_id}/copy`**: path `file_request_id`; body `folder.id`+
   `folder.type:"folder"`, optional `title`/`description`/`status` (`active|inactive`)/`expires_at`;
   returns `id`/`url`/`status`.
5. **Box `POST /2.0/webhooks`**: `target.id`+`target.type` (`file|folder`), `address`, `triggers[]`;
   **`FILE.UPLOADED` confirmed** in the trigger enum (also `FILE.COPIED`/`FILE.MOVED` exist separately —
   the move-disambiguation hook). Scope `manage_webhook`. Delivery is **best-effort**: retried up to 12×
   over 2 h, dropped if no 2xx in 30 s.
6. **Box webhook signature**: headers `BOX-SIGNATURE-PRIMARY`, `BOX-SIGNATURE-SECONDARY`,
   `BOX-DELIVERY-TIMESTAMP`; **HMAC-SHA256** over (body bytes ∥ timestamp bytes); reject if timestamp
   **> 10 min** old; timing-safe compare.
7. **Child-flow contract** (Microsoft Learn): child = `Request` trigger ("When an HTTP request is
   received") + `Response`; parent calls via the built-in **`Workflow`** action ("Run a Child Flow");
   connections must be **embedded** (Run-only users → "Use this connection"); sync response within
   **120 s** (else `202` async).
8. **Recurrence trigger** (Logic Apps Schedule): `frequency` (Second…Month) + `interval`; provide
   `startTime` or the first run fires immediately on deploy; polling trigger reprocesses pending events
   on re-enable.
9. **Azure Blob delete**: `DeleteFile_V2` (params `dataset`=`AccountNameFromSettings`, `id`=the blob —
   the `Path`/`Id` from `CreateFile_V2`'s BlobMetadata); non-V2 `DeleteFile` is DEPRECATED.

## Changes — ordered build steps

Owner key: **[Claude-buildable]** = offline definition/connector/lint authoring (per
`live-services-boundary`, Claude also wires gate flips + live byte-identical-trigger edits);
**[operator-gated]** = secrets Claude lacks, Box Platform-app + Admin-Console authorization, the
interactive Box sign-in, the `frame-src` CSP change, Box-template minting, live confirms.

1. **Add the four Box env-var gates** to `dataverse/environment-variables.json`.
   `cr1bd_BOX_API_ENABLED`, `cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED`, `cr1bd_BOX_FILEREQUEST_ENABLED`,
   `cr1bd_BOX_EMBED_ENABLED` — all `type:"Boolean"`, `defaultValue:"false"`, with `gates` text. Flows
   **read** these via the existing `Get_gate_definition` idiom (ListRecords on
   `environmentvariabledefinitions` + `$expand environmentvariabledefinition_environmentvariablevalue`,
   coalesce value→defaultValue→'false'); flows never write env-vars.
   · Owner **[Claude-buildable]** (flip to true = operator or Claude per override) · depends-on: none ·
   verify: 04-target-architecture.md §"Env-var gates"; existing `enrich.definition.json` gate-read idiom.

2. **Add two Box-tracking columns** to `dataverse/schema/case.json` (dataverse-data-architect owns the
   table; listed here as the flow contract). `cr1bd_boxfolderid` (String, max 100, required:none — the
   live Box folder id) and `cr1bd_boxsyncedat` (DateTime, `UserLocal`, required:none — last successful
   Box archive). Update the schema `notes` to record: Box folder name = **UPPERCASE Case/PO**; minted at
   **parse-confirm** (not first-contact) so no provisional-rename (open question — recommend latter).
   · Owner **[Claude-buildable]** · depends-on: none · verify: 04 §B1 (case-insensitive, one UPPERCASE
   folder per case, 409 on lowercase sibling); 07 flaw #3 (timing wrinkle).

3. **Author the custom Box REST connector** `functions/connectors/box-rest-connector.json` (OpenAPI 2.0;
   azure-integration-engineer + connector scope; listed here because three flows bind it). **Auth =
   `apiKey` securityDefinition** (`"type":"apiKey","in":"header","name":"x-functions-key"`) — NOT OAuth2
   client-credentials (unsupported on custom connectors). The connector's `host` is the **Azure Function
   facade**, which holds the Box Platform-app `client_secret` in Key Vault and mints the Box CCG token
   server-side. Operations (each = one facade route that proxies Box REST):
   - `CreateFolder` → facade `POST /box/folders` → Box `POST /2.0/folders` `{name, parent.id}` →
     `{id, name, path_collection}`; facade swallows 409 `item_name_in_use` and returns the existing
     folder id (idempotent).
   - `CopyFileRequest` → facade `POST /box/file-requests/{id}/copy` → Box
     `POST /2.0/file_requests/{file_request_id}/copy` `{folder:{id,type:"folder"}, status, expires_at}`
     → `{id, url, status}`.
   - `GetSharedLink` → facade `PUT /box/files/{id}/shared-link` → Box
     `PUT /2.0/files/{file_id}?fields=shared_link` `{shared_link:{access}}` → `{url}`.
   - `ListFolder` → facade `GET /box/folders/{id}/items` → Box `GET /2.0/folders/{id}/items` →
     `{entries[]}` (the B3 reconciliation-sweep read).
   The `x-functions-key` lives on the **connection**, never in any definition (memory
   `codeapp-apikey-connector-connection`). · Owner **[Claude-buildable]** (def); secret inject + Box
   Platform-app + Admin authorization **[operator-gated]** · depends-on: 1 · verify: Learn
   connection-parameters "client credentials grant type is not supported by custom connectors" + FAQ;
   define-openapi-definition apiKey securityDefinition; Box post-folders / post-file-requests-copy /
   put-files add-shared-link / get-folders-id-items.

4. **Add `shared_box_rest` to `connection-references.json`.** `connectionName:"shared_box_rest"`,
   `logicalName:"cr1bd_box_rest"`, `displayName:"Box REST (custom: Function facade + CCG service identity)"`,
   `connector:"shared_box_rest"`, `tier:"Premium"`, `custom:true`,
   `operationIds:["CreateFolder","CopyFileRequest","GetSharedLink","ListFolder"]`,
   `openapi:"functions/connectors/box-rest-connector.json"`, `boundAtActivation:true`,
   `usedBy:["box-folder-create","box-file-request-copy"]`. Note: API-key (function-key) on the
   connection; the Box `client_secret` is a Key Vault ref **inside the facade Function**, never here.
   **Keep `shared_box` (first-party)** for `finalize-eva-box`'s `CreateFile` — unchanged. Update the
   manifest `notes` premium list. · Owner **[Claude-buildable]** · depends-on: 3 · verify:
   connection-references.json existing custom-connector entries (`shared_ceparser` shape).

5. **CREATE `definitions/box-folder-create.definition.json`** — returnable child (Request trigger +
   Response). Input `{ caseId, casePo, workProviderId }`; param `BoxArchiveRootId` (String, never a
   hardcoded Box id). Actions (sequential `runAfter`):
   `Init_*` → `Read_gate` (`Get_gate_definition` on `cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED` + `Set_gate`)
   → `If_gate_on` { `Create_box_folder` (`shared_box_rest` `CreateFolder`, `name=@toUpper(triggerBody()?['casePo'])`,
   `parent_id=@parameters('BoxArchiveRootId')`) → `Capture_box_folder_id` (SetVariable from
   `body('Create_box_folder')?['id']`) → `Stamp_case_box_fields` (Dataverse `UpdateRecord`
   `cr1bd_boxfolderid`+`cr1bd_boxsyncedat=@utcNow()`) → `Audit_box_folder_created` (action value
   reserved by dataverse agent, see dep) } else `{}`. **Idempotency**: the facade swallows Box 409
   `item_name_in_use` and returns the existing folder id, so re-invocation is safe; additionally guard
   with `if(empty(cr1bd_boxfolderid))` before the call to skip when already stamped. Response
   `{ boxFolderId, folderPath:@concat('/', toUpper(casePo)) }`. Embedded connections (`shared_box_rest`,
   `shared_commondataserviceforapps`). · Owner **[Claude-buildable]** · depends-on: 1,2,3,4 · verify:
   Box post-folders 409 `item_name_in_use`; Learn create-child-flows (Request+Response, embedded conns).

6. **REWRITE `definitions/intake.definition.json`** — insert the folder-create call **after the
   get-or-create Case** (both `If_one_provider` branches set `caseId`) and **before/parallel to**
   `Run_classify_persist`. Because the Case/PO needs the **principal from the parser**, the folder is
   minted at **parse-confirm**, not first-contact: add `Run_box_folder_create` (`Workflow`,
   placeholder `CS_Box_Folder_Create`) **inside `Scope_generate_casepo`, after `Update_case_casepo`**
   (which is where `cr1bd_casepo` first exists), passing `{ caseId, casePo:@outputs('Compose_next_casepo'),
   workProviderId:@variables('workProviderId') }`. Add a `BoxArchiveRootId` String param to intake and
   thread it. The child itself re-reads `BOX_FOLDER_AT_INTAKE_ENABLED`, so intake calls it
   unconditionally (recommended in open question "Live Flow Activation Gate" — gate inside the child for
   safe partial activation). **No change** to provider-match, the dedup guards, the
   classify→parse→status chain, or the `.eml` capture. Image-only / no-provider cases never enter
   `Scope_generate_casepo`, so they correctly get **no Box folder** (matches "image-only cases get no
   Case/PO"). Audit `box_folder_created` is emitted by the child, not intake.
   **Live-edit guard (byte-identical trigger):** intake is the one flow with a live Office-365 webhook.
   When patching live, **PATCH only the `actions` node in `clientdata`; never touch `triggers`** (the
   `OnNewEmailV3` webhook is not re-armed — AGENTS.md rule 2, memory `flow-webhook-trigger-provisioning`).
   Pre-PATCH validation: 0 stale action refs, `triggers` byte-identical, all `runAfter` intact, linter
   green. · Owner **[Claude-buildable]** (live wire allowed under override; live confirm
   **[operator-gated]**) · depends-on: 5 · verify: memory `live-services-boundary` +
   `flow-webhook-trigger-provisioning`; existing intake `Scope_generate_casepo` structure.

7. **CREATE `definitions/box-file-request-copy.definition.json`** — button-triggered returnable flow
   (Request + Response) the Code App calls on "Send image chaser". Input `{ caseId,
   fileRequestTemplateId, folderId }` (pass `folderId` = `cr1bd_boxfolderid`, not a path — the copy API
   takes `folder.id`); param-or-input `fileRequestTemplateId` (operator records the hand-built
   template's id). Actions: `Init_*` → `Read_gate` (`BOX_FILEREQUEST_ENABLED`) → `If_gate_on`
   { `Copy_file_request` (`shared_box_rest` `CopyFileRequest`, `file_request_id=@triggerBody()?['fileRequestTemplateId']`,
   `folder_id=@triggerBody()?['folderId']`, `status:"active"`, optional `expires_at`) →
   `Audit_file_request_sent` → set `outcome="sent"` } else `{ set outcome="gated_off" }`. Response
   `{ fileRequestUrl:@body('Copy_file_request')?['url'], expiresAt, outcome }`. **Chaser button is always
   enabled in the Code App**; when the gate is off the flow returns `outcome:"gated_off"` and the app
   shows plain-language "Image chaser is not available yet" (open question "Chaser Button Visibility").
   **This is the B2 highest-value piece.** · Owner **[Claude-buildable]** (template minting + recording
   its id **[operator-gated]**) · depends-on: 1,3,4 · verify: Box post-file-requests-id-copy (folder.id,
   status, expires_at, url); 04 §B2.

8. **Cross-ref: the Box webhook receiver Azure Function** `functions/box-webhook-receiver/` (NOT a flow;
   azure-integration-engineer scope; listed for the flow contract). Public HTTPS, `function-key` second
   gate. On each delivery: (a) **verify HMAC-SHA256** over (raw body ∥ `BOX-DELIVERY-TIMESTAMP`) against
   `BOX-SIGNATURE-PRIMARY` **or** `BOX-SIGNATURE-SECONDARY` (timing-safe); (b) **reject timestamp > 10
   min** (replay); (c) respond **2xx within 30 s**, then work; (d) **disambiguate upload from move** — act
   only when `trigger == "FILE.UPLOADED"` and the item's parent folder id matches a tracked Case/PO
   folder (a `FILE.MOVED`/`FILE.COPIED` event is ignored; FILE.UPLOADED can also fire on moves into the
   folder, so additionally idempotency-key on storage path + Box event id); (e) on a genuine upload:
   copy bytes to Blob (so `finalize-eva-box`'s S2 path-read still works) + write an **Evidence** row
   (`cr1bd_storagepath` → Blob), then **re-invoke `CS Status Evaluate`** (HTTP call to the child's
   Request URL with `{ caseId }`) so the case advances Not Ready → Review. Audit
   `webhook_fired`/`webhook_processed`/`webhook_skipped`. Gate `BOX_API_ENABLED`. Idempotent by
   (storage path + Box event timestamp). **B3 reconciliation sweep** (future): a periodic
   `ListFolder`/Metadata-Query poll backstops missed webhooks.
   · Owner **[Claude-buildable]** (Function + signature/replay stub); endpoint deploy + function-key +
   `POST /2.0/webhooks` subscribe + the **live FILE.UPLOADED-from-File-Request test** **[operator-gated]**
   · depends-on: 1,3 · verify: Box webhook signature headers + 10-min replay; Box post-webhooks
   (FILE.UPLOADED enum, manage_webhook, best-effort retry); status-evaluate Request contract.

9. **REWRITE `definitions/case-resolve.definition.json`** — on a successful single-pair merge
   (`outcome=="merged"`), the merged image evidence now belongs to the survivor (instructions) case,
   which already has a Box folder from step 6. Add, in `Case_ONE` after
   `Run_status_evaluate_survivor`: a gated `Read_gate` (`BOX_FOLDER_AT_INTAKE_ENABLED`) → `If_gate_on`
   { `Get_survivor_for_box` (read survivor `cr1bd_casepo`,`cr1bd_boxfolderid`) →
   `Run_box_folder_create` (`Workflow` `CS_Box_Folder_Create`, `{ caseId:survivorCaseId,
   casePo, workProviderId:'' }`) — **idempotent** (the child no-ops when `boxfolderid` already set / Box
   returns 409), ensuring the merged case has a folder and re-stamping `cr1bd_boxsyncedat` } else `{}`.
   **Recommended (open question "Merged Case Image Sync"): no Box move/link** — `status-evaluate`
   re-runs and the images are ready-for-eva from the survivor's folder; `finalize-eva-box` later uploads
   the actual photo bytes from Blob to that folder. Extend the Response to
   `{ caseId, merged, outcome, survivorCaseId, boxFolderId }`. **No live-trigger guard needed**:
   case-resolve is a Request-triggered child (no Office-365 webhook), so it is safe to
   deactivate→edit→reactivate (recompile) — unlike intake. · Owner **[Claude-buildable]** (it is live;
   recompile under override) · depends-on: 5,6 · verify: existing case-resolve `Case_ONE` ordering;
   status-evaluate terminal-lock already tolerates merged/inactive survivors.

10. **REWRITE `definitions/status-evaluate.definition.json` (optional/UX polish)** — **no readiness
    logic change** (image-rules + 7-field inline check unchanged; idempotent-write unchanged). Append,
    inside the `Patch_status_if_changed` true-branch after `Audit_status_changed`: a gated
    `Read_gate` (`BOX_FILEREQUEST_ENABLED`) → `If_gate_on` { when the new status is a non-terminal
    awaiting-images state (`missing_images`=100000004 or `needs_review`=100000002), emit an audit
    `file_request_eligibility_changed` so the Code App can show a chaser hint }. Purely additive; the
    chaser button is always available regardless. · Owner **[Claude-buildable]** · depends-on: 1 · verify:
    existing status-evaluate `Map_status_choice` integers; 04 §B2.

11. **CREATE `definitions/box-blob-purge.definition.json`** — scheduled flow. Trigger **`Recurrence`**
    (`frequency:"Day"`, `interval:1`, with a `startTime` so it does not fire immediately on deploy).
    Param `PurgeGraceDays` (default `7`). Actions: `Read_gate` (`BOX_API_ENABLED`; Blob purge is only
    relevant once Box is the archive of record) → `If_gate_on` { `List_purgeable_cases` (Dataverse
    ListRecords `cr1bd_cases` `$filter cr1bd_status eq 100000009 and cr1bd_boxsyncedat lt
    @{addDays(utcNow(), mul(parameters('PurgeGraceDays'), -1))}`) → `Apply_to_each_case`
    (`concurrency.repetitions` modest) { `List_case_evidence` (Evidence with non-empty
    `cr1bd_storagepath`) → `Apply_to_each_evidence` { `Delete_blob` (`shared_azureblob` **`DeleteFile_V2`**,
    `dataset:"AccountNameFromSettings"`, `id:@items(...)?['cr1bd_storagepath']`) — idempotent: deleting an
    already-gone blob is tolerated; on failure, audit and continue (failure-isolated) } →
    `Audit_blob_purged_case` } }. Keeps Blob from growing unbounded as Box becomes archive-of-record;
    **does not** delete the Box copy. (`box_synced`=100000009 is terminal, so a purged case never
    re-enters the pipeline.) · Owner **[Claude-buildable]** (grace-period policy confirm **[operator-gated]**,
    open question "Blob Purge Grace Period") · depends-on: 1,2 · verify: Logic Apps Recurrence
    (frequency/interval/startTime, polling reprocess-on-reenable); Azure Blob `DeleteFile_V2` params.

12. **Add the four new flows to `flow-state.json`** — `box-folder-create`, `box-file-request-copy`,
    `box-blob-purge` (and `box-webhook-receiver` as a **reference-only** non-flow note) with
    `state:"off"`, `authoringBoundary:"[BUILD]"`, `activationBoundary:"[RESERVED-FOR-USER]"`,
    `gates:[…]`, and a `planRef` to this file. Update the `summary` counts (totalFlows 12→15). They are
    NOT activated-live (unlike case-resolve), so they stay under the default off-guard. · Owner
    **[Claude-buildable]** · depends-on: 5,7,11 · verify: existing `flow-state.json` entry shape + linter
    Check 5.

13. **Extend `validate-flows.mjs`** — add: (a) every new flow with a `BOX_*_ENABLED` gate is listed in
    `flow-state.json` with that gate; (b) `shared_box_rest` ops appear only in `box-folder-create` /
    `box-file-request-copy` (and the connector ref), never in `finalize-eva-box` (which keeps first-party
    `shared_box`); (c) no hardcoded Box folder id (the existing `BOX_ID_LITERAL_RE` extends to a
    `name:"<digits>"`/`folder_id:"<non-@ digits>"` check for the new ops); (d) `box-blob-purge`'s
    `cr1bd_cases` ListRecords is allowed (status+boxsyncedat filter — add to a documented exception set,
    it is not a dedup-by-VRM read). Run `node flows/validate-flows.mjs` → must print `OK` before any PR.
    · Owner **[Claude-buildable]** · depends-on: 4,5,7,11,12 · verify: existing linter Checks 2/4b/5/6.

## Cross-section dependencies

- **From Dataverse data architecture (02):** (a) the four `BOX_*_ENABLED` env-var definitions [step 1];
  (b) `cr1bd_boxfolderid` + `cr1bd_boxsyncedat` columns on `cr1bd_case` [step 2]; (c) **six new audit
  action choice values** — `box_folder_created`, `file_request_sent`, `webhook_fired`,
  `webhook_processed`, `webhook_skipped`, `blob_purged_case` (next free ≈ 100000017+) [steps 5,7,8,11];
  optional `file_request_eligibility_changed` [step 10]; (d) the **Evidence webhook ingestion contract**
  (which Box webhook fields map to which Evidence columns) [step 8].
- **From Azure integration (03):** (a) the custom Box REST connector OpenAPI + the **Azure Function
  facade** that performs Box CCG server-side and exposes the four API-key routes [step 3]; (b) the **Box
  webhook receiver Function** (HMAC verify + 10-min replay + function-key + FILE.UPLOADED/move
  disambiguation + Evidence write + status-evaluate re-invoke) [step 8]. Both are offline-buildable;
  the Box Platform-app, its `client_secret`, the function-key, and the `POST /2.0/webhooks` subscribe
  are operator-gated.
- **Provides to the Code App (05):** (a) `box-file-request-copy` is the button→flow target (returns
  `{ fileRequestUrl, expiresAt, outcome }`; app copies URL to clipboard + toast) [step 7]; (b) the
  `file_request_eligibility_changed` audit hint [step 10]; (c) `cr1bd_boxfolderid` for an optional
  `GetSharedLink`-backed Box Embed iframe (B4, separate `BOX_EMBED_ENABLED` + a `frame-src` CSP edit —
  operator-gated; not required for B1/B2).
- **Provides to EVA Sentry integration (06):** none — `finalize-eva-box` is unchanged; the Box folder it
  uploads photos into now **pre-exists** (created at intake by `box-folder-create`), but its `CreateFile`
  `folderPath` contract auto-finds/auto-creates the folder either way, so no edit is required. EVA
  transport stays gated on `EVA_API_ENABLED`, orthogonal to the Box gates.
- **Document parser (cedocumentmapper_v2):** no change; the base64 double-encode gotcha remains
  load-bearing; parser still receives `instructionBytesB64` from classify-persist via intake.

## Risks & open questions

- **R1 — File-Request→FILE.UPLOADED firing is UNDOCUMENTED (highest-risk live gate).** No Box doc states
  a File-Request upload fires `FILE.UPLOADED` on the target folder. **Must be live-tested** before B2 is
  relied upon. Fallback: the B3 timed `ListFolder`/Metadata-Query reconciliation sweep, or the
  first-party `OnNewFilesV2` trigger (≤1-day lag). [operator-gated live test]
- **R2 — Webhooks are best-effort** (retry up to 12×/2 h, droppable, at-least-once, also fire on moves).
  Mitigation in step 8: HMAC + 10-min replay + function-key + idempotency by (storage path + event id) +
  move-disambiguation + the reconciliation sweep. `status-evaluate` is idempotent so a duplicate
  re-invoke is harmless.
- **R3 — Custom connector cannot do CCG (verified).** Resolved by the Azure Function facade + API-key
  connection. If the facade is unavailable, no Box folder/file-request/link/sweep verb works (folder
  creation degrades gracefully: intake's `box-folder-create` child fails inside its gated branch without
  stalling the case, because it is a separate child call).
- **R4 — Folder timing.** Minting at parse-confirm (step 6) means the folder appears seconds after first
  contact, not instantly. Recommended (07 OQ #3) to avoid a provisional-rename + 409 churn. Confirm the
  operator accepts this vs an "instant folder" expectation. [open question]
- **R5 — Blob purge grace window.** Default 7 days post-`box_synced`; configurable via `PurgeGraceDays`.
  Confirm the retention policy. [open question / operator-gated]
- **R6 — Dual source of truth / drift.** Dataverse stays authoritative; Box metadata is written one-way;
  no case logic (dedup/status/sequencing) ever runs off Box (07 flaw #4). The plan honors this — every
  decision is a Dataverse read.
- **R7 — Box Embed (B4) needs a `frame-src` CSP change.** Separate `BOX_EMBED_ENABLED`; B1/B2 do not
  require it. Operator may prefer "Open in Box" deep links (server-minted `GetSharedLink`). [open
  question / operator-gated]
- **R8 — Data residency (Box Zones).** If in-UK claimant-PII processing is mandated, the Box tier floor
  rises (Enterprise + consulting). Flows are tier-agnostic, but the account binding is gated on this.
  [open question / operator-gated]
- **R9 — Rate limits.** First-party Box connector 100 calls/conn/60 s + 75 MB write ceiling; Box REST
  ~1000/min/user. The photo loop already runs `repetitions=1`; the facade should back off on 429.
- **EXPLORE-brief corrections recorded:** (i) intake does **not** call case-resolve (it owns its own
  Create) — folder-create is wired into `Scope_generate_casepo`, not "after get-or-create before
  classify-persist via a case-resolve path"; (ii) `finalize-eva-box` has **no** fictional `CreateFolder`
  to delete — already removed; (iii) the custom Box connector is **API-key + Function facade**, not a
  native-CCG Power Platform connector.

## Verification log

Microsoft Learn (via microsoft_docs_search / microsoft_docs_fetch / connectors reference):
- Child flows (Request+Response, Run-a-Child-Flow = built-in `Workflow` action, embedded connections):
  https://learn.microsoft.com/power-automate/create-child-flows
- Async/120 s child response limit + 202:
  https://learn.microsoft.com/power-automate/guidance/coding-guidelines/asychronous-flow-pattern
- **Custom connectors do NOT support client-credentials grant** (verbatim, twice):
  https://learn.microsoft.com/connectors/custom-connectors/connection-parameters and
  https://learn.microsoft.com/connectors/custom-connectors/faq
- Custom-connector API-key (`apiKey` securityDefinition, header):
  https://learn.microsoft.com/connectors/custom-connectors/define-openapi-definition and
  https://learn.microsoft.com/connectors/custom-connectors/define-blank
- Recurrence trigger (frequency/interval/startTime; polling reprocess-on-reenable):
  https://learn.microsoft.com/azure/connectors/connectors-native-recurrence and
  https://learn.microsoft.com/troubleshoot/power-platform/power-automate/flow-run-issues/triggers-troubleshoot
- **First-party Box connector** (Standard; CreateFile folderPath; NO folder-create/file-request/webhook/
  shared-link/metadata; known-issue #6 same-name re-upload = update; 75 MB; 100/conn/60 s; ≤1-day
  trigger lag): https://learn.microsoft.com/connectors/box/
- Azure Blob `DeleteFile_V2` (dataset + id), `GetFileContentByPath_V2`, `ListFolder_V4`:
  https://learn.microsoft.com/connectors/azureblob/

Box developer/support docs (via WebFetch):
- Create folder (`POST /2.0/folders`, name+parent.id, 409 `item_name_in_use`):
  https://developer.box.com/reference/post-folders/
- Copy file request (`POST /2.0/file_requests/{file_request_id}/copy`, folder.id+type, status,
  expires_at, url): https://developer.box.com/reference/post-file-requests-id-copy/
- Create webhook (`POST /2.0/webhooks`, target.id/type, address, triggers[]; **FILE.UPLOADED** enum;
  `manage_webhook`; best-effort retry 12×/2 h, 30 s/2xx): https://developer.box.com/reference/post-webhooks/
- Webhook signature (`BOX-SIGNATURE-PRIMARY`/`-SECONDARY`, `BOX-DELIVERY-TIMESTAMP`, HMAC-SHA256, body∥
  timestamp, 10-min replay, timing-safe): https://developer.box.com/guides/webhooks/handle/setup-signatures/
- Add shared link (`PUT /2.0/files/{id}?fields=shared_link`, shared_link.access → url):
  https://developer.box.com/reference/put-files-id--add-shared-link/
- Scopes `root_readwrite` + `manage_webhook` (local OpenAPI mirror):
  `C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\704-box-openapi-v2025-0.md`

Local repo artifacts read for current-state grounding: `flows/definitions/{intake,case-resolve,
finalize-eva-box,classify-persist,status-evaluate,enrich}.definition.json`, `flows/connection-references.json`,
`flows/flow-state.json`, `flows/validate-flows.mjs`, `dataverse/environment-variables.json`,
`dataverse/schema/case.json`; memories `live-services-boundary`, `flow-webhook-trigger-provisioning`,
`codeapp-apikey-connector-connection`, `powerplatform-connector-base64-double-encode`,
`codeapp-csp-use-connectors`.
