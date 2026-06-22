# Agents & skills integration plan (Box + Azure↔Box) — pre-implementation

> date 2026-06-21 · **status (updated 2026-06-22): ✅ CREATED — the recommendations below are now
> implemented and committed.** The **NEW agent `box-integration-architect`** exists at
> `.claude/agents/box-integration-architect.md` (frontmatter per the A1 spec). The **two NEW skills**
> exist and are committed: `.claude/skills/box-rest-api/` (SKILL.md + `references/endpoints.md`,
> `references/webhook-receiver.md`, `references/filerequest-and-metadata.md`) and
> `.claude/skills/box-flow-patterns/` (SKILL.md + `references/01-…05-*.md`). The **3 boundary extensions**
> (B1 azure-integration-engineer, B2 power-automate-flow-builder, B3 dataverse-data-architect) are applied
> — each agent body now carries its Box sub-slice triggers/boundaries. This doc is retained as the design
> rationale; the **authoritative contract remains the BUILD-PLAN reconciliation table** in
> [00-BUILD-PLAN.md](./00-BUILD-PLAN.md), not these specs.

This plan recommended the subagent + skill changes that support the **Box-centric intake pivot**
(Option 2, additive hybrid — approved 2026-06-21; ordered build in
[00-BUILD-PLAN.md](./00-BUILD-PLAN.md)). _(Originally authored as a spec ahead of the author step; the
"plan only / creates no files" framing below is the original pre-implementation voice — see the CREATED
banner above for current state.)_ Net recommendation, now implemented: **1 new agent + 4 boundary
extensions + 2 new skills**. It honours the roster philosophy in [AGENTS.md](../../AGENTS.md) / CLAUDE.md ("Agent
roster & boundaries"): **each agent owns ONE slice and DEFERS across boundaries; prefer EXTENDING an
existing agent / REUSING over adding a new one; skills are reference/knowledge or repeatable
procedures.**

---

## Method (explore → plan → agent-creator + skill-reviewer review)

1. **Explore.** Read the master build plan ([00-BUILD-PLAN.md](./00-BUILD-PLAN.md)) and the six section
   plans ([01-docs](./01-docs.md), [02-app-and-files](./02-app-and-files.md),
   [03-azure-cloud](./03-azure-cloud.md), [04-power-automate-flows](./04-power-automate-flows.md),
   [05-dataverse](./05-dataverse.md), [06-box-integration](./06-box-integration.md)); the dossier
   sections that gate the design ([01-box-capabilities-verified](../01-box-capabilities-verified.md),
   [08-relay-automate-assessment](../08-relay-automate-assessment.md),
   [09-metadata-role](../09-metadata-role.md)); the **existing roster** (the five project agents in
   `.claude/agents/` + the reused external `code-app-architect`); and the **two model skills** the new
   skills mirror (`.claude/skills/eva-sentry-api/SKILL.md` = reference/knowledge;
   `.claude/skills/power-automate-flow/SKILL.md` = copy-paste procedure).
2. **Map the pivot onto the roster.** Each build-plan slice was assigned to an existing owner where one
   exists; only the genuinely **unowned** slice (the Box TENANT side — build-plan section 06) was made a
   new agent. The reconciliation table (00-BUILD-PLAN lines 63–88) is treated as the **authoritative
   ownership map**; this plan does not re-litigate it.
3. **agent-creator review** (verdict NEEDS_FIXES — architecture sound, every entry had a quality issue).
   Applied to the **agent** specs below: descriptions rewritten as tight action-trigger sentences with
   examples (not internal-facing prose); internal plan-section numbers ("section 03", "plan 06", "Q11")
   moved out of the description/trigger field into the body; tool lists corrected (dropped
   `microsoft-docs` as a *primary* tool from box-integration-architect — CSP/connector mechanics belong
   to azure/code-app-architect); the **eva-sentry-integration** and **code-app-architect** seams made
   explicit boundaries, not subordinate clauses.
4. **skill-reviewer review** (verdict SOLID — build both, with refinements). Applied to the **skill**
   specs below: each gets the single third-person `description` field that drives selection; **the
   authoritative contract is the BUILD-PLAN reconciliation table + its verified-vs-unverified roll-up
   (00-BUILD-PLAN lines 63–88, 432–444), NOT the four section plans** (they diverged on op names /
   connection-ref name / "facts"); the verified-vs-unverified split is carried honestly (three items are
   UNVERIFIED); the `cr1bd_box`-vs-`cr1bd_box_rest` decision is now **PINNED** (parallel `cr1bd_box_rest`,
   first-party `cr1bd_box` retained for the byte path); the floor is stated precisely (**base Business** is
   the floor; **Business Plus** = the optional reg-metadata FIELD only, Wave 2/Phase-C, per
   [09-metadata-role.md](../09-metadata-role.md)).

**Honesty note (carried from both reviews):** the agent name `box-integration-architect` is referenced
by both skill descriptions but **does not exist in the roster yet** — keep the name in sync when the
agent is authored (the eva/power-automate skills name their paired agent, so the pairing convention is
right). One coverage gap is acknowledged, not plugged: the **Code App Box UI** slice (folder deep-link,
file-request URL surface) belongs to the **reused external `code-app-architect`**, which has **no
editable agent file in this repo** — it is handled as a cross-boundary brief item, not a new agent (see
Open questions).

---

## Recommended subagents

| # | Name | New / Extend | Area | One-line purpose |
|---|---|---|---|---|
| A1 | **box-integration-architect** | **NEW** | `box` (tenant/admin/contract) | Owns the Box-TENANT side end-to-end: Platform app + CCG identity, scopes, Admin authorisation, the hand-built File Request + metadata template, archive-root/drop-box designation, webhook subscription lifecycle + ceiling strategy, shared-link policy, the verified Box endpoint/scope/limit/auth contract, the FILE.UPLOADED live-test, and residency/Governance/AI-tier decisions. |
| B1 | **azure-integration-engineer** | **EXTEND** | `azure-box` | Add the Box cloud sub-slice: the custom Box REST connector OpenAPI (`api_key` on the connection), the CCG token-mint INSIDE the Function, the `box-webhook` receiver Function (HMAC dual-key, replay, dedup, upload-vs-move), the FC1-clone bicep + Key Vault refs, and the parallel `cr1bd_box_rest` connection reference. |
| B2 | **power-automate-flow-builder** | **EXTEND** | `box` (flows) | Add the Box flow definitions: `box-folder-create`, `box-file-request-copy`, the `finalize-eva-box` Box-augment delta, `case-resolve` survivor-folder ensure, `box-blob-purge`, plus the `flow-state.json` / `validate-flows.mjs` registrations. |
| B3 | **dataverse-data-architect** | **EXTEND** | `box` (schema) | Add the Box schema: 5 `BOX_*` Boolean gates + 2 String config vars, 3 `cr1bd_box*` columns on the Case table, 3 audit-action options, the `cr1bd_finalizedpayloadhash` drift declaration + the stale-comment fix, and the `verify-parity.mjs` lock. |

Grouped as the brief asks: **(A) Box-specific** = A1. **(B) Azure + Box cross-platform / orchestration /
schema** = B1, B2, B3. `eva-sentry-integration` and `document-parser-engineer` are **untouched** (the
finalize EVA payload + photo-order contract and the parser are unchanged by the pivot).

---

### A1 — box-integration-architect  ·  NEW  ·  area: `box` (Box tenant / admin / contract)

- **Purpose.** The single owner of the **Box-tenant side** of the additive-hybrid pivot. It registers
  and authorises the Box Platform app + CCG service identity; decides the scope set (`root_readwrite` +
  `manage_webhook`); choreographs Admin-Console authorisation + enablement; hand-builds the one-time
  artefacts (the template **File Request** carrying the required `vehicle_registration` metadata field;
  the enterprise metadata template); designates the archive root + `/DropBoxes/` parent and the
  **UPPERCASE one-folder-per-Case/PO** + 409-case-insensitive naming rule; owns the **webhook
  subscription lifecycle** (per-root-recursive vs per-sender vs per-case) and the ceiling/renewal
  strategy + best-effort semantics; sets shared-link/embed policy; and makes the residency / Governance /
  Box-AI-tier decisions. It is the **keeper of the VERIFIED Box endpoint / scope / limit / auth
  contract** that the azure and flow sections currently say they "DEFER to plan 06" for but have **no
  agent to defer to**. It supplies the Box-side shape; it does **not** author the connector OpenAPI, the
  Function, the flows, or the schema.

- **When-to-use triggers.** Trigger on any **Box platform/tenant** question: registering the Platform
  app / CCG service identity / Admin-Console authorisation; "what Box scopes / endpoints / limits does X
  need"; hand-building the template File Request or the enterprise metadata template; designating the
  archive root / drop-box folders; subscribing or lifecycle-managing the `FILE.UPLOADED` webhook and
  choosing per-root vs per-case; running or interpreting the FILE.UPLOADED live-test; deciding Box data
  residency (Zones) / Governance retention / Box AI tier; or any question answered by the Box
  developer/admin docs or the local Box mirror.
  *(agent-creator suggested description, for the eventual frontmatter — tight, with examples):* "Use this
  agent when the work is on the Box tenant/platform side of the intake pivot — registering the Box
  Platform app or CCG service identity, configuring Admin Console authorisation, determining which Box
  scopes or API endpoints an integration needs, hand-building the template File Request (with
  vehicle_registration metadata) or the enterprise metadata template, designating the archive root and
  /DropBoxes/ folder hierarchy, managing the FILE.UPLOADED webhook subscription lifecycle (per-root vs
  per-case, staying under the subscription ceiling), interpreting FILE.UPLOADED live-test results, or
  deciding Box data residency / Governance / Box AI tier. Examples: 'register the Box Platform app and
  CCG service account'; 'what scopes does the connector need for CreateFolder and CopyFileRequest';
  'hand-build the template File Request with vehicle_registration metadata'; 'subscribe the FILE.UPLOADED
  webhook and choose per-root vs per-case'; 'run the live webhook test and tell me what it returned';
  'decide whether we need Box Zones or Governance retention'."
  Do **NOT** trigger for: authoring the connector OpenAPI or CCG-mint Function; Power Automate flows that
  call the connector; `BOX_*` env-var schema / `cr1bd_box*` columns; EVA payload content or photo order;
  Code App UI that surfaces Box links.

- **Boundaries (defer rules vs the existing roster).**
  - Defer the **custom Box REST connector OpenAPI**, the **CCG-token-mint Function**, the **`box-webhook`
    receiver**, **Key Vault** wiring, and the **`api_key` connection** to **azure-integration-engineer**
    (it owns the Azure-side *implementation* of the contract this agent *defines* — this agent supplies
    the contract, the azure agent builds against it).
  - Defer **every Power Automate flow** that calls the connector (`box-folder-create`,
    `box-file-request-copy`, `finalize-eva-box`, `case-resolve` ensure, `box-blob-purge`, the webhook's
    `CS Status Evaluate` re-invoke) to **power-automate-flow-builder**.
  - Defer the **`BOX_*` env-var gates/config vars**, the **`cr1bd_box*` columns**, and the
    **audit-action choiceset** to **dataverse-data-architect** (plan 05 owns the schema names).
  - Defer the **EVA-Box finalisation payload, the 2-previews-then-all photo order, and what content lands
    in the Box folder at submit time** to **eva-sentry-integration**. *(This is a real seam — this agent
    decides Box folder structure + shared-link policy; eva-sentry-integration decides the content at
    finalise time.)*
  - Defer the **Code App embed of Box folder deep-links + file-request URLs** to **code-app-architect**.
  - **Never hold or output** a Box `client_secret` or a webhook signature key — those are
    operator-injected into Key Vault.

- **Tools.** `Read`, `Grep`, `Glob` (the dossier + the local Box mirror at
  `C:/Users/Alex/Documents/GitHub/automationsresearch/box/markdown`); `WebFetch` / `WebSearch`
  (developer.box.com + support.box.com verification); `context7` (Box SDK docs). Leans on the
  **box-rest-api** skill as its primary endpoint/scope/limit reference.
  *(Correction from agent-creator: do NOT list `microsoft-docs` as a primary tool — CSP and connector
  mechanics belong to azure-integration-engineer + code-app-architect, not the Box tenant.)*

- **Rationale (why NEW — see also Extend-vs-new below).** This is the **only** slice with no current
  owner: build-plan 03 explicitly "DEFERS to plan 06 (box)" for the Box-side shape, and 04/05/06 all
  reference a Box-config authority that does not exist as an agent. Section 06 is a distinct ~24-step body
  of tenant/admin/contract work that does not fit azure (Functions/KV), flows (orchestration), dataverse
  (schema), or eva (payload). Scoped to `area=box` (tenant/admin/contract), **not** `azure-box`, to keep
  a hard seam with azure-integration-engineer's Function/connector ownership.

---

### B1 — azure-integration-engineer  ·  EXTEND  ·  area: `azure-box`

- **Purpose (what is added to its existing Functions / Key-Vault / custom-connector lane).** The Box
  cloud sub-slice: the **custom Box REST connector OpenAPI 2.0** (single `apiKey`/`x-functions-key`
  securityDefinition + the `connectionParameters.api_key` declaration — an `apiKey` securityDefinition
  alone does **not** create the param); the **Box CCG token-mint INSIDE the Function**
  (`POST /oauth2/token`, `grant_type=client_credentials`, `box_subject_type=enterprise`; `client_secret`
  from Key Vault — client-credentials is unsupported on the connector itself, verified Microsoft Learn);
  the **`box-webhook` receiver Function** (dual-key HMAC-SHA256 timing-safe verify, 10-min replay reject,
  **process-on-request-path → 200 when settled / 503 on transient so Box retries**, Evidence-existence
  dedup on the `box:file:<id>` tag in `cr1bd_sourcemessageid`, FILE.UPLOADED-vs-FILE.MOVED disambiguation,
  idempotent `CS Status Evaluate` re-invoke); its **FC1-clone bicep** + Key Vault refs (HYPHENATED
  `box-client-secret` + `box-webhook-primary-key`/`box-webhook-secondary-key` → the
  `BOX_CLIENT_SECRET`/`BOX_WEBHOOK_PRIMARY_KEY`/`BOX_WEBHOOK_SECONDARY_KEY` app settings); and the
  **`cr1bd_box_rest` parallel connection-reference** (first-party `cr1bd_box` retained for the byte path).

- **When-to-use triggers (Box additions to the existing trigger set).** "author the custom Box REST
  connector OpenAPI"; "mint the Box CCG token in the Function"; "build the `box-webhook` receiver / verify
  the BOX-SIGNATURE HMAC"; "clone the FC1 bicep for the `box-webhook` Function"; "store the Box
  client_secret in Key Vault"; "add the parallel `cr1bd_box_rest` connection ref bound to the custom connector with the api_key param".
  *(agent-creator note: the existing description mentions no Box at all, so these phrases MUST be added to
  the trigger field or the router mis-fires to box-integration-architect / produces no match. The
  HMAC-SHA256 / dual-key / process-on-request-path (200-settled/503-retry) / Evidence-existence dedup /
  idempotent re-invoke specifics stay in the system-prompt body, NOT the frontmatter.)*

- **Boundaries (defer rules — what changes).** It **receives** the Box-side contract (scopes, endpoint
  shapes, webhook event semantics, live-test results) **FROM box-integration-architect — it implements
  that contract, it does not define it.** Defer the flows that call the connector to
  power-automate-flow-builder; the `BOX_*` gates + `cr1bd_box*` columns + audit actions to
  dataverse-data-architect; the EVA finalize payload to eva-sentry-integration. *(Unchanged: Code App
  shell / `pac code` to code-app-architect; parser Python to document-parser-engineer.)*

- **Tools.** Unchanged: `azure:*` skills, azure MCP, `microsoft-docs` / `microsoft-code-reference`. Now
  also leans on the **box-rest-api** skill for the Box endpoint shapes and the CCG-grant / HMAC-verify /
  api_key cross-platform patterns.

- **Rationale (why EXTEND, not a new Box-Function agent).** Build-plan 03 already assigns the connector
  OpenAPI + CCG-mint + webhook Function + bicep to the azure section ("Plan 03 (azure) OWNS"), and these
  are pure Azure-Functions / Key-Vault / custom-connector work — squarely this agent's existing slice.
  Extending the description keeps **one owner** for the FC1 / connector estate and honours prefer-extend.

---

### B2 — power-automate-flow-builder  ·  EXTEND  ·  area: `box` (flows)

- **Purpose (Box flow definitions added to its orchestration lane).** `box-folder-create` (Request+
  Response child, `CreateFolder` at parse-confirm, 409-idempotent, stamps `cr1bd_boxfolderid`); the
  **`finalize-eva-box` Box delta** (the folder **pre-exists** so finalize *augments*, not creates; keep
  the S2 `GetFileContentByPath_V2` real-bytes read → first-party `CreateFile`; migrate the hard-coded
  `BoxArchiveRootId` to read `cr1bd_BOX_FOLDER_ROOT_ID`; stamp `box_synced` LAST as the idempotency
  latch); `box-file-request-copy` (`empty(folderId)→folder_not_ready` guard; `CopyFileRequest`; returns
  `{ fileRequestUrl, expiresAt, outcome }`); `case-resolve` survivor-folder ensure (idempotent
  `box-folder-create` on merge); and `box-blob-purge` (status-driven on `box_synced` + grace, never the
  Box copy); plus the `flow-state.json` / `validate-flows.mjs` registrations.

- **When-to-use triggers (Box additions).** "create / rewrite a Box flow" (folder-create,
  file-request-copy, finalize-eva-box, case-resolve merge, blob-purge); "wire a flow to call the custom
  Box connector"; "register the `BOX_*`-gated flows in flow-state / validate-flows".
  *(agent-creator note: the existing description's "Box-sync finalisation" is too vague to trigger on the
  new Box-specific flows — add explicit phrases. The 409-idempotent / `empty(folderId)→folder_not_ready`
  detail is body content, not trigger content.)*

- **Boundaries (defer rules).** It **receives** connector action signatures (what `CreateFolder`,
  `CopyFileRequest`, `GetFileContentByPath_V2` take) from **azure-integration-engineer**'s connector
  definition, and the **`BOX_FOLDER_ROOT_ID` / `BOX_FILE_REQUEST_TEMPLATE_ID` values** from
  **box-integration-architect** (the env-vars themselves are defined by **dataverse-data-architect**).
  Defer the connector OpenAPI + webhook Function to azure-integration-engineer; the Box-tenant contract
  (template id, archive-root id, scopes, live-test) to box-integration-architect; the gates/columns/
  audit-action *values* to dataverse-data-architect; the EVA payload to eva-sentry-integration; the Code
  App buttons that trigger flows to code-app-architect.

- **Tools.** Unchanged: `code-apps-preview` connector skills, `microsoft-docs`. Now pairs with **BOTH**
  the existing **power-automate-flow** skill (M1 intake + the EVA/byte-upload finalize core) AND the new
  **box-flow-patterns** skill (the Box-specific deltas), and reads the **box-rest-api** skill for the
  connector action signatures the flows call.

- **Rationale (why EXTEND).** Build-plan 04 already owns every Box flow definition, and the existing
  agent already partially claims this ("EVA submit + Box-sync finalisation"). No Power Platform plugin
  covers Power Automate, so this remains its exclusive lane; the Box flows are net-new members of it, not
  a new slice.

---

### B3 — dataverse-data-architect  ·  EXTEND  ·  area: `box` (schema)

- **Purpose (Box schema components added to the CollisionSpike solution it owns).** The **5 `BOX_*`
  Boolean gates** (`BOX_API_ENABLED`, `…_FOLDER_AT_INTAKE_ENABLED`, `…_FILEREQUEST_ENABLED`,
  `…_EMBED_ENABLED`, `…_METADATA_ENABLED`) + **2 String config vars** (`BOX_FOLDER_ROOT_ID`,
  `BOX_FILE_REQUEST_TEMPLATE_ID`), all default-off/empty (note `BOX_AI_ENABLED` is deferred to Phase C —
  the manifest is not the complete Box set); the **3 String columns** on `cr1bd_case`
  (`cr1bd_boxfolderid`, `cr1bd_boxfilerequestid`, `cr1bd_boxfilerequesturl`); the declaration of the
  pre-existing **`cr1bd_finalizedpayloadhash`** drift (finalize reads/writes it but `case.json` never
  declared it) and the correction of the stale `case.json` line-23 "ENTERED AT EVA SUBMIT" comment to
  **parse-confirm**; the **3 audit-action options** (`box_folder_created` / `box_file_request_copied` /
  `box_upload_received`); and locking the new defaults in **`verify-parity.mjs`**.

- **When-to-use triggers (Box additions).** "add the `BOX_*` env-var gates / config vars"; "add the
  `cr1bd_box*` columns to the Case table"; "add the Box audit-action options"; "lock the Box defaults in
  verify-parity".
  *(agent-creator note: the existing description doesn't mention Box schema — add these. Concrete
  audit-action ordinals (100000019/020/021) are body content; the description says "add the Box
  audit-action options to the choiceset". The stale-comment fix is a minor reconciliation, not a primary
  trigger.)*

- **Boundaries (defer rules).** It **defines** the schema names + default values; **box-integration-
  architect** provides the runtime *values* the operator injects (which root id / template id),
  **power-automate-flow-builder** stamps the columns at runtime, and **azure-integration-engineer** holds
  the Function app-settings that READ the gates. Defer the connector to azure-integration-engineer; the
  EVA contract to eva-sentry-integration; how the Code App queries the gates to code-app-architect.

- **Tools.** Unchanged: `code-apps-preview:add-dataverse`, `microsoft-docs`. **No Box-specific tool
  additions** — this is pure Dataverse schema work.

- **Rationale (why EXTEND).** Build-plan 05 and the reconciliation table assign env-var-schema and
  audit-action ownership **exclusively here** ("env-var schema names are owned by plan 05"; "Plan 05 owns
  the choiceset"). These are additive rows in the table set this agent already owns — an extension, not a
  new slice.

---

## Recommended skills

Two skills, mirroring the proven **reference/knowledge** + **copy-paste procedure** pair the roster
already uses (`eva-sentry-api` ↔ `power-automate-flow`). **Both anchor to the BUILD-PLAN reconciliation
table + verified-vs-unverified roll-up (00-BUILD-PLAN lines 63–88, 432–444) as the single source of
truth** — the four section plans diverged and must not be re-imported.

| # | Name | Area | Kind | Pairs with | One-line purpose |
|---|---|---|---|---|---|
| S1 | **box-rest-api** | both | reference/knowledge (`eva-sentry-api` shape) | box-integration-architect (contract half) + azure-integration-engineer (connector/Function/auth half) | The verified Box REST surface the pivot uses + the three recurring cross-platform patterns (CCG-in-Function, HMAC webhook-receiver, server-minted shared links under `connect-src 'none'`). |
| S2 | **box-flow-patterns** | box | copy-paste procedure (`power-automate-flow` shape) | power-automate-flow-builder | Copy-pasteable Power Automate flow-definition fragments for the Box flows + the Box house conventions, so the flow agent never re-derives the Box shapes. |

---

### S1 — box-rest-api  ·  area: both  ·  reference/knowledge

- **Purpose.** Authoritative, distilled reference for the **Box REST surface the pivot touches**, plus
  the **three cross-platform integration patterns** that recur. Mirrors `eva-sentry-api`: a verified
  contract with a pointer back to the source for depth, carrying the verified-vs-unverified split
  honestly.

- **Triggers.** When building or validating the custom Box connector OpenAPI, the CCG token-mint, or the
  `box-webhook` receiver; when you need the exact Box endpoint / scope / limit / auth shape
  (`CreateFolder`, `CopyFileRequest`, `GetSharedLink` file+folder, `ListFolder`, `CreateWebhook` +
  webhook & File-Request lifecycle, metadata); or when wiring the CCG-token-in-Function /
  HMAC-webhook-receiver / api_key-on-connection patterns.
  *(skill-reviewer suggested `description` field — the single third-person line that drives selection):*
  "Box REST API reference for the collisionspike Box-centric intake pivot — CCG service-identity auth
  (token minted inside an Azure Function, never the connector), the custom-connector operation contract
  (CreateFolder, CopyFileRequest, GetSharedLink file+folder, ListFolder, CreateWebhook + webhook &
  File-Request lifecycle), webhook signatures/limits, and the three recurring cross-platform patterns
  (CCG-token-in-Function + api_key-on-connection, the HMAC webhook-receiver order, server-minted shared
  links under connect-src 'none'). Use when building or validating the Box custom connector OpenAPI, the
  CCG token-mint or box-webhook receiver Function, or when you need the exact Box endpoint/scope/limit/auth
  shape. Authoritative op names + verified-vs-unverified facts come from 00-BUILD-PLAN.md; re-read
  automationsresearch/box/markdown + developer.box.com for field-level depth. Pairs with the
  box-integration-architect and azure-integration-engineer agents."

- **Contents (SKILL.md vs linked refs).** Target a **lean SKILL.md (~700–1000 words, like
  eva-sentry-api)** with the load-bearing facts inline and field-level depth pushed to `references/`.

  **Lean core (SKILL.md):**
  - **Authoritative-source pointer (one line):** *the contract is the **BUILD-PLAN reconciliation table**
    (00-BUILD-PLAN.md, the unified op-name row); re-read `automationsresearch/box/markdown` +
    developer.box.com for field-level depth.* Say this first — it is the whole reason the skill exists.
  - **Auth block:** CCG `POST /oauth2/token`, `grant_type=client_credentials`,
    `box_subject_type=enterprise`, **App Access Only**, scopes `root_readwrite` (files/folders/metadata/
    file-requests/shared-links) + `manage_webhook`; **minted in the Function, NOT the connector**
    (client-credentials unsupported on custom connectors — verified Learn).
  - **Compact endpoint/op table keyed by the UNIFIED operationId names** (per 00-BUILD-PLAN line 73):
    `CreateFolder` (`POST /2.0/folders`; 409 `item_name_in_use`, case-insensitive), `CopyFileRequest`
    (`POST /file_requests/{id}/copy` — the only "create"; copy-from-template only; one File Request per
    folder; reg baked into the template), **`GetSharedLink` for BOTH** the file
    (`PUT /2.0/files/{id}?fields=shared_link`) **and the folder** (`PUT /2.0/folders/{id}?fields=shared_link`
    — **the embed needs the FOLDER link**), `ListFolder` (`GET /2.0/folders/{id}/items`, reconciliation
    sweep), `CreateWebhook` (`POST /2.0/webhooks`, target file|folder, `triggers:["FILE.UPLOADED"]`) +
    webhook lifecycle (`GET`/`DELETE /webhooks/{id}`) + File-Request lifecycle (`GET`/`PUT` status
    active|inactive/`DELETE /file_requests/{id}`), metadata endpoints. **State explicitly: the generated
    `*Service` method names the Code App binds MUST equal these `operationId`s.**
  - **Webhook semantics + Signatures (short block):** best-effort, at-least-once, droppable, fires on
    MOVE too, retries up to ~12×/2h **on a non-2xx** (Box does NOT retry after a 2xx — so the receiver
    returns 200 only when SETTLED, 503 on a transient failure to force a retry); `BOX-SIGNATURE-PRIMARY/
    SECONDARY` HMAC-SHA256 over body ++ `BOX-DELIVERY-TIMESTAMP`, 10-min replay, dual-key rotation,
    timing-safe compare; durable dedup = the **Evidence-existence check on the `box:file:<id>` tag in
    `cr1bd_sourcemessageid`** (NOT `cr1bd_boxfileid`, a correlation/UI mirror).
  - **The three cross-platform patterns (named subsections):** (1) **CCG-token-in-Function facade +
    api_key (function host key) on the connection** — `apiProperties.json` MUST declare
    `connectionParameters.api_key`; base64 body as a plain string, **never `format:byte`**; (2) the
    **webhook-receiver order** — replay → HMAC → process-fan-out-on-request-path → 200-settled / 503-retry
    → Evidence-existence dedup → upload/move disambiguation → idempotent status re-eval; (3) the
    **`connect-src 'none'` rule** → server-mint shared links; iframe-only embed needs a **`frame-src`**
    (NOT `frame-ancestors`) edit.
  - **A VERIFIED-vs-UNVERIFIED honesty box.** **CONFIRMED:** 10-min replay, HMAC-SHA256 dual-key, retries
    up to ~12×/2h, folder-scoped FILE.UPLOADED (fires on move), Business-Plus = metadata gate, CCG
    `box_subject_type=enterprise` + App Access Only, custom-connector-cannot-do-CCG, the 409-on-duplicate-
    target. **UNVERIFIED (all three — do not assert as fact):** the **~60-min token / no refresh**
    (re-mint per cycle is safe regardless); the **~1000/app-user webhook ceiling** (live ref 404'd; only
    409-on-duplicate-target is confirmed); the **"2xx within 30 s"** ceiling (confirm at build).
  - **The connection-reference decision (now PINNED):** a **parallel `shared_box_rest` / `cr1bd_box_rest`**
    is used (keeping first-party `cr1bd_box` / `shared_box` for finalize's `CreateFile` byte path) — plan
    04 §4's parallel-ref choice, now settled in `flows/connection-references.json` + ADR-0012.
  - **Plan floor stated precisely:** the floor is **base Business** (File Requests + webhooks + folders +
    CCG — Wave 0/1); **Business Plus** is the optional tier needed **only** for the reg-capture
    metadata FIELD on the File-Request form (Wave 2 / Phase C). **base Business covers File Requests +
    webhooks + folders** (Wave 0/1). Do not imply Business Plus is needed for Wave 0/1. (Per
    [09-metadata-role.md](../09-metadata-role.md).)

  **Linked references (`references/`):** per-endpoint request/response field detail
  (`references/endpoints.md`); the full webhook-receiver step order + dedup/move-disambiguation
  (`references/webhook-receiver.md`); the metadata / File-Request lifecycle + tier-gating detail
  (`references/filerequest-and-metadata.md`).

  **In-skill boundary (state it):** this is the **REST/contract** reference. It does **not** own the
  Power Automate definition fragments (that is **box-flow-patterns**) and does **not** own the React /
  connector-binding side (that stays with the reused **code-app-architect** + plan 02). It **does** own
  the `connect-src 'none'` → server-mint + `frame-src` embedding rule (a Box-REST consequence the azure
  agent reads). Do not restate the **EVA 12-field contract** (`eva-sentry-api` owns that) — only the Box
  archival coupling (the **UPPERCASE Case/PO folder**) is in scope.

- **Rationale.** Directly mirrors the proven `eva-sentry-api` reference skill and fills the EXPLORE "no
  reusable Box patterns" gap. It is **dual-pairing**: box-integration-architect leans on the contract
  half, azure-integration-engineer on the connector/Function/auth half — the symmetric
  skill-pairs-with-agent model the roster already uses. Folding the CCG/HMAC/api_key cross-platform
  patterns in here (rather than a separate skill) keeps the roster minimal and puts them where the azure
  agent reads. (skill-reviewer: SOLID; refinements above applied.)

---

### S2 — box-flow-patterns  ·  area: box  ·  copy-paste procedure

- **Purpose.** Copy-pasteable Power Automate **flow-definition fragments** for the Box flows, structured
  exactly like `power-automate-flow` (pattern-index table + linked references + house conventions), so
  the flow agent never re-derives the Box-specific shapes.

- **Triggers.** When building, editing, reviewing, or verifying any Box flow (`box-folder-create`,
  `box-file-request-copy`, the `finalize-eva-box` augment delta, `case-resolve` survivor-ensure,
  `box-blob-purge`) or when you need the exact definition shape / `@`-expression / gate-read / linter
  idiom for a Box op.
  *(skill-reviewer suggested `description` field):* "Power Automate cloud-flow fragments for the
  collisionspike Box pivot — copy-pasteable Logic Apps definition JSON for the Box-specific flows
  (box-folder-create, box-file-request-copy, the finalize-eva-box folder-augment delta, case-resolve
  survivor-folder ensure, box-blob-purge) plus the house conventions (gates are READ not defined, unified
  connector operationIds, BOX_ID_LITERAL_RE linter idiom, audit-every-branch). Use when building,
  editing, reviewing, or verifying any Box flow, or when you need the exact definition shape,
  @-expression, gate-read, or linter idiom for a Box op. Box-scoped companion to the power-automate-flow
  skill (which owns M1 intake + the EVA/byte-upload finalize core); contract names follow box-rest-api +
  00-BUILD-PLAN.md. Pairs with the power-automate-flow-builder agent."

- **Contents (SKILL.md vs linked refs).** Mirror `power-automate-flow` exactly: a **lean SKILL.md** =
  ground-truth pointer (00-BUILD-PLAN Waves 1-2-5 + [04-power-automate-flows.md](./04-power-automate-flows.md)),
  a "When to reach for this" list, a **Pattern index TABLE** (one row per fragment → `references/NN-*.md`
  + a Wave/plan ref), and a "House conventions every fragment follows" section. Each full definition
  fragment lives in its own linked reference.

  **Fragments (one `references/NN-*.md` each):**
  1. **`box-folder-create`** — Request+Response child; read `BOX_FOLDER_AT_INTAKE_ENABLED`; `CreateFolder`
     `name=@toUpper(casePo)` under `BoxArchiveRootId`; guard `empty(cr1bd_boxfolderid)`; swallow 409;
     stamp `cr1bd_boxfolderid` + `boxsyncedat`; audit `box_folder_created`.
  2. **`box-file-request-copy`** — input `{ caseId, fileRequestTemplateId, folderId }`; guard
     `empty(folderId) → folder_not_ready` (**never call Box with a null `folder.id`**);
     `CopyFileRequest status:"active"`; response `{ fileRequestUrl, expiresAt, outcome }` with
     `outcome ∈ sent|gated_off|folder_not_ready`.
  3. **`finalize-eva-box` augment delta** — **NOT "delete the fictional CreateFolder"** (that was already
     removed; [04-power-automate-flows.md](./04-power-automate-flows.md) lines 38–40 — the EXPLORE "delete
     it" step is a no-op). Reframe as **augment-existing-folder + migrate the hard-coded
     `BoxArchiveRootId` to read `cr1bd_BOX_FOLDER_ROOT_ID`**; keep the S2 `GetFileContentByPath_V2`
     real-bytes → first-party `CreateFile` byte path; the folder **pre-exists**.
  4. **`case-resolve` survivor folder ensure** — idempotent `box-folder-create` on merge.
  5. **`box-blob-purge`** — `Recurrence` with `startTime`; `PurgeGraceDays` default 7; gate
     `BOX_API_ENABLED`; delete Blob evidence where `box_synced AND boxsyncedat < now-grace` via
     `DeleteFile_V2`; **never the Box copy**.

  **House conventions (lean core):** gates are **READ, not defined**; connector ops are the **unified
  operationIds** (must equal the generated `*Service` method names); **`shared_box_rest` ops never appear
  in finalize's byte path** (bytes stay first-party `shared_box`); extend **`BOX_ID_LITERAL_RE`** to
  `parent_id|folder_id|file_request_id` (NOT `name:"<digits>"` — the name is the UPPERCASE Case/PO); allow
  `box-blob-purge`'s `status`+`boxsyncedat` ListRecords as the documented linter exception; **audit every
  branch**; the connection-ref name is **PINNED to the parallel `cr1bd_box_rest`** (first-party `cr1bd_box`
  retained for finalize's byte path); a one-line **offline-verification note** (`node
  flows/validate-flows.mjs` must print `OK`), matching `power-automate-flow`'s **[BUILD]-only** stance.

  **Hard boundary (write it into the skill — cross-link, don't duplicate):** `finalize-eva-box`'s **EVA
  12-field payload, the 2-previews-then-all photo order, the byte-upload via first-party `CreateFile`
  after `GetFileContentByPath_V2` (the S2 fix), and the `box_synced`-stamped-LAST idempotency latch**
  belong to **`power-automate-flow` Pattern 6** ("EVA + Box atomic submit"). This skill owns **only the
  Box delta**: the folder **pre-exists** (created at parse-confirm by `box-folder-create` via the custom
  connector), so finalize **augments** not creates; and the **connector-vs-first-party split**
  (`shared_box_rest` ops never in finalize's byte path). The **webhook RECEIVER is NOT a flow** (it is an
  Azure Function — owned by azure-integration-engineer + box-rest-api); reference it for the flow contract
  (the status-evaluate re-invoke) but do not author it here. Connector OpenAPI authoring is azure's —
  fragments **BIND** the connector, they don't define it. Two settled reconciliations to pull in: the
  Code App invokes copy/shared-link via **DIRECT connector ops** and finalize via a **Dataverse
  submit-signal** (no SAS-fronted flow) — so these Box flows are **Request-triggered children**, not
  app-POST targets.

- **Rationale.** Fills the EXPLORE "Box-specific flow patterns not reusable (no skill)" gap and mirrors
  the existing `power-automate-flow` skill that pairs with power-automate-flow-builder. Keeping it
  **Box-scoped (not folded into `power-automate-flow`)** preserves that skill's M1-intake focus while
  giving the flow agent a dedicated copy-paste Box library — the same one-skill-per-pattern-family shape
  already in use. (skill-reviewer: SOLID; refinements above applied — note especially fix #3, the
  already-removed CreateFolder.)

---

## Extend-vs-new decisions (anti-duplication)

The roster rule is **prefer-extend / reuse; add a new agent only for a genuinely unowned, non-overlapping
slice.** Tested against the existing five project agents + the reused `code-app-architect`:

| Pivot slice (build-plan section) | Decision | Why not a new agent / why new |
|---|---|---|
| **Box tenant / admin / contract** (06) | **NEW: box-integration-architect** | The **only** unowned slice. 03 explicitly "DEFERS to plan 06 (box)" for the Box-side shape; 04/05/06 reference a Box-config authority that **does not exist as an agent**. The ~24-step body of Platform-app / Admin-Console / template / metadata-template / archive-root / webhook-lifecycle / live-test / residency work fits **none** of azure (Functions/KV), flows (orchestration), dataverse (schema), eva (payload), parser (Python), or code-app (UI). Scoped `area=box` (not `azure-box`) to keep a hard seam with the azure agent. agent-creator confirmed: **no duplication risk after reading all four existing agent bodies.** |
| **Custom connector OpenAPI + CCG-mint + `box-webhook` Function + bicep + parallel `cr1bd_box_rest` ref** (03) | **EXTEND azure-integration-engineer** | Pure Azure-Functions / Key-Vault / custom-connector work = this agent's existing slice; 03 says "Plan 03 (azure) OWNS". A new "Box-Function agent" would split the FC1/connector estate across two owners — duplication. |
| **Box flow definitions + flow-state/linter** (04) | **EXTEND power-automate-flow-builder** | 04 owns every Box flow; the agent already partially claims it ("Box-sync finalisation"). No Power Platform plugin covers Power Automate → exclusive lane. New flows are members of it, not a new slice. |
| **`BOX_*` gates + config vars + `cr1bd_box*` columns + audit actions + verify-parity** (05) | **EXTEND dataverse-data-architect** | 05 owns env-var schema + the choiceset exclusively. Additive rows in tables this agent already owns. |
| **EVA finalize payload / photo order** (unchanged) | **No change** (eva-sentry-integration) | The pivot does not change the EVA 12-field payload or photo order; the Box folder it uploads into now pre-exists, but that is a flow concern, not an EVA-contract change. |
| **Parser** (unchanged) | **No change** (document-parser-engineer) | The pivot does not touch parsing. |
| **Code App Box UI** (folder deep-link, file-request URL surface) (02) | **No new agent — cross-boundary brief to code-app-architect** | The reused external `code-app-architect` owns the Code App shell + `pac code` deploy + connector selection. It has **no editable agent file in this repo**, so this is handled as a task brief when that work is triggered (the load-bearing CSP / server-mint / `frame-src`-not-`frame-ancestors` knowledge already lives in **box-rest-api** pattern (3) + the memories `codeapp-csp-use-connectors` / `codeapp-apikey-connector-connection`). agent-creator and skill-reviewer both flagged this gap and both recommended **not** plugging it with a new agent. |
| **Box Relay / Box Automate** | **No agent (08 verdict: not required)** | [08-relay-automate-assessment.md](../08-relay-automate-assessment.md): the valuable capabilities (custom HTTPS step, AI agents, Box Extract, metadata-triggered routing) are **Enterprise / Enterprise-Advanced-gated** (multiple tiers above the pivot's base-Business floor) and **duplicate** the authoritative parser/enrichment/Dataverse logic. box-integration-architect carries the **two ADR-0012 caveats** as a watch item (Automate **on-by-default at GA 28 Apr 2026** → disable if unused; Automate **not interoperable with Governance/Shield/Zones**) rather than a separate owner. |
| **Operator gate-flip choreography** (`BOX_API_ENABLED` → FOLDER_AT_INTAKE → FILEREQUEST → EMBED) | **No skill — a doc** | A doc (`box-integration-activation.md`, per [01-docs.md](./01-docs.md) §7) owned by box-integration-architect, mirroring DEPLOY-RUNBOOK. Revisit a procedure skill only if the choreography proves error-prone. |

**Skill anti-duplication.** Two skills, each mirroring a distinct existing one. `box-rest-api` deliberately
**folds the CCG/HMAC/api_key cross-platform patterns in** (rather than a third skill) to keep the roster
minimal. `box-flow-patterns` is **kept separate from `power-automate-flow`** (not folded) to preserve
that skill's M1-intake focus — the same one-skill-per-pattern-family shape already in use. The
webhook-receiver HMAC/replay/dedup is **NOT** a separate skill — it is folded into `box-rest-api` pattern
(2) and owned by azure-integration-engineer. A candidate **`box-codeapp-transport`** skill (Wave 4 / plan
02 React side) is **explicitly skipped** — owned by the reused code-app-architect, and its load-bearing
knowledge already lives in `box-rest-api` pattern (3) + the two CSP/api-key memories.

---

## Integration order (what to author first; dependencies on the build-plan waves)

Author in this order so each piece exists before its consumer needs it. Maps onto the build-plan waves
(00-BUILD-PLAN "Waves"); **nothing here is created by this plan** — this is the author sequence for the
follow-on step.

1. **EXTEND dataverse-data-architect FIRST.** The `BOX_*` gates + `cr1bd_box*` columns + audit actions
   are the **schema names every other piece consumes** (build-plan **Wave 0**; env-var-schema ownership
   reconciliation). Everything downstream reads these names.
2. **Author the `box-rest-api` skill (S1).** The verified Box contract + the CCG/HMAC/api_key patterns —
   **both** box-integration-architect and azure-integration-engineer depend on it as their reference.
   Anchor it to the 00-BUILD-PLAN reconciliation table.
3. **NEW box-integration-architect (A1).** Stand up the Box-tenant owner so it can supply the Box-side
   contract (scopes, endpoints, limits, template/metadata-template/archive-root facts) that build-plan 03
   currently defers to a non-existent owner.
4. **EXTEND azure-integration-engineer (B1).** Author the custom connector OpenAPI (+`api_key` param) +
   CCG-mint + `box-webhook` Function + FC1 bicep + the parallel `cr1bd_box_rest` connection ref, consuming the `box-rest-api`
   skill and the architect's contract (**Wave 0** unlock — this pins the connector op-names + invocation
   mechanism).
5. **Author the `box-flow-patterns` skill (S2).** Capture the Box flow fragments **once the connector
   op-names are pinned** (Wave 0 exit pins the invocation mechanism + operationIds — fragments must use
   the final names).
6. **EXTEND power-automate-flow-builder (B2).** Author/rewrite the Box flows against the imported
   connector + the `box-flow-patterns` skill (**Waves 1-2-5**).

*(eva-sentry-integration and document-parser-engineer are untouched — the finalize EVA payload /
photo-order contract and the parser are unchanged by the pivot. The Code App Box UI is a cross-boundary
brief to code-app-architect at **Wave 4**, not an authoring step here.)*

**Hard dependency to respect:** steps 1→2→{3,4} are sequential (schema names → contract reference →
tenant owner + connector); step 5 **must** wait for step 4's pinned operationIds; step 6 consumes 4 + 5.

---

## Open questions

1. **Connector reference strategy — ANSWERED (PINNED).** A **parallel `cr1bd_box_rest`** is used and the
   first-party `cr1bd_box` / `shared_box` is retained for `finalize-eva-box`'s `CreateFile` byte path
   (04 §4's choice; settled in `flows/connection-references.json` + ADR-0012). Both skills reference the
   pinned `cr1bd_box_rest`, no longer a placeholder.
2. **Webhook subscription LIFECYCLE: strategy-vs-execution split.** box-integration-architect owns the
   **strategy** (per-root-recursive vs per-sender vs per-case) + the ceiling/renewal/deactivation policy;
   the runtime `CreateWebhook`/`DELETE` calls are **flow-driven** (power-automate-flow-builder). Confirm
   this strategy-vs-execution split, and **who monitors webhook-count growth + the `ListFolder`
   reconciliation-sweep fallback** (currently unowned in EXPLORE).
3. **Phase-C metadata writing + cascade (`BOX_METADATA_ENABLED`).** Does box-integration-architect own
   the decision to mirror Dataverse Case fields as Box folder metadata + the post-archival sync strategy,
   or is it deferred entirely until the residency decision? It **straddles** the architect (Box contract)
   and dataverse (source-of-truth) lanes. ([09-metadata-role.md](../09-metadata-role.md) recommends
   **defer** — start base Business, add Business Plus when the reg field actually lands.)
4. **Stale-docs reconciliation owner.** The `box-archival-pipeline.md` DOWN-grade banner and the
   `case.json` line-23 comment fix are in the build-plan reconciliation table but **unassigned in
   AGENTS.md**. Likely **dataverse-data-architect** (for `case.json`) + **box-integration-architect** (for
   `box-archival-pipeline.md` / `integrations.md §Box`) — confirm.
5. **Operator gate-flip choreography — doc or skill?** Keep the `BOX_API_ENABLED → FOLDER_AT_INTAKE →
   FILEREQUEST → EMBED` choreography (~1h publish latency, test-env-first) as a **doc**
   (`box-integration-activation.md`, per [01-docs.md](./01-docs.md) §7) owned by box-integration-architect
   — **recommended now** (mirrors DEPLOY-RUNBOOK) — or promote to a procedure skill later if it proves
   error-prone.
6. **Confirm NO Box Automate/Relay agent now** ([08-relay-automate-assessment.md](../08-relay-automate-assessment.md)
   verdict: capabilities are Enterprise-Advanced-gated + duplicative). Confirm box-integration-architect
   carries the two ADR-0012 caveats (Automate on-by-default at GA 28 Apr 2026 → disable if unused;
   Automate not interoperable with Governance/Shield/Zones) as a **watch item**, not a separate owner.
7. **Code App Box UI cross-boundary brief.** The folder deep-link + file-request-URL surface is
   code-app-architect's (reused, external, no editable file here). Confirm it is handled as a **task brief
   when that Wave-4 work is triggered**, not a new agent — and that the brief carries the HARD-RULE
   no-engineering-language constraint (Box → "Archive" in rendered strings; AGENTS.md).
8. **Agent name sync.** Both skill descriptions hard-reference `box-integration-architect`; confirm that
   is the final agent name before the skills are authored (keep them in lockstep, per the eva/power-automate
   pairing convention).
