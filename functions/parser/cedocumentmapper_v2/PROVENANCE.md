# Vendored engine provenance — `cedocumentmapper_v2`

> ## ⚠ DEPLOY-ORDER WARNING (as of the `engine-v2.3` pin, 2026-07-02; still true at `engine-v2.4` / `engine-v2.5`)
>
> **This vendored tree now emits taxonomy v2** — `classify_email` can return the
> new `case_update` / `cancellation` categories (subtypes `images_received` /
> `update_general` / `cancellation_notice`) and a `taxonomy_version` field on every
> response. **Do NOT deploy the parser Function from this tree until the operator
> has applied the additive DDL delta**
> `migration/assets/schema/deltas/2026-07-02-rules-engine-v2-taxonomy.sql`
> (see [`docs/gated.md`](../../../docs/gated.md)) — the Data API / Postgres side
> must accept the new choiceset codes *before* the parser can legally emit them.
> Deploying the parser first risks the Data API rejecting (or silently
> mis-storing) a row it does not yet recognise. Deploy order: **DDL delta first,
> parser re-deploy second** — this mirrors the rules-engine-v2 plan's Phase 2
> "deploy order is part of the design" discipline.
> ([`docs/plans/rules_engine_v2_plan_9ba034c4.plan.md`](../../../docs/plans/rules_engine_v2_plan_9ba034c4.plan.md))

This directory is a **pinned vendored copy** of the Collision Engineers document
parser engine. It is the package the FC1 parser Function imports as
`import cedocumentmapper_v2` (the Function root `functions/parser/` is on the
worker `sys.path`, so this folder resolves as a top-level package).

**The sibling repo is the authoring source of truth. This is a re-cut copy.**
ALL engine edits land in the sibling first, then this copy is re-cut by the
documented command below. As of the `engine-v2.1` tag it is **never
hand-edited** — every shared file, including the bundled JSON resources, is a
byte-for-byte mirror. No reconciliation is currently outstanding.

## History (condensed)

**2026-07-11 (TKT-089 recall — classifier-owned banner shapes):** re-cut from the sibling at
**`engine-v2.16`** (branch `codex/tkt089-banner-recall`, commit `8dd4ba8` — **branch + annotated
tag PUSHED to origin**). One file, `application/service.py`: removed the aspect-ratio/short-side
decorative-image rule introduced at `engine-v2.11`. Raster geometry cannot distinguish a
banner-shaped crop of a vehicle from letterhead furniture, so every raster at or above the existing
40,000-pixel area floor is retained for downstream semantic classification; only genuinely tiny
rasters remain parser-suppressed, and unknown dimensions remain retained. The email-lane filter in
`orchestration/src/lib/image-sniff.ts` likewise removes its banner-shape rung while retaining its
existing conservative fallback for formats whose dimensions cannot be read. Sibling focused suite:
**19 passed**. Sibling full suite: **450 passed / 5 skipped / 5
environmental legacy-DOC/eval failures** on this Windows runner (LibreOffice/antiword unavailable),
with no image-extraction failures. The wrapper's focused parse/EML/image/EVA suite is **50 passed**;
its full suite is **270 passed / 28 skipped / 1 pre-existing environmental legacy-DOC failure**
(`ALS INSTRUCT 01.DOC` cannot recover its VRM on this runner). No taxonomy/DDL dependency;
providers.json untouched. Byte-mirror restored and verified against all 35 tagged sibling blobs.

