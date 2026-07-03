# Box integration — operator activation runbook

> The **operator** view of Phase 7. Claude built the connector, Functions, flows, schema, and docs
> **gated-OFF**; the **Box Dataverse schema + `cr1bd_BOX_*` env-vars are already APPLIED LIVE in Dev (all
> `BOX_*` gates OFF)** and the **`box-webhook` Function is DEPLOYED gated-OFF (2026-06-22, `cespkbox-fn-v76a47`,
> Gate-C-verified, secret-free)**, while the `cr1bd_box_rest` connector and the Box flows
> remain **authored offline (`state=off`), not imported/bound**. **You** do everything here: register the
> Box Platform app, authorize it in the Admin Console, inject the secrets, import the
> connector, designate the archive root, hand-build the template File Request, flip the `BOX_*` gates, and
> run the live confirms. **Claude never holds a Box credential.** Binding
> decision: [docs/adr/0012-box-centric-intake-additive-hybrid.md](../../adr/0012-box-centric-intake-additive-hybrid.md).
> Build spec: [box-custom-connector-and-webhook.md](./box-custom-connector-and-webhook.md). Authoritative
> order: [`docs/HISTORICAL/box-integration-pivot/plans/00-BUILD-PLAN.md`](../../HISTORICAL/box-integration-pivot/plans/00-BUILD-PLAN.md).

Gate legend (reused from the house runbooks): **[BUILD]** = Claude, offline · **[DEPLOY-WITH-LOGIN]** =
you run a deploy/import that needs your sign-in · **[RESERVED-FOR-USER] 🔒** = only you can do it (a Box
credential, Admin consent, a tenant CSP change, or a live confirm). Expect **~1 hour** gate-publish
latency after any env-var flip — it is **not** an instant cutover. Always **flip in a test env first.**

## 0. Confirm the tenant tier (do this before anything)

🔒 **Confirm the live Box plan is at least base Business.** Base **Business** covers the whole live
intake path: per-Case/PO folders, File Requests, and webhooks (B0/B1/B2). You do **not** need
Business Plus to start. **Business Plus is only the gate for the metadata FIELD** on the File-Request
form — a **deferred Wave-2 reliability upgrade** for the orphaned image-only path, out of scope now
(ADR-0012). Box AI Units are metered and **Business and Business Plus include zero** — Box AI stays a
Phase-C decision.

> If/when you later take the Business Plus metadata upgrade, confirm in **Admin Console → Content &
> Sharing** that metadata is actually enabled (the plan including it is not the same as it being on) —
> this needs the live Business Plus tenant to verify.

## 1. The unlock — Box Platform app + Admin authorization + secrets (B0) 🔒

This is the **hard unlock**; every later flip and the connector binding depend on it.

1. **Register a Box Platform app (Server Authentication / CCG).** Box Developer Console → **Create
   Platform App → Server Authentication (Client Credentials Grant)**. Under **App Access** choose **App
   Access Only** (so `box_subject_type=enterprise` authenticates as the Service Account). Set
   **Application Scopes** = **Read and write all files and folders** (`root_readwrite`) + **Manage
   webhooks** (`manage_webhook`). Capture **Client ID + Client Secret + Enterprise ID**.
2. **Authorize + enable it in the Admin Console.** Admin Console → **Integrations → Platform Apps Manager
   → Server Authentication Apps → (the app) → View → check Authorization + Enablement → Apply.** If
   *"Disable unpublished platform apps by default"* is on, **manually mark the app Enabled** (an
   authorized-but-not-enabled app is disabled by that setting). **Re-authorize whenever scopes change.**
3. **Inject secrets into Key Vault.** Supply the Box **`client_secret`** and the per-webhook
   **primary/secondary signature keys** under the **HYPHENATED** KV secret names —
   **`box-client-secret`**, **`box-webhook-primary-key`**, **`box-webhook-secondary-key`** — which resolve
   into the UPPER_SNAKE Function app settings (`BOX_CLIENT_SECRET`, `BOX_WEBHOOK_PRIMARY_KEY`,
   `BOX_WEBHOOK_SECONDARY_KEY`) via `@Microsoft.KeyVault(SecretUri=…)`. Claude declared the KV
   **references**; you supply the **values** under the hyphenated names.
