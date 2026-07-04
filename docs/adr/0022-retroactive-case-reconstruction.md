# ADR-0022 — Retroactive case reconstruction (the missing-case fallback)

**Status:** Proposed (2026-07-04). Phase R1 (any-status link + the ladder scaffold) is built;
Phases R2 (Box archive reconstruction) and R3 (Outlook `$search`) extend the same ladder.
Realised by ticket [TKT-058](../tickets/TKT-058-retro-case-creation/TKT-058-retro-case-creation.md).
Gates: `RETRO_CASE_ENABLED` (master, BOTH apps), `RETRO_OUTLOOK_SEARCH_ENABLED` (the R3 rung's
own kill switch), `RETRO_BOX_ARCHIVE_ROOT_IDS` / `BOX_READONLY_ROOT_IDS` (the R2 rung's
read-only archive scope). All default off; live values belong to the registry
([live-environment.md](../architecture/live-environment.md)), never this file.

## Context

The live intake mints Cases only from `receiving_work` email as it arrives (ADR-0015). Mail
about a case the system has never seen — **billing/fee chases, case updates, cancellations,
queries** for work that predates go-live or was missed — cannot link to anything:

- non-reply update mail returns from the intake orchestrator without ANY linking attempt;
- replies run `linkReply`, which deliberately matches **open (non-terminal) cases only** — so
  even a case that IS in the system but finished (`eva_submitted`) never links;
- nothing ever creates a case from these emails. They strand in the `inbound_email` triage
  queue with `case_id = NULL`. Billing emails are arriving un-linked today.

Two archives hold everything needed to rebuild a missing case (operator, 2026-07-04):

1. **The Box archive.** One folder per case, **named exactly the Case/PO** (marker included —
   `A.PCH261269`), containing the original instruction **`.eml`**, the documents, photos and
   report. It lives under a **different root** than the live `BOX_FOLDER_ROOT_ID` (the spike's
   own mirror); the operator supplies the archive root folder id(s).
2. **The three intake mailboxes** (info@/engineers@/desk@ — the Exchange-RBAC scope), which
   hold the original instruction emails going back in time.

**The key model (operator, 2026-07-04 — load-bearing):** trigger emails do NOT cite our
internal Case/PO. They cite the **provider's claim/external reference** (format varies by
provider — the classifier's `body_jobref`), possibly a **claimant name**, and a **vehicle
registration** (`body_vrm`). A CE-shaped `body_caseref` appears only opportunistically (quoted
from our own thread) and is then the strongest key. The Case/PO is therefore **discovered**
during reconstruction — it is the matched archive folder's name — never taken from the email
and **never minted** by this path.

## Decision

Add a **secondary, gated, best-effort reconstruction ladder** behind the primary intake —
invoked ONLY from the two unmatched non-receiving_work returns of the intake orchestrator
(after `linkReply`, after every existing activity in the lane, try/catch-wrapped, additive
result key) and from a keyed manual drain starter. It never blocks, reorders, or replaces the
primary path; with the gates off every rung honest-skips and behaviour is byte-identical.

```
trigger email (billing | case_update | cancellation | query, with ≥1 key)
  │  keys, strongest first: casePo (opportunistic) → externalRef (body_jobref) → vrm
  ▼
rung 1  LINK-TO-EXISTING (any status, INCLUDING terminals)        [R1 — built]
  │  exactly-1 match → link inbound_email → done (the billing fix)
  ▼
rung 2  BOX ARCHIVE (read-only content search of the archive roots) [R2]
  │  hits → ONE case folder (unanimity required) → Case/PO := folder name
  │  → download original .eml/instruction doc → explode + parse → full create
  ▼
rung 3  OUTLOOK $search (the 3 RBAC-scoped mailboxes)              [R3]
  │  original instruction found → fetchMessage → parse → create (NO Case/PO known
  │  → always Held; the PO namespace is never guessed into)
  ▼
bottom  minimal anchor (Box folder found but nothing parseable) → Held case;
        NOTHING found → audit retro_reconstruction_failed; triage row untouched
        (today's behaviour, plus visibility)
```

### The rules that make it safe

1. **Trigger eligibility (`decideRetro`, pure domain).** Categories
   `billing/case_update/cancellation/query` only — `non_actionable` (digests cite many refs)
   and `other` are excluded. At least one usable key required; name-only mail stays in triage.
   A reply whose link attempt was **`ambiguous` NEVER fires retro** — ≥2 open cases already
   match, so the case demonstrably exists; reconstruction would make a triplicate problem.
2. **Any-status linking first.** `linkReply` stays open-cases-only (its auto-attach lane);
   the retro rung 1 does the terminal-inclusive lookup (case_po/case_ref, then provider-scoped
   VRM) under the SAME advisory locks the live mint takes, links on exactly-1, flags >1
   (`duplicate_flagged`), and matches soft-`removed` cases ON PURPOSE (they must swallow their
   mail, at warning severity) rather than let a duplicate be reconstructed.
