# collisionspike — custom connector definitions

> **⚠️ Historical — Power Platform era (deprovisioned 2026-06-27).** These are **Power Platform custom
> connector** definitions (`apiDefinition.swagger.json` + `apiProperties.json`) — the prior-era delivery
> vehicle that let the Power Apps **Code App** + Power Automate flows reach the backing Azure Functions over
> HTTP. The Power Platform implementation has been **migrated to the Azure PaaS stack** and its footprint was
> **deprovisioned 2026-06-27** (the Dev sandbox + both solutions + the custom connectors deleted via
> `pac admin delete`). On the **live Azure stack** there is **no connector layer**: the **Data API**
> (`cespk-api-dev`) and **orchestration** (`cespk-orch-dev`) call the Functions **directly** (function key /
> managed identity). These definitions are **retained in-repo for provenance + migration reference only** —
> they are not deployed and not part of the live path. Live state:
> [../CURRENT_STATUS.md](../CURRENT_STATUS.md) · [../docs/architecture/live-environment.md](../docs/architecture/live-environment.md) ·
> [../docs/architecture/integrations.md](../docs/architecture/integrations.md).

## Contents

- `location-suggest/` — the custom connector that wrapped the Phase-4a **location-suggest** Function
  (`api_key` = the Function's `x-functions-key`, stored on the connection). Superseded by the direct
  Function call on the Azure stack.

Other custom connectors from the prior build (`cr1bd_ceparser`, `cr1bd_evasentry`, `dvsaenrich`,
`evavalidation`, `box_rest`, `ocr`) were authored alongside their Functions / OpenAPI (e.g. the Box
connector OpenAPI under `functions/box-webhook/openapi/`) and were likewise **deprovisioned 2026-06-27**
with the rest of the Power Platform footprint.
