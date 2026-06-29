---
name: ccc-scaffold-tooling
description: "How to safely change docs/plans structure, regenerate the source manifest, and why not to run the scaffold generators' main()"
metadata: 
  node_type: memory
  type: project
  originSessionId: ec0f13f7-be83-463c-92d5-90d309cf6bad
---

The CCC repo's docs structure is tool-generated and tool-verified. Gotchas (learned 2026-05-29):

- `tools/verify_scaffold.py` hardcodes exact paths (`REQUIRED_PATHS`, `PLANNED_WORKSPACE_TERMS`) and requires `docs/source_manifest.{md,csv,json}` to exactly equal `git ls-files` (no stale, no missing). Any new/moved file breaks it until the manifest is regenerated.
- **Two generators both write the canonical docs and are already out of sync with the on-disk folders:** `tools/scaffold_initial_repo.py` (bootstrap; writes the older "planned workspaces" `_index.md`/`repo_map.json`/`roadmap.md`) and `tools/generate_plan_workspaces.py` (the v2 expansion). The actual workspace folders exist on disk but `_index.md`/`repo_map.json` reflect the older bootstrap content. **Do NOT run either script's `main()`** — it clobbers the other's files. Hand-edit canonical docs additively instead.
- Regenerate the manifest in isolation (safe; `main()` is `__main__`-guarded): `python -c "import tools.scaffold_initial_repo as s; s.write_manifest(s.build_manifest())"`, then `python tools/verify_scaffold.py`.
- `verify_scaffold` also fails any `docs/plans/**/*.md` (and README/AGENTS/architecture/contracts/security/roadmap) line mentioning "personal injury"/"kadoe" unless the same line has an allowed out-of-scope marker (e.g. "out of scope", "no personal injury", "must not").
- `pytest` and the parser runtime deps (PyMuPDF, pdfplumber, extract-msg, etc.) are NOT installed in the shell interpreter `C:\Python314`; `verify_scaffold.py` does run (it imports ParserCore and asserts 26 presets). See [[ccc-plans-restructure]].
