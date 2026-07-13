# Changes — TKT-102: Tractable received-email handling

## Status
engine + orchestration code-complete (final wave D2, 2026-07-09) — parser/orch deploys + live
Tractable-email proof PENDING

## Changes — engine parts (sibling-first, ADR-0018)

**Sibling commit `ab5f8d2`, annotated tag `engine-v2.12`, pushed to origin. Re-vendored into
`functions/parser/cedocumentmapper_v2` INCLUDING a deliberate vendored providers.json seed bump
(the cloud parser reads the vendored seed via `parser_adapter._VENDORED_PROVIDERS_JSON` — same
pattern as the engine-v2.10 CDQ cut). No DDL dependency: the classifier emits only existing
taxonomy codes (`case_update`/`images_received`, live since taxonomy v2).**

### Before/after (the three real .eml samples, evidence/tractableexamples/)
Before: `other · other` (0.3, `uncorroborated_instruction_doc`). After: `case_update ·
images_received` (0.8, rule `image_service_delivery`), `body_jobref=''` (the TKT-103 money guard
holds on the AI-quote figures), `body_vrm=''` (no junk from the portal-URL/UUID text).

### What changed (sibling)
- **Classifier Rule 0f** (before the Rule-1 instruction-doc promotion, like the 0d payment lane):
  identity anchor (tractable.ai sender domain, subdomain-suffix matched, OR the "Powered by
  Tractable" footer on a forward) AND delivery wording ("completed lead"/"damage capture") →
  `case_update · images_received` — an image-delivery lane, NOT new work; the existing taxonomy
  fits, NO extension needed. Identity alone does not fire (a Tractable support/invoice email
  stays out); never keyed on the emoji. Rules data-externalized: three new `triage-rules.json`
  collections (+schema, loader; snapshot 291→297).
- **Layout provider "Tractable"** (providers.json, data-driven, no new rule kinds): detect =
  "Vehicle Information" + "Submitted Vehicle Images" + "Preliminary AI quote" (all three sample
  PDFs detect at 1.0; zero cross-detection across the fixture corpus). vrm ← "Registration
  Number" label-next-line (`Ou66vdc` → `OU66VDC` verified); vehicle_model ← "Model" (MODEL only —
  make/Producer is a recorded remainder: the two-column layout interleaves rows, and no rule kind
  concatenates two labels); mileage ← "Mileage" ("143,875" → "143875"); incident_date ← same-line
  "Accident Date:" ("Mon Jul 06 2026" → "06/07/2026" via a new weekday-strip in `normalize_date`,
  unit-tested). reference/work_provider/claimant_*/inspection_address declared none +
  fallback-SUPPRESSED: the Tractable Case-ID UUID and quote money must never mint a case_ref;
  Tractable is never a work provider; the PDF header carries CE's OWN desk@ address (the
  claimant_email fallback would have minted it). `suppress_fallback_fields` schema enum gained
  claimant_telephone/claimant_email.
- **Fixtures/eval**: `TRACTABLE 01.pdf` corpus fixture pins the Vehicle Information extractions +
  the critical empties; classifier fixtures pin the real sample shape (money guard, no junk VRM,
  durable-signal variants, support-email negative). Eval baseline deliberately regenerated — all
  movement upward (overall 0.9348→0.9483; new `mileage: 1.0`; reference/vrm stay 1.0).
- **Images**: `extract_images` on the real PDF keeps the 7 "Submitted Vehicle Images" photos and
  drops the 70×65 "Powered by" logos (pinned). HONEST LIMIT: a 1016×565 CE letterhead graphic
  survives the decorative filter (photo-shaped aspect; raster-content typing is TKT-047).

## Changes — orchestration parts (match by the PDF's VRM, suggest-first)

The Tractable email body carries NO VRM/reference — the match key lives inside the PDF, so a new
additive rung runs ONLY for image-delivery emails the subject/body machinery could NOT match:

- `orchestration/src/functions/activities/imagesReceivedVrmMatch.ts` (NEW): pure
  `shouldAttemptPdfVrmMatch(classification, triage, attachments)` — category `case_update` +
  subtype `images_received`, triage produced no case and no case_link suggestion, and a PDF
  attachment exists; plus the `imagesReceivedVrmMatch` activity: canonicalises the /parse-returned
  VRM, matches OPEN cases via the existing internal VRM-twins lookup, then (a) exact-single →
  writes the SAME `case_link` suggestion the ref-gate rung writes (`POST /api/internal/triage/
  suggest-link`, plain-language rationale "The photos in this email look like they belong to case
  X — the registration in the attached report matches."); VRM-only NEVER auto-attaches (ADR-0010;
  auto-attach stays reference-corroborated only); (b) none/several → the existing TKT-034
  attention flag (`unmatched_images`) so the email is VISIBLY parked, with several-matches noted
  in the flag detail. No case is ever minted here.
- `orchestration/src/functions/intakeOrchestrator.ts`: the rung slots after the existing triage
  block for uncased non-new-work emails — re-uses the EXISTING `parse` activity over the
  attachments (gated `PDF_MAPPER_ENABLED` inside, exactly like the instruction lane), then the
  match activity; checkpointed-value predicate, additive try/catch (a parse/match failure never
  blocks intake), `pdfVrmMatch` outcome surfaced in the orchestrator result for observability.
- Attach-time evidence flow REUSED, not rebuilt: on accept of the case_link suggestion the
  existing accepted-link machinery attaches the email; the PDF + extracted images ride the
  existing evidence lanes (`extractImages` + Box archive) exactly as for any attached email.
- Tests: `imagesReceivedVrmMatch.test.ts` (NEW, 12 — predicate gates incl. gate-off inertness,
  exact-single suggestion payload + plain language, none/several → flag, malformed VRM). Orch
  suite 262/262 green.

## Honest remainders
- VIN has no engine field slot (schema deliberately NOT extended); vehicle MAKE not captured
  (model only); mileage_unit left empty (a flow/review decision, not a layout fact).
- A Tractable variant whose footer trips an auto-reply marker abstains at Rule 0 before 0f
  (mirrors the documented Rule 0d limit).
- **Accepted case_link does not BACKFILL evidence for an email processed while uncased** — if the
  attachments were never persisted (no case at intake time), accepting the link attaches the
  email but not retroactive evidence rows; new-ticket candidate (see the batch report).
- Live proof pending: a real/synthetic Tractable email through the deployed stack →
  `case_update·images_received`, PDF VRM parsed, exact-single suggestion (or the visible flag),
  images extracted + archived on accept.
# Reopened follow-up — 2026-07-13

The newest real Tractable arrival is a live regression against the intended path: it was recognised but
only suggested for linking despite one clear case target, and its submitted images were not extracted. The
ticket is reopened to make exact-single linkage automatic, diagnose the extraction break and prove the
durable end-to-end chain on the supplied Ashfaq sample.
