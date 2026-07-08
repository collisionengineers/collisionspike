# Registration-recognition benchmark + recommendation (TKT-017)

> **Scope.** This is the reg-OCR **research/bench** deliverable for
> [TKT-017](../TKT-017-ai-reg-ocr.md): a comparison of the candidate registration-recognition
> approaches on **accuracy / cost / latency** (+ data-residency), and a recommendation for the
> image-analysis sequence ([TKT-016](../../../now/TKT-016-ai-image-analysis/TKT-016-ai-image-analysis.md))
> and the document-parser registration field ([TKT-001]). It builds **no pipeline** (that is TKT-016).
> It is a **flip precondition** for PLAN-001 Phase 4 — the result is itself a gate on whether a vision
> model-egress flip is justified (see [PLAN-001](../../../plans/PLAN-001-ai-mcp-hardening.md) §Phase 4).
>
> Live facts are checked against the registry
> ([live-environment.md](../../../../architecture/live-environment.md) / `LIVE_FACTS.json`), not the
> research pack. PII: no verbatim registration appears here (aggregate + shape only), per
> `scripts/eval-email/README.md`.

## Recommendation (TL;DR)

1. **Reg-OCR engine of record = the incumbent local `fast-alpr` ALPR (primary), Azure Document
   Intelligence Read (`prebuilt-read`) as the managed fallback.** Both are **UK-resident, zero-egress**
   (fast-alpr runs in-container; DI Read `cespkdocintel-dev` is uksouth). `fast-alpr` *localises* the
   plate, which is what avoids the whole-photo-OCR false positive this bench demonstrates (finding **F1**
   below). This path is **already live** (`/api/plate-ocr`, `PLATE_OCR_ENABLED=true`) and needs **no new
   model egress and no DPIA**.
2. **Do NOT make the GlobalStandard gpt-5 VLM the reg-OCR engine.** Sending vehicle photos to a
   GlobalStandard (non-UK-pinned) model to *read a plate* is both over-powered and the exact egress
   PLAN-001 Phase 4 DPIA-gates. The honest verdict for TKT-017's gate question: **a vision model-egress
   flip is NOT justified for reg-OCR alone** — reg reading is solved UK-resident by fast-alpr(+DI Read).
3. **Keep the VLM for what only it does well** — the *richer* observations TKT-016 needs (vehicle-present,
   same-vehicle, image role, person-reflection, "visible-but-unreadable", background signage → location).
   That is a **separate DPIA line-item TKT-016 owns**, not this ticket's. The VLM cross-checks the reg
   read; it is not the reg reader of record.
4. **A detected VRM is always a suggestion, never case identity.** Per **ADR-0013** and the already-shipped
   `caseRegistrationVisible` guard, a read must never mutate `case_.vrm`; it lands as an `ai_suggestion`
   (TKT-015) or corroborates `evidence.registration_visible`. This invariant is upheld by all three
   candidates as wired.

---

## 1. What "registration recognition" means here

Three **separable axes** (the bench must not conflate them):

| Axis | Question | Right tool profile |
|---|---|---|
| **A. OCR on a clean plate crop** | given a cropped plate, read the characters | any OCR (Tesseract/DI Read/ALPR-OCR) does well |
| **B. End-to-end on a full vehicle photo** | *find* the plate in a cluttered scene, then read it | needs plate **localisation** (ALPR detector) or a VLM |
| **C. Visibility detection** | is a plate present but unreadable vs simply absent? | needs a model that separates "present" from "read" |

Three downstream destinations (unchanged by this ticket):

- **`case_.vrm`** — the case identity (`migration/assets/schema/050_case.sql`). **Never auto-written** from
  a photo read (ADR-0013).
- **`evidence.registration_visible`** — a **tri-state** final flag (`060_evidence.sql`); the EVA image rule
  needs ≥1 accepted `overview` with the *case* registration visible (`packages/domain/src/contracts/image-rules.ts`).
- **The AI suggestion layer** (TKT-015) — a detected/normalised VRM + confidence lands as an accept/reject
  suggestion.

The eight metrics the pack calls for (exact normalised-VRM match; partial/ambiguous reads; false-positive
plate text with no plate; "visible-but-unreadable"; "no registration visible"; confidence calibration;
latency; cost/image) map onto axes A–C and are the columns of §5–6.

## 2. The finding that reframes the ticket: **two reg-read paths are already live**

This is not a green-field "pick a model to build." The registry shows **two** registration reads already
running on the live stack:

