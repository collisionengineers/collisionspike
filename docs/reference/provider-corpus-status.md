# Provider corpus status (`WorkProvider`)

> **⚠️ Superseded (2026-06-18, later same day) by the full EVA data analysis.** This early snapshot
> (45 seeded providers from the job sheet) is now subsumed by
> [`raw/principalandrepairersheets/outputs/reports/`](../../raw/principalandrepairersheets/outputs/reports/),
> which analysed the full EVA principal/case/location exports. Use
> `reports/provider_corpus_recommendation.csv` (one actionable row per principal — SEED / CONSIDER /
> ARCHIVE / EXCLUDE) as the authoritative corpus picture, and `docs/plans/phase-1-intake-and-case-tracking/corpus/dataverse-corpus-incorporation.md`
> for how it loads into Dataverse. Key new finding: **137 active principals are not on the job sheet**,
> so the 45 below under-represent the live provider base.

Snapshot of the seeded provider corpus in the **Sandbox** (`Collision Engineers - Dev`,
`cr1bd_workprovider`), generated **2026-06-18** from the live table.

**Source:** mined from `collisioncc` (`provider_coverage_matrix.csv`,
`ce_principals_and_garages_seeding.md`, `parser_provider_presets_v1.json`) — re-implemented
into the `cr1bd_workprovider` schema. Email domains were **derived from real evidence only**
(copy-in "Sending Report" addresses + real-domain `detect_phrases`); **none were invented**.

| Bucket | Count |
|---|---|
| **Seeded with email domains** (auto-match ready) | **16** |
| **Seeded, missing email domains** (code/name match only) | **29** |
| **Not seeded** (no clean Principal/Case-PO key) | **5** |
| **Total corpus rows considered** | **50** (45 seeded) |

Every seeded provider is `providerautomationmode = manual` and `active = true`. The free-text
notes fields (`instructionnotes`, `imagessourcenotes`, `reportreturnnotes`) and per-provider
boolean toggles (`aiallowed`, `evasubmitallowed`, `enrichmentallowed`, `outboundallowed`) are
**deferred to Phase 1b by design** — blank for all 45, not counted as gaps here.

---

## ✅ Providers we HAVE (email domains present — will auto-match by sender)

| Code | Name | Email domain(s) | Mailbox | Inspection policy |
|---|---|---|---|---|
| ACSP | Accident Specialists (Direct jobs) | accidentspecialist.co.uk | Engineers | Prefer Address |
| ALISON | Alison Law | alisonlaw.co.uk, alison-law.co.uk | Andrew/Engineers | Prefer Address |
| ALL | Alliance & Cooper | ac-solicitors.co.uk | Engineers | Prefer Address |
| ALS | Auto Logistic Solutions Ltd | autologistic.co.uk | Engineers | Always Image Based |
| AX | AX | ax.com | Info | Always Image Based |
| FW | Fairway Solicitors | fairwaylegal.com | Engineers | Prefer Address |
| KBS | Knightsbridge (KBS) | knightsbridgesolicitors.co.uk | Engineers | Prefer Address |
| KERR | Kerr Brown Partnership | kerrbrown.co.uk | Engineers | Prefer Address |
| LEX | LEX Solicitors | hackneysolutions.co.uk | Engineers | Prefer Address |
| MBH | MBH Solicitors | wigansolicitors.com | Engineers | Prefer Address |
| MP | Montreal Prestige | montrealprestige.co.uk | Desk | Required Address |
| OAK | Oakwoods Solicitors | oakwoodscotland.co.uk | Engineers | Prefer Address |
| QCL | QCL | qc-law.com, complexreports.com, hackneysolutions.co.uk | Engineers | Prefer Address |
| RJS | Robert James Solicitors | robertjameslaw.co.uk | Engineers | Prefer Address |
| SS | Savas & Savage | savasandsavage.co.uk | Andrew | Prefer Address |
| TEN | Ten Legal | tenlegal.com | Engineers | Prefer Address |

> **⚠️ Data-quality flag — domain collision:** `hackneysolutions.co.uk` is listed for **both
> LEX and QCL**. Per the schema, a domain mapping to >1 active provider is **ambiguous and
> blocks auto-match** for that domain. Decide which provider owns `hackneysolutions.co.uk`
> (or whether mail from it routes to manual triage) before relying on it.

