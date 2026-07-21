---
id: TKT-293
title: Parse-fed backtest harness — the go/no-go gate (PLAN-014 Slice 3)
status: now
priority: P1
area: parsing
tickets-it-relates-to: [TKT-291, TKT-043, TKT-041, TKT-034]
research-link: workingspace/proposedparserchanges.md
plan: PLAN-014
---

# Parse-fed backtest harness — the go/no-go gate (PLAN-014 Slice 3)

## Problem

PLAN-014's orchestration changes (Slice 4a/4b) must not ship until an offline A/B backtest proves
TKT-291's D4 classifier change causes zero regressions on the real email corpus — the source design
explicitly makes this the go/no-go gate, not a live shadow period.

## Proposed change (built)

- `scripts/evaluation/email/run_eval.py`: new `load_email_attachment_bytes()` — shared loader
  machinery (attachment NAME+BYTES, not just names) both this backtest and any future caller need.
- **New** `scripts/evaluation/email/run_ab_parsefed.py`: runs `classify_email()` twice per tracked
  corpus item — OLD (today's request) and NEW (the same request plus `attachment_content_typings`
  derived by running every real attachment through the vendored engine's content detector,
  `parser_adapter.run_parser`, the same in-process call the live `/parse` route makes). Reuses
  `run_eval.py`'s loader machinery by import, per `run_ab.py`'s established convention.
- **Real finding, not a synthetic one**: the first real run found **3 regressions** in TKT-291's
  original D4 build. Root-caused and fixed as a follow-up commit to TKT-291's own PR (not absorbed
  here — see TKT-291's `changes.md`): (1) `content_withdraws_instruction` was firing on the
  detector's own safe "unknown" abstain default, not just its confident "junk" verdict; (2) a QDOS
  dual report+audit commissioning letter's own heading legitimately contains the "audit report"
  title phrase, which `detection/attachment_typing.py`'s Rule 1a let stand alone. Re-run after the
  fix: **zero regressions, 2 genuine improvements**, category+subtype accuracy 87.9% → 91.4%. Full
  report: [evidence/parsefed-backtest-report.md](./evidence/parsefed-backtest-report.md).
- **ADR-0010 safety pinned at the type level**, not just via backtest observation: a new test in
  `packages/domain/src/domain/triage-policy.test.ts` asserts a VRM-only match can never reach
  `attach_case` under every gate combination, including with parse-fed context (attachments/
  imagesOnly populated) present — proving the invariant holds by construction.

## Corpus expansion — honest scope correction

The original design called for adding 8-12 new labelled manifest cases (ambiguous/none
`open_case_ref_match`, a photos-in-a-PDF case, an adversarial ADR-0010 case). **This ticket does not
fabricate new "real" manifest entries** — this corpus's own stated philosophy is a REAL, hand-labelled
email corpus ("ground truth follows the owning ticket's intended business classification... labels
are never changed merely to make the evaluator pass"); inventing synthetic entries presented as real
evidence would violate that discipline. What IS done instead:

- The ADR-0010 adversarial case is covered as a **pure-logic unit test** (above) — it needs no real
  email, since it tests `decideTriage`'s own structural guard, not the classifier's corpus behaviour.
- The `open_case_ref_match` ambiguous/none-explicit and photos-in-a-PDF-with-a-generic-filename gaps
  **remain open** and need real operator-supplied email samples via the existing, purpose-built
  mechanism: `scripts/evaluation/email/local/eval-overlay.json` (README.md "Local overlay"). This is
  flagged as a fast-follow, not closed here.

## Acceptance

- `run_ab_parsefed.py` runs against the full real corpus, produces a markdown delta report + optional
  full JSON (local-only, PII rules respected).
- Go/no-go result recorded: **zero regressions, 2 improvements** (see evidence file).
- ADR-0010 unit test green, pinned to `triage-policy.ts`'s `matchedOn !== 'vrm'` guard directly.
- Full parser pytest suite green (400 passed); full domain vitest suite green.
- Corpus-expansion gap recorded honestly as a fast-follow needing real operator-supplied samples, not
  fabricated as closed.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Go/no-go backtest report](./evidence/parsefed-backtest-report.md)
