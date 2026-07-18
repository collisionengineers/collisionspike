---
name: flow-webhook-trigger-provisioning
description: "Arming/rebuilding an Office 365 webhook trigger needs the make.powerautomate.com designer — BUT editing a flow's ACTIONS (not the trigger node) via the Dataverse clientdata API preserves an existing healthy webhook, so orchestration can be wired live via CLI."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 5e5bd268-e0d6-4dfb-9c9c-c735a3b9d76e
---

In collisionspike, the **CS Intake** flow's email trigger never fired (zero runs ever; Flow-API `/triggers` and trigger-histories returned **500**) because the flow had only ever been created/edited via the **Dataverse `clientdata` PATCH + statecode toggle**, which update the stored definition but do **NOT** register the Office 365 push (webhook) subscription.

**Did NOT work:** Flow Management API stop/start; a plain designer **Save** (it preserved the corrupt trigger node, so the dead subscription was reused). A real email reached the Inbox but produced no run.

**Worked (2026-06-18):** in the make.powerautomate.com **v3 designer**, *delete* the trigger node and *add a fresh* **"When a new email arrives (V3)"** (V3 monitors the connected account's own mailbox; the shared-mailbox-V2 trigger requires a real shared mailbox — `digital@collisionengineers.co.uk` is a normal user mailbox you sign into, not shared), reuse the existing healthy connection, then **Save**. A brand-new trigger node forces a brand-new subscription.

**Gotcha:** if the old trigger had concurrency control (`runs:1`), the save fails with `CannotDisableTriggerConcurrency` until you re-enable **Concurrency control → Degree of parallelism = 1** on the new trigger (Settings tab). Downstream actions used **generic `triggerOutputs()?['body/...']`** refs (not `body('<trigger name>')`), so the rebuild didn't break them.

**Update (2026-06-19) — you CAN edit a flow via `clientdata` PATCH without killing its webhook, IF the trigger node stays byte-identical.** The entire M1 orchestration was wired **live via the Dataverse API with no designer step**: injected 3 Run-a-Child-Flow cards into CS Intake (each `host.workflowReferenceName` = the child's workflowid GUID), added `Init_caseId`/`Capture_caseId_*`, and fixed a `payloadhash` overflow in the Create actions — then a real test email still fired the trigger and created Cases + Evidence. The earlier dead webhook was specifically because the trigger had only ever been API-*created* (never designer-published); once a healthy subscription exists, an **actions-only** clientdata PATCH that leaves the **trigger node** unchanged **reuses** it. Rule of thumb: editing **actions** = clientdata-PATCH-safe; changing the **trigger node** or **concurrency** (`CannotDisableTriggerConcurrency`) = designer-only. Also: a flow can only be a Run-a-Child target if it has a **Response** ("Respond to a PowerApp or flow") action — otherwise the parent PATCH is rejected atomically with `ChildFlowMissingResponseOperation` (so the parent stays untouched = no webhook risk).

**Verify:** `/triggers` returns 200; a test email creates a Running→Succeeded run and a `cr1bd_cases` row (Case name = email subject). See [[codeapp-csp-use-connectors]] for the parallel "use connectors, not raw calls" lesson.
