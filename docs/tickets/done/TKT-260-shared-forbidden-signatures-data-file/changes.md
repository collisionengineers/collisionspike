# Changes — TKT-260: Pin forbidden-signature matcher parity

## Status

Implemented on branch `plan010/scripts-dedup`. Output-preserving; no live write.

## What changed

The forbidden-signature vocabulary was already externalised to the single shared data file
`scripts/checks/forbidden-signatures.json`, consumed by both the Node forbidden-reference gate and the
Python binary-content gate. This ticket pins the two matcher implementations to one shared behaviour:

- **New** `scripts/checks/forbidden-signature-vectors.json` — one non-sensitive vector suite covering
  valid matches, non-matches, corpus rejection, case/punctuation normalisation, single and double URL
  decoding, substring matching, the adjacent-token limit, and long-hex suppression. Terms are synthetic
  words; the real vocabulary stays hashed-only.
- **New** `scripts/checks/hashed_signature_matcher.py` — the Python matcher extracted into a
  standard-library-only module that mirrors `hashed-signature-matcher.mjs`. Provides a `--vectors` CLI
  used by the parity test. The extracted validation adds the two fail-closed checks the Node matcher
  already had but the inline Python matcher lacked (empty corpus, duplicate identifier), so the two
  implementations now reject identically. Neither addition changes real-corpus behaviour (the committed
  corpus is non-empty with unique IDs).
- **New** `scripts/checks/forbidden-signature-parity.test.mjs` — runs every vector through both matchers
  (Node in-process; Python via the module CLI) and asserts identical signature IDs and identical
  rejection outcomes. This test is the synchronization contract.
- **New** `scripts/checks/forbidden-signature-matcher-parity.md` — documents the unavoidable
  Node/Python mirror and records that `pii-scrub` and the cloud-inventory redact sweep keep their own
  regex pattern shapes (no four-way unification).
- **Modified** `scripts/checks/check-binary-content.py` — now imports the matcher from the shared module
  instead of re-declaring `fnv1a32`/`load_signatures`/`matches` inline. Scanning/decoding logic and
  program output are unchanged.

`pii-scrub.ts` and `04-redact-sweep.ps1` were left untouched (A5). No new forbidden-signature entry was
added; no plaintext secret or forbidden term is introduced (A6). `emailevals/` untouched.

## Structural delta (A7)

- Owned source files: **958 → 960** (+2: `hashed_signature_matcher.py`,
  `forbidden-signature-parity.test.mjs`; the `.json` fixture and `.md` note are not source extensions).
- Owned nonblank source lines: **169921 → 170111** (+190). `check-binary-content.py` shrank by ~81
  nonblank lines (matcher moved to the shared module); the net increase is the parity test plus the
  reusable module + CLI and the added rejection-parity validation.
