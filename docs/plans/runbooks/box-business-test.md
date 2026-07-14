# Runbook — Box Business-account test (test folder `392761581105`)

> **Status 2026-06-22 · PLANNING.** An atomized, copy-pasteable runbook to test the Box-native
> path on a **Business-or-higher** Box tenant, hard-scoped to test folder **`392761581105`**.
> This file changes **no** code and **no** live resource — it is the ordered procedure only.
>
> **Why a Business tenant at all.** The throwaway **free** account (memory `box-test-account`)
> proved 8/9 raw-REST ops on a dev token but **cannot** run the CCG `client_credentials` grant
> (`unauthorized_client`), and has **no File Requests** — exactly the two things this runbook
> validates. Base **Box Business** (~$15/user/mo) is the floor and covers CCG + folders +
> File Requests + webhooks; Business Plus is only for the deferred metadata reg field
> (out of scope here). Source: `box-integration-activation.md` §0.
>
> **Live targets (verified 2026-06-22, `docs/architecture/live-environment.md`):**
> - Function App `cespkbox-fn-v76a47` · `rg-collisionspike-dev` · UK South · FC1 Linux
> - Receiver route `POST https://cespkbox-fn-v76a47.azurewebsites.net/api/box-webhook` (authLevel=function)
> - Key Vault `cespkboxkvv76a47` (currently EMPTY)
> - Function system-assigned MI principal `5db514c8-25f2-4d94-81ec-3878286d0087`
> - App settings live: `BOX_API_ENABLED=false`, `BOX_ALLOWED_ROOT_ID=392761581105`
>
> **Owner tags:** **[BOX]** Box Dev/Admin Console or web UI (operator) · **[OP]** operator
> (a credential / live confirm Claude cannot do) · **[CLAUDE]** Claude can run once its blockers clear.

---

## 0. The four-layer scope guard — and the two absolute rules

**ABSOLUTE RULE 1 — never folder `0`.** Box folder `0` is "All Files" (the account root). No
step in this runbook ever targets folder `0`. The guard denies it unconditionally
(`tools/box-scope.json` `_comment`; `phaseA-probe.mjs` refuses `ALLOWED_ROOT === '0'`).

**ABSOLUTE RULE 2 — never outside `392761581105`.** Every folder/file/webhook/File-Request op
must target `392761581105` or a tracked descendant. Children created under it are auto-appended
to the allowlist by the post-create hook. Nothing else is reachable; the former `liveReady` bypass is retired.

The guard is **four layers** (`tools/box/README.md`):

| Layer | Where | Mechanism | Fails |
|---|---|---|---|
| 1 | `.claude/hooks/box-scope-guard.mjs` (+ `box-scope-lib.mjs`, `box-scope-postcreate.mjs`) | blocking **PreToolUse** hook — denies any `box` CLI / `api.box.com` / Box-SDK op referencing folder `0` or an id outside the allowlist; webhook creates may only target the root/tracked child | **CLOSED** (denies) |
| 2 | Function `box_client.py` `BOX_ALLOWED_ROOT_ID=392761581105` | refuses (BoxScopeError → HTTP 400) any op whose target isn't the root or a `path_collection`-confirmed descendant | HTTP 400 |
| 3 | `tools/box/*.mjs` wrappers | pass only allowlisted literal ids resolved from `box-scope.json` | n/a |
| 4 | `flows/validate-flows.mjs` `BOX_ID_LITERAL_RE` | bans hard-coded Box ids in flow definitions | lint fail |

**GATE-0 (run before anything Box-touching, [CLAUDE]):**
```
node tools/box/test-scope-guard.mjs
```
**PASS:** prints `30 passed` (30/30). **FAIL:** any non-pass → STOP; the guard is not armed, do
not issue a single Box command.

> **Business-tenant scope decision — fail closed before Phase B.** This harness may operate only on
> `392761581105`. If that test folder is not reachable on the Business tenant, stop and create a separately
> reviewed test-only harness change; do not repoint this config ad hoc. The former `liveReady` production
> bypass is retired and must not be reintroduced. Production work belongs only to TKT-178's future
> signed-run exact-object executor.

---

# PHASE A — CCG auth from Infisical + admin-auth probe

