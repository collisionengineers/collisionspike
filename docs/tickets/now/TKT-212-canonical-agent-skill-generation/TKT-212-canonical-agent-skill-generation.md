---
id: TKT-212
title: Establish one agent and skill source with generated adapters
status: now
priority: P1
area: docs
tickets-it-relates-to: [TKT-020, TKT-207, TKT-209, TKT-211, TKT-214]
research-link: docs/tickets/now/TKT-212-canonical-agent-skill-generation/evidence/operator-note.md
plan: PLAN-006
---

# Establish one agent and skill source with generated adapters

## Problem
Agent and skill guidance is copied across several tool-specific directories. A future agent cannot tell which copy owns a rule, and edits can drift silently between adapters.

## Evidence
The current inventory includes multiple agent/tooling metadata roots. PLAN-006 designates .agents as the canonical source and requires every necessary adapter to be reproducible from it.

## Proposed change
Normalize agent, skill and shared-policy sources under .agents; define a deterministic adapter manifest and generator for supported tool surfaces; and replace independent copies with generated, parity-checked adapters or thin bootstrap metadata.

## Acceptance
- **A1.** .agents contains the single human-authored source for every project agent, skill and shared operational rule, with a clear directory/index that lets a new agent find ownership without consulting an adapter.
- **A2.** A versioned manifest maps each canonical source to every required adapter path and records generator version, transformation and intentional tool-specific metadata.
- **A3.** Adapter generation is deterministic from a clean checkout: two runs produce byte-identical outputs and no source mutation.
- **A4.** No generated adapter contains independently authored project guidance. Tool-specific wrappers are minimal, declared in the manifest and cannot override canonical content silently.
- **A5.** A parity check reports missing, stale, extra and hand-edited adapters with source and target paths; controlled fixtures prove every failure mode.
- **A6.** Retired-platform wording is removed at the canonical source and cannot reappear through generation, cached templates or copied instructions.
- **A7.** Repository entry docs explain the canonical source, generation command, update workflow and failure recovery in plain language.
- **A8.** CI regenerates adapters in a clean temporary location and compares them to the required repository/bootstrap state without committing caches or unrelated generated output.
- **A9.** Existing supported agent/skill discovery and invocation still works after normalization, and repository cleanup performs no live write or deployment.

## Validation
- Run generation twice and compare exact hashes.
- Modify, omit and add controlled adapter fixtures and prove actionable parity failures.
- Start each supported agent/skill discovery path from a clean checkout and confirm it resolves to canonical content.

## Research
Distilled from the operator's requirement that any AI agent can navigate the repository reliably and PLAN-006's canonical-source decision.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