- **`fast-alpr` plate route** — `POST /api/plate-ocr` on the retained OCR Function `cespkocr-fn-dev-glju3v`
  (Functions-on-Azure-Container-Apps, scale-to-zero). Gate `PLATE_OCR_ENABLED=true` on `cespk-orch-dev`.
  Engine: YOLO-v9-t detector + CCT-xs-v2 global OCR (ONNX/CPU, MIT). A `PLATE_PROVIDER=docintel` fallback
  switch is wired. (Route + gate: registry `gates` + `resourceInventory`; the OCR host URL was corrected in
  **TKT-115**.)
- **gpt-5 vision classifier** — `orchestration/src/lib/image-classify.ts` (**TKT-064**), gate
  `IMAGE_ROLE_CLASSIFY_ENABLED=true`, keyless MI on Foundry `digital-3339-resource`. At intake it already
  writes `image_role_code` **and** `registration_visible` (+ `plate_text`, `person_reflection`).

So the real question is *which of these is the reg-OCR engine of record, with what fallback, and does the
VLM's egress earn its place* — exactly the flip-precondition framing of PLAN-001 Phase 4.

> **Registry correction.** The research pack (`research/reg-ocr.md`) says `digital-3339-resource` had **zero
> model deployments**. That is **stale**: `LIVE_FACTS.json` `foundry` block shows **gpt-5** deployed there
> (GlobalStandard) since 2026-07-01, plus `text-embedding-3-large`. Exact deployment/quota live in the
> registry — not re-transcribed here per MAINTENANCE.md.

## 3. Candidates (verified live state)

| Candidate | Role | Live state | Residency | Localises plate? |
|---|---|---|---|---|
| **`fast-alpr`** (incumbent) | reg-OCR primary | LIVE (`/api/plate-ocr`, gate on) | in-container (UK), **zero egress** | **Yes** (YOLO detector) |
| **Azure DI Read** (`prebuilt-read`, `cespkdocintel-dev` F0) | reg-OCR fallback + scanned-PDF OCR | resource live; wired as `PLATE_PROVIDER=docintel` | **uksouth**, zero egress | No (whole-image OCR + VRM substring) |
| **gpt-5 vision** (`digital-3339-resource`, GlobalStandard) | image-analysis producer (role/visibility/reflection/location); reg cross-check | LIVE for classify (TKT-064) | **GlobalStandard — may infer in ANY region**; image bytes bypass `scrubPii` | Implicit (scene understanding) |
| **Specialist UK ALPR** — Plate Recognizer (SaaS) / `fast-plate-ocr` UK fine-tune | only if fast-alpr underperforms on UK 2021+/private plates | not deployed | SaaS = egress (Plate Recognizer) / local (fine-tune) | Yes |

The **shared post-processing decision layer** (`ocr/plate_adapter.py`: `normalise_vrm`, `_looks_like_plate`,
`_build_result`) is engine-agnostic — every candidate above feeds it, so its behaviour is measured once for
all (§4).

## 4. The small real run (TIER A — the shared decision layer)

**What ran (real, in-repo, no ML/live deps):** the harness
([`harness/plate_bench.py`](./harness/plate_bench.py)) scores the **actual shipped**
`ocr/plate_adapter.py::_build_result` over 10 labelled candidate scenarios covering axes A–C.
Full output: [`harness/results/decision-layer-run.txt`](./harness/results/decision-layer-run.txt) (+ `.json`).

**Result: 10/10 scenarios match the layer's documented contract** (mean ~17 µs/call — the decision layer is
negligible cost/latency next to any OCR). The value is the **three findings** it surfaces — these shape the
engine choice and are the same for every engine downstream:

- **F1 — scene-text false positive (axis B).** The road-sign token `MAX 30` normalises to `MAX30`, which
  **passes** the lenient plate-shape gate (`_looks_like_plate`: 5–8 alnum, ≥2 letters, ≥1 digit) →
  `registration_visible = true` on a photo with **no real plate**. This is the concrete demonstration of why
  **whole-photo OCR needs plate localisation**: DI-Read-over-the-whole-photo (and any engine that emits
  scene text as candidates) will false-positive here; `fast-alpr`'s detector avoids it by only reading the
  plate region. (In production the `case_vrm` match constraint mitigates it when the case VRM is known — but
  the no-VRM / new-images path is exposed.)
- **F2 — split-line recall gap (axis A/B).** A plate split across two OCR lines is **missed** unless the
  pairwise-join candidate fires; the raw tokens (`AB12`, `CDE`) are each below the plate-shape floor. DI
  Read's line-splitting makes this a real recall dependency for the `docintel` path.
- **F3 — no "visible-but-unreadable" tri-state (axis C).** A garbled read of a *present* plate reports the
  **same** `registration_visible = false` as an *absent* plate. The boolean layer cannot express the pack's
  visibility tri-state. A VLM that returns `registration_visible` **and** `plate_text` separately
  (image-classify.ts does) can distinguish "I see a plate but can't read it" — a point in the VLM's favour
  **for visibility**, not for reading.

