# 00 — Master build plan: Box-centric intake pivot (Option 2, additive hybrid)

> **Synthesised 2026-06-21** from the six section plans (01-docs … 06-box-integration) against the
> verified dossier ([04-target-architecture.md](../04-target-architecture.md),
> [07-flaws-risks-and-open-questions.md](../07-flaws-risks-and-open-questions.md)). This is the single
> **ordered** build plan: it sequences every section's steps into dependency-ordered **waves**,
> reconciles the cross-section seams the reviews flagged, and keeps **Claude-buildable** vs
> **operator-gated** explicit throughout. The section plans remain the detail of record; this plan is
> the order + the reconciliations + the roll-up.

> ## ⛏️ BUILD STATUS (updated 2026-06-22) — Waves 0–5 AUTHORED / in-build, NOT live
>
> **Two corrections to the "Decisions locked" block below, both operator-final:**
> - **Phase number is 7, not 4.** The shipped phase docs live at
>   [`docs/plans/phase-7-box-integration/`](../../docs/plans/phase-7-box-integration/) (the Q1 line below
>   that says "New Phase 4 → `phase-4-box-integration/`" is **superseded** — the working assumption changed
>   to **Phase 7**; the ADR is the single `docs/adr/0012-box-centric-intake-additive-hybrid.md` as planned).
> - **Plan floor is BASE BUSINESS; metadata (Business Plus) is OUT OF SCOPE now** — already reflected in the
>   "Metadata → OUT OF SCOPE" decision below; evidence is **linked, not embedded** (a server-minted "Open in
>   Box" deep link — **no iframe, no `frame-src` edit**; `BOX_EMBED_ENABLED` stays reserved/off).
>
> **Every Claude-buildable `[C]` item across Waves 0–5 is AUTHORED in the working tree and offline-verified;
> nothing is live.** Each wave's `[O]` items (Box Platform app + Admin authorization, secret injection,
> connection binds, gate flips, the BLOCKING `FILE.UPLOADED` live-test) remain the operator's. Authored +
> verified:
> - **Wave 0** — ADR-0012 + architecture §Box; **5 `BOX_*` gates + 2 config vars + 3 audit actions + 3
>   `cr1bd_box*` columns** (+ `cr1bd_boxsyncedat`, the submit-signal columns, the `cr1bd_finalizedpayloadhash`
>   drift declaration, the stale-comment fix) with `verify-parity.mjs` locking the defaults; the custom Box
>   REST connector OpenAPI (with `connectionParameters.api_key`) + the `box-webhook` CCG-mint/HMAC receiver
>   Function + its FC1 bicep (**pytest 71 passed**). The **connection-ref decision is PINNED** = a **parallel
>   `cr1bd_box_rest`**, first-party `cr1bd_box` retained for the byte path — this closes the "repoint vs
>   parallel — Pin one" decision left open in Wave 0's connector step (and reflected in
>   `flows/connection-references.json` + ADR-0012).
> - **Wave 1** — `box-folder-create` + the `finalize-eva-box` augment rewrite + the `case-resolve`
>   survivor-ensure; `flow-state.json` + `validate-flows.mjs` extended (**flow linter 154/154**). _(The intake
>   invocation is an operator/business-phase live edit — the repo intake def trails live, by design.)_
> - **Wave 2** — `box-file-request-copy` (the reconciled single flow; app binds `fileRequestUrl`).
> - **Wave 4** — Code App `getBoxGates()` + submit-signal finalize + the `copy_file_request` chaser +
>   the "Open in Box" deep link (**vitest 256 passed, `tsc -b` clean**).
> - **Wave 5** — `box-blob-purge` (status-driven, grace default 7d). Phase-C items remain placeholders.
>
> **Free-account REST live-test (the only live touch):** a throwaway **FREE** Box account dev token proved
> **8/9 raw-REST ops** (folder created + recursively deleted; no secret printed); `CreateWebhook` → 403
> `insufficient_scope` is expected on free. The service path (CCG, File Requests, metadata, the
> `FILE.UPLOADED` firing) needs the **Business+** tenant — the operator's second test phase and the long
> pole. Per-wave detail is honest below; treat the `[C]/[O]` split as the current build boundary.

## Decisions locked (2026-06-21, operator)

- **Pivot APPROVED** — proceeding to build.
- **Q1 phase/milestone → New Phase 4.** New docs live in **`docs/plans/phase-4-box-integration/`**
  (supersedes the "Phase-3-Box / M2.E" working assumption written in Wave 0 below).
- **Q2 ADR → a single `ADR-0012`** (one cohesive decision record).
- **Q3 folder timing → at parse-confirm** (when `cr1bd_casepo` first exists).
- **Q5 embed → "Open in Box" deep-link first**; the iframe (needs the `frame-src` edit) is optional, later.
- **Q11 PII residency → no hard requirement** — Business Plus is fine, PII may live in Box; ADR-0012
  records residency as satisfied (revisit only if a client/insurer later mandates UK residency).
