# Images-only storage backend — swappable abstraction + ready-to-enable connection refs

> **What this covers.** The **images-only** evidence-storage choice. Today image bytes land in
> **Azure Blob** (`cespkevidstdev01`) via `classify-persist`; the operator will **later** pick between
> **Azure Blob / SharePoint / a local network (SMB) drive / Azure File Sync**. This doc makes that choice
> a **deferred, env-var-gated, swappable backend** — Claude builds the offline abstraction + scaffolds the
> connection references **unbound**; the operator binds exactly **one** backend at activation. The
> sequenced operator how-to is the companion **`docs/activation/images-storage-backend-activation.md`** *(to be authored — work item B6 below)*;
> this file is the **plan + feasibility verdict** (the *why* and the *whether*), that file is the *how*.
>
> **Milestone.** Images-only storage is part of **M1** (the working vertical slice runs on the
> permanent-fallback transport: Azure Blob bytes + Dataverse refs). Switching to SharePoint / local-drive /
> Azure File Sync is an **operator capability choice within M1**, not a new milestone — the abstraction
> exists so the choice never re-touches a flow definition.

> ## 🔒 BUILD-OFFLINE-ONLY — the backend choice + all binding is the operator's
> **Standing guardrail.** Claude authors the **offline** artefacts only: two **unbound** connection
> references (`usedBy:[]`, `boundAtActivation:false` — linter-safe WARN), the env-var selector, the
> `Switch`-per-backend refactor of `classify-persist`'s persist `Scope`, the linter update, and this doc.
> Claude **never** binds a connection, **never** installs/registers the on-premises data gateway, **never**
> supplies a UNC path or Windows credential, and **never** runs a live write/read test. Those cross the
> **live-services boundary** (memory `live-services-boundary`) and are **[RESERVED-FOR-USER]**. The default
> stays `azureblob`, so **nothing changes** in the live pipeline until the operator switches the gate.

Do everything operator-side at **make.powerapps.com** / **make.powerautomate.com** with the
**`Collision Engineers - Dev`** environment selected (env id `b3090c42-51fb-ee24-9868-474da322a3ad`).

---

## 0. Headline verdict

**All four backends are feasible; the abstraction defers the choice with zero flow rewrite.** A single
Dataverse env-var (`cr1bd_IMAGES_STORAGE_BACKEND`, default `azureblob`) selects which write branch runs in
`classify-persist`; every branch emits the same `{ Path }` shape into `cr1bd_storagepath`, so downstream
rows, the Code App listing, and the readiness gate are unchanged regardless of backend.

| Backend | Reachable from a Power Automate cloud flow? | Connector | Tier | Operator setup weight | Verdict |
|---|---|---|---|---|---|
| **Azure Blob** (`cespkevidstdev01`) | **Yes — already live.** | `shared_azureblob` `CreateFile_V2` | Premium | None (live today) | ✅ **Default / permanent fallback.** |
| **SharePoint** (document library) | **Yes** — cloud SharePoint Online direct; SharePoint **Server** would need the gateway. | `shared_sharepointonline` `CreateFile` | Standard | Bind one connection; create a library | ✅ Feasible. 🔒 not bound. |
| **Local network drive (SMB)** | **Yes** — via the **File System** connector + a **standard-mode on-premises data gateway** (no Azure VNet/VM needed). | `shared_filesystem` `CreateFile` | Standard | Install + register a gateway on an always-on Windows host with line-of-sight to the share | ✅ Feasible, **heaviest**. 🔒 not bound. |
| **Azure File Sync** | **Yes (indirect)** — mirror the local share to an Azure file share; flow writes the Azure file share (or a thin copy-to-Blob), **no gateway, no SMB-to-Azure**, all over HTTPS/443. | (writes via Azure Files / Blob) | — | Install the sync agent on the Windows Server hosting the share | ✅ Alternative to the gateway. 🔒 operator decision. |

**Nothing below requires a flow rewrite to switch backends** — the abstraction is the whole point.

---

## 1. Current state (verified)