**What TIER A does NOT prove:** raw OCR accuracy on real plate *images*. That is the engine-specific TIER B
run, which needs a labelled photo corpus + an installed engine (see §7). TIER A validates the layer every
engine shares and produces the F1–F3 findings that a raw-image run would otherwise take a large corpus to
surface.

## 5. Accuracy

| Candidate | Axis A (clean crop) | Axis B (full photo) | Axis C (visibility) | Evidence basis |
|---|---|---|---|---|
| `fast-alpr` | high (CCT global OCR on standard Latin) | **high — localises then reads** (avoids F1) | boolean only (F3) | published ALPR benchmarks (ocr-strategy §4, Scientific Reports 2025); **UK 2021+/private plates unverified in-repo** (ocr-strategy §10.2) |
| DI Read (whole photo) | high | **lower — no localisation → F1 false-positive risk + F2 recall dependency** | boolean only (F3) | Microsoft's highest-accuracy doc OCR; the F1/F2 risk is demonstrated by TIER A |
| gpt-5 vision | high | high (scene understanding) | **best — separates present/read (F3)**; also role + reflection | **observed at scale**: the 2026-07-06 backfill classified ~97% of the real evidence set for role + `registration_visible` (validated against a ground-truth subset; ~3% retryable errors) — LIVE_FACTS `verifiedBy` log |
| Specialist UK ALPR | highest on UK | highest on UK | boolean | vendor claims; only worth it if fast-alpr's TIER B UK numbers disappoint |

**Honest gap:** no candidate has an *in-repo* axis-A/B accuracy number on real UK CE plates yet — that is the
TIER B measurement (§7). The strongest real signal today is operational: the VLM path demonstrably runs on
real CE photos at scale (backfill), and the fast-alpr route is live but its UK-plate read-rate is
un-benchmarked (ocr-strategy §10.2 flags exactly this as the calibration item).

## 6. Cost & latency (+ residency)

| Candidate | Latency (per image) | Cost (per image) | Residency / egress |
|---|---|---|---|
| `fast-alpr` (ACA) | ~1–3 s warm CPU; **cold-start tens of s** at scale-to-zero (ocr-strategy §10.5) | **≈ £0** compute under the ACA free grant; **no per-call fee** | in-container UK; **no egress** |
| DI Read | ~1–3 s (analyze + poll) | **$1.50 / 1k pages**; **F0 free 500/mo** likely covers spike volume | **uksouth**; no egress |
| gpt-5 vision | **slower** — a *reasoning*-model vision call (`reasoning_effort`, multi-token) | **~$0.004–0.005 / image observed** (2026-07-06 backfill: order-of-magnitude from the `verifiedBy` spend log) — ~1–2 orders of magnitude above a detector inference | **GlobalStandard — inference may leave uksouth**; image bytes bypass `scrubPii` |
| Specialist SaaS ALPR | ~fast | per-call SaaS fee | **egress to vendor** |

At spike volume **cost is not the deciding axis** (all options are pocket change — ocr-strategy §6). The
deciding axes are **residency + localisation accuracy + ops**: fast-alpr and DI Read are UK-resident and
zero-egress; only the VLM carries the GlobalStandard egress that Phase 4 gates.

Exact live gpt-5 quota/rate-limits and DI Read tier live in the registry (`foundry` / `resourceInventory`) —
not re-embedded here (MAINTENANCE.md).

## 7. Sample availability (stated plainly)

- **No committed labelled plate/vehicle *overview* corpus exists** in-repo or in the `cedocumentmapper_v2.0`
  sibling (sibling images are logos/hero only).
- The only real CE vehicle photos in-repo are the **4 TKT-040 damage close-ups**
  (`docs/tickets/done/TKT-040-.../evidence/CLVDamage*.jpg`). One (`CLVDamage5-V1.jpg`) shows a current-style
  UK plate **partially cropped at the frame edge** — a genuine axis-B / "visible-but-hard" case, seeded into
  [`harness/bench-manifest.json`](./harness/bench-manifest.json). They are damage close-ups, **not** the
  whole-vehicle overview the EVA rule needs.
- A representative **TIER B** run needs ~30–50 labelled real *overview* photos (clean / partial / angled /
  low-light / 2021+ green-flash / private / no-plate / person-reflection / other-vehicle-in-frame). Those
  live in the evidence store (`cespkevidstdev01` + Box) and are **customer PII** — they must be pulled +
  labelled under the **G5** allowance with **ground-truth VRMs in a gitignored overlay** (never committed).
  The **labelling schema** for exactly this is defined in the manifest; the harness is ready to run it.

