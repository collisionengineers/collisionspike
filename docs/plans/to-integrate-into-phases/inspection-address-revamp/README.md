# Inspection-address revamp — INTEGRATED

Integrated into the phase structure on 2026-06-24. The plan now lives at **Phase 4a**:
**[../../phase-4-address-and-chaser/inspection-address-revamp.md](../../phase-4-address-and-chaser/inspection-address-revamp.md)**
(decision recorded in **ADR-0016**, _Proposed_; **ADR-0013 stays binding — no runtime matcher**).

Open questions: [../../../open-questions.md](../../../open-questions.md).

> The original operator note is preserved below for provenance.

---

## Original note (operator)

The spreadsheet in this folder contains an EVA export from the last 2 years of every single inspection
address. This is now the source of truth and to entirely replace the current records of this.

Inspection address helper methods:

1. Check if provider is always image based, if so, autofill that.
2. Populate with most common locations, or location closest to accident.
3. Potential to use vision AI / geolocate and similar methods to track down locations if not within corpus.