Verified by reading the repo + live Azure (`azure` MCP `group_resource_list`) + Microsoft Learn:

- **The evidence-bytes seam already exists.** `flows/definitions/classify-persist.definition.json`
  uploads each attachment with `shared_azureblob` **`CreateFile_V2`** (path `/v2/datasets/{dataset}/files`,
  `dataset` = the literal token **`AccountNameFromSettings`** for the access-key connection, `folderPath` =
  `evidence/intake/<messageId>`), then writes one `cr1bd_evidences` row with
  **`cr1bd_storagepath` = `@body('Upload_bytes_to_storage')?['Path']`**. That single action is the swap point.
- **The live storage account is `cespkevidstdev01`** (`rg-collisionspike-dev`, **UK South**, subscription
  `e6076573-23a5-46a8-acef-7e22d264e5db`) — confirmed live. The connection reference
  **`cr1bd_evidenceblob`** (`shared_azureblob`, Premium, `usedBy:["classify-persist","finalize-eva-box"]` —
  finalize also reads blob content for the Box byte path) is declared in
  `flows/connection-references.json` but bound by the operator at activation.
- **There is NO SharePoint reference (`shared_sharepointonline`) and NO File System reference
  (`shared_filesystem`) yet.** `jobsheet-import` only uses **Excel Online** over the live SharePoint job
  sheet — there is no images-only document-library writer.
- **No images-storage gate exists** in `dataverse/environment-variables.json` (today's gates:
  `PDF_MAPPER_ENABLED`, `ENRICHMENT_ENABLED`, `ENRICHMENT_API_BASE`, `EVA_API_ENABLED`, `EVA_BASE_URL`,
  `EVA_CLIENT_ID/SECRET`, `AZURE_MAPS_ENABLED`, `VALUATION_ENABLED`, `COPILOT_ENABLED`,
  `AZURE_VISION_ENABLED`, plus the Phase-7 Box set added 2026-06-22: `BOX_API_ENABLED`,
  `BOX_FOLDER_AT_INTAKE_ENABLED`, `BOX_FILEREQUEST_ENABLED`, `BOX_EMBED_ENABLED`, `BOX_METADATA_ENABLED`
  + config `BOX_FOLDER_ROOT_ID` / `BOX_FILE_REQUEST_TEMPLATE_ID`).
- **`cr1bd_evidence` is already backend-agnostic** — `cr1bd_storagepath` (String 1000) holds the ref for
  any backend; an optional `cr1bd_filebytes` File column exists but is unused by the flow path.
- **The linter tolerates a scaffolded-but-unbound ref.** `flows/validate-flows.mjs` check 2 requires every
  `connectionName` to be **declared** in `connection-references.json`, and a **declared-but-unused** ref is
  reported as a **WARN, not a FAIL** (the `shared_evavalidation` `usedBy:[]`/`boundAtActivation:false`
  precedent in the manifest). So both new refs are linter-safe while `usedBy:[]`.