**Goal:** prove the Box CCG service-identity grant mints a token and reaches the test folder.
This is **THE blocker** for all Box-live work (`REMAINING-STEPS.md` step 1).

### A1 — [OP/BOX] Confirm tier + register/identify the CCG Platform app
- **Goal:** a Business-or-higher tenant with a Server-Auth (CCG) Platform app, App Access Only,
  scopes `root_readwrite` + `manage_webhook`.
- **Files touched:** none (Box Dev Console, web).
- **Action (`box-integration-activation.md` §1):** Box Developer Console → Create Platform App →
  **Server Authentication (Client Credentials Grant)** → App Access = **App Access Only** →
  Application Scopes ☑ *Read and write all files and folders* (`root_readwrite`) ☑ *Manage webhooks*
  (`manage_webhook`) → Save. Capture **Client ID + Client Secret + Enterprise ID**.
- **GATE:** app exists with both scopes; Client ID / Secret / Enterprise ID recorded out-of-repo.

> **Identity open question ([OP], settle here).** `phaseA-probe.mjs` defaults enterprise `941197`
> and the probe text references app `rpkw…` ("Collision Engineers"). Confirm whether `941197`/`rpkw…`
> is the **Business** tenant or the free throwaway. If a NEW Business app/enterprise is registered,
> the probe needs the new enterprise id (pass it as the CLI arg, see A4) and Infisical needs the new
> `box_client_id`/`box_client_secret` (see A3).

### A2 — [OP/BOX] Authorize + enable the app in the Admin Console
- **Goal:** lift `unauthorized_client`.
- **Files touched:** none (Box Admin Console, web).
- **Action (`REMAINING-STEPS.md` step 1; `box-integration-activation.md` §1.2):** Admin Console →
  Integrations → **Platform Apps Manager → Server Authentication Apps** → (the app) → View → check
  **Authorization + Enablement** → Apply. If *"Disable unpublished platform apps by default"* is on,
  manually mark the app **Enabled**. **Re-authorize on ANY scope change.**
- **GATE:** the app shows Authorized **and** Enabled.

### A3 — [OP] Place the CCG credentials in Infisical (`dev` env)
- **Goal:** the probe and Function read `box_client_id` / `box_client_secret` from Infisical.
- **Files touched:** none (Infisical secret store — out of repo).
- **Action:** store the Business app's `box_client_id` + `box_client_secret` under Infisical
  **`--env dev`** (the env the probe and the documented Claude steps read). If the Business app
  differs from the free one, this **overwrites** the free values — confirm the env/project choice
  with the operator first (open question).
- **GATE:** `infisical secrets --env dev` lists `box_client_id` and `box_client_secret` (values
  not printed here).

### A4 — [CLAUDE] Run the CCG auth probe (Gate A)
- **Goal:** mint the CCG token and read the test folder.
- **Files touched (read-only):** `tools/box/phaseA-probe.mjs`, `tools/box-scope.json`.
- **Exact command** (default enterprise `941197`):
```
infisical run --env dev -- node tools/box/phaseA-probe.mjs
```
  Or, for a different Business enterprise id:
```
infisical run --env dev -- node tools/box/phaseA-probe.mjs 941197
```
  (replace `941197` with the Business enterprise id). The probe runs the **exact** grant the
  Function uses: `POST https://api.box.com/oauth2/token`, `grant_type=client_credentials`,
  `box_subject_type=enterprise`, `box_subject_id=<enterpriseId>`. It prints only safe diagnostics —
  never the token or secret.
- **GATE — PASS:** the final line is `GATE A PASS: folder 392761581105 "…" … CCG service account reaches the test folder.`
- **GATE — STOP CONDITION (`unauthorized_client`):** if the probe prints
  `FAIL token mint: HTTP 4xx unauthorized_client — box_subject_type unauthorized` (exit 2), the app
  is **not Admin-authorized/enabled**. **STOP. Do not proceed to Phase B.** Go back to A2 (and A1 —
  a scope change forces re-authorize). This is the single hard gate; no later step can be faked past it.