- **Blob purge grace → 7 days.**
- **Metadata → OUT OF SCOPE for now → start on BASE BUSINESS (~$15/user/mo)** (operator decision
  2026-06-21, verified — **supersedes Settled fact #4 "Plan floor = Business Plus"**). The Business-Plus
  metadata field is **not a blocker**: (i) most uploads are **case-bound** — the per-case File-Request link
  is tied to the Case/PO folder and the Case already carries the parsed VRM, so **no reg capture is
  needed**; (ii) the orphaned **image-only / no-case** path captures the reg via **filename-VRM /
  uploader-emails-the-reg / human triage** — **NOT** the free-text description, which a **2026-06-21
  verification proved is NOT API/webhook-readable at any tier** (so that fallback is void; Business Plus
  would buy the metadata *field*, not description-readability). Metadata (Business Plus) is a later
  **optional reliability upgrade** for the orphaned path only — revisit at Wave 2. See
  [../09-metadata-role.md](../09-metadata-role.md). **Wave 2 build note:** the File-Request reg capture
  uses filename/email/triage, not a metadata form field, while on base Business.
- **Box Relay / Box Automate → ASSESSED, NOT required** (see
  [../08-relay-automate-assessment.md](../08-relay-automate-assessment.md)). The valuable capabilities
  (custom HTTPS step, AI agents, Box Extract, metadata-triggered routing) are **Enterprise / Enterprise
  Advanced-gated** (a 1–2 tier jump above the Business-Plus floor) and **duplicate** the authoritative
  parser/enrichment/Dataverse logic. Keep the bespoke `box-webhook` Function + PA/Dataverse-authoritative
  design. One optional **core-tier** slice (in-Box report approval via the manual-start Workflow Trigger
  API) is noted as a later nicety only. Two ADR caveats: Box Automate is **on-by-default at GA (28 Apr
  2026)** — disable it if unused; and it is **not fully interoperable with Box Governance/Shield/Zones**.
- **Invocation → pinned** (see the reconciliation table): direct connector ops for copy/shared-link; a
  Dataverse-signal trigger for finalize.

## Settled facts (honoured by every wave — do not re-litigate)

1. **Additive hybrid.** Dataverse stays the **system of record**; Box is a content + intake + archival
   **mirror**, written **one-way** (Dataverse→Box). Box Metadata has no joins → dedup / status /
   Case-PO sequencing **never** run off Box.
2. **All Box automation runs through a custom Power Platform connector over Box REST** with a service
   identity. **Load-bearing correction (verified, all six plans agree):** a custom connector **cannot**
   run the OAuth2 client-credentials grant (Microsoft Learn, verbatim). So the connector authenticates
   by **API-key (an Azure Function host key) on the connection**, and the **Box CCG service-identity
   token is minted *inside* the Azure Function** from a Key Vault secret — the proven EVA-Sentry /
   parser pattern. The dossier 04 ASCII "custom connector (CCG/JWT)" is a simplification; the token
   lives Function-side.
3. **File Request is copy-from-template only.** Hand-build **one** template by hand (capture form +
   `vehicle_registration` metadata field); per case `POST /file_requests/{templateId}/copy`. The reg
   field is baked into the template and cannot be varied by the copy.
4. **Plan floor = Box Business Plus** — *for the reg-capture metadata field on the File-Request form*.
   (Box Automate "metadata events/actions" are a separate, higher Enterprise+ tier — do not conflate.)
5. **Code App CSP `connect-src 'none'`** — the UI calls Box **only** via flows/connectors, never
   `fetch()`. In-app embedding is **iframe-only** (Box Embed widget, `/embed/s/{token}`) and needs an
   operator **`frame-src`** edit (NOT `frame-ancestors`). Box UI Elements are not viable.
6. **Blob is the transient working store; Box is the archive of record.** Blob purge is **status-driven**
   (on `box_synced` + grace), never a blind age rule (lifecycle policies can't read Dataverse status).
7. **Webhooks are best-effort** (no SLA, at-least-once, droppable, also fire on move) and the
   **File-Request→`FILE.UPLOADED`** firing is **undocumented — LIVE-TEST it** (fallback: timed
   `ListFolder`/Metadata-Query reconciliation sweep).
8. **Operator boundary.** Claude builds connector defs, Functions, flows, schema, docs — all offline.
   The operator owns the **Box Platform app + Admin-Console authorization**, the **`client_secret`** +
   webhook signature keys, the interactive sign-in, the **`frame-src` CSP edit**, and the **live
   confirms**. **Claude never holds a Box credential.**

## Cross-section reconciliations baked into this plan

The section reviews surfaced real seams where two sections authored the same artefact with diverging
names/contracts. These are resolved **once, here**, and the waves below assume the resolution:

| Seam | Resolution (authoritative for the build) |
|---|---|
| **Connector OpenAPI + webhook-receiver Function ownership** (03 vs 06) | **Plan 03 (azure) OWNS** the connector OpenAPI and the webhook-receiver/token-mint Function build. **Plan 06 (box) DEFERS** to it and only consumes the contract (mirrors how 06 defers flows to 04). |
| **Webhook Function host** (03 `functions/box-webhook/` new app vs 06 `cespkeva-fn-ufa3ci`) | **New `functions/box-webhook/` FC1 app** (03's approach — cleaner, consistent with the FC1-clone pattern; `cespkeva-fn-ufa3ci` is **not** in the live registry). Record the chosen name in `live-environment.md` at deploy. |
| **File-request-copy flow** (02 `chaser-filerequest-copy` `{uploadUrl}` vs 04 `box-file-request-copy` `{fileRequestUrl}`) | **ONE flow:** `box-file-request-copy.definition.json` (plan 04 owns it). Input `{ caseId, fileRequestTemplateId, folderId }`; response **`{ fileRequestUrl, expiresAt, outcome }`**. The app's transport (02) binds to **`fileRequestUrl`**, not `uploadUrl`. |
| **Connector operation names** (diverged across 02/03/04/06) | **Unify to:** `CreateFolder` (`POST /2.0/folders`), `CopyFileRequest`, `GetSharedLink` (provision **both** the file `PUT /2.0/files/{id}?fields=shared_link` and the folder `PUT /2.0/folders/{id}?fields=shared_link` variant — the embed needs the **folder** link, "Open in Box" can use either), `ListFolder` (reconciliation sweep), `CreateWebhook` + webhook lifecycle (`GET`/`DELETE /webhooks/{id}`) + File-Request lifecycle (`GET`/`PUT`/`DELETE /file_requests/{id}`). The generated `*Service` method names the Code App binds MUST equal these `operationId`s. |
| **Folder existence: intake-guarantee vs per-call ensure** (02 ensures-in-copy-flow vs 04 mints-at-intake) | **Intake guarantee.** `box-folder-create` mints the UPPERCASE Case/PO folder at **parse-confirm** and stamps `cr1bd_boxfolderid`. `box-file-request-copy` **reads** `cr1bd_boxfolderid`; if null → return **`folder_not_ready`** (do NOT call Box with a null `folder.id`). The folder-create child is 409-idempotent so a re-ensure is harmless, but it is not the copy flow's job. |
| **`box_synced` write ownership** (05 implies status-evaluate; finalize already stamps it) | **`finalize-eva-box` stamps `cr1bd_status=100000009` LAST** (the existing idempotency latch — unchanged). `status-evaluate` does **NOT** add a competing box_synced transition. The UI is strictly flow-driven and never writes status locally. |
| **Code App → flow invocation mechanism** (02's central dependency) | **PINNED 2026-06-21 (split by op type):** (a) **App-initiated single Box ops** — copy File Request, get/ensure shared link — are **direct calls to the Box-REST-facade connector** (app → connector → `box-webhook` Function → Box; the proven `cr1bd_ceparser` precedent), **no flow in the path**. (b) The multi-step **finalize/submit** is invoked by the app **writing a Dataverse signal** (PATCH the Case — a `submit-requested` flag/status), consumed by a **Dataverse-triggered** flow that runs `finalize-eva-box`; the app **never POSTs to a flow SAS URL** (matches `box-archival-pipeline.md`'s "Code App writes a submit-requested signal"). **No flow-fronting / SAS connector is built**, so the `flow-webhook-trigger-provisioning` SAS gotcha is moot for the app path (it still applies only to the live Office-365 *intake* trigger edit in Wave 1). App transports therefore bind: copy/shared-link → connector ops; finalize → a Dataverse write. |
| **`api_key` connection parameter** (missing from 03 step 2) | The connector's `apiProperties.json` MUST declare `connectionParameters.api_key` (an `apiKey` securityDefinition alone does **not** create it — proven for `cr1bd_ceparser`). Plan 06 step 4 has this right; plan 03's connector step inherits it. |
| **Byte uploads** (03 under-specified) | Byte uploads stay on the **first-party `CreateFile`** (`folderPath`-based, after a `GetFileContentByPath_V2` real-bytes read — the S2 fix). Only the **folder** is created via the custom connector `CreateFolder`. This matches the canonical `box-archival-pipeline.md`. |
| **Case/PO availability** (stale `case.json` comment) | `cr1bd_casepo` is set at **parse-confirm** (live `intake` `Scope_generate_casepo` → `Update_case_casepo`), NOT at EVA-submit. The `case.json` line-23 comment "ENTERED AT EVA SUBMIT" is **stale** — correct it (dataverse section). The folder name therefore exists when `box-folder-create` runs. |
| **env-var schema ownership** | The **`BOX_*` env-var schema names + defaults are owned by plan 05 (dataverse)**. Every other section (docs gate-lists, flow gate-reads, app gate-reads, Function app-settings) **consumes** those names; none re-defines them. |

**Audit-action numbering** is double-named across plans (05 reserves `box_folder_created=100000019`,
`box_file_request_copied=100000020`, `box_upload_received=100000021`; 04 asks for six values incl.
`webhook_fired/processed/skipped`). **Plan 05 owns the choiceset**; reconcile to **05's three values**
plus, if the flow/Function genuinely need finer-grained webhook audit, extend 05 additively
(`100000022+`) — do not let 04 mint values independently. App-side "image upload link issued" maps to
`box_file_request_copied` (no new UI-only choice).

---

## Waves (dependency-ordered)

Legend: **[C]** = Claude-buildable (offline, lint-verifiable) · **[O]** = operator-gated (Box/Entra
credential, Admin consent, tenant CSP change, or live confirm) · section refs in `(NN §step)` form.

### Wave 0 — Docs + schema + the connector/Function unlock (the prerequisite that unlocks everything)

Nothing else can run until the decision record exists, the gates + columns exist, and the custom
connector + webhook Function are built and importable. All of Wave 0 is **[C]** except the Box Platform
app registration + secret, which is the hard **[O]** unlock.

**Docs spine (01):**
- **[C]** Author **ADR-0012 `box-centric-intake-additive-hybrid`** (01 §1) — the binding decision record;
  leads everything. Mirror the 0010/0011 voice (prose context · `Decisions:` bullets · `Trade-off:`).
  State the verified pillars: custom connector mandatory; **CCG token minted in the Function, not the
  connector**; File-Request copy-only; Business-Plus floor **for the reg metadata field** (note Automate
  metadata events are higher-tier); webhook best-effort + live-test-gated; embed iframe-only; data
  residency recorded as **unresolved** (do not assume Business Plus suffices for PII). Do **not**
  hard-code the "2xx within 30s" webhook ceiling as fact — "confirm at build time".
- **[C]** Expand **`integrations.md §Box`** + **`data-model.md` Box section** + a planning-placeholder
  **`live-environment.md` Box row** (01 §2–4). data-model.md is the canonical home of the
  Dataverse-authoritative / one-way-mirror rule. Note env-var **schema names are owned by plan 05**;
  docs carry the human-readable gate list only.
- **[C]** Create the phase folder **`docs/plans/phase-3-box-integration/`** (01 §5–7): `README.md` (B0–B4
  checklist), **`box-custom-connector-and-webhook.md`** (the BUILD spec the azure section implements),
  **`box-integration-activation.md`** (the operator runbook). Working assumption **Phase-3-Box / M2.E** —
  **frozen only after the operator answers Q1 (phase/milestone number) + Q2 (one-vs-many ADR)** (hard
  ordering gate; steps 01 §5/§9/§11 move together).

**Schema (05) — owns the gate + column + audit definitions:**
- **[C]** Add **5 Boolean gates** (`cr1bd_BOX_API_ENABLED`, `…_FOLDER_AT_INTAKE_ENABLED`,
  `…_FILEREQUEST_ENABLED`, `…_EMBED_ENABLED`, `…_METADATA_ENABLED`; all `defaultValue:"false"`) +
  **2 String config vars** (`cr1bd_BOX_FOLDER_ROOT_ID`, `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID`,
  `defaultValue:""`) to `environment-variables.json` (05 §1–2). (`BOX_AI_ENABLED` is **deferred** to
  Phase C — note the omission so the manifest isn't read as the complete Box set.)
- **[C]** Add **3 String columns** to `case.json`: `cr1bd_boxfolderid` (40), `cr1bd_boxfilerequestid`
  (40), `cr1bd_boxfilerequesturl` (400, `format:"Url"`) — all `required:"none"` (05 §3). Also **declare
  the pre-existing `cr1bd_finalizedpayloadhash`** column (drift the reviews flagged — `finalize-eva-box`
  reads/writes it but `case.json` never declared it) and **correct the stale line-23 "ENTERED AT EVA
  SUBMIT" comment** to "parse-confirm".
- **[C]** Leave `evidence.json` + `case-status.json` UNCHANGED (`box_synced=100000009` already exists)
  (05 §4–5). Add **3 audit-action options** `box_folder_created=100000019`,
  `box_file_request_copied=100000020`, `box_upload_received=100000021` (05 §6).
- **[C]** Update the env-var manifest `notes[]` + the **`verify-parity.mjs` `expect` allowlist** to LOCK
  the new BOX_* defaults the way the M1 gates are locked (05 §8 — corrected: the *flow* linter
  `validate-flows.mjs` has no known-gate set; `verify-parity.mjs` is the file that pins env-var defaults).
  Cross-check that every gate a Box flow references resolves to a declared variable.

**Connector + Function unlock (03 owns; 06 supplies the Box-side shape):**
- **[O]** **Register the Box Platform app** (Server Auth / CCG, App Access Only), scopes
  `root_readwrite` + `manage_webhook`; capture Client ID + **Client Secret** + Enterprise ID (06 §2).
  **Authorize + enable** it in the Box Admin Console (06 §3). **Confirm the plan is Business Plus** +
  metadata feature on (06 §1). **The unlock — every later [O] flip and the connector binding depend on
  this.**
- **[C]** Author the **custom Box REST connector OpenAPI 2.0** at `functions/box-webhook/openapi/`
  (03 §2, 06 §4): single `apiKey` securityDefinition (`x-functions-key`); **declare
  `connectionParameters.api_key` in `apiProperties.json`**; operations per the unified op-name list
  above (incl. webhook + File-Request lifecycle ops 06 needs). Repoint the **`cr1bd_box` connection
  reference** to the custom connector (`tier:"Premium"`, `custom:true`, `boundAtActivation:true`) and
  note the Box `client_secret` is a **Function-side KV ref, never on the connection** (03 §6).
  *(Decide: repoint `cr1bd_box` in place, or add a parallel `cr1bd_box_rest` and keep first-party
  `shared_box` for `finalize-eva-box`'s `CreateFile` — plan 04 §4 prefers the parallel ref. Pin one.)*
- **[C]** Implement the **Box CCG token exchange inside the Function** (`POST /oauth2/token`,
  `grant_type=client_credentials`, `box_subject_type=enterprise`; cache ~lifetime, refresh on 401,
  backoff on 429) (03 §3). Author the **webhook-receiver handler** `functions/box-webhook/` (03 §4):
  10-min replay reject → dual-key HMAC-SHA256 (timing-safe) → **2xx promptly** then work → dedup on
  `BOX-DELIVERY-ID` (Box retries up to 12×/2h) → disambiguate `FILE.UPLOADED` from `FILE.MOVED` → write
  Evidence (storagePath stays Blob) + re-invoke idempotent `CS Status Evaluate`. Author
  `functions/box-webhook/infra/main.bicep` (FC1 clone; MI → Key Vault Secrets User + Storage Blob Data
  Owner; KV refs `BOX_CLIENT_SECRET` + `BOX_WEBHOOK_PRIMARY_KEY` + `BOX_WEBHOOK_SECONDARY_KEY`; **no
  `api.box.com` CORS rule** — server-to-server) (03 §1, §5). The webhook caseId resolution is
  Box-folder-id → `cr1bd_boxfolderid` → case (state this lookup explicitly for the handler).
- **[C]** Author the **`finalize-eva-box` rewrite spec** in `box-custom-connector-and-webhook.md`
  (01 §6); the **definition rewrite itself is owned by the flows section** (Wave 1).

**Top-level + registry alignment (01):**
- **[C]** Reconcile **`box-archival-pipeline.md` DOWN** with a supersession banner (first-party
  insufficient; custom connector mandatory; ADR-0012 wins) (01 §9). Update **`flows/README.md`** (Box
  flows validated against the custom-connector contract) (01 §10). Surgical edits to **CLAUDE.md /
  README.md / ROADMAP.md / CURRENT_STATUS.md / milestone-model.md / plans-README** (01 §11) — gated on
  Q1/Q2 for the phase/milestone labels. Add **gated.md Box rows** (01 §8 / 05 §7): flag that item-5's
  "API key / sign-in" wording is now **partially obsolete** for the service path (the service path uses
  a Platform-app `client_secret` + Admin authorization, not a personal API key).

**Wave 0 exit-criterion.** ADR-0012 + architecture §Box landed; the 7 env-vars + 3 columns + 3
audit-actions declared and `verify-parity.mjs`-locked; the custom connector OpenAPI (with
`api_key` param) + the webhook-receiver Function + its bicep authored and `az bicep build` / lint
green; the **Code App→flow invocation mechanism pinned** (which connector fronts the Request-triggered
flows); the Box Platform app **[O] registered + Admin-authorized** and `client_secret` + signature keys
in Key Vault; `cr1bd_box` connection bound to the custom connector. Nothing flipped on yet
(`BOX_API_ENABLED` still false).

### Wave 1 — Folder + archival at case-creation (B1, gate `BOX_FOLDER_AT_INTAKE_ENABLED`)

Box becomes the durable, human-navigable case record from first contact.

- **[C]** Create **`box-folder-create.definition.json`** (04 §5): Request+Response child, input
  `{ caseId, casePo, workProviderId }`, param `BoxArchiveRootId` (sourced from
  `cr1bd_BOX_FOLDER_ROOT_ID`). Reads `BOX_FOLDER_AT_INTAKE_ENABLED`; on gate-on, `CreateFolder`
  (`name=@toUpper(casePo)`, parent = root) → stamp `cr1bd_boxfolderid` + `cr1bd_boxsyncedat` → audit
  `box_folder_created`. Idempotent (guard `empty(cr1bd_boxfolderid)`; facade swallows Box 409). *(Decide
  whether `workProviderId` is load-bearing inside the child; if not, drop it so the merged-case path
  passing `''` is unambiguous — 04 conflict.)*
- **[C]** **Rewrite `intake.definition.json`** (04 §6): insert `Run_box_folder_create` **inside
  `Scope_generate_casepo`, after `Update_case_casepo`** (where `cr1bd_casepo` first exists — mint at
  parse-confirm, not first-contact). Image-only / no-provider cases never enter that scope → correctly
  get no folder. **Live-edit guard:** intake carries the one live Office-365 webhook — **PATCH only the
  `actions` node; never touch `triggers`** (byte-identical trigger; `flow-webhook-trigger-provisioning`).
- **[C]** **Rewrite `finalize-eva-box.definition.json`** to the real contract (03 §8, 04 §implicit, the
  01 §6 spec): folder created via custom-connector `CreateFolder` once at intake → finalize **augments**;
  keep the **S2 content-bind** (`GetFileContentByPath_V2` real bytes → first-party `CreateFile`); keep
  the EVA photo-order loop + `EVA_API_ENABLED` gate; it continues to stamp `box_synced` LAST. Migrate the
  hard-coded `BoxArchiveRootId` flow parameter to read `cr1bd_BOX_FOLDER_ROOT_ID` (05 §2 hand-off).
- **[C]** **Rewrite `case-resolve.definition.json`** (04 §9): on a merged single-pair, ensure the
  survivor case has a folder via the **idempotent** `box-folder-create` (no Box move/link of bytes —
  status-evaluate re-runs; finalize later uploads photo bytes). It is a Request-triggered child (no
  Office-365 webhook) → safe to deactivate→edit→reactivate.
- **[C]** Add the 4 new flows to **`flow-state.json`** (`state:"off"`) + extend **`validate-flows.mjs`**
  (04 §12–13): assert each BOX_*-gated flow is registered with its gate; `shared_box_rest` ops appear
  only in the Box flows (never in `finalize-eva-box`); **extend `BOX_ID_LITERAL_RE` to
  `parent_id|folder_id|file_request_id` literals** (NOT `name:"<digits>"` — the folder name is the
  UPPERCASE Case/PO, not all-digits). Allow `box-blob-purge`'s status+boxsyncedat ListRecords as a
  documented exception.
- **[O]** **Designate the Box archive root** + record its folder id → `BOX_FOLDER_ROOT_ID` value (06 §8).
- **[O]** **Flip `BOX_API_ENABLED=true`** then **`BOX_FOLDER_AT_INTAKE_ENABLED=true`** (test env first)
  and **run the live archive test** (06 §7, §10): confirm UPPERCASE casing, photo order, reflection
  exclusion, `.eva.json` present. Bind the `cr1bd_box` custom connection (interactive sign-in / secret).

**Wave 1 exit-criterion.** A new case mints exactly one UPPERCASE Case/PO Box folder at parse-confirm;
`cr1bd_boxfolderid` is stamped; finalize augments (not creates) and archives `.eml` + instruction PDF +
images with correct photo order; merged cases share the survivor's folder; linter green; operator has
live-confirmed casing + photo order. Gate-publish latency (~1h) acknowledged in the runbook.

### Wave 2 — File Request image chaser + webhook intake (B2, gate `BOX_FILEREQUEST_ENABLED`)

The highest-value piece: account-free image collection that auto-advances the case.

- **[O]** **Create the enterprise metadata template** (Admin Console → Content → Metadata) with
  `vehicle_registration` (+ optional `case_reference`/`principal_code`/`status`/…) (06 §12).
- **[O]** **Hand-build the ONE template File Request** (capture form = email + description +
  `vehicle_registration` required) and record its `file_request_id` → `BOX_FILE_REQUEST_TEMPLATE_ID`
  value (06 §11). *(Needs a live Business-Plus tenant to confirm the metadata field is selectable.)*
- **[C]** Create **`box-file-request-copy.definition.json`** (04 §7, reconciled): input
  `{ caseId, fileRequestTemplateId, folderId }`; reads `BOX_FILEREQUEST_ENABLED`; **guard
  `empty(folderId)` → return `folder_not_ready`**; else `CopyFileRequest` (`folder.id`, `status:"active"`,
  optional `expires_at`) → audit `box_file_request_copied` → response
  **`{ fileRequestUrl, expiresAt, outcome }`** (`outcome ∈ sent|gated_off|folder_not_ready`).
- **[C]** (status-evaluate UX polish, optional) emit `file_request_eligibility_changed` hint on
  awaiting-images states (04 §10) — additive; `BOX_FILEREQUEST_ENABLED` here is created-for-completeness
  and consumed by the app, not by any flow guard.
- **[C/O]** **Subscribe the `FILE.UPLOADED` webhook** on the archive root via `CreateWebhook` (06 §14):
  one webhook per item (duplicate target+app+user → 409). **Prefer a single archive-root (recursive) or
  per-repeat-sender webhook over per-case** to avoid the per-app webhook-count ceiling (cited ~1000,
  unverified — confirm at build).
- **[O]** **LIVE-TEST (BLOCKING for B2):** drag a file into a copied File Request → confirm the target
  folder's `FILE.UPLOADED` fires the Function and the case advances (06 §15, 04 R1). Fallback wired: the
  timed `ListFolder`/Metadata-Query reconciliation sweep.
- **[O]** **Flip `BOX_FILEREQUEST_ENABLED=true`** (test first) (06 §16).

**App-side (02 — gates on `BOX_FILEREQUEST_ENABLED`):** see Wave 4 for the UI wiring; the flow +
webhook are server-side here and the UI consumes them once the gate is on.

**Wave 2 exit-criterion.** The "copy chaser" flow returns a live upload URL for a case with a folder
(and an honest `folder_not_ready`/`gated_off` otherwise); a File-Request upload **demonstrably** fires
the webhook (or the poll fallback is confirmed working); the Function writes Evidence + re-evaluates
status idempotently and the case advances Not Ready → Review (= `needs_review`/`missing_images`
non-terminal states) without a stranded or double-processed case.

### Wave 3 — Permanent drop-boxes for image-only senders (B3, gate `BOX_FILEREQUEST_ENABLED`)

Anonymous image collection tied to a case by the **reg captured as metadata**.

- **[O]** Create **one permanent (non-expiring) File Request per repeat sender** under a `/DropBoxes/`
  parent (copied from the template so it carries `vehicle_registration`); one File Request per folder
  (06 §17). *(Operator decision Q6: per-sender vs a shared drop-box.)*
- **[C/O]** Webhook → Function: read the captured `vehicle_registration`, **reg-merge** (ADR-0010) to an
  open instruction case and move/link images into the Case/PO folder; **unmatched → Held** (don't guess)
  (06 §18). Reuses the Wave 2 receiver + the dedup/idempotency latch.

**Wave 3 exit-criterion.** An image-only sender drags photos into their permanent drop-box; the reg
metadata routes them to the right open case's folder (or Held if no match); no anonymous upload is
silently lost.

### Wave 4 — Surface Box in the Code App (B4, gates `BOX_API_ENABLED` / `BOX_EMBED_ENABLED`)

UI affordances, all degrading honestly to `not_connected` until the connection is bound. Most of this
**can proceed in parallel from Wave 1** for the deep-link/gate-read parts; the iframe waits on the
`frame-src` edit.

- **[C]** **Foundation: `BoxGates` read** (02 §1–3) — `getBoxGates()` reads the **same
  `environmentvariabledefinitions`/`…value` rows** the flows read (Code Apps have no native runtime
  env-var read → Dataverse-table query is the verified mechanism); cached + `refetch`; default all-false
  on failure. `fileRequestTemplateConfigured` = `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID` value non-empty.
- **[C]** **Submit dialog → real `finalize-eva-box`** (02 §8–9): replace the mock `onSubmit` with
  `connectorFinalizeTransport({ caseId, payloadHash, evaPayload12 })` against the flow-fronting connector
  (Wave 0 mechanism); **never write status locally** — await the flow, re-read the flow-stamped
  `box_synced`. Gate the direct-submit path behind `apiEnabled`; the drag-drop JSON export stays the
  permanent fallback.
- **[C]** **Chaser → File-Request → clipboard** (02 §4–7, reconciled): `ChaserPanel` gains a
  `copy_file_request` template + injected `CopyFileRequestTransport`; the transport binds to
  `box-file-request-copy` and reads **`fileRequestLink.fileRequestUrl`**; visible only when
  `fileRequestEnabled && fileRequestTemplateConfigured`; honest `not_connected`/`folder_not_ready`/`error`
  messages, never a fake link. (Note: `ChaserPanelProps` is currently `{case, onLogChased}` — the new
  props + success-with-link path are net-new state, not a tweak.)
- **[C]** **Evidence-from-Box** (02 §10–11): a server-minted **"Open in Box" deep link** (no CSP change,
  always available when `apiEnabled`) via `GetSharedLink`; plus an **optional Box Embed iframe**
  (`/embed/s/{token}`, **folder** shared link) gated `BOX_EMBED_ENABLED`. Box UI Elements not viable.
- **[C]** **Webhook-driven advance reflected via existing queries + Refresh** (02 §12): no push channel;
  rely on `useDashboard`/`useQueueQuery`/`useCaseQuery` `refetch` (+ optional light poll); never promise
  instant arrival. **[C]** `box_synced` label/badge surfacing (02 §13) — label-only (already in the
  union/terminals/`statusToStage`).
- **[C]** **ALM wiring** (02 §14): `pac code add-data-source` for the connector(s) (prefer the
  connection-reference `-cr/-s` form); wire generated services in `generated-services.ts`/`main.tsx`.
- **[O]** **`frame-src` CSP edit** (06 §20, 03 §14, 02 §11): PPAC → Privacy + Security → CSP → **App
  tab**, add `https://*.app.box.com` (or `PowerApps_CSPConfigCodeApps`); per-environment, env-admin.
  Gates the iframe only.
- **[O]** Mint a managed folder shared link server-side (06 §19); **flip `BOX_EMBED_ENABLED=true`** if the
  iframe is wanted (06 §21) — else stay on the no-CSP "Open in Box" deep-link (Q5).

**Wave 4 exit-criterion.** With the connection bound + gates on, the submit dialog drives a real
finalize; the chaser button produces a real upload link to the clipboard; "Open in Box" works without a
CSP change; the iframe renders only after the `frame-src` edit; everything degrades to honest
`not_connected` when unbound; the offline build stays SDK-free (the no-`@microsoft/power-apps`-in-src
grep gate passes).

### Wave 5 — Status-driven Blob purge + Phase-C enhancements (deferred, tier-gated)

- **[C]** **`box-blob-purge.definition.json`** (04 §11, 03 §11): scheduled `Recurrence` (with `startTime`
  so it doesn't fire on deploy), param `PurgeGraceDays` (default 7), gate `BOX_API_ENABLED`; deletes
  Blob evidence where `cr1bd_status=box_synced AND cr1bd_boxsyncedat < now-grace` via `DeleteFile_V2`;
  **never** deletes the Box copy; flow-driven (re-checks Dataverse) as primary, a tag-filtered lifecycle
  rule as the cheap backstop (with soft-delete on). *(Operator Q: grace 7d vs 30d vs 60d — sections
  differ; pin one.)*
- **Phase C (separate, evidence-driven, higher-tier / metered — out of M1/M2 scope):** Box Metadata
  instances + cascade + Metadata-Query (`BOX_METADATA_ENABLED`) (06 §22); Box Governance retention +
  legal hold (Enterprise add-on) (06 §23); Box AI extract/ask (metered AI Units, Business Plus includes
  zero) (06 §24). Each independently gated; each its own decision (Q7) and may hinge on the residency
  decision (Q11).

**Wave 5 exit-criterion.** Blob no longer grows unbounded (purged only after `box_synced` + grace, Box
copy retained); Phase-C items remain authored-as-placeholders, none activated.

---

## Critical path

```
ADR-0012 + architecture §Box (01)                                  ─┐
BOX_* gates + cr1bd_box* columns + audit actions (05)              ─┤ Wave 0 (parallelisable [C])
Custom connector OpenAPI (+api_key param) + webhook Function (03)  ─┘
        │   (and, [O]) Box Platform app + Admin authorize + client_secret  ← the hard unlock
        ▼
Code App→flow invocation mechanism PINNED  +  cr1bd_box bound (Wave 0 exit)
        ▼
box-folder-create + intake rewrite + finalize rewrite (04) ──► [O] flip FOLDER_AT_INTAKE + live archive test   (Wave 1)
        ▼
box-file-request-copy + webhook subscribe (04/03) ──► [O] hand-build template ──► [O] LIVE-TEST FILE.UPLOADED ──► flip FILEREQUEST   (Wave 2, BLOCKING gate)
        ▼
permanent drop-boxes + reg-merge (Wave 3)   ·   app UI wiring (Wave 4, parallel from W1 for deep-link/gates; iframe waits on [O] frame-src)
        ▼
blob purge + Phase C (Wave 5, deferred)
```

The **longest pole** is: **Box Platform app + Admin authorization [O]** → connector/Function build [C]
→ folder/finalize flows [C] → **the File-Request→`FILE.UPLOADED` live-test [O]** (the single biggest
empirical unknown; B2 cannot be relied on until it passes, with the poll fallback as the hedge). Two
**hard ordering gates** sit on top: (1) the operator must answer **Q1 (phase/milestone number) + Q2
(ADR split)** before the phase-folder name, milestone rows, and ROADMAP/plans-index entries freeze; (2)
the **Code App→flow invocation connector** must be pinned in Wave 0 before any app transport
(submit/chaser/shared-link) can compile.

## Consolidated operator-gated checklist (the only things Claude cannot do)

1. **Register the Box Platform app** (Server Auth / CCG, App Access Only; scopes `root_readwrite` +
   `manage_webhook`); capture Client ID + **Client Secret** + Enterprise ID. *(Wave 0 — the unlock.)*
2. **Authorize + enable** the app in the Box Admin Console (re-authorize on any scope change).
3. **Confirm the Box plan is Business Plus** + the metadata feature is actually enabled on the live
   tenant *(needs a live tenant to verify)*.
4. **Supply `client_secret` + the per-webhook primary/secondary signature keys into Key Vault**
   (`box-client-secret`, `BOX_WEBHOOK_PRIMARY_KEY`, `BOX_WEBHOOK_SECONDARY_KEY`). Claude never holds a
   Box credential.
5. **Deploy** the bicep / **import** the custom connector / **bind** the `cr1bd_box` connection (interactive
   sign-in for any first-party byte-write path).
6. **Designate the Box archive root** (+ `/DropBoxes/` parent) and record the root folder id →
   `BOX_FOLDER_ROOT_ID`.
7. **Create the enterprise metadata template** + **hand-build the ONE template File Request** (with the
   required `vehicle_registration` field); record its `file_request_id` → `BOX_FILE_REQUEST_TEMPLATE_ID`.
8. **Flip the `BOX_*` gates** per phase, **test env first** (`BOX_API_ENABLED` →
   `BOX_FOLDER_AT_INTAKE_ENABLED` → `BOX_FILEREQUEST_ENABLED` → `BOX_EMBED_ENABLED`). Expect ~1h publish
   latency — not an instant cutover.
9. **Run the live confirms:** UPPERCASE casing + photo order + reflection exclusion (B1); and the
   **BLOCKING File-Request→`FILE.UPLOADED` live-test** (B2; poll fallback if it doesn't fire).
10. **Make the `frame-src` CSP edit** (per-environment, env-admin) for the optional in-app Box embed
    (B4) — or choose the no-CSP "Open in Box" deep-link instead.
11. **Answer the open decisions before names/tiers freeze** (see below): Q1 phase/milestone number, Q2
    one-vs-many ADR, Q3 folder timing, Q4 template count, Q5 embed-vs-deep-link, Q6 per-sender-vs-shared
    drop-box, Q7 Phase-C appetite, **Q11 data residency** (Box Zones / PII-in-Dataverse).

## Risks · gaps · unverified (roll-up from the six reviews)

**Top risks (severity-ordered):**
- **File-Request→`FILE.UPLOADED` firing is UNDOCUMENTED** (Med; the single biggest unknown) — **live-test
  before relying on B2**; fallback = timed `ListFolder`/Metadata-Query reconciliation sweep. Flagged
  correctly as a soft blocker in every plan that touches it.
- **Webhooks are best-effort** (Med) — no SLA, at-least-once, droppable, also fire on move. Mitigated by
  HMAC verify + 10-min replay + `BOX-DELIVERY-ID` dedup + upload/move disambiguation + idempotent
  status-evaluate + the reconciliation sweep. A missed event cannot strand a case.
- **Dual-store drift** (Med) — Dataverse authoritative, Box written one-way, no case logic off Box.
- **Public webhook endpoint** (Med) — mandatory HMAC + replay + function-key second gate + KV secret.
- **Webhook-count ceiling (~1000, unverified)** + **Box rate limits (~1000/min/user; connector
  100/conn/60s)** (Low-Med) — prefer a single archive-root / per-sender webhook over per-case; back off
  on 429; front the Function with a queue only if burst-queuing risk emerges.
- **Gate-publish latency ~1h** (Low) — document so the operator doesn't expect an instant flip.
- **Cost creep / tiering** (Med) — Phase-C (Governance, AI Units, Hubs) and **data residency** (Box Zones
  = Enterprise + seats) can change the tier; gate each and pilot first.

**Material gaps to close at build (NEEDS_FIXES items from the reviews):**
- **App→flow invocation mechanism (02)** — the app's central dependency is undelivered: under CSP the UI
  can't POST to a flow SAS URL, and the proven transport fronts an Azure **Function**, not a flow. **Pin
  the connector that fronts the Request-triggered flows in Wave 0** (resolved in the reconciliation
  table; must be concrete before app transports compile). Mind the `flow-webhook-trigger-provisioning`
  gotcha.
- **Duplicate file-request-copy flow + diverging op names + folder double-booking + shared-link
  object-level (02 vs 03 vs 04 vs 06)** — all resolved in the reconciliation table; the build MUST follow
  those single choices or the generated services won't compile and the contracts won't match.
- **`api_key` connection parameter missing from 03's connector step** — add `connectionParameters.api_key`
  to `apiProperties.json` (06 §4 has it).
- **Byte-upload op + Case/PO-at-parse-confirm not asserted in 03** — reconciled (first-party `CreateFile`;
  `cr1bd_casepo` set at parse-confirm).
- **Webhook HMAC-key KV secret names absent from 05's set** — they are Function-side KV concerns (03);
  name them in the operator injection list (done in checklist item 4).
- **`verify-parity.mjs`, not the flow linter, pins env-var defaults (05 §8)** — add the BOX_* defaults to
  its `expect` allowlist if they are to be locked.
- **Pre-existing drift `cr1bd_finalizedpayloadhash` undeclared in `case.json`** — declare it (05) while
  the finalize rewrite touches the same flow.
- **Evidence dedup latch for webhook uploads** — Box is at-least-once; the append-only audit row is not a
  dedup key. Confirm with the azure section whether `cr1bd_evidence` needs a `cr1bd_boxfileid` /
  source-event-id key, or the Function dedups on `BOX-DELIVERY-ID` before the Evidence write.
- **Stale docs to correct** — `box-archival-pipeline.md` (reconcile DOWN), `case.json` line-23 comment,
  gated.md item-5 "API key/sign-in" wording (partially obsolete for the service path).

**Unverified (carried honestly; do not assert as fact):**
- The exact **"2xx within 30s" webhook response ceiling** — not confirmed on the Box pages reached;
  treat as "respond 2xx promptly, confirm at build time"; do **not** hard-code into ADR-0012. (The 10-min
  replay + HMAC-SHA256 dual-key + retries-up-to-10–12× + folder-scoping **are** confirmed.)
- The **per-app/per-user webhook count ceiling (~1000)** — the live reference 404'd; the one documented
  per-target limit is the 409 on a duplicate target+app+user. Confirm the number at build.
- **Box CCG ~60-min token / no refresh** — not stated verbatim on the pages reached, but the Function
  re-minting per cycle is safe regardless.
- **Business-Plus floor** is for the **reg-capture metadata field on the File-Request form**; Box Automate
  metadata events/actions are a separate higher tier — keep them distinct in ADR-0012.
- **Box Embed widget is full-function** (upload/search), not "preview-only" as the dossier says — a
  conservative under-claim that doesn't change the safe-view + "Open in Box" fallback intent.

## Section plan index

| # | Section | File |
|---|---|---|
| 01 | Docs changes & additions | [01-docs.md](./01-docs.md) |
| 02 | Code App & repo file changes | [02-app-and-files.md](./02-app-and-files.md) |
| 03 | Azure / cloud infrastructure | [03-azure-cloud.md](./03-azure-cloud.md) |
| 04 | Power Automate flows | [04-power-automate-flows.md](./04-power-automate-flows.md) |
| 05 | Dataverse schema & gates | [05-dataverse.md](./05-dataverse.md) |
| 06 | Box-side configuration & integration | [06-box-integration.md](./06-box-integration.md) |