- **`classify-persist` ships `state=off` in the repo solution** (`flows/flow-state.json` — every flow ships
  `state=off` **except** `case-resolve`, which is Claude-wired ON). **Note:** the *live* `CS Classify + Persist`
  flow is already **ON** for digital@ (full chain live 2026-06-20/21, `live-environment.md` §"Cloud flow
  inventory"); a *re-import* of the repo solution would land it off again, so the backend refactor here must
  be Saved in the designer on the live flow (children embed their connections; the
  Dataverse `clientdata` API cannot arm/refresh them — memory `flow-webhook-trigger-provisioning`). The
  `digital@` intake webhook is **not** touched by any edit here.

---

## 2. The swappable abstraction (Claude-buildable, offline)

**One env-var selects the branch; one `{ Path }` shape flows downstream.** The refactor replaces the single
`Upload_bytes_to_storage` action inside `Scope_Persist_Attachments → Apply_to_each_attachment` with:

1. **An env-var read** at the top of the flow (mirrors how `parse.definition.json` reads
   `PDF_MAPPER_ENABLED`): a Dataverse `ListRecords`/`GetItem` over `environmentvariabledefinitions`
   (expand the value), `@coalesce(currentValue, defaultValue)` → `InitializeVariable storageBackend`.
   The reader connection stays **`cr1bd_dataverse`** (already in `usedBy`). The flow **READS** the gate; it
   never writes `environmentvariablevalue`.
2. **A `Switch` on `@variables('storageBackend')`** with one write branch per backend, each followed by a
   **`Compose_uniformPath`** that yields `{ "Path": <backend path> }` so `Create_Evidence_row` keeps using
   `@body('...')?['Path']` (or `@outputs('Compose_uniformPath')?['Path']`) **unchanged**:

   | `storageBackend` | Write op (connector / operationId) | Path source |
   |---|---|---|
   | `azureblob` *(default)* | `shared_azureblob` **`CreateFile_V2`** — **today's exact action**, `dataset='AccountNameFromSettings'`, `folderPath='evidence/intake/<messageId>'` | `body('CreateFile_V2')?['Path']` |
   | `sharepoint` | `shared_sharepointonline` **`CreateFile`** — `dataset`=site (param `ImagesSharePointSite`), `folderPath`=library+`evidence/intake/<messageId>` (param `ImagesSharePointLibrary`) | `body('SP_CreateFile')?['Path']` |
   | `filesystem` | `shared_filesystem` **`CreateFile`** — `folderPath`=`evidence/intake/<messageId>` **relative to the connection Root folder** (the UNC share lives on the connection, never in the definition) | `body('FS_CreateFile')?['Path']` |

   **`default` branch = fail-safe to `azureblob`** so an unset/typo'd gate never drops bytes.
3. **Keep `concurrency.repetitions = 1`** on `Apply_to_each_attachment` (the shared
   dedup/count/instruction variables stay race-free) and keep the failure-isolation `Scope` +
   `Handle_attachment_failure` AuditEvent untouched.

> **Byte-encoding — branch-scoped (load-bearing).** The **File System** and **SharePoint** `CreateFile`
> `body` parameters are typed **`binary`** (confirmed on the connector reference), so those branches pass
> **`@base64ToBinary(items('Apply_to_each_attachment')?['contentBytes'])`** — exactly as the current Azure
> Blob branch already does. This is the **opposite** of the **parser** connector rule (memory
> `powerplatform-connector-base64-double-encode`: the parser gets the **raw base64 string**, never
> `base64ToBinary`). The two rules are connector-specific — keep them **branch-scoped** and commented, or
> files corrupt / the call 400s.

The Azure Blob branch is **byte-identical to today's live action**, so a solution re-import + the default
gate preserves current behaviour exactly; the other branches are inert until the operator both **binds the
connection** and **switches the gate**.

---

## 3. Connection references — ready-to-enable scaffold (Claude-buildable, unbound)

Add **two** references to `flows/connection-references.json`, both **`usedBy:[]`, `boundAtActivation:false`**
(linter WARN, not FAIL). Reconcile the manifest's `notes[1]` "Premium connectors in play" line — **both
File System and SharePoint are Standard**, like Office 365 Outlook and Excel Online.

**3a. SharePoint (`shared_sharepointonline`)**
```jsonc
{
  "connectionName": "shared_sharepointonline",
  "logicalName": "cr1bd_imagessharepoint",
  "displayName": "SharePoint Online (images-only backend candidate)",
  "connector": "shared_sharepointonline",
  "apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
  "tier": "Standard",
  "usedBy": [],
  "boundAtActivation": false,
  "note": "[RESERVED-FOR-USER] images-only backend candidate. Bind to a LIVE SharePoint document library at activation; the site + library are flow PARAMETERS (ImagesSharePointSite / ImagesSharePointLibrary), never hardcoded. Standard tier; cloud SharePoint Online needs no gateway (SharePoint SERVER would)."
}
```

**3b. File System (`shared_filesystem`) — the local-network-drive option**
```jsonc
{
  "connectionName": "shared_filesystem",
  "logicalName": "cr1bd_imagesfilesystem",
  "displayName": "File System (on-prem / local SMB share, via on-premises data gateway)",
  "connector": "shared_filesystem",
  "apiId": "/providers/Microsoft.PowerApps/apis/shared_filesystem",
  "tier": "Standard",
  "usedBy": [],
  "boundAtActivation": false,
  "note": "[RESERVED-FOR-USER] local/on-prem SMB share via the on-premises data gateway (standard mode). Root folder (UNC, e.g. \\\\MACHINE\\myShare) + Windows creds (DOMAIN\\Username) + the Gateway are supplied on the CONNECTION at activation, never in a definition. NOT shareable (each maker re-creates). Standard tier."
}
```

> **Inventing references is normally discouraged** — the multi-inbox docs call the manifest a *closed set*.
> It is in-scope here **because** both refs stay `usedBy:[]`/unbound until the operator binds them: the
> linter stays green (WARN), and **no flow accidentally requires a connection that isn't bound**. The
> `Switch` branches reference `shared_sharepointonline` / `shared_filesystem` by `connectionName`, which
> satisfies the linter's "declared" check; `usedBy` is documentation, so leave the two new refs `[]` until
> the operator picks one (then set `usedBy:["classify-persist"]` for the chosen one only).

---

## 4. The env-var gate (Claude-buildable, offline)

Add to `dataverse/environment-variables.json`:

| schemaName | type | defaultValue | role |
|---|---|---|---|
| `cr1bd_IMAGES_STORAGE_BACKEND` | **String** | **`azureblob`** | Selector. Documented enum: **`azureblob` \| `sharepoint` \| `filesystem`** (`azurefilesync` writes the Azure file share via the `azureblob`/Azure Files path — see §6, no separate connector). READ by the flow, never written. |
| `cr1bd_IMAGES_STORAGE_ENABLED` | **Boolean** | **`true`** | Master toggle. If `false`, the flow falls back to the `azureblob` default branch regardless of selector (belt-and-braces; lets the operator disable a misconfigured non-default backend without editing the flow). |

Default = **today's live Azure Blob** behaviour, so the gate is **inert until the operator switches it**.
This follows the same READ-only env-var contract as the existing gates (`environment-variables.json` notes:
*"The Code App READS gates, never writes them."*). [Environment variables overview — Power Automate](https://learn.microsoft.com/power-automate/environment-variables-overview)

---

## 5. Local network drive (SMB) feasibility — verified against Microsoft Learn

**The local share IS reachable from a Power Automate cloud flow** — via the **Standard File System
connector** bound through a **standard-mode on-premises data gateway**. No Azure VNet, no Azure VM, no
inbound firewall change; the gateway makes an **outbound** connection to the Power Platform service.

### 5a. How the path works (File System connector + gateway)

- **Connector class = Standard** (not Premium); **not a shareable connection** (each maker re-creates it).
  [File System connector reference](https://learn.microsoft.com/en-us/connectors/filesystem/)
- **Root folder** accepts a **UNC share**: examples `\\MACHINE\myShare` or `C:\myShare`. The Root folder is
  the base for all relative paths, so the flow's `folderPath` stays `evidence/intake/<messageId>` and the
  share lives **only on the connection**. ⚠️ **Mapped network drives (drive letters like `Z:\`) are NOT
  supported** — use the UNC form; the gateway host must reach the share over SMB.
  [Connect to on-premises file systems (Logic Apps)](https://learn.microsoft.com/azure/connectors/file-system)
- **Authentication = Windows**: **Username** `DOMAIN\Username` (or `LOCALMACHINE\Username` if the share is
  on the gateway box itself), **Password**, plus the **Gateway** setting (subscription + gateway resource).
- **Operations** are exactly what the abstraction needs: **`CreateFile`** (write), **`GetFileContentByPath`**
  (read for any in-app preview), **`OnNewFiles`** (watch) — and `CreateFile`/`GetFileMetadataByPath` return
  **`BlobMetadata`** carrying a **`Path`** field, so the `{ Path }` uniform shape holds.
- **Windows-only:** the connector "supports only Windows file systems on Windows operating systems."
- **Gateway connectors confirmed:** Microsoft Learn lists **File System** *and* **SharePoint** among the
  connectors a Power Automate gateway supports.
  [Manage an on-premises data gateway in Power Automate](https://learn.microsoft.com/power-automate/gateway-manage)

### 5b. Limits — surface BOTH numbers (do not over-promise)

| Limit | Value | Source |
|---|---|---|
| Max file size, **create** | **20 MB** | File System connector reference |
| Max file size, general ops | **30 MB** | File System connector reference |
| Gateway connection timeout | **30 s** | File System connector reference |
| Bandwidth per connection | **1000 MB / 60 s** | File System connector reference |
| API calls per connection | **100 / 60 s** | File System connector reference |
| **Gateway payload limit, WRITE** | **2 MB** | [What is an on-premises data gateway? — Considerations](https://learn.microsoft.com/data-integration/gateway/service-gateway-onprem#considerations-and-limitations) |
| Gateway request / response (read) | 2 MB request / 8 MB compressed response | same |

> ⚠️ **Two ceilings coexist — the gateway's is tighter.** The File System connector page advertises a
> **20 MB** create limit, but the **gateway** doc states a **2 MB payload limit for write operations**.
> Treat **2 MB** as the practical per-file write ceiling for the *gateway* path and **validate it against
> real intake photos** (modern phone JPEGs commonly exceed 2 MB). If real images-only sets routinely breach
> 2 MB, the local-drive path needs either client-side downscaling **or** **Azure File Sync** (§6), which
> moves bytes over the FileREST/HTTPS path and is not subject to the gateway write limit. This is an **open
> question for the operator**, not a blocker to scaffolding.

### 5c. Operational weight of the gateway (why it's the heaviest option)

- A **single always-on, domain-joined Windows host** with line-of-sight to the SMB share (HA needs a
  gateway **cluster**). Install in **standard mode** — *personal mode is Power BI-only*.
  [Manage an on-premises data gateway in Power Automate](https://learn.microsoft.com/power-automate/gateway-manage)
- A **recovery key Microsoft cannot recover** — operator custody is mandatory.
- For Power Automate, if the recovery key changes, **connections must be manually re-encrypted (edited)**.
- The gateway **background service** must be able to read the folder — *folders under a user's Windows
  profile or system folders are often inaccessible*; use a dedicated share path.
  [Use custom data connectors with an on-premises data gateway](https://learn.microsoft.com/power-bi/connect-data/service-gateway-custom-connectors#considerations-and-limitations)

### 5d. Alternative — Azure File Sync (keep the local share, drop the gateway)

If the operator wants to **keep the existing local share** but make it cloud-reachable **without** a
gateway: deploy **Azure File Sync**. Install the agent on the Windows Server hosting the share, create a
**Storage Sync Service** + **sync group** with an **Azure file share as the cloud endpoint** and the local
folder as the **server endpoint**; `classify-persist` then writes the **Azure file share** (or a thin
copy-to-Blob Function), and the bytes appear on-prem via sync.

- **SMB is *never* used between the Windows Server and Azure** — all traffic is FileREST/Azure-File-Sync
  REST over **HTTPS / 443**; usually no special network change.
  [Plan for an Azure File Sync deployment — Networks](https://learn.microsoft.com/azure/storage/file-sync/file-sync-planning#networks)
- The **server endpoint must be a local path on the registered server** — **NAS / mounted shares are not
  supported** as a server endpoint.
  [Create an Azure File Sync server endpoint](https://learn.microsoft.com/azure/storage/file-sync/file-sync-server-endpoint-create)
- The backing storage account must have **Allow storage account key access = Enabled** and SMB 3.1.1 /
  NTLM v2 / AES-128-GCM.
  [Deploy Azure File Sync — Prerequisites](https://learn.microsoft.com/azure/storage/file-sync/file-sync-deployment-guide#prerequisites)
- **Not subject to the 2 MB gateway write limit** — this is the answer for bulk / large-photo imports.

---

## 6. Buildable-now vs operator-gated (the owner split)

### 6a. Claude builds now (offline, linter-safe, no live touch)

| # | Item | Artefact |
|---|---|---|
| B1 | SharePoint connection **reference** (§3a) | `flows/connection-references.json` |
| B2 | File System connection **reference** (§3b) + reconcile the "Premium connectors in play" note | `flows/connection-references.json` |
| B3 | `cr1bd_IMAGES_STORAGE_BACKEND` (default `azureblob`) + `cr1bd_IMAGES_STORAGE_ENABLED` (default `true`) | `dataverse/environment-variables.json` |
| B4 | Env-var read → `storageBackend` variable + the `Switch`-per-backend persist refactor (Azure Blob branch byte-identical; `default` → `azureblob`; branch-scoped `base64ToBinary`) | `flows/definitions/classify-persist.definition.json` |
| B5 | Linter: confirm the two new refs are recognised; assert **no hardcoded SharePoint site URL / UNC path / gateway id** appears in any definition (only `@parameters`/env-vars); keep the declared-but-unused WARN until bound | `flows/validate-flows.mjs` |
| B6 | Operator how-to: 4-backend decision matrix + File System/gateway params + DLP + the 2 MB-vs-20 MB limit reconciliation + recovery-key warning | `docs/activation/images-storage-backend-activation.md` |
| B7 | Re-run `node flows/validate-flows.mjs` + `node verify-all.mjs` → keep **all gates green** (`verify-all` reports **7/7** when the Python `.venv`s are present; flow linter currently **154/154**) | — |

### 6b. Operator-gated (🔒 [RESERVED-FOR-USER] — the live half)

| # | Owner | Gated | Action |
|---|---|---|---|
| O1 | operator | 🔒 | **Choose the images-only backend** and set `cr1bd_IMAGES_STORAGE_BACKEND` accordingly. |
| O2 | operator | 🔒 | **(SharePoint)** Create/confirm a live document library; **bind** `cr1bd_imagessharepoint` to it; set the `ImagesSharePointSite` / `ImagesSharePointLibrary` flow params. |
| O3 | operator | 🔒 | **(Local drive)** Install + **register** the on-premises data gateway in **standard mode** on an always-on, **domain-joined** Windows host with line-of-sight to the SMB share; **keep the recovery key**; then create the **File System connection** (Root folder = the UNC share, `DOMAIN\Username` + password, select the gateway) and bind `cr1bd_imagesfilesystem`. |
| O4 | operator | 🔒 | **(Azure File Sync alt.)** Install the agent on the Windows Server hosting the share; create a Storage Sync Service + sync group (Azure file share = cloud endpoint, local folder = server endpoint); point the flow at the Azure file share. |
| O5 | operator | 🔒 | Confirm **DLP**: File System + SharePoint must share the **same data group** as Dataverse + Office 365 in the Dev environment, or import/run fails. |
| O6 | operator | 🔒 | **Re-open `classify-persist` in the designer and Save** (children embed connections; `clientdata` can't refresh them). |
| O7 | operator | 🔒 | **Live test on `digital@` only:** send an images-only email; confirm bytes land in the chosen backend and Evidence rows carry a `cr1bd_storagepath` into it; confirm File System size limits aren't breached by real photo sets; confirm the Code App still lists the case's images. **No seed/mock images** — only the authorized `digital@` inbox. |

> **Reminder:** Claude binds exactly **none** of O1–O7. The default `azureblob` keeps the live pipeline on
> the permanent fallback until the operator acts. Only **one** connection reference is ever bound — leave
> the others `usedBy:[]`/unbound (linter WARN), so no flow demands a connection that isn't there.

### 6c. `docs/gated.md` rows to add (reconciled separately — not edited here)

- **(H)** Bind the SharePoint connection to a live document library (if SharePoint chosen). *Phase 2.*
- **(H)** Install + register the on-premises data gateway (standard mode) on an always-on domain-joined
  Windows host that can reach the SMB share; keep the recovery key; create the File System connection
  (UNC Root folder + Windows creds + gateway) (if local-drive chosen). *Phase 2.*
- **(H)** Supply the local share path + service account; confirm DLP data group; run live write/read tests.
  *Phase 2.*

---

## 7. Open questions

1. **Which backend does the operator actually want** for images-only cases — Azure Blob (already live),
   SharePoint (governance), the existing local SMB share, or Azure File Sync? The abstraction defers this,
   but the provisioning effort differs sharply (Blob = none; SharePoint = bind + library; local-drive =
   gateway + host + recovery key).
2. **Exact local share details** — UNC path, whether the always-on host is domain-joined with line-of-sight
   to the share, and the Windows **service account** for the File System connection. None are in the repo.
3. **Photo sizes vs the gateway 2 MB write limit (§5b)** — are real images-only sets within 2 MB/file, or
   does the local-drive path need downscaling / Azure File Sync? Decides whether the gateway option is even
   viable for typical phone JPEGs.
4. **Code App image DISPLAY for non-Blob backends** — the app reads `cr1bd_storagepath` but **does not
   fetch bytes**; rendering File System / SharePoint images **in-app** would need a connector-SDK fetch
   (`GetFileContentByPath`) or a thumbnailing Function, because **Code Apps enforce `connect-src 'none'`**
   and forbid raw `fetch` (memory `codeapp-csp-use-connectors`). Confirm whether in-app preview of
   images-only cases is required for M1, or whether the link-only listing suffices.
5. **Scope of the selector** — flow-side only, or also expose it to the manual-intake Code App write path?
   (Manual intake today creates Evidence rows **without bytes**, so this is only relevant if manual uploads
   should also honour the chosen backend.)

---

## 8. Risks

- **DLP** — File System + SharePoint must sit in the **same DLP data group** as Dataverse + Office 365 in
  Dev, or import/run fails. The manifest `notes[2]` and `phase-1-operational` both flag this; confirm
  before activation.
- **Gateway operational dependency** — a single always-on domain-joined host (HA needs a cluster), a
  recovery key Microsoft cannot recover, and the manual connection re-encryption requirement make the
  local-drive path materially heavier than the Blob/SharePoint cloud paths.
- **Gateway 2 MB write ceiling** — tighter than the connector's advertised 20 MB; real photos may breach
  it. Large/bulk sets may need chunking or Azure File Sync. **Do not document only the rosier 20 MB.**
- **Byte-encoding mismatch** — File System / SharePoint `CreateFile` want **binary** (`base64ToBinary`); the
  **parser** connector wants **raw base64** (memory `powerplatform-connector-base64-double-encode`).
  Applying the wrong rule to the wrong branch corrupts files / 400s. Keep the rules **branch-scoped**.
- **Inventing connection references** is normally discouraged (the manifest is a closed set). Mitigated by
  keeping both new refs **`usedBy:[]`/unbound** until the operator binds exactly one, so the linter stays
  green and no flow accidentally requires them.
- **Code App preview gap** — images on File System/SharePoint render the row but **not** the picture without
  an added connector/Function; risk of an honest-but-empty thumbnail for images-only cases until that's
  built (open question 4).
- **No-mock-data** — all testing uses **real images via `digital@` only**; Info / Engineers / Desk are
  operator-only and **no seed images** may be introduced (memory `live-services-boundary`).

---

## 9. Files & identifiers referenced

- **Swap point (the action to refactor):** `flows/definitions/classify-persist.definition.json` →
  `Scope_Persist_Attachments → Apply_to_each_attachment → Upload_bytes_to_storage` (Azure Blob `CreateFile_V2`),
  `Create_Evidence_row` writes `cr1bd_storagepath = @body('Upload_bytes_to_storage')?['Path']`.
- **Connection manifest:** `flows/connection-references.json` (existing `cr1bd_evidenceblob` →
  `shared_azureblob`; the `shared_evavalidation` `usedBy:[]` precedent).
- **Gate manifest:** `dataverse/environment-variables.json`.
- **Linter:** `flows/validate-flows.mjs` (check 2 = declared-only; declared-but-unused = WARN).
- **Flow state:** `flows/flow-state.json` (all `state=off`).
- **Companion how-to (operator):** `docs/activation/images-storage-backend-activation.md` *(authored by B6)*.
- **Live storage account:** `cespkevidstdev01` — `rg-collisionspike-dev`, **UK South**, subscription
  `e6076573-23a5-46a8-acef-7e22d264e5db`.
- **Env id:** `b3090c42-51fb-ee24-9868-474da322a3ad`; **org:** `https://collisionengineers-dev.crm11.dynamics.com`.
- **Rules/gotchas:** memory `codeapp-csp-use-connectors`, `powerplatform-connector-base64-double-encode`,
  `flow-webhook-trigger-provisioning`, `live-services-boundary`.

---

## 10. Authoritative sources (Microsoft Learn — re-verified)

- **File System connector reference** — Standard class; not shareable; Root folder `\\MACHINE\myShare` /
  `C:\myShare`; Windows auth `DOMAIN\Username` + Gateway; `CreateFile`/`GetFileContentByPath`/`OnNewFiles`
  return `BlobMetadata` (`Path`); limits **20 MB create / 30 MB general / 30 s gateway timeout / 1000 MB per
  60 000 ms / 100 calls per 60 s**: <https://learn.microsoft.com/en-us/connectors/filesystem/>
- **Connect to on-premises file systems (Logic Apps)** — Windows-only; **mapped network drives not
  supported**; Root-folder UNC example `\PublicShare\MyFileSystem`; Windows username/password + gateway:
  <https://learn.microsoft.com/azure/connectors/file-system>
- **What is an on-premises data gateway? — Considerations** — **2 MB write payload limit**; 2 MB request /
  8 MB compressed response for reads:
  <https://learn.microsoft.com/data-integration/gateway/service-gateway-onprem#considerations-and-limitations>
- **Manage an on-premises data gateway in Power Automate** — install **standard mode** (personal = Power BI
  only); supported connectors list includes **File System** and **SharePoint**:
  <https://learn.microsoft.com/power-automate/gateway-manage>
- **Install an on-premises data gateway** — download + register a standard gateway:
  <https://learn.microsoft.com/data-integration/gateway/service-gateway-install>
- **Add/manage connections — on-premises data gateway** — create a connection through a gateway in Power
  Automate: <https://learn.microsoft.com/power-automate/add-manage-connections>
- **Microsoft SharePoint connector in Power Automate** — SharePoint actions (Create file etc.); gateway note
  for SharePoint Server: <https://learn.microsoft.com/sharepoint/dev/business-apps/power-automate/sharepoint-connector-actions-triggers#sharepoint-actions>
- **Plan for an Azure File Sync deployment — Networks** — **SMB never used to Azure**; all HTTPS/443:
  <https://learn.microsoft.com/azure/storage/file-sync/file-sync-planning#networks>
- **Create an Azure File Sync server endpoint** — server endpoint must be a local path; **NAS/mounted shares
  not supported**: <https://learn.microsoft.com/azure/storage/file-sync/file-sync-server-endpoint-create>
- **Deploy Azure File Sync — Prerequisites** — storage account needs **Allow storage account key access =
  Enabled** + SMB 3.1.1 / NTLM v2 / AES-128-GCM:
  <https://learn.microsoft.com/azure/storage/file-sync/file-sync-deployment-guide#prerequisites>
- **Environment variables overview (Power Automate)** — flows read env-var values
  (`environmentvariabledefinitions`): <https://learn.microsoft.com/power-automate/environment-variables-overview>

> **Milestone tag.** Images-only storage is the **M1** permanent-fallback transport (Azure Blob bytes +
> Dataverse refs). This doc makes the backend a **deferred, swappable** choice; it **builds the abstraction
> offline and actions none of the live binding** — that is the operator's (§6b).
