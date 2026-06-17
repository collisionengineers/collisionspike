# Pattern 4 — Status-machine guard-order branch

Plan ref: §5.4 `Flow_StatusEvaluate`. **Mirror, do not call** `collisioncc`
`case-status.ts statusForReviewCase`. The flow and the Code App must compute the *same* status from the
same inputs — the preferred drift mitigation (§5.4 / §9 step 3) is to expose readiness as a **validation
endpoint** so both consume one implementation. This flow branch is the fallback / in-flow mirror.

## The guard order (evaluate in this exact order — first hit wins)

1. **Terminal?** (`eva_submitted`, `box_synced`, `error`) → return it unchanged. Never transition out of
   a terminal.
2. Else **EVA-payload validation fails** → `missing_required_fields`.
3. Else **image-rules fail** (≥2 accepted images, ≥1 overview with `registrationVisible`, ≥1
   `damage_closeup`) → `missing_images`.
4. Else **open review issues** → `needs_review`.
5. Else → `ready_for_eva`.

The order matters: a case missing both fields *and* images reports `missing_required_fields` first, so
staff fix the deterministic gap before the image gap — same precedence as `case-status.ts`.

## Branch fragment (nested If = guard ladder)

Calls the shared validation endpoint for the field/image verdicts so the logic lives in one place.

```json
{
  "actions": {
    "Get_case": {
      "type": "OpenApiConnection",
      "inputs": {
        "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "GetItem",
          "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
        "parameters": { "entityName": "cr123_cases", "recordId": "@variables('caseId')" }
      },
      "runAfter": {}
    },
    "Validate_readiness": {
      "type": "OpenApiConnection",
      "comment": "Shared validation surface (parser/validation Function) — one impl for flow + Code App",
      "inputs": {
        "host": { "connectionName": "shared_evavalidation", "operationId": "ValidateCase",
          "apiId": "/providers/Microsoft.PowerApps/apis/shared_evavalidation" },
        "parameters": { "body/caseId": "@variables('caseId')" }
      },
      "runAfter": { "Get_case": [ "Succeeded" ] }
    },
    "Guard_terminal": {
      "type": "If",
      "expression": {
        "or": [
          { "equals": [ "@outputs('Get_case')?['body/statuscode']", 192350008 ] },
          { "equals": [ "@outputs('Get_case')?['body/statuscode']", 192350009 ] },
          { "equals": [ "@outputs('Get_case')?['body/statuscode']", 192350010 ] }
        ]
      },
      "actions": {
        "Keep_terminal": { "type": "Compose", "inputs": "terminal — no transition" }
      },
      "else": {
        "actions": {
          "Compute_next_status": {
            "type": "Compose",
            "inputs": "@if(not(body('Validate_readiness')?['fieldsValid']), 'missing_required_fields', if(not(body('Validate_readiness')?['imagesValid']), 'missing_images', if(greater(length(body('Validate_readiness')?['openIssues']),0), 'needs_review', 'ready_for_eva')))"
          },
          "Map_status_choice": {
            "type": "Compose",
            "inputs": "@if(equals(outputs('Compute_next_status'),'missing_required_fields'),192350003,if(equals(outputs('Compute_next_status'),'missing_images'),192350004,if(equals(outputs('Compute_next_status'),'needs_review'),192350002,192350007)))",
            "runAfter": { "Compute_next_status": [ "Succeeded" ] }
          },
          "Patch_status_if_changed": {
            "type": "If",
            "expression": { "not": { "equals": [ "@outputs('Get_case')?['body/statuscode']", "@outputs('Map_status_choice')" ] } },
            "actions": {
              "Update_status": {
                "type": "OpenApiConnection",
                "inputs": {
                  "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord",
                    "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
                  "parameters": { "entityName": "cr123_cases", "recordId": "@variables('caseId')",
                    "item/statuscode": "@outputs('Map_status_choice')" }
                }
              },
              "Audit_status_changed": {
                "type": "OpenApiConnection",
                "inputs": {
                  "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord",
                    "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
                  "parameters": {
                    "entityName": "cr123_auditevents",
                    "item/cr123_action": "status_changed",
                    "item/cr123_actor": "Flow_StatusEvaluate",
                    "item/cr123_before": "@string(outputs('Get_case')?['body/statuscode'])",
                    "item/cr123_after": "@outputs('Compute_next_status')"
                  }
                },
                "runAfter": { "Update_status": [ "Succeeded" ] }
              }
            },
            "runAfter": { "Map_status_choice": [ "Succeeded" ] }
          }
        }
      },
      "runAfter": { "Validate_readiness": [ "Succeeded" ] }
    }
  }
}
```

## Why

- **Idempotent:** recomputing on unchanged inputs yields the same status and `Patch_status_if_changed`
  short-circuits the write — no spurious `status_changed` audit rows, safe to re-invoke after any
  mutation.
- **Terminal lock first:** the very first guard prevents any later branch from dragging an
  `eva_submitted`/`box_synced`/`error` case backward.
- **One readiness implementation:** `fieldsValid` / `imagesValid` / `openIssues` come from the shared
  validation surface, not re-derived in Power Fx, so the Code App's `computeReadiness()` and the flow
  can never disagree. If you must inline it (no endpoint yet), port `image-rules`/`case-status` semantics
  faithfully and cover them with the §5.4 Vitest fixtures **plus** a flow-side parity fixture.
- Bind the placeholder `statuscode` integers to the real choice set (the 11 `CaseStatus` values).
