---
id: TKT-289
title: Investigate whether Document Intelligence is a safe plate-OCR fallback
status: backlog
priority: P2
area: ai
tickets-it-relates-to: [TKT-017]
research-link: docs/tickets/done/TKT-017-ai-reg-ocr/evidence/reg-ocr-benchmark.md
---

# Investigate whether Document Intelligence is a safe plate-OCR fallback

## Problem

`services/functions/ocr/plate_adapter.py` supports `PLATE_PROVIDER=docintel` as a fallback to the
default `fast-alpr` engine for reading vehicle registration plates. TKT-017's own benchmark already
found two concrete weaknesses specific to using Document Intelligence Read for this — not for document
OCR, where it works fine, but for plate reading specifically, because DI Read does whole-photo OCR with
no plate localisation:

- **F1** — a road sign reading "MAX 30" normalised to a plate-shaped string and passed the lenient
  `_looks_like_plate` gate, producing a false `registration_visible = true` with no real plate present.
- **F2** — a plate split across two OCR-detected lines is missed unless a pairwise-join candidate
  fires; this is a real recall dependency specifically on the `docintel` path.

TKT-017 listed two hardening items as open follow-ups against exactly these findings. Checked directly
against the current `services/functions/ocr/plate_adapter.py` (2026-07-20): **F2 is done, F1 is
half-done**.

- **F2 (pairwise-join) — DONE.** `_candidates_via_docintel` (the docintel-specific candidate path)
  explicitly joins adjacent OCR tokens ("`AB12` + `CDE` -> `AB12CDE`") so a plate split across two text
  lines still matches. Implemented exactly as TKT-017 proposed.
- **F1 (UK plate-grammar tightening) — HALF-DONE, effectively not done.** A stricter regex,
  `_CURRENT_UK_RE = re.compile(r"^[A-Z]{2}[0-9]{2}[A-Z]{3}$")` (post-2001 UK format), exists in the
  file — but it is **dead code**, never referenced anywhere else in the module. `_looks_like_plate`
  still uses only the original lenient shape check (5-8 alphanumeric chars, ≥2 letters, ≥1 digit,
  anywhere in that range) that TKT-017's own test proved lets a road sign ("MAX 30" → "MAX30") pass as
  a plausible plate. Someone started this fix and didn't finish wiring it in.

## Evidence

- [Operator note](./evidence/operator-note.md) — how this ticket came about.
- [TKT-017's benchmark](../../done/TKT-017-ai-reg-ocr/evidence/reg-ocr-benchmark.md) — §4 (F1/F2/F3
  findings), §8 and §10 (the two open hardening items).
- `services/functions/ocr/plate_adapter.py:56` (`_CURRENT_UK_RE`, defined, unused),
  `:70-75` (`_looks_like_plate`, still the lenient check), `:258-262` (pairwise-join, confirmed active
  on the `docintel` path).

## Proposed change

PROPOSED (not built):

- Wire `_CURRENT_UK_RE` into `_looks_like_plate` (or a new stricter check called at the same site) so a
  candidate must match plausible UK plate grammar, not just "some letters and a digit" — closing F1.
  Confirm this doesn't regress older/personalised UK plate formats that don't fit the post-2001
  pattern (`_CURRENT_UK_RE`'s own name suggests it was only ever meant to cover the current format —
  decide explicitly whether older formats need their own pattern or an intentional carve-out).
- Add a regression fixture reproducing TKT-017's exact F1 case (a road-sign-shaped token that should
  now be rejected) so this doesn't silently regress again.
- Separately: the TIER B real-accuracy benchmark (labelled UK overview-photo corpus run through both
  engines, per TKT-017 §7/§10) still hasn't been run for either engine — decide whether closing F1 is
  sufficient to trust the fallback, or whether TIER B is still needed before relying on it under real
  failover conditions.
- Do not change `PLATE_PROVIDER`'s default (`fast-alpr`) as part of this — the question is specifically
  about the fallback's own risk, not the primary engine.

## Acceptance

- `_looks_like_plate` rejects TKT-017's F1 counterexample (or an equivalent regression fixture), with a
  passing test.
- A recorded decision on whether the unused `_CURRENT_UK_RE` pattern is the right final shape (covers
  the plate formats this system actually needs to recognise) before wiring it in as-is.
- Either the TIER B benchmark is run, or an explicit, reasoned decision to accept the fallback's
  unverified real-world accuracy is recorded here.
- No change to the `fast-alpr` primary path or its live gate.

## Research

Distilled 2026-07-20 from a conversation during the cedocumentmapper engine merge (TKT-287); the
underlying findings are TKT-017's own (2026-07-08), not new — see
[operator note](./evidence/operator-note.md) for how this surfaced and
[TKT-017's benchmark](../../done/TKT-017-ai-reg-ocr/evidence/reg-ocr-benchmark.md) for the original
research.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Operator note](./evidence/operator-note.md)
