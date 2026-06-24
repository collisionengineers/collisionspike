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
- **Cut from:** `main` at commit **`48241361549df74c5a03c355446131abfb282a65`**
  ("Add ACSP fixtures; update provider & rule schemas", 2026-06-01) **plus the
  sibling's uncommitted working-tree as of 2026-06-23**.

  > The sibling working tree was **dirty** at the cut. The engineer-report
  > "audit/validate" overlay (see below) was uncommitted in
  > `application/service.py`, `domain/models.py`, and `rules/engine.py`. This
  > copy was cut from that **working-tree state**, not from a clean tag. When the
  > sibling commits that overlay, re-cut and update this SHA.

> ## ⚠️ RE-VENDOR PENDING (2026-06-24) — drift guard is RED
>
> The sibling has advanced well past this cut on branch `feat/audit-case-type-detection`
> (committed HEAD now `ec89cc0` — advanced past `f818758` since this cut — *plus* further uncommitted work: extraction orchestrator,
> offline LLM-assist, eval harness, frontend rework). `test_engine_vendored_in_sync.py`
> currently **fails** for 8 shared engine-core modules (`config/__init__.py`,
> `config/migration.py`, `detection/__init__.py`, `domain/__init__.py`,
> `exporters/eva_json.py`, `readers/doc.py`, `readers/email.py`, `readers/pdf.py`).
>
> **Do not simply re-run the rsync command below against the sibling's working tree** — that
> re-introduces the non-reproducible-pin problem and could pull desktop/dev-only surface
> (`extraction/`, `eval/`, LLM-assist, the GUI) onto the cloud path. Per
> [ADR-0018](../../../docs/adr/0018-cedocumentmapper-dual-target-vendored-engine.md), the re-vendor
> must be against a **committed, tagged sibling ref** (engine-core only), and the vendored-only **B2
> reconciliation should be upstreamed** so the re-cut becomes a pure mirror with zero hand-patching.

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

2. **SIBLING-ONLY — engineer-report "audit/validate" overlay (BROUGHT IN).**
   From the sibling's uncommitted working tree:
   - `domain/models.py` — `ExtractedRecord.notes: tuple[str, ...] = ()`.
   - `application/service.py` — `detect_engineer_provider`,
     `overlay_records_with_overrides` (notes provenance + overrides list),
     `overlay_records` now delegating, the engineer branch in `process_document`,
     and `"notes": list(record.notes)` in `record_to_dict`.

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

> `notes` is **session provenance only**. It rides at the top level of
> `record_to_dict`, never inside `fields`, so it never reaches the 12-field EVA
> payload (`parser_adapter.to_eva_extraction` builds the payload solely from
> `EVA_FIELD_ORDER` over `fields`). Treated exactly like `inspection_date` /
> `issues` — emitted natively, dropped from the EVA contract.

## Omitted modules (deliberately NOT vendored)

These pull CLI / GUI / Windows dependencies off the FC1 worker path and are
excluded from this copy:

- `cli.py` — the argparse CLI (the sibling renames its `audit` subcommand to
  `validate`; irrelevant here).
- `ui/host.py` — the desktop/GUI host.

`ui/__init__.py` and `ui/paths.py` ARE vendored (the service imports
`ui.paths` for app-data/output path helpers).

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

## Re-vendor command

Run from the repo root (`collisionspike/`). Mirrors `src/cedocumentmapper_v2/`
from the sibling, preserves the two omissions and the providers.json pin, then
re-applies the B2 + overlay reconciliations (the drift guard verifies the result):

```bash
rsync -a --delete \
  --exclude 'cli.py' --exclude 'ui/host.py' \
  --exclude 'providers.json' --exclude '__pycache__/' --exclude 'PROVENANCE.md' \
  ../cedocumentmapper_v2.0/src/cedocumentmapper_v2/ \
  functions/parser/cedocumentmapper_v2/
# then re-apply the B2 contact extraction (reconciliation #1) and confirm the
# overlay (#2) came across, and run:
python -m pytest functions/parser/tests -q
```

(`rsync` is available under Git Bash on this Windows host. If absent, copy the
tree with `robocopy`/`cp -r` and apply the same excludes by hand.)
