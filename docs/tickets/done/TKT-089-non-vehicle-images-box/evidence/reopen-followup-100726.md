# Reopen follow-up — TKT-089 (dated 2026-07-10, verify-sweep FAILED verdict)

## What failed live (acceptance line 3 — the PDF-lane sample re-parse)
A compute-only probe of the LIVE `/extract-images` (engine-v2.13) on two real retained
`LtrtoEngineerIn.pdf` samples returned **count=2 both times**: `img_1_1.png` (QDOS Assistance logo,
575×174, 10,720 B) and `img_1_2.jpeg` (MGAA badge, 204×204, ~29 KB) — visually identical to the
ticket's own screenshot and byte-matched to the audit's recurring-suspect class (~40 cases). Both
evade the deployed heuristics by tiny margins:
- QDOS logo: aspect **3.305 < 3.5** banner threshold (short side 174 qualifies, ratio doesn't);
- MGAA badge: area **41,616 vs the 40,000 floor (+4%)**, and square — the banner rung cannot apply.
The repo-vendored engine (v2.14) carries the SAME thresholds — no undeployed fix is waiting.

## Compounding storage gap ("stored on Box")
`orchestration/src/functions/activities/extractImages.ts:120-208` persists every parser-returned
image (blob + evidence row); the Box mirror selection
(`api/src/functions/internal.ts:2727-2736`, `GET internal/cases/{id}/archive-evidence`) filters only
`storage_path IS NOT NULL AND box_file_id IS NULL` — **no `excluded` filter** — so even
classifier-stamped non-vehicle crops still mirror into the Box case folder. The classifier lanes
(TKT-131/146) mitigate the evidence view + EVA flow, not Box storage.

## What passed (unchanged)
Lines 1 (written audit + lane split), 2 (email lane forward-clean: 0 name-suspects in Box across
1,160 new rows), and 4 (backfill decision recorded + executed, 163/163, residual 0) all hold.

## Fix direction (for the re-implementation dispatch — design freedom within these constraints)
1. **The robust fix is classifier-gated, not threshold-tuned**: the verifier judges a shape-only
   heuristic likely cannot catch a 204×204 square badge without recall risk. Candidate seams:
   (a) classify-before-persist (or classify-then-exclude promptly) for extraction crops in
   `extractImages`, reusing the never-throws classifier; and/or (b) an `excluded = false` (or
   role-aware) predicate in the archive-evidence mirror selection so excluded rows never mirror —
   mind the race: rows persist first, classification stamps later; the mirror must not slip through
   the gap between them.
2. Threshold retune is allowed as a supplement (e.g. the +4% area margin) but not as the sole fix.
3. HARD RULES: never delete from Box (ADR-0012/0017 one-way mirror — already-mirrored copies stay);
   recall protection is part of the acceptance (genuine vehicle photos must keep flowing — W2 Q5
   baseline: 744 kept / 671 mirrored); engine changes are sibling-first (ADR-0018, engine-v2.14 is
   current).
4. Re-verify with the same probe: the two named samples return 0 non-vehicle images (or they persist
   as excluded-and-not-mirrored), plus the queued forward-window SQL in verification.md.
