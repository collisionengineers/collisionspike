# Box test-scope tools

These tools are hard-scoped to folder `392761581105` and its tracked descendants. They are for
identity and webhook verification only; production operations require TKT-178's separately reviewed
signed executor.

The fail-closed guards read [`../box-scope.json`](../box-scope.json), reject folder `0`, reject unknown
configuration keys, and reject every object ID outside the allowlist. Children created under an allowed
parent are added to the allowlist by the post-command hook.

Commands:

```powershell
node tools/box/test-scope-guard.mjs
infisical run --env dev -- node tools/box/identity-probe.mjs
node tools/box/webhook-smoke.mjs setup --url <receiver-url> --template <file-request-id>
node tools/box/webhook-smoke.mjs upload-control
node tools/box/webhook-smoke.mjs cleanup
```

| File | Purpose |
| --- | --- |
| `identity-probe.mjs` | Mint a service token and read the fixed test root without printing secrets |
| `webhook-smoke.mjs` | Create test-root webhook artifacts, exercise an upload, and clean up |
| `webhook-sink.mjs` | Optional local receiver for request-shape debugging |
| `test-scope-guard.mjs` | Verify shell guards, scope rejection, and downward allowlist growth |

The deployed receiver and its infrastructure live in
[`services/functions/box-webhook/`](../../services/functions/box-webhook/). Exact live state belongs in
[`LIVE_FACTS.json`](../../LIVE_FACTS.json).
