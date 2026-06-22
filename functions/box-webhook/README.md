# box-webhook Function (Phase 7 / ADR-0012, build-plan 03)

[BUILD] — authored offline; deploy is [DEPLOY-WITH-LOGIN]; the Box `client_secret`
+ webhook signature keys + the Box app's Admin authorization are [RESERVED-FOR-USER].
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

## B. Webhook receiver — `POST /api/box-webhook`
Box → Function (server-to-server). The **load-bearing order** is enforced in
`function_app.box_webhook` using the primitives in `webhook_verify.py`:

1. **Replay reject** — `BOX-DELIVERY-TIMESTAMP` older than 10 min → 400.
2. **Dual-key HMAC-SHA256** over `body ++ timestamp`, timing-safe, primary **or**
   secondary key (rotation) → 403 on mismatch.
3. **Respond 2xx promptly**, then work (idempotent; verified+deduped deliveries
   never bounce Box into a retry storm).
4. **Dedup** on `BOX-DELIVERY-ID` (in-process) + a **durable** Evidence-existence
   check on the Box file id.
5. **Disambiguate** `FILE.UPLOADED` from `FILE.MOVED` (the folder-scoped trigger
   fires on move-in too).
6. **Resolve the case** — Box folder id → `cr1bd_boxfolderid` → Case
   (`dataverse_client.py`). Unresolved → triage/Held, never a guess.
7. **Write Evidence** (`cr1bd_evidence`; **storagePath stays Blob** — the Box file
   id is recorded as provenance in `cr1bd_sourcemessageid`) + **audit**
   `box_upload_received` (100000021) + **re-invoke the idempotent CS Status
   Evaluate** so the case advances.

Dataverse is reached with the Function's **system-assigned managed identity**
(no key); the MI must be added as a Dataverse **Application User** (operator step).
The status re-invoke posts `{ caseId }` to `STATUS_EVALUATE_FLOW_URL` (a KV ref);
the exact re-invoke transport (Dataverse-trigger vs flow-URL) is the flows
section's to pin — the Function supports the flow-URL form today and no-ops when
the URL is unset.

## Files
- `function_app.py` — HTTP routes (facade + receiver).
- `box_client.py` — CCG token-mint + Box REST seam.
- `webhook_verify.py` — pure replay/HMAC/dedup/event-shape primitives.
- `dataverse_client.py` — MI-token Dataverse Web API seam.
- `openapi/box-connector.json` (+ `.apiProperties.json`) — the custom connector.
- `infra/main.bicep` — FC1 clone; MI → Key Vault Secrets User + Storage Blob Data
  Owner; KV refs `BOX_CLIENT_SECRET` + `BOX_WEBHOOK_PRIMARY_KEY` +
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
3. Deploy the bicep; add the Function MI as a Dataverse Application User.
4. Import the custom connector; bind `cr1bd_box_rest` (the parallel REST
   connection — `shared_box` stays for finalize's byte path).
5. Flip `BOX_API_ENABLED` (test env first). Live-test the
   File-Request→`FILE.UPLOADED` firing (the single biggest empirical unknown;
   `ListFolder` sweep is the fallback).
