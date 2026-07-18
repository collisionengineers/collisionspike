---
name: jobsheet-provider-rules
description: "CE Job Sheet (raw/Backup of CE Job Sheet 260429.xlsm) Principals sheet = per-provider rules, mapped to cr1bd_workproviders. KEY: inspection TYPE ('Desktop Inspection', always on) is ORTHOGONAL to inspection LOCATION (image-based vs address) — desktop-% is NEVER a modality signal. After operator ruling 2026-06-21: ZERO genuine contradictions (RJS is address-based, not image-based)."
metadata: 
  node_type: memory
  type: project
  originSessionId: 5e5bd268-e0d6-4dfb-9c9c-c735a3b9d76e
---

The CE Job Sheet backup **`raw/Backup of CE Job Sheet 260429.xlsm`** has 4 sheets; **Principals**
(58 rows) is the per-provider rules register. Columns: Solicitor/Work Provider · EVA Code · Box Code ·
Inbox · Solicitors Instructions · Drag in to EVA? · Sent Mino · Images location · **Image based or
address** · Sending Report. They map 1:1 to existing `cr1bd_workproviders` fields:
inbox→`cr1bd_defaultmailbox`, instructions→`cr1bd_instructionnotes`, drag→`cr1bd_dragintoeva`,
images/storage→`cr1bd_imagessourcenotes`, modality→`cr1bd_inspectionlocationpolicy`
(AlwaysImageBased=100000000 / PreferAddress=100000001 / RequiredAddress=100000002),
sending report→`cr1bd_reportreturnnotes`.

**Applied 2026-06-21 (write-into-empty, 46 live rows):** added `cr1bd_instructionnotes` +
`cr1bd_reportreturnnotes` (were empty); the corpus had ALREADY curated
policy/imagessourcenotes/mailbox/drag (the S14 provider-corpus pass) → **preserved, not clobbered**.
Multi-channel providers (KBS×4, RJS×3, KMR×2, QCL×2, YML×2) share ONE live row → notes merged.
Artifacts + re-runnable apply script: `raw/principalandrepairersheets/outputs/jobsheet_rules/`
(apply_plan.json, apply_plan.noLiveRow.json, contradictions.md, apply_to_corpus.ps1).

**TWO ORTHOGONAL AXES (operator ruling 2026-06-21, binding — do NOT conflate):**
1. **Inspection TYPE = "Desktop Inspection".** It **always goes on** every CE case (even AX) — a constant
   report-production label, **NEVER** a signal of anything. A high `desktop_pct` can therefore **never**
   contradict a job-sheet "address" note.
2. **Inspection LOCATION = image-based ("Image Based Assessment") vs a real physical address.** This is the
   only axis that varies and the only thing `cr1bd_inspectionlocationpolicy` encodes. The real
   discriminator is **loc-rate** (`claudeschoice/principal_loc_rate.csv`), not desktop-%. A job-sheet
   "address"/storage-yard postcode is usually just WHERE TO SOURCE the printed inspection-address string
   for a (still desktop-produced) report — not a physical-inspection requirement (the AX precedent).

**Contradictions vs last-12-months EVA → ZERO genuine.** The adversarial pass over 33 candidates first
read 32 REFUTE / 1 CONFIRM (RJS); the **2026-06-21 operator ruling overturned the RJS CONFIRM**
(*"Desktop inspection always goes on. Whether the LOCATION is image based is a different matter entirely.
RJS is not an image based inspection."*), giving a final **33 REFUTE / 0 CONFIRM** — every
job-sheet-derived address policy stands.

**RJS (Robert James Solicitors) is ADDRESS-BASED, not image-based.** My earlier "flip to AlwaysImageBased"
recommendation (based on 1754/1754 desktop + its `rjs_docx.py` physical-letter generator) was **WRONG** —
desktop-% is the report-type, not modality, and a physical-booking letter does not make the EVA *location*
image-based. **No live fix was needed:** the live RJS row was already `PreferAddress (100000001)` and
write-into-empty protected it — the intended `AlwaysImageBased` override never landed. The corpus
`imagessourcenotes` even classifies RJS `modality=site-inspected`, corroborating address-based. The
`apply_plan.json` RJS override + `contradictions.md` CONFIRM were corrected/annotated 2026-06-21.

**Operator to-dos (unchanged):** confirm ZEN↔ZENITH (possible duplicate), split R1AM/MOTORX, and decide
rows for the 4 no-live-row providers (Arianna per-VRM; FRAZ/FRZ search-by-CaseID; Questgates valuation-only;
GGP 2nd channel). Cross-ref [[queue-case-model]], [[provider-corpus-analysis]],
[[inspection-image-based-detection]].
