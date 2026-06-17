# Palette & Typography

Full design token reference. All values are in `colors_and_type.css` as CSS custom properties.

---

## Colour palette

### Brand core

| Token | Value | Usage |
|---|---|---|
| `--ce-red` | `#db0816` | Website: CTAs, active nav, eyebrows, icon chips, logo |
| `--ce-red-doc` | `#c80a32` | Documents/print: section rules, table headers, value figures |
| `--ce-red-dark` | `#8f1422` | Pressed/hover state |
| `--ce-red-tint` | `rgba(219,8,22,0.07)` | Faint red wash behind icons |
| `--ce-charcoal` | `#2c2a27` | Dark sections, footer, charcoal bands |
| `--ce-ink` | `#16191d` | Near-black |

### Website surface

| Token | Value | Usage |
|---|---|---|
| `--web-bg` | `#ffffff` | Light ground |
| `--web-bg-dark` | `#2c2a27` | Section/footer dark |
| `--web-fg` | `#1a1a1a` | Foreground / headings |
| `--web-muted` | `#6b6b6b` | Body / muted text |
| `--web-border` | `#e6e4e1` | Hairline borders |
| `--web-secondary` | `#f5f4f2` | Light hover ground |
| `--web-on-dark` | `rgba(255,255,255,0.6)` | Body on charcoal |
| `--web-success` | `#16833b` | Form success green |
| `--web-whatsapp` | `#25d366` | Floating WhatsApp pill |

---

## Typography

### Font families

| Token | Stack | Use |
|---|---|---|
| `--font-brand` | Tw Cen MT Std, Futura PT, Century Gothic, sans-serif | Logo lockups |
| `--font-display` | Futura PT, Tw Cen MT Std, Helvetica Neue, Arial, sans-serif | Display / marketing |
| `--font-web` | ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, ... | All UI and body copy |
| `--font-mono` | ui-monospace, SF Mono, Cascadia Mono, ... | Code |

Brand face files are in `fonts/` (`TwCenMTStd*.otf`, `FuturacyrillicX.ttf`). Declared in `colors_and_type.css` with `@font-face` + `font-display: swap`. Use brand faces for **logo, display, marketing moments, printed reports** — not for long body copy.

### Type scale

| Token | Size | Weight | Line-height | Usage |
|---|---|---|---|---|
| `--t-hero` | 60px | 700 | 1.08 | h1 hero headline |
| `--t-h1` | 40px | 700 | 1.25 | Section h2 |
| `--t-h2` | 24px | 700 | — | Sub-headings |
| `--t-h3` | 18px | 700 | — | Card titles |
| `--t-body-lg` | 18px | 400 | 1.6 | Hero lede |
| `--t-body` | 15px | 400 | 1.6 | Body text |
| `--t-sm` | 14px | — | — | UI default / tables |
| `--t-xs` | 13px | — | — | Secondary text |
| `--t-eyebrow` | 12px | 600–700 | — | UPPERCASE, tracking 0.22em |
| `--t-micro` | 10px | — | — | Stat labels, tracking 0.15em |

---

## Shape, spacing & depth

### Radii

| Token | Value | Usage |
|---|---|---|
| `--radius-sharp` | 2px | Universal — buttons, cards, chips, almost everything |
| `--radius-pill` | 999px | WhatsApp floating pill only |

### Spacing (4px base)

`--sp-1: 4px` · `--sp-2: 8px` · `--sp-3: 12px` · `--sp-4: 14px` · `--sp-5: 18px` · `--sp-6: 24px` · `--sp-8: 32px` · `--sp-10: 40px` · `--sp-16: 64px`

### Shadows (rare — borders first)

| Name | Value | Usage |
|---|---|---|
| Soft | `0 1px 4px rgba(0,0,0,.06)` | Contact row hover |
| CTA lift | `0 18px 40px rgba(143,20,34,.30)` | Red CTA hover |
| Float | `0 8px 24px rgba(0,0,0,.20)` | WhatsApp pill |
| Focus ring | `3px solid rgba(219,8,22,.38)` | Keyboard focus |
