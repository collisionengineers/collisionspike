# Rules Engine v2 — Build Checklist (ROADMAP Phase 8, Azure-era realization)

> **What this is.** The ordered, checkbox build checklist distilled from the
> [Rules Engine v2 plan](../rules_engine_v2_plan_9ba034c4.plan.md) at its Phase-0 kickoff (2026-07-02).
> Per that plan's own header, this is where it "distills into `docs/plans/phase-8-inbox-management/`
> ... plus tickets" once work starts — **this initiative is ROADMAP Phase 8's Azure-era realization**.
> The rest of this folder (`README.md`, `IMPLEMENTATION-PLAN.md`, `intake-restructure-notes.md`,
> `junk-backlog-and-activation-evidence.md`) describes the **prior, decommissioned Power-Platform
> build** of Phase 8; this file describes the live, Azure-stack continuation. See the banner near the
> top of [README.md](./README.md).
>
> **Build complete (2026-07-02).** All six phases below are built and tested; the Data API, orchestration,
> and SPA are deployed live. What remains is the **operator activation path**, in order: **D7** (apply the
> taxonomy-v2 DDL delta) → **the taxonomy-v2 parser deploy** → **D8** (apply the identification seed delta)
> → the per-behaviour `TRIAGE_*` gate flips → **D6 + G5** (the `EMAIL_AI_ENABLED` production flip, once the
> AI sign-off lands). See [docs/gated.md](../../gated.md) for the full detail behind each step, and
> [docs/tickets/BOARD.md](../../tickets/BOARD.md) for the per-ticket disposition this build produced.
>
> **Status (2026-07-02):** plan approved and **built** (see "Build complete" above — this line
> previously read "no phase has started"; the checkboxes below now reflect the built state). Binding
> architecture decision:
> [ADR-0019](../../adr/0019-triage-policy-stage-split.md) (Proposed) — Stage A (text signals, stay in
> the vendored engine), Stage B (a deterministic triage-policy module in `packages/domain`), Stage C (a
> gated LLM/embeddings suggestion writer, never an actor). ADR-0019 extends
> [ADR-0015](../../adr/0015-email-triage-inbox-management.md) (the triage taxonomy decision) and
> [ADR-0018](../../adr/0018-cedocumentmapper-dual-target-vendored-engine.md) (the vendored-engine
> mechanics), and builds on [ADR-0010](../../adr/0010-dedup-reference-disambiguated-no-time-window.md)
> (the dedup ladder) and [ADR-0011](../../adr/0011-work-provider-intermediary-garage-roles.md)
> (provider / intermediary / garage roles). **Never embed live counts or gate values in this file** —
> link the registry [docs/architecture/live-environment.md](../../architecture/live-environment.md) /
> [LIVE_FACTS.json](../../../LIVE_FACTS.json) instead.
>
> **Operator gates.** Five gates were queued at authoring time; the build is now complete, so most are
> **now due** rather than pending a phase start. Each is tagged 🔒 inline below and tracked in full at
> [docs/gated.md](../../gated.md): (1) the sibling PR-4 merge + first engine tag (Phase 0) — **done**,
> see the Phase 0 checkboxes below; (2) the Phase-2 DDL delta apply (live Postgres) — authored and
> ready, now tracked as **§D7** (taxonomy) + **§D8** (identification seeds); (3) the `EMAIL_AI_ENABLED`
> production flip (Phase 4; the G5/residency sign-off + E2) — code built gated-off, **§D6**; (4) the live
> `inbound_email` PII export for the eval corpus (Phase 1; E2) — still outstanding, not required for the
> other gates; (5) the Foundry local-auth (keyless) flip (Phase 4; ownership confirmation) — still
> outstanding, **§D6** item 5. All depend on the standing A0 (`az login`) and A1 (Free-Trial→PAYG) items
> in `gated.md`.

## Deploy order (binding — read before starting Phase 0 or Phase 2)

