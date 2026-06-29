# Automation mode - context pack

## Source ticket

`docs/plans/work-todo-spike/automation-mode/am.md` says the modes need precise definition. The screenshot in the same folder shows the current UI choices: `Manual`, `Review-auto`, and `Full-auto`.

## Current state

Three modes already exist in the shared model and schema:

- `manual`;
- `review_auto`;
- `full_auto`.

Evidence:

- Choice values are in `migration/assets/schema/000_enums_lookups.sql:368-376`.
- `work_provider.provider_automation_mode_code` stores the selected mode and defaults to `review_auto` (`migration/assets/schema/010_work_provider.sql:20-23`).
- The domain type mirrors those three values (`packages/domain/src/model/types.ts:186-200`).
- Provider rows are mapped to DTOs with `providerAutomationMode` (`api/src/lib/mappers.ts:286-296`).
- The Admin screen exposes a provider automation dropdown (`mockup-app/src/screens/Admin.tsx:100-107`, `665-686`).

## Conflicts

There are three important inconsistencies:

1. Some docs describe four modes, including `AI Auto`, while schema/domain/UI expose only three. This appears in `docs/requirements/provider-corpus.md` and `CONTEXT.md`.
2. The schema default is `review_auto`, but the corpus seed sets every inserted provider to `manual` (`migration/assets/schema/seed/910_seed_corpus.sql:160-180`). If runtime enforcement is added without a data correction, the existing corpus may stop auto-processing.
3. Admin UI edits are local-only. The provider API is read-only (`api/src/functions/providers.ts:16-39`), the REST client exposes only provider reads, and `ProviderEditor.save()` only shows a toast (`mockup-app/src/screens/Admin.tsx:548-578`).

## Existing behavior

Automation mode is not currently enforced in the live intake chain:

- Internal provider-match records select only id, principal code, known domains, and active state (`api/src/functions/internal.ts:186-201`).
- `ProviderMatchRecord` has no automation mode (`packages/domain/src/domain/provider-match.ts`).
- `providerMatch` therefore cannot return mode to orchestration.
- `intakeOrchestrator` always runs the same path for `receiving_work`: case resolve, evidence persist, parse, status evaluate, enrich, and Box-folder creation if enabled (`orchestration/src/functions/intakeOrchestrator.ts`).
- Live read-only CLI checks confirmed the relevant orchestration functions are deployed, including `providerMatch`, `caseResolve`, `parse`, `enrich`, `statusEvaluate`, and Box/EVA/chaser starters.

The current safety rules are elsewhere:

- ADR-0010 prevents silent ambiguous linking and cross-provider matching (`packages/domain/src/domain/dedup.ts:27-43`, `139-163`).
- ADR-0013 prevents runtime address auto-selection; staff choose or confirm inspection address decisions.
- ADR-0015 requires deterministic email triage first and no ambiguous auto-linking.
- EVA submission remains a staff/review boundary except for a future, explicitly gated full-auto mode.

## Recommended definitions

Use these three canonical definitions unless the product decision is to add a fourth enum everywhere.

### Manual

Meaning: the system records and classifies inbound email, but staff create or complete the case.

Allowed:

- receive and record inbound email;
- classify into receiving work/query/other;
- show the item in the inbox/work queue;
- allow staff-triggered parser, case creation, linking, and review actions.

Not allowed:

- automatic case creation;
- automatic attach/merge;
- automatic parsing into case fields;
- automatic enrichment;
- automatic Box/EVA/chaser actions.

### Review-auto

Meaning: the default live mode. The system prepares the case, but staff review before EVA.

Allowed:

- provider domain matching when unambiguous;
- case creation or safe attach using ADR-0010 rules;
- evidence persistence;
- parser prefill;
- status evaluation;
- enrichment when global gate and provider policy allow it;
- Box folder creation if the global Box gates are on.

Not allowed:

- auto-submitting to EVA;
- auto-selecting inspection address;
- auto-resolving duplicate ambiguity;
- auto-sending chasers without the outbound gate and explicit policy.

### Full-auto

Meaning: reserved/deferred. The system may proceed past review only when every safety condition passes.

Minimum required conditions before implementation:

- provider match is exactly one active provider;
- provider mode is `full_auto`;
- provider per-step flags allow enrichment/EVA/outbound work;
- no duplicate risk or pending link state;
- required EVA fields are complete and reviewed or deterministic;
- inspection address decision is valid and does not violate ADR-0013;
- image rules pass;
- EVA API path is live and gated on;
- Box archive path is live and idempotent;
- all actions write audit rows and terminal case status is persisted.

Until those are true, `full_auto` should be hidden, disabled, or labelled as not available.

## Changes that would resolve the ticket

1. Make this three-mode definition canonical in `am.md`.
2. Reconcile the four-mode docs by removing `AI Auto` or adding a real fourth choice across schema, choiceset JSON, domain type, API mapper, UI, and tests.
3. Decide whether seed data should default to `review_auto` or `manual`; document and correct live data before enforcing the mode.
4. Add provider update APIs if the Admin screen should persist mode changes:
   - Superuser-only `PATCH /api/providers/{id|code}`;
   - immutable principal code unless a special audited flow exists;
   - unique active email-domain validation;
   - required reason when loosening automation;
   - `corpus_record_changed` audit.
5. Extend provider-match records/results with `providerAutomationMode` and relevant provider booleans.
6. Branch orchestration after deterministic triage and provider match:
   - `manual`: stop at inbound record/manual queue;
   - `review_auto`: current path;
   - `full_auto`: reserved strict path only.
7. Persist dedup-risk fields consistently before trusting any higher automation. `internalCasesResolve` receives `setDuplicateRisk` and `caseLinkState`, but the create insert currently does not persist those fields.
8. Clean rendered Admin copy that leaks engineering wording such as `gate` and environment-variable names.

## Azure/Microsoft considerations

- Keep Microsoft Graph webhook behavior unchanged: validate/enqueue and respond quickly. Microsoft Learn recommends queueing and returning a timely `202 Accepted` when work cannot complete in the delivery window: https://learn.microsoft.com/graph/change-notifications-delivery-webhooks
- Use Durable Functions for mode-dependent, retryable orchestration branches and keep actions idempotent: https://learn.microsoft.com/azure/well-architected/service-guides/azure-functions#reliability
- Do not use app-setting gates as a replacement for provider-level policy. Global gates decide whether a capability exists; provider automation mode decides whether the system may use it for that provider.

## Evidence

- `docs/plans/work-todo-spike/automation-mode/am.md`
- `migration/assets/schema/000_enums_lookups.sql`
- `migration/assets/schema/010_work_provider.sql`
- `migration/assets/schema/seed/910_seed_corpus.sql`
- `packages/domain/src/model/types.ts`
- `api/src/lib/mappers.ts`
- `api/src/functions/providers.ts`
- `api/src/functions/internal.ts`
- `orchestration/src/functions/intakeOrchestrator.ts`
- `mockup-app/src/screens/Admin.tsx`
- Microsoft Learn Graph webhooks: https://learn.microsoft.com/graph/change-notifications-delivery-webhooks
- Microsoft Learn Azure Functions reliability: https://learn.microsoft.com/azure/well-architected/service-guides/azure-functions#reliability
