# Collision Engineers — Design System

> **Accuracy through excellent engineering.**
> Brand, design tokens, and UI kits (website + documents) for Collision Engineers — independent automotive engineering experts.

---

> **Repository layout.** This README and `AGENTS.md` live in the `collision-engineers-design-dev/`
> dev wrapper. The uploadable skill is the nested `collision-engineers-design/` folder
> (`SKILL.md` at its root). Asset paths below (e.g. `assets/logo_no_margin.png`) are relative to
> that inner skill folder. Only the inner folder ships to cowork/Desktop via `dist/`.

## 1. Company & Product Context

**Collision Engineers Ltd** is a UK independent automotive engineering firm. They provide vehicle
damage assessments and expert reports for **legal professionals, insurers, government bodies, and
private clients** across the UK. Their positioning is *independent, court-compliant, technically
authoritative* — "the technical substructure supporting the legal, motor trade, government and
insurance sectors."

Core services: Accident Damage Reports · Forensic Engineering (consistency of damage, low-velocity
impact, counter-fraud) · Vehicle Valuation · Diminution in Value · Roadworthy / Unroadworthy ·
Criminal Reports. All reports are **CPR compliant** and authored by engineers qualified as **expert
witnesses**. They are the UK's only expert-witness firm with full workshop facilities on-site.

Contact: **0151 559 0762** · newbusiness@collisionengineers.co.uk · North West HQ, UK-wide & Europe.

### The official surfaces

This design system is the brand kit for Collision Engineers' two **official, client-facing** surfaces:

| Surface | Status | What it is | Visual character |
|---|---|---|---|
| **Marketing website** (`collisionengineers.co.uk`) | ✅ **Official** | Public site: Home, About, Services, Contact, Repairer Portal, Staff Area | Collision red `#DB0816` + warm charcoal `#2C2A27`, white, sharp 2px corners, grayscale automotive photography, letter-spaced uppercase eyebrows, geometric corner accents. |
| **Documents & reports** | ✅ **Official** | The letterhead system: expert reports, valuations, addenda, rebuttals, Part 35 responses, fee notes — sent to courts, solicitors & insurers | A4, system-sans body, master-logo letterhead + Our/Your Ref block, centred underlined UPPERCASE titles, **red** salutation/RE lines, UPPERCASE section headings, **red-bordered** data tables, charcoal-header evidence tables. |

The gear-"C" logo, the red/charcoal palette, Lucide iconography (web), and the calm, factual tone are
the constants across both surfaces. **Master logo:** `assets/logo_no_margin.png` (the red gear-"C" lockup).

### Sources used to build this system

- **Scraped website (primary):** saved HTML + cleaned markdown of the live marketing site. Exact colours, copy, and layout were taken from here.
- **Brand assets:** logos, imagery, and the communication style/tone profile (now in `ce-house-style/`).
- **Document templates (PDF):** client-supplied example outputs — Total Loss Report (`vehicle-valuation/assets/style-examples/FH70PKY.pdf`), Addendum (`SJ67COU_Addendum_Report.pdf`), Diminution Rebuttal (`diminution-rebuttal/assets/style-examples/dr.pdf`), Fee Note — used to reverse-engineer the `ui_kits/documents/` templates.
- **Client-supplied fonts:** the full **Tw Cen MT Std** and **Futura** families (now in `fonts/`, including condensed and extra-weight variants).

---

## 2. Writing & Voice

**Writing and voice guidance has moved to `ce-house-style/SKILL.md`.** That skill is the single source of truth for tone, preferred wording, the independence line, dispute responses, and the banned-terms list. Consult it directly for any written output.

For quick reference, the one-sentence summary: *"Communicate as an independent vehicle engineering expert: concise, professional, evidence-based, calm under challenge, and confident without being confrontational."*

Signature phrases (web/marketing use):
- *"Accuracy through excellent engineering"* — strapline
- *"Independent Automotive Experts"* · *"Independent Automotive Engineering Experts"*
- Marketing CTAs: *"Request a Report"*, *"Request an Engineering Report"*, *"Make an Enquiry"*
- Compliance shorthand: *Fully CPR compliant · Court-compliant format · Expert Witness Qualified · UK-Wide Coverage · 100% Independent · No commercial bias*

---

## 3. Visual Foundations

### Palette
- **Collision Red** is the single hero colour — but it has **two official registers by surface**: the
  **website** uses `#DB0816`; **documents/print** use `#C80A32` (slightly deeper, set in the
  house-style renderer). Pressed/hover-dark red is `#8F1422`. Red is used sparingly — CTAs, the
  active-nav link, eyebrows and icon chips on the web; section-heading rules, table header rows and
  the headline value figure in documents.
- **Warm charcoal `#2C2A27`** grounds the website's dark sections and footer. Body text is foreground
  `#1A1A1A` (web) / `#222` (docs) on light, and white/translucent on charcoal.
