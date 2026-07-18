---
name: vehicle-assessment-estimate-first-refocus
description: "July 2026 estimate-first refactor of vehicle-assessment — maximum-defensible-estimate mandate, boundary with total-loss-assessment, and pending follow-ups"
metadata: 
  node_type: memory
  type: project
  originSessionId: b3847e36-59a2-42c9-b466-b3799f2f5369
---

On 2026-07-09 the vehicle-assessment skill was refactored to be **estimate-first**: the owner's
mandate is that the line-by-line repair estimate with per-line justifications is the absolute
core deliverable; everything else (identity, salvage, roadworthiness, ADAS) is supporting info.
The organising idea: the validated `assessment_payload.json` IS the estimate; the pack table,
Audatex/EVA PDF, and branded-PDF datatable are three projections of it.

Later the same day the owner sharpened the mandate: the aim is the **highest possible estimate,
defensibly** — nothing invented, but every method, knowledge source, and labelled inference must
be used to maximise the figure. Encoded as the "Costing posture — the maximum defensible
estimate" section in `vehicle-assessment/references/estimate-construction.md`: omission of
justifiable scope is a failure equal to invention; justified charges are costed as C/E/P lines,
never narrated in prose (gotcha 17); P lines sit inside the totals (sensitivity line shows the
fall if strip disconfirms); parts at OEM list unless age/instruction says otherwise; prices at
the credible top of the defensible range. Guardrail: every line must survive the opposing
engineer's "why is this here?" with named evidence / ABP condition / labelled inference.
This maximisation posture applies to vehicle-assessment (the opinion skill) only —
total-loss-assessment builds to the instructed target, which can be a cap.

Boundary redrawn with total-loss-assessment: **opinion sought → vehicle-assessment; outcome
already decided (transcription / cost-targeted build / sole-ask Audatex PDF) →
total-loss-assessment**. VA is content-canonical for shared files; sync flows VA → TLA
(enforced by `vehicle-assessment/_dev/tests/test_cross_skill_drift.py`, EOL-normalized sha256).

**Pending follow-ups (as of 2026-07-09):**
- Changes implemented and test-verified but NOT committed (user to decide; VA was untracked).
- Phase 3 deferred: sibling reverse pointers (roadworthy-report, salvage-categorisation,
  manufacturer-methods-evidence, vehicle-history-check) still name total-loss-assessment as the
  assessment hub — should be re-aimed at vehicle-assessment.
- Reference-cluster consolidation (~445-line structural/materials cluster) deliberately
  deferred until real estimate-first runs show which justification material gets cited.
- vehicle-assessment.zip needs repacking (tools/pack_skill.py) before org upload — see
  [[collisionrenderer-is-live-single-render-path]] (zips are org-upload artifacts).
