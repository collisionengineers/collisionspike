# Document & Report Letterhead Spec

The canonical A4 letterhead for all CE expert reports, valuations, addenda, rebuttals, and fee notes. Read this before building any document template.

---

## Page setup

- **Format:** A4 portrait
- **Margins:** generous (~2cm / ~20mm sides, ~22mm bottom, ~12mm top clearance after header)
- **Body typeface:** `Arial, Helvetica, sans-serif` — system-locked sans. Not brand faces for body copy.
- **Body size:** ~13.5px (10pt), line-height 1.6, justified alignment
- **Doc red:** `#C80A32` — used for section-heading rules, table header rows, and the headline value figure

---

## Header (repeats on every page)

```
[Logo — master gear-C, top-left, ~53mm wide]     [Our Ref:  XXXXX  ]
                                                  [Your Ref: XXXXX  ]
                                                  [Date:     DD/MM/YY]
```

- Logo: `assets/logo_no_margin.png` (red gear-C lockup)
- Reference block: right-aligned, bold labels, regular values. 54mm min-width.
- Continuation pages: carry a one-line running head with the same three refs.

---

## Title block (centred, below header)

```
TOTAL LOSS REPORT               ← bold, UPPERCASE, centred
RE: [Vehicle] — [Registration]  ← optional centred subtitle
```

On newer rendered outputs the title is in **doc red** (`#C80A32`). On letter-style documents it may be black + underlined. Either is acceptable.

Opening lines (`Dear Sirs` / `FAO …` / `RE: …` matter line) are bold; on some templates set in doc red.

---

## Section headings

```
NATURE OF INCIDENT              ← uppercase, bold
──────────────────────────────  ← 1.5–2pt red rule (#C80A32) immediately below
```

The red rule beneath every section heading is the signature document motif.

---

## Summary data table (vehicle / matter details)

- Thick red border (grid lines in `#C80A32`)
- Grey label cells (`#F2F2F2`, normal weight)
- Bold values
- Four-up key/value layout

---

## Evidence / comparables tables

| Column | Style |
|---|---|
| Header row | `#C80A32` background, white bold text |
| Even body rows | `#F5F5F5` zebra |
| Grid | Thin grey `#BEBEBE` |
| Currency columns | Right-aligned |

---

## Value box (assessed value / settlement figure)

```
┌─────────────────────────────────────────┐
│  Engineer's assessed retail value       │
│                        £12,500.00       │ ← large, bold, doc red
└─────────────────────────────────────────┘
```

Bordered box; grey label cell; headline figure in **large doc red** (`#C80A32`), centred.

---

## Footer (every page)

```
─────────────────────────────────────────── ← thin red rule (#C80A32)
Collision Engineers Ltd  |  www.CollisionEngineers.co.uk  |  engineers@collisionengineers.co.uk
                                                           — n of N —
```

Fee notes swap the email for the VAT registration number. Page marker `— n of N —` is optional but present on multi-page reports.

---

## Signatures

Transparent PNG files placed above the engineer's typed name:

```
assets/signatures/andy_patterson.png
assets/signatures/ed_mawdsley.png
assets/signatures/neil_oreilly.png
```

Below signature: typed name + *"Independent Automotive Engineer, Collision Engineers Ltd"* + qualifications (e.g. M.Inst.AEA) + AQP number.

---

## Case imagery

Impact area diagrams and vehicle inspection photos are inserted per report as content slots — they are not brand assets. The document layout provides space for them; treat as placeholder blocks.

---

## Jinja2 / WeasyPrint implementation reference

See `vehicle-valuation/assets/templates/` for a proven implementation:
- `_base.html.j2` — base template with header, footer, content block
- `report.html.j2` — market valuation report template
- `styles.css` — print-safe A4 CSS with `@page` rule and all table styles

These use `Arial, Helvetica, sans-serif` (no custom fonts at render time), logo embedded as base64 URI, CSS injected inline.
