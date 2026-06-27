# box-webhook Function (Phase 7 / ADR-0012, build-plan 03)

[DEPLOYED] — the Function app (`cespkbox-fn-v76a47`, FC1, system-assigned MI) is
deployed to `rg-collisionspike-dev` with 9 functions published and **Gate C verified**
on the live host (receiver no-key → 401, key+unsigned → 400, facade gated-off → 503);
it runs **gated OFF** (`BOX_API_ENABLED=false`) and **secret-free** (KV
`cespkboxkvv76a47` empty). Still [RESERVED-FOR-USER]: the Box `client_secret` +
webhook signature keys (into KV), the Box app's Admin authorization (CCG), the
`cr1bd_box_rest` connector import/bind, and every gate flip.
**Claude never holds a Box credential.**

One FC1 Function app, two surfaces:

## A. CCG token-mint connector facade
Thin routes the **custom Box REST connector** (`openapi/box-connector.json`) binds
to. Each route mints the **Box CCG service-identity bearer server-side**
(`box_client.py`: `POST /oauth2/token`, `grant_type=client_credentials`,
`box_subject_type=enterprise`; `client_secret` from a Key Vault ref) and injects
it on the Box REST call. A Power Platform custom connector **cannot** run the
client-credentials grant (Microsoft Learn) — hence the Function facade; the
connector authenticates only by the **Function host key on the connection**
(`x-functions-key`). Token cached ~lifetime, refreshed on 401, backoff on 429.

Unified operationIds (the generated `*Service` method names MUST equal these):
`CreateFolder`, `CopyFileRequest`, `GetSharedLink` (file) + `GetFolderSharedLink`
(folder), `ListFolder`, `CreateWebhook` + `GetWebhook`/`DeleteWebhook`,
`GetFileRequest`/`UpdateFileRequest`/`DeleteFileRequest`.

Gated by `BOX_API_ENABLED` (defence in depth; the flow reads the Dataverse gate).
When the gate is OFF the facade `_gated_off` path returns **503** (so an
upstream caller treats it as transient, not a permanent 2xx accept). The receiver
is not gated by `BOX_API_ENABLED`; it returns 400/403 on bad input and 503 only on
a **transient** processing failure (so Box retries).

## B. Webhook receiver — `POST /api/box-webhook`
Box → Function (server-to-server). The **load-bearing order** is enforced in
`function_app.box_webhook` using the primitives in `webhook_verify.py`:

1. **Replay reject** — `BOX-DELIVERY-TIMESTAMP` older than 10 min → 400.
2. **Dual-key HMAC-SHA256** over `body ++ timestamp`, timing-safe, primary **or**
   secondary key (rotation) → 403 on mismatch.
3. **Disambiguate** `FILE.UPLOADED` from `FILE.MOVED` (the folder-scoped trigger
   fires on move-in too).
4. **Dedup** on `BOX-DELIVERY-ID` (in-process) + a **durable** check on the
   `box:file:<id>` tag in **`evidence.source_message_id`** — that tag is the dedup
   key, now enforced **server-side by the Data API's idempotent evidence POST** (a
   re-POST of the same tag persists nothing). (`evidence.box_file_id` is a
   correlation/UI MIRROR the receiver also writes — never the dedup key.)
5. **Resolve the case** — Box folder id → `case_.box_folder_id` → Case, via
   `data_api_client.py` (GET `/api/internal/box/case-by-folder/{folderId}`).
   Unresolved → triage/Held, never a guess.
6. **Write Evidence** (Postgres `evidence` row via POST
   `/api/internal/cases/{id}/evidence`; **storage_path stays Blob** — the Box file
   id is recorded as the `box:file:<id>` provenance tag in `source_message_id`, and
   **mirrored** to `box_file_id` for the UI; the row is stamped
   `accepted_for_eva=true`) + **audit** `box_upload_received` (100000021, via POST
   `/api/internal/audit`) + **re-invoke the idempotent status-evaluate** (POST
   `/api/internal/cases/{id}/status-evaluate`) so the case advances.

