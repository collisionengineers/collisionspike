# Live gate readback + assistant shutdown — `cespk-api-dev`, 2026-07-21

Closes the "single biggest open question" raised by
[`code-derived-gate-inventory-2026-07-20.md`](./code-derived-gate-inventory-2026-07-20.md): whether the
AI-family gates were actually on live, and whether the model endpoint was configured.

**Banked same-day deliberately.** App Insights runs on free-tier retention, whose usable KQL window
collapses within hours. The counts below are not re-derivable later; this file is the durable record.

- Resource: Function App `cespk-api-dev`, resource group `rg-collisionspike-dev`
- Subscription: `e6076573-23a5-46a8-acef-7e22d264e5db`
- Method: `az functionapp config appsettings list` projected to named keys only. The full settings list
  was never dumped — it carries connection strings.

## 1. Readback before any change

```
Name                    Value
----------------------  -------
AI_CHAT_ENABLED         true
AI_ASSIST_ENABLED       true
IMAGE_ANALYSIS_ENABLED  true
MCP_SERVER_ENABLED      true
```

Also confirmed present in the same pass: `AI_MODEL_ENDPOINT` (set) and `AI_MODEL_DEPLOYMENT=gpt-5`;
`ASSISTANT_TOOLSET_V2=true`; `ASSISTANT_WRITE_TIER_ENABLED=true`.

Neither `AI_ASSIST_ENABLED` nor `AI_CHAT_ENABLED` exists on `cespk-orch-dev` (checked — it carries only
`EMAIL_AI_ENABLED`, `AI_MODEL_ENDPOINT`, `AI_MODEL_DEPLOYMENT`). The SPA host `cespk-spa-dev` holds no
gate settings; it reads them over HTTP. So `cespk-api-dev` is the sole owner of both names.

## 2. The correction this forces

`packages/domain/src/gates.ts` asserted that `AI_MODEL_ENDPOINT`/`AI_MODEL_DEPLOYMENT` were **absent**
live, and therefore that the generate route was an honest no-op regardless of its boolean. That was
wrong. Both are configured against a `gpt-5` deployment, so `aiAssistConfigured()` evaluated true and
`POST /api/cases/{id}/ai-suggestions/generate` was making **real model calls** whenever
`AI_ASSIST_ENABLED` was on. The comment is corrected in the same change as this file.

The same stale belief had propagated into `docs/operations/feature-gates.md` ("it still needs the AI
model connection configured to actually do anything"). Also corrected.

## 3. The change

Explicit operator direction: disable the AI assistant and hide its surfaces.

```
az functionapp config appsettings set -n cespk-api-dev -g rg-collisionspike-dev \
  --settings AI_ASSIST_ENABLED=false AI_CHAT_ENABLED=false
```

Set to the literal string `false` rather than deleted, so the off-state is explicit, greppable and
auditable. Exactly two settings written.

**No code change and no deploy were required.** Both surfaces are honest-off by construction —
`AiAssistPanel` returns `null` on a disabled gate, and the header assistant button and drawer are
conditional renders. Gate-off produces byte-identical rendered output to deleting the components.

## 4. Readback after

```
Name                    Value
----------------------  -------
AI_CHAT_ENABLED         false
AI_ASSIST_ENABLED       false
IMAGE_ANALYSIS_ENABLED  true
MCP_SERVER_ENABLED      true
```

## 5. Health across the restart

`appsettings set` restarts the app (~144 functions). App state after: **Running**.

| Pass | Window (UTC) | Requests | Failed | Exceptions |
|---|---|---|---|---|
| 1 | ~11:20 – 11:36 | 329 | 0 | 0 |
| 2 (confirming) | 11:22:51 – 11:37:09 | 283 | 0 | 0 |

Pass 1 also showed 0 traces at severity ≥ 3. The per-minute histogram had traffic in **every** minute,
so these are real negatives rather than an empty window. The config write is pinned by the activity log
to `Microsoft.Web/sites/config/write`, Started `11:32:54.519Z` → Succeeded `11:32:55.441Z` — mid-window in
both passes, with 45+ requests served in the minutes after it and no failures, no traffic gap and no
cold-start exception burst. Rollback was not needed and was not run.

Pass 2 was run specifically because pass 1 had only ~3 minutes of *post*-restart data ingested at
query time; on its own it would have been weak evidence.

## 6. What this does NOT cover

- **Signed-in SPA confirmation is still outstanding.** Both gate routes are `authLevel:'anonymous'` but
  wrapped in `withRole('CollisionSpike.User')`, so an unauthenticated probe returns 401 regardless of
  gate state and proves nothing. Verifying that the panel and button are visually gone requires a
  signed-in browser pass: `gates/ai-assist` should return `{"enabled":false,...}` and `gates/ai-chat`
  likewise.
- **"AI is off" would be an overstatement.** `IMAGE_ANALYSIS_ENABLED` and `MCP_SERVER_ENABLED` are
  independent leaves, not children of these two. Both remain on: image analysis still writes
  `ai_suggestion` rows, and external AI tools can still read case data over MCP.
- **Image-analysis output is now unreviewable.** The Assistant panel was its only case-page surface, so
  new suggestions accumulate invisibly and any pending rows can no longer be accepted or rejected. No
  data is deleted; the list/review API routes remain ungated.
- `IMAGE_ROLE_CLASSIFY_ENABLED` (on `cespk-orch-dev`) and `MCP_IMAGE_INGEST_ENABLED` were not read.

## 7. Rollback

```
az functionapp config appsettings set -n cespk-api-dev -g rg-collisionspike-dev \
  --settings AI_ASSIST_ENABLED=true AI_CHAT_ENABLED=true
```

One command, ~30 seconds, no build and no deploy.

## Tooling note for the runbook

Through this shell, `az functionapp show --query "{state:state,host:defaultHostName}"` returned `null`
for both fields, and the `set` command's own confirmation table rendered setting names with a blank
Value column. Parenthesised JMESPath (e.g. `keys(@)`) fails outright with `-o was unexpected at this
time`. Do not trust a write command's own echo — verify with
`list --query "[?name=='NAME'].{name:name,value:value}" -o table`, which renders correctly.
