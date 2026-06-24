# Vendored engine provenance — `cedocumentmapper_v2`

This directory is a **pinned vendored copy** of the Collision Engineers document
parser engine. It is the package the FC1 parser Function imports as
`import cedocumentmapper_v2` (the Function root `functions/parser/` is on the
worker `sys.path`, so this folder resolves as a top-level package).

**The sibling repo is the authoring source of truth. This is a re-cut copy.**
ALL engine edits land in the sibling first, then this copy is re-cut by the
documented command below — it is **never hand-edited** except for the two
intentional, recorded reconciliations described here.

## Source

- **Sibling repo:** `collisionengineers/cedocumentmapper_v2.0`
  (`https://github.com/collisionengineers/cedocumentmapper_v2.0.git`)
- **Source path inside the sibling:** `src/cedocumentmapper_v2/`
- **Cut from:** branch `feat/audit-case-type-detection` at commit
  **`aecbc4bf3050077c53606df904704e63ea45cae1`** (`aecbc4b`, 2026-06-24) — a
  **clean, committed, pushed** sibling ref. `aecbc4b` is the earlier engine-core cut
  `af98383` PLUS the Phase-8 `rules/email_classifier.py` + the work/query keyword tuples in
  `rules/engine.py`; the 8 re-vendored modules are byte-unchanged between `af98383` and `aecbc4b`.
  This supersedes the earlier `4824136` + dirty-working-tree pin.

  > Re-cut policy: this copy is now a **clean-ref mirror** of the sibling's
  > engine-core at `af98383`, plus the single vendored-only B2 reconciliation
  > (#1 below). The engineer-report "audit/validate" overlay (#2) and the audit
  > case-type detector are now **committed in the sibling**, so a clean re-cut
  > brings them in naturally — no hand-patching needed for them.

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
SHA=aecbc4b   # the committed sibling ref you are cutting from
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
