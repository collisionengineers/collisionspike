# Pattern 5 — Dataverse environment-variable feature gate

Plan ref: §5.5/§5.6 + CLAUDE.md gating. **Flows READ gates; they never DEFINE them.** Gate definitions
and M1 defaults are owned by dataverse-data-architect (the env-var manifest); a flow that creates or
edits an `environmentvariabledefinition` is a boundary violation. Read the **current value**, branch,
done.

## Why read the *value* row, not just the definition

A Dataverse environment variable is two tables:
`environmentvariabledefinition` (name, type, **default value**) and `environmentvariablevalue` (the
**current** override for this environment, if any). The effective value is *the value row if present,
else the definition's default*. So always `coalesce` them — reading only the definition misses a
per-environment override; reading only the value misses the default when no override exists.

## Reusable "read gate" sub-pattern

```json
{
  "actions": {
    "Get_gate_definition": {
      "type": "OpenApiConnection",
      "inputs": {
        "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords",
          "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
        "parameters": {
          "entityName": "environmentvariabledefinitions",
          "$filter": "schemaname eq 'cr123_PDF_MAPPER_ENABLED'",
          "$select": "environmentvariabledefinitionid,defaultvalue",
          "$expand": "environmentvariabledefinition_environmentvariablevalue($select=value)",
          "$top": 1
        }
      },
      "runAfter": {}
    },
    "Set_gate_PDF_MAPPER_ENABLED": {
      "type": "InitializeVariable",
      "inputs": { "variables": [ {
        "name": "gate_PDF_MAPPER_ENABLED", "type": "boolean",
        "value": "@equals(toLower(coalesce(first(first(outputs('Get_gate_definition')?['body/value'])?['environmentvariabledefinition_environmentvariablevalue'])?['value'], first(outputs('Get_gate_definition')?['body/value'])?['defaultvalue'], 'false')), 'true')"
      } ] },
      "runAfter": { "Get_gate_definition": [ "Succeeded" ] }
    }
  }
}
```

> Env-var values are **always strings** in Dataverse even for the Boolean type — hence
> `equals(toLower(...),'true')`. Compose this once near the top of the flow per gate you need, then branch
> off the boolean variable.
>
> The `$expand` relationship name `environmentvariabledefinition_environmentvariablevalue` and the
> `first(first(...))` double-unwrap are the fragile spot — confirm the navigation-property name against
> the Dataverse metadata for the target environment (it is the standard system relationship, but verify
> rather than assume, same placeholder discipline as `cr123_*`).

## Branch on the gate (parser example — `PDF_MAPPER_ENABLED`)

```json
{
  "actions": {
    "If_parser_enabled": {
      "type": "If",
      "expression": { "equals": [ "@variables('gate_PDF_MAPPER_ENABLED')", true ] },
      "actions": {
        "Call_parser": {
          "type": "OpenApiConnection",
          "inputs": {
            "host": { "connectionName": "shared_ceparser", "operationId": "Parse",
              "apiId": "/providers/Microsoft.PowerApps/apis/shared_ceparser" },
            "parameters": { "body/document": "@variables('instructionBytesB64')", "body/filename": "@variables('instructionName')" }
          }
        }
      },
      "else": {
        "actions": {
          "Skip_parser_audit": {
            "type": "OpenApiConnection",
            "inputs": {
              "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord",
                "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
              "parameters": { "entityName": "cr123_auditevents",
                "item/cr123_action": "parser_called", "item/cr123_severity": "info",
                "item/cr123_actor": "Flow_Parse", "item/cr123_after": "skipped: PDF_MAPPER_ENABLED=false — fields left for manual entry" }
            }
          }
        }
      },
      "runAfter": { "Set_gate_PDF_MAPPER_ENABLED": [ "Succeeded" ] }
    }
  }
}
```

## The gates a flow reads (M1 defaults — owned by the manifest, NOT set here)

| Gate | M1 default | Off-path behaviour in-flow |
|---|---|---|
| `PDF_MAPPER_ENABLED` | `true` | skip parser; leave 12 fields for manual entry |
| `ENRICHMENT_ENABLED` (+ `ENRICHMENT_API_BASE`) | `true` / — | skip DVSA enrichment; mileage/model stay as parsed |
| `EVA_API_ENABLED` | `false` | use JSON drag-drop export path, not the Sentry REST POST (Pattern 6) |
| `AZURE_MAPS_ENABLED` | `false` | select postcode.io for address normalisation |

> **Read `ENRICHMENT_API_BASE` the same way** and feed it as the connector host/base for the DVSA call —
> never hard-code the enrichment base URL in the flow. **Never** read `EVA_CLIENT_SECRET` /
> gateway secret values in a flow: those are Key Vault references the Function dereferences server-side
> (CLAUDE.md: secrets are Key Vault references only, never a literal in any artifact).
