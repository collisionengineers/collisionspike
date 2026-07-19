# Distillation note — TKT-256

**Source:** `03-cloud-estate-cleanup.md` scope item 5. **Plan:** PLAN-009. Verified read-only 2026-07-19 —
banked in the [PLAN-009 live-verification dossier](../../../plans/PLAN-009.dossier.md).

**Topology (live):** App Service plans are one-per-app, all Flex/FC1; storage accounts are one-per-app (the
evidence blob store is separate). Application Insights, however, is **not** one-per-app — a small number of
components serve all the function apps, with most focused apps routing to a single shared component and only
the two app-tier apps plus OCR carrying dedicated components. This **corrects** the draft's "each carry their
own App Insights".

**Implication for the assessment:** consolidating plans/storage would not simplify telemetry (already shared),
and Flex plans are already per-app; the maintenance win is therefore narrower than the draft assumed, and must
be weighed against real migration risk (cold-start, identity, deployment blast radius, scaling isolation).

**Read-only:** this ticket produces an assessment only; it executes no change. Its output is an input to
PLAN-011's Python sharing decision. Gated on TKT-246's topology ADR as framing.
