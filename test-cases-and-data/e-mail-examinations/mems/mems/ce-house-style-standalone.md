---
name: ce-house-style-standalone
description: ce-house-style is being rebuilt as a standalone Claude Desktop document-generation skill (docx+pdf); key engine/design decisions.
metadata: 
  node_type: memory
  type: project
  originSessionId: 5ed5db97-febd-4fc4-b3d0-e4f315c9435a
---

`src/skills/ce-house-style` is being made a **fully self-contained** skill that runs on
**Claude Desktop** to generate Collision Engineers branded **DOCX and PDF** documents for general
document creation (not just valuation). Approved 2026-06-01.

Locked decisions:
- **Engine ported & generalised** from `tools/vehicle-valuation/_pdf_common.py` into the skill's own
  `scripts/`. Scope is *only* the ce-house-style folder — `tools/vehicle-valuation/` and other skills
  are left untouched, so the engine is intentionally duplicated (standalone overrides "no two copies"
  for the engine; content de-dup still applies).
- **Input = JSON block-spec only** (no markdown front-end — Claude translates source material itself).
- **PDF = ReportLab only** (pure Python, no system libs, works on any Desktop machine). DOCX = python-docx.
  WeasyPrint/HTML path NOT used here; the `.j2` templates + `styles.css` stay only because
  vehicle-valuation still uses them.
- **Presets = Formal report + Letter/response** (generic block composer underlies both). No fee-note preset.
- **No `.doc/.docx` inside the skill** — convert to `.md` (temp query-responses doc → `references/query-responses.md`;
  tone profile docx folded into `references/writing-tone.md`).
- Added a deterministic `scripts/check_house_style.py` linter (AI tell-tales + internal workflow terms).
- Eval: full skill-creator benchmark loop (baseline = pre-edit snapshot). See [[ccc-reference-data-skills]].

Block model: meta (title/subtitle/our_ref/your_ref/date/footer/body_class) + ordered blocks
(intro, heading, paragraph, bullets, table, keyvalue, callout/value_box, image). Plan file:
`C:\Users\Alex\.claude\plans\task-is-scoped-only-wise-matsumoto.md`.

**Status (2026-06-01): built, self-verified, packaged, and committed (not pushed).** On branch
`ce-house-style-standalone`, commit 99fea35 (17 files). Packaged `.skill` (uses skill-creator's
`package_skill.py`, which needs `pyyaml` — now installed) at
`C:\Users\Alex\.claude\skill-packages\ce-house-style.skill`. Note: the YAML `description` must be
single-quoted because it contains `Modes:` (colon-space) — strict YAML in the packager rejected the
unquoted form (sibling skills share this latent issue but Claude Code's loader tolerates it). Delivered
`scripts/{_brand,_pdf_render,_docx_render,ce_document,check_house_style}.py`, `requirements.txt`,
`assets/examples/{report,letter}.json`, `references/{document-spec,query-responses}.md`, enriched
`writing-tone.md`, updated `visual-layout.md` + `SKILL.md`; deleted both `.docx` + `temp/`. Both
presets render on-brand to docx+pdf; linter works. Eval loop skipped by user (baseline trivially
lopsided). **Manifest gotcha:** `verify_scaffold` checks path-parity/existence only; a full
`build_manifest()` regen churns ~43 unrelated rows because HEAD recorded CRLF hashes while this
checkout is LF, and docx `extraction_method` flips once python-docx is installed — so splice
HEAD records + only the changed paths instead of full regen. See [[ccc-scaffold-tooling]].
