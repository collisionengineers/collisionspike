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
> **Status (2026-07-02):** plan approved; **no phase has started**. Binding architecture decision:
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
> **Operator gates.** Five gates are queued — none due until its phase starts. Each is tagged 🔒 inline
> below and tracked in full at [docs/gated.md](../../gated.md) §D6: (1) the sibling PR-4 merge + first
> engine tag (Phase 0), (2) the Phase-2 DDL delta apply (live Postgres), (3) the `EMAIL_AI_ENABLED`
> production flip (Phase 4; the G5/residency sign-off + E2), (4) the live `inbound_email` PII export
> for the eval corpus (Phase 1; E2), (5) the Foundry local-auth (keyless) flip (Phase 4; ownership
> confirmation). All five also depend on the standing A0 (`az login`) and A1 (Free-Trial→PAYG) items in
> `gated.md`.

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
- [ ] Capture the sibling **field-extraction eval baseline before merging** (`src/cedocumentmapper_v2/eval/`
  comparator + a committed baseline) — PR 4 changes `/parse` behaviour for sibling-main consumers.
- [ ] 🔒 **Merge sibling PR 4; close PR 5 as superseded** (a strict subset — sequential merge risks an
  add/add conflict on the identical decorative hunk). Neither PR has CI: local `pytest` must be green
  first (including the two known-failing parser tests). Add PR 4's `label_pairs` key to
  `extraction-rule.schema.json`; confirm nothing needed is stranded on `feat/audit-case-type-detection`.
  *(Cross-repo/sibling action — cannot be done from collisionspike; see ADR-0018's "Operator /
  cross-repo prerequisites".)*
- [ ] 🔒 **Tag the engine release** (the sibling's first tag, e.g. `engine-v2.1`), then re-cut into
  `functions/parser/cedocumentmapper_v2/` per ADR-0018. The re-cut must be a **content no-op for the
  cloud path** (the vendored copy is already ≡ PR 4 + B2) — diff-verify before deploy, re-apply the B2
  reconciliation, update the PROVENANCE pin and close its stale divergence notes, confirm
  `test_engine_vendored_in_sync` green with the sibling checked out. Verify the two PR-4 worker
  side-effects on the deployed Function (tempfile writes; `.doc` LibreOffice-fallback behaviour when
  `soffice` is absent). **This tag emits the v1 taxonomy only** — see Deploy order above.
- [ ] **Contract pass-through:** send `attachment_filenames` from orchestration (`classifyInbound.ts` /
  `functions-client.ts`); surface the engine's existing `body_jobref` through the OpenAPI schema → the
  TS client → `InboundClassification`; **capture** `conversationId` (add it to the Graph `$select` in
  `graph.ts` and carry it in the envelope — the column itself lands with Phase 2's DDL).
- [ ] Fix OpenAPI drift: the `ClassifyEmailResponse` category enum (add `billing`, `non_actionable`) +
  the three missing subtypes + the `body_jobref` property.
- [ ] Redeploy the parser + orchestration apps; verify with live probes (`/classify-email` plus the
  ticket-email replay set).
- [ ] Doc hygiene rides along with Phase 0 (tracked separately from the code work above):
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

- [ ] Assemble the **Tier-3 real corpus** at the established, gitignored PII path
  `test-cases-and-data/e-mail-examinations/`: the 31 real `.eml` under `docs/tickets/**` plus the 12
  real `.msg` under `test-cases-and-data/test-cases/`.
- [ ] 🔒 Add the **operator-gated export** of live `inbound_email` rows, with staff
  `improvement_signal` overrides as labels (the SPA → `PATCH /api/inbound/{id}/classification` →
  `improvement_signal` loop is already live) — this is the E2-governed live PII export; see
  [docs/gated.md](../../gated.md) §D6 item 4.
- [ ] Give every label a **taxonomy-version field** (`v1` now; a re-label pass follows once Phase 2's
  v2 taxonomy lands).
- [ ] Build the **eval runner** — a net-new classification scorer (the sibling's `eval/` package
  scores field extraction only and stays off the vendored path per ADR-0018): per-category
  precision/recall plus a K×K confusion matrix.
- [ ] Wire it as an **opt-in, env-gated check in `verify-all.mjs`** (the same pattern as the
  `VERIFY_LIVE` skip).
- [ ] **Record the baseline before any Phase-2 rule change** — a hard ordering requirement, not a
  suggestion (see Verification below).
- [ ] Build the feedback loop: a script that exports staff reclassifications, appends them to the
  corpus, and re-evaluates each release.

**Exit criteria:** the labelled Tier-3 corpus exists with taxonomy-version tags; the confusion-matrix
eval runner is wired into `verify-all.mjs` as opt-in; a classification baseline is recorded and
committed **before** Phase 2 changes any rule.

---

## Phase 2 — Taxonomy v2 + context-aware triage policy (the core upgrade)

- [ ] 🔒 **Apply the additive DDL delta first, live** (see [docs/gated.md](../../gated.md) §D6 item 2):
  `case_update` + `cancellation` categories, an `images_received` subtype (append-only codes, per the
  never-renumber doctrine — see `migration/assets/schema/000_enums_lookups.sql`), plus
  `inbound_email.body_jobref` + `conversation_id` columns. **Existing rows keep v1 codes — no
  backfill**; state how mixed-vintage rows display in SPA filters/metrics.
- [ ] Only once the DDL is live, ship the **taxonomy-v2 engine tag** + choicesets + SPA labels — see
  Deploy order above.
- [ ] Build the **ref-gate, suggest-first** policy step (a `packages/domain` triage-policy module per
  ADR-0019 Stage B): any inbound whose refs / job-ref / VRM match an **open** case, generalising the
  existing linked-reply lane (already runs `classifyPersist` + `extractImages` + `boxArchiveEvidence` +
  `statusEvaluate` on a linked case).
  - [ ] **All matches start suggestion-only for one release**, riding the existing `ai_suggestion`
    accept/reject lifecycle + inbox affordance.
  - [ ] **Exact single open-case ref match** promotes to auto-attach only after corpus results **and**
    live staff confirms.
  - [ ] **VRM-only matches stay suggest forever** (ADR-0010's no-ref rung — never promoted).
  - [ ] Extend `linkReply` to use `body_jobref` and to run pre-mint on `receiving_work` too (closes the
    TKT-023 leak).
  - [ ] "Detach" = unlink + flag the Box folder for manual cleanup — Box stays a one-way additive
    mirror ([ADR-0012](../../adr/0012-box-centric-intake-additive-hybrid.md)); no un-archive is
    promised.
  - [ ] New `inbound_*`/attach audit actions — append-only; the next free code lives in
    `migration/assets/schema/000_enums_lookups.sql`, not in this doc.
- [ ] Add the **`internetMessageId` dedup rung** plus **Data-API-side serialization** (a Postgres
  advisory lock on ref/VRM around resolve/ref-gate) — closes the cross-mailbox duplicate-delivery mint
  race.
- [ ] Run every policy step as a **Durable activity** with a checkpointed result, persisted decision
  inputs, and a stated idempotency contract.
- [ ] Build **local Postgres thread correlation** on the captured `conversationId` (nothing
  system-sent exists in SentItems — the chaser send is a stub; staff replies land there out-of-band
  only). If Graph `$filter=conversationId` is ever used instead: `eq`-only, no `$orderby`,
  URL-encode, live smoke-test first — it is not contractually documented.
- [ ] Encode the **`case_update` vs `query_existing_work` precedence** as confusion-matrix targets:
  ref-match + new evidence → `case_update`; ref-match + question-only → the query lane; cancellation
  phrases trump both. The currently-correct chaser handling must not regress.
- [ ] Build the **cancellation action**: a matched case → **propose** close/hold with note + audit
  (staff-confirmed, never auto-close — consistent with the automation-mode ladder;
  `choice_case_status` already has the terminal `removed` state).
- [ ] Build **images-received routing** (TKT-034/043): matched → suggest-attach + Box; unmatched with
  VRM → a reg-keyed Box dumping folder + flag (ADR-0015 §5).
- [ ] Extend the **signature filter**: the existing `isInline` skip gets a raster floor for non-inline
  images mirroring PR 5's semantics (pixel **area** floor, unknown-dimensions-kept — Graph supplies
  bytes only, so use a small PNG/JPEG header dimension-sniff with a byte-size fallback) (TKT-047).
- [ ] Wire **decision telemetry + kill-switches**: every policy decision (would-be action + inputs,
  rule/policy version) logs to App Insights `customEvents` always-on; each behaviour ships behind its
  own default-off app-setting gate (`TRIAGE_REF_GATE_ENABLED`, `TRIAGE_CANCELLATION_ENABLED`, …). No
  shadow rows land in `ai_suggestion` while its gate is off.

**Exit criteria:** the DDL delta is live and verified before the v2 engine tag ships; the ref-gate runs
suggest-first with the promotion ladder honoured; the `internetMessageId` dedup rung + advisory-lock
serialization are in place; decision telemetry flows to `customEvents`; every new behaviour is
default-off behind a named gate; zero false new-cases and zero chaser-classification regression on the
Phase-1 baseline corpus (see Verification).

---

## Phase 3 — Identification upgrade (provider / Image-Source intermediary)

- [ ] Implement **ADR-0011 as written** — the entity is **Image Source**, not a new "intermediary"
  table (CONTEXT.md canon): `image_source` rows with `kind=intermediary` + `email_domain` match keys
  (the table is already live + seeded; `migration/assets/schema/030_image_source.sql`).
- [ ] Add the new **N:N `image_source ↔ work_provider`** join (e.g. `connexus.co.uk` → {PCH, SBL}) and
  de-collide `knownEmailDomains`; add `@pch-ltd.com` etc. from the real ticket senders (TKT-021/051).
- [ ] Wire **document-content provider resolution into identity** (ADR-0011's second decision — doc
  content is the *primary* signal): map the parser's detected `work_provider` string to a
  `work_provider_id` at `caseResolve` (the string already forwards fill-if-empty with provenance; the
  id mapping plus mint/Held influence is the new part). **Verify TKT-028's headline example against
  the eval corpus first** — it may already be fixed live.
- [ ] Build **content-based attachment typing**: run the provider `detect_phrases` / `engineer_report`
  markers over extracted text to type `instruction` vs `report` vs `junk` by content, not extension
  (hardens Rule 1's corroboration gate). Net-new — today's report detection is filename-regex only.

**Exit criteria:** the intermediary N:N join is live and seeded with the new domains; `caseResolve`
maps the parser's provider string to a `work_provider_id`; content-based attachment typing replaces
the filename-regex-only report detection; TKT-021/028/051 are confirmed fixed via the corpus.

No operator gate is named for this phase in `gated.md` §D6.

---

## Phase 4 — Gated AI assist (Stage C; build gated-off, operator flips)

- [ ] **Replace the dormant stub's body** in `orchestration/src/functions/gated/triage-classify.ts`
  (today it just re-calls the deterministic `/classify-email` route) with an AOAI
  **structured-output** call constrained to the taxonomy, wired **post-classify for
  abstain/`uncorroborated_*` rows only**. Write `suggested_*` plus a row in the existing
  `ai_suggestion` lifecycle (accept/reject/supersede + audit actions), `classifier_mode='llm'`;
  **never auto-mints**.
- [ ] Wire the **two gates by name**: `EMAIL_AI_ENABLED` (the orch LLM call) and `AI_ASSIST_ENABLED`
  (the API suggestion surface) — both default-off.
- [ ] **Identity/keyless:** grant the orch app's managed identity **Cognitive Services OpenAI User** on
  the Foundry account; call with Entra tokens (no key app-setting).
- [ ] 🔒 Then **disable local auth** on the Foundry account — operator-confirmed (the account is
  operator-created and may have uses outside this repo); see [docs/gated.md](../../gated.md) §D6
  item 5.
- [ ] **PII + policy posture:** scrub subject/body through the existing
  `packages/domain/src/domain/pii-scrub.ts` helper pre-call (counts-only telemetry); honour
  `work_provider.ai_allowed` + the global kill switch; treat `content_filter` 400s as **abstain**
  (accident/injury narratives can trip the default RAI policy); pin the model version (or stamp
  model+version into `ai_suggestion.model_version` and re-baseline the eval on change).
- [ ] Record the **data-residency fact** the flip depends on: the chat model is Global-deployment-only
  in this region (no UK data zone exists) — inference may process outside the UK while data-at-rest
  stays regional.
- [ ] 🔒 **`EMAIL_AI_ENABLED` production flip** — gated on the **G5 per-AI-gate sign-off** (testing on
  repo data is already pre-authorised); see [docs/gated.md](../../gated.md) §D6 item 3.
- [ ] Use **structured outputs on the GA v1 surface** (`json_schema`, `strict:true`); honour the
  reasoning-model constraints (no `temperature`/`top_p`/penalties/`max_tokens` →
  `max_completion_tokens`, `reasoning_effort` minimal/low, low verbosity; strict schema subset).
- [ ] Run the **A/B `gpt-5-mini` vs `gpt-5`** comparison on the corpus before any enable — quota/cost
  detail lives in the registry; at current volume the gate is **residency, not spend**.
- [ ] Add the **embedding prior**: nearest-neighbours against the labelled corpus as a cheap re-rank
  signal, stored in `ai_suggestion`. Start with plain `float8[]`/`jsonb` columns + app-side cosine
  (tiny corpus); `pgvector` (allowlisted but not enabled) is the documented scale path.
- [ ] Run the **eval A/B**: deterministic vs +LLM on the real corpus before any live enable.

**Exit criteria:** the stub is replaced but ships gated-off; the managed identity holds the Foundry
role and calls are keyless (pending the operator's local-auth flip); PII scrub, content-filter-as-
abstain, and model-version pinning are in place; the A/B eval (deterministic vs +LLM, gpt-5 vs
gpt-5-mini) is recorded; `EMAIL_AI_ENABLED` production stays off until the G5 sign-off lands.

---

## Phase 5 — Declarative ruleset + operability

- [ ] **Externalise the phrase data only** (not the whole ruleset) into a schema-validated
  `triage-rules.json` in the engine (pattern: `provider-config.schema.json`) — the regexes, rule
  ordering, confidence bands, and suppression logic stay in Python. Build the loader + tests on
  **both** sides of the vendor boundary.
  - [ ] Runtime JSON validation on the cloud path (schema validation is desktop/test-only today).
  - [ ] The **desktop GUI/PyInstaller build must bundle + load the same JSON**
    ([ADR-0018](../../adr/0018-cedocumentmapper-dual-target-vendored-engine.md) dual-target — touch
    `build.ps1`).
- [ ] **SPA — under binding constraints, not a free hand:**
  - [ ] A handler-language **"Why this label?"** affordance: plain-English reasons in the
    tooltip/peek — the words "signals" / "rule-id" / "classifier" / "gated" **never render**. Two
    binding constraints govern this affordance:
    - AGENTS.md's **[HARD RULE — no engineering language in the app UI](../../../AGENTS.md)** — a
      platform-agnostic rule banning implementation/process/meta-spec language from any user-facing
      string (label, tooltip, empty state, badge, …).
    - [Review 010726](../../reviews/010726/decisions.md) decisions **D14** (quick-peek drawer, the
      surface this affordance most likely lives on), **D15** (every empty state carries one action),
      and **D16** (the inbox classification cell: max two lines, tag + confidence caption, folder line
      demoted to a tooltip) — the "why" affordance must fit inside D16's existing cell shape, not add
      a new one.
  - [ ] The **source-mailbox chip + filter** (TKT-025).
  - [ ] Finish the **actionable-inbox verification** (TKT-005).
  - [ ] **Never delete `inbound_email` rows** (audit-of-record); keep active-vs-handled semantics;
    hardened writes.
- [ ] **Rule promotion:** candidate rulesets prove themselves on the eval corpus + the always-on
  decision telemetry before promotion — no separate shadow phase at current volume.

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