- **GATE — 404 recovery:** if the token mints but `folders:get` returns
  `HTTP 404` (exit 4), the CCG **service account cannot see** the folder. Operator fix
  (`REMAINING-STEPS.md` step 2): collaborate folder `392761581105` to the service account as
  **Editor** in the Box web UI, then re-run A4.

---

# PHASE B — folder + shared link + webhook + File-Request → FILE.UPLOADED (the BLOCKING unknown)

**Goal:** prove the Box-native path end-to-end and answer the single biggest empirical unknown —
**does a File-Request anonymous upload fire the folder's `FILE.UPLOADED` webhook → the Function →
the case advances?** This is **BLOCKING for B2 / `BOX_FILEREQUEST_ENABLED`** and is UNDOCUMENTED by
Box (`00-BUILD-PLAN.md` Settled fact #7; `box-integration-activation.md` §5.4). It can only be
proven here, on the live Business tenant.

> **Prereq:** Phase A passed (`GATE A PASS`). Re-run GATE-0 (`node tools/box/test-scope-guard.mjs`)
> if any time has elapsed.

> **Receiver path choice — two options.** B subscribes a `FILE.UPLOADED` webhook to an HTTPS receiver:
> - **Option 1 (preferred, production-faithful) — the DEPLOYED Function.** Subscribe to
>   `https://cespkbox-fn-v76a47.azurewebsites.net/api/box-webhook?code=<host-key>`. Requires the
>   webhook signature keys in Key Vault (B3) so the receiver's HMAC gate passes, and `BOX_API_ENABLED`
>   stays **false** during the firing test (the receiver verify path does not need the facade gate;
>   it returns 200/503 on the webhook route regardless). This is what `phaseB-livetest.mjs` targets.
> - **Option 2 (cheap local de-risk) — `webhook-sink.mjs` behind an HTTPS dev tunnel.** A purely-local
>   logging receiver (no HMAC, no Dataverse) that just proves Box *delivers* the event and shows its
>   shape. **NOTE:** the sink's header comment references a `run-receiver.mjs` helper that **does not
>   exist in the repo** — raise the tunnel manually (see B0). Use the sink only to answer "did Box
>   deliver at all?" cheaply; use Option 1 for the real HMAC + case-advance proof.

### B0 — [CLAUDE, optional] Local sink behind an HTTPS dev tunnel (Option 2 only)
- **Goal:** a cheap public HTTPS endpoint to observe raw delivery + event shape, no Azure.
- **Files touched (read-only):** `tools/box/webhook-sink.mjs` (writes `tools/box/.sink-events.log`).
- **Commands:**
```
# terminal 1 — start the local sink (default port 7077)
node tools/box/webhook-sink.mjs
# terminal 2 — raise an HTTPS tunnel to it (run-receiver.mjs is NOT present; raise manually)
cloudflared tunnel --url http://localhost:7077
```
  Use the printed `https://….trycloudflare.com` URL as the `--url` for B5 instead of the Function host.
  The sink logs each delivery to console and `tools/box/.sink-events.log` (JSON lines) and returns 200.
- **GATE:** `curl https://<tunnel>/health` returns `{"ok":true}`. Skip this whole step if using Option 1.

### B1 — [OP/BOX] + [CLAUDE] Generate webhook signature keys → Key Vault (Option 1 only)
- **Goal:** the deployed receiver's dual-key HMAC gate can verify Box's signatures.
- **Files touched:** none in repo (Box Dev Console → Key Vault).
- **[OP/BOX] Action (`REMAINING-STEPS.md` step 3):** Box Dev Console → app → **Webhooks → Manage
  Signature Keys** → generate **Primary** + **Secondary** (shown **once** — copy both).
- **[CLAUDE] Store them under the HYPHENATED KV names** (resolve into `BOX_WEBHOOK_PRIMARY_KEY` /
  `BOX_WEBHOOK_SECONDARY_KEY` via the `@Microsoft.KeyVault` refs the bicep declares):
```
az keyvault secret set --vault-name cespkboxkvv76a47 --name box-webhook-primary-key   --value <PRIMARY>
az keyvault secret set --vault-name cespkboxkvv76a47 --name box-webhook-secondary-key --value <SECONDARY>
```
- **GATE:** both `az keyvault secret show --vault-name cespkboxkvv76a47 --name box-webhook-primary-key`
  (and `-secondary-key`) return a secret with a value; the Function app settings resolve (no
  `KeyVaultReferenceError` in `az functionapp config appsettings list`).

> **Note on the facade secrets (NOT required for the pure firing test).** To exercise the *connector
> facade* later you also need `box-client-secret` (from Infisical `box_client_secret`) and the
> `BOX_CLIENT_ID` app setting. The pure `FILE.UPLOADED` firing test only needs the **webhook keys**
> above — the firing test creates the webhook + uploads via the **box CLI / File Request**, not via
> the gated-off facade. Setting `box-client-secret` is:
> `az keyvault secret set --vault-name cespkboxkvv76a47 --name box-client-secret --value <CLIENT_SECRET>`
> — defer it unless you also want to test facade ops.

### B2 — [OP/BOX] Hand-build the ONE template File Request
- **Goal:** a File-Request **template** to copy from (File Requests are copy-only, no create API —
  `REMAINING-STEPS.md` step 4; `box-integration-activation.md` §4).
- **Files touched:** none (Box web UI).
- **Action:** in the Box web UI, pin **one** File Request to a folder **under the test root**
  (e.g. a `/FileRequest-Template/` child of `392761581105`). Capture form = **email + description**
  (base Business has **no** metadata reg field — that is the deferred Business Plus tier; and the
  description is **not** API/webhook-readable at any tier, verified 2026-06-21). Record the
  `file_request_id` from the builder URL.
- **GATE:** a `file_request_id` is recorded (use it as `--template <fileRequestId>` in B5).
  Optionally also set the Dataverse config var `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID` to this id (only
  needed once the flows run; not needed for the firing test itself).

### B3 — [CLAUDE] Create the test child folder + verify idempotency (409 → reuse)
- **Goal:** a `CCPY26050` child under the root, proving idempotent create (409 `item_name_in_use`
  is a SUCCESS, not an error — `00-BUILD-PLAN.md`).
- **Files touched (read-only):** `tools/box/phaseB-livetest.mjs` (child name constant `CCPY26050`).
- **Note:** `phaseB-livetest.mjs setup` (B5) already does this create-or-reuse. To prove idempotency
  **explicitly** before wiring the webhook, run the create twice via the CLI (scope guard permits the
  root + auto-tracks the child):
```
box folders:create 392761581105 CCPY26050 --json
box folders:create 392761581105 CCPY26050 --json   # second call -> 409 item_name_in_use (expected)
```
- **GATE — PASS:** first call returns `201` with a folder id; second returns **409
  `item_name_in_use`** (the idempotency proof). Folder name is **UPPERCASE** (`CCPY26050`) — Box is
  case-insensitive, so a lowercase sibling would 409 too. Record the child id.

### B4 — [CLAUDE] Shared link on the child folder (the "Open in Box" deep link)
- **Goal:** prove the server-mintable folder shared link (backs the linked-not-embedded evidence).
- **Files touched:** none (box CLI).
- **Command:**
```
box folders:update <childId> --shared-link --shared-link-access open --json
```
  (REST equivalent: `PUT /2.0/folders/<childId>?fields=shared_link` with `{shared_link:{access:"open"}}`
  — the connector's `GetFolderSharedLink` op.)
- **GATE — PASS:** the response carries `shared_link.url` with `access=open`. This is the only link
  surfaced in the Code App — **no iframe, no `frame-src` edit, `BOX_EMBED_ENABLED` stays OFF.**

### B5 — [CLAUDE] Subscribe `FILE.UPLOADED` on the root + copy the File Request
- **Goal:** wire a single recursive `FILE.UPLOADED` webhook on the root → the receiver, and copy the
  template File Request onto the child (the anonymous-upload path).
- **Files touched (read-only):** `tools/box/phaseB-livetest.mjs` (writes `tools/box/.phaseB-state.json`).
- **Command (Option 1, deployed Function):**
```
node tools/box/phaseB-livetest.mjs setup \
  --url https://cespkbox-fn-v76a47.azurewebsites.net/api/box-webhook?code=<host-key> \
  --template <fileRequestId>
```
  (Option 2: replace the `--url` with the `https://<tunnel>/` from B0.) The harness:
  (1) creates-or-reuses the `CCPY26050` child; (2) `box webhooks:create 392761581105 folder --address
  <url> --triggers FILE.UPLOADED` on the **root** (recursive — one webhook covers all children, the
  preferred strategy to stay under the unverified ~1000/app ceiling); (3) `box file-requests:copy
  <template> --folder-id <childId>` and prints the **anonymous upload URL**. All ids are saved to
  `.phaseB-state.json` for mandatory teardown.
- **GATE — PASS:** prints `webhook <id> on root 392761581105 -> <url> (FILE.UPLOADED)` **and**
  `File Request <id> copied onto child. UPLOAD URL: <url>`.
- **GATE — webhook fail:** if it prints `WEBHOOK NOT CREATED (identity may lack manage_webhook)`, the
  box-CLI identity lacks `manage_webhook` — use the CCG app identity (A1 scope) or add the scope +
  re-authorize (A2). A duplicate target+app+user 409s (idempotent — confirmed).

### B6 — [OP] Anonymous File-Request upload — THE BLOCKING TEST
- **Goal:** the real unknown. A **human drags a file into the anonymous File-Request URL** from B5
  (this cannot be scripted — it is the anonymous web upload path that Box never documents as firing a
  webhook). `REMAINING-STEPS.md` says Claude orchestrates the harness, but the anonymous upload itself
  is **operator-driven** (`box-integration-activation.md` §5.4 marks it 🔒 BLOCKING).
- **Files touched:** none (browser).
- **Action:** open the printed UPLOAD URL in a browser (incognito / logged out = truly anonymous),
  upload a small test image, submit.
- **OPTIONAL authenticated control** (proves recursion + firing independently of the File-Request
  question — [CLAUDE]):
```
node tools/box/phaseB-livetest.mjs upload-control
```
  This uploads an authenticated file straight into the child; a root webhook should deliver
  `FILE.UPLOADED` for it. If the **control** fires but the **File-Request** upload does NOT, that is
  the precise negative finding (File-Request uploads don't fire the folder webhook).

### B7 — [OP/CLAUDE] Observe `FILE.UPLOADED` with HMAC verify + is_upload disambiguation
- **Goal:** confirm the receiver actually fired and disambiguated the event.
- **Files touched (reference, read-only):** `functions/box-webhook/function_app.py` (receiver order),
  `functions/box-webhook/webhook_verify.py` (HMAC + `is_upload`).
- **Where to look:**
  - **Option 1 (deployed Function):** the Function's **Application Insights traces** —
    `node tools/box/phaseB-livetest.mjs` watches App Insights per the README; or query traces for the
    `boxwebhook.function` logger. The load-bearing receiver order is:
    **1** replay reject (`BOX-DELIVERY-TIMESTAMP` >10 min → 400) → **2** dual-key HMAC-SHA256
    (base64(HMAC(body++timestamp, key)), timing-safe, either key → 403 on mismatch) → **3** parse +
    in-process `BOX-DELIVERY-ID` dedup → **4-7** process on the request path → **200** when settled,
    **503** on transient so Box retries (Box does **not** retry after a 2xx).
  - **Option 2 (sink):** tail `tools/box/.sink-events.log` for a line with `trigger=FILE.UPLOADED`.
- **The disambiguation that matters (`webhook_verify.py is_upload`):** a folder-scoped webhook also
  fires `FILE.MOVED` on move-in; the receiver treats **only** `trigger == "FILE.UPLOADED"` as a fresh
  upload (`result["skipped"]="not_upload"` + 200 for a move). The event's `source.parent.id` is the
  folder id that resolves the case (`cr1bd_boxfolderid`).
- **GATE — PASS (the unknown resolved positively):** a `FILE.UPLOADED` delivery for the **anonymous
  File-Request upload** reaches the receiver, passes HMAC verify, and is classified `is_upload=true`.
  → B2 is de-risked; `BOX_FILEREQUEST_ENABLED` may later be flipped.
- **GATE — FAIL (the unknown resolved negatively):** no `FILE.UPLOADED` for the File-Request upload
  (even though the authenticated control in B6 fired). → **B2 is NOT reliable via webhook alone.**
  Record the finding; the documented (not-yet-built) fallback is the timed **`ListFolder`
  reconciliation sweep** — do **not** flip `BOX_FILEREQUEST_ENABLED` on the webhook path until either
  the webhook fires or the sweep is built.
- **GATE — 403 on the receiver:** HMAC mismatch → the KV keys (B1) don't match Box's app signature
  keys. Regenerate in the Box Dev Console and re-store; confirm the `?code=<host-key>` is the correct
  Function host key (the receiver's second gate behind HMAC).

### B8 — [CLAUDE] MANDATORY teardown
- **Goal:** leave the root empty — no orphan webhook, File Request, or child folder.
- **Files touched:** `tools/box/.phaseB-state.json` (reset to `{}`).
- **Command:**
```
node tools/box/phaseB-livetest.mjs cleanup
```
  This deletes, from `.phaseB-state.json`: the File Request (`box file-requests:delete <id> --yes`),
  the webhook (`box webhooks:delete <id> --yes`), and the child folder recursively
  (`box folders:delete <childId> --recursive --yes`), then prints the root's remaining items.
- **GATE — PASS:** the final `box folders:items 392761581105` listing is **empty** (no `CCPY26050`,
  no webhook, no File Request). If anything remains, delete it explicitly — but **only** ids under
  `392761581105` (the guard blocks any other). **Never** run a recursive delete on the root itself and
  **never** on folder `0`.

---

## Quick command index (real names only)

| Step | Command |
|---|---|
| Gate-0 | `node tools/box/test-scope-guard.mjs` |
| A4 | `infisical run --env dev -- node tools/box/phaseA-probe.mjs [enterpriseId]` |
| B0 | `node tools/box/webhook-sink.mjs` · `cloudflared tunnel --url http://localhost:7077` |
| B1 | `az keyvault secret set --vault-name cespkboxkvv76a47 --name box-webhook-primary-key --value <P>` (+ `-secondary-key`) |
| B3 | `box folders:create 392761581105 CCPY26050 --json` (run twice → 409) |
| B4 | `box folders:update <childId> --shared-link --shared-link-access open --json` |
| B5 | `node tools/box/phaseB-livetest.mjs setup --url https://cespkbox-fn-v76a47.azurewebsites.net/api/box-webhook?code=<host-key> --template <fileRequestId>` |
| B6 | (browser: drag a file into the printed File-Request URL) · `node tools/box/phaseB-livetest.mjs upload-control` |
| B8 | `node tools/box/phaseB-livetest.mjs cleanup` |

## Hard gates summary

| Gate | Condition to proceed |
|---|---|
| **Gate-0** | `test-scope-guard.mjs` → 30/30 |
| **Gate A (STOP)** | probe → `GATE A PASS`; **`unauthorized_client` = STOP**, fix A1/A2, never proceed past it |
| **B5** | webhook created on root + File Request copied (anonymous URL printed) |
| **B7 (BLOCKING)** | anonymous File-Request upload delivers `FILE.UPLOADED` to the verified receiver, `is_upload=true` — or record the negative finding and do **not** flip `BOX_FILEREQUEST_ENABLED` |
| **B8** | root verified empty after cleanup; nothing left outside `392761581105`; never folder `0` |

## What this runbook does NOT do (out of scope here)
- Flipping any `BOX_*` gate (`box-integration-activation.md` §2 choreography:
  `BOX_API_ENABLED` → `BOX_FOLDER_AT_INTAKE_ENABLED` → `BOX_FILEREQUEST_ENABLED`, test env first,
  ~1h publish latency) — that is the **go-live** runbook, not this test.
- Importing/binding the `cr1bd_box_rest` connector or `pac code add-data-source` (Phase D).
- Granting the Function MI (`5db514c8-25f2-4d94-81ec-3878286d0087`) a Dataverse Application User
  (`REMAINING-STEPS.md` step 5) — needed only when the receiver **writes** Evidence/Audit, NOT for the
  pure `FILE.UPLOADED` firing test. Without it, B7 asserts App Insights traces only (no case advance).
- `BOX_EMBED_ENABLED` / `BOX_METADATA_ENABLED` / `BOX_AI_ENABLED` — all reserved/deferred.
