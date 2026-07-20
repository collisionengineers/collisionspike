---
id: PLAN-013
title: On-device vision programme for guided capture — dataset to enforced guidance
status: active
tickets: []
depends-on: [TKT-278]
plan-kind: feature
---

# PLAN-013 — On-device vision programme for guided capture

## Context

Roadmap only — nothing in this plan is built. Consolidated from collisioncapture's own `PLAN-002`
(`CCAP-018` through `CCAP-029`) during the TKT-278 repository merge; per
[ADR-0034](../../adr/0034-guided-capture-repository-consolidation.md), this programme is explicitly
**not part of the merge's engineering scope**. `apps/capture-web/src/vision/visionRuntime.ts` is a
deliberately inert `NullVisionRuntime` seam today — confirmed live, no ONNX runtime, no worker, no
`.wasm`/`.onnx` model anywhere in this repository.

The programme (owned vehicle-detector + viewpoint-classifier models running in-browser via
`onnxruntime-web`, staged shadow → advisory → enforced) is real prior design work, not a blank slate:
candidate models and efficiency techniques were evaluated in collisioncapture's own
`docs/vision-model-refresh-2026-07.md` (July 2026 research, not carried into this repo — historical
reference only, re-verify before acting on it). The **on-device-models-only** decision (no cloud
vision-language model) and vision-code layout (pure logic separate from the ORT-Web worker adapter,
training/eval kept outside npm workspaces, datasets/models never committed) were both locked during that
prior work and remain the starting assumptions if this programme is picked up.

## No tickets filed yet

Deliberately: this plan lists `tickets: []`. Individual `TKT-NNN` tickets get filed against the
then-current highest ticket number when this programme actually starts, rather than pre-allocating 12
ticket IDs for roadmap work with no committed timeline. The prior sequence (dataset workspace and
inventory first, with zero server dependency; vision core/runtime in parallel; contract revision;
budget bench as the go/no-go for training spend; annotation programme; training pipeline; export/eval/
promotion; then a strictly-ordered shadow → advisory → enforced rollout; production hardening; a
steady-state MLOps runbook) is preserved as prior design context, not as committed scope.

## Gates carried forward as starting assumptions (re-verify before use)

Recall ≥98%, macro-F1 ≥95% (slice bound 5pp), wrong-view false-accept ≤1%, ≤20MB model size, warm p95
≤120ms, server false-rejection ≤5%; take-anyway always preserved in enforced mode; a one-config
kill-switch; latest-frame mailbox with p95 self-measure and auto-degrade; WebGPU probe falling back to
single-threaded WASM-SIMD.

## Explicitly deferred (from the prior work, still deferred)

Part-specific detectors, damage assessment, and a React Native shell — all field-evidence gated, not
started.

## Close-out

This plan closes (or is marked superseded) once either: (a) tickets are filed and the programme
actually starts, converting this into a normal ticket-tracked plan, or (b) a later architecture review
explicitly decides not to build on-device vision and retires this plan instead.

<!-- GENERATED:PROGRESS -->
## Computed progress

**0/0 done (0%).**

| Status | Count |
|---|---:|
| Now | 0 |
| Verify | 0 |
| Done | 0 |
| Next | 0 |
| Backlog | 0 |
| Blocked | 0 |

| Ticket | Status | Title |
|---|---|---|
<!-- /GENERATED:PROGRESS -->
