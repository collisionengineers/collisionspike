# tools/box — live Box integration tooling (test-folder-scoped)

Everything here is **hard-scoped to the test folder `392761581105`** and its descendants
via the scope guard. Nothing here may touch any other Box folder. The former `liveReady` production bypass
is retired; changing the config mode/root or reintroducing `liveReady=true` blocks Box operations. Production
cutover requires TKT-178's separately reviewed signed-run exact-object executor, never this test harness.

## Scope guard (Phase 0) — built, armed, verified

Four layers stop any out-of-scope Box op:

1. **`.claude/hooks/box-scope-guard.mjs`** — blocking PreToolUse hook (Bash). Denies any
   `box` CLI / `api.box.com` / Box-SDK command referencing folder `0` or an id outside
   the allowlist; webhook creates may only target the root or a tracked child.
2. **`box_client.py` `BOX_ALLOWED_ROOT_ID`** — the deployed Function refuses any op whose
   target isn't the root or a path_collection-confirmed descendant (HTTP 400). The live test app setting is
   populated and must never be cleared. Current code treats absence as lifted, so making absence fail closed
   is an explicit TKT-178 implementation prerequisite—not a production operating mode.
3. **CLI/SDK wrappers here** pass literal ids resolved from the allowlist.
4. **`flows/validate-flows.mjs` `BOX_ID_LITERAL_RE`** — no hard-coded Box ids in flows.

Config: **`tools/box-scope.json`** `{ allowedRoot, allowedIds, mode: "test_only" }`. The root and mode are
immutable and the Bash/PowerShell hooks reject drift. Children
created under an allowed parent are auto-tracked by `.claude/hooks/box-scope-postcreate.mjs`.

**Verify (Gate 0):** `node tools/box/test-scope-guard.mjs` → expect `30 passed`.

## Phase A — CCG auth probe

```
infisical run --env dev -- node tools/box/phaseA-probe.mjs   # enterprise 941197 default
```
Mints the CCG service-identity token from Infisical (`box_client_id`/`box_client_secret`)
and reads the test folder. Prints only safe diagnostics (never the token/secret).

**Current status:** the CCG app returns `unauthorized_client` ("box_subject_type
unauthorized") — the Platform app is **not yet Admin-Console authorized**. Operator step:
Box Dev Console (App Access = App+Enterprise, scopes root_readwrite + manage_webhook) →
Box Admin Console → Custom Apps Manager → authorize client id `rpkw…`. Then re-run the probe.
If it then 404s, collaborate folder `392761581105` to the service account (Editor).

## Phase B — FILE.UPLOADED de-risk (the empirical unknown), against the DEPLOYED Function

No tunnel. We test against the real deployed `box-webhook` Function (Phase C gives a public
HTTPS endpoint with a proper cert), which is also more production-faithful.

```
# subscribe a FILE.UPLOADED webhook on the root -> the deployed receiver, prep a child folder
node tools/box/phaseB-livetest.mjs setup --url https://<fn-host>/api/box-webhook?code=<host-key> [--template <fileRequestId>]

# then upload: via the File-Request URL (anonymous — the real test), or:
node tools/box/phaseB-livetest.mjs upload-control      # authenticated control upload

# watch the Function's App Insights (traces) for the receiver order + 'FILE.UPLOADED'
node tools/box/phaseB-livetest.mjs cleanup             # delete webhook + file-request + child
```
Webhook creation needs `manage_webhook` (the CCG app once Admin-authorized; the personal Box
CLI app may lack it — the harness prints the error if so). `--template` requires one hand-built
File Request to copy from (File Requests can't be created via API). `webhook-sink.mjs` remains
as an optional purely-local debug receiver (point a `func start` or your own tunnel at it).

## Phase C — deploy the receiver Function

`functions/box-webhook/infra/main.bicep` (deployed with `boxAllowedRootId=392761581105`,
`boxEnterpriseId=941197`, `boxApiEnabled=false`; the bicep param defaults for the two ids are empty strings, supplied at deploy). The infra (Function App + Key Vault +
storage + MI + RBAC) deploys with **no secrets** — the secret VALUES are injected into Key
Vault out-of-band (`box-client-secret` from Infisical; the two webhook HMAC keys come from the
Box Dev Console; `status-evaluate-flow-url` from the flow). The gated-off facade returns 503
until `BOX_API_ENABLED=true` (Phase E). See `docs/plans/phase-7-box-integration/REMAINING-STEPS.md`.

## Files

| File | Purpose |
|---|---|
| `phaseA-probe.mjs` | CCG mint + Gate A (reach the test folder) |
| `phaseB-livetest.mjs` | orchestrate folder/file-request/webhook/upload, with cleanup |
| `webhook-sink.mjs` | optional purely-local debug receiver |
| `test-scope-guard.mjs` | Gate 0 — verifies the blocking hook |
