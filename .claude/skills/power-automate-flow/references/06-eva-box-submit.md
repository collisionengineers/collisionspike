# Pattern 6 — EVA + Box atomic finalization

Plan ref: §5.10 EVA submit + integrations.md "Box archival … in unison with EVA submission". Owned
jointly with eva-sentry-integration. **Activation + live test is `[RESERVED-FOR-USER]`** — author the
definition turned OFF.

## The non-negotiables baked into this pattern

- **Case folder is the UPPERCASE Case/PO; EVA uses lowercase.** EVA `test26001` → Box `TEST26001`. The
  *same* identity, two casings — never reuse one casing for both. (integrations.md; CLAUDE.md Box rule.)
- **Photo order (CLAUDE.md / eva-sentry-api):** upload the **2 preview photos first** (vehicle overview
  with full registration + main-damage closeup), **then all photos in sequence including those two
  again**. Persisted as Evidence `sequenceIndex`; this flow reads them in `sequenceIndex` order.
- **`EVA_API_ENABLED` gates the transport, not the finalization.** M1 default `false` → the **JSON
  drag-drop export is the path** (and the permanent fallback). The Sentry REST POST runs only when the
  gate is `true`. Box archival happens **either way** — Box and EVA finalize *in unison*.
- **Idempotency by payload hash.** Re-running finalization for an already-submitted payload hash must
  not double-submit or re-create the folder.
- **Secrets:** the EVA token exchange + bearer live **inside the EVA custom connector / Function**, fed
  by Key Vault references. The flow never sees `EVA_CLIENT_SECRET`.

## Structure (one Scope so EVA + Box succeed/fail together)

```json
{
  "actions": {
    "Guard_already_finalized": {
      "type": "If",
      "expression": { "not": { "equals": [ "@outputs('Get_case')?['body/cr123_finalizedpayloadhash']", "@variables('payloadHash')" ] } },
      "actions": {
        "Scope_Finalize": {
          "type": "Scope",
          "actions": {
            "Order_evidence": {
              "type": "OpenApiConnection",
              "comment": "Evidence for the case, ascending sequenceIndex (2 previews already seeded at index 0,1 then full sequence)",
              "inputs": {
                "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords",
                  "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
                "parameters": {
                  "entityName": "cr123_evidences",
                  "$filter": "_cr123_case_value eq @{variables('caseId')} and cr123_kind eq 'image' and cr123_acceptedforeva eq true",
                  "$orderby": "cr123_sequenceindex asc"
                }
              }
            },
            "Create_box_folder_UPPERCASE": {
              "type": "OpenApiConnection",
              "inputs": {
                "host": { "connectionName": "shared_box", "operationId": "CreateFolder",
                  "apiId": "/providers/Microsoft.PowerApps/apis/shared_box" },
                "parameters": { "parentId": "@parameters('BoxArchiveRootId')",
                  "name": "@toUpper(outputs('Get_case')?['body/cr123_casepo'])" }
              },
              "runAfter": { "Order_evidence": [ "Succeeded" ] }
            },
            "Upload_photos_in_eva_order": {
              "type": "Foreach",
              "foreach": "@outputs('Order_evidence')?['body/value']",
              "runtimeConfiguration": { "concurrency": { "repetitions": 1 } },
              "comment": "repetitions=1 preserves EVA upload order: 2 previews first, then full sequence incl. those two",
              "actions": {
                "Copy_evidence_to_box": {
                  "type": "OpenApiConnection",
                  "inputs": {
                    "host": { "connectionName": "shared_box", "operationId": "CreateFile",
                      "apiId": "/providers/Microsoft.PowerApps/apis/shared_box" },
                    "parameters": { "folderId": "@body('Create_box_folder_UPPERCASE')?['Id']",
                      "name": "@items('Upload_photos_in_eva_order')?['cr123_filename']",
                      "body": "@items('Upload_photos_in_eva_order')?['cr123_storagepath']" }
                  }
                }
              },
              "runAfter": { "Create_box_folder_UPPERCASE": [ "Succeeded" ] }
            },
            "Submit_to_EVA": {
              "type": "If",
              "expression": { "equals": [ "@variables('gate_EVA_API_ENABLED')", true ] },
              "actions": {
                "EVA_instruction_inspection": {
                  "type": "OpenApiConnection",
                  "comment": "Sentry REST path — token + bearer handled inside the connector (Key Vault refs). lowercase casePo.",
                  "inputs": {
                    "host": { "connectionName": "shared_evasentry", "operationId": "InstructionInspection",
                      "apiId": "/providers/Microsoft.PowerApps/apis/shared_evasentry" },
                    "parameters": { "body": "@variables('evaPayload13')" }
                  }
                }
              },
              "else": {
                "actions": {
                  "Stage_drag_drop_json": {
                    "type": "OpenApiConnection",
                    "comment": "M1 default: emit the schema-valid 13-field JSON for staff drag-drop into EVA. Same serializer as the Code App — byte-identical.",
                    "inputs": {
                      "host": { "connectionName": "shared_box", "operationId": "CreateFile",
                        "apiId": "/providers/Microsoft.PowerApps/apis/shared_box" },
                      "parameters": { "folderId": "@body('Create_box_folder_UPPERCASE')?['Id']",
                        "name": "@concat(toLower(outputs('Get_case')?['body/cr123_casepo']), '.eva.json')",
                        "body": "@variables('evaPayload13')" }
                    }
                  }
                }
              },
              "runAfter": { "Upload_photos_in_eva_order": [ "Succeeded" ] }
            },
            "Stamp_finalized_hash": {
              "type": "OpenApiConnection",
              "inputs": {
                "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "UpdateRecord",
                  "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
                "parameters": { "entityName": "cr123_cases", "recordId": "@variables('caseId')",
                  "item/cr123_finalizedpayloadhash": "@variables('payloadHash')",
                  "item/statuscode": 192350009 }
              },
              "runAfter": { "Submit_to_EVA": [ "Succeeded" ] }
            }
          },
          "runAfter": {}
        }
      },
      "runAfter": { "Get_case": [ "Succeeded" ] }
    }
  }
}
```

## Notes

- **`evaPayload13` is the schema-valid 13-field JSON in contract order** (`eva-payload.schema.json` /
  `eva-export.ts`). Build it with the **same serializer the Code App uses** so the drag-drop body and the
  API body are byte-identical (§8.2 "one serializer, two transports"). Do **not** assemble the payload
  field-by-field in Power Fx — call the shared export surface.
- **`vrm` and `reference` are NOT in `evaPayload13`** — they are Case-identity fields. The 13 are
  exactly: work_provider, vehicle_model, claimant_name, claimant_telephone, claimant_email, date_of_loss,
  date_of_instruction, accident_circumstances, inspection_address, vat_status, mileage, mileage_unit,
  engineer_allocation.
- **Atomicity caveat:** Power Automate Scopes are not transactional. The `finalizedpayloadhash` stamp is
  the idempotency latch — a partial failure leaves it unstamped, so a re-run resumes cleanly. Note Box
  `CreateFolder` **errors (409) on a name collision** rather than upserting: on a resume, either find the
  folder by name first or `configure run after` to treat the 409 as "already exists"; `CreateFile`
  likewise collides by name, so handle the 409 / reuse. Order matters: stamp **last**.
- `BoxArchiveRootId` is a flow parameter; do not hard-code a live Box folder id in the authored
  definition.
