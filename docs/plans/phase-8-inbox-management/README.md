> **Phase 8 — Inbox / Triage Management** (planned, additive — like Phase 7). Promoted from
> `docs/plans/to-integrate-into-phases/` on 2026-06-24. **Status: BUILT OFFLINE (Phase A + the Phase-B
> Code App Inbox/Triage screen), gated-OFF / activation-pending — NOT live** (completed on branch
> `feat/phase-8-inbox-management`; the deterministic classifier + `/classify-email`, the
> `cr1bd_inboundemail` table + choicesets + `26-inbound-email.ps1`, the `triage-classify` child + the
> triage-first intake restructure, the `cr1bd_EMAIL_AI_ENABLED` dark gate, and the faceted `/inbox`
> screen are all authored + verified offline; live trigger-flip / schema `-Apply` / connection-bind
> remain operator-gated — see `IMPLEMENTATION-PLAN.md` §gated-activation). Backed by
> **ADR-0015** (Proposed). Several locked decisions (new-table vs extend-Case; the 4-quadrant + Other
> taxonomy) should pass a `grill-with-docs` review before any schema is applied. Consolidated open
> questions: [../../open-questions.md](../../open-questions.md). The core-intake surgery — flipping
> `fetchOnlyWithAttachment` true→false on the live digital@ webhook — is a **Phase 2 (Live Activation)
> prerequisite** and operator-gated. There is **no drop-junk pre-filter**: spam volume is low, so
> **everything is categorised** (spam/auto-replies/newsletters simply fall through to `other`). Cost is
> negligible — the deterministic classifier is **$0** (within the Power Automate seeded run limit at
> ~1–3k emails/mo) and the later optional LLM pass is **~$0.21–1.50/mo**; treat run volume as a **monitor**
> on the `concurrency=1` queue, not a cost ceiling. Dataverse build step = `26-inbound-email.ps1`.
> **As-built (2026-06-24):** the Phase-8 inbound actions are minted — `inbound_classified=100000024` and
> `inbound_routed=100000025`; `case_disposed=100000026` (Phase 9) is the highest, so the **next free
> audit-action value is `100000027`**. (The earlier "next free = 100000022" is stale — 100000022 is
> `location_assist_confirmed`, 100000023 is `chaser_sent`.) Name any further actions `inbound_*`.
>
> **Live trigger evidence (2026-06-25):** `digital@` (the team's working inbox) running the live trigger on
> `fetchOnlyWithAttachment=false` produced a backlog of **50 blank junk Cases** (GitHub/vendor/2FA noise). See
> [junk-backlog-and-activation-evidence.md](./junk-backlog-and-activation-evidence.md) for the findings, the
> blank-guarded cleanup runbook, and why **content-based** triage keeps test extraction working.

# Email Tag/ID + Inbox-Management System — Plan

## Context

Today the intake pipeline only knows how to do **one** thing with a mailbox: turn an
attachment-bearing instruction email into a Case. The live trigger guard
`fetchOnlyWithAttachment: true` (in [intake.definition.json](flows/definitions/intake.definition.json))
literally **drops every email that has no attachment** — so queries, chasers, and cold enquiries
are invisible to the system. Its own header comment already flags this as "a TEMPORARY filter to be
removed when a full email-management/routing system lands." **This plan is that system.**

The goal: classify **every** email arriving at the 3 shared inboxes, deterministically and auditably,
into the operator's taxonomy — then route work to the existing Case chain and everything else to a
lightweight triage record + queue. An optional, gated LLM pass is deferred to a later phase.

**Decisions locked with the operator (this session):**
- **Data model** → a **new lightweight triage table** (cost analysis below shows storage is
  negligible across all options at this volume; the table wins purely on data-model fit).
- **Engine** → **deterministic MVP first; LLM gated and deferred** to a later phase.
- **Breadth** → the operator's 4 quadrants, plus a plain **"Other"** catch-all tab for unidentified
  email (explicitly *not* a "noise/spam" classifier — anything without a work/query signal just lands
  in Other).

## Taxonomy

Two stable, additive choicesets (never renumber — same discipline as `case-status.json` /
`audit-event.json`).

`cr1bd_inboundcategory`: `receiving_work` | `query` | `other`

`cr1bd_inboundsubtype` (maps the brainstorm 1:1):

| subtype | operator's taxonomy |
|---|---|
| `existing_provider_instruction` | RECEIVING WORK · Type1(a) base instructions |
| `existing_provider_audit` | RECEIVING WORK · Type1(b) audit |
| `new_client_work` | RECEIVING WORK · Type2 new client |
| `query_existing_work` | QUERIES · Type1 (about work we did) |
| `query_new_enquiry` | QUERIES · Type2 (new enquiry) |
| `other` | unidentified — the catch-all bucket |

There is **no** separate noise/OOO classifier. Bounces, out-of-office, newsletters etc. simply fail
every work/query rule and fall through to `other` — exactly the "bucket for unidentified e-mails" the
operator asked for.

## Signal → label mapping (reuse what already exists)

| Signal | Existing source to reuse |
|---|---|
| Sender domain → existing provider? | `Init_senderDomain` + `Filter_exact_domain` in [intake.definition.json](flows/definitions/intake.definition.json) / [provider-match.definition.json](flows/definitions/provider-match.definition.json); corpus `cr1bd_workproviders.knownEmailDomains` (38 domains in [email-domains.csv](dataverse/.build/email-domains.csv)). ONE → existing provider, NONE → new client, AMBIGUOUS → existing-but-unassigned. |
| Has attachments / attachment kinds | V3 trigger `body/hasAttachments`; `Compose_kind` in [classify-persist.definition.json](flows/definitions/classify-persist.definition.json) (instruction = strong work signal). |
| Audit instruction? | `detect_audit_signals(text)` in [engine.py](../../../functions/parser/cedocumentmapper_v2/rules/engine.py), already surfaced in the parser `audit:{value,signals,source}` envelope ([function_app.py](../../../functions/parser/function_app.py), [parser_adapter.py](../../../functions/parser/parser_adapter.py)) per ADR-0014. Distinguishes Type1(a) vs Type1(b). |
| Subject/body keywords | NEW phrase lists modelled on `_AUDIT_PHRASES` / `_IMAGE_BASED_PHRASES` in engine.py. |
| Body case-ref / VRM → an OPEN Case? | **Link by the Case/PO number FIRST** (each accident has its own Case/PO → its own Box folder), **VRM only as a fallback**. Reuse the case-ref + `VRM_RE` extractors from engine.py + a Dataverse lookup on `cr1bd_cases` (same idiom as [case-resolve.definition.json](flows/definitions/case-resolve.definition.json), ADR-0002). A body-mentioned Case/PO (or, failing that, a VRM) that hits an open Case with no instruction doc ⇒ "query about work we did". True ambiguity is **rare**; never silently merge (ADR-0010) — surface it to a human (e.g. a Box "dumping folder"). |

**Decision tree (first match wins):**
1. Instruction doc present → `receiving_work`; subtype = `existing_provider_audit` (parser
   `audit.value`) | `existing_provider_instruction` (domain ONE) | `new_client_work` (else).
2. Images only, provider known or work keyword → `receiving_work`.
3. No attachment, ≥2 work keywords + a body Case/PO or VRM (typed-in-body instruction) → `receiving_work`.
4. Body Case/PO (**first**) — or a VRM as fallback — resolves to an OPEN Case, no instruction doc → `query` /
   `query_existing_work` (link to that Case, **do not create one**; never silently merge — ADR-0010).
5. Query keyword (quote/how much/enquiry/where is…), no open-case match → `query`
   (`query_existing_work` if provider known, else `query_new_enquiry`).
6. Anything else → `other`.

Every rule records the fired signals into the triage row + an Action-Log entry — same explainability
discipline as `detect_audit_signals`.

## Data model — new triage table

**`cr1bd_inboundemail`** (new `dataverse/schema/inbound-email.json`) — exactly one row per email (the
universal "we saw this" record); a WORK row then points at the Case the existing chain creates.

Key columns: `cr1bd_sourcemessageid` (String, **alternate key** — dedup anchor, mirrors the Case key);
`cr1bd_fromaddress`, `cr1bd_senderdomain`, `cr1bd_sourcemailbox`, `cr1bd_receivedon`,
`cr1bd_hasattachments`; `cr1bd_category` + `cr1bd_subtype` (the two choicesets);
`cr1bd_classifiermode` (deterministic|llm|human); `cr1bd_signals` (Memo — JSON of fired rules);
`cr1bd_triagestate` (new|routed|actioned|dismissed); `cr1bd_workproviderid` (Lookup → WorkProvider);
`cr1bd_caseid` (Lookup → Case — set for work, or for the open Case a query is about);
`cr1bd_bodypreview` (Memo, for the triage UI).

Why not the alternatives: extending **Case** pollutes every case tally/dedup/readiness check with
non-work rows and still can't represent a row that will never be a case; **tags-only** leaves no
queryable triage queue. The new table is the backbone of the "full inbox management" surface.

Authored offline, applied live by the operator: add the two choicesets to `dataverse/choicesets/`,
register IDs in [optionset-ids.json](dataverse/.build/optionset-ids.json), add a numbered build step
`dataverse/.build/26-inbound-email.ps1` following the existing convention. **A raw `.eml` is persisted to
Azure Blob ONLY when a Case is extracted** (the `receiving_work` path, via classify-persist). For
`query`/`other` email **no `.eml` is persisted to Blob** — the **mailbox keeps the mail** and the triage
row holds **metadata + a pointer** (source Message-ID / mailbox reference). Dataverse holds metadata only.

## Cost analysis (operator-requested)

Researched against current (2026) Microsoft pricing. **At ~1,000–3,000 emails/month, storage is a
rounding error and does not differentiate the options.**

| Meter | Rate (2026) | At ~3,000/mo |
|---|---|---|
| Dataverse **database** | ~$40/GB-mo overage; **0 within default entitlement** (raised Dec-2025) | +1 row/email ≈ 2 KB → ~36k rows/yr ≈ 0.07 GB → **$0** |
| Dataverse file/log | $2 / $10 per GB-mo | n/a (bytes → Blob) / negligible audit |
| Per-row / per-table charge | **none** | $0 |
| Azure Blob (Hot, LRS) | ~$0.018/GB-mo + ~$0.05/10k writes | only the **Case-extracted** subset persists an `.eml` → well under 0.375 GB → **~$0.02/mo** |
| Azure Functions FC1 | $0.40/M execs after **250k free**; GB-s after 100k free | 3,000 `/classify-email` → **$0** (free grant) |
| Power Automate requests | per-action; **6,000/user/day seeded free** | ~1,000/day → **$0** (under limit) |
| LLM (later, gated) — GPT-4o-mini | $0.15 in / $0.60 out per 1M | ~500 ambiguous/mo → **~$0.21/mo** |
| LLM (later, gated) — Claude Haiku 4.5 | $1.00 in / $5.00 out per 1M | ~500/mo → **~$1.50/mo** |

**Bottom line:** the deterministic classifier is **$0** (within the seeded Power Automate run limit at
~1–3k emails/mo) and the **optional later LLM pass** is **~$0.20–1.50/mo** — both negligible. The only thing
to keep an eye on is **Power Automate run volume** — firing on *every* email vs attachment-only — which is a
**throttling/queue monitor** (watch headroom under ~6k actions/day at `concurrency=1`), **not** a cost
ceiling and **not** a reason for a drop-junk pre-filter. Storage is identical (~2¢/mo) across new-table /
extend-Case / tags-only. → **Choose the new table on fit; cost is a non-issue.** (Extend-Case would actually
generate the *most* Dataverse writes per email, so if any option stresses the request entitlement it is that
one, not the new table.)

## Engine — deterministic MVP (Phase A), LLM deferred (Phase C)

**Where it lives:** a new **`POST /classify-email`** route in the parser Azure Function — *not* Power
Fx. The strongest signals are already Python in [engine.py](../../../functions/parser/cedocumentmapper_v2/rules/engine.py)
(`detect_audit_signals`, `VRM_RE`, the phrase tuples); re-deriving them in Power Fx would duplicate
and drift (see the vendored-divergence memo). Python is unit-testable; flow expressions are not. The
parser's connector/function-key path already exists — the second route reuses all of it.

- New `cedocumentmapper_v2/rules/email_classifier.py` beside engine.py, importing `VRM_RE` /
  `detect_audit_signals` and new `_WORK_KEYWORDS` / `_QUERY_KEYWORDS` tuples (same precision
  discipline). **Edit the vendored copy under `functions/parser/` and reconcile the sibling**
  per the vendored-divergence memo.
- Pure function: request `{subject, body, from, sender_domain, provider_match_state,
  attachment_kinds[], has_attachments}` → response `{category, subtype, confidence, signals[],
  body_vrm, body_caseref, contract_version}`. No Dataverse, no network → trivially testable. The
  flow keeps the Dataverse open-Case lookup (rule 4) on its side, mirroring how `/parse` works.
- HTML-strip the V3 body server-side for reliable keyword/VRM scanning; `body_vrm` also closes the
  "instructions typed in the email body, no attachment" gap.

**Phase C (deferred):** new default-off env-var `cr1bd_EMAIL_AI_ENABLED` (sibling to
`COPILOT_ENABLED`); only `category=other`/low-confidence rows reach a gated `triage-llm` child
returning the same shape (`classifiermode=llm`); honour the existing per-provider
`cr1bd_aiallowed` / `cr1bd_providerautomationmode`. Runs behind a connector (Code App CSP forbids raw
fetch).

## Flow change — triage-first, then route

Restructure [intake.definition.json](flows/definitions/intake.definition.json) (and
`intake-shared-mailbox.definition.json`):
1. Flip `fetchOnlyWithAttachment` → `false`; keep `concurrency:1`, `MinIntakeDate`.
2. Generalise Message-ID dedup: today `Find_existing_by_messageId` probes `cr1bd_cases`; also probe
   `cr1bd_inboundemail` so a repeat *query* is dropped too (ADR-0010).
3. Provider match — reuse the existing anchored domain logic verbatim.
4. **NEW `Run_triage` child** (`flows/definitions/triage-classify.definition.json`): always
   create/update the `cr1bd_inboundemail` row first, call `/classify-email`, do the open-Case VRM
   lookup, return the label.
5. **Switch on category:**
   - `receiving_work` → the **existing chain unchanged** (classify-persist → parse → Case/PO →
     status-evaluate, plus live `Run_case_resolve`/`Run_enrich`); write the Case id back to the
     triage row; refine to `existing_provider_audit` + `A.` prefix once parser `audit.value` known.
   - `query` → no Case; set `cr1bd_caseid` to the matched open Case if `query_existing_work`; stop.
   - `other` → `triagestate=new`, stop (sits in the Other tab for a human).

   _(Audit — as built: the `triage-classify` child records **every** category uniformly via
   `inbound_classified` (100000024) + `inbound_routed` (100000025); the per-branch
   `inbound_query_logged` / `inbound_other` actions named in earlier drafts were **superseded** by that
   design and are **not** added — see ADR-0015 / `IMPLEMENTATION-PLAN.md` gap-4. Do not renumber/add.)_

**Reconcile first:** the live intake has `Run_enrich`/`Run_case_resolve` that the repo def lacks
(intake-repo-trails-live memo) — reconcile before editing so the change re-imports cleanly.

## Labelled corpus

Today [test-cases-and-data/test-cases/](test-cases-and-data/test-cases) has 12 dirs, **all
RECEIVING-WORK** (incl. audit cases `A.PCH261269`, `A.PCH261272`). No query/enquiry/other examples.
Build in three tiers:
1. **Relabel existing** — a `labels.json` manifest mapping each fixture → `{category, subtype}`.
2. **Synthetic for the gaps** — author plain-text `.eml` fixtures under
   `test-cases-and-data/triage-corpus/<subtype>/`: a "where is my report for ABC123" query, a "can
   you quote to inspect a write-off" enquiry, an unknown-domain instruction (new_client_work), an
   OOO auto-reply + a bounce (→ should land in `other`). Exercise the body-only path.
3. **Classifier testing on real sample mail — gated operator sub-step `[RESERVED-FOR-USER]`.** A planned
   Phase-8 sub-step: the **operator drops real sample emails into the Phase-8 folder**
   (`test-cases-and-data/triage-corpus/`) and the **test suite consumes them** as fixtures (Claude cannot
   read live mail). The operator has **full authority for AI testing on all repo data** (G5), so these
   samples may be used to exercise both the deterministic classifier and the later gated LLM pass. Precision
   can only be trusted once these land.

Wire the corpus into `functions/parser/tests/` parametrised over the manifest, so
`email_classifier.py` has regression coverage from day one.

## Box's role (honest)

Box is **dormant** (all `BOX_*` gates false; CCG connector authored-offline; free test account can't
do CCG/File-Requests). Keep triage **off** the Box critical path — a Case-extracted `.eml` goes to Azure
Blob, while `query`/`other` mail stays in the mailbox with only metadata + a pointer in the triage row (A7).
Keep the labelled corpus **in-repo** for now. A future, gated `BOX_QUERY_ARCHIVE_ENABLED`
(queries → a `Queries/<year>` folder) is **deferred, not built now**. Dataverse stays authoritative
(ADR-0012).

## Phasing

- **Phase A — Deterministic MVP (no UI/LLM/Box).** `email_classifier.py` + `/classify-email` with
  corpus tests; `cr1bd_inboundemail` table + 2 choicesets + audit actions; `triage-classify` child;
  restructure intake (flip trigger, generalise dedup, insert triage + Switch). **Gated sub-step — real
  sample-mail testing `[RESERVED-FOR-USER]`:** the operator drops real sample emails into the Phase-8
  corpus folder and the test suite consumes them (AI-test authority on repo data, G5). **Soft rollout: one
  inbox first, watch run volume** (a queue monitor, not a cost ceiling). Exit: every email → a triage row +
  audit; work still flows to Cases unchanged.
- **Phase B — Query queue + Code App "Inbox / Triage" screen.** List `cr1bd_inboundemail` faceted by
  category/subtype with an **Other** tab; query rows show body preview + open-in-mailbox (the metadata
  pointer — no persisted `.eml` for `query`/`other`, A7) + link/convert-to-Case; reclassify via the
  Dataverse-trigger-flag pattern (CSP-safe).
- **Phase C — LLM assist (gated).** `EMAIL_AI_ENABLED` + `triage-llm` child for `other`/low-confidence
  only; honour per-provider AI flags.

## Files to create / modify

**Create:** `functions/parser/cedocumentmapper_v2/rules/email_classifier.py` (+ sibling copy);
`flows/definitions/triage-classify.definition.json`; `dataverse/schema/inbound-email.json`;
`dataverse/choicesets/inbound-email-classification.json`; `dataverse/.build/26-inbound-email.ps1`;
`test-cases-and-data/triage-corpus/<subtype>/*.eml` + `labels.json`;
`docs/adr/0015-email-triage-inbox-management.md`; `docs/plans/phase-8-inbox-management/README.md`.

**Modify:** [intake.definition.json](flows/definitions/intake.definition.json) (+
`intake-shared-mailbox.definition.json`) — flip trigger, generalise dedup, insert triage child +
Switch + case-id write-back (reconcile live `Run_enrich`/`Run_case_resolve` first);
[function_app.py](../../../functions/parser/function_app.py) — add `/classify-email`;
[engine.py](../../../functions/parser/cedocumentmapper_v2/rules/engine.py) (+ sibling) — export reusable
`VRM_RE` / phrase tuples; [environment-variables.json](../../../dataverse/environment-variables.json) — add
`cr1bd_EMAIL_AI_ENABLED` (Phase C).

## Verification

- **Unit:** `pytest functions/parser/tests/` — new `test_email_classifier.py` parametrised over the
  corpus manifest; assert each fixture → expected `{category, subtype}`, and zero work/query false
  positives on the `other` fixtures (mirror `test_audit_detection.py`). Keep vendored+sibling in sync
  (`test_engine_vendored_in_sync`).
- **Function locally:** `func start` in `functions/parser`, POST sample bodies to `/classify-email`,
  confirm the envelope + fired signals.
- **Flow (Dev):** with the trigger flipped on **one** inbox, send (a) an attachment instruction,
  (b) a body-only "where is my report for <VRM>" against a known open Case, (c) a cold enquiry,
  (d) an OOO auto-reply. Confirm: a `cr1bd_inboundemail` row for each; (a) creates/links a Case,
  (b) links the open Case with no new Case, (c) `query_new_enquiry`, (d) `other`; one Action-Log
  entry each; a repeat send is dedup-dropped.
- **Cost guard:** watch the Power Platform request count on the soft-rollout inbox for a day to
  confirm headroom under the 6,000/day seeded limit before enabling the other two inboxes.

## Risks / open items

1. **Trigger flip = volume risk** — removing the attachment filter exposes the flow to all inbox
   traffic; mitigate with single-inbox soft rollout + run-count monitoring. (Biggest operational
   risk; storage cost is not.)
2. **Body fidelity** — forwarded chains/signatures cause false VRM/keyword hits → bias to
   "abstain → Other" over a wrong WORK label.
3. **"Audit" namespace overload (glossary).** The word **audit** is triple-loaded — **keep all three
   schema names, no table rename**, just disambiguate in prose:
   - **(a) the action LOG** — `cr1bd_auditevent` (the "we did X" provenance trail; new entries here are the
     `inbound_*` actions);
   - **(b) the ADR-0014 case-TYPE 'audit'** — a re-inspection case (the `A.` Case/PO prefix);
   - **(c) this Phase-8 inbound audit SUBTYPE** — `existing_provider_audit` on `cr1bd_inboundsubtype` (an
     inbound instruction *for* an audit case).
   New log actions are named `inbound_*`; confirm the wording via `grill-with-docs`.
4. **Corpus mostly synthetic at first** — real-mail gathering is `[RESERVED-FOR-USER]`.
5. **Vendored parser divergence** — add `email_classifier.py` to the vendored copy and reconcile the
   sibling.