4. **[DEPLOY-WITH-LOGIN]** The `functions/box-webhook` bicep is **already deployed** (`cespkbox-fn-v76a47`,
   gated-off, Gate-C-verified 2026-06-22) — what remains is to **import** the custom connector (point its
   OpenAPI `host` at the deployed Function host) and **bind BOTH Box connections** (PINNED — `flows/connection-references.json`): the **parallel
   `cr1bd_box_rest`** custom connection (the Function host key on the connection — folder-create,
   File-Request copy, shared-link, webhook lifecycle) **and** the retained first-party **`cr1bd_box`**
   (`shared_box`) connection (interactive Box sign-in — `finalize-eva-box`'s byte/`CreateFile` path).
   This is a **parallel ref, NOT an in-place repoint** of `cr1bd_box`; do not collapse the two.

> Why the free throwaway test account cannot do this: a **free** Box account's **CCG fails**
> (`unauthorized_client`) and has **no File Requests and no metadata** — only its ~60-min **dev token**
> works, and only for raw REST. The service-identity path above lights up **only** on a Business-or-higher
> tenant (any paid tier — CCG, File Requests and webhooks are all on **base Business**).

## 2. The BOX_* gate-flip choreography

Flip in this strict order, **test env first**, with ~1h publish latency between meaningful changes.
The gate **schema names + defaults** are owned by the Dataverse schema work; you only **flip** them.

| Order | Gate | Unlocks | Pre-reqs |
|---|---|---|---|
| 1 | `BOX_API_ENABLED` | the custom connector + webhook receiver at all | §1 done; connection bound |
| 2 | `BOX_FOLDER_AT_INTAKE_ENABLED` | folder-create at parse-confirm + finalize augment | archive root designated (§3) |
| 3 | `BOX_FILEREQUEST_ENABLED` | the per-case File-Request copy + drop-boxes | template built (§4); **B2 live-test passed (§5)** |

Evidence is **linked, not embedded** — no iframe, no `frame-src` edit (the Box-embed option was formally
dropped, along with `BOX_AI_ENABLED`, which remains deferred Phase-C, its own tier decision).

## 3. Designate the archive root + drop-box parent (B1) 🔒

In the Box web app, create **one root** for all case archives (e.g. `/CasePoArchive/`) and a parent for
permanent drop-boxes (e.g. `/DropBoxes/`). Record the **root folder id** (from the URL) → it becomes the
`BOX_FOLDER_ROOT_ID` config value the flows read (never hardcoded). The flow enforces **one UPPERCASE
folder per Case/PO** (e.g. `CCPY26001`); Box folder names are **case-insensitive**, so a lowercase
sibling 409s `item_name_in_use` — never create one by hand. The lowercase `<casepo>.eva.json` lands
**inside** the single UPPERCASE folder.

Then: **[RESERVED-FOR-USER]** flip `BOX_API_ENABLED` → `BOX_FOLDER_AT_INTAKE_ENABLED` (test first) and
run the **B1 live archive test**: confirm UPPERCASE casing, photo order (2 previews first, the overview
shows the **full registration**), reflection-excluded photos absent, `.eva.json` present.

## 4. Hand-build the ONE template File Request (B2) 🔒

There is **no create-from-scratch File-Request API** — it is copy-from-template only. Build the template
**once** by hand: pin a File Request to a folder (e.g. `/FileRequest-Template/`); set the capture form =
**email + description** (on **base Business** there is **no** metadata reg field — that is the deferred
Business Plus upgrade). Record the `file_request_id` from the builder URL → it becomes the
`BOX_FILE_REQUEST_TEMPLATE_ID` config value. Per case, the flow does
`POST /file_requests/{templateId}/copy` onto the Case/PO folder; deactivate later with
`PUT /file_requests/{id}` `{status:"inactive"}` (the link then 404s).

> Case-bound uploads need no reg capture — the per-case File-Request link is tied to the Case/PO folder
> and the Case already carries the parsed VRM. Only the **orphaned image-only / no-case** path benefits
> from a structured reg field, and on base Business that is filename-VRM / an emailed reg / human triage,
> **not** the File-Request free-text description (a 2026-06-21 verification proved the description is
> **not** API/webhook-readable at any tier). The metadata field is the only structured option, and it is
> the deferred Business Plus upgrade.

## 5. The BUSINESS-account second test phase (CCG + File Requests + the FILE.UPLOADED live-test) 🔒

The throwaway **free** account only proved the **raw REST mechanics** (folder-409, shared-link shape,
`ListFolder`, webhook signature/replay) — it **cannot** exercise the service-identity path. The full path
is validated **only here, on the live Business tenant**, and is **driven by you**:

1. **CCG end-to-end** — with the Admin-authorized Platform app (§1), confirm the Function mints a token
   (`POST /oauth2/token`, `grant_type=client_credentials`, `box_subject_type=enterprise`) and a connector
   op (e.g. `CreateFolder`) succeeds. _(If you see `unauthorized_client`, the app is not authorized/enabled
   — redo §1.2.)_
2. **File Requests** — confirm the hand-built template (§4) copies per case and returns a live upload URL.
3. **Metadata (only if/when the deferred Business Plus upgrade is taken)** — create the enterprise
   metadata template (Admin Console → Content → Metadata) and confirm the `vehicle_registration` field is
   **selectable on a File-Request form**. Out of scope on base Business.
4. **🔒 BLOCKING — the File-Request → `FILE.UPLOADED` live-test.** Drag a file into a copied File Request
   and confirm the target folder's `FILE.UPLOADED` webhook **fires the Function** and the case advances
   (Not Ready → Review). **This is the single biggest empirical unknown** — Box documents that the upload
   lands in the folder and that the trigger fires on folder uploads, but **never** closes the
   File-Request → event loop. **B2 cannot be relied upon until this passes.** The **primary** recovery if a
   delivery fails transiently is **Box's own retry** — the receiver returns a non-2xx (503) so Box
   re-delivers (Box does not retry after a 2xx). A timed **`ListFolder` reconciliation sweep** is
   **documented but NOT yet built** (a deferred secondary backstop) — do not rely on it as wired.

Then: **[RESERVED-FOR-USER]** flip `BOX_FILEREQUEST_ENABLED` (test first).

## 6. Webhook subscription strategy (operate, don't over-subscribe)

Subscribe `FILE.UPLOADED` via the connector's `CreateWebhook`. **Prefer a single archive-root (recursive)
or per-repeat-sender webhook over per-case** to stay under the per-app webhook-count ceiling (cited
**~1000 — UNVERIFIED**; the live ref 404'd; only the **409 on a duplicate target+app+user is confirmed**).
Webhooks are **best-effort** (no SLA, at-least-once, droppable, fire on move too) — the receiver dedups
durably on the **Evidence-existence check** (the `box:file:<id>` tag in `cr1bd_sourcemessageid`) and, on a
transient failure, returns a **non-2xx (503)** so **Box retries** (the primary recovery; Box does not retry
after a 2xx). A timed `ListFolder` reconciliation sweep is a **deferred, not-yet-built** secondary backstop.
Manage renewal/deactivation via `GET`/`DELETE /webhooks/{id}`.

## 7. Evidence in the Code App — linked, not embedded (B4)

The Code App shows a **server-minted "Open in Box" deep link** (the folder shared link) — it works
**without any CSP change** and is the operator decision. **Do not** make a `frame-src` edit; the
in-app Box Embed iframe is **not built** — the embed option has been formally dropped.

## 8. Phase C — deferred, tier-gated (not now)

Box Metadata instances + cascade + Metadata-Query (Business Plus) — formally dropped, not pursued. Box Governance
**retention + legal hold** (Admin Console → Governance; Enterprise add-on + `manage_data_retention`
[+ `manage_legal_hold`] scopes → re-authorize); Box AI extract/ask (metered AI Units, scope
`ai.readwrite`; Business/Business Plus include **zero**). Each is independently gated and its own decision,
possibly tier-changing. **Data residency:** the operator decision (2026-06-21) is **no hard requirement**
— claimant PII may live in Box; revisit Box Zones (Enterprise + seats + consulting) only if a client/
insurer later mandates UK residency. **Box Automate watch item:** it is **on-by-default at GA
(28 Apr 2026)** — **disable it if unused**; and it is **not interoperable** with Governance/Shield/Zones.

## Operator checklist (the only things Claude cannot do)

1. 🔒 Confirm the tenant tier (base Business is the floor; Business Plus only for the deferred metadata
   field).
2. 🔒 Register the Box Platform app (Server Auth / CCG, App Access Only; `root_readwrite` +
   `manage_webhook`); capture Client ID + Client Secret + Enterprise ID.
3. 🔒 Authorize + enable the app in the Admin Console (re-authorize on any scope change).
4. 🔒 Inject `box-client-secret` + `box-webhook-primary-key` + `box-webhook-secondary-key` (the HYPHENATED
   KV secret names) into Key Vault.
5. [DEPLOY-WITH-LOGIN] (Bicep already deployed — `cespkbox-fn-v76a47`.) Import the connector / bind `cr1bd_box` + `cr1bd_box_rest`.
6. 🔒 Designate the archive root (+ `/DropBoxes/` parent); record `BOX_FOLDER_ROOT_ID`.
7. 🔒 Hand-build the ONE template File Request; record `BOX_FILE_REQUEST_TEMPLATE_ID`.
8. 🔒 Flip the `BOX_*` gates per phase, test env first (`BOX_API_ENABLED` → `BOX_FOLDER_AT_INTAKE_ENABLED`
   → `BOX_FILEREQUEST_ENABLED`). ~1h publish latency.
9. 🔒 Run the live confirms: B1 UPPERCASE casing + photo order + reflection exclusion; and the
   **BLOCKING** B2 File-Request → `FILE.UPLOADED` live-test (on a transient miss, Box's own retry on the
   receiver's 503 is the primary recovery; the `ListFolder` reconciliation sweep is a deferred,
   not-yet-built backstop).

All of these are consolidated in [../../gated.md](../../gated.md).

## 9. Intake invocation of `box-folder-create` — spec note (operator/business-phase LIVE edit) 🔒

`box-folder-create` mints the UPPERCASE Case/PO folder at **parse-confirm**, so it must be invoked from
**CS Intake** at the point `cr1bd_casepo` first exists. **This is a LIVE edit, not a repo change:** the
repo `flows/definitions/intake.definition.json` **TRAILS live** (it does not yet contain `Run_enrich` /
`Run_case_resolve`, both verified live 2026-06-21 — memory `intake-repo-trails-live`). Do **not** add the
call to the stale repo def (that would make the drift worse and a solution re-import would regress the
live wiring). Instead, the operator (or Claude under the live-services override) edits the **live** CS
Intake flow, **patching only the `actions` node — never the `triggers`** (the `OnNewEmailV3` Office-365
webhook must stay byte-identical; memory `flow-webhook-trigger-provisioning`).

**Exact insertion point (live intake):** inside **`Scope_generate_casepo` → `If_needs_casepo`** (the true
branch), as a new action **after `Update_case_casepo`** (the action that first writes `cr1bd_casepo`) —
running in parallel with / after `Audit_casepo_assigned` is fine since the Scope is failure-isolated:

```jsonc
"Run_box_folder_create": {
  "type": "Workflow",
  "inputs": {
    "host": { "workflowReferenceName": "CS_Box_Folder_Create" },   // rebind to the live box-folder-create GUID in the designer
    "body": {
      "caseId": "@variables('caseId')",
      "casePo": "@outputs('Compose_next_casepo')",                  // the just-generated Case/PO
      "workProviderId": "@variables('workProviderId')"             // carried for symmetry; not load-bearing in the child
    }
  },
  "runAfter": { "Update_case_casepo": [ "Succeeded" ] }
}
```

Notes that make this safe:
- **Gate inside the child.** Intake calls it **unconditionally**; the child re-reads
  `cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED` and no-ops (`outcome:"gated_off"`) until the gate is flipped — so the
  insertion can land live **before** the gate is on, with zero behavioural change.
- **Image-only / no-provider cases get no folder** — they never enter `Scope_generate_casepo` (empty
  `cr1bd_evaworkprovider` → no Case/PO), exactly as required.
- **Idempotent.** The child guards on `empty(cr1bd_boxfolderid)` and the Function swallows Box 409, so a
  re-run (or the `case-resolve` survivor-ensure calling the same child) is harmless.
- **Failure-isolated.** `Scope_generate_casepo` is off the critical path (nothing runs after it), so a Box
  hiccup can never stall a case or break the classify → parse → status chain.

Until that live edit is made, `box-folder-create` only runs via `case-resolve`'s survivor-folder ensure
(already wired in the repo). Reconcile the repo intake def (add `Run_enrich` + `Run_case_resolve` +
`Run_box_folder_create`) to live **before any solution re-import**.