This is the one piece a desk/research session cannot fabricate. Per the ticket brief, a methodology +
small-N real run (TIER A) + a clear recommendation satisfies the acceptance; the large-N raw-image table is
explicitly TIER B, handed to whoever can run it against the labelled corpus.

## 8. Recommendation (full)

**Reg-OCR (the TKT-017 question):**

- **Primary: `fast-alpr`** (already live). It is the right tool for axis B (localise-then-read avoids F1), is
  UK-resident/zero-egress (no DPIA), MIT, and near-£0. **Precondition before trusting it as of-record:** run
  **TIER B** on a labelled UK overview corpus to close the ocr-strategy §10.2 unknown (2021+/private plates).
  If the UK read-rate disappoints → flip `PLATE_PROVIDER=docintel` (already wired) or fine-tune
  `fast-plate-ocr` on a UK set before reaching for a SaaS vendor.
- **Fallback: DI Read** (`cespkdocintel-dev`, uksouth). Managed, zero-egress, adequate for the "OCR text
  contains the VRM" check — but weaker on axis B (F1/F2). Keep it one app-setting away, not the default.
- **Harden the shared layer:** tighten `_looks_like_plate` toward the UK plate grammar (F1) and confirm the
  pairwise-join is on for the `docintel` path (F2). Small, engine-independent wins for any choice.

**Vision-egress flip verdict (the gate this ticket owns):** **NOT justified for reg-OCR.** Reg reading is
solved UK-resident and locally; the VLM's GlobalStandard egress buys nothing for "read the plate" that
fast-alpr(+DI Read) doesn't already give UK-resident and cheaper.

**Where the VLM belongs (hand-off to TKT-016):** keep gpt-5 vision for the observations only it does well —
axis C visibility tri-state (F3), image role, same-vehicle, person-reflection, and the background-signage →
location stages (TKT-016 steps 5–8). Those are what carry the image bytes off-region, so **the DPIA +
`docs/gated.md` image-egress residency line-item is TKT-016's**, scoped to *scene understanding*, not to reg
reading. The VLM's reg read is a **corroborator** of fast-alpr's, surfaced as a suggestion.

**Observation record (for TKT-016 / TKT-015).** Adopt the pack's per-image observation shape so results are
comparable and reviewable: `{ detected_vrm, normalised_vrm, confidence, visibility ∈ {visible_readable,
visible_unreadable, not_visible}, model, model_version, matches_case_vrm, review_outcome }`. This gives the
tri-state F3 needs and keeps the ADR-0013 "detected VRM ≠ case identity" boundary explicit (compare to
`case_.vrm`; never write it; promote only a reviewed outcome into `evidence.registration_visible`).

## 9. What TKT-016 needs from this recommendation (hand-off)

1. **Reg read = fast-alpr (primary) / DI Read (fallback); the VLM cross-checks, it is not the reader.** Don't
   route reg-OCR through the GlobalStandard model.
2. **Only the scene-understanding stages (5–8: signage/location/same-vehicle/reflection) justify image
   egress** → that is the DPIA/residency line-item to raise in `docs/gated.md`, scoped narrowly.
3. **Use the observation-record schema** (§8) so reg reads are suggestions with a visibility tri-state, never
   auto-applied, never writing `case_.vrm` (ADR-0013).
4. **The F1/F2/F3 findings are pre-baked** — F1 (localisation matters), F2 (join dependency), F3 (tri-state
   need) are already characterised; TKT-016 can consume them without re-deriving.
5. **The TIER B harness is ready** — point [`harness/plate_bench.py`](./harness/plate_bench.py) at a labelled
   overview corpus to get the real per-engine axis-A/B accuracy the flip-precondition ultimately wants.

## 10. Open items / candidate follow-ups (not acted on)

- **TIER B real run** on a labelled UK overview corpus (G5, gitignored ground-truth) — the one thing this
  research session can't produce; needed to close the fast-alpr UK-plate accuracy unknown. *(Owner: operator
  / azure-integration-engineer; the harness + schema are ready.)*
- **`_looks_like_plate` hardening** toward UK plate grammar to cut the F1 scene-text false positive — a small
  parser-area change in `ocr/plate_adapter.py` (sibling-first if it touches engine logic; here it is
  OCR-host-local). Candidate ticket.
- **Confidence calibration** (a pack metric) is unmeasured — fast-alpr emits detector confidence; DI Read
  emits none per-token (candidates carry `None`); gpt-5 emits a self-reported 0–1. A calibration study needs
  the TIER B corpus.
- **Image-writer reconciliation (TKT-088/112)** already gates Phase 4: two writers set `registration_visible`
  (fast-alpr route vs the live gpt-5 classifier). This benchmark's recommendation — VLM for
  visibility/role, fast-alpr for the reg read — is an input to that operator decision, not a substitute for it.
