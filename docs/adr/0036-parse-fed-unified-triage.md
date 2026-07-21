# ADR-0036 — Parse-fed unified triage (amends ADR-0019)

**Status:** Accepted (2026-07-21). Amends [ADR-0019](./0019-triage-policy-stage-split.md).

## Context

[ADR-0019](./0019-triage-policy-stage-split.md) established the intake triage
architecture: Stage A (`classifyInbound`, deterministic text-signal classification), Stage B
(`triagePolicy`, `decideTriage` domain routing over live open-case context), and Stage C
(`triageClassify`, gated AI second opinion). Those three ran as separate Durable activities, and —
critically — **parse ran AFTER triage**. So the parser's own reading of an attached document (the
registration/reference inside a PDF, and its content-derived document type) could not inform the
triage decision. `detection/attachment_typing.py`'s own docstring named this: content typing "cannot
feed back into `classify_email`'s Rule 1 corroboration gate without a pipeline reorder." Two concrete
gaps followed: an email whose only Case-reference lives inside the attachment could not be matched to
its open case; and a photos-only PDF with a generic filename (`scan0091.pdf`) was routed by a filename
heuristic rather than by what the document actually contained.

## Decision

1. **Parse precedes triage.** The `parse` activity is hoisted to run immediately after
   `providerMatch`, before triage, for any doc-bearing email (`orderParseCandidates(...) > 0`). This
   repositioning is permanent and is not gated.
2. **Stage A gains parse-derived inputs.** `classify_email()` accepts `attachment_content_typings`
   (per-attachment content type, reconciled per file) and `open_case_ref_match` (a pre-classify
   open-case probe result). The parsed Case-ref/VRM is also injected into the classification the
   domain policy sees, so a document-only reference reaches `decideTriage`'s ref-gate.
3. **Stage A + Stage B compose into one activity** (`triageUnified`), replacing the two-call
   `classifyInbound` + `triagePolicy` sequence in the intake path (the two activities stay registered:
   `triagePolicy` for the in-flight replay window, `classifyInbound` because the retro orchestrator
   still calls it independently).
4. **A corpus backtest replaces the live-shadow validation model.** ADR-0019's shadow/acting telemetry
   doubling is superseded for this feature by an offline OLD-vs-NEW `classify_email()` backtest against
   the labelled email corpus, run as a hard go/no-go gate before the feature flips
   (`scripts/evaluation/email/run_ab_parsefed.py`).
5. **Ships dark** behind `TRIAGE_PARSE_FED_ENABLED` ([ADR-0027](./0027-ship-dark-gate-model.md)):
   with the gate off, the reorder is live but the parse result is not consumed — the triage decision
   and the downstream lanes are byte-identical to the pre-reorder pipeline.

## What is unchanged (still ADR-0019)

`decideTriage`'s own routing logic (only its inputs widen); the Stage-C AI second opinion; the
suggest-first promotion ladder; and **ADR-0010** — a VRM-only match never auto-attaches, now pinned at
the type level (`triage-policy.ts`'s `matchedOn !== 'vrm'` guard), which holds regardless of whether
the VRM reached the classification from the subject/body or from a parsed document.

## Consequences

- Parser latency/cold-start now hits every doc-bearing email, not just `receiving_work` (accepted; a
  post-flip latency watch covers it). A `drop_duplicate` arrival now pays the parse cost.
- The Durable orchestration history changed shape, so the deploy must drain in-flight `intake`
  instances first (an old history will not replay against the reordered generator) — see TKT-296.
- Measured effect on the labelled corpus at the flip: 87.9% → 91.4% exact-match, 0 regressions,
  2 improvements. The document-only-ref and generic-filename photos-PDF gaps are closed.