- **Neutrals:** white grounds, `#F5F4F2`/`#F5F5F5` light/zebra grounds, `#E6E4E1`/`#BEBEBE` borders,
  `#6B6B6B`/`#555` muted text.
- **Accents:** form success green `#16833B`; the floating WhatsApp pill is `#25D366` (web only).

### Typography
- **Brand / logo faces:** **Tw Cen MT Std** and **Futura** — geometric, engineering-precise sans
  serifs. Use them *where appropriate* — the logo lockup, big display / marketing moments,
  brand-character headers, and printed reports. (Client-supplied OTF/TTF in `fonts/`.)
- **UI / body face:** the live site renders in a neutral **`system-ui` sans** (`--font-web`). Keep all
  UI and long-form body copy in this stack; don't set paragraphs in the brand faces.
- **Scale:** hero 60px/700 (lh 1.08) → section h2 40px → sub-heading 24px → card titles 18px/700 →
  body 15px (lh 1.6) → UI 14px → eyebrow 12px UPPERCASE tracking .22em → stat label 10px tracking .15em.

### Shape, depth & spacing
- **Corner radii are tight.** Almost everything is **2px** (`rounded-sm`) — sharp, engineered. The
  only fully-round element is the floating WhatsApp pill (999px). Section bands and dividers are square.
- **Borders over shadows.** Surfaces are defined by 1px hairline borders; the site is largely flat.
  Shadows are rare and soft: a contact-row hover `0 1px 4px rgba(0,0,0,.06)`, a red CTA hover lift
  `0 18px 40px rgba(143,20,34,.30)`, and the floating pill `0 8px 24px rgba(0,0,0,.20)`. No glow.
- **Spacing** follows a 4px base (4/8/12/14/24/40/64). The layout breathes: 96px section padding,
  1200px max content width, 24px gutters.

### Backgrounds & imagery
- **Photography is automotive and grayscale.** Garage, workshop, and inspection photos are rendered
  desaturated and high-contrast, dropped to very low opacity (2–5%) **behind** dark sections as
  texture — never as full-colour hero images. The one foreground photo (hero) is also subtly faded to
  white at the bottom.
- **Dot-grid texture:** the website CTA band carries a faint white radial dot pattern
  (`radial-gradient(white 1.5px, transparent 1.5px)` at 32px) at ~6% opacity.
- **No gradients** as decoration beyond logo shading and protection fades (image-to-white). No
  blur/glass.
- The **gear-"C" logo** is the recurring brand mark; the red gear ring reads as both "C" and a
  precision-engineering cog.

### Motion
- **Restrained, professional.** Fade + small translate entrances (`opacity 0→1`, `translate-y 24→0`)
  over ~700ms with short stagger delays (70–80ms per card), fired on scroll. Hovers are `opacity: 0.9`
  or a darker-red swap; icons scale to 1.1 on card hover. No bounce, no spring, no looping decorative
  animation.
- **Reduced-motion:** honour `prefers-reduced-motion` — show end-state, skip entrance transforms.

### Interaction states
- **Hover:** primary red → `opacity .9` (or a darker-red swap); ghost/secondary → `#F5F4F2` fill;
  contact rows gain a hairline-darken + soft shadow; nav links → red text.
- **Active/pressed:** subtle opacity/brightness drop.
- **Focus:** visible **3px** red focus ring `rgba(219,8,22,.38)` (keyboard).
- **Disabled:** reduced opacity, `not-allowed` cursor.

### Layout rules
- **Website:** 1200px max content width, centred, 24px gutters; fixed top header (h-20) that goes
  transparent → frosted-white on scroll; generous 96px vertical section rhythm; full-width charcoal /
  red bands. Floating green WhatsApp pill bottom-right. Collapses to a single column with a hamburger
  menu on mobile.

### Documents & reports (print surface)
The firm's expert reports, valuations, addenda, rebuttals and fee notes share one **letterhead
template** — a distinct, more formal register than the website but unmistakably the same brand.
- **Page:** A4, generous margins, system-sans body (Arial/Helvetica) set justified at ~13.5px/1.6.
- **Letterhead:** master gear-C logo top-left; **Our Ref / Your Ref / Date** block top-right (bold,
  right-aligned labels). Continuation pages carry a one-line running head with the same three refs.
- **Title:** centred, **bold, UPPERCASE** — black + underlined on letter-style reports (*TOTAL LOSS
  REPORT*, *REBUTTAL OF CLAIM FOR DIMINUTION IN VALUE*) or **brand-red** on the newer renderer
  outputs (*FEE NOTE*); an optional centred subtitle (`RE: …`) sits beneath.
- **Opening lines:** the `Dear Sirs` / `FAO …` salutation and `RE: …` matter line are bold; on some
  templates they are set in **doc red** (the red-intro variant).
