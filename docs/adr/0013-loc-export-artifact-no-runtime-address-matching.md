# `Loc` is an EVA-export artifact, not an intake input; the inspection address is an offline-derived suggestion, never resolved at runtime

**Status:** Accepted (2026-06-23). **Supersedes** the ROADMAP-4a "inspection-address matching service"
decision and the `190626` review's "address-match — LIVE" line (both recorded a runtime matcher that
should never have existed).

> **Framing note (read the H1 precisely).** "Never resolved at runtime" means **no AUTO-resolver** — not
> "no live address feature." Three distinct things: (1) the **offline-derived corpus** is *data* (mined
> offline, re-seeded offline) — "offline" applies **here only**; (2) a **live, human-confirmed**
> suggestion *pick* **and** a gated, reviewer-invoked **"Suggest location"** assist (vision + geocode)
> **do run at review time** — they only ever *suggest*, never auto-apply (see Consequences §60–72);
> (3) the removed **auto-matcher** is the only thing that is dead. So inspection address is a **live
> staff find/pick aid**, not an offline-only artefact.

## Context

EVA field 9 needs the **full inspection address**. EVA stores it, but its **export only surfaces a
`Loc`** — a full or, for ~57% of located cases, a **part** postcode (an outward district such as `CH5`).
`raw/.../everyrepairloc.xlsx` is that EVA export, so **`Loc` is an artifact of EVA's export limitation,
not a field that arrives in intake.** In live intake the full address is usually **not in the documents**
and is **worked out manually** by staff — from the email, domain knowledge, or, when unclear, recorded as
"Image Based Assessment" (`docs/requirements/admin-overview.md`).

The address-resolution work was already done — **offline**. Collision Engineers' own Box/EVA **case
history** was mined per provider into the master sheet
`…/codexwork/inspection_locations_and_provider_principal.csv`, mapping `(provider, Loc) → full address`.
Only the rows that carry a **real full address** are loaded (by `dataverse/.build/16-seed-suggested-addresses.ps1`)
into `cr1bd_inspectionaddress` as provider-scoped **suggestions** (`decisionMode=Unknown`,
`sourceLabel='suggested:…'`), surfaced in the Code App Address tab for a **manual pick**. This corpus is
the **static totality at this time** — improvable later, but a fixed snapshot now.

> **Update ([ADR-0016](0016-inspection-address-corpus-eva-export.md), 2026-06-24):** the suggestion
> SOURCE was later regenerated from the 2-year EVA full-address export — this no-runtime-matcher decision
> is **unchanged and re-affirmed** there; the `codexwork` CSV is now historical provenance, not the live source.

A separate, redundant **runtime matcher** had been built on a misreading of `Loc` — an Azure Function, a
companion Power Automate resolve flow, and a custom connector — that tried to re-derive a full address at
runtime by matching a Case's part-postcode `Loc` against a generic repairer corpus. It treated the
export artifact as a live input (there is no `cr1bd_loc` Case column), and it tried to make the *partial*
`Loc` a live concern. It was a fully orphaned, unwired `[BUILD]` artifact.

## Decision

1. **`Loc` is not an intake signal.** No `cr1bd_loc` column, no parser district-extraction step. The
   pipeline never resolves a partial postcode at runtime.
2. **There is exactly one inspection-address model:** the **offline-derived, full-address-only
   suggestions corpus** (`cr1bd_inspectionaddress`) → **manual staff pick/edit** → "Image Based
   Assessment" with a reason when unclear. The Code App `address-policy.ts` gate + the suggestions +
   the CaseDetail Address tab are that model, and they are correct.
3. **The live corpus is full addresses only.** A partial / bare postcode is **never loaded and never
   suggested**. Unresolved partials remain in the master sheet as a **future-investigation backlog**
   (resolve to a full address later, then add) — out of scope for the live system.
4. **The runtime matcher is removed root-and-stem** (2026-06-23): the Function, the resolve flow, the
   custom connection reference, and its design plan were deleted; the live Azure resources were
   decommissioned. It is **not archived** — this is a development system, and a wrong thing is removed,
   not kept as legacy. **Never rebuild it.**

## Consequences

- One model to reason about; no orphaned "matcher" to mistake for a live capability.
- **Suggestion *ordering* is permitted and does not reopen this ADR.** Ranking the offline-derived
  suggestions for a case — by frequency/recency, or by proximity (an accident location when present in
  the instruction, else claimant-home-address proximity) — is an **ordering signal only**: it changes
  the order staff see, **never** auto-selects, and there is still **no runtime resolver**. The Phase-4a
  proximity signal (ADR-0016) sits entirely within this bound.
- Future improvement of the corpus is **offline** (more case-history mining → more confirmed full
  addresses → re-seed the suggestions), never a runtime auto-resolver.
- **Suggestions may also be generated LIVE, per case, for the situation where the corpus *and* the case
  documents cannot identify the inspection location — provided they stay SUGGESTIONS a reviewer confirms.**
  A human-in-the-loop assist that proposes candidate location(s) from **vision over the case's own
  inspection photos** (visible signage / landmarks / plate / EXIF) and/or **geolocation of text clues in
  the instruction** (e.g. accident location, claimant address) is **permitted**: it ends in the reviewer
  picking a candidate or recording "Image Based Assessment" with a reason — **nothing auto-applies**.
- **Scope clarification (2026-06-24):** what this ADR forbids is **runtime AUTO-resolution** — the system
  deriving *and applying* a location with no human confirmation (the removed matcher). It does **not**
  forbid offline corpus building, nor live, human-confirmed candidate *suggestions*. For the avoidance of
  doubt, **partial postcodes are not an input to the live system**: they existed only as the `Loc` column of
  an EVA *export* spreadsheet (the artifact that spawned the removed matcher); intake documents do not carry
  them and the app does not handle them. See
  [`docs/architecture/inspection-address-corpus.md`](../architecture/inspection-address-corpus.md).
- This ADR is the authoritative record; the older ROADMAP-4a framing and the `190626` review line are
  superseded by it.
