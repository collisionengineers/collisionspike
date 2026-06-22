# M1 flow-chain activation runbook (digital@)

> **Status: prepared + de-risked, awaiting the operator's designer step.** Verified live on
> **2026-06-19**. This is the one M1 piece that is genuinely `[RESERVED-FOR-USER]` by design — it
> re-arms the live Office 365 webhook and rebinds Run-a-Child-Flow cards, both of which must go
> through the **make.powerautomate.com designer** (a raw Dataverse `clientdata` PATCH does **not**
> provision the webhook — see memory `flow-webhook-trigger-provisioning`, learned the hard way).
> Everything that can be done safely without the designer has been done; what remains is below.

## Verified current live state (2026-06-19)

| Flow | `workflowid` | Live state | Reality |
|---|---|---|---|
| **CS Intake** | `92131f3d-9cd5-4e88-aa9e-a5705a5850a0` | **ON** ✅ | The **simple** version (clientdata ≈9.3 KB, **zero** Run-a-Child-Flow cards). Webhook armed; a digital@ email creates a `cr1bd_cases` row (2 real NEW cases confirmed on the dashboard). **NOT the repo orchestrator.** |
| CS Provider Match | `0f610d7c-…` | ON | Standalone. |
| CS Case Resolve | `1ddb50a5-…` | ON | Standalone. |
| **CS Classify + Persist** | `2a6236f9-f0d2-473d-953d-ac5c27320522` | **OFF** | **STALE** — live def lacks the `triggerBody()?['attachments']` input contract (the task #41 fix). As-is it would create **0 Evidence rows**. |
| **CS Parse** | `468ffd29-6e62-42c2-8e2d-9500f51147fc` | **OFF** | **STALE** vs repo. |
| **CS Status Evaluate** | `4d963ff7-7f14-40e5-aa3c-07b741b0cba5` | **OFF** | Has inline readiness (task #44) but should be re-imported with the rest. |

So an email → Case works today, but **attachments are not persisted, parsed, or status-evaluated** —
the live `CS Intake` does not call the children, and the children are stale + off.

## Why this is not done by Claude (and must not be forced via API)

1. The repo orchestrator (`flows/definitions/intake.definition.json`) drives the chain with **3
   `Run-a-Child-Flow` (`type: Workflow`) cards** whose `host.workflowReferenceName` are **placeholders**
   that must be rebound to the imported child GUIDs **in the designer** (the definition's own comment
   says so). There is no reliable API to rebind a Run-a-Child-Flow target.
2. Swapping the live `CS Intake` clientdata via API risks **un-provisioning the working webhook** — the
   exact failure that previously took a manual designer trigger-rebuild to recover. The live digital@
   intake is the one working production integration; it is not worth gambling.

## Activation steps (operator, in order)

**Pre-req already true:** parser Function live + connector bound; addressmatch + OCR deployed; corpus loaded.

1. **Re-import the corrected flow definitions** so live = repo (orchestrator + the fixed children).
   Import the `CollisionSpikeFlows` solution (or update each flow in the designer from
   `flows/definitions/*.definition.json`). This lands them **off** — expected.
2. **Evidence blob connection:** the evidence Storage account `cespkevidstdev01` + private container
   `evidence` already exist live in `rg-collisionspike-dev`; the net-new step is in Power Apps —
   **create an Azure Blob connection** to it and **bind it to the `cr1bd_evidenceblob` connection reference**. `classify-persist` writes attachment bytes via
   `CreateFile(dataset=<account>, folderPath='intake/<messageId>', name=<attachment>)`; confirm the
   `dataset`/container match the connection at first run.
   ```pwsh
   # NOTE: the evidence storage account `cespkevidstdev01` already exists live in rg-collisionspike-dev (UK South);
   # the commands below are only for re-creating it in a fresh environment. Confirm the `evidence` container exists.
   az storage account create -g rg-collisionspike-dev -n cespkevidstdev01 -l uksouth --sku Standard_LRS \
     --kind StorageV2 --min-tls-version TLS1_2 --allow-blob-public-access false
   az storage container create --account-name cespkevidstdev01 --name evidence --auth-mode login
   ```
3. **Designer — wire the orchestrator:** open **CS Intake** in make.powerautomate.com; on each of the
   3 `Run a Child Flow` cards (classify-persist → parse → status-evaluate) re-select the child flow;
   confirm the **"When a new email arrives (V3)"** trigger on digital@ (concurrency = 1); **Save**
   (this re-registers the webhook). Children keep their **"Manually trigger a flow" (Request)** trigger
   and embedded connections (Run-only users → *Use this connection*).
4. **Turn ON** `CS Classify + Persist`, `CS Parse`, `CS Status Evaluate`.
5. **Live test (authorised on digital@ only):** send one email to
   `digital@collisionengineers.co.uk` with a PDF instruction + 2 images. Confirm: a Case appears →
   `cr1bd_evidences` rows created (attachments in Blob) → the 12 EVA fields pre-filled with provenance
   → status advances (`new_email → ingested → needs_review`). Do **not** test Info/Engineers/Desk —
   those are operator-only.

## Verification toolkit
```pwsh
$org="https://collisionengineers-dev.crm11.dynamics.com"
$tok = az account get-access-token --resource "$org/" --query accessToken -o tsv
# child states:  GET $org/api/data/v9.2/workflows?$filter=category eq 5&$select=name,statecode
# evidence rows: GET $org/api/data/v9.2/cr1bd_evidences?$select=cr1bd_filename,cr1bd_kind&$orderby=createdon desc
# trigger health (Flow Mgmt API, resource https://service.flow.microsoft.com/): 200 = armed, 500 = unprovisioned
```
