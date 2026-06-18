# Pattern 1 — Shared-mailbox intake trigger

Plan ref: §5.1 `Flow_Intake_<Mailbox>`. Mirrors `collisioncc` `graph-intake.ts ingestGraphMessage`
(re-implement, never call). One flow instance per shared inbox (3 total).

## Why these settings

- **`includeAttachments: true` + `includeAttachmentsContent: true`** — the parser (§5.5) and the
  attachment loop (§5.2) need the raw bytes inline on the trigger output. Without content you only get
  metadata and have to make a second Graph call per attachment.
- **Trigger concurrency `runtimeConfiguration.concurrency.runs = 1`** — Power Automate retries a
  trigger on transient failure. With unbounded concurrency, a retry can fire a second run for the same
  message *before* the first run has written its dedup row, producing a double-create. Serialising to 1
  makes the "get-or-create by Message-ID" guard (§5.3) actually authoritative. Throughput cost is
  acceptable for an intake queue; correctness wins.
- **`splitOn` is NOT set on this trigger.** The V2 shared-mailbox trigger emits one message per run
  already; there is no array to split. (Reserve `splitOn` for batch triggers like "List rows".) The
  real dedup guard is Message-ID + payloadHash in Dataverse, not `splitOn`.
- **`Internet Message Id`** (not the Graph `id`, which is mailbox-local and changes on move) is the
  stable cross-mailbox dedup key. Capture it first thing.

## Trigger fragment

```json
{
  "triggers": {
    "When_a_new_email_arrives_in_a_shared_mailbox_V2": {
      "type": "OpenApiConnectionNotification",
      "inputs": {
        "host": {
          "connectionName": "shared_office365",
          "operationId": "OnNewEmailV3",
          "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365"
        },
        "parameters": {
          "folderPath": "Inbox",
          "includeAttachments": true,
          "fetchOnlyWithAttachment": false,
          "importance": "Any"
        }
      },
      "runtimeConfiguration": {
        "concurrency": { "runs": 1 }
      },
      "metadata": { "operationMetadataId": "intake-trigger" }
    }
  }
}
```

> V3 monitors the **connected account's mailbox**; to change which mailbox is watched, change the
> **connection**, not a flow parameter (there is no `mailboxAddress`/`IntakeMailbox` parameter on
> `OnNewEmailV3`).
>
> The live trigger is **"When a new email arrives (V3)"**, operationId `OnNewEmailV3`. Confirm it
> against the `shared_office365` swagger for your tenant before deploy (same placeholder discipline
> as `cr123_*`).
>
> **Note on shared-mailbox alternative:** the true shared-mailbox trigger (`SharedMailboxOnNewEmailV2`,
> which does take a `mailboxAddress` parameter) requires a real Exchange shared mailbox. The
> collisionspike intake uses `OnNewEmailV3` on the connected `digital@` mailbox — not
> `SharedMailboxOnNewEmailV2`.

## First actions — capture identity, compute payloadHash, dedup guard

`payloadHash` = SHA256 over normalised `subject + from + sorted(attachment SHA256s)`. Compute the
attachment hashes in the loop (Pattern 2), then fold them in. The simplest deterministic order: lower-case
+ trim subject and from, sort the per-attachment hashes ascending, join with `\n`.

```json
{
  "actions": {
    "Init_messageId": {
      "type": "InitializeVariable",
      "inputs": { "variables": [ {
        "name": "messageId", "type": "string",
        "value": "@triggerOutputs()?['body/internetMessageId']"
      } ] },
      "runAfter": {}
    },
    "Init_attachmentHashes": {
      "type": "InitializeVariable",
      "inputs": { "variables": [ { "name": "attachmentHashes", "type": "array", "value": [] } ] },
      "runAfter": { "Init_messageId": [ "Succeeded" ] }
    },
    "Find_existing_by_messageId": {
      "type": "OpenApiConnection",
      "inputs": {
        "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "ListRecords",
          "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
        "parameters": {
          "entityName": "cr123_cases",
          "$filter": "cr123_sourcemessageid eq '@{variables('messageId')}'",
          "$top": 1
        }
      },
      "runAfter": { "Init_attachmentHashes": [ "Succeeded" ] }
    },
    "If_already_ingested": {
      "type": "If",
      "expression": {
        "greater": [ "@length(outputs('Find_existing_by_messageId')?['body/value'])", 0 ]
      },
      "actions": {
        "Audit_duplicate_dropped": {
          "type": "OpenApiConnection",
          "inputs": {
            "host": { "connectionName": "shared_commondataserviceforapps", "operationId": "CreateRecord",
              "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" },
            "parameters": {
              "entityName": "cr123_auditevents",
              "item/cr123_action": "duplicate_dropped",
              "item/cr123_actor": "Flow_Intake",
              "item/cr123_severity": "info",
              "item/cr123_after": "@{concat('messageId=', variables('messageId'))}"
            }
          }
        },
        "Terminate_drop": {
          "type": "Terminate",
          "inputs": { "runStatus": "Succeeded" },
          "runAfter": { "Audit_duplicate_dropped": [ "Succeeded" ] }
        }
      },
      "runAfter": { "Find_existing_by_messageId": [ "Succeeded" ] }
    }
  }
}
```

> The Message-ID check here is the **exact-repeat** half of ADR-0010 (drop). The `payloadHash` check is
> the same shape — run a second `ListRecords` filtered on `cr123_payloadhash eq '<hash>'` after the loop
> computes it, and drop on a hit too. Both filters use the indexed dedup columns from §9 step 1.

## Error path

On `@removed`/fetch failure, the trigger run still starts but the body is empty. Guard the loop on
`empty(triggerOutputs()?['body'])` and, if a Case already exists for the message, audit
`graph_message_ingest_failed` (severity `error`) and set the Case `error` status via Pattern 4. Use
`runAfter` with `"Failed"`/`"Skipped"` on a Scope (Pattern 2 shows the Scope shell) to catch this without
failing the whole run.