---

## ⚠️ Providers MISSING data (seeded, but no email domain — what we're missing)

These have **name + Principal code + mailbox + inspection policy**, but **no `knownemaildomains`**,
so they will **not auto-match by sender** — they're matchable by code/name (e.g. parser detection)
or manual assignment only. They mostly arrive via WhatsApp, a shared "Engineers" inbox, or
forwarding, so no real sender domain was on record.

**Missing for all of these: the sender email domain(s).**

| Code | Name | Mailbox | Inspection policy |
|---|---|---|---|
| ABRAHAMS | Abrahams Solicitors | Engineers | Prefer Address |
| AMS | AMS Solicitors | Engineers | Prefer Address |
| AS | Aman Solicitors Advocates | Engineers | Prefer Address |
| ASLS | Affinity Seven Law Solicitors | Engineers | Prefer Address |
| AVI | Avisons Solicitors | Engineers | Always Image Based |
| BAKER | Baker Hardman | Engineers | Prefer Address |
| BC | Baker Coleman | Engineers | Prefer Address |
| BLACK | BlackStone | Engineers | Prefer Address |
| CASTLE | Castle | WhatsApp | Always Image Based |
| CW | Countrywide | Andrew/Engineers | Prefer Address |
| DFD | DFD (Richard or Joshua) / Also Car Claims | Engineers | Prefer Address |
| GGP | Graham Coffey (GGP) | Engineers | Prefer Address |
| HTU | HTU Assessors Ltd | Ben | Required Address |
| KMR | KMR | Engineers | Prefer Address |
| LPS | LPS Solicitors | Engineers | Prefer Address |
| MATT | Matt Rowland Solicitors | Engineers | Always Image Based |
| QDOS | QDOS | Desk | Always Image Based |
| RELAY | Relay Motor Group | WhatsApp | Always Image Based |
| RL | Regent Law Ltd | Engineers | Prefer Address |
| ROZZII | ROZZII / Green Destinations | Engineers | Prefer Address |
| SBL | Smart Business Link | Info | Always Image Based |
| STALLION | Stallion | Not Applicable | Prefer Address |
| SWAN | Swan | Engineers | Prefer Address |
| TA | Turnams | Andrew | Always Image Based |
| TP | Taylor Price | Engineers | Prefer Address |
| WIL | Williams & Co | Andy → Engineers | Required Address |
| WLS | Woodlands | Engineers | Prefer Address |
| YML | NETWORK HD UK / YM Law | Engineers | Prefer Address |
| ZEN | Zenith Lawyers | Engineers | Prefer Address |

---

## ⛔ Providers NOT seeded (no clean Principal / Case-PO key — what we're missing)

These corpus rows were **deliberately skipped** rather than guessed, because they can't form a
single unambiguous ≤8-char `principalcode` (the Case/PO prefix must be safe). **Missing: a
decision on the Principal code / how to key them.**

| Name | Corpus code (raw) | Why skipped / what's missing |
|---|---|---|
| FRAZ | `FRZ (SEARCH CASE ID NOT PRINCIPAL)` | Corpus says match by **Case ID**, not principal — needs a routing rule, not a WorkProvider row |
| Arianna Autos | eva `CREATE FOR EACH`, box `VRM ARIANNA` | **Per-VRM** coding — no fixed Principal code |
| Graham Coffey (2nd variant) | *(blank box code)* | Duplicate of the seeded **GGP** row; nothing to add |
| Questgates or Brownsword | `N/A` | No code on record |
| R1AM / MOTORX | `R1AM/MOTORX` | Slash = **two codes** — needs splitting into two providers |

---

## Filling the gaps

1. **The 29 missing domains** — the authoritative source is the **live job-sheet Principals tab**
   (`mapped_principals.xlsx`), which carries the real per-provider sender domains. The
   `jobsheet-import` flow is built for this but is operator-gated (live Excel/SharePoint
   connection). Alternatively, add domains as real sender evidence surfaces.
2. **The `hackneysolutions.co.uk` collision** (LEX vs QCL) — resolve ownership.
3. **The 5 unseeded** — decide Principal codes (or routing rules for FRAZ/Arianna).
4. **Re-seeding is idempotent** — upsert keyed on `cr1bd_principalcode`, so adding domains/rows
   later updates in place without duplicates.
