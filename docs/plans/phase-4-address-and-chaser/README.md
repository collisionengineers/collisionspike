# Phase 4 — Inspection Address & Chaser

**Goal:** give staff a **manual** inspection-address decision — pick from offline-derived
**full-address** suggestions, or fall back to "Image Based Assessment" with a reason — and draft
chasers for partial cases (never auto-send).

> **Inspection-address model ([ADR-0013](../../adr/0013-loc-export-artifact-no-runtime-address-matching.md)).**
> `Loc` is an EVA-**export** artifact, **not** a runtime input. The full inspection address is derived
> **offline** from case history into a static, full-addresses-only suggestions corpus
> (`cr1bd_inspectionaddress`) → staff **manual** pick → "Image Based Assessment" with a reason. Partials
> are a future-investigation backlog, **never** live. There is **no** runtime matcher — the runtime
> matcher (Function + resolve flow + connector) was **removed 2026-06-23**. See
> [../../architecture/inspection-address-corpus.md](../../architecture/inspection-address-corpus.md).

> **Milestones in this phase** ([milestone-model](../milestone-model.md)): **4a** address-**policy** gate
> **and** the offline full-address suggestions corpus = **M1**; **4b** chaser-send = **M2**; **4a** Azure
> Maps = **M3**.

**Status:** inspection-address is **offline suggestions + manual confirm** (corpus modelled, policy gate
in the Code App); the runtime matcher was **removed 2026-06-23** (ADR-0013). Chaser is **draft-only,
built + imported off**. See [../../../ROADMAP.md](../../../ROADMAP.md) Phase 4.

## Implementation checklist (by feature)

**4a · Inspection address (offline corpus + manual confirm)** — [../../architecture/inspection-address-corpus.md](../../architecture/inspection-address-corpus.md), [ADR-0013](../../adr/0013-loc-export-artifact-no-runtime-address-matching.md)
1. [x] Address-policy gate in the Code App (per-provider; no silent "Image Based Assessment")
2. [x] Known-site reference data modelled + seeded (`InspectionAddress` + `Repairer`, Phase 1b)
3. [x] **Offline full-address suggestions corpus** (`cr1bd_inspectionaddress`) derived from case history; staff **manual** pick, or "Image Based Assessment" with a reason. The runtime matcher was **removed 2026-06-23** (ADR-0013); partials are a future-investigation backlog, never live. **Revamped (offline) 2026-06-24** ([ADR-0016](../../adr/0016-inspection-address-corpus-eva-export.md) _Proposed_): the suggestion layer is now regenerated from the **2-year EVA full-address export** (provider from `Case ID` prefix; VRM-individual branch; full-address dedup; frequency/recency ranking surfaced in the Code App) via a new pre-processor + `16-seed -ReplaceSuggestions` (backup-first). **Built offline; the live `-Apply` replace ran 2026-06-24 (backup-first; `17-verify` all-pass).** ADR-0013 unchanged — ordering only, no auto-select. See [inspection-address-revamp.md](./inspection-address-revamp.md).
4. [ ] Azure Maps (gated) — only if needed, later

**4b · Chaser automation (ADR-0003)** — covered by [../m2-umbrella-enrichment-to-scale.md](../m2-umbrella-enrichment-to-scale.md) §10
5. [x] `chaser-draft` flow built (imported off); draft-only behind the outbound kill switch
6. [ ] 🔒 Activate **draft-only** chasers — confirm a chaser drafts (never sends), targeting the right garage
7. [ ] Wire chaser targeting to the garage↔provider coverage (N:N) once **Phase 1b.3 Input 4** is loaded

## Plans in this phase

- [../../architecture/inspection-address-corpus.md](../../architecture/inspection-address-corpus.md) — the 4a offline-corpus + manual-confirm model (ADR-0013).
- Chaser (4b) lives in the M2 umbrella: [../m2-umbrella-enrichment-to-scale.md](../m2-umbrella-enrichment-to-scale.md).

## Needs the operator

Chaser activation is a hard blocker; targeting depends on the gated clarifying-info Input 4. See
[../../gated.md](../../gated.md).
