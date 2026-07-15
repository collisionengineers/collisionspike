# Job-sheet vs EVA policy contradictions - adjudication

Generated from the job-sheet cross-check (`_crosscheck.json`) and the per-provider verdicts
(`_verdicts.json`). Source of truth for the machine-applied changes is
[`apply_plan.json`](./apply_plan.json); providers with no live WorkProvider row are in
[`apply_plan.noLiveRow.json`](./apply_plan.noLiveRow.json).

> **CORRECTION - 2026-06-21 (operator ruling, binding).** The single CONFIRM below (RJS) is
> **OVERTURNED**. Operator: *"Desktop inspection always goes on. Whether the LOCATION is image based
> is a different matter entirely. RJS is not an image based inspection."* A high **desktop-%** is the
> report-TYPE (constant on ~all CE work) and is **never** evidence of image-based modality; the only
> modality signal is the inspection **LOCATION** axis (`cr1bd_inspectionlocationpolicy` / loc-rate).
> **RJS is address-based (PreferAddress), not image-based** - the job-sheet "address" note stands.
> **Net result: 0 CONFIRM / 33 REFUTE.** The live RJS row was already `PreferAddress` (write-into-empty
> protected it; the intended `AlwaysImageBased` override never landed). The CONFIRM/override wording
> retained below is **historical**.

**What a contradiction is.** The job-sheet free-text implied an inspection-location policy
(PreferAddress / RequiredAddress) that *seems* to disagree with recent EVA reality, where the
provider's last-12-month cases are overwhelmingly **Desktop / image-based**.

**Adjudication rule.**
- **REFUTE** - the apparent conflict is a *false positive*: EVA's "Desktop Inspection" is the
  report-TYPE (constant for every CE provider per binding review 190626), which is *orthogonal* to
  the inspection-ADDRESS the job-sheet note is sourcing. The job-sheet-derived policy is **kept**.
- **CONFIRM** - ~~a genuine, evidenced divergence: recent EVA data wins, policy forced to `AlwaysImageBased`~~
  **VOID (2026-06-21 correction, see banner): a high desktop-% is the constant report-TYPE, never evidence
  of image-based modality, so no candidate qualifies. CONFIRM count is 0.**

Totals (corrected 2026-06-21): **33** candidates - **0 CONFIRM**, **33 REFUTE**. _(Originally 1 CONFIRM /
32 REFUTE; the RJS CONFIRM was overturned - see the correction banner at the top.)_

---

## Contradiction table

