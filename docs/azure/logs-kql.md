# Playbook — read App Insights / Log Analytics (KQL)

**When to use.** You need to see what actually happened: traces, exceptions, request failures, a specific
orchestration run, custom events (`graph-renewal-success`, `graph-notification-received`).

## Invoke first
1. **`azure:azure-kusto`** skill — KQL authoring + execution.
2. **`mcp__azure__monitor`** / **`mcp__azure__applicationinsights`** — run the query against the workspace
   (integrates with the permission UI; avoids the Windows CLI quoting trap below).
3. Diagnostic framing → [diagnose.md](./diagnose.md).

## Where the telemetry lives
- **The Data API + orchestration have their OWN App Insights components** (verified 2026-07-08 during
  the TKT-127 triage — their requests are NOT in the shared parser instance): components **`cespk-api-dev`**
  and **`cespk-orch-dev`** in workspace `DefaultWorkspace-e6076573-…-SUK` (RG `DefaultResourceGroup-SUK`).
  Query THOSE for API/orch requests, traces, and exceptions.
- **Shared App Insights `cespike-parser-ai-dev`** / Log Analytics `cespike-parser-law-dev` — the retained
  Python Functions: parser, enrichment, EVA, EVA-validation, box-webhook.
- **OCR has its own pair** `cespkocr-ai-dev` / `cespkocr-law-dev`.
- Source of truth for names: [`live-environment.md`](../architecture/live-environment.md).

## Canonical queries (start here)
```kusto
// errors in the last 30 min
traces     | where timestamp > ago(30m) | where customDimensions.LogLevel == "Error"
exceptions | where timestamp > ago(30m)
requests   | where timestamp > ago(30m) | summarize count() by cloud_RoleInstance, resultCode
// one orchestration run end-to-end
traces | where operation_Id == "intake-<message-id>" | order by timestamp asc
// intake heartbeats
customEvents | where name in ("graph-renewal-success","graph-notification-received") | where timestamp > ago(26h)
```

## Gotchas (this project)
- **Windows `az.cmd` mangles inline KQL.** Long inline `--analytics-query "..."` (and especially
  `length(@)` with parens) gets corrupted → broad/garbage results. **Write the KQL to a file and pass
  `--analytics-query "@q.kql"`**, or use `mcp__azure__monitor`. To count functions use `--query "[].name"`
  and count, **never `length(@)`**. Ref [azure-orch-deploy](../../memory/azure-orch-deploy.md).
- **"Missing" logs are usually sampling.** App Insights samples by default; rows you expect can be dropped.
  Don't conclude "it didn't run" — adjust/inspect sampling (`host.json`; the API already excludes
  `Exception` from sampling so DB errors are captured).
- **Free-SKU Log Analytics retention is short (~24–48h for some data)** — old events age out; query soon.
- Prefer **PowerShell over Git Bash** for `az monitor` calls with resource-id args.

## Best-practice refs (Microsoft Learn)
- Monitor executions (Live Metrics, streaming, sampling): <https://learn.microsoft.com/azure/azure-functions/functions-monitoring>
- Configure monitoring / sampling: <https://learn.microsoft.com/azure/azure-functions/configure-monitoring>
- Monitoring & diagnostics best practices: <https://learn.microsoft.com/azure/architecture/best-practices/monitoring>

## Anti-churn checkpoint
If a query "returns nothing," suspect **sampling or the wrong App Insights resource** before assuming the
code didn't run. Confirm the resource name against `live-environment.md`; don't spam variations of the
same broken CLI query — write the `.kql` file once.

## Verify
The query runs and returns rows from the expected `cloud_RoleName` (`cespk-api-dev` / `cespk-orch-dev` /
`cespike-parser-dev`). For a clean run, `exceptions | where timestamp > ago(15m)` is empty.
