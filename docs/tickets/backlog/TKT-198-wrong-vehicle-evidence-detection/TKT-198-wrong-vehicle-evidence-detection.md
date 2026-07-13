---
id: TKT-198
title: Flag photos that show a different vehicle
status: backlog
priority: P1
area: evidence
tickets-it-relates-to: [TKT-016, TKT-064, TKT-123, TKT-126, TKT-131, TKT-146, TKT-160, TKT-161, TKT-167, TKT-179]
research-link: docs/tickets/backlog/TKT-198-wrong-vehicle-evidence-detection/evidence/info.md
plan: PLAN-004
---

# Flag photos that show a different vehicle

## Problem
Photos for a case can evidently show another vehicle, most reliably through a different readable registration and sometimes a different colour. The photo may be third-party evidence, a handler mistake or an intake/classification fault. If it remains silently included, it can distort image completeness and be sent to EVA as though it shows the inspected vehicle.

The system must catch high-confidence conflicts without deleting evidence or treating uncertain registration/colour recognition as fact. A handler needs to decide whether the image is the correct vehicle, useful third-party evidence or an accidental addition.

## Evidence
- [Operator note](./evidence/info.md) — asks for evidently different vehicles, mainly different registration/colour, to default to excluded with a warning and recognises third-party, staff-error and automation-error causes.
- TKT-064 provides image role/registration-visible classification; TKT-123 provides the current Exclude decision pattern; TKT-160 separately owns intentional image deletion.
- TKT-126 and the EVA photo-order rules make inclusion consequential: only confirmed case-vehicle images should enter the ordered EVA image set.

## Proposed change
PROPOSED (not built): compare each image’s readable registration with the canonical case registration after normalization, retaining the observation and classifier/threshold version. Run in warning-only shadow mode until a versioned operator-approved corpus establishes a numeric activation threshold with zero unsupported automatic exclusions. Only then may a qualifying mismatch set TKT-179’s single Photo use state to “Do not use” with reason “Possible different vehicle” and “Needs decision”. Colour may corroborate a plate mismatch but never auto-excludes alone.

Never delete or auto-move the image. Present plain choices: “Correct vehicle”, “Third-party vehicle” and “Added by mistake”. The latter two remain excluded from EVA; deletion, if later requested, follows TKT-160.

## Acceptance
- **A1.** For every case-linked image with a readable registration, the system compares canonical normalized plates while preserving raw observed text, case value, classifier version, numeric activation-threshold version and decision source. “High confidence” means the observation meets that committed threshold; it is not a free-text judgement.
- **A2.** Automatic default remains disabled until the full operator-approved evaluation corpus and declared slices show zero unsupported auto-exclusions at the chosen threshold. After activation, a qualifying non-equal registration sets TKT-179 Photo use to “Do not use” with reason “Possible different vehicle” and Needs decision; colour can corroborate but cannot independently trigger it.
- **A3.** An unreadable/partly obscured plate, low-confidence recognition, colour-only difference or missing case registration cannot auto-exclude an image. It may show “Check this photo” with the reason, but remains an unresolved human decision rather than a claimed mismatch.
- **A4.** The warning shows case registration/colour where known, observed registration/colour, confidence-safe wording and the evidence source. Raw model/service terms, scores and internal identifiers are not rendered to handlers.
- **A5.** The three explanations map through TKT-179 rather than a parallel decision UI: “Correct vehicle” clears the automatic mismatch reason and restores the prior Photo use state (or “Not decided”), without automatically choosing “Use for EVA”; “Third-party vehicle” and “Added by mistake” keep Photo use “Do not use” with their respective reasons. The latter may offer TKT-160’s separate delete route. No option automatically deletes or moves bytes.
- **A6.** A signed-in handler decision is authoritative over later classifier reruns until explicitly changed. Every automatic default and staff change records actor/source, reason and time; replay cannot create repeated warnings or overwrite the decision.
- **A7.** Excluded/third-party/wrong-vehicle images are omitted consistently from readiness counts, missing-image satisfaction, photo order and EVA export, while remaining visible in general evidence/history. Correcting the decision recomputes those consumers once.
- **A8.** The comparison and decision work for email/PDF extraction, Manual Intake, direct evidence upload and Archive-upload classification, with the same normalized case identity and no source-specific bypass.
- **A9.** The versioned operator-approved corpus includes matching plates with spacing/angle variation, true mismatch, recognition false positives, unreadable/partial plate, colour-only difference, registration+colour conflict, missing case registration, every staff outcome and every source lane. Activation evidence publishes corpus composition, threshold, precision/recall by slice and the required zero unsupported auto-exclusions.
- **A10.** Signed-in deployed proof uses naturally occurring, operator-designated real evidence to demonstrate available warning/default/staff outcomes and absence from EVA preparation without deletion. Manufactured matching/mismatch images run only in an isolated non-live deployment; unavailable live outcomes remain PENDING.

## Validation
- **Offline/isolated:** add normalized-registration/threshold decision tables, the approved classification corpus, calibration and shadow/activation gates, TKT-179 state-transition tests, audit/idempotency tests, downstream integration tests and SPA coverage across every source lane.
- **Signed-in/live:** inspect naturally occurring operator-designated evidence and genuine handler decisions read-only except for operationally required changes. Record classifier/threshold version, warning/state and downstream effect; do not add fake photos or disposable cases to the live app.
- **Regression:** rerun image role/registration recognition, reflection, evidence decision, image-gap chaser, photo order, EVA export, Archive webhook and individual-delete suites. Measure false-exclusion rate on the existing labelled image corpus before activation.

## Research
Distilled 2026-07-13 from the [operator note](./evidence/info.md). The acceptance deliberately treats colour as corroborating/attention evidence rather than a sole automatic exclusion signal.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/info.md)
