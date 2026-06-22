# Box-side configuration & integration — build plan

> Scope: the **Box-tenant-side** setup the additive-hybrid pivot needs — plan/licence, Platform app +
> scopes + Admin-Console authorization, the one-time hand-built pieces (template File Request + enterprise
> metadata template), webhook registration, folder root + naming, governance/retention (later), and the
> shared-link/embed setup. This is the **Box configuration** companion to the connector/Function/flow build
> tracked in [04-target-architecture.md](../04-target-architecture.md) and
> [docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md](../../docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md).
> Settled facts from the dossier are honoured, not re-litigated. Author date **2026-06-21**.

## Overview

Everything Box-side hangs off **one service identity** authorized in the Box Admin Console and a **base
plan floor of base Box Business** (folders + File Requests + webhooks + CCG). **Business Plus is an
optional later tier**, needed **only** for the Metadata reg-capture field (deferred — see
[09-metadata-role.md](../09-metadata-role.md)). Most steps are **operator-gated** one-time
Box-UI/Admin-Console actions (register the Platform app, authorize its scopes, hand-build the template File
Request and the enterprise metadata template, designate the archive root, confirm the plan). The
**repeatable** verbs — create folder, copy the File Request, mint shared links, subscribe webhooks, write
metadata instances — are **API-driven by Power Automate flows through a custom Box REST connector**, never
by hand. The one material correction this plan carries over the dossier wording: a **Power Platform custom
connector cannot itself perform the Box CCG/JWT token exchange** (Microsoft Learn: *"Currently, client
credentials grant type is not supported by custom connectors"*), so the service-identity token is minted
**inside an Azure Function** (secret in Key Vault) and the **connector authenticates by API-key (function
key)** — the exact pattern already proven for the EVA Sentry path. Claude never holds a Box credential.

## Current state (what exists today)

- **No Box Platform app, no Admin-Console authorization, no service identity.** No Box account is bound to
  any connection; no Box credential is held by Claude. Live env = Sandbox *Collision Engineers - Dev*
  (`b3090c42-…`), not the default env.
- **First-party Box connector only**, via connection reference **`cr1bd_box`** (`shared_box`, **Standard**
  class, **interactive-OAuth only**, file-only 11 actions). Declared in
  [flows/connection-references.json](../../flows/connection-references.json) (`usedBy=[finalize-eva-box]`).
  **No custom Box REST connector exists.**
- **`finalize-eva-box.definition.json`** ([flows/definitions/](../../flows/definitions/finalize-eva-box.definition.json))
  is committed `state=off` and **mis-wired** — invents a non-existent `CreateFolder` op + `folderId` param
  and uploads the Blob path string instead of bytes (S2). Rewrite spec:
  [box-archival-pipeline.md](../../docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md) §4–5.
- **Box webhook receiver Function is AUTHORED OFFLINE (state=off) — not deployed/bound live;** no template
  File Request, no enterprise metadata template, no shared-link minting, no governance policy yet (the
  always-on Box account integration is deferred to a future Business-account phase).
- **Env-var gates + Box schema columns APPLIED LIVE in Dev (all `BOX_*` gates OFF — default AND current =
  false):** `BOX_API_ENABLED`, `BOX_FOLDER_AT_INTAKE_ENABLED`, `BOX_FILEREQUEST_ENABLED`,
  `BOX_EMBED_ENABLED`, `BOX_METADATA_ENABLED`, `BOX_AI_ENABLED`.
- **Box admin reference** mirrored locally at
  [automationsresearch/box/markdown/](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown) (File
  Request 289/315/123, metadata 046/047/131, governance 012, shared links 059/320, platform apps 009/055).

## Changes — ordered build steps

Owner tags: **[operator-gated]** = a human acts in the Box Developer/Admin Console or Power Platform admin
center (Claude can draft instructions, never the credential); **[Claude-buildable]** = authored/verified
offline (connector def, Function, flow, lint); **[API-driven by a flow]** = runtime, a Power Automate flow
calls the custom Box REST connector — no hand action per case. Steps are grouped by phase; **0.x is the
unlock and must complete before any later phase**.

### Phase 0 — The unlock (service identity + connector + webhook receiver)

1. **Confirm the Box plan is base Business or higher (the base-pivot floor); Business Plus only for the
   deferred metadata field.**
   What: verify the tenant is **base Business or higher** — base Business covers folders, File Requests,
   webhooks and CCG (the whole base pivot). Metadata is *"reserved for Business Plus, Enterprise, Enterprise
   Plus, and Enterprise Advanced"*; standard Business lacks it — so confirm **Business Plus** only **if/when**
   the optional metadata reg-capture field is being added (deferred). Confirm **Admin Console → Content &
   Sharing** shows metadata available before that upgrade. · Owner: **[operator-gated]** · Depends-on: — · Verify:
   support.box.com Using Metadata (gate quote) + local
   [289-administering-box-file-request.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\289-administering-box-file-request.md)
   (*"File Request is available to anyone with a Box Business Plan account"*) +
   [191-understanding-ai-units-in-box.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\191-understanding-ai-units-in-box.md);
   box.com/pricing/biz-plus. **⚠ Needs a live Business-Plus tenant to confirm metadata is actually enabled.**

2. **Register a Box Platform app (Server Authentication, CCG) in the Box Developer Console.**
   What: create a **Platform app → Server Authentication (Client Credentials Grant)**; under **App Access**
   choose **App Access Only** (so `box_subject_type=enterprise` authenticates as the **Service Account**);
   set **Application Scopes** = **Read and write all files and folders** (`root_readwrite`) + **Manage
   webhooks** (`manage_webhook`); capture **Client ID** + **Client Secret** + **Enterprise ID**. · Owner:
   **[operator-gated]** (Claude never sees the secret) · Depends-on: 1 · Verify:
   developer.box.com/guides/authentication/client-credentials/ (CCG = token `POST
   https://api.box.com/oauth2/token`, body `grant_type=client_credentials` + `client_id` + `client_secret`
   + `box_subject_type=enterprise` + `box_subject_id=<enterprise id>` → Service Account; *"A CCG app with App
   Access Only can send in the box_subject_type of enterprise to authenticate as its service account"*) +
   developer.box.com/guides/api-calls/permissions-and-errors/scopes/.

3. **Authorize the app in the Box Admin Console (scope approval).**
   What: **Admin Console → Integrations → Platform Apps Manager → Server Authentication Apps → (the app) →
   View → check Authorization + Enablement → Apply**; if *"Disable unpublished platform apps by default"* is
   on, **manually mark the app Enabled** (an authorized-but-not-manually-enabled app is disabled by that
   setting). **Re-authorize whenever scopes change.** · Owner: **[operator-gated]** (primary admin / co-admin
   only) · Depends-on: 2 · Verify: local
   [055-managing-platform-apps.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\055-managing-platform-apps.md)
   (the Server-Authentication-Apps authorize+enable flow, incl. JWT/CCG/limited-access) +
   [009-enterprise-settings-platform-apps.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\009-enterprise-settings-platform-apps.md)
   (the manual-enable caveat) + developer.box.com/guides/authorization/.

4. **Build the custom Box REST connector definition (API-key auth on the connection).**
   What: author the OpenAPI for a custom connector over **`https://api.box.com/2.0`** with operations
   `POST /folders` (create), `PUT /files/{id}?fields=shared_link` + `PUT /folders/{id}?fields=shared_link`
   (mint shared links), `POST /webhooks` · `GET /webhooks/{id}` · `DELETE /webhooks/{id}` (subscriptions),
   `POST /file_requests/{id}/copy` · `GET /file_requests/{id}` · `PUT /file_requests/{id}` ·
   `DELETE /file_requests/{id}` (template-copy + lifecycle), and `…/metadata/…` (Phase C). **Auth =
   API-key** (function-key, sent as header) — **not** an OAuth-CCG identity-provider config, because Power
   Platform custom connectors **do not support the client-credentials grant** (Learn, verbatim). The
   connector calls an **Azure Function façade** that injects the live Box bearer token; the function key
   lives **on the connection**. Declare the `api_key` connection parameter in `apiProperties.json` (an
   `apiKey` securityDefinition alone does **not** create it). Add it to
   [flows/connection-references.json](../../flows/connection-references.json) and keep the linter's closed
   set green. · Owner: **[Claude-buildable]** · Depends-on: 5 (the façade it points at) · Verify:
   learn.microsoft.com/connectors/custom-connectors/connection-parameters (*"Currently, client credentials
   grant type is not supported by custom connectors"* + the four supported auth types) + memory
   [codeapp-apikey-connector-connection](C:\Users\Alex\.claude\projects\C--Users-Alex-Documents-GitHub-collisionspike\memory\codeapp-apikey-connector-connection.md)
   + developer.box.com/reference/post-folders/, /reference/post-webhooks/,
   /reference/post-file-requests-id-copy/, /reference/put-files-id--add-shared-link/.

5. **Build the Box service token-mint + webhook-receiver Azure Function.**
   What: a **new `functions/box-webhook/` FC1 Function App** (per the 00-BUILD-PLAN reconciliation —
   `cespkeva-fn-ufa3ci` is **not** in the live registry; record the chosen name in `live-environment.md` at
   deploy) carrying (a) a **token-mint/façade** that does the Box CCG `POST https://api.box.com/oauth2/token`
   server-side (secret from Key Vault, 60-min token, **no refresh token** → re-mint per cycle) and forwards
   the connector's calls to `api.box.com` with the bearer; and (b) an **HTTP-trigger webhook receiver**
   (public HTTPS:443, reputable-CA cert, TLS 1.2/1.3, **not** a `*.box.com` URL): verify
   `BOX-SIGNATURE-PRIMARY/SECONDARY` (HMAC-SHA256 over body+timestamp), reject timestamps > **10 min**,
   then **process the Dataverse fan-out ON the request path and return 200 when SETTLED, or a non-2xx (503)
   on a TRANSIENT failure so Box RETRIES** (Box does NOT retry after a 2xx): write Dataverse Evidence rows /
   copy bytes back to Blob and re-run *CS Status Evaluate*. **Durable dedup = the Evidence-existence check
   on the `box:file:<id>` tag in `cr1bd_sourcemessageid`** (the webhook also stamps `cr1bd_boxfileid` +
   `cr1bd_acceptedforeva=true` as a correlation mirror, never the dedup key) and **disambiguate upload vs
   move** (`FILE.UPLOADED` fires on both). Store the secrets in **Key Vault under the HYPHENATED secret
   names** `box-client-secret`, `box-webhook-primary-key`, `box-webhook-secondary-key`. · Owner:
   **[Claude-buildable]** (build); secret values + public-endpoint cert/DNS confirm are **[operator-gated]**
   · Depends-on: 2, 3 · Verify:
   developer.box.com/guides/authentication/client-credentials/ (60-min token, no refresh) +
   developer.box.com/guides/webhooks/v2/signatures-v2/ + /v2/limitations-v2/ + /guides/webhooks/triggers/
   (`FILE.UPLOADED` = *"A file is uploaded or moved to this folder"*).

6. **Rewrite `finalize-eva-box.definition.json` to the real contract + extend the linter.**
   What: delete the fictional `Create_box_folder_UPPERCASE` (`CreateFolder`); folder is created via custom
   connector **`POST /folders`** (name = UPPERCASE Case/PO, parent = archive root) — or implicitly by
   `CreateFile`'s `folderPath` if live-test confirms auto-create (Q below); switch every byte upload to
   `GetFileContentByPath_V2` (Azure Blob, real bytes — the S2 fix) → first-party `CreateFile`
   (`folderPath`=`concat('/',toUpper(casepo))`); preserve **2-previews-then-all** photo order
   (`repetitions:1`); add the non-image pass after photos; keep the drag-drop + EVA-REST branches. Extend
   `flows/validate-flows.mjs` to ban `CreateFolder`/`folderId` and assert every photo body is fed by
   `GetFileContentByPath_V2`. · Owner: **[Claude-buildable]** · Depends-on: 4 · Verify:
   [box-archival-pipeline.md](../../docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md) §3–5
   (the verified first-party action set + S2 fix) + learn.microsoft.com/connectors/box/.

7. **Flip `BOX_API_ENABLED=true` in Dataverse (test env first).**
   What: the env-var gate that unlocks the custom connector + webhook receiver. · Owner: **[operator-gated]**
   · Depends-on: 4, 5, 6 + connection bound · Verify:
   [04-target-architecture.md](../04-target-architecture.md) §Env-var gates.

### Phase B1 — Folder root + archival at case-creation

8. **Designate the archive root folder + drop-box parent in Box.**
   What: in the Box web app, create **one root** for all case archives (e.g. `/CasePoArchive/`) and a
   parent for permanent drop-boxes (e.g. `/DropBoxes/`); record the root **folder id** (from the URL) →
   feeds the flow parameter `BoxArchiveRootId` (never hardcoded in the definition). · Owner:
   **[operator-gated]** · Depends-on: 3 · Verify: developer.box.com/reference/post-folders/ +
   [box-archival-pipeline.md](../../docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md) §5(a),
   D.2.

9. **Enforce UPPERCASE one-folder-per-Case/PO naming (case-insensitive collision rule).**
   What: the flow creates exactly **one UPPERCASE** folder per Case/PO (e.g. `CCPY26001`); Box folder names
   are **case-insensitive** so `CCPY26001` and `ccpy26001` **collide** with **409 `item_name_in_use`** — no
   process may create a lowercase sibling; the lowercase `<casepo>.eva.json` lands **inside** the single
   UPPERCASE folder. Treat re-runs as same-name updates. · Owner: **[API-driven by a flow]** (rule enforced
   by `finalize-eva-box`) · Depends-on: 6, 8 · Verify: developer.box.com/reference/post-folders/ (*"The name
   check is case-insensitive… returns 409 item_name_in_use"*) +
   [box-archival-pipeline.md](../../docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md) §9 Q2.

10. **Flip `BOX_FOLDER_AT_INTAKE_ENABLED=true` (test first) and run the live archive test.**
    What: turn folder+archival on at case-creation; live-confirm UPPERCASE casing, photo order (2 previews
    first, overview shows full registration), reflection-excluded photos absent, `.eva.json` present, and
    **whether `CreateFile` via `folderPath` auto-creates the missing folder** (else keep the explicit
    `POST /folders`). · Owner: **[operator-gated]** (gated.md H6/B5) · Depends-on: 7, 9 · Verify:
    [docs/gated.md](../../docs/gated.md) H6/B5 +
    [box-archival-pipeline.md](../../docs/plans/phase-3-enrichment-and-eva/box-archival-pipeline.md) §8 D.5,
    §9 Q1.

### Phase B2 — File Request image chaser (highest value)

11. **Hand-build ONE template File Request in the Box web app.**
    What: pin a File Request to a folder (e.g. `/FileRequest-Template/`); set the capture form = **email +
    description + the enterprise metadata field `vehicle_registration`** (text, **required**); record the
    `file_request_id` from the builder URL (`…/filerequest/<id>` → `<id>`). The metadata field is **baked
    into the template** and **cannot be varied per case** by the copy call — one template per form shape.
    (Requires step 12's metadata template to exist first so the field is selectable on the form.) · Owner:
    **[operator-gated]** (no create-from-scratch API exists) · Depends-on: 1, 12 · Verify:
    developer.box.com/guides/file-requests/ (*"Currently, the API only allows the creation of new file
    requests by copying an existing file request associated to another folder"*) +
    developer.box.com/reference/post-file-requests-id-copy/ + local
    [315-about-box-file-request.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\315-about-box-file-request.md),
    [123-managing-file-requests.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\123-managing-file-requests.md).
    **⚠ Needs a live Business-Plus tenant** (metadata field on a File Request form requires Business Plus).

12. **Create the enterprise metadata template (Admin Console).**
    What: **Admin Console → Content → Metadata** → new template (e.g. `Collision Case`) with fields mirroring
    key Dataverse Case fields — `vehicle_registration` (text), `case_reference` (text), `principal_code`
    (text), `status` (dropdown), `ready_for_eva` (dropdown/boolean), `image_count` (text/number). Stay well
    within limits: **500 templates/enterprise, 250 fields/template, 100 templates/file, 512 KB total
    metadata size**. Creating an **enterprise** template needs admin rights (the CCG app additionally needs
    `manage_enterprise_properties` if it ever creates templates via API — out of base scope). · Owner:
    **[operator-gated]** (template creation is an admin action; instances are written API-side in Phase C) ·
    Depends-on: 1 · Verify: local
    [047-how-to-create-the-right-metadata-structure-for-your-enterprise.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\047-how-to-create-the-right-metadata-structure-for-your-enterprise.md)
    (the limits table) +
    [131-customizing-metadata-templates.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\131-customizing-metadata-templates.md)
    + developer.box.com/guides/metadata/.

13. **Per-case: copy the template File Request onto the Case/PO folder (flow).**
    What: the job-sheet "copy chaser" button → flow → custom connector **`POST
    /file_requests/{templateId}/copy`** with body `folder:{id:<casePoFolderId>, type:"folder"}`,
    `status:"active"`, optional `title`/`description`/`expires_at`; the response returns the **live upload
    URL** to surface to the operator. Deactivate later with **`PUT /file_requests/{id}` `{status:"inactive"}`**
    (link then 404s). · Owner: **[API-driven by a flow]** · Depends-on: 11, 7 · Verify:
    developer.box.com/reference/post-file-requests-id-copy/ (body: `folder.id`+`folder.type` required;
    `status`/`title`/`description`/`expires_at`/`is_email_required` optional) + /reference/put-file-requests-id/.

14. **Subscribe a `FILE.UPLOADED` webhook on the Case/PO archive root (flow).**
    What: custom connector **`POST /webhooks`** with `target:{type:"folder", id:<root>}`, `address:<Function
    URL>`, `triggers:["FILE.UPLOADED"]`, scope `manage_webhook`; **one webhook per item** (a duplicate
    target+app+user returns 409). Webhook is **best-effort** (no SLA, at-least-once, droppable) — the
    receiver (step 5) dedups (Evidence-existence on the `box:file:<id>` tag) and, on a transient failure,
    returns a non-2xx so **Box retries** (the primary recovery); a periodic `ListFolder` reconciliation
    sweep is a **deferred, not-yet-built** secondary backstop. · Owner:
    **[API-driven by a flow]** (subscription lifecycle managed by the connector) · Depends-on: 5, 7, 8 ·
    Verify: developer.box.com/reference/post-webhooks/ (target file|folder, address, triggers[], 409 on
    duplicate) + developer.box.com/guides/webhooks/v2/limitations-v2/.

15. **LIVE-TEST: confirm a File Request upload fires `FILE.UPLOADED`. (BLOCKING for B2)**
    What: end-to-end test — drag a file into a copied File Request and confirm the target folder's
    `FILE.UPLOADED` webhook fires the Function. **Undocumented**: Box documents the upload lands as an
    ordinary file in the folder and the trigger fires on folder uploads, but never states the end-to-end
    path. **Fallback if it doesn't fire:** timed `ListFolder` / Metadata-Query poll. · Owner:
    **[operator-gated]** (live test) · Depends-on: 13, 14 · Verify:
    developer.box.com/guides/webhooks/triggers/ (FILE.UPLOADED wording) +
    [07-flaws-risks-and-open-questions.md](../07-flaws-risks-and-open-questions.md) Flaw 5 +
    [04-target-architecture.md](../04-target-architecture.md) §B2 live-test gate.

16. **Flip `BOX_FILEREQUEST_ENABLED=true` (test first).** · Owner: **[operator-gated]** · Depends-on: 15.

### Phase B3 — Permanent drop-boxes for image-only senders

17. **Create one permanent (non-expiring) File Request per repeat sender.**
    What: a **dedicated Box folder per repeat ImageSource** under `/DropBoxes/`, each carrying a **permanent**
    File Request (no `expires_at`) copied from the template (so it carries the required
    `vehicle_registration` field). File Requests are **exempt from the enterprise shared-link auto-expiry
    policy**, so a permanent link is genuinely achievable. **One File Request per folder** (hard rule). ·
    Owner: **[operator-gated]** to create the folders + mark permanent; **[API-driven by a flow]** for the
    copy · Depends-on: 11, 13 · Verify: local
    [123-managing-file-requests.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\123-managing-file-requests.md)
    + [059-shared-links-settings-for-your-enterprise.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\059-shared-links-settings-for-your-enterprise.md)
    + [01-box-capabilities-verified.md](../01-box-capabilities-verified.md) §1.

18. **Webhook → Function: reg-merge unmatched uploads into the Case/PO folder.**
    What: drop-box `FILE.UPLOADED` → Function reads the captured **`vehicle_registration`** metadata, matches
    it to an open instruction case (reusing ADR-0010 reg-merge), and moves/links the images into the Case/PO
    folder; **unmatched → Held** state (don't guess). · Owner: **[Claude-buildable]** (Function logic) +
    **[API-driven by a flow]** · Depends-on: 5, 12, 14 · Verify:
    [04-target-architecture.md](../04-target-architecture.md) §B3 +
    [07-flaws-risks-and-open-questions.md](../07-flaws-risks-and-open-questions.md) Flaw 6.

### Phase B4 — Surface Box in the Code App (optional)

19. **Mint a managed shared link for the Case/PO folder (flow, server-side).**
    What: custom connector **`PUT /folders/{id}?fields=shared_link`** with `shared_link:{access, password?,
    unshared_at?, permissions:{can_preview:true,…}}`; `unshared_at` (expiry) is **paid-account only**. The
    Code App passes folder-id → flow → connector → returns the embed URL `…/embed/s/{shareLink}`. **Minted
    server-side** because the page can't call Box (`connect-src 'none'`). · Owner: **[API-driven by a flow]**
    · Depends-on: 4, 7 · Verify: developer.box.com/reference/put-folders-id--add-shared-link/ (folder
    analogue of the file endpoint; `access`/`password`/`unshared_at`/`permissions`) + local
    [320-configuring-individual-shared-link-settings.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\320-configuring-individual-shared-link-settings.md).

20. **Edit the Code App `frame-src` CSP to add the Box origin (PPAC).**
    What: **Power Platform admin center → Environments → (env) → Settings → Product → Privacy + Security →
    Content security policy → App tab**; the code-app default is `frame-src 'self'` — turn the directive off
    its default and **add `https://*.app.box.com`** (custom values **merge** with the default). Per-environment;
    requires environment-admin. Only the `/embed/s/` URL is framable (raw `app.box.com/files/…` sets
    `X-Frame-Options`); preview-only, third-party-cookie caveat. **Lower-touch alternative needing NO CSP
    edit:** an "Open in Box" deep-link using the server-minted shared link. · Owner: **[operator-gated]** ·
    Depends-on: 19 · Verify:
    learn.microsoft.com/power-apps/developer/code-apps/how-to/content-security-policy (code-app default CSP
    table incl. `frame-src 'self'`; PPAC path; custom values merge / `'none'` replaces;
    `PowerApps_CSPConfigCodeApps` setting via the Power Platform API) +
    learn.microsoft.com/power-apps/developer/code-apps/how-to/embed-iframe +
    [01-box-capabilities-verified.md](../01-box-capabilities-verified.md) §5.

21. **Flip `BOX_EMBED_ENABLED=true` (test first).** · Owner: **[operator-gated]** · Depends-on: 20.

### Phase C — Enhancements (separate, higher-tier / metered decisions)

22. **Write metadata instances onto Case/PO folders + enable folder-level cascade.** What: custom connector
    `POST /folders/{id}/metadata/enterprise/{template}` to stamp each folder; enable **Admin Console →
    Enterprise Settings → Content & Sharing → Cascading Folder Level Metadata → Configure** so child files
    inherit. Optional Box **Metadata-Query API** for Box-native search. Gate `BOX_METADATA_ENABLED`. · Owner:
    **[API-driven by a flow]** + **[operator-gated]** (enable cascade) · Depends-on: 12 · Verify: local
    [046-enabling-folder-level-metadata-and-cascade.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\046-enabling-folder-level-metadata-and-cascade.md)
    + developer.box.com/guides/metadata/ + /reference/post-metadata-queries-execute-read/.

23. **Box Governance retention + legal hold over the archive root.** What: **Admin Console → Governance →
    Retention** policy, **Apply Policy To = Content within specific folders** (cascades to all files +
    subfolders; survives moves) — or by classification / metadata; **Retention Type = non-modifiable** for
    regulated record-keeping (SEC 17a-4(f)/FINRA); **Legal Holds** by **User (Custodians)** or **Folders**.
    Requires an **Enterprise add-on** + `manage_data_retention` (+ `manage_legal_hold`) scope (re-authorize).
    · Owner: **[operator-gated]** · Depends-on: residency/tier decision · Verify: local
    [012-governance-settings.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\012-governance-settings.md)
    (Apply-Policy-To options; modifiable vs non-modifiable; disposition; legal-hold scopes) +
    developer.box.com/guides/api-calls/permissions-and-errors/scopes/. **⚠ Higher tier.**

24. **Box AI over history (pre-fill EVA 12 fields / corpus Q&A).** What: custom connector `POST /ai/extract_structured`
    (1 file/call, auto-OCR) + `POST /ai/ask` (25 files/call), scope `ai.readwrite`; admin enables Box AI;
    **AI Units are metered, no rollover** — Business Plus includes **zero** (purchase ~$10/1,000); corpus-scale
    Q&A is Box AI **for Hubs** (UI-only, Enterprise Plus+). Gate `BOX_AI_ENABLED`. · Owner: **[operator-gated]**
    (purchase + enable) + **[API-driven by a flow]** · Depends-on: tier/budget decision · Verify: local
    [191-understanding-ai-units-in-box.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\191-understanding-ai-units-in-box.md)
    + [180-configuring-box-ai.md](C:\Users\Alex\Documents\GitHub\automationsresearch\box\markdown\180-configuring-box-ai.md)
    + developer.box.com/guides/box-ai/. **⚠ Metered / higher tier.**

## Cross-section dependencies

**Provides to the other sections:**
- **Connector/Function/flow sections** ← the service identity (steps 2–3), the connector auth model
  (step 4: API-key, **not** CCG-on-connector), the Function token-mint + webhook receiver shape (step 5),
  the verified endpoint/scope/limit table, and `BoxArchiveRootId` (step 8). The **finalize-eva-box rewrite**
  (step 6) is the seam to the **flow-builder** section.
- **Code App section** ← the server-minted shared-link endpoint (step 19) + the `frame-src` CSP edit
  (step 20) needed for any Box embed.
- **Dataverse/schema section** ← the env-var gates (`BOX_*`), the `vehicle_registration` field that mirrors
  Case→Box metadata, and the Evidence-row writes the webhook receiver performs.
- **EVA section** ← the archive runs **regardless of `EVA_API_ENABLED`** (drag-drop or REST); Box never gates
  EVA and EVA never gates Box.

**Needs from the other sections:**
- **Dataverse** must hold the canonical `cr1bd_casepo` (UPPERCASE-rendered for Box) and the `BOX_*` gates;
  the status machine owns photo order / 2-previews / reflection-exclusion (Box does **not** enforce these).
- **Azure** must host the new `functions/box-webhook/` FC1 Function App (name TBD at deploy —
  `cespkeva-fn-ufa3ci` is **not** in the live registry) + Key Vault for the Box secret/webhook keys,
  and the Blob (`cespkevidstdev01/evidence`) the receiver and archival read/write.
- **Flow-builder** owns `finalize-eva-box` and the per-case copy/webhook/shared-link flows that call this
  connector; **Code App** owns the buttons that trigger them.

## Risks & open questions

**Load-bearing correction (verified this pass):** the dossier's "**custom Box REST connector with CCG/JWT**"
is infeasible **as a connector auth config** — Power Platform custom connectors **do not support the
client-credentials grant** (Learn, verbatim). Resolution baked into steps 4–5: connector = **API-key auth**,
token minted **inside the Azure Function** (the EVA-Sentry pattern, memory
`codeapp-apikey-connector-connection`). This does not change the Box-side setup (Platform app + CCG + admin
authorization are still exactly as written) — only **where** the CCG token exchange runs.

Open questions (decisions owed before/at build):
1. **File-Request→`FILE.UPLOADED` firing (step 15)** — undocumented; **live-test, BLOCKING for B2**; fallback
   = timed poll.
2. **Folder auto-create via `CreateFile` `folderPath`** — unstated on Learn; live-confirm on B1 (step 10),
   else keep the explicit custom-connector `POST /folders` (the cleaner path, since no first-party
   `CreateFolder` exists).
3. **Metadata actually enabled on the live tenant** (steps 1, 11, 12) — **needs a live Business-Plus tenant**
   to confirm the feature is on, not just that the plan includes it.
4. **CSP frame-src edit consent (step 20)** — operator-gated, per-environment; or take the no-CSP "Open in
   Box" deep-link.
5. **Data residency for claimant PII** — UK/GDPR via Box Zones needs Enterprise + 10 seats + a consulting
   package (at odds with the few-seats profile); decide before Governance (step 23) — or keep PII in
   Dataverse/Blob and store only non-PII evidence in Box.
6. **Governance/AI tier appetite (steps 23–24)** — Enterprise add-on / metered AI Units; defer as
   evidence-driven, pilot-first decisions.
7. **Webhook best-effort** — no SLA, at-least-once, droppable, fires on move too → mandatory dedup +
   signature verification + reconciliation sweep (step 5).
8. **Large evidence > 75 MB** — first-party Box per-file limit is 75 MB; confirm no single instruction PDF
   exceeds it (case photos assumed fine).

## Verification log

**Box developer docs (developer.box.com) — fetched 2026-06-21:**
- /reference/post-folders/ — `POST /folders`, body `name`(1–255)+`parent.id`; **case-insensitive**, 409
  `item_name_in_use` on duplicate.
- /reference/post-file-requests-id-copy/ — `POST /file_requests/{id}/copy`, body `folder.id`+`folder.type`
  required; `status`/`title`/`description`/`expires_at`/`is_email_required`/`is_description_required`
  optional.
- /guides/file-requests/ — verbatim copy-only: *"Currently, the API only allows the creation of new file
  requests by copying an existing file request associated to another folder."* Ops = GET/COPY/PUT/DELETE.
- /reference/post-webhooks/ — `POST /webhooks`, body `target{type:file|folder,id}`+`address`+`triggers[]`,
  scope `manage_webhook`, 409 when a webhook for target+app+user already exists. `FILE.UPLOADED` valid.
- /reference/put-files-id--add-shared-link/ — `PUT /files/{id}?fields=shared_link`; `shared_link`
  {access(open|company|collaborators), password(≥8), unshared_at(paid only), permissions, vanity_name};
  **folder analogue exists**.
- /guides/authentication/client-credentials/ — CCG token `POST https://api.box.com/oauth2/token`,
  `grant_type=client_credentials`+`client_id`+`client_secret`+`box_subject_type=enterprise`+`box_subject_id`;
  `enterprise` + App Access Only → **Service Account**.
- (cited from dossier §1–8, re-confirmed shapes above) /guides/webhooks/{triggers,v2,v2/limitations-v2,
  v2/signatures-v2}, /guides/authorization/, /guides/api-calls/permissions-and-errors/scopes, /guides/metadata.

**Box admin reference (local mirror, automationsresearch/box/markdown) — read 2026-06-21:**
- 009-enterprise-settings-platform-apps.md — *Disable unpublished platform apps by default* + manual-enable
  caveat.
- 055-managing-platform-apps.md — Admin Console → Integrations → Platform Apps Manager → **Server
  Authentication Apps** (JWT/CCG/limited-access) authorize+enable flow.
- 046-enabling-folder-level-metadata-and-cascade.md — Enterprise Settings → Content & Sharing → Cascading
  Folder Level Metadata → Configure.
- 047-…-metadata-structure….md — limits: **500 templates/enterprise, 250 fields/template, 100/file, 256
  custom attrs, 255 chars keys, 512 KB total**.
- 012-governance-settings.md — Retention Apply-Policy-To (folders/classifications/metadata/all-new);
  modifiable vs **non-modifiable** (SEC 17a-4(f)/FINRA); disposition; Legal Holds by **User(Custodians)** or
  **Folders**.
- 289-administering-box-file-request.md — *"File Request is available to anyone with a Box Business Plan
  account… no one needs a Box account to access the finished form."*
- 191-understanding-ai-units-in-box.md — Business Plus AI Units = **Available for purchase**.
- (referenced) 315/123 File Request, 131 metadata templates, 059/320 shared links, 180 configuring Box AI.

**Microsoft Learn (learn.microsoft.com) — searched/fetched 2026-06-21:**
- /connectors/custom-connectors/connection-parameters — **verbatim: *"Currently, client credentials grant
  type is not supported by custom connectors."*** Supported auth: No auth, Basic, **API Key**, OAuth 2.0
  (authorization-code, with Authorization/Token/Refresh URLs). [load-bearing correction]
- /connectors/custom-connectors/azure-active-directory-authentication — managed-identity option (single-tenant
  Entra) — noted as an alternative, not used for Box.
- /power-apps/developer/code-apps/how-to/content-security-policy — code-app default CSP incl. `connect-src
  'none'`, `frame-src 'self'`; PPAC path (Environments → Settings → Product → Privacy + Security → CSP → App);
  custom values **merge** (or replace when default is `'none'`); REST setting `PowerApps_CSPConfigCodeApps`.
- /power-apps/developer/code-apps/how-to/embed-iframe — adding a host origin to the directive (the
  framing pattern).
- /connectors/box/ (per box-archival-pipeline.md §3, re-affirmed) — first-party Box connector = **Standard**,
  file-only 11 actions, interactive-OAuth only, 75 MB / 100 calls per 60 s limits, no folder-create.

**Repo memory — read 2026-06-21:**
- codeapp-apikey-connector-connection.md — the API-key-on-connection custom-connector pattern (connector must
  declare the `api_key` param; key lives on the connection) — the resolution to the CCG-on-connector gap.
