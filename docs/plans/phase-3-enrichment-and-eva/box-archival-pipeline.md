# Box archival pipeline — full design + activation runbook (ROADMAP 3d)

> ⚠️ **SUPERSEDED (2026-06-22) — reconciled DOWN to [ADR-0012](../../adr/0012-box-centric-intake-additive-hybrid.md)
> (the Box-centric intake pivot, Phase 7).** This doc describes the **M2.D** slice: Box archival fired
> **at EVA-submit** via `finalize-eva-box`, using the **first-party** Box connector. Phase 7 supersedes
> two of its load-bearing assumptions:
> 1. **First-party is insufficient; a custom connector is mandatory.** The first-party Box connector is
>    file-only (no folder-create / shared-links / webhooks / File Requests). All non-byte Box automation now
>    runs through the **custom `cr1bd_box_rest` connector** (CCG token minted inside the `box-webhook` Azure
>    Function, never the connector). First-party `shared_box` is **retained for the `finalize-eva-box` BYTE
>    path only** (the S2 `CreateFile` after `GetFileContentByPath_V2`) — this S2 content-bind detail below is
>    still correct and still the byte mechanism.
> 2. **The folder is minted at parse-confirm, not at submit.** `box-folder-create` mints the UPPERCASE
>    Case/PO folder when `cr1bd_casepo` first exists; `finalize-eva-box` now **augments** that pre-existing
>    folder instead of creating it, and reads `cr1bd_BOX_FOLDER_ROOT_ID` instead of a hard-coded param.
>
> Where this doc and ADR-0012 / [docs/HISTORICAL/box-integration-pivot/plans/00-BUILD-PLAN.md](../../HISTORICAL/box-integration-pivot/plans/00-BUILD-PLAN.md)
> disagree, **the ADR + build plan win** (precedence: ADR > architecture/plans). Read
> [docs/plans/phase-7-box-integration/](../phase-7-box-integration/) for the current design; this doc
> remains useful for the EVA photo-order rule, the UPPERCASE-casing confirm, and the S2 byte-bind detail,
> which Phase 7 keeps unchanged. **Status: superseded by Phase 7. The Phase-7 Box Dataverse schema +
> `cr1bd_BOX_*` env-vars are applied live (all `BOX_*` gates OFF); the `box-webhook` Function
> (`cespkbox-fn-v76a47`) **is deployed to `rg-collisionspike-dev` and Gate-C-verified, gated OFF and
> secret-free**, while the `cr1bd_box_rest` connector and Box flows are authored offline (`state=off`),
> not deployed/bound. The connector import, webhook subscription, KV secrets and gate flips remain
> pending (operator-blocked on CCG auth).**

> **Status (refreshed 2026-06-24):** design + bind/confirm/activate runbook. The Box step **is built
> offline** (`flows/definitions/finalize-eva-box.definition.json`, imported `state=off`). Two findings this
> doc originally raised are now **resolved**: (i) the **S2 content bug is fixed** — the flow uses real
> `CreateFile`+`folderPath` (`GetFileContentByPath_V2` → file **content**, not the path string), and (ii)
> the non-byte ops that "do not exist on the first-party connector" are now carried by the **custom
> `cr1bd_box_rest` connector** under Phase 7 (the first-party `shared_box` is retained for the byte path
> only). Under Phase 7 the folder is **minted at parse-confirm** and `finalize-eva-box` **augments** it; the
> EVA-REST branch now **streams photos** (sweep wave 2). This doc remains the deep dive behind ROADMAP §3d
> for the **EVA photo-order rule**, the **UPPERCASE-casing confirm**, and the **S2 byte-bind detail** (kept
> unchanged by Phase 7); the live design is [docs/plans/phase-7-box-integration/](../phase-7-box-integration/).
> The remaining work is **operator-gated** (bind, confirm casing, gate flips). Author date **2026-06-20**;
> superseded by Phase 7 (top banner). Read-only research; **no flow / Dataverse / Box / EVA changed by this plan**.

