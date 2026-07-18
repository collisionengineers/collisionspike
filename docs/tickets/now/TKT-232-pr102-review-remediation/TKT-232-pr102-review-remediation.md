---
id: TKT-232
title: PR #102 review remediation — 19 verified Codex findings across retro, persistence, and guards
status: now
priority: P1
area: email
tickets-it-relates-to: [TKT-219, TKT-225, TKT-226, TKT-230, TKT-231]
research-link: docs/tickets/now/TKT-232-pr102-review-remediation/evidence/triage-2026-07-17.md
---

# PR #102 review remediation — 19 verified Codex findings

## Problem

PR #102 carries 23 inline review comments + 3 review-body findings from the Codex reviewer
(20 distinct findings after de-duplication). A full triage against HEAD `94544380` — three
per-file verification passes with code quoted, plus an architecture pass on the four
risky fixes — confirmed **19 real and actionable, 1 invalid**
([evidence/triage-2026-07-17.md](./evidence/triage-2026-07-17.md) maps every comment id to
its verdict). The real ones include four P1 correctness families: a TOCTOU that lets retro
overwrite a concurrent staff link, a dev-mode dead-end that can never mint a Case/PO, missing
provider corroboration on weak-key Outlook/related-mail searches, and Box-identity loss on
fetch failure / refused originals — plus three genuine holes in the Box read-only command
guard.

## Decision

Fix all 19 in one remediation batch on the PR branch (four lanes: data-api, orchestration,
hook, plus the shared route/activity contract), with the SQL itself enforcing the
never-re-point invariant rather than the racy pre-check. The invalid finding (F22 —
`retro_related` allegedly staff-selectable) is refuted on the PR thread: `SUBTYPES_BY_CATEGORY`
drives the inbox filter only; the reclassify control is a separate hardcoded tag list.

## Change

See [changes.md](./changes.md) — each change is mapped to its review-comment id(s).
Highlights:

- `inbound_email.case_id` is now first-link-wins in the upsert SQL (`COALESCE(existing,
  EXCLUDED)`), with `RETURNING case_id` so callers report the link that actually happened.
- The three unqualified `source_message_id` lookups are mailbox-qualified end to end
  (link checks, ambiguous suggestions, attention stamps).
- `completeProviderRecoveryUsing` gains `archiveIdentityAcknowledged` — set only by the retro
  create seam when archive-PO adoption is off — so dev mode mints while production stays
  byte-identical.
- `retroOutlookLocate` / `retroLinkRelated` corroborate weak-key (VRM/claimant) candidates
  against the trigger's provider identity (`senderProviderAgrees`), mirroring the Box arm.
- The related-mail cap moved route-side and counts NEW links only, so reruns advance past 25.
- Located-but-unfetchable folders and refused Box originals keep the archive Case/PO + folder
  (combined arm / Held minimal anchor) instead of minting duplicates.
- `force` restarts are scoped to failed outcomes; prior `created`/`linked` runs are refused.
- The case-queue jsonb reads are nested-CASE guarded (no 22P02 on legacy audit rows).
- The Box scope hook now catches `-XDELETE`, `--json`, and attached `-d`/`-F`/`-T` curl forms.

## Verification

See [verification.md](./verification.md) — offline suites all green
(data-api 1071, orchestration 573, domain 594, web 547, hook 21); live probes listed for
post-deploy banking.

## Artifacts

- [Changes made](./changes.md)
- [Verification record](./verification.md)
- [Review-comment triage](./evidence/triage-2026-07-17.md)