- **Section headings:** short, **UPPERCASE, bold, with a brand-red rule underneath** (`border-bottom`
  ~1.5–2pt `#C80A32`) — the signature document motif (NATURE OF INCIDENT, ENGINEER'S COMMENTS,
  SETTLEMENT, VALUATION METHODOLOGY…).
- **Summary data table:** thick **red border** (grid in red) + **grey label cells** (`#F2F2F2`, normal
  weight) with **bold values**, laid out as four-up key/value pairs — the "vehicle summary" block.
- **Evidence / comparables tables:** **red header row** (`#C80A32`, white bold text), zebra body
  (`#F5F5F5` even rows), thin grey grid (`#BEBEBE`), right-aligned currency.
- **Value box:** bordered box, grey label cell, the headline figure shown **large in brand red**,
  centred.
- **Footer (every page):** `Collision Engineers Ltd | www.CollisionEngineers.co.uk |
  engineers@collisionengineers.co.uk` above a thin red rule (fee notes swap the email for the VAT no.),
  with an optional `— n of N —` page marker.
- **Case imagery** (inspection photos, the branded top-down **Impact Area** diagram with a yellow
  impact burst) is inserted per report — treat as content slots, not brand assets.
- **Some documents are signed.** Engineer signature PNGs (transparent) live in `assets/signatures/`,
  placed above the typed name + *"Independent Automotive Engineer, Collision Engineers Ltd"*.
- Full template + composable components live in `ui_kits/documents/`. **Reports are often multi-page**
  (3–16pp); continuation pages repeat a running head + footer.

---

## 4. Iconography

- **Lucide** ([lucide.dev](https://lucide.dev)) is the icon system — the live site uses inline
  `lucide-*` SVGs. **Use Lucide for everything.** Stroke style: `stroke-width: 2`, `round` caps &
  joins, 24×24 viewBox, sized 16–24px.
- Icons inherit `currentColor`; they sit in **square red chips** (40–44px, 2px radius, red `#DB0816`
  fill with a white icon) or on a faint red-tint background with a red icon.
- Common glyphs in use: `Shield, FileText, MapPin, Clock, Search, TrendingDown, BarChart,
  TriangleAlert, CircleCheckBig, Phone, Mail, ChevronRight, ArrowRight, Send, Linkedin, Menu`.
- **No emoji.** No unicode dingbats. No custom/hand-drawn icon set. For brand marks use the supplied
  logo PNG/SVG assets in `assets/` — do **not** redraw the gear.
- Load Lucide in static HTML via:
  `<script src="https://unpkg.com/lucide@latest"></script>` then `lucide.createIcons();`.

---

## 5. Index / Manifest

| File / folder | What's inside |
|---|---|
| `README.md` | This document — context, visual foundations, iconography, index. |
| `SKILL.md` | Skill metadata and quick-map. |
| `colors_and_type.css` | All design tokens: `@font-face`, colour vars, type scale, radii, shadows, spacing. |
| `fonts/` | Brand typefaces — Tw Cen MT Std (20 OTF/TTF variants) + Futura Cyrillic (4 TTF weights). |
| `assets/` | Master logo (`logo_no_margin.png`), white reverse logo, brand imagery, `signatures/`. |
| `preview/` | Design-system specimen cards (colours, type, spacing, components, documents). |
| `ui_kits/website/` | Hi-fi recreation of `collisionengineers.co.uk` with all reusable components. |
| `ui_kits/documents/` | A4 letterhead system: Total Loss, Valuation, Diminution Rebuttal, Fee Note. |
| `references/document-letterhead.md` | **Canonical document layout spec** — read before building any report template. |
| `references/palette-and-type.md` | Full palette, type scale, spacing, radii, shadows. |
| `references/website-system.md` | Website layout, motion, interaction states. |
| `references/iconography.md` | Lucide icon system rules and common glyphs. |
| `ce-house-style/` (sibling skill) | **Writing & voice** — tone, preferred wording, dispute responses, banned terms. |

**Getting started:** link `colors_and_type.css`, pull the master logo from `assets/`, load Lucide from CDN, and build with the tokens. For document templates, read `references/document-letterhead.md` first. **For any written copy, use the `ce-house-style` skill.**

### Notes
- **Type policy:** keep UI/body on the system sans (`--font-web`); use brand faces (Tw Cen MT Std / Futura) for logo lockups, big display, marketing headers, and printed reports.
- **Website is the kit.** The internal Collision Command Centre app is not part of this design system.
- **Master logo:** `assets/logo_no_margin.png` (red gear-C). Never redraw the gear.
- **Font variants:** `fonts/` now contains the full extended set including condensed and extra-weight variants (Bold Cond, Medium Cond, UltraBold, ExtraBold Italic, etc.).
