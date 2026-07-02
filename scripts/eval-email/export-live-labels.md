# Live-label export → eval overlay (operator-gated, E2)

**Status: not built.** This is a short operator note describing the feedback-loop the
[Rules Engine v2 plan's Phase 1](../../docs/plans/rules_engine_v2_plan_9ba034c4.plan.md#phase-1--real-email-eval-harness-the-accuracy-yardstick)
specifies — "script exports staff reclassifications → append to corpus → re-eval each
release" — not a script that exists yet. It is gated **E2** (policy/legal — a
business decision only the operator can make) per
[`docs/gated.md`](../../docs/gated.md) item **D6.4**: *"Live `inbound_email` PII
export for the eval corpus (Phase 1): an E2-governed export of real email rows +
staff overrides into the gitignored corpus path."*

## Why this needs the operator

`inbound_email` rows are real personal data (claimant details, vehicle registrations,
claim references — see this directory's README.md "PII rules"). Exporting them,
even into a gitignored local path, is a data-handling decision this repo's own
convention reserves for the operator (the same E2 gate that covers retention period,
lawful basis, and litigation-hold — see `docs/gated.md` § E2).

## The mechanism that already exists

The write side of this loop is **already live** — no new API work needed:

- Staff reclassify an inbound email in the SPA, which calls
  `PATCH /api/inbound/{id}/classification` (`api/src/functions/inbound.ts`,
  `reclassifyInbound`).
- On a category/subtype override, the handler writes a row to `improvement_signal`
  (`migration/assets/schema/110_improvement_signal.sql`) via `writeImprovementSignal`
  — one row per changed field, e.g. `field_name='category'`,
  `original_value=<classifier's suggestion>`, `corrected_value=<staff's chosen
  value>`, plus `actor` and `occurred_at`.
- `inbound_email` itself (`migration/assets/schema/120_inbound_email.sql`) already
  carries `subject`, `from_address`, `sender_domain`, `has_attachments`,
  `body_preview` (HTML-stripped, truncated), `body_vrm`, `body_caseref`,
  `suggested_category_code`/`suggested_subtype_code` (the classifier's original call)
  vs `category_code`/`subtype_code` (the current/chosen value).

## What the (not-yet-built) export step would do

1. **Operator sign-off** on the E2 gate (this note's whole point — nothing below runs
   without it).
2. An operator-run `psql` query (not an app code path) joins `inbound_email` to
   `improvement_signal` for rows where a staff correction changed
   `category`/`subtype`, and pulls the fields above.
3. Write/append those rows into
   `test-cases-and-data/e-mail-examinations/eval-overlay.json`, in the **same item
   schema** `manifest.json` uses (`id`, `file`, `source`, `tracked`, `context`,
   `expected_v1`, `expected_v2`, `rationale`) — `expected_v1`/`expected_v2` come from
   the staff-corrected `category`/`subtype`, `rationale` can just cite the
   `improvement_signal` row's `actor`/`occurred_at`.
4. **Known limitation to flag to the operator before building this:**
   `inbound_email` does not durably store the exact `classify_email()` **inputs**
   (no `attachment_filenames`/`attachment_kinds` columns yet, no full body — only a
   truncated `body_preview`, and no `body_jobref`/`in_reply_to`/`references` today —
   those land with Phase 2's DDL delta). A faithful re-score needs the **original**
   email content, not just the truncated preview — so `file` would need to point at
   a re-fetched or Box-archived copy of the original message, not a value
   reconstructed purely from `inbound_email` columns. This is a real design gap the
   export script will need to resolve (e.g. re-fetch via Graph by
   `source_message_id`, or pull from the case's Box folder if archived) — not
   something to paper over with a lossy reconstruction.
5. `test-cases-and-data/e-mail-examinations/` is already `.gitignore`d, so the
   overlay (and any raw files it references) never risk being committed.
6. Re-run `run_eval.py` — the overlay merges automatically (see README.md "The
   overlay corpus").

## Not in scope for this note

This is intentionally a note, not code — per the Phase-1 build scope, only the
**stub/description** is delivered here. Building the actual export script is
downstream of the E2 sign-off above.
