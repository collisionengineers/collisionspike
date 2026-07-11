# Azure deployment plan — PR 55 functional remediation

> **Status:** Deployed

Generated: 2026-07-11 (Europe/London)

The user's explicit instruction to push, merge, deploy every changed area, and enable remaining
features is the approval for this plan. External legal/security approvals are operator-attested as
complete. Runtime dependency checks remain mandatory.

---

## 1. Project overview

**Goal:** Repair PR 55's functional regressions, merge the repaired PR to `main`, deploy the merged
commit to the existing live Azure PaaS stack, and enable every remaining code-backed feature whose
runtime dependencies are present.

**Path:** Modify an existing production workload. No infrastructure creation or modernization.

## 2. Requirements

| Attribute | Value |
|---|---|
| Classification | Production staff application |
| Scale | Small, event-driven |
| Budget | Reuse existing resources; no new spend/provisioning |
| Subscription | `e6076573-23a5-46a8-acef-7e22d264e5db` (`Azure subscription 1`, enabled/default; confirmed by Azure inventory) |
| Locations | UK South for Functions/data; West Europe for the existing Static Web App |
| Resource group | `rg-collisionspike-dev` |
| Policy constraints | No Azure Policy assignments returned at subscription scope |

## 3. Components detected and deployment scope

| Component | Type | Technology | Source | Existing Azure target |
|---|---|---|---|---|
| Data API | Function App | Node 20 / TypeScript Functions v4 | `api/`, `deploy/api/` | `cespk-api-dev` |
| Orchestration | Durable/queue/timer Function App | Node 20 / TypeScript Functions v4 | `orchestration/`, `deploy/orch/` | `cespk-orch-dev` |
| Archive facade | Function App | Python Functions | `functions/box-webhook/` | `cespkbox-fn-v76a47` |
| Parser | Function App | Python Functions | `functions/parser/` | `cespike-parser-dev-x7xt3d5ovhi7y` |
| Staff SPA | Static Web App | React/Vite | `mockup-app/` | `cespk-spa-dev` |
| Database delta | Existing PostgreSQL Flexible Server | PostgreSQL 16 | `migration/assets/schema/` | `cespk-pg-dev/collisionspike` |

The retained enrichment, EVA, OCR and location services receive no source changes from this
remediation. They will be health-checked but not republished solely to recreate identical code.

## 4. Recipe selection

**Selected:** Existing AZCLI/Functions Core Tools/SWA CLI recipe from `docs/azure/deploy.md`.

**Rationale:** All target resources already exist and are configured. This is a code/config rollout;
introducing `azd`, new IaC or replacement resources would expand risk and scope. Windows builds the
Node/Vite artifacts; WSL runs `az`, `func`, `psql`, and SWA deployment commands.

## 5. Architecture and deployment order

**Stack:** Existing serverless Azure Functions + Static Web Apps + PostgreSQL.

1. Capture live app settings, function inventories, resource state, Graph subscription state, and DB migration state.
2. Apply additive/idempotent PostgreSQL deltas before code that depends on them. For TKT-145,
   apply `2026-07-11-tkt145-backfill-report-idempotency.sql` before
   `2026-07-11-tkt145-backfill-generations.sql`. Do **not** rerun the historical TKT-141
   re-retirement or TKT-144 hash/dedup data-repair scripts; they are one-off data mutations, not
   release migrations.
3. Publish the Data API bundle and verify function registration/auth-gated responses first. This
   closes the rolling-deployment window for retired-case locks and strict terminal-transition
   audit before any repaired downstream caller can act. The already-applied TKT-141 data repair
   must never be exposed to an older API that can re-open a retired merged row.
   Re-run the idempotent TKT-089 evidence-ownership delta immediately afterward; its audit-derived
   staff ownership pass closes the old-API write window and is authoritative over inferred ownership.
4. Publish the Archive facade and verify health, scope-lock and strict mark-done response handling.
   API-first is mandatory: the repaired facade must never settle against the old API's best-effort
   terminal audit path.
5. Create and read back the `sent-messages` storage queue **before** orchestration publish/restart;
   `sent-items-processor` is a Queue trigger and a missing queue must not be its first host state.
