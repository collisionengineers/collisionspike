# Vendored engine provenance — `cedocumentmapper_v2`

> ## ⚠ DEPLOY-ORDER WARNING (as of the `engine-v2.3` pin, 2026-07-02; still true at `engine-v2.4` / `engine-v2.5`)
>
> **This vendored tree now emits taxonomy v2** — `classify_email` can return the
> new `case_update` / `cancellation` categories (subtypes `images_received` /
> `update_general` / `cancellation_notice`) and a `taxonomy_version` field on every
> response. **Do NOT deploy the parser Function from this tree until the operator
> has applied the additive DDL delta**
> `migration/assets/schema/deltas/2026-07-02-rules-engine-v2-taxonomy.sql`
> (see [`docs/gated.md`](../../../docs/gated.md)) — the Data API / Postgres side
> must accept the new choiceset codes *before* the parser can legally emit them.
> Deploying the parser first risks the Data API rejecting (or silently
> mis-storing) a row it does not yet recognise. Deploy order: **DDL delta first,
> parser re-deploy second** — this mirrors the rules-engine-v2 plan's Phase 2
> "deploy order is part of the design" discipline.
> ([`docs/plans/rules_engine_v2_plan_9ba034c4.plan.md`](../../../docs/plans/rules_engine_v2_plan_9ba034c4.plan.md))

This directory is a **pinned vendored copy** of the Collision Engineers document
parser engine. It is the package the FC1 parser Function imports as
`import cedocumentmapper_v2` (the Function root `functions/parser/` is on the
worker `sys.path`, so this folder resolves as a top-level package).

**The sibling repo is the authoring source of truth. This is a re-cut copy.**
ALL engine edits land in the sibling first, then this copy is re-cut by the
documented command below. As of the `engine-v2.1` tag it is **never
hand-edited** — every shared file, including the bundled JSON resources, is a
byte-for-byte mirror. No reconciliation is currently outstanding.

## History (condensed)

**2026-07-03 (ADR-0021 case-type marker taxonomy + TKT-051 work-provider guard):**
two sibling commits, re-cut together. First, a **reconvergence**: the 2026-07-02/03
collisionspike classifier hardening (P1-4a/b/c ref-extraction fixes, the P1-5
new-image-evidence detector, and the 29-email-corpus phrase additions to
`triage-rules.json`) had been applied to THIS vendored copy without landing in
the sibling first — upstreamed verbatim as sibling commit `6fc03cb`, restoring
the byte-mirror. Second, the **engine-v2.6 feature work** (sibling `f474ea0`,
tagged **`engine-v2.6`**): (1) `rules/engine.py` — the layout-name
`work_provider` fallback is suppressed for `engineer_report: true` layouts, so
an attached third-party EVA/CNX report can no longer leak "EVA (Engineers)" as
the case's work provider (TKT-051); (2) the case-type marker taxonomy —
`detection/case_type.py` now reads the full marker set (`A.` audit / `AP.`
audit_total_loss / `D.` diminution), `_apply_case_type` maps all three,
`rules/email_classifier.py`'s `CASEREF_RE` accepts the widened prefix, and a
new `rules/engine.py detect_case_type_signals` derives `(case_type, dual,
signals)` from instruction text — `dual` marks the QDOS "REPORT + AUDIT
REPORT" one-letter-both-deliverables template (new `dual_report_audit_phrases`
+ review-first `diminution_phrases` collections in `triage-rules.json` +
schema + loader; `audit_total_loss` is NEVER content-inferred);
(3) `domain/models.py ExtractedRecord` gains `case_type_dual`, round-tripped by
`record_to_dict`/`record_from_dict`. Deploy-order note: the `case_type`
envelope additions are additive and the Data API consumes them behind
`AUDIT_CASES_ENABLED` (default off), so parser-first deploy is safe; the
`choice_case_type` DDL delta must be applied before the gate is flipped.

