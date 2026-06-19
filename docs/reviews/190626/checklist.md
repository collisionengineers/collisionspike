# Checklist:

> Status legend: ✅ done, built & live-verified · ⏳ operator-gated.
> All UI work is in `mockup-app/`; offline build (`npm run build`) is green, **204/204 tests pass**, and
> the app was **pushed live (`pac code push`) and verified on the deployed player** on 2026-06-19
> (Dashboard, nav IA, New case pick + manual form, red-bar-gone, logo). The deployed console shows only
> pre-existing Power Apps **host** noise (the `React.createElement … undefined` from the host shell
> components "Me"/"A"), not app errors. Note: overview.md labels 5a=queues / 5b=caseview, but this
> checklist (authoritative) maps **5a=caseview**, **5b=queues** — see docs/reviews/README.md.

# Task 1a:

Requirements: Confirm all documents and paths amended to confirm new review requirements.

Changes made and actions taken: ✅ Created **`docs/reviews/README.md`** documenting the binding-review
convention: dated `docs/reviews/<DDMMYY>/` folders are authoritative manual reviews that correct drift +
set requirements and are **superseded only by a later review** (outranking older docs/plans/ADRs/code);
documented the folder structure (overview/process/checklist + per-area subfolders with images), the
action method (view all images → steps as to-dos → implement → fill checklist), the count-check and the
overview-vs-checklist label-swap watch-out. Wired pointers into **`CLAUDE.md`** (new "Binding reviews"
note + `reviews/` in the layout tree) and **`AGENTS.md`** (new "Binding reviews outrank everything older"
section). Added an index row for `190626`.

# Task 1b:

Requirements: Confirm files changed for broad-review.md/review.md tasks and steps taken to test, validate, and verify [3 issues raised on broad-review, with the third issue requiring 5 seperate checks], all must be addressed here]

Changes made and actions taken:

**Issue 1 — EVA required fields, reformatted to API + process reqs.** ✅ Authored
**`docs/architecture/eva-field-model.md`** reconciling the EVA **Sentry API** required set
(RequestFrom/ExternalRef/VehReg/ClmNo/InsName/InspType/InUse/ClmAddr/CoverType/InstEmail), the
**Collision process** set, and the **M1 drag-drop 12-field** wire contract (left byte-stable on
purpose — re-cutting it would ripple parser/flow/schema/parity). Relabelled the EVA field
`Date of Loss → Date of Incident` in `mockup-app/src/contracts/eva-export.ts` (display only; payload key
stays `date_of_loss`). The **new-case form** (Task 4) now captures the full required superset (VRM,
Principal, Work provider, Case/PO, Insured Name, Claim No, Incident Date, Inspection date defaulting to
today, Inspection address) and presents required state as `*` / "Required" not verbose sentences. Recorded
InspType = constant "Vehicle Damage Inspection", CoverType = TBA, and the Minotaur relaxation follow-up
(CoverType/InstEmail/InUse).

**Issue 2 — floating red bar.** ✅ Done. The stray red element was the `SectionHeading` 40px free-floating
`<hr>` hairline under the eyebrow (`mockup-app/src/components/SectionHeading.tsx`) — it sat at a
different spot on every page, reading as a bar floating in random places. **Removed** it; the red eyebrow
keeps the brand accent. **Live-verified gone** on the deployed Dashboard + New case screens after
`pac code push` (no stray red dash under OVERVIEW/INTAKE).

**Issue 3 — capability status (5 checks), verified read-only on Azure 2026-06-19:**
1. **DVLA/DVSA enrichment — GATED-OFF.** Function `cespkenrich-fn-gi62sd` is deployed/Running and
   reachable (OPTIONS→204, keyless POST→401), but the authoritative live Dataverse gate
   `cr1bd_ENRICHMENT_ENABLED` is **effective-false** (the `05-envvars.ps1` deploy-blocker override won;
   `environment-variables.json`/`verify-parity.mjs` say `true` but are stale). Capabilities = **mileage
   estimate + vehicle make/model only**; **no VAT route exists**. Gap to usable: flip the gate, set
   `ENRICHMENT_API_BASE`, confirm DVSA/DVLA creds (currently plain app-settings, not Key Vault refs),
   bind `cr1bd_dvsaenrich` — operator steps.