6. Publish orchestration bundle and verify triggers, queues, subscription maintenance and telemetry.
   Confirm the deployed `sent-items-processor` listener is registered before enabling Sent Items intake.
   Explicitly POST then GET the keyed maintenance endpoints for the fixed Durable singletons:
   `maintenance/evidence-backfill-publisher-monitor` and `maintenance/box-monitors`. Record all three
   instance ids as `Running`, `Pending`, or `ContinuedAsNew`; a missing/unknown instance fails deploy.
   Also read back `archive-mirror-monitor-singleton` and the existing
   `subscription-monitor-singleton` through the Durable status endpoint; either missing/not-running
   singleton fails deploy.
7. Publish parser Function and verify `/parse` contract with a non-sensitive fixture.
8. Build/deploy SPA with production Vite settings and `staticwebapp.config.json`; verify CSP/assets.
9. Enable remaining code-backed gates after their endpoints, identities, secrets and schema prerequisites pass:
   assistant confirmed writes on the Data API; deep location suggestions on both the Data API and the
   location Function (with model settings and managed-identity model access verified); and Sent Items
   intake only after the queue/listener check. Keep retrospective Archive lookup API-only: do not set
   `RETRO_BOX_ARCHIVE_ROOT_IDS` on orchestration until the empty `case_po_floor` is aligned to the
   Archive/EVA sequence. Keep the Data API/outbox as the sole File Request owner; do not configure the
   retired orchestration starter.
10. Run live smoke checks and App Insights error checks; roll forward on regression while preserving
    retired-case locks and additive schema invariants.

### Supporting services reused

PostgreSQL, Blob/Queue storage, Key Vault, managed identities, App Insights/Log Analytics, Graph push
subscriptions, Box facade, Foundry model deployment and the existing Static Web App are reused.

## 6. Provisioning limit checklist

| Resource type | Number to deploy | Total after deployment | Limit/quota | Notes |
|---|---:|---:|---|---|
| New Azure resources | 0 | Unchanged | Not applicable | Azure resource inventory confirms code/config deployment only; no quota-bearing resource is provisioned. |

The existing orchestration storage account gains one data-plane queue, `sent-messages`; this is not a
new ARM resource or quota-bearing service. It is created/read back before the Sent Items gate is enabled.

**Status:** All resource counts remain unchanged. The Azure quota skill was invoked; no provider quota
query is applicable when the deployment adds zero resources.

## 7. Execution checklist

### Planning

- [x] Analyze and scan workspace.
- [x] Confirm subscription, resource group and locations from the live Azure inventory.
- [x] Confirm zero-resource provisioning inventory and subscription policy assignments.
- [x] Select the existing AZCLI/Functions/SWA deployment recipe.
- [x] Load Azure Functions, Durable Functions, AI application and SWA deployment guidance.
- [x] User approved deployment and feature activation.

### Preparation

- [x] Complete functional fixes and regression tests.
- [x] Build API/orchestration/parser/SPA deployable artifacts.
- [x] Record candidate commit and checks.
- [x] Set plan status to `Ready for Validation`.

Release candidate: `758ea5d0118f621c1f341c795d4c652aa00dc548`.

Offline candidate proof: aggregate verifier 8/8 gates (13 expected skips); domain 1,102 tests,
API 578, SPA 410, orchestration 394, Archive facade 244; all TypeScript/Vite builds green; all ten
release deltas loaded and replayed in ephemeral PostgreSQL; ticket/doc/skill gates green; deploy
bundles rebuilt/load-smoked with both drain endpoints and all monitor registrations present. Parser
contracts/OpenAPI and vendored tag drift pass; the one legacy `.DOC` extraction failure reproduces
unchanged on `main` when optional conversion tools are absent.

### Validation

- [x] Invoke `azure-validate` and run every check below.
- [x] Record commands/results in Validation proof.
- [x] Set plan status to `Validated` only after all checks pass.

### Deployment

- [x] Invoke `azure-deploy` and apply the documented order.
- [x] Enable eligible feature settings with pre/post readback.
- [x] Verify endpoints, function counts, Graph subscriptions, telemetry and SPA CSP.
- [x] Set status to `Deployed`.

## 8. Validation steps