| Provider | evaCode | Job-sheet text (modality cue) | Derived policy | EVA desktop% / cases | Verdict | Reason (abridged) | Resulting action |
|---|---|---|---|---|---|---|---|
| Accident Specialists (Direct jobs) | ACSP | Accident Specialist group or request from client / Location/storage: Storage - RH10 9NT (Priestley Way Crawley)  /  Office RH10 6AE  /  Direct - ask whoever provides images to confirm | PreferAddress | 100% / 216 | REFUTE | Job-sheet "Direct - ask whoever provides images to confirm" is address-string sourcing (storage-yard postcode to print on a desktop report), not a physical-inspection requirement; 100%/216 desktop corroborates image-based rather than contradicting it. | KEEP job-sheet policy (**PreferAddress**) |
| Alison Law | ALISON | Whats App group with Alison Law | PreferAddress | 100% / 72 | REFUTE | The job-sheet note ("image based if not residential address; ask sender to confirm") sources the address STRING to print on an otherwise desktop/image-based report — not a physical-inspection requirement; CE works desktop by default ("always desktop inspectio… | KEEP job-sheet policy (**PreferAddress**) |
| Alliance &Cooper | ALL | Contact client | PreferAddress | 100% / 62 | REFUTE | "Confirm address with client" is address-string sourcing for an otherwise desktop/image-based report (the AX/storage-yard-postcode pattern documented in queue-case-model.md and provider-corpus-analysis), not a physical-inspection mandate. PreferAddress govern… | KEEP job-sheet policy (**PreferAddress**) |
| Aman Solicitors Advocates | AS | Details should be in the email | PreferAddress | 100% / 55 | REFUTE | False positive: EVA "Desktop Inspection" is the report-production mode, not "no address" — for the same 55 AS cases loc_rate is 92.7% "mostly site-inspected" with real yard postcodes (B9 etc.), so the data confirms PreferAddress; the job-sheet "image based" n… | KEEP job-sheet policy (**PreferAddress**) |
| AMS Solicitors | AMS | Raja or Ontrack / Location/storage: If Higginshaw Lane - then OL2 6HW | RequiredAddress | 100% / 102 | REFUTE | The job-sheet note is address-SOURCING, not a physical-inspection requirement: it sits in the "Image based or address" column and means "if images come from the Higginshaw Lane storage yard, print postcode OL2 6HW" — OL2 6HW is Swade Storage (a REPAIRER/stora… | KEEP job-sheet policy (**RequiredAddress**) |
| Baker Coleman | BC | Usually with instruction if not sufficient ask Ehjaz (Rapid Claims) via Whatsapp  /  Complete Injury Claims - Whats app group or images directly from Waseem (Complete Injury Claims) | PreferAddress | 100% / 166 | REFUTE | "Desktop Inspection"=100% is EVA's always-constant Inspection-Type field (true for every CE case, even AX), NOT a modality signal; BC's real site-vs-image metric is loc_rate 49.4% ("mixed"->prefer_address), and the job-sheet line is address-sourcing for a des… | KEEP job-sheet policy (**PreferAddress**) |
| BlackStone | BLACK | Foyez: If through Foyez he will provide address.  /  Javad/Samore Cars: Also sends direct jobs.  /  Client: Contact direct  /  Solicitors: Provide images with instruction - ask for location / Location/storage: Confirm address w… | PreferAddress | 100% / 471 | REFUTE | The job-sheet note is an address-sourcing lookup ("if Javad/Samore->Brewery St; 'Sixways'=Somstar Recovery B5 6JX" — Somstar is a known storage/recovery yard in the corpus), telling staff which postcode string to print on an otherwise desktop report; "PreferA… | KEEP job-sheet policy (**PreferAddress**) |
| DFD (Richard or Joshua)  /  Also Car Claims | DFD | SMC (they email estimate and images to engineers) Tarran way Moreton. / Location/storage: Address in Email  /  If images from Nabeel -  219 Slade Lane, M19 2EX | RequiredAddress | 99.6% / 1349 | REFUTE | Not a contradiction: the "Address in Email / if images from Nabeel -> 219 Slade Lane M19 2EX" note is address-SOURCING (which storage-yard string to print) for a desktop/image-based job, matching DFD's actual corpus policy "Prefer Address" and the 99.6% deskt… | KEEP job-sheet policy (**RequiredAddress**) |
| Fairway Solicitors | FW | Sixways/Fairways WhatsApp chat or images from Solicitors (If so image based) / Location/storage: Storage - Somstar Recovery and Storage B5 6JX if not in their yard ask them to confirm address  /  Solicitors Images - Image b… | PreferAddress | 99.8% / 1123 | REFUTE | Not a contradiction: the job sheet says "Solicitors Images - Image based" and the "Somstar B5 6JX" line is a storage-yard postcode telling staff WHERE TO SOURCE the EVA field-9 inspection-address string for an image-based/desktop job (corpus analysis names So… | KEEP job-sheet policy (**PreferAddress**) |
| HTU Assessors Ltd | HTU | Always in the email | RequiredAddress | 100% / 132 | REFUTE | Not a contradiction: HTU's same 132 cases carry a real inspection location on 92.4% (122/132), clustered at DE23 (101) — a recurring physical yard — so the job-sheet "address in instruction" note sources a genuine, used inspection address; EVA's "Desktop Insp… | KEEP job-sheet policy (**RequiredAddress**) |
| Kerr Brown Partnership | KERR | Varies | PreferAddress | 100% / 94 | REFUTE | "Desktop Inspection" in EVA is the universal inspection-TYPE label (MP 100% desktop is "Required Address"; OAK 99.5% is "Prefer Address"; QDOS 99.8% is "Always Image Based"), so 100% desktop is non-discriminating and cannot refute PreferAddress; the true disc… | KEEP job-sheet policy (**PreferAddress**) |
| KMR | KMR | Images usually with instruction / Location/storage: Usually listed in instruction  /  Street Cars, 16 Chorlton Street, M1 3HW  /  Storage Yard - Winders Way Salford M6 6BU | RequiredAddress | 100% / 139 | REFUTE | Not a contradiction: in this system "Inspection Type" is a constant (always desktop/image-based per binding review 190626 #15 and eva-field-model.md), while "Inspection Address" (EVA field 9) is a separate string; the KMR note merely tells staff WHERE to sour… | KEEP job-sheet policy (**RequiredAddress**) |
| KMR | KMR | Images with email / Location/storage: Storage - Unit 3 Broughton Road East, Salford Ind Estate, M6 6AQ  /  16 Chorlton Street, Manchester, M1 3HW | RequiredAddress | 100% / 139 | REFUTE | The note is address-SOURCING for a desktop job (storage-yard postcodes Winders Way M6 6BU / Sedgley Park M25 9WD, plus "carpark/buildings-in-background" as a photo-recognition hint and "if images obviously Manchester Airport, go image based") — it tells staff… | KEEP job-sheet policy (**RequiredAddress**) |
| Knightsbridge (KBS) | KBS | Direct - request images and inspection location from Client (occasionaly solicitors will send) | PreferAddress | 100% / 388 | REFUTE | The job sheet ("Direct - request images and inspection location from Client... can go image based") is an image+location-sourcing/escalation note for a desktop job, not a physical-inspection mandate, and EVA's 388/388 (100%) Desktop over 12m agrees with it — … | KEEP job-sheet policy (**PreferAddress**) |
| Knightsbridge (KBS) | KBS | Expert Claims (most of the time) / Location/storage: Expert Claims Whatsapp - if address is in stoke ask Expert claims for images first  /  Uttoxeter Road, Stoke on Trent, Staffordshire ST3 5LQ | RequiredAddress | 100% / 388 | REFUTE | FALSE positive: the 100% "Desktop Inspection" is just EVA's report-type label, but KBS carries a real physical inspection address on 363/388 cases (93.6% loc-rate, classified site-inspected with clustered garage postcodes B9 4QB/ST3 5LQ/B10 0ND), so the job-s… | KEEP job-sheet policy (**RequiredAddress**) |
| LEX Solicitors | LEX | Hackney Solutions / Location/storage: Storage  /  HS Recovery & Storage LTD William St M12 5FX  /  Not in Storage  /  Claim 3000 M12 4AH | RequiredAddress | 100% / 32 | REFUTE | The note is address-sourcing for a desktop job: HS Recovery M12 5FX is a known image-source storage yard (per provider-corpus-analysis memory + clarifying-info-ingestion.md QCL/LEX worked example), so the "Storage/Not in Storage/Claim" tree just picks which y… | KEEP job-sheet policy (**RequiredAddress**) |
| MBH Solicitors | MBH | Nabeel- whats app group / Location/storage: Storage - Parkers Autobodies, 4 Chapel Street, Manchester. M19 3QA | RequiredAddress | 100% / 89 | REFUTE | False positive: the job-sheet "Storage - Parkers Autobodies / 219 Slade Lane" note is address-sourcing for the separate EVA "Inspect at" field, not an inspection-modality signal — InspType is the constant desktop "Vehicle Damage Inspection" and 100% desktop o… | KEEP job-sheet policy (**RequiredAddress**) |
| Montreal Prestige | MP | With instruction - if not, email them straight back. | RequiredAddress | 100% / 700 | REFUTE | "Address listed in report" is address-sourcing for a desktop job (the job-sheet "Image based or address" column seeds BOTH policy and a storage-yard address string), not a physical-inspection directive — exactly the live AX pattern (real address on a 100%-ima… | KEEP job-sheet policy (**RequiredAddress**) |
| NETWORK HD UK / YM Law | YML | Whatsapp Mark Wilson  /  Whatsapp Y M Law / Location/storage: If Mark Wilson then Swinton Recovery and Storage, Hurlbutts Drive Queensferry, Deeside CH5 1SF | RequiredAddress | 98.6% / 147 | REFUTE | FALSE positive: the "If Mark Wilson then Swinton Recovery and Storage CH5 1SF" line is a conditional storage-yard address-SOURCING note (parser pulls YML's inspection_address from "currently located at:"), not a physical-inspection mandate — so 98.6% desktop … | KEEP job-sheet policy (**RequiredAddress**) |
| Oakwoods Solicitors | OAK | Request from garage if one is listed on instruction if not request from client | PreferAddress | 99.5% / 987 | REFUTE | Not a contradiction: OAK's parser rule extracts a REAL address (two_labels "Address: \|\| Mobile", unlike image-based providers' hardcoded "Image-based Assessment" literal), and the repo's own EVA analysis classifies OAK as "site-inspected" with loc_rate 74.6% … | KEEP job-sheet policy (**PreferAddress**) |
| QCL (QCL) | QCL | Hackney Solutions / Location/storage: Storage  /  HS Recovery & Storage LTD William St M12 5FX  /  Not in Storage  /  Claim 3000 Cariocca Business Park, Hellidon Close, Manchester. M12 4AH | RequiredAddress | 99.9% / 1246 | REFUTE | The "Storage / Not in Storage" storage-yard addresses (with hedged "maybe somewhere dodgier" / "check if outside office" notes) are address-string sourcing for a desktop report, not a physical-inspection dispatch — corroborated by 99.9% desktop over 1,246 cas… | KEEP job-sheet policy (**RequiredAddress**) |
| QCL (QCL) | QCL | Direct - usually attached to email if need to chase we have a group on whats app - QC Law VD | RequiredAddress | 99.9% / 1246 | REFUTE | The job-sheet "Storage/Not in Storage" text is an address-SOURCING decision tree (which storage-yard/office postcode to print), not a physical-inspection directive — QCL's own EVA postcodes are dominated by those exact notes (M12 5FX HS Recovery x97, M12 4AH … | KEEP job-sheet policy (**RequiredAddress**) |
| R1AM/MOTORX | R1AM/MOTORX | R1AM- whats app group / Location/storage: Clients address  /  300 Biscot Road, Luton, LU3 1AZ  /  47-49 Park Street, Luton, LU1 3JX | RequiredAddress | 100% / 89 | REFUTE | Not a contradiction: the job-sheet note is address-SOURCING (a storage-yard/shop-parade postcode for staff to print in EVA's "Inspect at" field), not an inspection-modality mandate — CE's binding 19-06-26 review hardcodes Inspection Type as "Always desktop in… | KEEP job-sheet policy (**RequiredAddress**) |
| Regent Law  Ltd | RL | Usually for Bicycles - will come with phone number for storage company | PreferAddress | 100% / 22 | REFUTE | No contradiction: EVA "Desktop Inspection" is the inspection TYPE (always desktop for every CE provider per binding review 190626 item 15), orthogonal to the inspection-ADDRESS field that PreferAddress governs; the "confirm with whoever provides images" note … | KEEP job-sheet policy (**PreferAddress**) |
| Robert James Solicitors | RJS | Direct - request images and inspection location from Client | PreferAddress | 100% / 1754 | REFUTE | The note's own wording ("ask whoever provides the IMAGES for the location") presupposes an image-based job and merely tells staff where to source the EVA location string (a storage-yard/non-home postcode) — not a physical-inspection mandate — so 100% desktop … | **KEEP live policy (PreferAddress)** - CONFIRM overturned 2026-06-21 (see top banner) |
| Robert James Solicitors | RJS | Accident Specialist/Jazy - check board / Location/storage: Storage - RH10 9NT (Priestley Way, Crawley)  /  Not in storage - ask Jazy | RequiredAddress | 100% / 1754 | REFUTE | The note "ask whoever provides the images for the location" is address-sourcing for an image-based/desktop job (a storage-yard postcode to print in the EVA address field), not a physical-inspection requirement — corroborated by 100% desktop over 1754 cases, E… | **KEEP live policy (PreferAddress)** - CONFIRM overturned 2026-06-21 (see top banner) |
| Robert James Solicitors | RJS | Claim Specialists - images in whats app claim specialist group / Location/storage: Claim Specialist HQ - Kenilworth Road Luton LU1 1DQ | RequiredAddress | 100% / 1754 | ~~CONFIRM~~ REFUTE | RJS's own generator (rjs_docx.py) emits an "URGENT VEHICLE INSPECTION REQUIRED" letter that arranges a physical inspection with the claimant ("is available at:" + Address + "Mobile Tel:"), so the job-sheet note sources a real physical-booking location, not a … | **KEEP live policy (PreferAddress)** - CONFIRM overturned 2026-06-21 (see top banner) |
| ROZZII/Green Destinations | ROZZII | With instruction | PreferAddress | 100% / 33 | REFUTE | The job-sheet note ("Inspection address listed in report if ok if not image based?") is an address-SOURCING/report-content rule, not a physical-inspection directive, and EVA's two independent metrics confirm it: 33/33 cases are "Desktop Inspection" (image-bas… | KEEP job-sheet policy (**PreferAddress**) |
| Stallion | STALLION | In Stallion Whatsapp / Location/storage: Address provided in Whatsapp | RequiredAddress | 100% / 30 | REFUTE | Not a contradiction: in Stallion's all-WhatsApp record ("instructions/images In Stallion Whatsapp"), "Address provided in Whatsapp" is an address-sourcing pointer for an image-based job, and EVA agrees at 100% Desktop (image-based) over 30 cases — both point … | KEEP job-sheet policy (**RequiredAddress**) |
| Swan | SWAN | Claim Specialists - images in whats app claim specialist group / Location/storage: Confirm with sources. Claims Specialists HQ is LU1 1BW | PreferAddress | 100% / 166 | REFUTE | FALSE positive: in EVA every CE job is "Always desktop inspection" (binding review 190626 line 47; eva-field-model InspType is a constant), so desktop=100% is the house norm, not a Swan anomaly; the "Claims Specialists HQ is LU1 1BW" note is address-sourcing … | KEEP job-sheet policy (**PreferAddress**) |
| Ten Legal | TEN | Andy whats app or client direct | PreferAddress | 100% / 68 | REFUTE | "Ask whoever provides images to confirm" is address-sourcing for an image-based job (it presupposes someone is providing images), mirroring the documented AX precedent where the job-sheet address note is NOT a physical-inspection requirement; the 100% desktop… | KEEP job-sheet policy (**PreferAddress**) |
| Woodlands | WLS | Complete Injury Claims - Whats App group or direct from Waseem | PreferAddress | 100% / 63 | REFUTE | Not a contradiction: "address" and "desktop" are orthogonal here — the job-sheet "confirm location with whoever sends images" note sources a storage-yard postcode for EVA field 9 on an otherwise image-based/desktop job (the job sheet's column is literally "Im… | KEEP job-sheet policy (**PreferAddress**) |
| YM Law/ NETWORK HD UK | YML | Whatsapp Mark Wilson or Whatsapp Y M Law / Location/storage: If Mark Wilson then Swinton Recovery and Storage, Hurlbutts Drive Queensferry, Deeside CH5 1SF | RequiredAddress | 98.6% / 147 | REFUTE | The "Mark Wilson -> Swinton Recovery and Storage" line is a storage-yard address-SOURCING rule (sub-source -> full yard postcode to print), not a physical-inspection requirement; address-presence is orthogonal to modality, so the 98.6% desktop/147 cases is co… | KEEP job-sheet policy (**RequiredAddress**) |

> **RJS (Robert James Solicitors) - CONFIRM OVERTURNED 2026-06-21.** Operator ruling: RJS is
> **address-based, not image-based**; "Desktop Inspection" is the report-type, not a modality signal,
> so the contradiction does not stand and the live policy remains `PreferAddress`. _Historical text
> (now void) follows:_ RJS has three job-sheet channels (Direct,
> Accident Specialist, Claim Specialists) all on one live row `9ddc5c83-...`. Two channel verdicts
> read REFUTE, but the decisive verdict CONFIRMS the contradiction: RJS's own generator
> (`rjs_docx.py`) emits an "URGENT VEHICLE INSPECTION REQUIRED" letter that books a *physical*
> inspection, yet 1754/1754 recent EVA cases are desktop/image-based. Recent data wins, so **all
> three** RJS rows in `apply_plan.json` are forced to `AlwaysImageBased` with
> `policyOverriddenByRecentData: true`. (Caveat retained from the cross-check: the EVA "desktop"
> field may under-count site inspections for RJS - flag for human confirmation.)

---

## codeDrift / code-matching cautions

The structured `codeDrift` column is empty for every row, but the cross-check notes flag
code-matching risks that an operator must resolve before applying:

| evaCode | Provider | Caution |
|---|---|---|
| ZEN | Zenith Lawyers | `ZEN` matched live row `1f1b8183-...`, **but a separate live `ZENITH` row also exists** - confirm they are not duplicates (potential ZEN->ZENITH drift). 0 EVA cases under `ZEN`, so no contradiction check was possible. |
| R1AM/MOTORX | R1AM/MOTORX | Compound code matched the live **R1AM** row; a separate **MOTORX** live row may also exist - confirm the split. |
| KMR | KMR | Two job-sheet rows resolve to the **same** live row `98dc5c83-...` (duplicate job-sheet entries) - merge the storage-yard notes (M6 6BU / M6 6AQ / M1 3HW) into one block. |
| KBS | Knightsbridge (KBS) | Four job-sheet channels (Direct / Kabir / Expert Claims / Apex Hire) share one live row `96dc5c83-...`. |
| QCL | QCL (QCL) | Two channels (Hackney / Direct) share live row `476bde84-...`. |
| YML | YM Law / NETWORK HD UK | Two duplicate job-sheet rows share live row `4c6bde84-...`. |
| RJS | Robert James Solicitors | Three channels share live row `9ddc5c83-...` (see CONFIRM callout above). |

## Providers absent from the live corpus (noLiveRow)

No single live WorkProvider row exists for these - **skipped** from `apply_plan.json` (captured in
`apply_plan.noLiveRow.json`). Each needs an operator decision (create a row, or treat as a
per-case / valuation-only workflow).

| evaCode | Provider | Derived policy | Why no live row |
|---|---|---|---|
| Create for each | Arianna Autos | PreferAddress | Non-standard evaCode 'Create for each' (per-VRM, boxCode VRM ARIANNA): no single live WorkProvider row. |
| Check Instructions | FRAZ | RequiredAddress | Non-standard evaCode 'Check Instructions' (boxCode FRZ, search by Case ID not Principal; multiple sub-principals Focus/Pebble/Swade): no single live WorkProvider row. |
|  | Graham Coffey (GGP) | RequiredAddress | Second GGP channel (Raja/Fraz/On-Track) with blank evaCode - shares GG principal (workproviderId aa6611dc-...). Named storage OL2 6HW / OL1 3QR -> RequiredAddress for this sub-channel; merge notes into GG. |
| N/A | Questgates or Brownsword | Unknown | evaCode N/A - valuation-only workflow (Glass's/Percayso), not a standard inspection provider; no live WorkProvider row and no inspection policy applies. |

## Dormant providers (no EVA activity in >12 months)

These have a live row but have been dormant >12 months - apply changes with lower urgency and
verify the provider is still active before relying on the policy.

| evaCode | Provider | Live policy | Job-sheet derived | EVA cases (sample) | Contradiction? |
|---|---|---|---|---|---|
| BAKER | Baker Hardman | PreferAddress | RequiredAddress | 8 | no |
| CW | Countrywide | PreferAddress | Unknown | 26 | no |
| LEX | LEX Solicitors | PreferAddress | RequiredAddress | 32 | yes |
| LPS | LPS Solicitors | PreferAddress | RequiredAddress | 4 | no |
| MBH | MBH Solicitors | PreferAddress | RequiredAddress | 89 | yes |
| ROZZII | ROZZII/Green Destinations | PreferAddress | PreferAddress | 33 | yes |

