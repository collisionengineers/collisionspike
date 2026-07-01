# AI assistant - context pack

## Source ticket

`docs/plans/work-todo-spike/ai-assistant/ai-assistant.md` is currently empty. The surrounding tickets make the intended scope clear: this is not a generic chat surface; it is a set of embedded suggestions around intake triage, evidence review, model benchmarking, corpus maintenance, and later case/damage assessment.

## Current state

- The live stack is the Azure SPA + Data API + orchestration tier. The SPA calls the Data API over REST with Entra/MSAL auth (`docs/architecture/live-environment.md:40-42`).
- Live Azure inventory was checked read-only through Azure MCP and Azure CLI. The resource group contains the expected SPA, API Function App, orchestration Function App, Postgres, evidence storage, retained parser/enrichment/OCR/Box functions, Document Intelligence, and an AI Services resource.
- The Data API currently has 49 registered functions and orchestration has 46 registered functions, based on `az functionapp function list` read-only checks run during this research.
- The live AI/Foundry-looking resource is `digital-3339-resource` (`AIServices`, S0, UK South). At research time `az cognitiveservices account deployment list` returned no deployments. **STALE (superseded 2026-07-01):** the operator has since created model deployments on this account — current state lives in the registry (`LIVE_FACTS.json` `foundry` / live-environment.md).

## Where the assistant fits

The strongest fit is a suggestion layer, not an autonomous actor:

- Email triage already has a deterministic pre-case step. `classifyInbound` calls the parser classifier, records an `inbound_email` row, and only allows `receiving_work` to continue to case resolution (`orchestration/src/functions/activities/classifyInbound.ts:4-15`, `orchestration/src/functions/intakeOrchestrator.ts:38-64`).
- `inbound_email` is explicitly one row per arrival with nullable `case_id`, category/subtype, confidence, classifier mode, signals, and triage state (`migration/assets/schema/120_inbound_email.sql:12-37`).
- The current user-facing triage API can set only `triage_state`; it does not persist suggested category, accepted category, override reason, model version, or reviewer feedback (`api/src/functions/inbound.ts:81-98`).
- Any assistant output should therefore be recorded as suggestions/observations first, then promoted only by deterministic rules or human confirmation.

## What is causing the gap

The repo already has most of the workflow boundaries, but not an AI suggestion contract:

- `EMAIL_AI_ENABLED` exists in the shared gate reader (`packages/domain/src/gates.ts:33`) and historical settings docs (`docs/HISTORICAL/migration/10-settings-migration.md:49`), but the live app settings checked during this pass did not include it.
- `triageClassify` is deployed, but it is a gated/manual route and currently audits/skips rather than updating `inbound_email` with durable AI suggestions (`orchestration/src/functions/gated/triage-classify.ts:4-8`, `orchestration/src/functions/gated/triage-classify.ts:46-59`).
- Image, registration, and location analysis need evidence/case context after attachments have been persisted; they should not run inside the Microsoft Graph webhook path.

## Constraints

- Microsoft Graph webhook handling must remain fast and queue-backed. Microsoft Learn says delivery is considered successful after a timely 2xx and recommends queueing with `202 Accepted` when processing cannot finish immediately: https://learn.microsoft.com/graph/change-notifications-delivery-webhooks
- Outlook message subscriptions have a maximum lifetime just under seven days, so assistant work must not increase subscription-renewal fragility: https://learn.microsoft.com/graph/change-notifications-overview#subscription-lifetime
- Azure Functions guidance recommends Durable Functions for long-running/retryable workflows, idempotency, retries, and centralized monitoring: https://learn.microsoft.com/azure/well-architected/service-guides/azure-functions#reliability
- Production AI use is gated by data-protection work, but repo data testing is allowed now if kept non-production/gated (`docs/architecture/data-protection.md:137-153`, `ROADMAP.md:484-497`).

## Changes that would resolve it

1. Define an assistant suggestion model covering `subject`, `scope`, `model`, `prompt_version`, `input_hash`, `suggested_value`, `confidence`, `signals`, `review_state`, `reviewed_by`, and `reviewed_at`.
2. Add a table or structured child rows for assistant suggestions instead of overloading `inbound_email.signals`.
3. Add Data API routes to list suggestions and accept/reject/correct them, with `CollisionSpike.User` for review and `CollisionSpike.Superuser` for reference-data edits.
4. Keep the Graph webhook unchanged: validate/enqueue and return quickly.
5. Run email AI only after deterministic classification, limited to `other`, low-confidence rows, or explicit user-triggered review.
6. Run image/registration/location AI only after evidence persistence, and promote only reviewed facts into `evidence`, `case_`, or inspection decisions.

## Evidence to carry forward

- `orchestration/src/functions/activities/classifyInbound.ts`
- `orchestration/src/functions/intakeOrchestrator.ts`
- `api/src/functions/inbound.ts`
- `api/src/functions/internal.ts`
- `migration/assets/schema/120_inbound_email.sql`
- `packages/domain/src/gates.ts`
- `docs/architecture/live-environment.md`
- Microsoft Learn: Graph webhooks, Graph subscription lifetimes, Azure Functions reliability guidance.
