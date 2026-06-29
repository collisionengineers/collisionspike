---
name: queue-case-model
description: "2026-06-20 operator process redesign — 3 queues (Not Ready/Review/Held), a Case/PO per instructions case, auto-merge instructions↔images by reg, AX inspection = \"Image Based Assessment\"."
metadata: 
  node_type: memory
  type: project
  originSessionId: 5e5bd268-e0d6-4dfb-9c9c-c735a3b9d76e
---

The operator redesigned the case-intake model on **2026-06-20 (evening)**:

- **Three queues** (was four): **Not Ready** = arrived but incomplete (instructions-only, images-only,
  merged-but-missing-details — incl. `needs_review`/`missing_*`/new/ingested/linked); **Review** =
  everything present, the human-in-the-loop check before EVA (`ready_for_eva` only); **Held** =
  exceptions + duplicates + a **staff manual hold** (`cr1bd_onhold` boolean). A blank/missing required
  detail must **not** sit in Review — it stays Not Ready.
- **Case identity:** instructions-only cases generate a **Case/PO at intake** = `Principal + 2-digit
  year + 3-digit per-(principal,year) sequence` (e.g. `AX26001`), stored in `cr1bd_casepo`; the
  provider's OWN reference stays in `cr1bd_caseref`. Image-only cases are keyed by **registration** (VRM).
- **Auto-merge:** when an instructions case and an images case share a VRM, **auto-merge** (survivor =
  the Case/PO holder; it absorbs the image evidence) → Review when complete; the human checks it in
  Review (the safety net). If **>1** candidate exists for that VRM → **Held** (`duplicate_risk`), never
  a silent merge (honours [[live-services-boundary]] caution + ADR-0010). No case→case lookup exists —
  `cr1bd_imagesourceid` targets a separate master table; merge provenance lives in
  `cr1bd_caselinkstate=Linked` + the `cr1bd_duplicatekeys` memo.
- **AX inspection address is deliberately `"Image Based Assessment"`** (AX is an image-based assessor) —
  do **NOT** extract the PDF "Bodyshop Details" address for AX. The earlier bug was it saved *blank*;
  `CS Parse` now defaults it. Other providers: extract a real address or leave blank → Not Ready.

**Why:** the operator is changing their real-world process to accept instructions and images
separately and reconcile them by registration. **How to apply:** implemented in
`mockup-app/src/mock/queues.ts` (the 3-queue map + `statusToStage`), the `CS Parse` / `CS Intake` /
`CS Case Resolve` live flows, the `cr1bd_onhold` + `cr1bd_casepo` columns, and ADR-0010. **Live is
authoritative; the repo `intake.definition.json` trails live.** Live flow edits used the
byte-identical-trigger technique — see [[flow-webhook-trigger-provisioning]] and
[[live-services-boundary]].