---

## 0. Milestone placement (per [milestone-model.md](../milestone-model.md))

Box archival is split across two milestones — **the split is the whole point of this doc**:

- **M2.D — Box archival activation** is the **automation slice**: bind `cr1bd_box` + `cr1bd_evidenceblob`,
  fix S2, confirm the UPPERCASE folder casing live, and turn the archive on. This is M2 (richer
  transports at scale), **not** M1.
- **Sequencing fact (load-bearing):** Box can go live on **`EVA_API_ENABLED=false`** — the JSON
  drag-drop transport — **before** M2.C (EVA Sentry REST) exists. The archive folder + the
  `<casepo>.eva.json` drag-drop file are produced regardless of the EVA transport. So an operator
  can switch Box on as soon as the S2 fix is committed, with EVA still firmly on the M1 drag-drop
  path. `EVA_API_ENABLED` gates the **EVA transport**, never the **finalization** (the Box archive
  always runs).

> Phase ≠ Milestone reminder: Phase 3 mixes M1 (3a enrichment, 3b drag-drop, 3e readiness) and M2
> (3c EVA REST, **3d Box**). This doc is the 3d = M2.D half.

---

## 1. Boundary legend (per [AGENTS.md](../../../AGENTS.md) + memory `live-services-boundary`)

| Tag | Meaning | Who |
|---|---|---|
| **[BUILD]** | Authored + verified **offline** — rewrite the flow JSON to the real connector contract, encode the S2 fix, extend the linter, run `node flows/validate-flows.mjs`. Zero tenant/Box/Azure contact. | Claude |
| **[DEPLOY-WITH-LOGIN]** | Import the rewritten definition into the solution; read-only `pac connection list` GETs. Touches the tenant; **no** live Box sign-in; **no** secret values. | Operator (Claude may draft commands) |
| **[RESERVED-FOR-USER]** 🔒 | Sign into the **live Box account** (interactive OAuth), bind `cr1bd_box`, set `BoxArchiveRootId`, bind `cr1bd_evidenceblob` (Azure Blob access key), confirm UPPERCASE casing, turn the flow ON, and all live archive + parity tests. **No Box API key is ever fetched or used by Claude.** | **Operator only** |

