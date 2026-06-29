# Plans directory cleanup research

## Ticket

Source stub: `docs/plans/work-todo-spike/docs-cleanup/plans-dir.md`

The stub asks for a full pass through `docs/plans`, removing stale planning material and extracting remaining work into small atomic tickets.

## Summary

`docs/plans` is no longer one kind of content. It contains historical Power Platform phase plans, live Azure-era backlog sources, active runbook-like docs, UX prototype material, and the new work-todo spike tickets. The current index partly acknowledges that history, but still routes readers through stale Power Platform, Dataverse, connector, and Box-gated material as if it were operationally current.

The cleanup should not churn the whole archive. It should classify each plan file as `current`, `historical`, or `ticket-source`, then extract current work into atomic tickets with source evidence. Live state should be cited from `docs/architecture/live-environment.md` and `LIVE_FACTS.json`, not copied into every plan.

## What is happening

The live reference point has moved forward:

- `docs/architecture/live-environment.md:3-18` says the Azure/Postgres stack is live and Power Platform is deprovisioned.
- `docs/architecture/live-environment.md:33`, `docs/architecture/live-environment.md:42`, and `LIVE_FACTS.json:3-8` say production Graph PUSH intake is now `info@`, `engineers@`, and `desk@`; `digital@` was removed.
- `docs/architecture/live-environment.md:40-45` and `LIVE_FACTS.json:99-140` say API, orchestration, and Box gates are live/on, with Box JWT Server Auth working.
- `docs/architecture/live-environment.md:90-101` narrows the remaining live gaps to evidence blob connection, orchestration managed-identity app role, monitor alerts, unattended renewal proof, and stale subscription pruning.

The plans index and several plan families still describe the older platform and older Box/email state:

- `docs/plans/README.md:20` is dated 2026-06-25, before the latest live state.
- `docs/plans/README.md:74-82` still describes Phase 7 as Dataverse schema/env vars live in Dev, Box function gated off/secret-free, connectors/flows offline.
- `docs/plans/README.md:88-120` indexes active-sounding Dataverse, connector, and flow plans.
- `docs/plans/milestone-model.md:70-104` frames milestones around Code App, Dataverse, flows, connectors, Copilot-on-Dataverse, and Box gates off.
- `docs/plans/phase-2-live-activation/README.md:9-22`, `docs/plans/phase-2-live-activation/multi-inbox-access.md:42-101`, and `docs/plans/runbooks/live-email-linking.md:18-90` still describe Power Automate/shared-mailbox activation rather than live Graph PUSH orchestration.
- `docs/plans/phase-7-box-integration/README.md:1-8`, `docs/plans/phase-7-box-integration/README.md:21-40`, `docs/plans/phase-7-box-integration/REMAINING-STEPS.md:16-62`, and `docs/plans/runbooks/box-business-test.md:1-22` still frame Box as CCG/custom-connector/gates-off work.
- `docs/plans/phase-8-inbox-management/README.md:1-17` and `docs/plans/phase-8-inbox-management/junk-backlog-and-activation-evidence.md:18-52` retain digital@ and Power Automate activation evidence that should now be historical background.

The plan tree also contains review and UX material that conflicts with binding reviews:

- `docs/reviews/README.md:3-9` says manual review docs outrank older docs and code.
- `docs/plans/phase-ux-design-lab/design-brief.md:116-126` reintroduces review-rejected stages such as Parsing, Box, Ready, and "Live work - drainable now", conflicting with `docs/reviews/190626/dashboard/review.md:3-14`.
- `docs/plans/phase-ux-design-lab/design-brief.md:173-193` includes UI-facing engineering terms such as `Export JSON`, `provenance`, and `gated`, conflicting with `docs/reviews/190626/queues-cases/caseview/review.md:8-30` and the project UI-language rule.

## Link and index drift

The repo link checker currently passes hard failures but reports a tolerated backlog:

- `node scripts/check-doc-links.mjs --quiet` reports `PASS links`, `INFO links-backlog (27)`, `PASS orphans`, and `PASS leakage`.
- The backlog is mostly links into removed or out-of-band `flows/`, `dataverse/`, `raw/`, and moved parity-test paths.
- `README.md:64`, `CURRENT_STATUS.md:172`, `docs/handoff/03-api-hardening.md:1`, `docs/handoff/02-box-activation.md:113`, and `docs/plans/phases-1-7-sweep-report.md:7` still reference removed `OPEN_ITEMS.md`.
- `docs/reviews/README.md:19` says each review area file is `review.md`, but `docs/reviews/190626/new-case/review.md.md` breaks that convention and is linked from `docs/architecture/eva-field-model.md:6`.
- `docs/HISTORICAL/**` contains many stale relative links if scanned naively. That is acceptable if the archive stays frozen and clearly banded; do not spend cleanup effort rewriting historical internals unless archive policy changes.

## Highest-risk plan families

Treat these as P0 cleanup targets because they look active and can send future work down the wrong path:

