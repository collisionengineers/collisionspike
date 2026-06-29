# Vendored engine provenance — `cedocumentmapper_v2`

This directory is a **pinned vendored copy** of the Collision Engineers document
parser engine. It is the package the FC1 parser Function imports as
`import cedocumentmapper_v2` (the Function root `functions/parser/` is on the
worker `sys.path`, so this folder resolves as a top-level package).

**The sibling repo is the authoring source of truth. This is a re-cut copy.**
ALL engine edits land in the sibling first, then this copy is re-cut by the
documented command below — it is **never hand-edited** except for the two
intentional, recorded reconciliations described here.

> ## ⚠ OPEN — vendored copy is BEHIND the sibling (re-vendor pending)
>
> A parser fix has landed in the `cedocumentmapper_v2.0` engine-core upstream that
> has **not yet been re-vendored** into this copy, so the two have **diverged**. This
> is an **open reconciliation item**, not a clean mirror — treat the GREEN
> "RE-VENDORED" log entries below as the state **as of their dates (latest pin
> `504c3a3`, 2026-06-25)**, superseded by this note.
>
> **To close it:** re-cut from the latest **committed, pushed** sibling ref using the
> [Re-vendor procedure](#re-vendor-procedure-against-a-committed-sibling-ref) below,
> re-apply reconciliation #1 (B2) if still un-upstreamed, update the **Source** pin
> to the new SHA, and confirm `tests/test_engine_vendored_in_sync.py` is green.
>
> **Caveat:** the sibling is **not currently checked out** in this workspace, so the
> drift guard **skips** (it only runs when the sibling is reachable) — this divergence
> will **not** be caught by the local test until the sibling is cloned per the parent
> `SETUP.md`. The deployed Function is unaffected; it runs the older, self-consistent
> vendored copy until the re-vendor lands.

> ## ⚠ VENDORED-ONLY DIVERGENCE (2026-06-29) — over-promotion corroboration gate (replay into sibling pending)
>
> `rules/email_classifier.py` was edited **in this vendored copy only** to add the
> **attachment-corroboration gate** (collisionspike ADR-0015 "Update (2026-06-29)"):
> live triage was minting blank Cases because Rule 1 promoted on any
> file-extension-derived `instruction` attachment and Rule 2 promoted on a known
> provider domain alone. The sibling `cedocumentmapper_v2.0` repo was **not checked
> out** at fix time, so the engine-core authoring source was **not** updated and the
> drift guard **skipped** — this is an **un-upstreamed divergence**, NOT a clean
> mirror. The deployed `cespike-parser-dev` Function runs this copy, so the fix is
> live; the sibling must be re-synced when next reachable.
>
> **To close it:** apply the replay hunk below to
> `src/cedocumentmapper_v2/rules/email_classifier.py` in the sibling (branch
> `feat/audit-case-type-detection`), commit + push, then re-vendor this copy verbatim
> from that committed ref per the [Re-vendor procedure](#re-vendor-procedure-against-a-committed-sibling-ref)
> and confirm `tests/test_engine_vendored_in_sync.py` is green
> (`email_classifier.py` is a **shared, non-reconciled** module → must end byte-identical).
> Lock by the collisionspike Tier-2 corpus fixtures `other/instruction-doc-spam-flyer.eml`
> + `other/provider-image-no-context.eml` and the unit tests
> `test_instruction_doc_without_corroboration_abstains_to_other`,
> `test_instruction_doc_with_caseref_promotes`,
> `test_image_with_provider_and_caseref_promotes`,
> `test_image_with_provider_only_abstains_to_other`.
>
> **Replay hunk** (the two functional changes — Rule 1 new-client corroboration gate
> and Rule 2 trigger; the surrounding docstring/comment reflow is cosmetic):
>
> ```diff
> @@ Rule 1: new-client arm (was an unconditional return) @@
> -        return _result(
> -            CATEGORY_RECEIVING_WORK,
> -            SUBTYPE_NEW_CLIENT_WORK,
> -            _CONFIDENCE_GOOD,
> -            "instruction_doc_new_client",
> -        )
> +        if work_phrases or body_caseref or body_vrm:
> +            return _result(
> +                CATEGORY_RECEIVING_WORK,
> +                SUBTYPE_NEW_CLIENT_WORK,
> +                _CONFIDENCE_GOOD,
> +                "instruction_doc_new_client",
> +            )
> +        signals.append("uncorroborated_instruction_doc")
> +        # FALL THROUGH — an uncorroborated attachment is not work; let the query
> +        # rules / Rule 6 abstain handle it.
> @@ Rule 2: image trigger (provider_known dropped as a trigger; kept for subtype) @@
> -    if has_images and (provider_known or work_phrases) and not (
> +    if has_images and (work_phrases or body_caseref or body_vrm or is_audit) and not (
>          query_phrases and not work_phrases
>      ):
>          subtype = (
>              SUBTYPE_EXISTING_PROVIDER_INSTRUCTION
>              if provider_known
>              else SUBTYPE_NEW_CLIENT_WORK
>          )
>          return _result(
>              CATEGORY_RECEIVING_WORK,
>              subtype,
>              _CONFIDENCE_GOOD,
>              "images_with_work_signal",
>          )
> +    if has_images and provider_known:
> +        # Images from a known provider but with no corroborating work signal: not
> +        # promoted (see above). Flag for the deferred LLM pass; fall through.
> +        signals.append("uncorroborated_provider_image")
> ```
>
> The `classify_email` docstring decision-tree (Rule 1 / Rule 2 entries) and the
> Rule 1 / Rule 2 block comments were updated to match; replay those verbatim from
> this copy when re-syncing the sibling.

## Source

- **Sibling repo:** `collisionengineers/cedocumentmapper_v2.0`
  (`https://github.com/collisionengineers/cedocumentmapper_v2.0.git`)
- **Source path inside the sibling:** `src/cedocumentmapper_v2/`
- **Cut from:** branch `feat/audit-case-type-detection` at commit
  **`504c3a3e4ade08b911eb84f9e36504a23100aec8`** (`504c3a3`, 2026-06-25) — a
  **clean, committed, pushed** sibling ref. `504c3a3` is the earlier cut `e256760`
  PLUS the PR #24 review fixes to three engine-core files (`rules/email_classifier.py`,
  `readers/pdf.py`, `resources/eva-json.schema.json` — see the re-vendor note
  below). Only those three re-vendored files changed between `e256760` and
  `504c3a3`; every other module is byte-unchanged. `e256760` was the earlier cut
  `aecbc4b` PLUS the Phase-8 (ADR-0015) `rules/email_classifier.py` abstain-bias
  fix (Rule 0 fires on the auto-reply/bounce marker regardless of attachments;
  Rule 2 falls through to the query rules when the email is phrased as a query with
  no work phrase and no instruction doc). `aecbc4b` was itself the earlier
  engine-core cut `af98383` PLUS the original Phase-8 classifier + the work/query
  keyword tuples in `rules/engine.py`. This supersedes the earlier `e256760`,
  `aecbc4b` and `4824136` pins.

  > Re-cut policy: this copy is now a **clean-ref mirror** of the sibling's
  > engine-core at `af98383`, plus the single vendored-only B2 reconciliation
  > (#1 below). The engineer-report "audit/validate" overlay (#2) and the audit
  > case-type detector are now **committed in the sibling**, so a clean re-cut
  > brings them in naturally — no hand-patching needed for them.

> ## ✅ RE-VENDORED (2026-06-25) — PR #24 review fixes (4 engine findings) — drift guard GREEN
>
> Re-cut three engine-core files byte-identical from the sibling's committed ref
> **`504c3a3`** (branch `feat/audit-case-type-detection`) after the PR #24
> max-effort review fixes:
>
> 1. **`resources/eva-json.schema.json`** — added the optional `Claimant Telephone`
>    / `Claimant Email` property entries so `additionalProperties:false` accepts the
>    full vendored `FIELD_ORDER` output. The desktop `EVAJsonExporter.export()` path
>    validates the FIELD_ORDER-built dict against this bundled schema, which omitted
>    the ROADMAP-B2 claimant-contact keys the vendored FIELD_ORDER emits → a
>    `jsonschema.ValidationError` on every desktop export. (The cloud `/parse` route
>    is unaffected — it uses `parser_adapter`/`record_to_dict` and the separate
>    `contracts/eva-payload.schema.json`, which already lists those keys.) This is a
>    NON-`.py` file, so the `.py`-only drift walk never byte-compares it; it is kept
>    byte-identical to the sibling anyway.
> 2. **`rules/email_classifier.py`** — `CASEREF_RE` tightened to the real Case/PO
>    shape (a 2-letter Principal → exactly 5 trailing digits, a 3-5-letter Principal
>    → 5-6, optional `A.` prefix) so `AB123456`/phone/postcode/VAT tokens no longer
>    masquerade as a Case/PO; AND Rule 0's auto-reply/bounce abstain now yields to an
>    attached instruction doc (`auto_reply_markers and not has_instruction_doc`) so a
>    legitimate automated provider instruction with a "do not reply" footer still
>    reaches Rule 1. Shared, non-reconciled — byte-compared, and byte-identical.
> 3. **`readers/pdf.py`** — the OCR wall-clock timeout no longer discards pages
>    OCR'd before the cap: the `for…else` salvage was replaced with an unconditional
>    salvage that reads the `ocr_timed_out` / `ocr_page_failed` flags and combines
>    every page that DID OCR (flagged "OCR fallback (PARTIAL …)"). Shared,
>    non-reconciled — byte-compared, and byte-identical.
>
> `exporters/eva_json.py` was NOT re-vendored (only the schema it loads changed).
> Tests added/updated in collisionspike: `tests/test_eva_export.py` (calls
> `export()` on a full record incl. the claimant-contact keys), the `instruction-doc
> -with-do-not-reply-footer` Tier-2 corpus fixture + `test_instruction_doc_overrides
> _auto_reply_abstain` in `tests/test_email_classifier.py`. In the sibling:
> `tests/test_exporters.py::test_eva_json_exporter_accepts_every_field_in_field_order`
> and `tests/test_readers_isolated.py::test_pdf_ocr_timeout_salvages_pages_done_
> before_the_cap`. `test_engine_vendored_in_sync.py` is **6/6 green** (the two
> re-vendored `.py` modules pass `test_shared_unreconciled_modules_are_byte_identical`).
>
> ## ✅ RE-VENDORED (2026-06-25) — Phase-8 classifier abstain fix — drift guard GREEN
>
> `rules/email_classifier.py` re-cut byte-identical from the sibling's committed
> ref `e256760` (branch `feat/audit-case-type-detection`) after the ADR-0015
> abstain-bias fix (Rule 0 fires on the auto-reply/bounce marker regardless of
> attachments; Rule 2 falls through to the query rules for a query-phrased,
> work-phrase-free, instruction-doc-free email). It is a **non-reconciled shared
> module**, so it falls through to `test_shared_unreconciled_modules_are_byte_identical`
> and must stay byte-identical — which it is. No other vendored module changed.
> `test_engine_vendored_in_sync.py` is **6/6 green**. New collisionspike Tier-2
> corpus fixtures + unit tests lock the two collisions (see the Phase-8 plan /
> `test-cases-and-data/triage-corpus/labels.json`).
>
> ## ✅ RE-VENDORED (2026-06-24) — drift guard GREEN
>
> Re-cut from the sibling's committed ref `af98383` (branch
> `feat/audit-case-type-detection`), engine-core only. The 8 previously-drifted
> shared modules (`config/__init__.py`, `config/migration.py`,
> `detection/__init__.py`, `domain/__init__.py`, `exporters/eva_json.py`,
> `readers/doc.py`, `readers/email.py`, `readers/pdf.py`) are now **byte-identical**
> to the sibling; `test_engine_vendored_in_sync.py` is **all green**.
>
> Two genuinely-required new dependencies were vendored alongside the 8:
> `detection/case_type.py` (now imported by `detection/__init__.py`) and the
> `resources/` package (`__init__.py` + `eva-json.schema.json` only) which the
> sibling's `exporters/eva_json.py` now imports as
> `from cedocumentmapper_v2 import resources`. The desktop/dev-only surface
> (`extraction/`, `eval/`, the review GUI, `cli.py`, `ui/host.py`, the other two
> non-EVA schemas) is still **NOT** on this cloud path.
>
> Per [ADR-0018](../../../docs/adr/0018-cedocumentmapper-dual-target-vendored-engine.md):
> the re-vendor was against a committed sibling ref (not a dirty working tree),
> engine-core only. The vendored-only B2 reconciliation (#1) is still **not**
> upstreamed, so it is re-applied by hand after each re-cut — see below. Once B2
> lands in the sibling, this copy becomes a pure zero-patch mirror.

## Two intentional reconciliations (the bidirectional fork)

This copy is a **true superset** of the sibling working-tree engine. Two
deliberate divergences are baked in and must survive every re-cut:

1. **VENDORED-ONLY — ROADMAP-B2 claimant contact extraction (KEEP; live in prod).**
   Not present in the sibling. Re-apply after every re-cut:
   - `domain/models.py` — `FieldKey.CLAIMANT_TELEPHONE` / `FieldKey.CLAIMANT_EMAIL`
     enum members, their `FIELD_ORDER` entries, and their `FIELD_LABELS`.
   - `normalization/normalizers.py` — `TELEPHONE_RE`, `EMAIL_RE`,
     `normalize_telephone`, `normalize_email`; `normalization/__init__.py` re-exports.
   - `rules/engine.py` — `_fallback_telephone` / `_fallback_email` (with
     `_CLAIMANT_CONTEXT_WORDS` / `_CLAIMANT_CONTACT_LABELS`,
     `_line_has_claimant_context`, `_unique_normalized_matches`), the
     normalise-on-extract branches, and the imports of the four normalizers.

2. **SIBLING-ONLY — engineer-report "audit/validate" overlay (CONVERGED; now
   committed upstream).** As of `af98383` this overlay is **committed in the
   sibling**, so a clean re-cut brings it in naturally — nothing to re-apply by
   hand. It lives in:
   - `domain/models.py` — `ExtractedRecord.notes: tuple[str, ...] = ()`.
   - `application/service.py` — `detect_engineer_provider`,
     `overlay_records_with_overrides` (notes provenance + overrides list),
     `overlay_records` now delegating, the engineer branch in `process_document`,
     the never-overlay-onto-audit guard, and `"notes": list(record.notes)` in
     `record_to_dict`.

A third feature — the **"Image Based Assessment" inspection normalisation**
(`IMAGE_BASED_ASSESSMENT`, `_IMAGE_BASED_PHRASES`, `_is_image_based_inspection`,
`_canonical_image_based_address`) — is **CONVERGED**: present and identical in
both the sibling and this copy. Nothing to re-apply.

A fourth feature — the **audit case-type detector** (added 2026-06-23;
`_AUDIT_PHRASES`, `detect_audit_signals` in `rules/engine.py`;
`ExtractedRecord.is_audit` / `audit_signals` in `domain/models.py`;
`"is_audit"` / `"audit_signals"` in `record_to_dict`) — is likewise **CONVERGED**:
authored identically in both copies, so nothing to re-apply (the
`test_engine_vendored_in_sync` markers pin it on both sides). Content-derived,
surfaced via `parser_adapter` as the separate `audit` envelope field; **never** an
EVA field. See the `collisionspike` ADR-0014.

A fifth feature — the **Phase-8 deterministic email classifier** (added 2026-06-24;
ADR-0015) — is also **CONVERGED**:

- **`rules/email_classifier.py`** is a **NEW shared engine-core module**, authored
  **byte-identical** in both copies. It is **not** a reconciled module — it carries
  no fork — so it falls through to the byte-compare in
  `test_shared_unreconciled_modules_are_byte_identical` and must stay byte-identical
  on every re-cut (re-cut it verbatim with `git show <SHA>:src/.../rules/email_classifier.py`).
- **`rules/engine.py`** gains the `_WORK_KEYWORDS` / `_QUERY_KEYWORDS` keyword
  tuples + the `_match_keywords` helper, authored identically in both copies and
  exported for the classifier (same precision discipline as `_AUDIT_PHRASES`).
  `engine.py` stays in the reconciled set (the vendored-only B2 fork is unchanged),
  so the new tuples are pinned by **marker** on both sides, not byte-compared.

The classifier is **engine-core**, on the cloud path. Its HTTP surface — the
`POST /classify-email` route in `functions/parser/function_app.py` — is
**Function-host-only** and lives **outside** this vendored package (alongside the
`/parse` route), so it is never part of the engine byte-compare. Pure function, no
LLM / Dataverse / network; the open-Case link (Case/PO first, VRM fallback) stays
on the flow side. See the `collisionspike` ADR-0015 + the Phase-8 plan.

> `notes` is **session provenance only**. It rides at the top level of
> `record_to_dict`, never inside `fields`, so it never reaches the 12-field EVA
> payload (`parser_adapter.to_eva_extraction` builds the payload solely from
> `EVA_FIELD_ORDER` over `fields`). Treated exactly like `inspection_date` /
> `issues` — emitted natively, dropped from the EVA contract.

## Omitted modules (deliberately NOT vendored)

These pull CLI / GUI / desktop-only dependencies off the FC1 worker path and are
excluded from this copy (the engine-core stays lean):

- `cli.py` — the argparse CLI (the sibling renames its `audit` subcommand to
  `validate`; irrelevant here).
- `__main__.py` — `python -m cedocumentmapper_v2` entry point; imports `cli`.
- `ui/host.py` — the desktop/GUI host.
- `extraction/` — the opt-in extraction orchestrator + offline LLM-assist
  (desktop/dev-only). `application/service.build_orchestrator` imports it
  **lazily** (inside the method body), so omitting it does not break
  `import cedocumentmapper_v2`; only the unused orchestrated path would raise if
  ever called on the cloud worker, which the FC1 adapter never does.
- `eval/` — the eval/regression harness (desktop/dev-only).
- `resources/extraction-rule.schema.json`, `resources/provider-config.schema.json`
  — the non-EVA bundled schemas (used by the desktop authoring/migration paths).

`ui/__init__.py` and `ui/paths.py` ARE vendored (the service imports `ui.paths`
for app-data/output path helpers — both `get_documents_dir` and `get_desktop_dir`).

`detection/case_type.py` IS vendored (as of `af98383` `detection/__init__.py`
imports `audit_signal_for_reference` / `is_audit_reference` from it).

`resources/__init__.py` + `resources/eva-json.schema.json` ARE vendored: the
sibling's `exporters/eva_json.py` now does `from cedocumentmapper_v2 import
resources` and falls back to `resources.load_schema("eva-json.schema.json")`
when no explicit `schema_path` is passed. Vendoring just the EVA schema + the
loader keeps `import cedocumentmapper_v2.exporters` working OFFLINE (the package
eagerly imports `EVAJsonExporter`) with no ImportError at worker import time.

## providers.json pin

`providers.json` in this directory is the **pinned provider catalogue seed**.
The adapter pins the service to it explicitly
(`parser_adapter._VENDORED_PROVIDERS_JSON`). It is byte-identical to the
sibling's root `providers.json` at the cut (md5 `86af6421d275e3111648497050dac0d5`),
but the **vendored copy is authoritative for the deployed Function** — a re-cut
must **not** clobber it with the sibling's unless the seed has intentionally
changed. Treat a providers.json change as a deliberate, reviewed update.

## Drift guard

`functions/parser/tests/test_engine_vendored_in_sync.py` fails when this copy
drifts from the sibling source, *excluding* the two omitted modules,
`providers.json`, and the recorded B2/overlay reconciliation points. It skips
cleanly when the sibling repo is unreachable.

## Re-vendor procedure (against a COMMITTED sibling ref)

Per ADR-0018, re-cut from a **committed, pushed sibling ref** — never the
sibling's dirty working tree (that re-introduced the non-reproducible pin and
risked pulling desktop surface). Cut each engine-core file with `git show
<SHA>:...` so the source is reproducible. Do **not** mirror the whole tree
(`extraction/`, `eval/`, `cli.py`, `__main__.py`, `ui/host.py`, and the two
non-EVA schemas must stay off the cloud path).

Run from the repo root (`collisionspike/`), Git Bash. Pick the new `<SHA>`:

```bash
SHA=504c3a3   # the committed sibling ref you are cutting from
S=../cedocumentmapper_v2.0   # sibling repo
V=functions/parser/cedocumentmapper_v2

# 1. Re-cut the shared engine-core modules verbatim (NOT the reconciled set):
for f in config/__init__.py config/migration.py detection/__init__.py \
         detection/case_type.py domain/__init__.py exporters/base.py \
         exporters/eva_json.py exporters/rjs_docx.py \
         readers/__init__.py readers/base.py readers/doc.py readers/docx.py \
         readers/email.py readers/errors.py readers/pdf.py \
         detection/detector.py rules/__init__.py rules/base.py \
         rules/email_classifier.py \
         application/__init__.py ui/__init__.py ui/paths.py __init__.py; do
  ( cd "$S" && git show "$SHA:src/cedocumentmapper_v2/$f" ) > "$V/$f"
done

# 2. Vendor the EVA-schema resource package (loader + EVA schema ONLY):
mkdir -p "$V/resources"
( cd "$S" && git show "$SHA:src/cedocumentmapper_v2/resources/__init__.py" ) > "$V/resources/__init__.py"
( cd "$S" && git show "$SHA:src/cedocumentmapper_v2/resources/eva-json.schema.json" ) > "$V/resources/eva-json.schema.json"

# 3. Reconciled modules (the SUPERSET): re-cut from the sibling, THEN re-apply
#    the vendored-only B2 contact extraction (#1). The overlay (#2) and audit
#    case-type detector are now committed upstream, so they come across naturally.
for f in domain/models.py rules/engine.py application/service.py \
         normalization/__init__.py normalization/normalizers.py; do
  ( cd "$S" && git show "$SHA:src/cedocumentmapper_v2/$f" ) > "$V/$f"
done
#  -> re-apply reconciliation #1 (B2) by hand into the three files it touches:
#     domain/models.py : FieldKey.CLAIMANT_TELEPHONE / CLAIMANT_EMAIL enum
#                        members (after CLAIMANT_NAME), + their FIELD_ORDER and
#                        FIELD_LABELS entries (after the CLAIMANT_NAME entries).
#     normalization/normalizers.py : TELEPHONE_RE, EMAIL_RE, normalize_telephone,
#                        normalize_email (block before normalize_address).
#     normalization/__init__.py : re-export normalize_telephone / normalize_email.
#     rules/engine.py : import the four B2 normalizers + TELEPHONE_RE/EMAIL_RE;
#                        _fallback_telephone / _fallback_email (+ helpers
#                        _CLAIMANT_CONTEXT_WORDS / _CLAIMANT_CONTACT_LABELS /
#                        _line_has_claimant_context / _unique_normalized_matches);
#                        the FieldKey.CLAIMANT_* fallback dispatch + the
#                        normalise-on-extract branches.
#  (If B2 has been upstreamed into the sibling, skip this re-apply entirely.)

# 4. Do NOT clobber providers.json (the pinned seed — see above).
# 5. Verify (PowerShell returns exit 1 in this env — use Git Bash):
( cd functions/parser && python -m pytest -q )
```

The drift guard (`test_engine_vendored_in_sync.py`) verifies the result: the
shared non-reconciled modules must be byte-identical; the reconciled modules are
checked by marker (B2 + overlay) instead.
