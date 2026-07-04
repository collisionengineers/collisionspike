---
id: TKT-058
title: Retroactive case creation (reconstruction fallback for un-linked update/billing email)
status: now
priority: P1
area: intake
tickets-it-relates-to: [TKT-023, TKT-037, TKT-046, TKT-041]
research-link: docs/adr/0022-retroactive-case-reconstruction.md
---

# Retroactive case creation (reconstruction fallback)

## Problem

The live intake only creates cases from `receiving_work` email as it arrives. An inbound
**billing / case_update / cancellation / query** about a case the system has never seen (it
predates go-live, or was missed) cannot link: `linkReply` matches **open cases only** (so even
an existing-but-terminal `eva_submitted` case never links), and non-replies never attempt any
link at all. The email strands in the triage queue with `case_id = NULL` — **billing emails
are arriving un-linked today**.

The information to rebuild the case exists in two archives: the **Box archive** (one folder
per case, named exactly the Case/PO, holding the original instruction `.eml` + every file)
and the **three intake mailboxes**. Trigger emails cite the provider's claim/external
reference and/or a registration — NOT our Case/PO, which must be *discovered* from the
matched archive folder's name.

## Change

The gated reconstruction ladder of **[ADR-0022](../../adr/0022-retroactive-case-reconstruction.md)**
(design + full rules there): `link-to-existing (any status) → Box archive content-search →
Outlook $search → minimal Held anchor → failure audit`. Secondary and additive — hooks only
into the two unmatched non-receiving_work returns of the intake orchestrator, try/catch-
wrapped, gates default-off on BOTH apps (`RETRO_CASE_ENABLED`; R3 additionally
`RETRO_OUTLOOK_SEARCH_ENABLED`; R2's archive scope `RETRO_BOX_ARCHIVE_ROOT_IDS` +
`BOX_READONLY_ROOT_IDS`).

## Build phases

- [x] **R1 — foundations + any-status link ("the billing fix")**: domain rules
  (`packages/domain/src/domain/retro-case.ts` — `decideRetro`, `decideRetroStatus`,
  `matchPrincipalByCasePo`, `selectBoxInstructionCandidate` + tests); DDL delta
  [`2026-07-04-retro-case.sql`](../../../migration/assets/schema/deltas/2026-07-04-retro-case.sql)
  (audit actions 100000046–48, intake channel `retro` 100000003); Data API routes
  `POST /api/internal/retro/resolve-existing` + `/retro/create`
  (`api/src/functions/internal-retro.ts`, validator `api/src/lib/retro-validate.ts` + tests);
  orchestration `retroCaseOrchestrator` + keyed drain starter `POST /api/retro-case`
  (`orchestration/src/functions/gated/retro-case.ts`); the two intake hooks.
- [x] **R2 — Box archive reconstruction (primary source)** *(built 2026-07-04, ships dark —
  live activation is the D11 operator item)*: dual RW/RO Box scope lock
  (`BOX_READONLY_ROOT_IDS`, split verification caches), `search_content`/`download_file` +
  routes, parser `/explode-eml` wrapper route, `retroBoxLocate`/`retroBoxFetchInstruction`/
  `retroCreatePersist` activities, corroboration + unanimity rules, evidence registration.
- [x] **R3 — Outlook `$search` fallback** *(built 2026-07-04, ships dark — needs
  `RETRO_OUTLOOK_SEARCH_ENABLED` on top of the master gate)*: `graph.ts` `searchMessages`
  (Graph `$search` semantics VERIFIED against Microsoft Learn and pinned in the function
  header — from/subject/body default targeting, double-quoted clause, no `$filter`/
  `$orderby` combining on messages, no ConsistencyLevel needed), `selectOutlookOriginal`
  (own-sender drop / attachments / non-RE: / earliest), `retroOutlookLocate` (per-mailbox
  fan-out, key ladder); corroboration REQUIRED (key in message text, or parsed ref/VRM
  agreement) — uncorroborated hits create NOTHING; Outlook-only reconstructions land Held
  with NO Case/PO (never mint).
- [x] **R4 — provenance display + docs closure** *(built 2026-07-04)*: `IntakeChannelKind`
  union + `INTAKE_CHANNEL_LABELS` widened to `provider_api`/`retro` (model +
  `intakeChannelKindCodec` + `intake-channel.json` — fixes the pre-existing lag where a
  provider-API case displayed as "Email"), the three SPA channel render sites moved onto
  the shared label map, CONTEXT.md glossary (Retro case, Archive root (read-only),
  Reconstruction ladder). LIVE_FACTS gate registration happens at the D11 deploy.

Change-by-change audit trail: [changes.md](./changes.md) · smoke steps: [verification.md](./verification.md).

## Activation (operator — gated.md D11)

Archive root id(s) + Box service-account Viewer grant → apply the DDL delta → set the app
settings → flip `RETRO_CASE_ENABLED` on **both** apps → smoke per
[verification.md](./verification.md). The drain starter clears the existing un-linked pile
one email at a time; a bulk sweep is a follow-up once trusted.

## Out of scope (documented follow-ups)

- Claimant-name search keys (no extraction exists; classifier change = sibling-repo edit).
- Bulk backfill sweep over `inbound_email WHERE case_id IS NULL`.
- `boxArchiveEvidence` skip-when-RO-rooted (future replies to retro cases can't archive-mirror
  into the read-only archive folder — accepted, ADR-0022 §Consequences).
