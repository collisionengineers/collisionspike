# `Loc` is an EVA-export artifact, not an intake input; the inspection address is an offline-derived suggestion, never resolved at runtime

**Status:** Accepted (2026-06-23). **Supersedes** the ROADMAP-4a "inspection-address matching service"
decision and the `190626` review's "address-match — LIVE" line (both recorded a runtime matcher that
should never have existed).

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
- Future improvement of the corpus is **offline** (more case-history mining → more confirmed full
  addresses → re-seed the suggestions), never a runtime resolver. See
  [`docs/architecture/inspection-address-corpus.md`](../architecture/inspection-address-corpus.md).
- This ADR is the authoritative record; the older ROADMAP-4a framing and the `190626` review line are
  superseded by it.