- `docs/plans/user-accounts-and-permissions.md` still describes Code App and Dataverse role mechanics rather than Entra app roles, Data API authorization, and Postgres RLS. Evidence: `docs/plans/user-accounts-and-permissions.md:21`, `:42`, `:52`, `:91`, `:165`, `:216`, `:287`, `:308`.
- `docs/plans/runbooks/live-email-linking.md` still directs Outlook/Power Automate/Dataverse/Code App checks for `digital@`. Evidence: `docs/plans/runbooks/live-email-linking.md:1`, `:18`, `:45`, `:70`, `:92`.
- `docs/plans/runbooks/box-go-live.md` still says Box go-live requires CCG app, custom connector, Dataverse app user, and `pac code add-data-source`. Evidence: `docs/plans/runbooks/box-go-live.md:30`, `:94`, `:126`, `:138`, `:162`.
- `docs/plans/phase-8-inbox-management/*` still targets `cr1bd_inboundemail`, Power Automate restructuring, Dataverse gates, and Code App binding. Evidence: `docs/plans/phase-8-inbox-management/README.md:1`, `:97`, `:171`, `:226`; `docs/plans/phase-8-inbox-management/IMPLEMENTATION-PLAN.md:21`, `:192`, `:244`, `:277`, `:369`.
- `docs/plans/phase-7-box-integration/*` still presents Box as offline/gated Power Platform work. Evidence: `docs/plans/phase-7-box-integration/README.md:21`, `:67`, `:91`, `:166`; `docs/plans/phase-7-box-integration/REMAINING-STEPS.md:39`, `:53`; `docs/plans/phase-7-box-integration/box-integration-activation.md:37`, `:65`.

## What changes would resolve it

1. Add a classification table to `docs/plans/README.md` with one row per plan family:
   - `current`: Azure-era implementation or operations doc.
   - `historical`: prior-era record retained for audit/context.
   - `ticket-source`: useful research or review input that must be distilled before implementation.
   - `prototype`: generated UX/design exploration, not production source of truth.

2. Add or strengthen banners for superseded plan families:
   - Phase 0/1 Code App, Dataverse, Power Automate, connector, and historical activation plans.
   - Phase 2 Power Automate/shared-mailbox activation.
   - Phase 7 CCG/custom connector/Dataverse Box plans.
   - Phase 8 Power Automate and digital@ backlog material.
   - UX lab prototype outputs.

3. Rewrite the current equivalents instead of preserving stale operational docs:
   - `docs/plans/user-accounts-and-permissions.md` around Entra roles, Data API auth, and Postgres RLS.
   - `docs/plans/phase-2-live-activation/README.md` around Graph PUSH production intake.
   - `docs/plans/phase-7-box-integration/README.md` around Box JWT live state and remaining archive-sync gaps.
   - `docs/plans/phase-8-inbox-management/README.md` around `inbound_email`, Data API routes, and orchestration classification.
   - `docs/plans/milestone-model.md` around the current Azure milestones.

4. Extract implementation tickets from the active research and review sources:
   - `CASEPO-001`: server-side Case/PO allocator with uniqueness and concurrency.
   - `BOX-ARCHIVE-001`: ensure and stamp Box folder ids on cases.
   - `BOX-ARCHIVE-002`: upload/archive-copy Blob-backed `.eml`, instructions, and images to Box.
   - `DASH-001`: define combined dashboard and inbound triage acceptance contract.
   - `AUTOMATION-001/002/003`: canonicalize modes, add provider update API, enforce provider mode in orchestration.
   - `INBOX-001`: persist dismiss/action state so handled emails leave active views.
   - `AI-OBS-001`: add suggestion/observation model rather than direct AI mutations.
   - `IMAGE-PDF-001`: extract vehicle images from PDFs and flag unsuitable/no-registration-visible images.
   - `REF-DATA-001`: add Superuser reference-data CRUD with archive/audit semantics.
   - `SRC-PARITY-001`: reconcile `api/src` with `api/dist` and the live function set before feature work.

5. Run doc hygiene checks after cleanup:
   - `node scripts/check-doc-links.mjs`
   - A targeted active-doc scan excluding `docs/HISTORICAL/**` for stale terms such as `Code App`, `Dataverse`, `Power Automate`, `pac code`, `custom connector`, `cr1bd_`, `make.powerautomate`, `apps.powerapps.com`, and `collisionengineers-dev.crm11`.

## Files affected

- `docs/plans/README.md`
- `docs/plans/milestone-model.md`
- `docs/plans/user-accounts-and-permissions.md`
- `docs/plans/phase-2-live-activation/README.md`
- `docs/plans/phase-7-box-integration/README.md`
- `docs/plans/phase-8-inbox-management/README.md`
- `docs/plans/runbooks/live-email-linking.md`
- `docs/plans/runbooks/box-go-live.md`
- `docs/plans/runbooks/box-business-test.md`
- `docs/architecture/integrations.md`
- `docs/architecture/microsoft-stack.md`
- `docs/architecture/data-protection.md`
- `docs/requirements/intake-workflow.md`
- `docs/requirements/provider-corpus.md`
- `docs/reviews/190626/new-case/review.md.md`

