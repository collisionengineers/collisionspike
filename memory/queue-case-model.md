---
name: queue-case-model
description: Operator's intake process model — 3 queues (Not Ready/Review/Held), Case/PO minted at intake, auto-merge instructions↔images by VRM with >1 candidate → Held (never a silent merge), AX = Image Based Assessment.
metadata:
  type: project
---

The operator's case-intake process model (designed 2026-06-20, now implemented on the Azure stack in
`packages/domain/src/model/queues.ts` + `packages/domain/src/contracts/case-status.ts`):

- **Three status-derived queues:** **Not Ready** = arrived but incomplete (instructions-only,
  images-only, merged-but-missing-detail; `new_email`/`ingested`/`missing_*`/`needs_review`/`linked`);
  **Review** = everything present, the human-in-the-loop check before EVA (`ready_for_eva` only);
  **Held** = exceptions + duplicate-risk + a staff manual hold. A blank/missing **required** detail
  must **NOT** sit in Review — it stays Not Ready.
- **Case identity:** instructions cases mint a **Case/PO at intake** = `Principal + 2-digit year +
  3-digit per-(principal,year) sequence` (e.g. `AX26001`); the provider's own reference is kept
  separately. Image-only cases are keyed by **registration (VRM)**.
- **Auto-merge by VRM:** when an instructions case and an images case share a VRM, auto-merge (survivor
  = the Case/PO holder, which absorbs the image evidence) → Review when complete. **If >1 candidate
  exists for that VRM → Held (`duplicate_risk`), NEVER a silent merge** — the human is the safety net
  (ADR-0010, dedup is reference-disambiguated with no time-window).
- **AX inspection address is deliberately `"Image Based Assessment"`** (AX is an image-based assessor) —
  do **not** extract the PDF "Bodyshop Details" address for AX. Other providers: extract a real address
  or leave blank → Not Ready.

**Why:** the operator changed their real-world process to accept instructions and images **separately**
and reconcile them by registration; the queues encode "is this case ready for a human to push to EVA?"
not who owns it.

**How to apply:** keep blank-required cases out of Review; never silently merge an ambiguous VRM; treat
AX as image-based by policy. Modality decisions follow [[inspection-type-vs-location-ruling]] (desktop-%
is never the signal). Canonical: ADR-0010 + `docs/adr/0014-audit-case-type-second-inspection.md` for the
audit overlay on this model ([[audit-case-type]]).
