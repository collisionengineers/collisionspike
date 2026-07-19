# Distillation note — TKT-260

**Source:** `04-scripts-and-tooling-dedup.md` item 4 (finding I). **Plan:** PLAN-010. Re-verified read-only
2026-07-19 (`PLAN-010.dossier.json`).

**Four distinct detectors (not one):**
1. `packages/domain/src/domain/pii-scrub.ts` — UK-PII **regexes**, hard-coded; runtime placeholder redaction.
2. `scripts/maintenance/cloud-inventory/04-redact-sweep.ps1` — secret-shape **regexes**, hard-coded; snapshot
   sweep.
3. `scripts/checks/hashed-signature-matcher.mjs` + `scripts/checks/forbidden-signatures.json` — forbidden
   vocabulary, **already externalised** to the JSON (fnv1a32 + sha256, hashed literals).
4. `scripts/checks/check-binary-content.py` — loads the **same** `forbidden-signatures.json` and re-implements
   the identical fnv1a32 + sha256 matcher in Python.

**Judgment:** #3/#4 already share the data file cross-language — extend it. #1/#2 are regex-shaped and
incompatible with the hashed-exact-literal format, and serve different purposes (runtime redaction, snapshot
sweep). A four-way unification is **over-reach**. The only genuine remaining duplication is the matcher
**algorithm** mirrored in `.mjs` and `.py` — unavoidable across the JS/Python split, so **document, don't
merge**.
