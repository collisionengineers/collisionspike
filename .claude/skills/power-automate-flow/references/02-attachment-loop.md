# Pattern 2 — Attachment Apply-to-each loop (classify + persist bytes)

Plan ref: §5.2. Inline branch of the intake flow. Mirrors `graph-intake.ts` classification.
**Invariant (from graph-intake): "all file data uploaded to storage immediately."**

## Why bytes never go inline in a Dataverse row

Writing `contentBytes` into a normal text/multiline column inflates every row, blows past column size
limits on large photo sets (Risk #4), makes OData queries drag the payload around, and bloats the audit
log. Instead write bytes to **an Azure Blob container fronted by the parser Function, or a Dataverse
*file* column** (`UploadFileOrImage`), and store only the **`storagePath` reference** on the Evidence row.
The classification table below produces exactly one Evidence row per attachment carrying the ref, never
the bytes.

## Classification table (deterministic — mirror graph-intake, do not invent)

| Extension / MIME | `kind` |
|---|---|
| `.jpg` `.jpeg` `.png` (`image/*`) | `image` |
| `.pdf` `.docx` `.doc` (`application/pdf`, Word MIME) | `instruction` |
| the message itself, `.eml` (`message/rfc822`) | `email` |
| anything else | `other` |

Express it as a nested `if` on the lower-cased extension so it is one pure expression you can unit-test
in a fixture harness (§5.2 build-verification):

```
@if(or(endsWith(toLower(items('Apply_to_each')?['name']),'.jpg'),
       endsWith(toLower(items('Apply_to_each')?['name']),'.jpeg'),
       endsWith(toLower(items('Apply_to_each')?['name']),'.png')), 'image',
   if(or(endsWith(toLower(items('Apply_to_each')?['name']),'.pdf'),
         endsWith(toLower(items('Apply_to_each')?['name']),'.docx'),
         endsWith(toLower(items('Apply_to_each')?['name']),'.doc')), 'instruction',
   if(endsWith(toLower(items('Apply_to_each')?['name']),'.eml'), 'email', 'other')))
```

## SHA256

Power Automate has no built-in SHA256 expression. Two supported routes — pick per environment:
1. **Compute in the parser/storage Function** on upload and return the hash in the response (preferred —
   keeps one hashing implementation and matches the Function-fronted-Blob choice).
2. A dedicated **`Compose` → Inline `Azure Function`/`HTTP`** hashing action if you must hash in-flow.

The fragment below assumes route 1: the storage action returns `{ storagePath, sha256, size }`.

## Loop fragment (Scope wrapper + Apply_to_each)

```json
{
  "actions": {
    "Scope_Persist_Attachments": {
      "type": "Scope",
      "actions": {
        "Apply_to_each_attachment": {
          "type": "Foreach",
          "foreach": "@triggerOutputs()?['body/attachments']",
          "runtimeConfiguration": { "concurrency": { "repetitions": 1 } },
          "actions": {
            "Compose_kind": {
              "type": "Compose",
              "inputs": "@if(or(endsWith(toLower(items('Apply_to_each_attachment')?['name']),'.jpg'),endsWith(toLower(items('Apply_to_each_attachment')?['name']),'.jpeg'),endsWith(toLower(items('Apply_to_each_attachment')?['name']),'.png')),'image',if(or(endsWith(toLower(items('Apply_to_each_attachment')?['name']),'.pdf'),endsWith(toLower(items('Apply_to_each_attachment')?['name']),'.docx'),endsWith(toLower(items('Apply_to_each_attachment')?['name']),'.doc')),'instruction',if(endsWith(toLower(items('Apply_to_each_attachment')?['name']),'.eml'),'email','other')))"
            },
            "Upload_bytes_to_storage": {
              "type": "OpenApiConnection",
              "inputs": {
                "host": { "connectionName": "shared_azureblob", "operationId": "CreateFile",
                  "apiId": "/providers/Microsoft.PowerApps/apis/shared_azureblob" },
                "parameters": {
                  "dataset": "evidence",
                  "folderPath": "@concat('intake/', variables('messageId'))",
                  "name": "@items('Apply_to_each_attachment')?['name']",
                  "body": "@base64ToBinary(items('Apply_to_each_attachment')?['contentBytes'])"
                }
              },
              "runAfter": { "Compose_kind": [ "Succeeded" ] }
            },
            "Dedup_evidence_by_sha": {
              "type": "If",
              "expression": {
                "not": { "contains": [ "@variables('attachmentHashes')", "@body('Upload_bytes_to_storage')?['sha256']" ] }
              },
              "actions": {
                "Append_hash": {
                  "type": "AppendToArrayVariable",
                  "inputs": { "name": "attachmentHashes", "value": "@body('Upload_bytes_to_storage')?['sha256']" }
                },
                "Create_Evidence_row": {
                  "type": "OpenApiConnection",
                  "inputs": {
                    "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord",
                      "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
                    "parameters": {
                      "entityName": "cr123_evidences",
                      "item/cr123_kind": "@outputs('Compose_kind')",
                      "item/cr123_filename": "@items('Apply_to_each_attachment')?['name']",
                      "item/cr123_contenttype": "@items('Apply_to_each_attachment')?['contentType']",
                      "item/cr123_sha256": "@body('Upload_bytes_to_storage')?['sha256']",
                      "item/cr123_storagepath": "@body('Upload_bytes_to_storage')?['Path']",
                      "item/cr123_sourcemessageid": "@variables('messageId')",
                      "item/cr123_acceptedforeva": true,
                      "item/cr123_imagerole": "unknown",
                      "item/cr123_registrationvisible": false
                    }
                  },
                  "runAfter": { "Append_hash": [ "Succeeded" ] }
                }
              },
              "runAfter": { "Upload_bytes_to_storage": [ "Succeeded" ] }
            }
          },
          "runAfter": {}
        }
      },
      "runAfter": { "If_already_ingested": [ "Succeeded" ] }
    },
    "Handle_attachment_failure": {
      "type": "OpenApiConnection",
      "inputs": {
        "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord",
          "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
        "parameters": {
          "entityName": "cr123_auditevents",
          "item/cr123_action": "attachment_classified",
          "item/cr123_severity": "warning",
          "item/cr123_actor": "Flow_Intake",
          "item/cr123_after": "partial attachment persistence — see run history"
        }
      },
      "runAfter": { "Scope_Persist_Attachments": [ "Failed", "Skipped", "TimedOut" ] }
    }
  }
}
```

## Why these knobs

- **`concurrency.repetitions = 1` on the Foreach** keeps the `attachmentHashes` dedup variable race-free
  (Power Automate parallelises loop iterations by default; appending to a shared array variable from
  parallel iterations corrupts it).
- **`Handle_attachment_failure` runs after `Failed`/`Skipped`/`TimedOut`** on the Scope, so one bad
  attachment audits per-message and continues — it does **not** fail the whole message (§5.2 rule:
  "continue others, audit per-attachment").
- **`.eml` persistence:** add one more `CreateFile` + `Create_Evidence_row (kind=email)` outside the loop
  using `triggerOutputs()?['body']` serialised — there is exactly one email body per message.
- Persist `sequenceIndex` later (Code App image-ordering / EVA 2-previews-then-all). Intake leaves images
  at `imageRole=unknown` for manual tagging in M1.