**2026-07-02 (rules-engine-v2 Phase 5 — externalized triage phrase data):** the
sibling moved the 13 flat keyword/phrase string collections used by the email
classifier (`rules/engine.py`'s `_AUDIT_PHRASES` / `_WORK_KEYWORDS` /
`_BILLING_KEYWORDS` / `_INFORMAL_WORK_KEYWORDS` / `_QUERY_KEYWORDS` /
`_CHASE_PHRASES` / `_SUMMARY_MARKERS` / `_CANCELLATION_PHRASES`;
`rules/email_classifier.py`'s `_AUTO_REPLY_MARKERS` / `_VRM_STOPWORD_TRIGRAMS`)
and content-based attachment typing (`detection/attachment_typing.py`'s
`_REPORT_TITLE_PHRASES` / `_REPORT_STRUCTURE_PHRASES` / `_JUNK_PHRASES`) out of
Python literals into a new schema-validated bundled resource,
`resources/triage-rules.json` (schema: `resources/triage-rules.schema.json`,
pattern: `provider-config.schema.json`), loaded by a new
`rules/triage_rules.py` (`importlib.resources` + `jsonschema.validate` on
every load, module-level cached). The three consumer modules now assign their
existing constant NAMES from the loader (e.g. `_WORK_KEYWORDS =
_RULES.work_keywords`) instead of defining tuple/frozenset literals, so every
import-site elsewhere is untouched. Regexes, rule ordering, confidence bands
and suppression logic are all unchanged, still Python — this is a pure,
zero-classification-behaviour-change data move (the sibling's + this repo's
classifier/attachment-typing test suites are unchanged and stayed green
throughout, proving parity). Runtime schema validation now runs on THIS
(the cloud/FC1) path too, not just desktop/test tooling — a typo'd or emptied
phrase collection fails loud at import time instead of silently degrading a
rule. Tagged **`engine-v2.5`**; this copy adds `rules/triage_rules.py` and the
two new `resources/*.json` files to the vendored set (both already covered by
the drift guard's dynamic `rglob("*.py")` / `resources/*.json` globs — no test
changes needed) and re-cuts the three modified modules verbatim; diff-verified
to touch only these six files, nothing else.

**2026-07-02 (rules-engine-v2 Phase 3 — content-based attachment typing):** the
sibling added `detection/attachment_typing.py` — a pure `type_document_text(text,
catalog)` that types a document's already-extracted text as
`instruction`/`report`/`junk`/`unknown` BY CONTENT (never filename/extension),
reusing `ProviderDetector` (provider `detect_phrases`) and
`rules.engine._WORK_KEYWORDS` rather than duplicating either — see that module's
own docstring for the full precedence rules (report checked before instruction;
a corroboration gate mirroring `classify_email` Rule 1's discipline). Re-exported
from `detection/__init__.py` alongside the package's existing exports — the one
non-additive line this re-cut touches. Tagged **`engine-v2.4`**; this copy is cut
from it, diff-verified against the prior `engine-v2.3` pin to touch only that
export line plus the new module, nothing else. The parser's `/parse` route now
surfaces the result as an additive, unconditional `content_typing` response
field (no feature gate — see `parser_adapter.py` / `function_app.py` and
`openapi/parser-connector.json`'s new `ContentTyping` definition).

Known limitation, NOT solved here (tracked as a rules-engine-v2 Phase-3
follow-up, not this slice): the collisionspike email-intake pipeline classifies
the EMAIL (orchestration step 1.5, `classifyInbound.ts`) *before* it parses any
attached document (`/parse` runs at step 4), so `content_typing` cannot yet feed
`classify_email`'s Rule 1 instruction-doc corroboration gate pre-classify — that
would need a pipeline reorder (e.g. parse-before-classify, or a second
post-parse classify pass) which is out of scope for this Phase-3 slice. Today
`content_typing` is a `/parse`-time RESPONSE field only, ready for a downstream
resolve/identification layer or telemetry pipeline to consume — see
[`docs/plans/rules_engine_v2_plan_9ba034c4.plan.md`](../../../docs/plans/rules_engine_v2_plan_9ba034c4.plan.md)
Phase 3.

**2026-07-02 (rules-engine-v2 Phase 2 — taxonomy v2):** the sibling added two
additive top-level categories to the email classifier — `case_update`
(`images_received` / `update_general` subtypes; TKT-034/043) and `cancellation`
(`cancellation_notice` subtype; TKT-041, highest precedence — checked before the
instruction-doc promotion) — plus a `taxonomy_version` response field. First
tagged `engine-v2.2`; the vendored consumer's own ticket-eval test caught a real
regression before this reached anywhere downstream (the real TKT-038 "Thanks Ed"
email, whose embedded signature images were being read as `case_update` evidence
instead of staying `non_actionable/acknowledgement`), fixed on the sibling by
excluding bare-acknowledgement replies from `case_update`, and re-tagged
**`engine-v2.3`** (`engine-v2.2` is left in the sibling's history as a real
point-in-time snapshot but must not be re-cut from). This copy is cut from
`engine-v2.3`. See the DEPLOY-ORDER WARNING at the top of this file before
redeploying the parser Function from this tree.

Earlier cuts (2026-06-23 through 2026-07-01) went through several rounds of
drift and reconciliation, pinned in turn to `4824136`, `af98383`, `e256760`,
and `504c3a3` on the sibling's `feat/audit-case-type-detection` branch. At each
of those points the vendored copy carried at least one **vendored-only**
divergence (code authored here first, not yet upstreamed) — most recently the
ROADMAP-B2 claimant-contact extraction (`FieldKey.CLAIMANT_TELEPHONE` /
`CLAIMANT_EMAIL`, their normalizers, and the `eva-json.schema.json` properties
they need) — while earlier ones (the engineer-report "audit/validate" overlay,
the "Image Based Assessment" normalisation, the audit case-type detector, and
the Phase-8 deterministic email classifier) were converged one by one as they
landed in the sibling.

**2026-07-02 (rules-engine-v2 Phase 0):** the sibling's PR #4 (intake
classifier + reader/engine work) merged to `main`; PR #5 closed as a strict
subset of PR #4; the last outstanding divergence — ROADMAP-B2 — was upstreamed
into the sibling (`domain/models.py`, `normalization/__init__.py`,
`normalization/normalizers.py`, `rules/engine.py`, and the
`eva-json.schema.json` claimant properties, copied byte-for-byte from this
vendored copy, which was the authoring source); and the sibling tagged its
**first engine release, `engine-v2.1`**. This copy was then re-cut verbatim
from that tag. Per [ADR-0018](../../../docs/adr/0018-cedocumentmapper-dual-target-vendored-engine.md)
Decision 3, the re-cut is now a **true, zero-patch mirror**: every shared file
(all `.py` modules plus the bundled `resources/*.json`) is byte-identical to
the sibling, verified by `tests/test_engine_vendored_in_sync.py`.

One fix landed **in this consolidation, on the sibling first**, then flowed
back through the mirror: `application/service.py`'s provider-catalog seed
loading conflated "an explicit `app_data_dir` was passed" with "always reload
the fresh vendored seed, ignoring any on-disk catalog" — correct for this
Function's pinned-seed need, but it silently broke the sibling CLI's
`--app-data-dir` override (9 sibling tests). Fixed by decoupling the two into
an explicit `always_reload_seed` parameter (default preserves this Function's
existing behaviour); see the sibling's `fix(service):` commit on
`feat/intake-classifier-2026-06-29`. This copy already carries the result —
nothing further to do here.

## Source

- **Sibling repo:** `collisionengineers/cedocumentmapper_v2.0`
  (`https://github.com/collisionengineers/cedocumentmapper_v2.0.git`)
- **Source path inside the sibling:** `src/cedocumentmapper_v2/` (except
  `providers.json`, which lives at the sibling repo root)
- **Cut from:** annotated tag **`engine-v2.5`** on `main`, commit
  **`af1737f5c1084a96b4c72d3a914d10290a23d2d7`** (2026-07-02) — externalized
  triage phrase data (`resources/triage-rules.json` + `.schema.json`,
  `rules/triage_rules.py`; rules-engine-v2 Phase 5; see History above). Prior
  pins: `engine-v2.4` (commit `fbf6ddbea5b14a678de71af0a4fcd4e09fc6f1a6`,
  content-based attachment typing), `engine-v2.3` (commit
  `accddc57580723e8d2387633b8a30672d7d2a4ca`, taxonomy v2 — `case_update` +
  `cancellation`, corrected; supersedes the short-lived `engine-v2.2`, commit
  `6e3cb183a46169f45f4ef2a4507535322c673e7c`, which carried the TKT-038
  regression), `engine-v2.1` (commit `a9f788715eb27e56a63c8b8bda66b2b04bdf9aef`,
  the sibling's first tagged engine release), and the working-branch pins it
  superseded (`4824136`, `af98383`, `e256760`, `504c3a3`).

## Reconciliations: none outstanding

As of `engine-v2.1` (and unchanged through `engine-v2.5`) this copy is a **pure
mirror** — no vendored-only or sibling-only divergence remains. `RECONCILED_MODULES` in
`tests/test_engine_vendored_in_sync.py` is empty, and every shared file
(all `.py` modules plus `resources/*.json`) is byte-compared with no
exceptions. The `engine-v2.5` re-cut added three new shared files
(`rules/triage_rules.py`, `resources/triage-rules.json`,
`resources/triage-rules.schema.json`) — the drift guard's file lists are
dynamic (`VENDORED_ROOT.rglob("*.py")` / `resources/*.json`), so all three
were covered automatically with no test-file changes needed.

The test file keeps its marker-based mechanism (`_VENDORED_MARKERS` /
`_SIBLING_MARKERS`, currently empty dicts) ready for reuse: the next time an
engine-core fix must land here before it can be upstreamed (as B2 and, before
it, the classifier's 2026-06-29 corroboration-gate fix both did), add the file
to `RECONCILED_MODULES`, populate the markers, and record it in this section —
then collapse it back to "none outstanding" once the sibling re-syncs.

## Omitted modules (deliberately NOT vendored)

These pull CLI / GUI / desktop-only dependencies off the FC1 worker path and are
excluded from this copy (the engine-core stays lean):

- `cli.py` — the argparse CLI.
- `__main__.py` — `python -m cedocumentmapper_v2` entry point; imports `cli`.
- `ui/host.py` — the desktop/GUI host.
- `extraction/` — the opt-in extraction orchestrator + offline LLM-assist
  (desktop/dev-only). `application/service.build_orchestrator` imports it
  **lazily** (inside the method body), so omitting it does not break
  `import cedocumentmapper_v2`; only the unused orchestrated path would raise if
  ever called on the cloud worker, which the FC1 adapter never does.
- `eval/` — the eval/regression harness (desktop/dev-only).
- `resources/extraction-rule.schema.json`, `resources/provider-config.schema.json`
  — the non-EVA bundled schemas (used by the desktop authoring/migration paths
  only — validated by `cli.py`, never imported by an engine-core module).

`ui/__init__.py` and `ui/paths.py` ARE vendored (the service imports `ui.paths`
for app-data/output path helpers — both `get_documents_dir` and `get_desktop_dir`).

`detection/case_type.py` IS vendored (`detection/__init__.py` imports
`audit_signal_for_reference` / `is_audit_reference` from it).

`resources/__init__.py` + `resources/eva-json.schema.json` ARE vendored: the
sibling's `exporters/eva_json.py` does `from cedocumentmapper_v2 import
resources` and falls back to `resources.load_schema("eva-json.schema.json")`
when no explicit `schema_path` is passed. Vendoring just the EVA schema + the
loader keeps `import cedocumentmapper_v2.exporters` working OFFLINE (the package
eagerly imports `EVAJsonExporter`) with no ImportError at worker import time.

## providers.json pin

`providers.json` in this directory is the **pinned provider catalogue seed**.
The adapter pins the service to it explicitly
(`parser_adapter._VENDORED_PROVIDERS_JSON`). It is byte-identical to the
sibling's root `providers.json` at the cut, but the **vendored copy is
authoritative for the deployed Function** — a re-cut must **not** clobber it
with the sibling's unless the seed has intentionally changed. Treat a
providers.json change as a deliberate, reviewed update (it is excluded from
the drift guard's byte-compare for exactly this reason).

## Drift guard

`functions/parser/tests/test_engine_vendored_in_sync.py` fails when this copy
drifts from the sibling source, *excluding* only the omitted modules and
`providers.json` (both above). Every other shared file — every `.py` module
AND the bundled `resources/*.json` — is byte-compared with no exceptions. It
skips cleanly when the sibling repo is unreachable.

## Re-vendor procedure (against a COMMITTED sibling ref)

Per ADR-0018, re-cut from a **committed, pushed sibling ref** — never the
sibling's dirty working tree. Now that no reconciliation is outstanding, this
is a **pure mirror**: cut every shared file verbatim, in one pass, with no
hand-patch step. Do **not** mirror the whole sibling tree — `extraction/`,
`eval/`, `cli.py`, `__main__.py`, `ui/host.py`, and the two non-EVA schemas
must stay off the cloud path (see "Omitted modules" above).

Run from the repo root (`collisionspike/`), Git Bash / bash:

```bash
REF=engine-v2.5   # the committed, tagged sibling ref you are cutting from
S=../cedocumentmapper_v2.0   # sibling repo
V=functions/parser/cedocumentmapper_v2

# 1. Re-cut every shared .py module verbatim (PROVENANCE.md is the only
#    tracked file in $V excluded from this mirror):
for f in __init__.py \
         application/__init__.py application/service.py \
         config/__init__.py config/migration.py \
         detection/__init__.py detection/case_type.py detection/detector.py \
         detection/attachment_typing.py \
         domain/__init__.py domain/models.py \
         exporters/__init__.py exporters/base.py exporters/eva_json.py exporters/rjs_docx.py \
         normalization/__init__.py normalization/normalizers.py \
         readers/__init__.py readers/base.py readers/doc.py readers/docx.py \
         readers/email.py readers/errors.py readers/pdf.py \
         rules/__init__.py rules/base.py rules/email_classifier.py rules/engine.py \
         rules/triage_rules.py \
         ui/__init__.py ui/paths.py; do
  ( cd "$S" && git show "$REF:src/cedocumentmapper_v2/$f" ) > "$V/$f"
done

# 2. Re-cut the bundled JSON resources verbatim (closes the prior "only *.py
#    is byte-compared" blind spot -- the drift guard now checks these too).
#    triage-rules.json/.schema.json (rules-engine-v2 Phase 5, engine-v2.5+)
#    are the data + schema rules/triage_rules.py (above) loads:
( cd "$S" && git show "$REF:src/cedocumentmapper_v2/resources/__init__.py" ) > "$V/resources/__init__.py"
( cd "$S" && git show "$REF:src/cedocumentmapper_v2/resources/eva-json.schema.json" ) > "$V/resources/eva-json.schema.json"
( cd "$S" && git show "$REF:src/cedocumentmapper_v2/resources/triage-rules.json" ) > "$V/resources/triage-rules.json"
( cd "$S" && git show "$REF:src/cedocumentmapper_v2/resources/triage-rules.schema.json" ) > "$V/resources/triage-rules.schema.json"

# 3. Do NOT clobber providers.json (the pinned seed -- see above). Note it
#    lives at the SIBLING REPO ROOT, not under src/cedocumentmapper_v2/:
#    ( cd "$S" && git show "$REF:providers.json" ) > "$V/providers.json"
#    -- only run this line for a deliberate, reviewed seed update.

# 4. Verify:
( cd functions/parser && python -m pytest -q )
```

The drift guard (`test_engine_vendored_in_sync.py`) verifies the result: every
shared file must now be byte-identical (`git -C $S diff --stat` against the
ref should show nothing beyond what you intended to change). If it isn't,
STOP and reconcile before committing — see "Reconciliations" above for the
pattern to use if a genuine new divergence is unavoidable.