3. **The Case/PO is discovered, verified, and stored verbatim — or not at all.**
   `matchPrincipalByCasePo` validates the folder name (marker stripped longest-first, longest
   principal prefix, year+sequence remainder). An unresolved principal or missing PO means the
   cited value lands in `case_ref`, the case is **Held** (`needs_review` + `on_hold`), and
   `case_po` stays NULL. `mintCasePo` is never called on this path.
4. **Per-case landing status (`decideRetroStatus`, pure domain).** The operator decision
   "status depends on the case; completed = submitted to EVA" maps to: **`billing` trigger +
   a real recovered source + verified identity → `eva_submitted`** (the existing terminal is
   REUSED as the completed status — an invoice implies the report was delivered; the status
   guard's terminal lock keeps recomputes off it). Everything else — case_update/query/
   cancellation triggers, minimal anchors, unverified identity — lands **Held
   `needs_review`** for staff to place. A distinct "Completed" label, if ever wanted, is a
   small additive `choice_case_status` row — deliberately NOT added now.
5. **Provenance is first-class.** Retro cases carry `intake_channel_kind_code = 100000003`
   (`retro`, additive choice row), `intake_channel_manual = false`, and the reconstruction
   source + matched keys in the `retro_case_created` audit. The reconstructed ORIGINAL email
   gets its own `inbound_email` row (classification `receiving_work` /
   `existing_provider_instruction`, signal `retro_reconstructed`; synthetic
   `retro:box:<fileId>` id when the `.eml` lacks a Message-ID) so the case reads exactly like
   a normal intake; the TRIGGER email links as `routed`. `inbound_email` rows that already
   carry a `case_id` are NEVER re-pointed.
6. **Get-or-create under the live locks.** Creation re-runs the existence ladder inside the
   same transaction/advisory locks (`triage-locks.ts`), and unique-violation conflicts
   (`uq_case_case_po`, `UNIQUE(source_message_id)`) re-look-up and LINK — concurrent
   duplicate triggers and same-original-arrives-live races are outcomes
   (`already_exists_linked` / `already_ingested`), never 500s.
7. **The archive is read-only.** R2 widens the Box scope lock to a **dual RW/RO** model:
   list/search/download are allowed under the operator-supplied RO archive roots; create/
   upload/delete remain locked to the live RW root (ADR-0012's one-way mirror; nothing is
   ever written into or deleted from the archive). The RW/RO verification caches must be
   SPLIT — a single cache would let an RO-verified id pass a later write assertion.
8. **Terminal only when verified** (defence in depth): the Data API re-asserts that
   `eva_submitted` requires a resolved principal + discovered PO, whatever the caller sent,
   and whitelists the landing statuses to exactly `{eva_submitted, needs_review}` — the retro
   route is not a write-any-status backdoor.

### Consequences & accepted limitations

- **Future replies to a retro case won't archive-mirror**: `boxArchiveEvidence` uploads into
  the case's stamped `box_folder_id`, which for a retro case is the READ-ONLY archive folder —
  the scope lock refuses it (per-file catch; blob keeps the bytes). Accepted; a named
  follow-up teaches `boxArchiveEvidence` to skip cleanly when the folder is RO-rooted.
- **`eva_submitted` reads "EVA Submitted"** on cases this system never submitted. Accepted per
  the operator decision; the "Completed" label option is recorded above.
- **VRM-only reconstruction is the weakest rung** and is guarded accordingly: provider-scoped
  existence lookup, unanimous-folder + folder-principal-must-match-sender-provider acceptance
  (R2), corroboration demotion to Held, and terminal status never from a minimal anchor.
- **No bulk backfill in v1** — retro fires per-arrival. The existing pile of un-linked triage
  rows is drained one-by-one via the keyed starter (`POST /api/retro-case` with the row's
  `source_message_id` + `source_mailbox`); a bulk sweep is a natural follow-up ticket once
  trusted.
- With the master gate on but the Box/Outlook rungs unbuilt or gated off, the ladder degrades
  to rung-1 linking — already the live pain fix.

## Alternatives considered

- **Widen `linkReply` to terminal cases** — rejected: linkReply is the ungated auto-attach
  lane for replies; changing its matching semantics changes live behaviour for every reply.
  The retro rung keeps terminal-inclusive linking behind its own gate.
- **Suggestion-first (ai_suggestion rows staff approve)** — rejected by the operator:
  reconstruction from the archive's own `.eml` runs the SAME parse/create pipeline as live
  intake, time-shifted, so auto-create at equal trust; Held status covers the uncertain
  cases.
- **Mint a fresh Case/PO when none is discovered** — rejected: the real historical PO exists
  (in the archive/EVA); minting a new one would fork the numbering. Held + staff confirm.
- **Extend `internalCasesResolve`** — rejected: it is entangled with the ADR-0010 dedup
  ladder and the mint; the retro persist is a sibling route with its own invariants.
