# Research pack: delete or remove case

## Source ticket

`docs/plans/work-todo-spike/ui-changes/delete-case.md`

The ticket asks for an option to delete/remove cases, with a confirmation that includes a tickbox to also remove the associated Box folder.

## What exists today

There is no user-facing case delete path:

- The shared `DataAccess` interface has no delete method in `packages/domain/src/dto/index.ts:272-283`.
- The SPA REST client has no case delete method in `mockup-app/src/data/rest-client.ts:99-120`.
- Case detail actions cover add evidence, merge, hold/release, download, and submit around `mockup-app/src/screens/CaseDetail.tsx:1020-1077`, but not remove/delete.
- `api/src/functions/cases.ts:154-474` contains case read/create/hold/merge/image routes, but no `DELETE /api/cases/{id}` route.

There is a separate retention/disposition mechanism, but it is not this feature:

- `api/src/functions/internal.ts:697-765` identifies disposition-due cases and clears personal fields rather than deleting the case row.
- `orchestration/src/functions/gated/case-disposition.ts:17-24` runs only when `CASE_DISPOSITION_ENABLED` is enabled.
- `packages/domain/src/gates.ts:12-33` makes gated features default off when the setting is absent.

Read-only Azure checks against `cespk-api-dev` and `cespk-orch-dev` found the Box gates enabled (`BOX_API_ENABLED`, `BOX_FOLDER_AT_INTAKE_ENABLED`, `BOX_FILEREQUEST_ENABLED`) and no `CASE_DISPOSITION_ENABLED` setting. That matches the source: disposition is available as code but not live by default.

## Why the Box-folder part is risky

The requested tickbox to remove the associated Box folder conflicts with the archive policy in the repo:

- ADR-0017 says folder deletion is not automated and Box remains a human-governed archive path in `docs/adr/0017-box-case-folder-integration.md:54-57`.
- Data protection guidance says app disposition should not delete Box folders automatically in `docs/architecture/data-protection.md:207-213`.
- The DSAR erasure runbook handles folder delete/trash manually in `docs/plans/runbooks/dsar-erasure-cross-store.md:136-157`.
- The Box facade exposes create/list/shared-link/file-request/webhook helpers, not a case-folder delete route, in `functions/box-webhook/function_app.py:143-247`.

The UI can mention the handler-facing archive, but it should not offer a one-click automated folder deletion unless the archive policy is deliberately changed first.

## Database and permission implications

Hard delete is not just a UI button:

- Child rows such as evidence, field provenance, chasers, and notes cascade from case deletion in `migration/assets/schema/900_constraints.sql:26-34`.
- Audit, improvement, and inbound email rows retain history by setting `case_id` to null in `migration/assets/schema/900_constraints.sql:36-57`.
- RLS only permits delete through admin-level policy in `migration/assets/schema/900_constraints.sql:113-142`.
- The normal API DB connection is staff scoped in `api/src/lib/db.ts:8-20`, so a destructive route needs a controlled admin connection or stored procedure, plus app-role checks.

Audit actions currently include disposition-oriented events, not a distinct remove-case event. If removal is added, the audit vocabulary and retention summary should be extended before deletion happens.

## Affected files

- `mockup-app/src/screens/CaseDetail.tsx` - case action entry point and confirmation dialog.
- `mockup-app/src/data/rest-client.ts` and `mockup-app/src/data/hooks.ts` - remove case API call and state invalidation.
- `packages/domain/src/dto/index.ts` - DataAccess method and response types.
- `api/src/functions/cases.ts` - Superuser-only remove endpoint if hard delete is approved.
- `api/src/lib/auth.ts` - role enforcement for destructive action.
- `api/src/lib/db.ts` - admin connection/stored procedure path if RLS requires it.
- `api/src/lib/audit.ts` and `migration/assets/schema/000_enums_lookups.sql` - audit action vocabulary.
- `migration/assets/schema/900_constraints.sql` - cascade/nulling behavior and RLS policies.
- `docs/adr/0017-box-case-folder-integration.md`, `docs/architecture/data-protection.md`, and `docs/plans/runbooks/dsar-erasure-cross-store.md` - archive deletion policy.
- `functions/box-webhook/function_app.py` - only relevant if archive-folder deletion is explicitly approved later.

## Changes that would resolve it

1. Decide the product meaning of remove.
   - For duplicate/junk cases, a Superuser-only hard remove can be reasonable.
   - For retention/privacy, the existing disposition/anonymisation route is safer than row deletion.

2. Do not automate archive-folder deletion in the first pass.
   - Replace the proposed folder-deletion checkbox with an acknowledgement such as `I have handled the archive folder separately`.
   - Show the existing archive link when available so the authorised user can open it and follow the human process.

3. Add a tightly scoped backend path if hard remove is approved.
   - Require `CollisionSpike.Superuser`.
   - Audit the removal intent and identifiers before deletion.
   - Use an admin-safe database path that respects the RLS design.
   - Return clear status for already-removed or not-found cases.

4. Add UI guardrails.
   - Use a confirmation dialog with case number, provider, claimant/insured name if present, and a required typed confirmation.
   - Keep rendered copy in plain handler terms: `Remove case`, `This cannot be undone`, `I have handled the archive folder separately`.

5. Test destructive behavior.
   - Unit-test role rejection.
   - Integration-test cascade/nulling behavior.
   - Verify audit rows survive after the case row is removed.

## Open checks before implementation

- Legal/product approval is needed before hard delete because the current architecture favours audit retention and controlled disposition.
- If automated archive deletion is still required, ADR-0017 and the data-protection docs should be updated before code is written.
