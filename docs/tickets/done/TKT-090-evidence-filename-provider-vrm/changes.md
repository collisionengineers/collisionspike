# Changes — TKT-090: Evidence filenames carry a wrong RJS provider prefix and UnknownVRM

## Status
now — naming fix code-complete + offline-tested (engine `engine-v2.11`, re-vendored); NOT yet
deployed (deploy + live sweep owned by the dispatching session).

## Commits
- Sibling `cedocumentmapper_v2.0`: `4cbf19a` — feat(images): drop RJS/UnknownVRM naming defaults +
  large-banner decorative heuristic (tag **`engine-v2.11`**, branch
  `feat/tkt043-open-case-ref-context`). Shared with TKT-089.
- (no collisionspike commits yet — this wave's edits are uncommitted on `feat/lifecycle-wave`)

## Files touched
- sibling `src/cedocumentmapper_v2/application/service.py` (+ new sibling
  `tests/test_extract_images.py`)
- `services/functions/parser/cedocumentmapper_v2/application/service.py` (re-vendor mirror of the above)
- `services/functions/parser/cedocumentmapper_v2/PROVENANCE.md` (pin → `engine-v2.11`)
- `services/functions/parser/tests/test_extract_images.py` (mirrored naming test)

## Summary

**Root cause (located exactly):** the engine's `extract_images` built its stem as
`f"{safe_filename(fields.get('work_provider', 'RJS'))}_{safe_filename(fields.get('vrm', '') or 'UnknownVRM')}"`
— a hardcoded `'RJS'` provider default and a literal `'UnknownVRM'` placeholder. The cloud wrapper
(`services/functions/parser/parser_adapter.py run_image_extraction`) calls it with **`fields={}`** (its own
comment wrongly assumed "the engine uses generic stems"), so **every** live extraction was branded
`RJS_UnknownVRM_img_<page>_<n>` regardless of the case's actual provider/VRM. The orchestration's
`extractImages` activity then prepends `<source-doc-stem>__`, producing exactly the operator's
`LtrtoEngineerIn__RJS_UnknownVRM_img_1_1.png`.

**Fix (ADR-0018 sibling-first, engine `engine-v2.11`):** unresolved/empty tokens are now **omitted**
— no substitute token. Stem = `<provider>_<vrm>_img_<page>_<n>` with each of the first two tokens
present only when resolved; with both unresolved (the live cloud shape) the name is just
`img_<page>_<n>.<ext>` (the caller's source-doc prefix keeps it meaningful; the `_img_<page>_<n>`
tail keeps it non-empty + unique). Empty/whitespace checks run BEFORE `safe_filename`, whose own
empty-input fallback is `"export"` (would otherwise have produced `export_export_img_1_1`). Applied
to all three save paths (PyMuPDF, pypdf fallback, DOCX media) via a shared `image_stem` helper.

**Tests:** sibling naming matrix (resolved+resolved → `QDOS_AB12CDE_img_1_1`; resolved provider +
unknown VRM → `QDOS_img_1_1`; unknown provider + resolved VRM → `AB12CDE_img_1_1`; both unknown +
whitespace-only variants → `img_1_1`), a no-`RJS`/no-`UnknownVRM` literal guard, and a
two-image uniqueness test. Mirrored wrapper test asserts the `fields={}` path yields
`img_<page>_<n>.<ext>` with no placeholder identity. Sibling suite 396 passed / 4 skipped; wrapper
file 13 passed; full parser suite 278 passed / 11 skipped / 1 failed (known-environmental
`test_multiformat_extraction[ALS_doc]`, pre-existing). Drift guard green; `verify-all.mjs` at the
known baseline.

**Downstream filename-consumer sweep (required by the fix):** grep across engine + parser wrapper +
orchestration + api + SPA for `_img_\d+_\d+` parsing or `__`-splitting found **no code consumer that
parses these names** — evidence rows dedup on `(case_id, storage_path)`, `extractImages.ts` only
CONCATENATES (`<source-doc-stem>__<engine filename>`), and role/classification never keys on the
filename shape. The format change is deploy-safe. Only ad-hoc KQL/SQL sweep patterns that grep for
`RJS_UnknownVRM` (e.g. TKT-089's verification queries) need updating for post-deploy rows.

**Surfaces investigated and deliberately left unchanged** (different, desktop-only surfaces — not
handler-facing, never flow to Box):
- `service.py create_output_subfolder_from_fields` — `UnknownProvider`/`UnknownVRM` in the DESKTOP
  output-folder name (`<timestamp>_<provider>_<vrm>`); the cloud path always passes `out_dir`.
- `service.py _output_path` — `UnknownVRM` in the desktop GUI/CLI `export_json`/`export_docx` file
  names; the parser Function never calls these.
- `providers.json` / `_seed_providers_file` — "RJS"/"RJS Solicitors" there is a genuine provider
  catalogue entry, not a naming default.

Remaining (dispatcher-owned): parser Function deploy; live re-parse of the sample class showing
correct names in evidence + Box; the post-deploy zero-`RJS_UnknownVRM` sweep; the rename-or-leave
decision for EXISTING badly-named evidence/Box files (not acted on here — Box renames must respect
the one-way-mirror rules). NOTE: sibling `engine-v2.11` commit + tag are LOCAL — push before relying
on the ref in CI.

## Update — 2026-07-09 (PLAN-003 lifecycle wave: deploy + rename-or-leave decision)

- **Deployed live:** parser republished at sibling tag `engine-v2.11` — the hardcoded `'RJS'`
  default + literal `'UnknownVRM'` are gone from the extraction naming (unresolved tokens are
  omitted; stems stay unique/Box-safe).
- **Live scale of the prior mislabel (Postgres audit):** **5,693** evidence rows carry
  `RJS_UnknownVRM` names (3,547 created since 2026-07-04 alone — every PDF/DOCX extraction since
  the parser went live).
- **Rename-or-leave decision (recorded): LEAVE.** Renaming 5,693 evidence rows would desynchronise
  them from their already-mirrored Box file names, and Box renames are outside the one-way-mirror
  rules (ADR-0012/0017) — the wave's hard rules also forbid Box mutations. The names are
  misleading labels, not broken linkage; new extractions are clean from this deploy forward. If
  the operator wants the backlog relabelled, that is a separate opt-in data pass (evidence-row
  `file_name` only, Box names left as-is) — raise as a follow-up ticket if desired.
- Post-deploy sweep (zero NEW `RJS_UnknownVRM` rows) is verify-stage.
