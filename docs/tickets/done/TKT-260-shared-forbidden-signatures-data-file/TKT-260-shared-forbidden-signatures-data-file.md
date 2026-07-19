---
id: TKT-260
title: Pin cross-language forbidden-signature matcher parity
status: done
priority: P3
area: platform
tickets-it-relates-to: [TKT-207, TKT-261]
research-link: docs/tickets/done/TKT-260-shared-forbidden-signatures-data-file/evidence/distillation-note.md
plan: PLAN-010
---

# Pin cross-language forbidden-signature matcher parity

## Problem
The forbidden-signature data is already shared, but the Node and Python consumers independently implement
normalisation, URL decoding, token windows, FNV-1a prefiltering, and SHA-256 matching. Each implementation can
pass its own checks while returning different results for the same input.

## Evidence
Verified read-only 2026-07-19: `forbidden-signatures.json` is **already** an externalised, cross-language data
file — a versioned hashed-signature set consumed by both `hashed-signature-matcher.mjs` (Node) and
`check-binary-content.py` (Python), which each re-implement the same fnv1a32 + sha256 algorithm. By contrast
`pii-scrub` (UK-PII regexes, runtime redaction) and the cloud-inventory redact sweep (secret-shape regexes,
snapshot scan) use regex patterns that the hashed-exact-literal format structurally cannot represent. The
existing Node tests use only Node-side synthetic cases; no shared-vector test executes both matchers.

## Proposed change
Keep `forbidden-signatures.json` as the single shared vocabulary data file it already is. Add one tracked,
non-sensitive vector fixture that both matcher implementations execute, covering corpus validation,
normalisation, URL decoding, substring matching, adjacent-token limits, long-hex suppression, and no-match
cases. Document the unavoidable Node/Python algorithm mirror beside the fixture. Leave `pii-scrub` and the
redact sweep with their own pattern shapes; do not force a four-way unification.

## Acceptance
- **A1.** `forbidden-signatures.json` remains the single shared vocabulary source for the Node and Python
  hashed-signature detectors; signatures are never duplicated in code.
- **A2.** One non-sensitive vector fixture covers valid matches, non-matches, corpus rejection, case and
  punctuation normalisation, single/double URL decoding, substring matching, the adjacent-token limit, and
  long-hex suppression.
- **A3.** Automated tests execute both implementations over every vector and require identical signature IDs
  or identical corpus-rejection outcomes.
- **A4.** The unavoidable Node↔Python matcher mirror is documented beside the vectors, with the parity test as
  the synchronization contract.
- **A5.** `pii-scrub` and the cloud-inventory redact sweep retain their own incompatible pattern shapes; no
  four-way unification is attempted.
- **A6.** No new forbidden-signature entry is required by this ticket. Any future entry needs separate policy
  evidence and remains hashed; no plaintext secret or forbidden term is added to a tracked file.
- **A7.** The implementation records before/after owned-file and nonblank-line deltas for PLAN-010 close-out.
- **A8.** No live write.

## Validation
- Run the shared vectors through both implementations, then run `check:forbidden` and
  `check:binary-content`; confirm no new plaintext signatures land; report the structural delta; full
  `node verify-all.mjs`.

## Research
Distilled from `workingspace/architecture-simplification/04-scripts-and-tooling-dedup.md` item 4 and the
series' copies-in-sync rule, then corrected by direct inspection of both matcher implementations and existing
tests on 2026-07-19. The shared data file already exists; the concrete remaining work is cross-language parity,
not an unsupported signature extension or a four-way detector unification. Gated on full PLAN-006 close-out.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