The fan-out in steps 3–6 runs **ON the request path** — the receiver returns
**200 only when the delivery is fully settled**, and a **non-2xx (503)** on a
**transient** failure so **Box retries** (Box does *not* retry once it sees a 2xx).
There is **no** "respond 202 promptly then a background/daemon-thread fan-out" —
the work completes inline before the status code is chosen. Audit rows are
written through the Data API's `/api/internal/audit` route — it owns the
append-only `audit_event` shape **and** the action-NAME→code lookup, so the
Function just sends the `box_upload_received` NAME + a one-line summary + the
detail.

A timed `ListFolder` reconciliation sweep is **documented but NOT built** — a
deferred, not-yet-implemented secondary backstop. The **primary** recovery from a
dropped delivery is **Box's own retry** on the non-2xx response, not the sweep.

The **Data API** (`cespk-api-dev`) is reached with the Function's
**system-assigned managed identity** — a **client-credentials** token for
`DATA_API_AUDIENCE` (no key). The Data API's `/api/internal/*` routes accept any
valid token for the API audience (no app role required), the same seam the
orchestration app uses. App-settings: `DATA_API_URL` + `DATA_API_AUDIENCE` (both
non-secret; the old `DATAVERSE_URL` / `STATUS_EVALUATE_FLOW_URL` are gone). The
status re-invoke POSTs to `/api/internal/cases/{id}/status-evaluate` (the Data API
recomputes EVA-readiness + the status machine over Postgres); it no-ops when
`DATA_API_URL` is unset and **raises** on a genuine call failure so Box retries.

## Files
- `function_app.py` — HTTP routes (facade + receiver).
- `box_client.py` — CCG token-mint + Box REST seam.
- `webhook_verify.py` — pure replay/HMAC/dedup/event-shape primitives.
- `data_api_client.py` — MI client-credentials Data API seam (resolve-case /
  Evidence / audit / status-evaluate over `/api/internal/*`; replaces the retired
  `dataverse_client.py`).
- `openapi/box-connector.json` (+ `.apiProperties.json`) — the custom connector.
- `infra/main.bicep` — FC1 clone; MI → Key Vault Secrets User + Storage Blob Data
  Owner; the **hyphenated** KV secrets `box-client-secret` +
  `box-webhook-primary-key` + `box-webhook-secondary-key` resolve into the
  **UPPER_SNAKE** app settings `BOX_CLIENT_SECRET` + `BOX_WEBHOOK_PRIMARY_KEY` +
  `BOX_WEBHOOK_SECONDARY_KEY`; **no `api.box.com` CORS rule** (server-to-server).
- `tests/` — pytest (mock httpx; no secrets).

## Run the tests
```
cd functions/box-webhook
python -m venv .venv && . .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python -m pytest -q
```

## Operator activation (out of scope for this PR)
1. Register the Box Platform app (Server Auth / CCG, App Access Only; scopes
   `root_readwrite` + `manage_webhook`); Admin-authorize it.
2. Inject `box-client-secret`, `box-webhook-primary-key`, `box-webhook-secondary-key`
   into Key Vault.
3. ~~Deploy the bicep~~ (DONE — `cespkbox-fn-v76a47` is deployed + Gate-C-verified, gated off); **re-deploy** to pick up the new `DATA_API_URL` / `DATA_API_AUDIENCE` app settings (the old `DATAVERSE_URL` / `STATUS_EVALUATE_FLOW_URL` are removed), and ensure the Function MI's client-credentials token for `DATA_API_AUDIENCE` is accepted by `cespk-api-dev` (the `/api/internal/*` routes accept any valid token for the API audience — no app-role assignment needed).
4. Import the custom connector; bind `cr1bd_box_rest` (the parallel REST
   connection — `shared_box` stays for finalize's byte path).
5. Flip `BOX_API_ENABLED` (test env first). Live-test the
   File-Request→`FILE.UPLOADED` firing (the single biggest empirical unknown). The
   primary recovery for a dropped delivery is **Box's own retry** on the receiver's
   non-2xx; the `ListFolder` reconciliation sweep is a deferred, not-yet-built
   secondary backstop.
