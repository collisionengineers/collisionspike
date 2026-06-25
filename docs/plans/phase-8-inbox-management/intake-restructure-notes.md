# Intake restructure — operator reconcile-up-to-live note (Phase 8, slice A)

> **Offline artifact only.** Nothing here is activated. The trigger flip, the solution re-import, and
> the single-inbox soft rollout are all operator-gated (see the IMPLEMENTATION-PLAN
> [§ Operator-gated activation](./IMPLEMENTATION-PLAN.md#operator-gated-activation), G1/G5/G6).

## What changed offline (slice A — FLOW)

`flows/definitions/intake.definition.json` and `flows/definitions/intake-shared-mailbox.definition.json`
were restructured **triage-first, then route** per the README §"Flow change" and the
IMPLEMENTATION-PLAN slice A:

1. **Trigger filter flipped** — `fetchOnlyWithAttachment: false` (intake) /
   `hasAttachments: false` (intake-shared-mailbox). `concurrency:{runs:1}` and the
   `MinIntakeDate` / `Drop_if_before_min_date` guard are unchanged. The old attachment-only filter was a
   documented TEMPORARY noise filter "to be removed when a full email-management/routing system lands" —
   this is that system.
2. **Dedup generalised (ADR-0010)** — `Find_existing_by_messageId` (on `cr1bd_cases`, kept) is now joined
   by a new `Find_existing_inbound` (on `cr1bd_inboundemails`, Message-ID alternate key, OData-escaped).
   `If_already_ingested` drops on a hit in **either** table, so a repeat query/other email (which never
   creates a Case) is dropped too.
3. **Provider match precedes classification** — `List_active_providers` + `Filter_exact_domain`
   (anchored exact membership, unchanged) now feed a `providerMatchState` variable
   (`one` | `ambiguous` | `none`) + `workProviderId`, computed before triage.
4. **`Select_attachment_kinds`** — coarse pre-triage instruction-vs-image hint over
   `body/attachments[*].name` using the same extension set as classify-persist's `Compose_kind`
   (`.jpg/.jpeg/.png → image`, `.pdf/.docx/.doc → instruction`, else `''`).
5. **`Run_triage` child** — calls `triage-classify.definition.json` (placeholder
   `host.workflowReferenceName = "CS_TriageClassify"`) with the full metadata payload. The child upserts
   the `cr1bd_inboundemail` row, calls `/classify-email`, runs the open-Case lookup and audits
   `inbound_classified` + `inbound_routed`.
6. **`Switch_on_category`** —
   - `receiving_work` → the **existing Case chain** (`Create_case` **moved here**: only this category
     creates a Case), then `Update_inbound_case_writeback` binds the new Case onto the triage row and sets
     `cr1bd_triagestate='routed'`.
   - `query` / `other` → **NO Case**; the triage child already did the row upsert, the open-Case link and
     both audits. Inert `Compose` documents the no-op. (**gap-4 LOCKED**, IMPLEMENTATION-PLAN §2.5: the
     README's `inbound_query_logged` / `inbound_other` audit actions are **not** introduced — they have no
     choiceset value and the child already audits every category uniformly.)
   - `default` → treated as `other`.

## CRITICAL — reconcile UP to live BEFORE any solution re-import (G1)

The **live CS Intake** (`intake.definition.json`'s deployed counterpart) was wired post-build to call two
extra Run-a-Child-Flow children after parse — `Run_case_resolve` (merge-by-registration, ADR-0010) and
`Run_enrich` (DVSA/DVLA) — which the repo def previously **lacked** (memo `intake-repo-trails-live`;
old `intake.definition.json` L463; `flow-state.json` case-resolve `activationNote`; the
2026-06-22 review `timebombs-infra.md`). Flow definitions are **replaced** on managed-solution import, so
re-importing the repo def **without** these would silently drop the live enrich + auto-merge wiring.

This slice has therefore **added** `Run_case_resolve` + `Run_enrich` to the `receiving_work` chain of
`intake.definition.json` (after `Run_status_evaluate`, both single `{ caseId }`, non-blocking via
`runAfter` on all outcomes). **This is a best-effort offline reconstruction.** Before any re-import the
operator MUST:

- [ ] Open the **live** CS Intake in make.powerautomate.com and confirm the **exact** wiring of
      `Run_case_resolve` + `Run_enrich`: their **presence**, their **order** relative to
      `Run_status_evaluate` (the IMPLEMENTATION-PLAN orders them
      `status-evaluate → case-resolve → enrich`; the live `case-resolve` comment records the live call
      order as `…status-evaluate → enrich → case-resolve` — **reconcile to whatever live actually is**),
      their `runAfter` conditions, and their input bodies. **Live is authoritative.**
- [ ] Re-bind every Run-a-Child-Flow card after import (G5), including the new `Run_triage` →
      imported `Flow_TriageClassify` GUID, and `Run_case_resolve` / `Run_enrich` →
      their imported child GUIDs (the `CS_*` `workflowReferenceName`s are placeholders).
- [ ] Only then flip the LIVE trigger `fetchOnlyWithAttachment` true→false on **one** inbox (`digital@`)
      and soft-roll-out per G6.

`intake-shared-mailbox.definition.json` is the **thinner** per-inbox multi-mailbox scaffold — it never had
the downstream child chain (no classify-persist/parse/status/case-resolve/enrich) and is **not** live, so
there is no live chain to reconcile there; its `receiving_work` branch is `Create_case` + the triage-row
write-back only.

## Local verification (zero tenant contact)

```
node flows/validate-flows.mjs
python -c "import json;[json.load(open(f)) for f in ['flows/definitions/intake.definition.json','flows/definitions/intake-shared-mailbox.definition.json','flows/definitions/triage-classify.definition.json']]"
```