2. **OCR (images / reg / docs) — BUILT-NOT-DEPLOYED.** `ce-ocr:latest` is in ACR `cespkocracraeee76`;
   there is **no** `cespkocr-fn` Function and **no** Container App (FQDN → HTTP 000). Routes
   `/api/ocr-pdf` + `/api/plate-ocr` exist in `ocr/`. Not live.
3. **postcodes.io (address-match) — LIVE.** `cespkaddr-fn-i7m4re` deployed/Running, reachable
   (204/401); `POSTCODE_IO_BASE=https://api.postcodes.io`, `AZURE_MAPS_ENABLED=false`. Needs only its
   connector bound + flow wiring to be exercised end-to-end.
4. **AI features — NOT-PRESENT.** `az cognitiveservices account list -g rg-collisionspike-dev` is empty;
   `COPILOT_ENABLED` / `AIBUILDER_CLASSIFY_ENABLED` are off; Copilot + image-classification are
   plan-only (`plans/valuation-and-copilot.md`, `plans/image-classification-ai.md`). Nothing provisioned.
5. **Document AI — NOT-PRESENT as a service; parsing is the Python engine.** No Document Intelligence /
   Form Recognizer in the RG. The live parser uses the vendored **PyMuPDF `cedocumentmapper_v2`** engine
   (gate `cr1bd_PDF_MAPPER_ENABLED` effective-**true** — the one M1 capability that is ON). DI Read is
   only an optional, un-deployed provider inside the OCR host.

The UI reflects this honestly: the new-case "Look up vehicle" + "Normalise address" buttons call gated
clients that return a clear "not connected" message rather than fabricating values; VAT stays manual.

# Task 2:

Requirements: Confirm files changed for dashboard/review.md tasks and steps taken to test, validate, and verify [6 issues raised on dashboard, all must be addressed here]

1. "Live work - drainable now":

Changes made and actions taken: ✅ Removed the "Live work · drainable now" region entirely
(`mockup-app/src/screens/Dashboard.tsx`) — it duplicated the funnel tiles and the wording was poor. The
re-cut **PipelineStrip** funnel now carries the live depth and is **clickable** (each stage navigates to
its queue), so no separate "drainable now" row is needed.

2. Annotations from images, 5 issues in total.

Changes made and actions taken:
- **Area 1a (questionable tiles).** Re-cut the pipeline funnel from New/Parsing/Review/Chasing/Ready/
  Submitted/Box to **New → Not ready → Review → Submitted** (`mock/queues.ts` `PipelineStageKey` +
  `statusToStage` in `dataverse-source.ts` + `PipelineStrip.tsx` skeleton + `mock-source.ts`). "Parsing"
  (instant-ish) and "Box" (== Submitted) are gone; "Chasing" folds into **Not ready** (= awaiting-images
  + images-only).
- **Area 1b (Review excludes auto-ready).** "Ready" no longer has its own tile — `ready_for_eva` folds
  into **Review** (a "ready" case still needs human sign-off; a full-auto provider auto-submits and never
  lands here).
- **Area 2 (logo white-vs-red clash).** Resolved in the chrome (Task 3): one brand mark only — white
  reverse logo on a **CE-red** rail header band; the top bar now carries a neutral menu burger, not a
  second differently-coloured logo. Red is the brand colour ("choose red"), design system intact.
- **Area 3 (nav cut-off).** Fixed in `AppShell.tsx` (Task 3): rail widened to 240px, per-row right
  padding added so count pills never clip, and Audit's clipped "Soon" tag removed (it's a real page now).
