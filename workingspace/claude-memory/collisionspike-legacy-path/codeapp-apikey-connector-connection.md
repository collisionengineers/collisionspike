---
name: codeapp-apikey-connector-connection
description: How to create a connection for an API-key custom connector and wire it into the Code App (the connector must DEFINE the param first)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 5e5bd268-e0d6-4dfb-9c9c-c735a3b9d76e
---

To bind an **API-key custom connector** (function-key auth) to the Code App, the connector itself must **define the `api_key` connection parameter** — if its `connectionParameters` is `{}` (even when the swagger has an `apiKey` securityDefinition), the Power Platform connection-create API rejects the key with `ParameterNotDefined: Parameter 'api_key' is not allowed`.

**Why:** an `apiKey` securityDefinition in the OpenAPI does NOT auto-create the connection parameter; the API Properties must declare it.

**How to apply (proven 2026-06-19 for cr1bd_ceparser; same path for evasentry/dvsaenrich/box/evidenceblob/ocr):**
1. `pac connector download --connector-id <guid> -o <dir>` → `apiDefinition.json` + `apiProperties.json`.
2. Edit `apiProperties.json` → add `connectionParameters.api_key` as `{ "type": "securestring", "uiDefinition": {...constraints.required:"true"} }`. Do NOT touch `apiDefinition.json` (it holds the real backend host).
3. `pac connector update --connector-id <guid> --api-definition-file apiDefinition.json --api-properties-file apiProperties.json`.
4. Create the connection (BAP API): `PUT https://api.powerapps.com/providers/Microsoft.PowerApps/apis/<shared_apiName>/connections/<newGuidHex>?api-version=2016-11-01&$filter=environment eq '<envId>'` with body `{properties:{environment:{id,name},connectionParameters:{api_key:"<key>"}}}`, bearer token `az account get-access-token --resource https://service.powerapps.com/`. Returns 201 + `"status":"Connected"`.
5. `pac code add-data-source --apiId <shared_apiName> --connectionId <connId>` (run in mockup-app/) → generates `src/generated/services/<Connector>Service.ts`.
6. Call it via a small SDK-bridge module so the seam stays SDK-pure (see `src/data/parser-connector-transport.ts`). The function key lives ON THE CONNECTION, never in the bundle. Relates to [[codeapp-csp-use-connectors]].
