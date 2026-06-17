# Pattern 3 — ADR-0010 dedup / case-resolve branch

Plan ref: §5.3 `Flow_CaseResolve`. The exact ADR-0010 ladder. **Two rules are inviolable: never
auto-merge on VRM+time, never link across different Work Providers.** Every ambiguous outcome ends in a
human-confirmable `duplicate_risk` flag, never a silent merge.

## The ladder (evaluate top-down, first match wins)

| # | Condition | Resolution | Status effect |
|---|---|---|---|
| 1 | Exact Message-ID **or** payloadHash already seen | **drop** | (handled in Pattern 1) |
| 2 | Arrival reference matches an **open** Case reference, **same provider** | **attach** | keep target status |
| 3 | Reference **differs** from open Case(s) for that VRM | **new Case** + `duplicate_risk` | flag VRM collision |
| 4 | **No reference** + VRM matches an open Case | **propose attach** (staff confirm) | `duplicate_risk` + `caseLinkState=pending` |
| 5 | No match | **create** | `new_email → ingested` |

VRM-twin matches and cross-provider candidates are filtered out **before** rule 2 even runs — the
`ListRecords` filter is always scoped to the resolved `workProviderId` (Pattern 8 supplies it).

## Branch fragment

Assumes upstream produced: `candidateVrm`, `candidateRef` (envelope sniff or parser-confirmed),
`workProviderId`. The query for open same-provider cases excludes terminal statuses.

```json
{
  "actions": {
    "List_open_provider_cases": {
      "type": "OpenApiConnection",
      "inputs": {
        "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords",
          "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
        "parameters": {
          "entityName": "cr123_cases",
          "$filter": "cr123_vrm eq '@{variables('candidateVrm')}' and _cr123_workprovider_value eq @{variables('workProviderId')} and statuscode ne 192350008 and statuscode ne 192350009 and statuscode ne 192350010",
          "$select": "cr123_caseid,cr123_caseref,statuscode"
        }
      },
      "runAfter": {}
    },
    "Filter_matching_ref": {
      "type": "Query",
      "comment": "WDL has no arrow-lambda; use a Filter array (Query) action whose 'where' references item(). Finds the open same-provider case whose reference equals the arrival's.",
      "inputs": {
        "from": "@outputs('List_open_provider_cases')?['body/value']",
        "where": "@equals(item()?['cr123_caseref'], variables('candidateRef'))"
      },
      "runAfter": { "List_open_provider_cases": [ "Succeeded" ] }
    },
    "Switch_resolution": {
      "type": "Switch",
      "expression": "@coalesce(first(body('Filter_matching_ref'))?['cr123_caseid'], if(greater(length(outputs('List_open_provider_cases')?['body/value']), 0), if(empty(variables('candidateRef')), 'VRM_NO_REF', 'REF_DIFFERS'), 'CREATE'))",
      "cases": {
        "Case_REF_DIFFERS": {
          "case": "REF_DIFFERS",
          "actions": {
            "Create_case_with_risk": {
              "type": "OpenApiConnection",
              "inputs": {
                "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord",
                  "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
                "parameters": {
                  "entityName": "cr123_cases",
                  "item/cr123_vrm": "@variables('candidateVrm')",
                  "item/cr123_caseref": "@variables('candidateRef')",
                  "item/cr123_sourcemessageid": "@variables('messageId')",
                  "item/cr123_payloadhash": "@variables('payloadHash')",
                  "item/cr123_caselinkstate": "none",
                  "item/statuscode": 192350005
                }
              }
            },
            "Audit_duplicate_flagged_refdiffers": {
              "type": "OpenApiConnection",
              "inputs": {
                "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord",
                  "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
                "parameters": {
                  "entityName": "cr123_auditevents",
                  "item/cr123_action": "duplicate_flagged",
                  "item/cr123_severity": "warning",
                  "item/cr123_actor": "Flow_CaseResolve",
                  "item/cr123_after": "@concat('VRM ', variables('candidateVrm'), ' has open case with different reference')"
                }
              },
              "runAfter": { "Create_case_with_risk": [ "Succeeded" ] }
            }
          }
        },
        "Case_VRM_NO_REF": {
          "case": "VRM_NO_REF",
          "actions": {
            "Propose_attach": {
              "type": "OpenApiConnection",
              "inputs": {
                "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord",
                  "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
                "parameters": {
                  "entityName": "cr123_cases",
                  "recordId": "@first(outputs('List_open_provider_cases')?['body/value'])?['cr123_caseid']",
                  "item/cr123_caselinkstate": "pending",
                  "item/statuscode": 192350005
                }
              }
            }
          }
        },
        "Case_CREATE": {
          "case": "CREATE",
          "actions": {
            "Create_case_clean": {
              "type": "OpenApiConnection",
              "inputs": {
                "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord",
                  "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
                "parameters": {
                  "entityName": "cr123_cases",
                  "item/cr123_vrm": "@variables('candidateVrm')",
                  "item/cr123_caseref": "@variables('candidateRef')",
                  "item/cr123_sourcemessageid": "@variables('messageId')",
                  "item/cr123_payloadhash": "@variables('payloadHash')",
                  "item/cr123_caselinkstate": "none",
                  "item/statuscode": 192350001
                }
              }
            }
          }
        }
      },
      "default": {
        "actions": {
          "Attach_to_matched_case": {
            "type": "OpenApiConnection",
            "comment": "Switch expression returned a caseId GUID -> reference matched an open same-provider case -> ATTACH",
            "inputs": {
              "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord",
                "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
              "parameters": {
                "entityName": "cr123_auditevents",
                "item/cr123_action": "case_attached",
                "item/cr123_actor": "Flow_CaseResolve",
                "item/cr123_severity": "info",
                "item/cr123_after": "@concat('attached to ', body('Switch_resolution'))"
              }
            }
          }
        }
      },
      "runAfter": { "Filter_matching_ref": [ "Succeeded" ] }
    }
  }
}
```

> **Reading the Switch:** the `expression` resolves to the matched case GUID (rule 2 → ATTACH, lands in
> `default`), else one of the literal tokens `REF_DIFFERS` / `VRM_NO_REF` / `CREATE`. Status codes are
> placeholders — bind them to the frozen Dataverse choice set (the 11 `CaseStatus` values, §5.4). Keep
> the `statuscode ne …` terminal exclusions in the `$filter` in lockstep with the terminal set
> (`eva_submitted`, `box_synced`, `error`).

## Build-verification (offline)

Drive the §5.3 decision-table fixture (`{has-ref, ref-matches-open, vrm-matches-open, same-provider}` →
expected resolution). Assert: all five branches reachable; **no path reaches an auto-merge on VRM+time**;
**no `$filter` ever omits the `_cr123_workprovider_value` clause** (cross-provider guard). A lint that
greps every `ListRecords` in this flow for the provider clause is a cheap regression catch.