- **Area 4 (dev copy).** Removed the "Clear the backlog — chase what is aging…" subtitle and the
  "· drainable now" / "· windowed" jargon from the region labels.
- Plus: the new **Exceptions** queue is surfaced on the dashboard as a red bar when `> 0`
  (links to `/queue/exceptions`).

# Task 3:

Requirements: Confirm files changed for nav-bar/review.md tasks and steps taken to test, validate, and verify [6 issues raised on dashboard, all must be addressed here]

Changes made and actions taken: ✅ Rewrote `mockup-app/src/components/AppShell.tsx` + `routes.tsx`:
1. **Corpus → "Provider settings"** (rail label; screen heading updated in Task 6).
2. **Audit → "Action logs"** — now a real page (`screens/ActionLogs.tsx`, route `/logs`) reading the
   audit-event seam (`data.recentActivity`), replacing the disabled "Soon" stub.
3. **"Done (today)" removed as a page** — terminal cases show in dashboard throughput + Action logs, not
   as a backlog queue.
4. **Merged In progress + Needs action + Ready for EVA into one Queues page** with the natural-state
   tabs — **Instructions (awaiting images) / Images only / Ready for review** + **Exceptions**
   (`mock/queues.ts` QUEUES re-cut; `CaseList.tsx` tabs).
5. **"Add evidence" second intake** (`screens/AddEvidence.tsx`, route `/evidence`) — links uploaded
   photos/email to an **existing** case (search → pick case → choose files), never creating one.
6. **Queues is a first-class, expandable nav group** — a "Queues" button that toggles its four
   sub-options (auto-opens on a queue route; shows the four queue icons when the rail is collapsed).

# Task 4:

Requirements: Confirm files changed for new-case/review.md tasks and steps taken to test, validate, and verify [17 issues raised on dashboard, all must be addressed here]

Changes made and actions taken: ✅ Overhauled `mockup-app/src/screens/ManualIntake.tsx` — all 17 issues
(build green; 204/204 tests; **live-verified** on the deployed app):
1 drag-and-drop dropzone (`onDrop` + dragging visual); 2 removed the base64 dev copy; 3 de-AI'd Parse
button (`ScanText`, not `Sparkles`); 4 short neutral subtitle (dropped "…no inbox required"), heading
"New case"; 5 automatic read-only **case-type badge** via `caseTypeOf` ("Instructions only" etc. — never
a control); 6 **multi-file** — the first instruction doc is parsed, extra images/.eml/.msg ride along as
evidence, the picker persists with a removable chip list; 7 **split identity fields** — Vehicle
Registration (VRM, an EVA field), **Work provider + Principal both**, Case/PO, Provider's reference/Claim
No, Insured Name, "Initial status"→**"Intake status"** (all wired into `createCase`); 8 removed the
"Write provenance rows" dropdown → a single checkbox; 9 no AI box; 10 **"Normalise address"** button
(gated postcodes.io); 11 **Make** field + **"Look up vehicle (DVLA/DVSA)"** filling Make/Model/Mileage;
12 mileage via the same lookup; 13 **"Date of Incident"** (label from the contract); 14 removed the
Dashboard **back button**; 15 EVA **required set** with red `*` / "Required", Inspect-on defaulting to
today, InspType recorded as the "Vehicle Damage Inspection" constant; 16 VAT **stays manual** (DVLA/DVSA
return no VAT) with a note; 17 **"Enter manually (no document)"** path seeding an empty form. Backed by
the new gated `data/enrichment-client.ts` + extended `CreateCaseInput` (insuredName/providerReference)
mapped to the existing `cr1bd_ovinsuredname`/`cr1bd_ovclaimnumber` columns. **Live screenshots confirmed**
the pick step (drag-drop, manual-entry, neutral parse icon, no back button) and the manual review form
(case-type badge, VRM/Work provider/Principal/Case-PO/Claim No/Insured Name, Look-up-vehicle, Required
markers).

