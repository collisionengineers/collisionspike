---
name: inspection-type-vs-location-ruling
description: Binding operator ruling (2026-06-21) — inspection TYPE (Desktop, always-on) is orthogonal to inspection LOCATION (image-based vs address); desktop-% is NEVER a modality signal; RJS is address-based.
metadata:
  type: project
---

Two **orthogonal axes** govern a case's inspection, and they must **never** be conflated (operator
ruling 2026-06-21, binding):

1. **Inspection TYPE = "Desktop Inspection".** It goes on **every** CE case (even AX) — a constant
   report-production label. It is **NEVER a signal of anything**. A high `desktop_pct` can therefore
   **never** contradict an "address" inspection policy.
2. **Inspection LOCATION = image-based ("Image Based Assessment") vs a real physical address.** This is
   the only axis that varies, and the only thing a provider's location policy encodes. The real
   discriminator is **loc-rate**, NOT desktop-%. A provider's "address"/storage-yard postcode is usually
   just *where to source* the printed inspection-address string for a (still desktop-produced) report —
   not a physical-inspection requirement (the AX precedent).

**RJS (Robert James Solicitors) is ADDRESS-BASED, not image-based.** An earlier "flip RJS to
AlwaysImageBased" recommendation (based on 1754/1754 desktop + a physical-letter generator) was **WRONG**:
desktop-% is the report-type, not the modality, and a physical-booking letter does not make the EVA
*location* image-based. The adversarial pass over the last-12-months EVA contradictions settled at
**33 REFUTE / 0 CONFIRM** after this ruling overturned the lone RJS CONFIRM — every job-sheet-derived
location policy stands.

**Why:** the operator is explicit and anti-hardcode — the document's own wording (and the offline
loc-rate evidence), not a per-provider desktop-% heuristic, decides whether a case is image-based.

**How to apply:** never treat "this provider produces desktop reports" as evidence the LOCATION is
image-based. The per-provider rules (mailbox, instruction notes, location policy, image-source notes)
were sourced from the CE Job Sheet `Principals` sheet and now live in the Postgres `work_provider`
corpus; the inspection-address suggestions live in `inspection_address` (offline-derived, full-address
only — there is no runtime matcher; see ADR-0013). Relates to [[queue-case-model]],
[[enrichment-mileage-caveat]], [[user-profile]].
