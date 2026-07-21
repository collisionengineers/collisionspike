Raised in conversation during the cedocumentmapper engine merge (TKT-287/PR #145), while explaining
that the OCR host's document-OCR and plate-OCR paths both already have Azure Document Intelligence
Read wired as a fallback engine. The operator asked directly: "should document intelligence be a
fallback for plate ocr??"

This is not a fresh finding — TKT-017's own benchmark
(`docs/tickets/done/TKT-017-ai-reg-ocr/evidence/reg-ocr-benchmark.md`) already documents the answer
is "yes, but with known, unmitigated weaknesses":

- **F1 — scene-text false positive.** DI Read does whole-photo OCR with no plate localisation. The
  benchmark's own test found a road sign reading "MAX 30" normalises to a plate-shaped string and
  passes the lenient `_looks_like_plate` gate, producing a false `registration_visible = true` on a
  photo with no real plate.
- **F2 — split-line recall gap.** A plate split across two OCR-detected lines is missed unless a
  pairwise-join candidate fires; DI Read's line-splitting makes this a real dependency specifically on
  the `docintel` path.
- Two hardening items were listed as open follow-ups in that same benchmark. Checked directly against
  the current code: F2 (pairwise-join on the `docintel` path) is actually implemented. F1 (tighten
  `_looks_like_plate` toward UK plate grammar) is half-done — a stricter regex exists in the file but
  is dead code, never wired into the actual check.
- The "TIER B" real-accuracy benchmark (a labelled UK overview-photo corpus run through both engines)
  was never run for either `fast-alpr` or DI Read, so neither engine's actual plate-reading accuracy
  on real UK plates is proven — only the shared post-processing layer (`plate_adapter.py`) was
  benchmarked (10/10 synthetic scenarios), not raw OCR accuracy on real images.

The operator's question is a legitimate re-open of an item TKT-017 itself flagged as "not acted on" —
this ticket exists so it doesn't stay buried in a closed ticket's evidence file.