# Task 5a:

Requirements: Confirm files changed for queues-cases/caseview/review.md tasks and steps taken to test, validate, and verify [11 issues raised on dashboard, all must be addressed here]

Changes made and actions taken: ✅ `mockup-app/src/screens/CaseDetail.tsx` + `components/ChaserPanel.tsx`:
1. Reduced text noise throughout (the cuts below).
2. "Case facts (read-only) — does NOT drive readiness" → **"Imported details / From the instruction
   document / email — for reference."** (source defined, dev phrasing gone).
3. "Upload evidence" mock → **"Add evidence"** routing to the real `/evidence` intake.
4. "Export JSON (gated fallback)" → **"Export EVA JSON"**, and shown **only when the case is ready**
   (readiness passes) — satisfies queues #2.
5. Required-field error text `"<label> is required for EVA"` → **"Required"** (the label already carries
   `*`).
6. Address: removed the placeholder "suggestion" text and the verbose override-reason guidance;
   "Inspection address (EVA field 9)" → "Inspection address".
7. Chasers: rebuilt `ChaserPanel` in the minimalistic Job-Sheet style.
8. "Log as drafted" → **"Log as chased"**, which now drops an **auto-note** on the case.
9. **Removed "Mark held"** — a case's held/open state derives from what it's missing.
10. **Removed the ADR-0003 caption and the contradictory greyed "Send via Outlook"** button.
11. Evidence tab: collapsed the **3 separate no-image messages into one** (the sidebar readiness keeps
    the single canonical blocking signal).

# Task 5b:

Requirements: Confirm files changed for queues-cases\queues\review.md tasks and steps taken to test, validate, and verify  [3 issues raised on dashboard, all must be addressed here]

Changes made and actions taken: ✅ `mockup-app/src/screens/CaseList.tsx`:
1. Dropdowns: **Provider** filter now lists only providers **with a case in the active queue** (derived
   from loaded rows, not the whole corpus); **Status** filter shows **only where the queue spans multiple
   statuses** (hidden on single-status queues); a per-queue subtitle **defines "Needs action"** (a chase
   is due — weekly cadence — or the case is past due).
2. **Export JSON gated to ready cases** — handled on the case workspace (Task 5a #4): the Export EVA JSON
   action only appears once readiness passes.
3. **New Exceptions queue** for items that can't pass through automatically (missing the basics — VRM /
   claimant), added to the queue IA (`mock/queues.ts`) + surfaced on the dashboard.

Task 6:

Requirements: Confirm files changed for corpus-admin\review.md tasks and steps taken to test, validate, and verify  [4 issues raised on dashboard, all must be addressed here]

Changes made and actions taken: ✅ `mockup-app/src/screens/Admin.tsx` — renamed **"Corpus administration"
→ "Provider settings"** (matches the nav; **live-verified**), "Other corpora" tab → "Reference data"
(build green; 204/204 tests):
1 each provider row shows Active/Archived + an honest **"Last used —"** (recency isn't tracked in M1 —
tooltip, no invented dates); the **Active / Archived / All segmented counts** are now the prominent place
counts live. 2 the empty "Other corpora" placeholders became read-only **reference-data summary cards**
with seeded counts (**Repairers 61, Image sources 23, Inspection addresses 174**) + "Reference ·
read-only" badges. 3 the **"Assisted import" copy was rewritten to plain language** — all `[BUILD]` /
`[DEPLOY-WITH-LOGIN]` / "no live SharePoint contact" jargon removed; the disabled affordance →
"Attach sheet (coming later)". 4 a front-and-centre working-note explains the genuinely-functional
provider editor (search/filter/edit domains + policy + automation in local state) and that activation is
operator-gated — the honest boundaries now read as intentional M1 product state, not broken stubs.
