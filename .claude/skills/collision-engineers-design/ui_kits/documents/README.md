# Collision Engineers — Documents & Reports UI Kit

Faithful, print-ready recreations of Collision Engineers' **expert report and invoice templates**,
built from supplied PDFs and the authoritative `collision-engineers-design` visual assets
(`colors_and_type.css` and `references/document-letterhead.md`). `ce-house-style` remains the
source of truth for voice only. This is the firm's *document/print* brand surface — the
letterhead system that goes out to courts, solicitors and insurers — alongside the live website.

> **Document red is `#C80A32`** (deeper than the website's `#DB0816`). Body is locked to
> **Arial/Helvetica**.

## Run it
Open `index.html`. A top toolbar switches between three documents, each rendered as an A4 sheet
(794×1123px @ 96dpi) on a grey "desk". Print/PDF-friendly (`@media print` hides the toolbar and
drops shadows, one sheet per page).

## Files
| File | Contents |
|---|---|
| `index.html` | Toolbar + document switcher. |
| `doc.css` | All print styles — letterhead, ref block, title, sections, tables, fee note, footer, A4 sheet. |
| `letterhead.jsx` | Shared parts: `Letterhead`, `RunningHead`, `DocTitle`, `SectionHeading`, `DataTable`, `KVTable`, `ValueCallout`, `MediaPlaceholder`, `DocFooter`. |
| `documents.jsx` | `TotalLossReport`, `ValuationEvidence`, `DiminutionRebuttal`, `ResponseLetter`, `FeeNote`. |

## The letterhead template (from the PDFs)
- **Header:** master logo top-left; **Our Ref / Your Ref / Date** block top-right (bold right-aligned
  labels). On continuation pages this collapses to a one-line running head.
- **Addressee:** `FAO The Court` + c/o address, left aligned.
- **Title:** centred, **bold, UPPERCASE** — black + underlined on letter-style reports, or **brand-red**
  on renderer outputs (fee note). Optional centred `RE:` subtitle.
- **Section headings:** short, **UPPERCASE, bold, with a brand-red rule underneath** — the signature motif.
- **Summary data table:** **red grid** + **grey label cells** (`#F2F2F2`) with **bold values**, four-up.
- **Evidence/comparables & fee tables:** **red header row** (`#C80A32`, white), `#F5F5F5` zebra body,
  `#BEBEBE` grid, right-aligned currency.
- **Value box:** bordered, grey label cell, headline figure **large in brand red**, centred.
- **Footer:** `Collision Engineers Ltd | www.CollisionEngineers.co.uk | engineers@collisionengineers.co.uk`
  above a thin red rule (fee note swaps the email for the VAT number).

## Documents included
1. **Total Loss Report** (`FH70PKY`) — letterhead, instruction paragraph, red summary table, vehicle
   + impact-area media row, NATURE OF INCIDENT / ENGINEER'S COMMENTS / SETTLEMENT.
2. **Market Valuation Evidence** (`KF06 UJB`) — subject-vehicle key/value grid, value box, comparables
   evidence table, valuation commentary & conclusion.
3. **Diminution Rebuttal** (`SJ67COU`) — FAO line, opinion intro, red-rule section headings with
   bulleted technical argument (best showcase of the heading motif).
4. **Response Letter** (`AB12 CDE`) — a *without-prejudice* dispute reply using the canonical query
   wording (total-loss / repair-spec defence), closing on the bolded independence line, signed by
   A. Patterson. The branded letter format for the wording in `WRITING.md` §7.
5. **Fee Note** (`QCL24257-P35`) — red title, VAT letterhead, Bill To + invoice meta, red-header line
   table, Subtotal / VAT / Total Due, payment details and terms.

## Cut corners (intentional)
- **The Impact Area diagram is generated per vehicle** (a top-down line drawing of the specific
  make/body-type with yellow impact-burst markers), so it differs on every report and isn't suitable
  for a static component. It's shown here as a captioned placeholder — drop the case-specific render
  into the `MediaPlaceholder` slot. The per-report inspection photographs are handled the same way.
- **Signing:** `SignatureBlock` places a transparent signature PNG from `assets/signatures/` above the
  engineer's typed name + role. Shown on the Valuation (N. D. O'Reilly) and Rebuttal (E. Mawdsley).
- Data is taken verbatim from the supplied example PDFs. Reports are often multi-page (the originals
  run 3–16pp); this kit shows page 1 of each — continuation pages repeat a running head and footer.
