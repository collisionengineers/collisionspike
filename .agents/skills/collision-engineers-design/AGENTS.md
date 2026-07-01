# AGENTS.md — collision-engineers-design (dev wrapper)

Guidance for AI agents and developers maintaining the **collision-engineers-design** skill.

## What this is

The **foundation visual-design skill** for Collision Engineers — the single source of truth
for brand colours, typography, spacing, iconography, brand assets, and the component/letterhead
libraries used by every client-facing output. It is a *reference authority*: document skills
read it for layout; it produces no documents itself.

> Renamed from `ce-design-system` so the folder matches the `SKILL.md` `name:` field
> (`collision-engineers-design`). Cross-skill references were updated accordingly.

## Layout (wrapper vs upload)

```
collision-engineers-design-dev/        <- this dev shell — NEVER uploaded
  AGENTS.md                            <- this file
  README.md                            <- human overview (relocated from inside the skill)
  WRITING.md                           <- archive; authoritative voice lives in ce-house-style
  collision-engineers-design/          <- the CLEAN skill = exactly what ships to cowork/Desktop
    SKILL.md
    colors_and_type.css                <- design tokens; load first in any HTML/CSS
    fonts/  assets/  preview/  ui_kits/  references/
```

Only the inner `collision-engineers-design/` folder is packaged into `dist/` and uploaded.
The wrapper docs stay in-repo.

## What's editable vs frozen

- **Editable:** tokens (`colors_and_type.css`), references, UI kits, preview specimens.
- **Frozen by convention:** the master logo (`assets/logo_no_margin.png`, the red gear-"C") —
  never redraw the gear. Two official surfaces only (website red `#DB0816`; documents red
  `#C80A32`). Lucide icons only on web; no emoji.

## Dependencies

- **Writing/voice** is NOT handled here — it lives in `ce-house-style`. Keep this skill
  visual-only.
- Consumed by the document skills (`diminution-rebuttal`, `vehicle-valuation`,
  `roadworthy-report`) for letterhead/layout via `references/document-letterhead.md`.

## Path conventions

Paths inside `SKILL.md`/`references/` are relative to the skill root (the inner
`collision-engineers-design/` folder). Do not hardcode repo-rooted or absolute paths.

## Shipping

`dev-scripts/build-dist.mjs` copies `collision-engineers-design/` -> `dist/collision-engineers/skills/collision-engineers-design/`.
Status: production-ready.
