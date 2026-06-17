---
name: collision-engineers-design
description: >-
  Use this skill to generate well-branded interfaces, assets, and documents for
  Collision Engineers (independent automotive engineering experts), either for
  production or throwaway prototypes/mocks. Contains the visual design system:
  design tokens, fonts, brand assets, UI kits for the marketing website and the
  A4 document/report letterhead system. Use this skill whenever building or
  styling anything to the CE brand — websites, HTML mocks, document templates,
  visual artefacts. For writing/tone/voice, use the `ce-house-style` skill
  instead. Document skills (vehicle-valuation, diminution-rebuttal, etc.)
  consult this skill for layout; their specific wording lives in each document
  skill.
---

Read `references/document-letterhead.md` when working on any A4 document or report template. Read
`references/website-system.md` when building website components. For full design token detail, see
`references/palette-and-type.md`. For iconography rules, see `references/iconography.md`.

**For voice, tone, or any written copy — use the `ce-house-style` skill, not this one.**

If the user invokes this skill without other guidance, ask what they want to build, and act as an
expert designer who outputs HTML artefacts, document templates, or production code.

## If invoked by another skill

Do **not** ask what to build. Read **only** the surface for the calling document type, return the
tokens/layout the caller applies, and stop — don't emit a full HTML page unless asked.

| Calling skill | Read | Document surface |
|---|---|---|
| vehicle-valuation | `references/document-letterhead.md` | *Market Valuation Evidence* (+ *Advert Evidence Pack*) |
| diminution-rebuttal / diminution-report | `references/document-letterhead.md` | *Diminution Rebuttal* |
| total-loss-assessment | — (deliberate non-CE Audatex format; do **not** apply CE styling) | n/a |
| roadworthy-report | — (third-party HS template; do **not** apply CE styling) | n/a |
| fee notes | `references/document-letterhead.md` | *Fee Note* |

> **Not the same as the branded *Total Loss Report*.** The `total-loss-assessment` skill above is the
> Audatex-format assessment PDF for EVA import (no CE styling). The CE-branded *Total Loss Report*
> letterhead document in `ui_kits/documents/` is a separate, fully-branded expert report — keep using
> the letterhead system for it.

Canonical tokens to hand back: documents/print red `#C80A32`, warm charcoal `#2C2A27`, Arial body
stack for document copy, Tw Cen MT / Futura brand faces for the logo/display only, and the
letterhead header/footer spec. These are the single source of truth — callers must not re-define
their own font or colour stack.

## Quick map

- `colors_and_type.css` — all design tokens (`@font-face`, colours, type scale, radii, shadows,
  spacing). Import this first in any HTML/CSS output.
- `fonts/` — Tw Cen MT Std (OTF, 6 weights) + Futura Cyrillic (TTF, 4 weights). Brand/logo faces;
  UI/body uses the system sans stack.
- `assets/` — master logo (`logo_no_margin.png`, red gear-C), white reverse logo, brand imagery,
  engineer signature PNGs (`assets/signatures/`).
- `preview/` — design-system specimen cards for all tokens (colours, type, spacing, components,
  documents).
- `ui_kits/website/` — hi-fi recreation of `collisionengineers.co.uk` with all reusable components.
- `ui_kits/documents/` — A4 letterhead system: Total Loss Report, Market Valuation Evidence,
  Diminution Rebuttal, Fee Note. Print-ready JSX components + CSS.
- `references/` — load-on-demand documentation (see below).

## References — load when needed

- `references/document-letterhead.md` — the canonical A4 letterhead spec (colours, layout, tables,
  footer, section headings). **Read before building any document or report template.**
- `references/palette-and-type.md` — full palette, type scale, spacing, radii, shadows.
- `references/website-system.md` — website layout rules, motion, interaction states, Lucide usage.
- `references/iconography.md` — icon system rules and common glyphs.

## Non-negotiables

- **Two official surfaces:** the **website** (`collisionengineers.co.uk`) and the **documents/reports**
  letterhead system. The internal Collision Command Centre app is excluded from this kit.
- **Master logo:** `assets/logo_no_margin.png` (red gear-C). Never redraw the gear.
- **One red per surface:** website `#DB0816`; documents/print `#C80A32`. One warm charcoal `#2C2A27`.
- **Type:** keep UI/body on the system sans; brand faces (Tw Cen MT / Futura) for logo, display,
  marketing headers, and printed reports.
- **Icons:** Lucide only (web). No emoji, no hand-drawn icons.
- **Voice:** handled by `ce-house-style`. This skill covers visual design only.
