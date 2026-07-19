# Forbidden-signature matcher parity (TKT-260 / PLAN-010)

The forbidden-signature detector exists once as data and twice as code. This note records the
deliberate two-language mirror and names the test that keeps the two copies in lockstep.

## One data file, two matchers

| Role | File | Language |
|---|---|---|
| Shared vocabulary (the single source) | `forbidden-signatures.json` | data |
| Matcher | `hashed-signature-matcher.mjs` | Node |
| Matcher | `hashed_signature_matcher.py` | Python |

`forbidden-signatures.json` is a versioned set of **hashed** literals (`fnv1a32` prefilter +
`sha256` digest); no plaintext forbidden term appears in any tracked file. Both matchers load
that one file — the Node forbidden-reference gate (`check:forbidden`) via
`check-forbidden-references.mjs`, and the Python binary-content gate (`check:binary-content`)
via `check-binary-content.py`. The signatures are never duplicated in code.

## Why the algorithm is mirrored, not shared

Node and Python cannot import one another, so the normalisation, URL-decode, token-window,
FNV-1a prefilter, and SHA-256 matching logic is necessarily written twice. The two copies are a
maintenance hazard: each can pass its own tests while disagreeing on the same input. This mirror
is unavoidable; the guard against drift is a shared vector suite, not a shared runtime.

## The synchronization contract

`forbidden-signature-vectors.json` is the single shared vector suite. It defines synthetic,
non-sensitive terms plus vectors covering valid matches, non-matches, corpus rejection, case and
punctuation normalisation, single and double URL decoding, substring matching, the adjacent-token
limit, and long-hex suppression. `forbidden-signature-parity.test.mjs` builds a matcher from those
terms in **both** languages, runs every vector through each, and asserts identical signature IDs
and identical rejection outcomes. Because the vectors use synthetic terms, the real vocabulary
stays hashed-only (no plaintext secret or forbidden term is introduced).

**Change protocol:** any behavioural change to one matcher must be made to the other in the same
change, and the parity vectors kept green. A vector that both matchers can no longer satisfy
identically is a parity break by definition. Add a vector whenever you touch normalisation,
decoding, windowing, or validation behaviour.

## Out of scope — deliberately not unified

The other two secret/PII detectors are **regex-shaped** and structurally cannot be represented by
the hashed-exact-literal format, so they keep their own pattern shapes and are excluded from this
data file:

- `packages/domain/src/domain/pii-scrub.ts` — UK-PII regexes for runtime placeholder redaction.
- `scripts/maintenance/cloud-inventory/04-redact-sweep.ps1` — secret-shape regexes for the
  snapshot sweep.

A four-way unification across the TS / PowerShell / Node / Python split is out of scope; only the
two hashed-literal matchers share the data file and this parity contract.
