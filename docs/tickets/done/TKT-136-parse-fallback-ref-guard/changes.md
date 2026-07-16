# Changes — TKT-136: Guard the /parse fallback reference against money values and text fragments (RIGERANT R1234YF)

## Status
engine complete at sibling tag `engine-v2.12`, re-vendored, parser DEPLOYED (4 functions), and
the audited live case_ref data fix EXECUTED (final wave D2, 2026-07-09) — live /parse probe on
a fresh document PENDING

## Changes — engine parts (sibling-first, ADR-0018)

**Sibling commit `a80246b` on `feat/tkt043-open-case-ref-context` (built directly on the
engine-v2.11 pin `4cbf19a`; origin/main had not moved); annotated tag `engine-v2.12`
(final commit `ab5f8d2`, with TKT-102) PUSHED to origin with the branch.**

### Root cause
The /parse `_fallback_reference` had no money/shape guards (TKT-103 guarded only the classifier),
and two of its tiers misfired on a parts/estimate line `REFRIGERANT R1234YF 650g`:
(a) the fuzzy label tier substring-matched the label `ref` against the head of `REFRIGERANT` and
minted the rest of the line — the live junk case_ref `RIGERANT R1234YF`, byte-identical, was
reproduced from a synthetic fixture; (b) tier 4's cue test was substring-based ("refrigerant"
contains "ref"). The document path also lacked the classifier's TKT-071 tight anchor and
stopword-trigram guards, so plausible-shaped junk VRMs (`HD4110` near the word "vehicle") could
re-enter via documents.

### What changed (sibling)
- `rules/engine.py`: ONE shared money guard `reference_candidate_is_money` (the TKT-103 logic,
  classifier behaviour identical — `_job_reference` now delegates) + a new fragment-plausibility
  guard `reference_candidate_is_fragment` (unit-quantity tokens `650g`; multi-word values whose
  head has no digit and is not a short ALL-CAPS prefix — `PHA 5013` passes). Both applied on ALL
  four `_fallback_reference` tiers. Tier-4 cues now word-boundary (`\brefs?\b` etc.).
- Scope addendum: `VRM_TIGHT_ANCHOR_RE`, `loose_alpha_head_is_postcode_area`,
  `wellformed_trigram_is_stopword` moved canonically into `rules/engine.py` (`email_classifier`
  aliases them — no drift) and enforced on the /parse document path via
  `vrm_document_candidate_is_bad` in `_fallback_vrm` and `_fallback_vrm_from_labels`
  (a fuzzy-matched VRM label line remains anchored by construction — `Registration Number` →
  next-line value still extracts; unanchored `estimate HD4110` near "vehicle" no longer does).
- Sibling `RIGERANT ESTIMATE 01` PDF and expected-result fixtures: pre-fix engine
  (A/B via stash) reproduces `reference='RIGERANT R1234YF'` + `vrm='HD4110'`; post-fix pins both
  empty. New `tests/test_reference_guards.py` (33 tests: money shapes incl. "768.00"/"£1,234.56"/
  "GBP487", fragment shapes, tier-4 boundary, document tight-anchor/trigram). `test_regression.py`
  gains the `unknown_temp` no-provider sentinel.

### Results
Sibling suite 396→429 passed / 4 skipped (both tickets together: 436/4). Eval gate PASS —
`reference`/`vrm` per-field pins stay 1.0; overall 0.9375 ≥ floor. Re-vendor drift guard green;
collisionspike parser suite 281 passed / 11 skipped / 1 PRE-EXISTING environmental failure
(`test_multiformat_extraction[ALS_doc]` — fails identically against the pre-re-cut tree).

## Re-vendor (collisionspike)
`services/functions/parser/cedocumentmapper_v2/rules/{engine,email_classifier}.py` byte-mirrored from the
tag; `PROVENANCE.md` bumped to `engine-v2.12`/`ab5f8d2` (its stale "tags LOCAL" note cleared —
v2.10/v2.11 were already on origin). `tests/test_engine_vendored_in_sync.py` green.

## Audited live data fix (case_ref rows) — EXECUTED 2026-07-09
Enumerated live via the guard shapes (money-shaped / RIGERANT-like / prose-fragment): **13
candidates** (`evidence/junk-ref-candidates.csv`). Applied as the repo delta
`database/migrations/2026-07-09-tkt136-ref-junk-cleanup.sql` (idempotent,
backup-first via `backup_20260709_tkt136_ref_junk`, per-row audit_event with the recorded
nearest-fit action, mirroring the vrm-junk-cleanup precedent):
- **4 cleared to NULL** (no recoverable ref): A.PCH26003 `RIGERANT R1234YF` (the marker),
  ABRAHAMS26001 (address fragment), PCH26005 `Excess waived`, SWAN26001 `Repairs Authorised?`.
- **8 repaired, not cleared**: the RJS rows carried REAL refs with the label glued on
  (`Our Reference: 128194.001/LG/LG` → `128194.001/LG/LG`) — label stripped, ref kept.
- **1 deliberately left** (WLS26001 `AS.94185.PREM NAZEER` — contains a plausible real ref +
  a name; operator judgement, recorded).
- Verified: 0 rows remain matching RIGERANT or a glued `Our Ref%` label; case_ref is not a
  required EVA field so no status movement follows from the NULLs.

## Remainders
- Live /parse probe post-deploy on a fresh REFRIGERANT-bearing estimate → `reference` empty; an
  unanchored `vehicle … HD4110` shape → no VRM. (The fixture pins this offline; the deployed
  parser is at engine-v2.12.)