**2026-07-10 (TKT-089 reopen — banner-aspect 3.2):** re-cut from the sibling at
**`engine-v2.15`** (branch `feat/tkt043-open-case-ref-context`, commit `79efe22` — **branch +
annotated tag PUSHED to origin**). One file, `application/service.py`: `_BANNER_ASPECT_RATIO`
lowered **3.5 → 3.2** (short-side cap unchanged at 240 px) — the verify-sweep's live probe showed
the recurring QDOS Assistance letterhead logo (575×174, aspect **3.305**) evading the v2.11 rung
by a hair on the live parser. Recall guard unchanged in kind: photos are ≤ ~1.8:1 (21:9 ≈ 2.33),
and a genuine 3.2:1 pano carries a short side far above 240 px. The **204×204 MGAA square badge**
from the same letterhead is **deliberately engine-KEPT** (shape-indistinguishable from a small
genuine photo — the verifier's judgement); the collisionspike pipeline's vision classifier
excludes it at persist instead (extraction-lane `nonVehicleExcluded`,
`orchestration/src/lib/image-classify.ts`) — a sibling pin documents that division of labour so a
future threshold tune cannot claim it blind. Sibling fixtures: 575×174 suppressed (unit matrix +
PDF param), 768×240 / 767×240 inclusive-boundary pair, 204×204 kept. Sibling suite **452 passed /
5 skipped** (all skips environmental: Tesseract ×2, LibreOffice, DOC deps, v1 placeholder).
Kept in lockstep with the email-lane mirror `orchestration/src/lib/image-sniff.ts`
(`BANNER_ASPECT_RATIO` 3.2, same commit set). No taxonomy/DDL dependency; providers.json
untouched. Byte-mirror restored (drift guard green).

**2026-07-10 (TKT-147 Tractable make two-label capture + vin envelope field):** re-cut from the
sibling at **`engine-v2.14`** (branch `feat/tkt043-open-case-ref-context`, commit `2609b1a` —
**branch + annotated tag PUSHED to origin**), INCLUDING a **deliberate providers.json seed update**
(the Tractable layout's `vehicle_model` rule moves to the NEW `two_label_join` kind with config
`Producer||Model`, and gains a `vin` single-label rule + `vin` fallback-suppression). **Two-label
join:** new rule kind `two_label_join` (`rules/engine.py` dispatch + `_extract_two_label_join`;
v1-method mapping in `config/migration.py`; schema enum + `first_labels`/`second_labels`/`separator`
in the sibling's schema copies — NOT vendored, see Omitted modules) — captures each of two separately
labelled parts with the existing label_same_or_next_line machinery and joins the non-empty parts, so
the Tractable interleaved two-column layout now yields make+model (`Producer`→"Volkswagen" +
`Model`→"Touran" ⇒ **"Volkswagen Touran"**; the TKT-102 make/Producer remainder is closed). A bare
placeholder-dash part reads as absent. **vin:** new `FieldKey.VIN` — OPTIONAL, envelope-only,
label-driven per layout with deliberately NO document-wide fallback sniff (absence stays absence);
`normalize_vin` (`normalization/normalizers.py` + `__init__.py` export) uppercases/strips whitespace
and blanks bare placeholder tokens (`-`, `N/A` — the Tractable no-VIN samples print `-`). **The EVA
export is UNCHANGED:** `domain/models.py` adds `EVA_EXPORT_FIELD_ORDER` (= the settled EVA key set)
and `exporters/eva_json.py` iterates IT, never `FIELD_ORDER`, so `vin` rides the engine record's
`fields` map and the Function wrapper surfaces it as a top-level `/parse` field cell, separate from
the settled EVA extraction. It can never reach the EVA JSON payload (`eva-json.schema.json`
untouched, `additionalProperties: false` still enforced; sibling and wrapper tests pin a VIN-carrying
record exporting without one). Sibling fixtures: `TRACTABLE_01` re-pinned
(vehicle_model "Volkswagen Touran" + vin present), NEW `TRACTABLE 02.pdf` (the TKT-102 evidence
`tractable2.pdf`) pins the NO-VIN sample (vin `""` from the `-` placeholder). Sibling suite **451
passed / 4 skipped** (439 → 451, +12 new); eval baseline deliberately regenerated via an ISOLATED
seeded engine (all movement upward: overall 0.9483→0.9571, new `vin: 1.0`, work_provider
0.75→0.7778, vehicle_model stays 1.0); mypy/ruff pre-existing findings unchanged (35/27), none in
the changed files' additions. Byte-mirror restored (drift guard green). This repo's parser suite:
281 passed / 11 skipped / 1 PRE-EXISTING environmental failure — identical counts to the
pre-re-cut baseline captured this pass (`test_multiformat_extraction[ALS_doc]` fails identically
against the pre-re-cut tree on this Windows box); `tests/test_eva_export.py`'s full-record test was
updated to the `EVA_EXPORT_FIELD_ORDER` contract (+ a VIN-cannot-leak assertion). NOTE: this
entry also TRUES UP the prior entry's "commit + `engine-v2.13` tag PENDING" caveat — the C2/C4 cut
was subsequently committed as sibling `05494a9` and the `engine-v2.13` tag (lightweight) pushed to
origin, so the v2.13 pin this cut supersedes was reproducible after all.

**2026-07-09 (classifier bug-fixes C2 body-only-instruction + C4 labelled-ref money — collisionspike):**
re-cut from the sibling at **`engine-v2.13`** (branch `feat/tkt043-open-case-ref-context`; **commit +
`engine-v2.13` tag PENDING** — this re-cut was applied to the sibling working tree only; the operator
commits + tags + pushes it per ADR-0018 BEFORE deploying the parser Function from this tree; do NOT
deploy from an uncommitted re-cut). One file, `rules/email_classifier.py`; two additive
classifier-logic fixes with **NO new taxonomy codes / NO DDL dependency** (`TAXONOMY_VERSION` stays 3,
so — unlike the taxonomy cuts above — the deploy-order warning does NOT apply). **(C2)** a genuine
body-only instruction now wins over the `pre_instruction` lane: Rule 0e (`pre_instruction_directions`)
gains a disqualifier mirroring Rule 3's second arm (`strong_body_instruction`) EXACTLY — `not is_reply
and work_phrases and body_vrm and has_existing_ref and not query_phrases` — so a FRESH (non-reply)
1-work-cue + body-VRM + existing-ref email carrying "instructions to follow" boilerplate classifies
`receiving_work` (rule `body_only_instruction`) instead of returning `pre_instruction` and minting no
case. The `work_phrases` term is load-bearing: it keeps the lane firing for the genuine "directions
with NO work cue" case (which Rule 3's arm never catches). **(C4)** the `_job_reference` LABELLED tier
now `finditer`s (was first-match `.search()`) so a money value in an EARLIER labelled match
(`Ref: 768.00`) can no longer mask a genuine labelled ref later on (`Our Ref: 12345`) — mirrors the
structured tier's existing iterate-past-money guard (TKT-103). Three new sibling unit tests
(`tests/test_email_classifier.py`): `test_body_only_instruction_beats_the_pre_instruction_lane`,
`test_pre_instruction_still_fires_for_directions_with_no_work_cue_and_a_ref`, and
`test_labelled_ref_extractor_continues_past_a_money_value`. Sibling suite **439 passed / 4 skipped**
(436 → 439, +3 new). Byte-mirror restored (drift guard green).

**2026-07-09 (TKT-136 fallback-reference/VRM guards + TKT-102 Tractable lane):** re-cut from the
sibling at **`engine-v2.12`** (branch `feat/tkt043-open-case-ref-context`, commit `ab5f8d2` —
branch + tag PUSHED to origin), INCLUDING a **deliberate providers.json seed update** (the new
**Tractable** image-capture layout provider — TKT-102). **TKT-136:** the /parse
`_fallback_reference` tiers now share the classifier's TKT-103 MONEY guard (one canonical
`reference_candidate_is_money` in `rules/engine.py`; `_job_reference` behaviour identical) plus a
new FRAGMENT-plausibility guard (`reference_candidate_is_fragment` — unit-quantity tokens like
`650g`, multi-word prose heads) that kills the live junk case_ref **"RIGERANT R1234YF"** (the fuzzy
`ref` label had matched the head of a `REFRIGERANT R1234YF` parts line); tier-4 reference cues now
match on WORD BOUNDARIES ("refrigerant" no longer reads as a `ref` cue). The scope addendum ports
the classifier-only TKT-071 postcode-area TIGHT anchor + #7/F162 stop-word TRIGRAM guards to the
/parse document path (`vrm_document_candidate_is_bad`; canonical definitions moved to `engine.py`,
the classifier aliases them — no drift; on the labelled tier the fuzzy-matched VRM label line is the
anchor scope). Sibling fixture `RIGERANT ESTIMATE 01.pdf` reproduces the live junk pre-fix and pins
`reference`/`vrm` empty via a new `unknown_temp` (no-provider/fallback-only) regression-harness
sentinel. **TKT-102:** classifier **Rule 0f** — a Tractable "New completed lead" delivery email
(identity: `tractable.ai` sender domain or the "Powered by Tractable" footer; delivery wording:
"completed lead"/"damage capture"; NEVER the subject emoji) classifies **case_update ·
images_received** (existing taxonomy codes — NO new DDL dependency; pre-0f these abstained to
`other` as uncorroborated instruction docs, so no wrong rows to backfill). Three new
`triage-rules.json` collections (`image_service_sender_domains` / `_identity_phrases` /
`_delivery_phrases`; schema + loader + snapshot 291→297). The **Tractable provider record** (v1
seed shape) detects all three evidence PDFs at 1.0 with no fixture-corpus cross-detection either
way; extracts vrm ← "Registration Number" (label-next-line, `Ou66vdc`→`OU66VDC`), vehicle_model ←
"Model" (model only — the two-column layout interleaves Repair-Summary rows into plain text, so a
`Producer || Type` between_labels capture is junk; make/Producer is a recorded remainder), mileage ←
"Mileage" (comma-grouped), incident_date ← same-line "Accident Date:" (`normalize_date` now strips a
leading WEEKDAY word: "Mon Jul 06 2026" → 06/07/2026); reference/work_provider/claimant_*/
inspection_address are declared `none` + fallback-suppressed (the Tractable **Case ID** UUID and
AI-quote money must never mint a case_ref; Tractable is never a work provider; the PDF header
carries CE's OWN desk@ address). **VIN has no engine field slot** — recorded remainder, schema NOT
extended. `extract_images` verified on the real PDF: the 7 "Submitted Vehicle Images" photos kept,
the three 70×65 "Powered by" logos dropped; HONEST LIMIT — the 1016×565 CE letterhead graphic is
kept (1.8:1 aspect is a photo shape; raster-content typing is TKT-047). The
`provider-config.schema.json` `suppress_fallback_fields` enum gains the B2
`claimant_telephone`/`claimant_email` (sibling schema copies only — that schema is deliberately NOT
vendored). Sibling suite **436 passed / 4 skipped**; eval baseline deliberately regenerated, all
movement UPWARD (overall 0.9348→0.9483, work_provider 0.7143→0.75, new `mileage: 1.0`;
`reference`/`vrm` pins stay 1.0). Byte-mirror restored (drift guard green); this repo's parser suite
281 passed / 11 skipped / 1 PRE-EXISTING environmental failure
(`test_multiformat_extraction[ALS_doc]` — fails identically against the pre-re-cut tree on this
Windows box).

**2026-07-09 (PLAN-003 evidence wave — collisionspike TKT-089/TKT-090):** re-cut from the
sibling at **`engine-v2.11`** (branch `feat/tkt043-open-case-ref-context`, commit `4cbf19a`).
One file, `application/service.py`: (1) **TKT-090 naming fix** — `extract_images` stems no
longer default an unresolved `work_provider` to the hardcoded **`'RJS'`** or an unresolved
`vrm` to the literal **`'UnknownVRM'`**; unresolved tokens are **omitted** (empty/whitespace
checked BEFORE `safe_filename`, whose own empty-input fallback is `"export"`), leaving
`img_<page>_<n>` as the guaranteed-non-empty, unique tail (the orchestration's
`extractImages` activity prepends `<source-doc-stem>__`). The cloud wrapper passes
`fields={}`, so every live extraction had been branded `RJS_UnknownVRM_…`. (2) **TKT-089
banner heuristic** — `is_decorative` lifted to module-level `is_decorative_raster` and
extended past the 200×200 area floor: an above-floor raster was treated as decorative when aspect
≥ 3.5:1 AND short side ≤ 240 px (wide letterhead banners ~900×180, tall sidebar strips; unknown
dimensions stayed kept). The email-lane filter in `orchestration/src/lib/image-sniff.ts` mirrored
those thresholds. **Superseded by `engine-v2.16`:** banner-shaped candidates are now retained for
semantic classification in both lanes. No taxonomy/DDL dependency; no providers.json change. Sibling suite 396
passed / 4 skipped; new sibling tests `tests/test_extract_images.py` (13) ported to this
repo's `functions/parser/tests/test_extract_images.py`. NOTE: downstream evidence rows key
on `(case_id, storage_path)` and no code consumer parses the `_img_\d+_\d+` /
`RJS_UnknownVRM` filename shape (grep-verified across api/orchestration/SPA), so the name
change is deploy-safe; only ad-hoc KQL/SQL sweeps that grep for `RJS_UnknownVRM` need their
patterns updating.

**2026-07-09 (PLAN-003 classifier wave — collisionspike TKT-022/070/071/083/084/085/086/097/100/103/105/120):**
re-cut from the sibling at **`engine-v2.10`** (branch `feat/tkt043-open-case-ref-context`, commit
`8e7f2f7`), INCLUDING a **deliberate providers.json seed update** (the new **CDQ** claimant-questionnaire
claim-form provider — TKT-022). **TAXONOMY v3** (bump 2→3): +`pre_instruction` ·
`pre_instruction_directions` (TKT-084, operator-signed-off; Rule 0e, future-instruction-anchored
`pre_instruction_phrases`) and +`billing` · `payment_remittance` (TKT-105/120; Rule 0d
`payment_phrases` — an inbound remittance/transfer notice routes to the payments lane BEFORE the
Rule-1 instruction-doc promotion). **Deploy-order:** the taxonomy-v3 DDL delta
(`migration/assets/schema/deltas/2026-07-09-taxonomy-v3-pre-instruction-payments.sql`, codes
100000007 / 100000013-100000014) was applied + verified live BEFORE this tree deployed. Other changes
riding this cut: the VRM guards (month/day-word + function-word-head denylists, all-alpha rejection
in `_is_suspicious_value`, the postcode-area TIGHT anchor in `_canonical_body_vrm` — TKT-085/100/071);
the `_job_reference` MONEY guard (TKT-103 — "£768.00" is never a reference; structured tier iterates
past money tokens); cancellation phrases +2 ("not wish to proceed" family — TKT-097);
`_delivered_images_only` kinds-only fallback (fixes the PR#45-era images_received→update_general
regression when a caller passes kinds but no filenames); the TKT-083 arm ADJUDICATION comment + pin
(ref-AND-VRM stands — the OR widening regressed the abstain lane in a full-corpus A/B); the
`cdq_claim_form` extraction method + `method: "none"` rule kind + `suppress_default_work_provider`
(migration + engine + schema enums). Deployed to `cespike-parser-dev-x7xt3d5ovhi7y` 2026-07-09
(`func publish --build remote`); live `/classify-email` probes verified payment_remittance /
pre_instruction (taxonomy_version 3) / the new cancellation phrase / body_vrm='' on the HD4110 shape.
Byte-mirror restored (drift guard green); sibling suite 381 passed.


**2026-07-08 (signature-aware `_delivered_images_only` — collisionspike PR#45 review, Finding C):**
this vendored copy is now re-cut from the sibling at **`engine-v2.9`** (branch
`feat/tkt043-open-case-ref-context`, commit `130e862`). One file, `rules/email_classifier.py`:
`_delivered_images_only` now drops signature/logo images (`imageNNN.png`) and requires ≥1
non-signature file **before** the all-image KIND fast-path, so a reply carrying only a signature
logo no longer short-circuits to `images_received`. A direct unit test
(`test_delivered_images_only_signature_aware`) pins signature-only → False and real-photo+signature
→ True; the eval `--check` shows **no** baseline movement. Kept in lockstep with the orchestrator's
`deriveAttachmentSignals.deliveredImagesOnly` (same fix, same commit set). **The sibling branch +
both `engine-v2.8` and `engine-v2.9` annotated tags are now PUSHED to
`origin` (`collisionengineers/cedocumentmapper_v2.0`)** — closing PR#45 Finding D (the ref is
reproducible from the remote). Vendored + sibling classifier suites green; byte-mirror restored.

**2026-07-08 (open-case-ref context for case_update routing — collisionspike TKT-043):**
one file, `rules/email_classifier.py`, edited on the sibling first (branch
`feat/tkt043-open-case-ref-context`, commit `b30e382`, tagged **`engine-v2.8`**) then
re-cut here (byte-mirror restored). Two additive, default-off changes: (1) a new
`open_case_ref_match` (one|none|ambiguous) request field — a FLOW-RESOLVED context signal
the classifier is told exactly like `provider_match_state` (the open-Case lookup stays on
the flow side, ADR-0019). When it is one/ambiguous + an existing ref + new non-report
evidence, the fresh-work promotion (Rules 1-3) is suppressed so a work-shaped delivery on a
ref the flow has resolved to an OPEN case routes into the `case_update` lane instead of
minting fresh work (TKT-043's "Engineers report is required on the following case … <PO>"
chaser). Absent/none = today's behaviour EXACTLY (kill-switch: zero corpus movement without
the signal). (2) `_delivered_images_only` gains a FILENAME tier (factored `_is_image_evidence_file`)
so a photos-in-a-PDF ("images - cvd.pdf") the extension-derived kind reads as `instruction`
is still `images_received`; an engineer's report / a non-image PDF (Audatex) is not
(tkt093 stays `update_general`, a real-image reply stays `images_received`). NO new taxonomy
codes (the `case_update`/`images_received` it emits were already live per the engine-v2.3
deploy-order note above), so no DDL dependency for this cut. Vendored + sibling classifier
suites green; the drift guard is a byte-mirror again.

**2026-07-07 (acknowledgement/query/case_update batch — collisionspike TKT-081/082/083/093):**
the email-classifier fixes for four live misclassification tickets were applied to
THIS vendored copy first this pass, then **upstreamed verbatim to the sibling**
(branch `sync/email-misclass-081-093`, commit `ccfb473`, tagged **`engine-v2.7`**)
and re-cut back — restoring the byte-mirror (same pattern as the 2026-07-03
reconvergence below). Two files: `rules/email_classifier.py` — greeting- /
auto-reply-preamble- / reaction-notice-aware acknowledgement detection with a
greeting-relaxed length cap and a Rule-0 auto-acknowledgement branch (TKT-081, incl.
the automated "thank you for your email" that was minting a blank Case); a possessive
"your report" about-existing suppressor that neutralises the `engineers report` work
keyword (TKT-082); a relaxed Rule-3 floor promoting a fresh body-only instruction with
one work phrase + a VRM + an existing ref (TKT-083); forward-subject promotion
suppression + a case_update body-VRM anchor for a reply/forward (TKT-093). And
`resources/triage-rules.json` — three automated-email auto-reply markers. Pure
classifier-logic change; the vendored + sibling classifier/eval suites stayed green.
No NEW taxonomy codes (the `case_update` category it can emit was already live per the
engine-v2.3 deploy-order note above), so no DDL dependency for this cut.

**2026-07-03 (ADR-0021 case-type marker taxonomy + TKT-051 work-provider guard):**
two sibling commits, re-cut together. First, a **reconvergence**: the 2026-07-02/03
collisionspike classifier hardening (P1-4a/b/c ref-extraction fixes, the P1-5
new-image-evidence detector, and the 29-email-corpus phrase additions to
`triage-rules.json`) had been applied to THIS vendored copy without landing in
the sibling first — upstreamed verbatim as sibling commit `6fc03cb`, restoring
the byte-mirror. Second, the **engine-v2.6 feature work** (sibling `f474ea0`,
tagged **`engine-v2.6`**): (1) `rules/engine.py` — the layout-name
`work_provider` fallback is suppressed for `engineer_report: true` layouts, so
an attached third-party EVA/CNX report can no longer leak "EVA (Engineers)" as
the case's work provider (TKT-051); (2) the case-type marker taxonomy —
`detection/case_type.py` now reads the full marker set (`A.` audit / `AP.`
audit_total_loss / `D.` diminution), `_apply_case_type` maps all three,
`rules/email_classifier.py`'s `CASEREF_RE` accepts the widened prefix, and a
new `rules/engine.py detect_case_type_signals` derives `(case_type, dual,
signals)` from instruction text — `dual` marks the QDOS "REPORT + AUDIT
REPORT" one-letter-both-deliverables template (new `dual_report_audit_phrases`
+ review-first `diminution_phrases` collections in `triage-rules.json` +
schema + loader; `audit_total_loss` is NEVER content-inferred);
(3) `domain/models.py ExtractedRecord` gains `case_type_dual`, round-tripped by
`record_to_dict`/`record_from_dict`. Deploy-order note: the `case_type`
envelope additions are additive and the Data API consumes them behind
`AUDIT_CASES_ENABLED` (default off), so parser-first deploy is safe; the
`choice_case_type` DDL delta must be applied before the gate is flipped.

**2026-07-02 (rules-engine-v2 Phase 5 — externalized triage phrase data):** the
sibling moved the 13 flat keyword/phrase string collections used by the email
classifier (`rules/engine.py`'s `_AUDIT_PHRASES` / `_WORK_KEYWORDS` /
`_BILLING_KEYWORDS` / `_INFORMAL_WORK_KEYWORDS` / `_QUERY_KEYWORDS` /
`_CHASE_PHRASES` / `_SUMMARY_MARKERS` / `_CANCELLATION_PHRASES`;
`rules/email_classifier.py`'s `_AUTO_REPLY_MARKERS` / `_VRM_STOPWORD_TRIGRAMS`)
and content-based attachment typing (`detection/attachment_typing.py`'s
`_REPORT_TITLE_PHRASES` / `_REPORT_STRUCTURE_PHRASES` / `_JUNK_PHRASES`) out of
Python literals into a new schema-validated bundled resource,
`resources/triage-rules.json` (schema: `resources/triage-rules.schema.json`,
pattern: `provider-config.schema.json`), loaded by a new
`rules/triage_rules.py` (`importlib.resources` + `jsonschema.validate` on
every load, module-level cached). The three consumer modules now assign their
existing constant NAMES from the loader (e.g. `_WORK_KEYWORDS =
_RULES.work_keywords`) instead of defining tuple/frozenset literals, so every
import-site elsewhere is untouched. Regexes, rule ordering, confidence bands
and suppression logic are all unchanged, still Python — this is a pure,
zero-classification-behaviour-change data move (the sibling's + this repo's
classifier/attachment-typing test suites are unchanged and stayed green
throughout, proving parity). Runtime schema validation now runs on THIS
(the cloud/FC1) path too, not just desktop/test tooling — a typo'd or emptied
phrase collection fails loud at import time instead of silently degrading a
rule. Tagged **`engine-v2.5`**; this copy adds `rules/triage_rules.py` and the
two new `resources/*.json` files to the vendored set (both already covered by
the drift guard's dynamic `rglob("*.py")` / `resources/*.json` globs — no test
changes needed) and re-cuts the three modified modules verbatim; diff-verified
to touch only these six files, nothing else.

**2026-07-02 (rules-engine-v2 Phase 3 — content-based attachment typing):** the
sibling added `detection/attachment_typing.py` — a pure `type_document_text(text,
catalog)` that types a document's already-extracted text as
`instruction`/`report`/`junk`/`unknown` BY CONTENT (never filename/extension),
reusing `ProviderDetector` (provider `detect_phrases`) and
`rules.engine._WORK_KEYWORDS` rather than duplicating either — see that module's
own docstring for the full precedence rules (report checked before instruction;
a corroboration gate mirroring `classify_email` Rule 1's discipline). Re-exported
from `detection/__init__.py` alongside the package's existing exports — the one
non-additive line this re-cut touches. Tagged **`engine-v2.4`**; this copy is cut
from it, diff-verified against the prior `engine-v2.3` pin to touch only that
export line plus the new module, nothing else. The parser's `/parse` route now
surfaces the result as an additive, unconditional `content_typing` response
field (no feature gate — see `parser_adapter.py` / `function_app.py` and
`openapi/parser-connector.json`'s new `ContentTyping` definition).

Known limitation, NOT solved here (tracked as a rules-engine-v2 Phase-3
follow-up, not this slice): the collisionspike email-intake pipeline classifies
the EMAIL (orchestration step 1.5, `classifyInbound.ts`) *before* it parses any
attached document (`/parse` runs at step 4), so `content_typing` cannot yet feed
`classify_email`'s Rule 1 instruction-doc corroboration gate pre-classify — that
would need a pipeline reorder (e.g. parse-before-classify, or a second
post-parse classify pass) which is out of scope for this Phase-3 slice. Today
`content_typing` is a `/parse`-time RESPONSE field only, ready for a downstream
resolve/identification layer or telemetry pipeline to consume — see
[`docs/plans/rules_engine_v2_plan_9ba034c4.plan.md`](../../../docs/plans/rules_engine_v2_plan_9ba034c4.plan.md)
Phase 3.

**2026-07-02 (rules-engine-v2 Phase 2 — taxonomy v2):** the sibling added two
additive top-level categories to the email classifier — `case_update`
(`images_received` / `update_general` subtypes; TKT-034/043) and `cancellation`
(`cancellation_notice` subtype; TKT-041, highest precedence — checked before the
instruction-doc promotion) — plus a `taxonomy_version` response field. First
tagged `engine-v2.2`; the vendored consumer's own ticket-eval test caught a real
regression before this reached anywhere downstream (the real TKT-038 "Thanks Ed"
email, whose embedded signature images were being read as `case_update` evidence
instead of staying `non_actionable/acknowledgement`), fixed on the sibling by
excluding bare-acknowledgement replies from `case_update`, and re-tagged
**`engine-v2.3`** (`engine-v2.2` is left in the sibling's history as a real
point-in-time snapshot but must not be re-cut from). This copy is cut from
`engine-v2.3`. See the DEPLOY-ORDER WARNING at the top of this file before
redeploying the parser Function from this tree.

Earlier cuts (2026-06-23 through 2026-07-01) went through several rounds of
drift and reconciliation, pinned in turn to `4824136`, `af98383`, `e256760`,
and `504c3a3` on the sibling's `feat/audit-case-type-detection` branch. At each
of those points the vendored copy carried at least one **vendored-only**
divergence (code authored here first, not yet upstreamed) — most recently the
ROADMAP-B2 claimant-contact extraction (`FieldKey.CLAIMANT_TELEPHONE` /
`CLAIMANT_EMAIL`, their normalizers, and the `eva-json.schema.json` properties
they need) — while earlier ones (the engineer-report "audit/validate" overlay,
the "Image Based Assessment" normalisation, the audit case-type detector, and
the Phase-8 deterministic email classifier) were converged one by one as they
landed in the sibling.

**2026-07-02 (rules-engine-v2 Phase 0):** the sibling's PR #4 (intake
classifier + reader/engine work) merged to `main`; PR #5 closed as a strict
subset of PR #4; the last outstanding divergence — ROADMAP-B2 — was upstreamed
into the sibling (`domain/models.py`, `normalization/__init__.py`,
`normalization/normalizers.py`, `rules/engine.py`, and the
`eva-json.schema.json` claimant properties, copied byte-for-byte from this
vendored copy, which was the authoring source); and the sibling tagged its
**first engine release, `engine-v2.1`**. This copy was then re-cut verbatim
from that tag. Per [ADR-0018](../../../docs/adr/0018-cedocumentmapper-dual-target-vendored-engine.md)
Decision 3, the re-cut is now a **true, zero-patch mirror**: every shared file
(all `.py` modules plus the bundled `resources/*.json`) is byte-identical to
the sibling, verified by `tests/test_engine_vendored_in_sync.py`.

One fix landed **in this consolidation, on the sibling first**, then flowed
back through the mirror: `application/service.py`'s provider-catalog seed
loading conflated "an explicit `app_data_dir` was passed" with "always reload
the fresh vendored seed, ignoring any on-disk catalog" — correct for this
Function's pinned-seed need, but it silently broke the sibling CLI's
`--app-data-dir` override (9 sibling tests). Fixed by decoupling the two into
an explicit `always_reload_seed` parameter (default preserves this Function's
existing behaviour); see the sibling's `fix(service):` commit on
`feat/intake-classifier-2026-06-29`. This copy already carries the result —
nothing further to do here.

## Source

- **Sibling repo:** `collisionengineers/cedocumentmapper_v2.0`
  (`https://github.com/collisionengineers/cedocumentmapper_v2.0.git`)
- **Source path inside the sibling:** `src/cedocumentmapper_v2/` (except
  `providers.json`, which lives at the sibling repo root)
- **Cut from:** annotated tag **`engine-v2.16`** on branch
  `codex/tkt089-banner-recall`, commit **`8dd4ba8`** (2026-07-11) — **branch + tag PUSHED to
  origin** and merged into the sibling's default `main` by PR 7 on 2026-07-12. The TKT-089 recall removes the banner-aspect/short-side hard drop so every candidate at
  or above the 40,000-pixel area floor reaches semantic classification. Changed vs `engine-v2.15`:
  `application/service.py` ONLY (no taxonomy/DDL dependency; providers.json untouched).
  Prior pin: annotated tag **`engine-v2.15`**, commit **`79efe22`** (2026-07-10) — the now-superseded
  banner-aspect retune (3.5 → 3.2). Prior pin: annotated tag **`engine-v2.14`**, commit **`2609b1a`**
  (2026-07-10) — the TKT-147
  `two_label_join` rule kind (Tractable `Producer`+`Model` make+model capture)
  + `FieldKey.VIN` envelope-only field slot (`EVA_EXPORT_FIELD_ORDER` keeps the EVA export
  byte-stable), incl. a **deliberate providers.json seed update** (see History above). Changed vs
  `engine-v2.13`: `domain/models.py`, `rules/engine.py`, `config/migration.py`,
  `exporters/eva_json.py`, `normalization/normalizers.py`, `normalization/__init__.py`, and the
  providers.json seed.
  Prior pin: **`engine-v2.13`** on the same branch, commit **`05494a9`** (2026-07-09; tag pushed as
  lightweight — this file briefly recorded it "commit + tag PENDING" while the re-cut preceded the
  sibling commit; it has since been committed + pushed, restoring a reproducible pin). Changed vs
  `engine-v2.12`: **`rules/email_classifier.py` ONLY** (C2 `pre_instruction` Rule-0e
  disqualifier + C4 labelled-ref `finditer`; no new taxonomy codes, no DDL dependency).
  Prior committed pin: annotated tag **`engine-v2.12`** on the same branch, commit **`ab5f8d2`**
  (2026-07-09) — the TKT-136 fallback-reference money/fragment guards + document-path VRM
  tight-anchor/trigram port (sibling commit `a80246b`) and the TKT-102 Tractable image-delivery
  classifier lane + Tractable layout provider, incl. a **deliberate providers.json seed update** (see
  History above). Changed vs `engine-v2.11`: `rules/engine.py`, `rules/email_classifier.py`,
  `rules/triage_rules.py`, `normalization/normalizers.py`, `resources/triage-rules.json`
  + `.schema.json`, and the providers.json seed. **Branch + `engine-v2.12` tag are PUSHED
  to origin** (`engine-v2.10`/`v2.11` were already on origin). Prior pins:
  **`engine-v2.11`** (commit `4cbf19a`, 2026-07-09, TKT-090 naming fix — no
  `RJS`/`UnknownVRM` defaults — + TKT-089 large-banner decorative heuristic),
  **`engine-v2.10`** (commit `8e7f2f7`, 2026-07-09, PLAN-003 classifier wave — taxonomy
  v3 + VRM/ref guards + CDQ claim form, incl. a deliberate providers.json seed update),
  **`engine-v2.9`** (commit `130e862`, 2026-07-08, signature-aware
  `_delivered_images_only`), **`engine-v2.8`** (commit `b30e382`, 2026-07-08 — the
  `open_case_ref_match` context input + the `_delivered_images_only` filename tier,
  collisionspike TKT-043), **`engine-v2.7`** (commit
  `ccfb473`, 2026-07-07, the acknowledgement/query/case_update batch — collisionspike
  TKT-081/082/083/093, upstreamed from this vendored copy). Earlier pins:
  `engine-v2.6` (commit `f474ea0`, ADR-0021 case-type marker taxonomy + TKT-051
  work-provider guard), `engine-v2.5` (commit
  `af1737f5c1084a96b4c72d3a914d10290a23d2d7`, 2026-07-02, externalized triage
  phrase data — `resources/triage-rules.json` + `.schema.json`,
  `rules/triage_rules.py`; rules-engine-v2 Phase 5), `engine-v2.4` (commit `fbf6ddbea5b14a678de71af0a4fcd4e09fc6f1a6`,
  content-based attachment typing), `engine-v2.3` (commit
  `accddc57580723e8d2387633b8a30672d7d2a4ca`, taxonomy v2 — `case_update` +
  `cancellation`, corrected; supersedes the short-lived `engine-v2.2`, commit
  `6e3cb183a46169f45f4ef2a4507535322c673e7c`, which carried the TKT-038
  regression), `engine-v2.1` (commit `a9f788715eb27e56a63c8b8bda66b2b04bdf9aef`,
  the sibling's first tagged engine release), and the working-branch pins it
  superseded (`4824136`, `af98383`, `e256760`, `504c3a3`).

## Reconciliations: none outstanding

As of `engine-v2.1` (and unchanged through `engine-v2.16`) this copy is a **pure
mirror** — no vendored-only or sibling-only divergence remains. The executable
boundary is enforced by `VENDOR_LOCK.json` and
`scripts/verify_vendor_pin.py`: every shared `.py` module, bundled resource
JSON, and the separately located `providers.json` seed is included in one
deterministic content digest. The `engine-v2.5` re-cut added three new shared
files (`rules/triage_rules.py`, `resources/triage-rules.json`, and
`resources/triage-rules.schema.json`), and the boundary enumerator picked them
up automatically.

A future intentional reconciliation must be represented in the verifier's
reviewed boundary rules and recorded here; it cannot disappear behind a
working-tree-dependent skip.

## Omitted modules (deliberately NOT vendored)

These pull CLI / GUI / desktop-only dependencies off the FC1 worker path and are
excluded from this copy (the engine-core stays lean):

- `cli.py` — the argparse CLI.
- `__main__.py` — `python -m cedocumentmapper_v2` entry point; imports `cli`.
- `ui/host.py` — the desktop/GUI host.
- `extraction/` — the opt-in extraction orchestrator + offline LLM-assist
  (desktop/dev-only). `application/service.build_orchestrator` imports it
  **lazily** (inside the method body), so omitting it does not break
  `import cedocumentmapper_v2`; only the unused orchestrated path would raise if
  ever called on the cloud worker, which the FC1 adapter never does.
- `eval/` — the eval/regression harness (desktop/dev-only).
- `resources/extraction-rule.schema.json`, `resources/provider-config.schema.json`
  — the non-EVA bundled schemas (used by the desktop authoring/migration paths
  only — validated by `cli.py`, never imported by an engine-core module).

`ui/__init__.py` and `ui/paths.py` ARE vendored (the service imports `ui.paths`
for app-data/output path helpers — both `get_documents_dir` and `get_desktop_dir`).

`detection/case_type.py` IS vendored (`detection/__init__.py` imports
`audit_signal_for_reference` / `is_audit_reference` from it).

`resources/__init__.py` + `resources/eva-json.schema.json` ARE vendored: the
sibling's `exporters/eva_json.py` does `from cedocumentmapper_v2 import
resources` and falls back to `resources.load_schema("eva-json.schema.json")`
when no explicit `schema_path` is passed. Vendoring just the EVA schema + the
loader keeps `import cedocumentmapper_v2.exporters` working OFFLINE (the package
eagerly imports `EVAJsonExporter`) with no ImportError at worker import time.

## providers.json pin

`providers.json` in this directory is the **pinned provider catalogue seed**.
The adapter pins the service to it explicitly
(`parser_adapter._VENDORED_PROVIDERS_JSON`). It is byte-identical to the
sibling's root `providers.json` at the cut, but the **vendored copy is
authoritative for the deployed Function** — a re-cut must **not** clobber it
with the sibling's unless the seed has intentionally changed. Treat a
providers.json change as a deliberate, reviewed update. It has its own digest
in `VENDOR_LOCK.json` and is also included in the full vendor-tree digest and
locked-tag comparison.

## Drift guard

`functions/parser/scripts/verify_vendor_pin.py` is the executable guard.
`VENDOR_LOCK.json` records the annotated engine tag, its full peeled commit,
the explicit cloud/desktop boundary, the complete vendored-tree digest, and
the provider-catalogue digest. The guard always verifies that self-contained
lock, so CI does not need access to the private sibling repository and never
silently skips. A second CI job checks out the private sibling with a dedicated
read-only deploy key on pushes and same-repository PRs. With that clone (or a
trusted local clone), the verifier additionally resolves the recorded tag with
Git, verifies that it still peels to the locked commit, enumerates the
source/vendored file sets in both directions, and reads every blob with
`git show <locked-commit>:<path>`. The sibling's checked-out branch therefore
cannot affect the result. The pytest wrapper
`tests/test_engine_vendored_in_sync.py` invokes the same guard.

## Re-vendor procedure (against a COMMITTED sibling ref)

Per ADR-0018, re-cut from a **committed, pushed sibling ref** — never the
sibling's dirty working tree. Now that no reconciliation is outstanding, this
is a **pure mirror**: cut every shared file verbatim, in one pass, with no
hand-patch step. Do **not** mirror the whole sibling tree — `extraction/`,
`eval/`, `cli.py`, `__main__.py`, `ui/host.py`, and the two non-EVA schemas
must stay off the cloud path (see "Omitted modules" above).

Run from the repo root (`collisionspike/`), Git Bash / bash:

```bash
REF=engine-v2.16  # the committed, tagged sibling ref you are cutting from
S=../cedocumentmapper_v2.0   # sibling repo
V=functions/parser/cedocumentmapper_v2

# 1. Re-cut every shared .py module verbatim (PROVENANCE.md is the only
#    tracked file in $V excluded from this mirror):
for f in __init__.py \
         application/__init__.py application/service.py \
         config/__init__.py config/migration.py \
         detection/__init__.py detection/case_type.py detection/detector.py \
         detection/attachment_typing.py \
         domain/__init__.py domain/models.py \
         exporters/__init__.py exporters/base.py exporters/eva_json.py exporters/rjs_docx.py \
         normalization/__init__.py normalization/normalizers.py \
         readers/__init__.py readers/base.py readers/doc.py readers/docx.py \
         readers/email.py readers/errors.py readers/pdf.py \
         rules/__init__.py rules/base.py rules/email_classifier.py rules/engine.py \
         rules/triage_rules.py \
         ui/__init__.py ui/paths.py; do
  ( cd "$S" && git show "$REF:src/cedocumentmapper_v2/$f" ) > "$V/$f"
done

# 2. Re-cut the bundled JSON resources verbatim (closes the prior "only *.py
#    is byte-compared" blind spot -- the drift guard now checks these too).
#    triage-rules.json/.schema.json (rules-engine-v2 Phase 5, engine-v2.5+)
#    are the data + schema rules/triage_rules.py (above) loads:
( cd "$S" && git show "$REF:src/cedocumentmapper_v2/resources/__init__.py" ) > "$V/resources/__init__.py"
( cd "$S" && git show "$REF:src/cedocumentmapper_v2/resources/eva-json.schema.json" ) > "$V/resources/eva-json.schema.json"
( cd "$S" && git show "$REF:src/cedocumentmapper_v2/resources/triage-rules.json" ) > "$V/resources/triage-rules.json"
( cd "$S" && git show "$REF:src/cedocumentmapper_v2/resources/triage-rules.schema.json" ) > "$V/resources/triage-rules.schema.json"

# 3. Do NOT clobber providers.json (the pinned seed -- see above). Note it
#    lives at the SIBLING REPO ROOT, not under src/cedocumentmapper_v2/:
#    ( cd "$S" && git show "$REF:providers.json" ) > "$V/providers.json"
#    -- only run this line for a deliberate, reviewed seed update.

# 4. Regenerate the lock ONLY after the tag/source comparison proves this cut.
python functions/parser/scripts/verify_vendor_pin.py --write --ref "$REF"

# 5. Verify the lock directly, then run the parser suite:
python functions/parser/scripts/verify_vendor_pin.py
( cd functions/parser && python -m pytest -q )
```

The lock writer refuses to update `VENDOR_LOCK.json` unless every included
file is present on both sides and byte-equivalent after cross-platform newline
normalisation. If it refuses, STOP and reconcile before committing — see
"Reconciliations" above for the process if a genuine new divergence is
unavoidable.