**CSP (AGENTS.md truth #1):** the Code App never calls Box directly (`connect-src 'none'` — memory
`codeapp-csp-use-connectors`). The Code App writes a "submit requested" signal; the cloud flow
`finalize-eva-box` (server-side HTTP, CSP-exempt) does all Box I/O via the `cr1bd_box` connector.
**Flow-webhook rule (truth #2):** `finalize-eva-box` is `Request`/child-triggered, **not** a
connection-webhook trigger, so turning it on is a state toggle — no designer re-arm dance
(memory `flow-webhook-trigger-provisioning`). The one designer touch is **rebinding the two
connections + the DLP grouping** at import.

---

## 2. The business contract this pipeline must honour (domain rules — non-negotiable)

From [CLAUDE.md](../../../CLAUDE.md) domain model, [integrations.md](../../architecture/integrations.md) §Box,
and the [eva-sentry-api](../../architecture/eva-sentry-api.md) image rules:

1. **Folder name = UPPERCASE Case/PO.** Box folder is named with the canonical Case/PO in **UPPER**
   case; EVA uses the same identity in **lower** case. e.g. EVA `test26001` → Box `TEST26001`. The
   `cr1bd_casepo` column is *"stored canonical; rendered lowercase for EVA, UPPERCASE for Box"*
   (`dataverse/schema/case.json`). Case/PO format = `Principal`(4-char) + 2-digit year + 3-digit
   provider sequence, e.g. `CCPY26050`; **absent until EVA submit**, so finalize reads it freshly off
   the Case.
2. **EVA photo order (mirrored into Box):** upload the **2 preview photos first** — (i) the vehicle
   **overview** (must show the **full registration**) and (ii) the **main-damage closeup** — then
   **ALL** photos in sequence **including those two again**. The Box archive mirrors this exact order.
3. **Photo exclusion:** any photo showing a **person's reflection** is unusable and must be **absent**
   from both the EVA set and the Box archive (`cr1bd_excluded=true`, manual in M1).
4. **Evidence set archived:** images **plus** `.eml`, instruction/valuation **PDFs**, and the **EVA
   JSON** (`integrations.md` §Box: *"copy evidence (images, .eml, PDFs, EVA JSON) into the folder"*).
5. **Finalisation is atomic with EVA** (one step, in M1) and **idempotent** by
   `cr1bd_finalizedpayloadhash` (stamped LAST). Box always runs; the EVA transport choice never gates
   archival (ADR-0008: the tool boundary ends at the EVA/Box handoff).

---

## 3. The real Box connector contract (verified on Microsoft Learn 2026-06-20)

Source: [learn.microsoft.com/connectors/box](https://learn.microsoft.com/connectors/box/) (fetched
2026-06-20). **The committed definition is wrong about three things** — corrected here.

**Publisher / class.** Box is a **first-party Microsoft connector**, **Class = Standard** (Power
Apps / Power Automate / Logic Apps / Copilot Studio all list it **Standard**, no Premium badge).
> ⚠️ **Reconciliation note (resolved):** `flows/connection-references.json` now records `cr1bd_box` as
> `"tier": "Standard"` — matching Learn. (An earlier draft recorded `"Premium"`, which was wrong; the
> manifest has since been corrected.) DLP grouping is unaffected: Standard + the Premium connectors can
> coexist in one data group; see §8.

**Actions (the complete set — there is NO folder-create action):**

| Operation ID | Display | Key params | Returns |
|---|---|---|---|
| `CreateFile` | Create file | `folderPath` (string, **the path**), `name` (string), `body` (**binary**) | `BlobMetadata` |
| `CopyFile` | Copy file | `source` (url), `destination` (path), `overwrite` | `BlobMetadata` |
| `UpdateFile` | Update file | `id`, `body` (binary) | `BlobMetadata` |
| `DeleteFile` | Delete file | `id` | — |
| `GetFileContentByPath` | Get file content using path | `path`, `inferContentType` | binary |
| `GetFileContent` | Get file content using id | `id`, `inferContentType` | binary |
| `GetFileMetadataByPath` / `GetFileMetadata` | metadata by path / id | `path` / `id` | `BlobMetadata` |
| `ListFolder` / `ListRootFolder` | list folder / root | `id` / — | array of `BlobMetadata` |
| `ExtractFolderV2` | Extract archive to folder | `source`, `destination`, `overwrite` | array |

**The three committed-definition errors this rewrite fixes:**

- ❌ `Create_box_folder_UPPERCASE` with `operationId: CreateFolder` + `parentId` — **no such operation
  exists**. There is **no first-party folder-create action.** The UPPERCASE folder is created
  **implicitly** by writing files into its `folderPath` (SharePoint-style; see §5 Open Question 1).
- ❌ `Copy_evidence_to_box` with `operationId: CreateFile` + `folderId` param — **`CreateFile` takes
  `folderPath` (a path string), not `folderId`.** (`folderId` is a *trigger* param, not a
  `CreateFile` param.)
- ❌ `Copy_evidence_to_box.body = @items(...)?['cr1bd_storagepath']` — **this is the S2 bug.** `body`
  must be **binary file content**; `cr1bd_storagepath` is an Azure Blob **path string**. See §4.

**Connector limits & gotchas (from Learn — these shape the loop):**

- **Max file size 75 MB.** A single evidence file > 75 MB fails (see §5 Q4 — assumed not hit for case
  photos; confirm for large scanned instruction PDFs).
- **Throttling: 100 API calls / connection / 60 s**; **1,000 MB transfer / 60 s** bandwidth window.
  Each archived item costs **2 calls** (1 Azure-Blob `GetFileContentByPath_V2` read + 1 Box
  `CreateFile`). `repetitions: 1` already serialises the loop; a very large photo set should still
  stay inside the window (note as a known limit, §9).
- **Known issue #6:** a same-name re-upload is an **update event, not a 409** → the loop is
  **resume-safe by filename** (a partial-failure re-run overwrites, never duplicates).
- **Known issue #3:** ≤ **10,000 items** per folder in the path (a per-case folder is nowhere near).
- **Known issue #4:** a file-picker path may start `//All Files/...`; for `folderPath` use a plain
  leading slash (`/TEST26001/...`). Root is a single `/`. We build the path from `toUpper(casepo)`,
  so this is avoided — but **never** hand a `//All Files` path to `folderPath`.
- **Known issue #1:** the connector **does not support SSO connections** — *"use standard connection
  instead."* This is the auth posture: a standard **interactive Box OAuth** connection (§6).

---

## 4. The S2 content-bind fix (the one real code defect) 🔧

**The bug (gated.md S2).** `Copy_evidence_to_box` sets
`"body": "@items('Upload_photos_in_eva_order')?['cr1bd_storagepath']"`. Per
`dataverse/schema/evidence.json`, `cr1bd_storagepath` is *"Reference to the bytes in the … Azure Blob
container"* — i.e. an Azure Blob **path string** like `/evidence/intake/<messageId>/IMG_0421.jpg`,
**not the bytes**. So today every archived photo would be written as a **tiny text file containing the
path**, not the image. Silent corruption — invisible until a human opens the Box file. **The fix is
load-bearing.**

**The fix.** Bind `cr1bd_evidenceblob` (the existing Azure Blob connection ref) and insert an Azure
Blob **Get blob content using path (V2)** action *before* each Box `CreateFile`, then pass its
**binary** output as the `CreateFile` body:

| Field | Value |
|---|---|
| Connector | Azure Blob Storage (`shared_azureblob` / ref `cr1bd_evidenceblob`) |
| Operation | **`GetFileContentByPath_V2`** ("Get blob content using path (V2)") |
| `dataset` | `AccountNameFromSettings` (account `cespkevidstdev01`, access-key auth — matches the `classify-persist` storage convention; the connector's "AccountNameFromSettings" known-issue) |
| `path` | `@items('Upload_photos_in_eva_order')?['cr1bd_storagepath']` (the stored Blob path) |
| → feeds | Box `CreateFile.body = @body('Get_blob_content_v2')` (real bytes) |

The Azure Blob managed **Get blob content (V2)** action **implicitly chunks** — 50 MB no-chunk, up to
**1,024 MB** chunked
([Learn](https://learn.microsoft.com/azure/connectors/connectors-create-api-azureblobstorage#limitations)) —
so the read side comfortably exceeds the 75 MB Box write ceiling; the **Box** 75 MB limit is the
binding one (§5 Q4).

**Why only the photos need this, not the EVA JSON:** the drag-drop `.eva.json` body is
`@variables('evaPayload12')` — a **JSON string = already text content** — so it goes straight into
`CreateFile.body` with **no** `GetFileContent`. Only the **photo (and `.eml`/PDF) bytes** live in Blob
and need the read.

**Encoded as a lint (so it can't regress):** extend `flows/validate-flows.mjs` with a finalize-specific
check (the linter already bans a literal `parentId`/`folderId` id via `BOX_ID_LITERAL_RE`) that
asserts, for `finalize-eva-box.definition.json`: (a) **no** Box action with `operationId: CreateFolder`
and **no** `parentId` param; (b) **every** Box `CreateFile` `body` that uploads photo/`.eml`/PDF bytes
is fed by a `GetFileContentByPath_V2` output, **not** a raw `cr1bd_storagepath` token. This pins the S2
fix structurally.

---

## 5. The rewritten flow (CLAUDE-buildable) [BUILD]

Rewrite `flows/definitions/finalize-eva-box.definition.json` inside the existing
`Scope_Finalize` / `Guard_already_finalized` idempotency latch. The trigger, env-var gate read
(`cr1bd_EVA_API_ENABLED`), `Get_case`, audit actions, and `Stamp_finalized_hash` (stamped LAST)
**stay as-is**. The changes:

**(a) DELETE `Create_box_folder_UPPERCASE` entirely.** No first-party folder-create op exists; the
UPPERCASE folder is created implicitly by `CreateFile`'s `folderPath`. This also removes the fictional
`parentId` dependency and the 409-on-collision folder handling (Box known-issue #6 makes re-runs safe
anyway). `BoxArchiveRootId` stays a **flow parameter** (never a hardcoded live Box id — the linter
enforces this) and is composed into the path **only if** a non-root archive parent is wanted (see
Q1) — the simplest live posture is to bind the connection **rooted at the archive parent** so
`folderPath` is just `/<CASEPO>/...`.

**(b) `Order_evidence` (unchanged logic).** Dataverse `ListRecords` on `cr1bd_evidences`,
`$filter` = `_cr1bd_caseid_value eq <caseId> and cr1bd_kind eq 100000000 and cr1bd_acceptedforeva eq
true and cr1bd_excluded eq false`, `$orderby cr1bd_sequenceindex asc`. The **2 previews seeded at
`sequenceIndex` 0,1** (overview-with-full-registration + damage_closeup) come first, then the full
sequence including those two again. **Invariant ownership comment** (keep inline): the photo order /
2-previews-first rule is owned by **how classify / the Code App stamps `cr1bd_sequenceindex`** (manual
or plate-OCR in M1 — see ADR-0009); the Box archive merely mirrors the exact EVA upload order.

**(c) `Upload_photos_in_eva_order` (`Foreach`, `concurrency.repetitions: 1` PRESERVED).** Per photo,
**two** actions in sequence:

```
1. Get_blob_content_v2  (Azure Blob, shared_azureblob)
      operationId  : GetFileContentByPath_V2
      dataset      : AccountNameFromSettings
      path         : @items('Upload_photos_in_eva_order')?['cr1bd_storagepath']
2. Copy_evidence_to_box (Box, shared_box)   runAfter Get_blob_content_v2:[Succeeded]
      operationId  : CreateFile
      folderPath   : @concat('/', toUpper(outputs('Get_case')?['body/cr1bd_casepo']))
      name         : @items('Upload_photos_in_eva_order')?['cr1bd_filename']
      body         : @body('Get_blob_content_v2')          ← real bytes (S2 fix)
```

`repetitions: 1` is what preserves the previews-then-all order; never raise it.

**(d) Non-image evidence pass (NEW — `integrations.md` requires `.eml` + PDFs + EVA JSON in the
folder).** *After* the ordered photo set (so photo order is never perturbed), add a second ordered
`Order_nonimage_evidence` ListRecords (`cr1bd_kind` in instruction `100000002` / email `100000003` /
valuation) feeding an identical `GetFileContentByPath_V2 → CreateFile` pair into the **same**
`/<CASEPO>` folder. Keep it **inside** `Scope_Finalize` so it shares the idempotency latch.

**(e) The drag-drop branch (`EVA_API_ENABLED=false`, the M1 default + permanent fallback).** Change
`Stage_drag_drop_json` to the path-based `CreateFile`: `folderPath = @concat('/',
toUpper(...casepo))`, `name = @concat(toLower(...casepo), '.eva.json')`, `body =
@variables('evaPayload12')`. **No `GetFileContent`** (JSON string is already content). The `.eva.json`
filename stays **lowercase** but lands in the **UPPERCASE** folder — one folder per case (§5 Q2). This
is the same 12-field serializer the Code App uses (`mockup-app/src/contracts/eva-export.ts`, schema
`contracts/eva-payload.schema.json`) → **byte-identical** to the API body for those 12 fields (the
parity test, §7).

**(f) The EVA REST branch (`EVA_API_ENABLED=true`).** **Unchanged transport** — `EVA_instruction_inspection`
on `shared_evasentry` (`operationId InstructionInspection`). The Function performs the **two-request**
photo submission **server-side** (2 previews on `POST /Instruction/Inspection`, then the full ordered
set on `POST /Note/SubmitNote`, matched by `VehReg` + `ClmNo`), which is why the flow already passes
`body/vrm = cr1bd_vrm` and `body/clmNo = cr1bd_caseref`. The Sentry token lifecycle lives **inside**
the Function (custom connectors can't do the OAuth2 client-credentials grant — see
[eva-sentry-rest-submission.md](./eva-sentry-rest-submission.md)). Box archival is independent and
runs either way.

**Lint green after the rewrite:** all four connection refs (`shared_box`, `shared_azureblob`,
`shared_commondataserviceforapps`, `shared_evasentry`) stay **already-declared**; `BoxArchiveRootId`
stays a **parameter**; no secret literals; `cr1bd_evidenceblob.usedBy` now includes `finalize-eva-box`
(it reads Blob content there, not just `classify-persist`). Run `node flows/validate-flows.mjs` → must
stay OK.

---

## 6. Auth — how the Box connection authenticates (and the escalation path)

**First-party connector = interactive Box OAuth only.** The Microsoft Box connector authenticates by
**standard interactive Box OAuth** — Box known-issue #1: *"does not support SSO connections, please
use standard connection instead."* There is **no JWT / Client-Credentials-Grant / service-account
option on the first-party connector**: the bound connection runs **as a human Box user**.

| Auth option | Available on | Notes |
|---|---|---|
| **Interactive OAuth (standard connection)** | **First-party Box connector** (what we use) | The operator signs in once at activation; the connection runs as that Box user. **Recommended: a dedicated Box service account**, not a named staff login, so archives aren't tied to one person. |
| **JWT (server auth, Box app)** | *Custom connector over the Box REST API only* | Non-interactive server identity. **Out of scope for M2.D** — captured as the escalation path if a true service identity is ever mandated. ([developer.box.com/guides/authentication](https://developer.box.com/guides/authentication/)) |
| **Client-Credentials Grant (CCG)** | *Custom connector over the Box REST API only* | Non-interactive, app-as-service. Same escalation note as JWT. |
| **OAuth2 (3-legged)** | Box REST API | What the first-party connector wraps. |

**Decision to record (design, not build):** confirm the operator connects the first-party connector
via OAuth as a **dedicated Box account** (recommended) vs a personal login. **If** a non-interactive
service identity is ever required, the fallback is a **custom connector over the Box REST API using
JWT or CCG** — out of scope for M1/M2.D but documented here as the only path that gets a true service
identity. **Claude never holds or fetches any Box credential or API key.** (Surfaced as §9 Open
Question 3 and cross-referenced in gated.md H6/B5.)

---

## 7. Parity & verification

**Offline (Claude, pre-activation) [BUILD]:**

- `node flows/validate-flows.mjs` → **OK** after the rewrite (closed connection set, no secrets,
  `BoxArchiveRootId` still a parameter, the new finalize S2/CreateFolder lint passes).
- The rewritten definition imports against the **real** Box swagger (no `CreateFolder`/`parentId`/
  `folderId`-on-CreateFile that would fail validation).
- The drag-drop `.eva.json` body equals `mockup-app/src/contracts/eva-export.ts` output for the 12
  fields (the cross-transport parity already asserted in
  [eva-sentry-rest-submission.md](./eva-sentry-rest-submission.md) §6).

**Live (operator, against a TEST case) [RESERVED-FOR-USER] 🔒:**

- **Folder casing (H6 / B5):** the Box folder is `TEST26001` (UPPERCASE), created by writing into
  `/TEST26001/...` (confirms the auto-create-via-path assumption — §5 Q1).
- **Photo order:** in Box, the **2 previews appear first** (overview + damage closeup), then the full
  set including those two again; the **overview shows the full registration**; **reflection-excluded
  photos are absent**.
- **The drag-drop == API parity test** (gated.md, the cutover gate): with `EVA_API_ENABLED=false`,
  confirm the `<casepo>.eva.json` staged to Box is the **byte-identical** body a manual drag-drop into
  EVA would use, the archive succeeds, and `cr1bd_finalizedpayloadhash` **stamps last** (a re-run is a
  no-op). **Only after parity passes** consider flipping `EVA_API_ENABLED=true` in TEST.

---

## 8. Activation runbook — D.1–D.5 (operator-gated) 🔒

> Prerequisite: the **rewritten** definition (§5) is committed and imported. ⚠️ The operator must
> import the **rewritten** definition, **not** the committed one — the committed
> `CreateFolder`/`folderId` actions will **fail import/validation** against the real Box swagger.
> The drag-drop transport (`EVA_API_ENABLED=false`) can finalise into Box **before** EVA REST exists
> (§0). No Box API key is supplied by Claude at any point.

| # | Step | Tag | Detail |
|---|---|---|---|
| **D.1** | **Create + bind the Box connection** `cr1bd_box` by signing into the **live Box account** (interactive OAuth — a **dedicated Box service account** recommended, §6). | [RESERVED-FOR-USER] 🔒 | The connection runs as that Box user. Claude does **not** connect or supply any key. |
| **D.2** | **Set `BoxArchiveRootId`** (the flow parameter) to the **real** parent archive folder id — or bind the connection **rooted at** that archive parent so `folderPath` is just `/<CASEPO>/...`. | [RESERVED-FOR-USER] 🔒 | Never a hardcoded id in the definition (linter-enforced). |
| **D.3** | **Bind `cr1bd_evidenceblob`** (Azure Blob, account **`cespkevidstdev01`**, container **`evidence`**, **access-key** auth, `dataset=AccountNameFromSettings`) so `GetFileContentByPath_V2` can read the photo bytes (the S2 fix needs this bound). | [RESERVED-FOR-USER] 🔒 | The access key is the operator's; never in a definition. |
| **D.4** | **DLP grouping + import:** confirm Box (**Standard**) + Azure Blob (Premium) + Dataverse (Premium) + EVA Sentry (Premium custom) sit in the **same** DLP data group in the target env; import the rewritten definition. | [DEPLOY-WITH-LOGIN] | A wrong-DLP or unshared Box connection blocks import/run. |
| **D.5** | **Confirm UPPERCASE casing (B5/H6) + turn on, drag-drop transport first:** with `EVA_API_ENABLED=false`, turn `finalize-eva-box` **ON**; run a **TEST** case; verify the `TEST26001` folder, the photo order (2 previews then all), the full registration on the overview, reflection-excluded photos absent, and the `<casepo>.eva.json`; run the **drag-drop == API parity** test; only then consider EVA REST (M2.C). | [RESERVED-FOR-USER] 🔒 | This is the H6 confirmation. EVA can stay on M1 drag-drop while Box is live. |

---

## 9. Open questions

1. **Does `CreateFile` via `folderPath` auto-create the missing UPPERCASE folder hierarchy**
   (SharePoint-style), or must the folder pre-exist? Learn does not state it explicitly; the connector
   is path-based and the SharePoint analogue auto-creates. **Confirm on D.5.** If it does **not**
   auto-create, the fallback is to **pre-create the folder once** (e.g. operator-created, or a one-off
   custom-connector `POST /folders`) — **no first-party `CreateFolder` exists**, so binding the
   connection rooted at the archive parent (so each case writes `/<CASEPO>/...`) is the cleanest hedge.
2. **Box folder names are case-insensitive** (`developer.box.com/reference/post-folders`: *"New
   Folder" collides with "new folder"; 409 `item_name_in_use`*). So `TEST26001` and `test26001`
   **collide** — the UPPERCASE rule is a **display convention**, and the lowercase `<casepo>.eva.json`
   sits **inside the same single UPPERCASE folder** (acceptable per `integrations.md`). Assumed: **one
   folder per case**, named UPPERCASE; no lowercase sibling. Confirm no other process ever creates a
   lowercase sibling (it would 409).
3. **Auth identity:** dedicated Box **service user** vs a named staff login? First-party connector is
   interactive-OAuth-only; a true non-interactive service identity forces a **custom connector** (JWT
   or CCG, §6). Decide whether M2.D needs that or defers it. (gated.md H6/B5.)
4. **75 MB Box per-file limit** vs the 50 MB-no-chunk / 1,024 MB-chunked Azure Blob read — are any
   single evidence photos/PDFs **> 75 MB**? Assumed **no** for case photos; **confirm** for large
   scanned instruction PDFs (a > 75 MB PDF would fail the Box write).
5. **Non-image evidence ordering:** `.eml` + instruction/valuation PDFs are archived **after** the
   ordered photo set (so photo order is never disturbed) — confirm that ordering is acceptable.

---

## 10. Risks

- **Regression if activated as-is:** the committed `Create_box_folder_UPPERCASE` (`CreateFolder`) and
  `Copy_evidence_to_box` (`folderId`) **fail import/validation** against the real first-party Box
  swagger — the operator must import the **rewritten** definition (§5), not the committed one.
- **S2 silent corruption:** today's `body = cr1bd_storagepath` writes the literal path **text** as the
  Box file, so every archived photo would be a tiny text file, not the image — invisible until a human
  opens the Box file. The `GetFileContentByPath_V2` bind (§4) is load-bearing.
- **Case-insensitive Box folders:** if any process ever creates a lowercase sibling it collides
  (409 `item_name_in_use`) — keep exactly **one UPPERCASE folder per Case/PO** and treat re-runs as
  same-name updates (Box known-issue #6).
- **Throttling on big cases:** 100 calls / connection / 60 s and 1,000 MB / 60 s; each item costs 2
  calls (1 Blob read + 1 Box write). `repetitions: 1` serialises, but a very large photo + non-image
  set should stay inside the window. Known M1 limit.
- **Idempotency vs a changed photo set:** the latch (`cr1bd_finalizedpayloadhash`, stamped LAST) +
  same-name re-upload-as-update make a **partial-failure re-run** safe. But a **changed** photo set
  between runs could leave **stale** files (there is **no delete pass**). Acceptable for M1; note as a
  known limit.
- **Designer rebinding:** finalize is `Request`/child-triggered (low webhook risk), but rebinding the
  two connections + the DLP grouping still needs a designer save at import; an unshared or wrong-DLP
  Box connection blocks import.

---

## 11. Decision summary (one line)

**`finalize-eva-box` is built but mis-wired: it invents a `CreateFolder` op the first-party Box
connector doesn't have and uploads the Blob path string instead of file bytes (S2). Claude can fix
both offline — delete `CreateFolder` (the UPPERCASE folder is created implicitly via `CreateFile`'s
`folderPath`), switch every upload to `CreateFile`(`folderPath`/`name`/binary `body`), and insert an
Azure Blob `GetFileContentByPath_V2` before each write so Box receives real bytes — keeping the
2-previews-then-all photo order, the lint green, and `BoxArchiveRootId` a parameter. The operator-gated
remainder is H6/B5: connect the live Box account by interactive OAuth (the connector supports no
JWT/CCG — a custom connector is the only service-identity escalation), set `BoxArchiveRootId`, bind the
Azure Blob evidence connection, confirm the UPPERCASE casing, and run the live archive + drag-drop==API
parity test. Box can go live on `EVA_API_ENABLED=false` BEFORE the EVA Sentry REST path exists.**
