# Email classifier eval harness

A real-email accuracy yardstick for the deterministic inbound-email classifier
(`functions/parser/cedocumentmapper_v2/rules/email_classifier.py`), built for
[Phase 1 of the Rules Engine v2 plan](../../docs/plans/rules_engine_v2_plan_9ba034c4.plan.md#phase-1--real-email-eval-harness-the-accuracy-yardstick).

This is a **net-new scorer**, separate from the engine's own regression suite
(`functions/parser/tests/`, `test-cases-and-data/triage-corpus/labels.json`). That
suite proves the engine's *rules* behave as designed against synthetic + re-typed
fixtures; this harness measures accuracy against a **hand-labelled corpus of real
emails**, to catch gaps the synthetic suite can't see (real prose, real thread
quoting, real attachment naming quirks).

## What it does

`run_eval.py`:

1. Loads a labelled corpus from `manifest.json` (tracked; 44 real `.eml`/`.msg`
   files) plus an optional local-only overlay (see below).
2. For each item, parses the real email file into `classify_email()`'s request
   fields (subject, body, from/sender-domain, attachment kinds/filenames,
   in-reply-to/references), applies any manifest `context` overrides (always
   includes `provider_match_state`, which cannot be derived from a raw email file),
   and calls the vendored `classify_email()` **directly as a Python function** — no
   HTTP, no Azure, no network.
3. Compares the result to each item's hand-labelled expected `{category, subtype}`
   and reports:
   - overall category accuracy and category+subtype (exact) accuracy,
   - per-category precision / recall / F1,
   - a category-level confusion matrix,
   - a subtype-accuracy table,
   - a mismatch list (id, expected, got, confidence).

## Running it

```bash
# from the repo root, using the parser Function's venv (has extract-msg + the
# vendored engine's runtime deps available on sys.path via functions/parser/):
functions/parser/.venv/bin/python scripts/eval-email/run_eval.py

# score against the v2 taxonomy (falls back to expected_v1 per item when an item
# has no expected_v2) -- informational only until Phase 2 ships the v2 engine tag:
functions/parser/.venv/bin/python scripts/eval-email/run_eval.py --taxonomy v2

# full per-item detail (incl. `signals`) for LOCAL debugging -- see "PII rules" below:
functions/parser/.venv/bin/python scripts/eval-email/run_eval.py --json-out /tmp/report.json

# regenerate the committed baseline (redacted shape):
functions/parser/.venv/bin/python scripts/eval-email/run_eval.py --baseline-out scripts/eval-email/baseline-v1.json

# CI-style regression gate -- exits 1 if any category's precision/recall drops
# below the baseline's value minus 0.0001:
functions/parser/.venv/bin/python scripts/eval-email/run_eval.py --check scripts/eval-email/baseline-v1.json
```

If `functions/parser/.venv` doesn't exist yet:

```bash
cd functions/parser
python -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt extract-msg
```

`verify-all.mjs` runs this harness too, opt-in behind `EVAL_EMAILS=1` (see repo-root
`verify-all.mjs`) — it skips cleanly when the venv or `extract_msg` isn't set up.

Exit code: **0** on a normal run (mismatches are expected and are not failures — see
"Ground truth, not a pass/fail gate" below); **non-zero only** when `--check` finds a
regression against the given baseline, or on a hard operational error (manifest
missing, engine import failure).

## The corpus (`manifest.json`)

One entry per real email:

```jsonc
{
  "id": "tkt030-chaser",               // unique slug
  "file": "docs/tickets/TKT-030-.../evidence/RE 30143 - ....eml",  // repo-relative path
  "source": "ticket:TKT-030",          // "ticket:TKT-NNN" or "msg-case:CODE"
  "tracked": true,                     // false = "may be locally absent" (skip gracefully)
  "context": { "provider_match_state": "one" },   // overrides/augments file-derived fields
  "expected_v1": { "category": "query", "subtype": "query_existing_work" },
  "expected_v2": null,                 // null falls back to expected_v1 when scoring --taxonomy v2
  "rationale": "..."                   // one-line-or-more judgment note (PII-safe, see below)
}
```

Sources:

- **31 tracked `.eml`** under `docs/tickets/**` (one per misclassification/behaviour
  ticket's evidence folder, plus TKT-041's 13-email cancellation corpus).
- **1 untracked `.eml`** under `docs/tickets/TKT-053-accident-date/` (`tracked: false`
  — new/uncommitted at authoring time; the harness skips it gracefully if absent).
- **12 tracked `.msg`** under `test-cases-and-data/test-cases/` (the same real cases
  `test-cases-and-data/triage-corpus/labels.json`'s `tier_1_existing_cases` re-typed
  as synthetic `.eml` fixtures — this corpus points at the **actual** `.msg` binaries
  instead).

### `provider_match_state` — a labeling judgment call, not a derived field

`classify_email()` takes `provider_match_state` (`one` / `none` / `ambiguous`) as an
**input** — it's the flow's domain-match outcome, not something the pure classifier
computes. It cannot be derived from a raw email file, so every manifest item's
`context` sets it explicitly, based on: *is this sender's organisation a genuinely
established Collision Engineers work provider, per the domain glossary + the vendored
engine's own `providers.json` corpus* (not literally "does today's live Postgres
`work_provider.known_email_domains` contain this exact address" — that corpus has
known, documented gaps, e.g. TKT-051's `pch-ltd.com`).

