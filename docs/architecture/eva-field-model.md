# EVA field model — required fields, reconciled

Authority for the EVA field set the intake UI captures and validates. Reconciles the **EVA Sentry API**
requirements, the **Collision Engineers process** requirements, and the **M1 drag-drop** wire contract.
Set by review [`190626/broad-review`](../reviews/190626/broad-review/review.md) (issue 1) +
[`190626/new-case`](../reviews/190626/new-case/review.md.md) (issues 7 & 15); source detail in
[`190626/evacreation`](../reviews/190626/evacreation/evacreation.md).

## Two EVA paths (unchanged by this review)

- **M1 — JSON drag-drop.** The settled **12-field** payload (snake_case) is the byte-stable wire
  contract shared by the Code App serializer (`mockup-app/src/contracts/eva-export.ts`), the Power
  Automate finalise flow, and the Python parser's EVA exporter (validated against
  `contracts/eva-payload.schema.json`). **This review does not re-cut those 12 wire keys** — changing
  them would ripple the parser, flow, schema, Dataverse choice set and parity tests. Only the **display
  label** `Date of Loss → Date of Incident` changed (new-case #13); the payload key stays `date_of_loss`.
- **Sentry REST API — M2+ (in testing).** Carries a broader, differently-named field set (below). The
  UI now captures the **superset** so the case row is API-ready when that path lands.

## EVA Sentry **API** required fields (a call fails without these, in a valid format)

| API field | Meaning | UI source |
|---|---|---|
| `RequestFrom` | Principal (4-char provider code) | Principal |
| `ExternalRef` | **our** Case/PO (despite the name, it is internal) | Case/PO |
| `VehReg` | Vehicle registration | VRM |
| `ClmNo` | Claim number (provider's own reference) | Claim No / provider's ref |
| `InsName` | Insured / claimant name | Insured Name |
| `InspType` | Inspection type — **always "Vehicle Damage Inspection"** (desktop) | constant, not shown |
| `InUse` | Vehicle in use — Yes / No / Not Known | (not used today — see relaxation) |
| `ClmAddr` | Claimant address | (not used today — see relaxation) |
| `CoverType` | Cover type — prefill **"TBA"** | constant TBA |
| `InstEmail` | Email to send the instruction to | (not used today — see relaxation) |

**Manual creation in EVA** is blocked by only **VRM + Principal**; no other field blocks *manual*
creation. The full list above blocks the *API* call only.

## Collision Engineers **process** required fields

Provider Name / Principal · VRM · **Make** + Model · Claimant Name · Their Ref (`ClmNo`) · **Incident
Date** (blocked if future) · Instruction Date · **Inspection Date** (defaults to today if absent) ·
Inspection Address (EVA 6-line format) · Accident Circumstances · VAT Status · Mileage · Mileage Unit.

**Required files (process, to complete a report — not all needed to create the case):** vehicle photos
(image-rules), valuation evidence (the "Companion Report" PDF — automation TBD), the instruction
document, and a copy of the intake email when email was the channel.

## What the intake UI now enforces (the readiness/required set)

VRM · Principal · Work provider · Case/PO · Insured Name · Claim No · Incident Date · Inspection Date
(default today) · Inspection Address · Accident Circumstances · Vehicle Model. Images are **process-
required** (image-rules gate at submit), **not** required to create the case.

`Make`, `Mileage`/`Mileage Unit`, claimant phone/email are **optional/enrichable**. `Inspection Type`
is recorded as the constant "Vehicle Damage Inspection".

## Verified enrichment + VAT reality (2026-06-19 capability review)

- **DVLA/DVSA give make, model and a mileage estimate — NOT VAT.** There is no VAT route on the
  enrichment Function. So **VAT is a manual field** (consider defaulting display to TBA); **`n%` is
  unconfirmed** with EVA and is left as a follow-up to test. The intake "Look up vehicle" button fills
  Make/Model/Mileage only.
- Enrichment is **live in Dev** — `ENRICHMENT_ENABLED` is flipped on (default `false`, current
  `true`) and the enrichment Function is bound, so the "Look up vehicle" client returns real
  Make/Model/Mileage. (It remains gate-guarded: where the gate is off the UI clients return an
  honest "not connected".) Inspection-address normalisation uses **postcodes.io** now (the
  addressmatch Function is live), Azure Maps later.

## Follow-up to EVA devs (Minotaur)

Ask whether the API-required `CoverType`, `InstEmail`, `InUse` can be **relaxed** — Collision doesn't
currently capture them. Until then they are sent as constants/blanks (`CoverType=TBA`) and are **not**
gated in the UI readiness.
