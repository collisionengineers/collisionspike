# Verification — TKT-260: Pin forbidden-signature matcher parity

## Verdict

PASS (offline, output-preserving). Verified 2026-07-19 on branch `plan010/scripts-dedup`.

## Acceptance

- **A1** met — `forbidden-signatures.json` remains the single shared source; both matchers load it
  (`check-forbidden-references.mjs` and `check-binary-content.py`). No signature is duplicated in code.
- **A2** met — `forbidden-signature-vectors.json` covers valid matches, non-matches, corpus rejection,
  case/punctuation normalisation, single and double URL decoding, substring matching, the adjacent-token
  limit, and long-hex suppression.
- **A3** met — `forbidden-signature-parity.test.mjs` runs every vector through both the Node and the
  Python matcher and asserts identical signature IDs and identical corpus-rejection outcomes.
- **A4** met — `forbidden-signature-matcher-parity.md` documents the mirror, with the parity test named
  as the synchronization contract.
- **A5** met — `pii-scrub.ts` and `04-redact-sweep.ps1` untouched; no four-way unification.
- **A6** met — no new signature entry; vectors use synthetic non-sensitive terms; the real vocabulary
  stays hashed-only.
- **A7** met — structural delta recorded in `changes.md` (owned files 958→960; nonblank 169921→170111).
- **A8** met — no live/cloud write.

## Evidence

Output-preserving gate:

- `node scripts/checks/check-forbidden-references.mjs` → PASS, "No forbidden signatures matched."
  (2983 files before / 2987 after — verdict unchanged; +4 newly-tracked files scanned).
- `python scripts/checks/check-binary-content.py` → **byte-identical** to the pre-change baseline:
  "Decoded binary-content check: 391 file(s) scanned. / No configured signatures found in decoded
  content.", exit 0 (`diff` of before/after output is clean).

Tests:

- `node --test scripts/checks/forbidden-signature-parity.test.mjs scripts/checks/hashed-signature-matcher.test.mjs`
  → 8/8 pass (2 new parity tests + 6 existing).
- `node --test scripts/checks/*.test.mjs scripts/maintenance/*.test.mjs` → 72/72 pass (was 70; +2).
- `python scripts/checks/hashed_signature_matcher.py --vectors scripts/checks/forbidden-signature-vectors.json`
  → every match vector equals its expected IDs; all seven rejection documents rejected.

Other gates:

- `node scripts/checks/check-source-size.mjs` → PASS (960 owned source files).
- `check:data-authority`, `check:layout`, `check:tracked-outputs` → PASS with the new files staged.

## Remediation (2026-07-19, PR #121 review)

A malformed-escape decoding divergence was found and closed: for input like `%ZZ%6f%72%61%6e%67%65`, the
Python matcher's `unquote_plus` partial-decodes (revealing the term) while the Node matcher's
`decodeURIComponent` aborted the whole decode and missed it — so the two mirrors could disagree on
repository content. The Node matcher now uses a lenient percent-decoder (`lenientPercentDecode`) that
decodes each maximal run of valid `%XX` escapes and leaves a malformed `%` literal, matching
`unquote_plus`. A new parity vector `malformed-percent-prefix-then-encoded-term` (S001 encoded behind a
`%ZZ` prefix) pins this case; `forbidden-signature-parity.test.mjs` confirms Node and Python now agree on
it, and the real `check:forbidden` (2996 files) and `check:binary-content` (Python) gates remain green.

## Pending / gaps

None. The parity test is Node-driven and spawns the Python matcher; it requires a `python`/`python3`
interpreter on PATH (the same requirement the `check:binary-content` gate already imposes).
