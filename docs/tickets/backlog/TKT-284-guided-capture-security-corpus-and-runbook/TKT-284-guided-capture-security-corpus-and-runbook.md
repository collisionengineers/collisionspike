---
id: TKT-284
title: Guided capture — consolidated security test corpus and post-deploy probe runbook
status: backlog
priority: P2
area: integration
tickets-it-relates-to: [TKT-278, TKT-200, TKT-283]
research-link: docs/tickets/backlog/TKT-284-guided-capture-security-corpus-and-runbook/evidence/scope.md
---

# Guided capture — consolidated security test corpus and post-deploy probe runbook

## Problem

Renumbered and narrowed from collisioncapture's `CCAP-015-security-test-suite` during the TKT-278
repository merge. Most of the original scope is already covered by TKT-200's own test suite
(`capture-rate-limit.test.ts`, `capture-blob-security.test.ts`, `capture-auth.test.ts`'s HS256 pinning,
`capture-submit.test.ts`/`capture-upload.test.ts`'s replay/idempotency/duplicate-completion checks).
Missing: a consolidated checked-in corpus of crafted polyglot/MIME-spoofed/decompression-bomb probe
files, and a runbook (the original spec's `docs/azure/capture-verify.md` — this repository has no
`docs/azure/` directory at all) that re-runs those probes per environment, including against the
deployed origin once TKT-283's CI deploy job exists.

## Evidence

- [Scope](./evidence/scope.md) — what's already tested vs. the corpus/runbook gap.

## Proposed change

Consolidate a small, checked-in corpus of adversarial probe files (polyglot, MIME-spoofed, oversized/
decompression-bomb, animated multi-frame) and a runbook script that re-runs them against a target origin
(dev today; the deployed capture-web origin once TKT-283 lands), following this repository's existing
operations-runbook conventions rather than inventing a bespoke format.

## Acceptance

- A checked-in probe corpus exists and is referenced by the runbook, not duplicated ad hoc per test.
- The runbook runs against dev today and documents how to point it at the deployed origin once TKT-283
  exists.
- No duplicate re-testing of what TKT-200's existing suites already cover.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Scope](./evidence/scope.md)