Taxonomy changes carry a hard sequencing rule (an ADR-0019 consequence: "the engine tag itself is the
compatibility boundary"):

1. **The Phase-0 engine tag emits the v1 taxonomy only** — no new categories ship with it. Its job is
   fixing the vendoring/pin problem (a reproducible, tagged pin per ADR-0018), not the taxonomy.
2. **The Phase-2 additive DDL delta** (`case_update` / `cancellation` / `images_received` +
   `inbound_email.body_jobref` / `conversation_id`) **lands first, live, operator-gated 🔒 — and only
   then** does the **taxonomy-v2 engine tag** (+ choicesets + SPA labels) ship. Shipping the tag before
   the DDL would emit categories the live database cannot yet store.
3. Existing rows keep their v1 codes — **no backfill**. Anything that lists, filters, or aggregates
   `inbound_email` rows across the cutover must state how mixed-vintage (v1 + v2) rows display.

---

## Phase 0 — Consolidate the fork + pipeline hygiene (prereq)

- [x] **Author ADR-0019** (the Stage-A/B boundary + Stage-C suggestion contract) — the plan's Phase-0
  exit criterion. **Done** — [ADR-0019](../../adr/0019-triage-policy-stage-split.md) already exists
  (Status: Proposed, 2026-07-02). Do not re-author it or flip its status; later evidence lands as a
  dated update section, the way ADR-0015 carries its 2026-06-29 / 2026-07-02 updates.
- [x] Capture the sibling **field-extraction eval baseline before merging** (`src/cedocumentmapper_v2/eval/`
  comparator + a committed baseline) — PR 4 changes `/parse` behaviour for sibling-main consumers.
  **Done** — the sibling's `eval/baseline.json` was refreshed (sibling commit `3321655`) before PR 4's
  merge commit (`8445028`).
- [x] 🔒 **Merge sibling PR 4; close PR 5 as superseded** (a strict subset — sequential merge risks an
  add/add conflict on the identical decorative hunk). Neither PR has CI: local `pytest` must be green
  first (including the two known-failing parser tests). Add PR 4's `label_pairs` key to
  `extraction-rule.schema.json`; confirm nothing needed is stranded on `feat/audit-case-type-detection`.
  *(Cross-repo/sibling action — cannot be done from collisionspike; see ADR-0018's "Operator /
  cross-repo prerequisites".)* **Done (2026-07-02)** — PR 4 merged, PR 5 closed.
- [x] 🔒 **Tag the engine release** (the sibling's first tag, e.g. `engine-v2.1`), then re-cut into
  `functions/parser/cedocumentmapper_v2/` per ADR-0018. The re-cut must be a **content no-op for the
  cloud path** (the vendored copy is already ≡ PR 4 + B2) — diff-verify before deploy, re-apply the B2
  reconciliation, update the PROVENANCE pin and close its stale divergence notes, confirm
  `test_engine_vendored_in_sync` green with the sibling checked out. Verify the two PR-4 worker
  side-effects on the deployed Function (tempfile writes; `.doc` LibreOffice-fallback behaviour when
  `soffice` is absent). **This tag emits the v1 taxonomy only** — see Deploy order above. **Done** — the
  sibling progressed through tags `engine-v2.1`→`engine-v2.5` across this build (each later phase's tag
  re-cut byte-mirror verified); B2 upstreamed to the sibling.
- [x] **Contract pass-through:** send `attachment_filenames` from orchestration (`classifyInbound.ts` /
  `functions-client.ts`); surface the engine's existing `body_jobref` through the OpenAPI schema → the
  TS client → `InboundClassification`; **capture** `conversationId` (add it to the Graph `$select` in
  `graph.ts` and carry it in the envelope — the column itself lands with Phase 2's DDL). **Done** —
  `b8c679e`; deployed live and probed.
- [x] Fix OpenAPI drift: the `ClassifyEmailResponse` category enum (add `billing`, `non_actionable`) +
  the three missing subtypes + the `body_jobref` property. **Done** — same commit `b8c679e`.
- [x] Redeploy the parser + orchestration apps; verify with live probes (`/classify-email` plus the
  ticket-email replay set). **Done** — orch + parser redeployed, contract probe green (registry updated).
- [x] Doc hygiene rides along with Phase 0 (tracked separately from the code work above):
  - [x] Registry `foundry` block — done.
  - [x] `packages/domain/src/gates.ts` AI comment — done.
  - [x] `BOARD.md` TKT-015 note refresh — done.
  - [x] Stale-docs sweep of the `ai-assistant` research pack — done in this same distillation pass;
    see [work-todo-spike/ai-assistant/research/ai-assistant.md](../work-todo-spike/ai-assistant/research/ai-assistant.md).
  - [x] `PROVENANCE.md` "vendored is AHEAD" divergence-note correction — done. The **pin itself**
    still updates at the next re-vendor, once the sibling tag above lands.

**Exit criteria:** ADR-0019 authored (already true); sibling PR-4 merged and PR-5 closed; the first
engine tag cut and re-vendored as a diff-verified content no-op; `test_engine_vendored_in_sync` green;
`attachment_filenames` / `body_jobref` / `conversationId` flowing through the contract; OpenAPI enums
fixed; parser + orch redeployed and live-probed; the doc-hygiene sweep landed.

---

## Phase 1 — Real-email eval harness (the accuracy yardstick)

- [x] Assemble the **Tier-3 real corpus** at the established, gitignored PII path
  `test-cases-and-data/e-mail-examinations/`: the 31 real `.eml` under `docs/tickets/**` plus the 12
  real `.msg` under `test-cases-and-data/test-cases/`. **Done** — `scripts/eval-email/manifest.json`.
- [ ] 🔒 Add the **operator-gated export** of live `inbound_email` rows, with staff
  `improvement_signal` overrides as labels (the SPA → `PATCH /api/inbound/{id}/classification` →
  `improvement_signal` loop is already live) — this is the E2-governed live PII export; see
  [docs/gated.md](../../gated.md) §D6 item 4. **Not built** — the write side (the SPA reclassify →
  `improvement_signal` loop) is live, but the export script itself is not; see
  [scripts/eval-email/export-live-labels.md](../../../scripts/eval-email/export-live-labels.md).
- [x] Give every label a **taxonomy-version field** (`v1` now; a re-label pass follows once Phase 2's
  v2 taxonomy lands). **Done** — `manifest.json`'s `expected_v1`/`expected_v2` per item.
- [x] Build the **eval runner** — a net-new classification scorer (the sibling's `eval/` package
  scores field extraction only and stays off the vendored path per ADR-0018): per-category
  precision/recall plus a K×K confusion matrix. **Done** — `scripts/eval-email/run_eval.py`.
- [x] Wire it as an **opt-in, env-gated check in `verify-all.mjs`** (the same pattern as the
  `VERIFY_LIVE` skip). **Done** — the `EVAL_EMAILS` gate.
- [x] **Record the baseline before any Phase-2 rule change** — a hard ordering requirement, not a
  suggestion (see Verification below). **Done** — `baseline-v1.json` (v1, pre-Phase-2) and
  `baseline-v2.json` (post-Phase-2, for regression pinning) are both committed.
- [ ] Build the feedback loop: a script that exports staff reclassifications, appends them to the
  corpus, and re-evaluates each release. **Not built** — same E2 gate as the item above; honestly
  documented as not-built in `export-live-labels.md`.

**Exit criteria:** the labelled Tier-3 corpus exists with taxonomy-version tags; the confusion-matrix
eval runner is wired into `verify-all.mjs` as opt-in; a classification baseline is recorded and
committed **before** Phase 2 changes any rule.

---

## Phase 2 — Taxonomy v2 + context-aware triage policy (the core upgrade)

- [ ] 🔒 **Apply the additive DDL delta first, live** (now tracked at [docs/gated.md](../../gated.md)
  **§D7**, superseding the earlier "§D6 item 2" placeholder):
  `case_update` + `cancellation` categories, an `images_received` subtype (append-only codes, per the
  never-renumber doctrine — see `migration/assets/schema/000_enums_lookups.sql`), plus
  `inbound_email.body_jobref` + `conversation_id` columns. **Existing rows keep v1 codes — no
  backfill**; state how mixed-vintage rows display in SPA filters/metrics. **Authored, not applied** —
  the delta file is committed (`migration/assets/schema/deltas/2026-07-02-rules-engine-v2-taxonomy.sql`);
  🔒 D7 is the operator's live-apply step.
- [ ] Only once the DDL is live, ship the **taxonomy-v2 engine tag** + choicesets + SPA labels — see
  Deploy order above. **Built, not yet deployed live**: the engine tag (`engine-v2.3`, cancellation +
  `case_update` rules) is cut and vendored, and the SPA already carries the `case_update`/cancellation
  tabs and banners — but the parser Function still runs the pre-taxonomy-v2 engine in production
  (deploying it is blocked on D7 above, per the Deploy order rule).
- [x] Build the **ref-gate, suggest-first** policy step (a `packages/domain` triage-policy module per
  ADR-0019 Stage B): any inbound whose refs / job-ref / VRM match an **open** case, generalising the
  existing linked-reply lane (already runs `classifyPersist` + `extractImages` + `boxArchiveEvidence` +
  `statusEvaluate` on a linked case). **Built + deployed gated-OFF** — `packages/domain`'s `decideTriage`
  + the `triagePolicy` Durable activity (orchestration step 1.55) + `POST /api/internal/triage/context` /
  `suggest-link` + the SPA accept/reject affordance.
  - [x] **All matches start suggestion-only for one release**, riding the existing `ai_suggestion`
    accept/reject lifecycle + inbox affordance. **Done** — `decideTriage` only ever returns
    `suggest_attach`/`propose_cancellation` (no auto-attach action exists yet); routing is unchanged
    this release regardless of gate state.
  - [ ] **Exact single open-case ref match** promotes to auto-attach only after corpus results **and**
    live staff confirms. **Not built** — deliberately deferred; today even an exact ref match stays
    suggestion-only, same as a VRM-only match, "for one release" as designed.
  - [x] **VRM-only matches stay suggest forever** (ADR-0010's no-ref rung — never promoted). **Done** —
    coded as an explicit, permanent invariant in `triage-policy.ts` ("VRM-only NEVER promotes past
    suggestion"), not just a release-1 default.
  - [ ] Extend `linkReply` to use `body_jobref` and to run pre-mint on `receiving_work` too (closes the
    TKT-023 leak). **Half done**: `linkReply` now takes and uses a `jobref` parameter (live, ungated,
    for non-`receiving_work` replies — TKT-023/046's Phase-2 evidence base). **Not done:** it still does
    not run pre-mint on `receiving_work`, so a reply that Stage A classifies as `receiving_work` (TKT-023's
    own sample does) still mints a duplicate case — the "closes the TKT-023 leak" claim is not yet true.
  - [x] "Detach" = unlink + flag the Box folder for manual cleanup — Box stays a one-way additive
    mirror ([ADR-0012](../../adr/0012-box-centric-intake-additive-hybrid.md)); no un-archive is
    promised. **Done** — `POST /api/inbound/{id}/detach`.
  - [x] New `inbound_*`/attach audit actions — append-only; the next free code lives in
    `migration/assets/schema/000_enums_lookups.sql`, not in this doc. **Authored, not yet live** —
    `inbound_link_suggested`/`inbound_linked`/`inbound_detached`/`cancellation_proposed` ride the same D7
    delta as the taxonomy rows above.
- [x] Add the **`internetMessageId` dedup rung** plus **Data-API-side serialization** (a Postgres
  advisory lock on ref/VRM around resolve/ref-gate) — closes the cross-mailbox duplicate-delivery mint
  race. **Done** — `triage.action === 'drop_duplicate'` short-circuits the orchestration; `pg_advisory_xact_lock`
  serialization shared across `cases/resolve` + `linkReply` + the new triage-context path.
- [x] Run every policy step as a **Durable activity** with a checkpointed result, persisted decision
  inputs, and a stated idempotency contract. **Done** — the `triagePolicy` activity's own module doc
  states the idempotency contract explicitly (pure context read; idempotent suggestion write;
  fire-and-forget telemetry).
- [x] Build **local Postgres thread correlation** on the captured `conversationId` (nothing
  system-sent exists in SentItems — the chaser send is a stub; staff replies land there out-of-band
  only). If Graph `$filter=conversationId` is ever used instead: `eq`-only, no `$orderby`,
  URL-encode, live smoke-test first — it is not contractually documented. **Built, functionally a no-op
  until D7**: the API's `triage/context` handler already runs the `conversation_id` sibling query, but
  it is schema-tolerant and honestly returns `[]` until the D7 delta adds `inbound_email.conversation_id`.
- [x] Encode the **`case_update` vs `query_existing_work` precedence** as confusion-matrix targets:
  ref-match + new evidence → `case_update`; ref-match + question-only → the query lane; cancellation
  phrases trump both. The currently-correct chaser handling must not regress. **Done** — coded in
  `triage-policy.ts` (`gates.caseUpdate && context.hasAttachments` → `case_update`; a question-only reply
  stays in the query lane) and encoded as eval-corpus expectations.
- [x] Build the **cancellation action**: a matched case → **propose** close/hold with note + audit
  (staff-confirmed, never auto-close — consistent with the automation-mode ladder;
  `choice_case_status` already has the terminal `removed` state). **Done** — the `propose_cancellation`
  action; never auto-closes or auto-holds.
- [ ] Build **images-received routing** (TKT-034/043): matched → suggest-attach + Box; unmatched with
  VRM → a reg-keyed Box dumping folder + flag (ADR-0015 §5). **Half built**: the matched arm rides the
  generic `suggest_attach` action (though TKT-043's own sample still misses in the eval corpus — see its
  ticket). The **unmatched-with-VRM reg-keyed Box dumping-folder lane is an explicit, honest TODO** —
  `intakeOrchestrator.ts`'s own comment: "`route_images_unmatched`: TODO(ADR-0015 §5) … a FOLLOW-UP, not
  built here." Matches TKT-034's board note.
- [x] Extend the **signature filter**: the existing `isInline` skip gets a raster floor for non-inline
  images mirroring PR 5's semantics (pixel **area** floor, unknown-dimensions-kept — Graph supplies
  bytes only, so use a small PNG/JPEG header dimension-sniff with a byte-size fallback) (TKT-047).
  **Done, deployed live** — `orchestration/src/lib/image-sniff.ts`; awaiting live proof on a real
  signature email (see TKT-047).
- [x] Wire **decision telemetry + kill-switches**: every policy decision (would-be action + inputs,
  rule/policy version) logs to App Insights `customEvents` always-on; each behaviour ships behind its
  own default-off app-setting gate (`TRIAGE_REF_GATE_ENABLED`, `TRIAGE_CANCELLATION_ENABLED`, …). No
  shadow rows land in `ai_suggestion` while its gate is off. **Done** — the `triage_decision` customEvent
  fires unconditionally; all four `TRIAGE_*` gates are absent live, so `acting` is always
  `proceed_default` and no shadow row is ever written to `ai_suggestion`.

**Exit criteria:** the DDL delta is live and verified before the v2 engine tag ships; the ref-gate runs
suggest-first with the promotion ladder honoured; the `internetMessageId` dedup rung + advisory-lock
serialization are in place; decision telemetry flows to `customEvents`; every new behaviour is
default-off behind a named gate; zero false new-cases and zero chaser-classification regression on the
Phase-1 baseline corpus (see Verification).

---

## Phase 3 — Identification upgrade (provider / Image-Source intermediary)

- [x] Implement **ADR-0011 as written** — the entity is **Image Source**, not a new "intermediary"
  table (CONTEXT.md canon): `image_source` rows with `kind=intermediary` + `email_domain` match keys
  (the table is already live + seeded; `migration/assets/schema/030_image_source.sql`). **Done** —
  `matchSenderIdentity` (`packages/domain/src/domain/sender-identity-match.ts`) resolves address-level
  provider > intermediary > domain-level provider, deployed live.
- [ ] Add the new **N:N `image_source ↔ work_provider`** join (e.g. `connexus.co.uk` → {PCH, SBL}) and
  de-collide `knownEmailDomains`; add `@pch-ltd.com` etc. from the real ticket senders (TKT-021/051).
  **Authored, not applied** — 🔒 [docs/gated.md](../../gated.md) **§D8**
  (`migration/assets/schema/deltas/2026-07-02-rules-engine-v2-identification.sql`).
- [x] Wire **document-content provider resolution into identity** (ADR-0011's second decision — doc
  content is the *primary* signal): map the parser's detected `work_provider` string to a
  `work_provider_id` at `caseResolve` (the string already forwards fill-if-empty with provenance; the
  id mapping plus mint/Held influence is the new part). **Verify TKT-028's headline example against
  the eval corpus first** — it may already be fixed live. **Done + verified-first**: TKT-028's QDOS
  example already worked via domain match (no bug); TKT-051's doc extracts "PCH" at confidence 1.0 —
  that string→id gap was real and is now closed, live on `cespk-api-dev`.
- [x] Build **content-based attachment typing**: run the provider `detect_phrases` / `engineer_report`
  markers over extracted text to type `instruction` vs `report` vs `junk` by content, not extension
  (hardens Rule 1's corroboration gate). Net-new — today's report detection is filename-regex only.
  **Built in-repo (engine-v2.4, `/parse` returns `content_typing`), not yet deployed live** — rides the
  same D7-gated parser deploy as the taxonomy-v2 engine tag (Phase 2).

**Exit criteria:** the intermediary N:N join is live and seeded with the new domains; `caseResolve`
maps the parser's provider string to a `work_provider_id`; content-based attachment typing replaces
the filename-regex-only report detection; TKT-021/028/051 are confirmed fixed via the corpus.

No operator gate is named for this phase in `gated.md` §D6.

---

## Phase 4 — Gated AI assist (Stage C; build gated-off, operator flips)

- [x] **Replace the dormant stub's body** in `orchestration/src/functions/gated/triage-classify.ts`
  (today it just re-calls the deterministic `/classify-email` route) with an AOAI
  **structured-output** call constrained to the taxonomy, wired **post-classify for
  abstain/`uncorroborated_*` rows only**. Write `suggested_*` plus a row in the existing
  `ai_suggestion` lifecycle (accept/reject/supersede + audit actions), `classifier_mode='llm'`;
  **never auto-mints**. **Done** (`b62b0df`) — deployed, gated OFF.
- [x] Wire the **two gates by name**: `EMAIL_AI_ENABLED` (the orch LLM call) and `AI_ASSIST_ENABLED`
  (the API suggestion surface) — both default-off. **Done** — both absent from live app settings.
- [x] **Identity/keyless:** grant the orch app's managed identity **Cognitive Services OpenAI User** on
  the Foundry account; call with Entra tokens (no key app-setting). **Done, applied + verified
  2026-07-02** — role assignment `d695d697-…` on `digital-3339-resource`.
- [ ] 🔒 Then **disable local auth** on the Foundry account — operator-confirmed (the account is
  operator-created and may have uses outside this repo); see [docs/gated.md](../../gated.md) §D6
  item 5.
- [ ] **PII + policy posture:** scrub subject/body through the existing
  `packages/domain/src/domain/pii-scrub.ts` helper pre-call (counts-only telemetry); honour
  `work_provider.ai_allowed` + the global kill switch; treat `content_filter` 400s as **abstain**
  (accident/injury narratives can trip the default RAI policy); pin the model version (or stamp
  model+version into `ai_suggestion.model_version` and re-baseline the eval on change). **Mostly
  done, one honest gap:** PII scrub (`scrubPii`), `content_filter`→abstain, and `model_version`
  stamping are all live in `triage-classify.ts`/`aoai.ts`. **`work_provider.ai_allowed` is NOT
  implemented anywhere in the codebase** — only the top-level `EMAIL_AI_ENABLED` kill switch gates the
  call today; a per-provider AI opt-out does not yet exist. Left unticked for that reason.
- [x] Record the **data-residency fact** the flip depends on: the chat model is Global-deployment-only
  in this region (no UK data zone exists) — inference may process outside the UK while data-at-rest
  stays regional. **Done** — recorded in [docs/gated.md](../../gated.md) §D6 item 3.
- [ ] 🔒 **`EMAIL_AI_ENABLED` production flip** — gated on the **G5 per-AI-gate sign-off** (testing on
  repo data is already pre-authorised); see [docs/gated.md](../../gated.md) §D6 item 3.
- [x] Use **structured outputs on the GA v1 surface** (`json_schema`, `strict:true`); honour the
  reasoning-model constraints (no `temperature`/`top_p`/penalties/`max_tokens` →
  `max_completion_tokens`, `reasoning_effort` minimal/low, low verbosity; strict schema subset).
  **Done** — per `b62b0df`'s own commit message.
- [x] Run the **A/B `gpt-5-mini` vs `gpt-5`** comparison on the corpus before any enable — quota/cost
  detail lives in the registry; at current volume the gate is **residency, not spend**. **Partially
  run**: `scripts/eval-email/run_ab.py` live-smoked 3 items against `gpt-5` (0 abstains, all
  strict-JSON-valid); `gpt-5-mini` is not deployed on `digital-3339-resource` (an honest 404, not a code
  gap) so no true side-by-side ran. A fuller run (more items, both deployments) is still open.
- [ ] Add the **embedding prior**: nearest-neighbours against the labelled corpus as a cheap re-rank
  signal, stored in `ai_suggestion`. Start with plain `float8[]`/`jsonb` columns + app-side cosine
  (tiny corpus); `pgvector` (allowlisted but not enabled) is the documented scale path. **DDL only** —
  `migration/assets/schema/deltas/2026-07-02-rules-engine-v2-embedding.sql` adds
  `ai_suggestion.embedding double precision[]` (authored, not yet applied live; rides the D7 apply
  session per that delta's own note). No nearest-neighbour/cosine logic is built yet — the plan's own
  precondition (the D6 item 4 live PII export) hasn't landed either.
- [x] Run the **eval A/B**: deterministic vs +LLM on the real corpus before any live enable. **Partial**
  — the 3-item `run_ab.py` smoke run above is a real deterministic-vs-LLM comparison, but only over 3 of
  the corpus's items, not the full set.

**Exit criteria:** the stub is replaced but ships gated-off; the managed identity holds the Foundry
role and calls are keyless (pending the operator's local-auth flip); PII scrub, content-filter-as-
abstain, and model-version pinning are in place; the A/B eval (deterministic vs +LLM, gpt-5 vs
gpt-5-mini) is recorded; `EMAIL_AI_ENABLED` production stays off until the G5 sign-off lands.

---

## Phase 5 — Declarative ruleset + operability

- [x] **Externalise the phrase data only** (not the whole ruleset) into a schema-validated
  `triage-rules.json` in the engine (pattern: `provider-config.schema.json`) — the regexes, rule
  ordering, confidence bands, and suppression logic stay in Python. Build the loader + tests on
  **both** sides of the vendor boundary. **Done (engine-v2.5)** — 238 phrases across 13 collections
  moved into `resources/triage-rules.json` + `triage-rules.schema.json`, loaded via `rules/triage_rules.py`;
  a zero-behaviour-change data move (existing suites stay green). Vendored copy carries the same
  files/loader. **Built in-repo, not yet deployed live** — rides the D7-gated parser deploy.
  - [x] Runtime JSON validation on the cloud path (schema validation is desktop/test-only today).
    **Done** — `triage_rules.py` runs `jsonschema.validate` on every load (`importlib.resources`,
    module-level cached) — no longer desktop/test-only.
  - [x] The **desktop GUI/PyInstaller build must bundle + load the same JSON**
    ([ADR-0018](../../adr/0018-cedocumentmapper-dual-target-vendored-engine.md) dual-target — touch
    `build.ps1`). **Done** — `build.ps1` updated in the same sibling commit (`af1737f`).
- [x] **SPA — under binding constraints, not a free hand:**
  - [x] A handler-language **"Why this label?"** affordance: plain-English reasons in the
    tooltip/peek — the words "signals" / "rule-id" / "classifier" / "gated" **never render**. Two
    binding constraints govern this affordance:
    - AGENTS.md's **[HARD RULE — no engineering language in the app UI](../../../AGENTS.md)** — a
      platform-agnostic rule banning implementation/process/meta-spec language from any user-facing
      string (label, tooltip, empty state, badge, …).
    - [Review 010726](../../reviews/010726/decisions.md) decisions **D14** (quick-peek drawer, the
      surface this affordance most likely lives on), **D15** (every empty state carries one action),
      and **D16** (the inbox classification cell: max two lines, tag + confidence caption, folder line
      demoted to a tooltip) — the "why" affordance must fit inside D16's existing cell shape, not add
      a new one. **Done, deployed live 2026-07-02** — banned-word fixes included.
  - [x] The **source-mailbox chip + filter** (TKT-025). **Done, deployed live 2026-07-02** — see
    [TKT-025](../../tickets/done/TKT-025-inbox-source-filter/TKT-025-inbox-source-filter.md).
  - [ ] Finish the **actionable-inbox verification** (TKT-005). **Not finished** — an operator
    click-through runbook was written this pass
    ([verification.md](../../tickets/done/TKT-005-email-actions/verification.md)), but TKT-005 itself stays
    `now` pending that live confirmation.
  - [x] **Never delete `inbound_email` rows** (audit-of-record); keep active-vs-handled semantics;
    hardened writes. **Honoured** — no `DELETE FROM inbound_email` exists anywhere in the API; dismiss/
    handle is a state column (TKT-005), never a row deletion.
- [ ] **Rule promotion:** candidate rulesets prove themselves on the eval corpus + the always-on
  decision telemetry before promotion — no separate shadow phase at current volume. **No promotion
  decision has been made yet** (everything above ships gated-off) — but the discipline was followed
  throughout this build: every phase's "Done" note above cites either the eval-corpus baseline or the
  always-on `triage_decision`/`customEvents` telemetry as its evidence, not an unverified claim.

**Exit criteria:** `triage-rules.json` is schema-validated and loaded on both sides of the vendor
boundary (cloud + desktop `build.ps1`); the SPA "why this label?" affordance ships within D14/D15/D16
and the no-engineering-language hard rule; TKT-025 and TKT-005 are closed; rule promotion has a
documented, corpus-plus-telemetry gate.

No operator gate is named for this phase in `gated.md` §D6.

---

## Ticket coverage (from the plan — not exhaustive project scope)

- **Phase 2:** TKT-023, TKT-034, TKT-041 (cancellation), TKT-043, TKT-046, TKT-047 — plus the
  misclassification cluster TKT-029/030/031/033/036/037/038/039/040, locked green via the eval corpus
  (verified-by-eval today, fragile until Phase 2's thread-scope/context fix lands).
- **Phase 3:** TKT-021, TKT-028 (verify-first against the corpus), TKT-051.
- **Phase 4:** TKT-015 groundwork (TKT-018, an image VLM, stays out of scope for this plan).
- **Adjacent, not owned by this plan:** TKT-024 (image-only new-case form), TKT-026 (queue counts),
  TKT-027 (`ingested`-status interaction), TKT-052 (merge provider-loss).
- **Blocked/operator:** TKT-032 (routing decision), TKT-035 (needs a sample) — taxonomy slots exist
  for both.

## Verification (per the plan)

- The sibling **field-extraction baseline before the Phase-0 merge**; the Phase-1 **classification
  baseline before any rule change**; per-phase re-runs targeting zero false new-cases on the 31 ticket
  emails, a cancellation recall floor, and no chaser-classification regression.
- The Phase-0 re-cut diff-verified as a content no-op; `test_engine_vendored_in_sync` green with the
  sibling checked out; live probes after each deploy (`/classify-email` plus one controlled
  end-to-end email per changed lane); `pytest`/`vitest`/`verify-all.mjs` + `check-doc-links` +
  `check-tickets` all green.
- Phase 4: an A/B (deterministic vs +LLM; gpt-5 vs gpt-5-mini) on the corpus before any
  `EMAIL_AI_ENABLED` flip. **BOARD truth standard throughout: live-proven before `done`.**

## Source

Distilled from the [Rules Engine v2 plan](../rules_engine_v2_plan_9ba034c4.plan.md) — read that file
for the full evidence base, the Stage A/B/C architecture diagram, and the live-probe findings behind
each phase. Do not grow scope back into this file beyond what the plan states; amend the plan first,
then re-distil this checklist.