- Full repository build/test gate and ticket/doc/skill checks.
- Parser tests and route-level VIN/EVA contract tests.
- Archive-facade Python tests, including replay/conflict recovery and public File Request URL shape.
- Rebuild and load-smoke `deploy/api/main.cjs` and `deploy/orch/main.cjs`; assert the API bundle
  registers both internal drain endpoints and the orchestration bundle registers all three new
  Durable monitor orchestrators before either artifact is publishable.
- Confirm additive SQL parses under PostgreSQL 16 and migration ledger/preconditions are safe.
- Confirm WSL `az`, `func`, `psql`, SWA CLI authentication and target subscription.
- Capture current app settings and verify all Key Vault references resolve.
- Confirm Function Apps/Static Web App are running and identities/RBAC prerequisites remain present.
- Confirm the location Function has `LOCATION_ASSIST_AI_ENABLED`, both model settings, and working
  managed-identity access before the Data API advertises deep suggestions.
- Create/read back the `sent-messages` queue before orchestration publish, confirm
  `sent-items-processor` is registered, then create or
  renew Sent Items Graph subscriptions; call maintenance until all configured mailboxes are covered.
- POST/GET both maintenance endpoints and verify fixed singleton instances
  `evidence-backfill-publisher-monitor-singleton`, `box-file-request-outbox-monitor-singleton`, and
  `box-classification-monitor-singleton`; re-read after one interval and confirm drain/sweep telemetry.
- Read back `archive-mirror-monitor-singleton` and `subscription-monitor-singleton` through the
  Durable status endpoint and require `Running`, `Pending`, or `ContinuedAsNew` for both.
- Confirm no orchestration Durable activity or client remains capable of directly creating an Archive
  File Request; the API outbox is the sole owner. Do not invent a missing File Request template id.
- Verify current Graph subscriptions are active/non-expired before and after orchestration deployment.
- Build SPA with committed production values and copy `staticwebapp.config.json` into `dist/`.

## 9. Deployment and rollback

**Deployment:** additive schema first, then API, Archive facade, `sent-messages` queue, orchestration,
parser, SPA, feature settings. The TKT-089 ownership correction runs after the new API. Historical
TKT-141/TKT-144 one-off data repairs are expressly excluded.

**Rollback:** restore captured app-setting values and prior parser/SPA/orchestration artifacts where
compatible, but do **not** blindly republish the pre-merge API. After the already-applied TKT-141 repair,
rollback must preserve the retired-case mutation lock and strict terminal-transition audit (prefer a
forward repair; otherwise build a compatibility API containing those invariants). Additive
nullable/defaulted schema changes remain in place. No destructive database rollback or resource deletion
is planned.

## 10. Validation proof

> Populated exclusively by the `azure-validate` phase.

| Check | Command run | Result | Timestamp |
|---|---|---|---|
| Offline release gates | `node verify-all.mjs`; package test/build commands; parser and Archive-facade `pytest`; ticket/doc/skill checks | 8/8 aggregate gates; domain 1,102, API 578, SPA 410, orchestration 394, Archive facade 244; builds green. The sole legacy `.DOC` parser failure reproduces on `main`. | 2026-07-11 22:46 BST |
| Deploy artifacts and database deltas | `node build-api.cjs`; `node build-orch.cjs`; bundle load/registration assertions; PostgreSQL 16 canonical-schema + ten-delta apply/replay | Both bundles load with required drains/monitors; production dependencies resolve; all deltas apply twice and the TKT-089 fixture passes. | 2026-07-11 22:46 BST |
| Azure target and toolchain | `az account show`; Function/SWA/PostgreSQL resource reads; `az functionapp function list`; `func --version`; `psql --version`; SWA CLI `--version` | Correct enabled subscription and resource group; all target apps and PostgreSQL are healthy; WSL Azure CLI 2.87.0, Functions Core Tools 4.12.0, PostgreSQL client 16.14, SWA CLI 2.0.9. | 2026-07-11 22:46 BST |
| Live database preconditions | Guarded transient-firewall connection with `psql -f .azure/validate-pr55.sql` | PostgreSQL 16 and canonical tables confirmed; all PR objects are absent as expected before migration; `case_po_floor` has zero rows; no reopened merged case; temporary firewall rule removed. | 2026-07-11 22:46 BST |
| Identity, settings and external dependencies | App-setting/identity/RBAC reads; Key Vault secret inventories; live DB and Graph token calls; keyed read of Archive root | 14 Key Vault references configured; both vaults contain their required named objects; dependent DB and Graph calls succeed; Archive root read returns HTTP 200. Storage data roles and location-model managed-identity role are present. | 2026-07-11 22:46 BST |
| Graph and orchestration prerequisites | Graph subscription read; queue existence read; orchestration function inventory | Three active, non-expired Inbox subscriptions cover all configured mailboxes. `sent-items-processor` and renewal functions are registered. `sent-messages` is intentionally absent and must be created/read back before orchestration publish. | 2026-07-11 22:46 BST |
| SPA/API boundary | API unauthenticated request; CORS preflight; deployed SPA/config reads | API rejects missing auth with 401; SWA-origin preflight returns 204; SPA returns 200 and CSP allows only the intended API and sign-in origins. | 2026-07-11 22:46 BST |
| Feature activation prerequisites | Selected API/orchestration/location setting reads; model and role reads; `case_po_floor` query | Deep location suggestions and assistant writes are eligible after deployment. Sent-email completion is eligible only after queue creation and six-subscription readback. EVA sending, chaser sending, valuation, vision, retrospective archive roots, and case disposition remain off. | 2026-07-11 22:46 BST |

