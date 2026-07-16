# TKT-043 evidence — offline proof of the case_update relabel

PII-safe per `scripts/evaluation/email/README.md` (ids + aggregate numbers + rule names only; no
subject/body/VRM/ref tokens quoted).

## 1. The eval item flips (real open-case-ref context signal, not a hard-code)

Corpus item `tkt043-images-existing-case` (`scripts/evaluation/email/manifest.json`) now carries
`context.open_case_ref_match: "one"` alongside its existing `provider_match_state: "one"` —
the flow's open-case match result, fed to `classify_email` exactly as `provider_match_state`
is (the classifier is told, never looks a Case up; ADR-0019).

`baseline-v2.json` (regenerated, `--taxonomy v2 --check` clean):

| | before | after |
|---|---|---|
| `tkt043-images-existing-case` got | `receiving_work` / `existing_provider_instruction` | `case_update` / `images_received` |
| `category_correct` | false | **true** |
| `subtype_correct` | false | **true** |
| corpus category accuracy | 84.6% | 86.5% |
| `case_update` recall | 0.67 (2/3) | **1.0 (3/3)** |
| `receiving_work` precision | 0.85 | 0.895 (one fewer false-positive) |
| `receiving_work` recall | ~94% | ~94% (held) |

`--check scripts/evaluation/email/baseline-v2.json` → **No regression vs baseline** (only the
tkt043 row moved; every other of the 52 scored items is byte-identical).

Kill-switch proof (no hard-code): with `open_case_ref_match` absent/`none` the same real
`.eml` still classifies `receiving_work` — the flip is driven ONLY by the resolved
open-case context signal.

## 2. Why text alone can't do it (the honest gap this closes)

The sender-written body states an engineer's report is required "on the following case",
names the case ref, and attaches an instruction-kind PDF from a known provider — a genuinely
work-shaped email. Stage-A rule trace (default, no open-case signal):
`rule:instruction_doc_existing_provider` → `receiving_work` at 0.95. The ONLY discriminator
between "fresh instruction" and "update on an already-open case" is the open-case lookup,
which lives in orchestration (ADR-0019) and is supplied as `open_case_ref_match`.

## 3. Deterministic `@cs/domain` proof + the attach lane (TKT-093)

`packages/domain/src/domain/triage-policy.test.ts` asserts, for the live tkt043 shape
(Stage-A `receiving_work`, an open-case `job_ref` match, `imagesOnly` true):
- gates `refGate + caseUpdate` → `suggest_attach`, `case_update` / `images_received`, `case_link`;
- gates `+ autoAttach` → `attach_case` (the TKT-093 self-accept → reversible `inbound_linked`
  attach), `decisionInputs.autoAttachApplied === true`.

`packages/domain/src/domain/intake-routing.test.ts` pins `CASE_MINTING_CATEGORIES ===
['receiving_work']` — `case_update` is non-minting, so no new Case is opened (belt-and-braces).

## 4. images_received for a photos-in-a-PDF

The delivered evidence arrives as a single images-advertising PDF, which the extension-derived
attachment kind reads as `instruction`. The new `_delivered_images_only` FILENAME tier
(classifier) + `deliveredImagesOnly` (orchestration `deriveAttachmentSignals`) recover it →
`images_received`. Guard cases stay put: an Audatex/report PDF → `update_general`; a real
image-file reply → `images_received`; a signature logo never counts as delivered evidence.

## 5. Test counts (all green)

- vendored parser classifier suite: 179 passed (incl. 3 new TKT-043 pins) + drift guard byte-mirror.
- `@cs/domain`: 952 passed (incl. 2 new triage-policy tkt043 assertions).
- orchestration: 168 passed (incl. 3 new `deriveAttachmentSignals` tests).
- (known-environmental only: 3 `test_multiformat_extraction` fail on `No module named 'fitz'`
  — PyMuPDF absent on this Windows box, unrelated to classification.)