One deliberate exception: **`connexus.co.uk`** is labelled `provider_match_state:
none` even though Connexus routes work for established providers (PCH, SBL) —
because Connexus is a genuine **intermediary** (ADR-0011), not itself a
`work_provider` row, and the identification fix that resolves it (an
`image_source ↔ work_provider` map) is a Phase-3 concern, not Phase 1's. The two
`.msg` PCH-via-Connexus audit cases (`A.PCH261269`, `A.PCH261272`) are the one
exception to the exception: they mirror `triage-corpus/labels.json`'s own
`provider_match_state: "one"` convention for those exact case codes, because they are
established positive/regression cases, not identification-gap probes.

### The overlay corpus (local-only, gitignored)

`test-cases-and-data/e-mail-examinations/eval-overlay.json`, when present, is merged
into the manifest at load time (same item schema as above; `file` paths are relative
to the repo root as usual). This is the landing spot for the **operator-gated live
export** of real `inbound_email` rows the Phase-1 plan describes — see
[`export-live-labels.md`](./export-live-labels.md). The path is already covered by
`.gitignore` (`test-cases-and-data/e-mail-examinations/`), so real exported content
never risks being committed.

## Taxonomy versions

- **v1** (current, live): `receiving_work | query | billing | non_actionable | other`
  categories; the subtypes `email_classifier.py` actually returns today.
- **v2** (Phase 2, not yet built): adds `case_update` and `cancellation` categories
  and an `images_received` subtype (per the plan's DDL-delta bullet). **No v2 engine
  exists yet** — running `--taxonomy v2` today scores the CURRENT v1 engine against
  the v2 expectations, which is intentionally informative (it shows 0% recall on
  `cancellation`/`case_update`, since v1 literally cannot emit them — that gap is
  exactly what Phase 2 closes). The v2 subtype name `cancellation_notice` used in
  this manifest is a **proposed placeholder** — the plan names the `cancellation`
  *category* but does not yet commit to a subtype name; treat any `expected_v2` here
  as forward-leaning documentation, not a locked spec. Re-label pass to follow once
  Phase 2's DDL + engine tag land (per the plan).

## Ground truth, not a pass/fail gate

Every `expected_v1`/`expected_v2` is the **correct** label per the owning ticket's
stated intent (or, where a ticket documents a misclassification, what the label
*should* be) — **not** necessarily what the classifier outputs today. The baseline
(`baseline-v1.json`) intentionally contains known misses:

- Several items are text-signal-invisible without Phase 2's case/ref-linking policy
  (a pure classifier cannot always distinguish "a new instruction PDF" from "a
  supplementary PDF on an already-open case").
- All of TKT-041's blunt (non-reply) cancellation/closure broadcasts land at
  `other/other` under v1 (no cancellation concept) — confirmed against the plan's
  own live-probe for one of these exact emails.
- A couple of items are flagged as **extraction-gap diagnostics** (an unusual VRM
  format, a "Claim ID" label the ref-regex doesn't recognise) — informative
  findings, not something this harness "fixes" by relabeling to match current
  behaviour.

**Do not tune the classifier to make an item pass, and do not "fix" a label just
because the classifier currently disagrees with it** — the whole point of Phase 1 is
an honest baseline before any rule change (see the plan's Verification section). If
an item's label itself looks wrong on reflection, fix the label and say why in
`rationale`.

## PII rules

The `.eml`/`.msg` files in this corpus carry **real personal data** (claimant names,
addresses, vehicle registrations, claim references). This governs every artifact this
harness produces:

1. **`manifest.json` (committed).** `rationale` describes the *shape* of a signal
   ("a labelled ref in the subject", "a chase phrase asking for the report") — it
   never quotes a verbatim subject/body sentence, a vehicle registration, a claim
   number, or a personal name. Provider/company organisation names (QDOS, AX, PCH,
   Fairway Legal, …) are not personal data and are used freely — they're the same
   business entities named throughout this repo's docs (CLAUDE.md itself). File paths
   are fine to reference verbatim — they're already-tracked filenames, not new
   exposure.
2. **`baseline-v1.json` (committed).** Deliberately minimal: `id` / `source` /
   `tracked` / expected+got `{category, subtype}` / correctness booleans /
   `confidence`. **No `signals`, no `body_vrm`, no `body_caseref`, no `body_jobref`**
   — those can carry short tokens extracted straight from the real email (an actual
   registration, an actual claim ref). `run_eval.py --baseline-out` enforces this
   redaction in code (`_redact_for_baseline`).
3. **`--json-out` (never committed).** The full per-item report, including
   `signals` (which CAN contain a `body_vrm:`/`body_caseref:`/`body_jobref:` entry —
   a short extracted token, not prose). This is for local debugging only — don't
   commit it, don't paste it into a PR description or chat, don't share it outside
   the team.
4. **Default stdout table.** Deliberately omits `signals` from the mismatch table for
   the same reason — use `--json-out` if you need that detail locally.
5. **Anyone reporting results** (a PR description, a status update, this repo's
   `docs/`) should cite **ticket IDs and filenames plus aggregate numbers only** — no
   subjects, no bodies, no addresses, mirroring the same rule this repo's tickets
   already follow for evidence folders.

## Files here

- `run_eval.py` — the scorer (see module docstring for the full CLI).
- `manifest.json` — the tracked, labelled corpus (44 items).
- `baseline-v1.json` — the v1 baseline (redacted; safe to diff in review).
- `export-live-labels.md` — operator note for the gated live-export feedback loop
  (E2; not yet built).
- `README.md` — this file.