**Validated by:** `azure-validate`, 2026-07-11

## 11. Generated artifacts

| File | Purpose | Status |
|---|---|---|
| `.azure/deployment-plan.md` | Deployment source of truth | Complete |
| `.azure/validate-pr55.sql` | Guarded live-database precondition query | Complete |
| Existing deploy bundles/config | Rebuilt from candidate source | Complete |
| New infrastructure/IaC | None | Not applicable |

## 12. Deployment proof

| Check | Result | Timestamp |
|---|---|---|
| GitHub release | PR 55 merged as `c7e78cc49e4c5f626bb3ade2b4b653ddecd45241`. The telemetry-found API correction was merged in PR 57; final runtime code SHA is `3cc4705041766afdeb70b07c1e097b76f5ec8097`. | 2026-07-11 23:46 BST |
| Database | All ten additive PR deltas applied in the documented order; TKT-089 ownership replayed after the API publish. Postcheck returned `pr55_schema_ready`; both new outboxes began empty. TKT-141/TKT-144 one-off repairs were not rerun. Only `AllowAzureServices` remains in the firewall. | 2026-07-11 23:46 BST |
| Published areas | Data API 108 functions, orchestration 87, Archive facade 12, parser 4, and the production SPA were published successfully. Archive root read and parser 12-field/VIN smoke both returned 200. | 2026-07-11 23:46 BST |
| Durable recovery | Evidence publisher, File Request, classification, archive mirror, and subscription-renewal singletons all read `Running`; repeated bootstrap calls did not duplicate instances. | 2026-07-11 23:46 BST |
| Graph and queue | `sent-messages` exists. Subscription maintenance returned zero errors; Graph readback shows three Inbox plus three Sent Items subscriptions, with earliest expiry 2026-07-18. | 2026-07-11 23:46 BST |
| Feature settings | `ASSISTANT_WRITE_TIER_ENABLED`, Data-API `LOCATION_ASSIST_AI_ENABLED`, and orchestration `DONE_SENT_EMAIL_ENABLED` are true. Existing Archive/folder/File Request gates remain true. Incomplete EVA poll, chaser send, valuation, orchestration retrospective Archive roots, and case disposition remain off. | 2026-07-11 23:46 BST |
| Edge and auth | SPA and current JS asset return 200; CSP contains the intended API/sign-in origins. API CORS preflight returns 204 for the SWA origin and missing auth returns 401. | 2026-07-11 23:46 BST |
| Telemetry repair | The deployment gate caught PostgreSQL `42P08` in Box failure reporting. PR 57 pinned the shared parameter type; 578 API tests, bundle load, and a PostgreSQL 16 `PREPARE` passed. After redeploy, a reclaimed classification returned 200 and API/orchestration/parser each recorded zero new exceptions, error traces, and 5xx responses; no new `42P08`. | 2026-07-11 23:46 BST |

**Deployed by:** `azure-deploy`, 2026-07-11
