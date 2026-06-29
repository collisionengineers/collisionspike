# ADR-0015 — Email triage & inbox-management (deterministic MVP, LLM deferred)

**Status:** Proposed (2026-06-24). Relates to ADR-0010 (dedup ladder) and ADR-0014 (audit
case-type). Realised in Phase 8.

## Context

The intake pipeline only turns **attachment-bearing instruction emails** into Cases. The live trigger
guard `fetchOnlyWithAttachment: true` **DROPS every email with no attachment**, so queries, cold
enquiries and chasers are **invisible** to the system — they never land anywhere queryable.

The operator wants **every email** arriving at the 3 shared inboxes classified into a taxonomy:

- **RECEIVING WORK** — an existing-provider instruction / audit, or a new-client instruction.
- **QUERIES** — a question about existing work, or a new enquiry.
- **OTHER** — a catch-all for unidentified email (spam included). This is **explicitly NOT a
  drop-junk pre-filter**: there is little spam, **everything is categorised**, and spam simply lands in
  `other`. Nothing is silently dropped pre-classification.

## Decision

1. **A NEW lightweight triage table `cr1bd_inboundemail`** — one row per email.
   - *Rejected* **extend-Case** (would pollute every case tally / dedup / readiness count with
     non-work rows) and *rejected* **tags-only** (no queryable queue, no place to hang state).
2. **Two additive, never-renumber choicesets** — `cr1bd_inboundcategory` + `cr1bd_inboundsubtype`
   (option values are append-only, exactly like every other live choiceset).
3. **Classification engine = a deterministic `POST /classify-email` route in the parser Azure
   Function**, reusing `VRM_RE` / `detect_audit_signals` / the phrase tuples from `engine.py` (**NOT
   Power Fx** — re-implementing the detectors in Power Fx would drift from the parser). Unit-tested
   over a corpus.
4. **The gated LLM pass (`cr1bd_EMAIL_AI_ENABLED`, default off) is DEFERRED** to a later sub-phase and
   only ever sees `other` / low-confidence rows — the deterministic pass handles the rest.
5. **An inbound email links to a Case by the Case/PO number FIRST, VRM only as a fallback.** Each
   accident has its own Case/PO (hence its own Box folder), so the Case/PO is the precise key; the
   body-VRM is the fallback when no Case/PO is present. The link rule **NEVER auto-links on ambiguity** —
   a multi-match VRM is surfaced to a human (and true ambiguity is rare). The rare unplaceable upload
   routes to a Box "**dumping folder**" for human resolution rather than being guessed onto a case.
   Cross-reference **ADR-0010** (the dedup ladder's no-silent-merge discipline).
6. **New audit actions are named `inbound_*`** to avoid collision with the ADR-0014 "audit" case-type
   and the `cr1bd_auditevent` log. The word **"audit" is triple-loaded** in this codebase — keep the
   schema names, but distinguish the three meanings:
   - **(a) the `cr1bd_auditevent` action LOG** — the append-only record of what the pipeline did;
   - **(b) the ADR-0014 case-TYPE `audit`** — a re-inspection (Case ID carries an `A.` prefix);
   - **(c) the Phase-8 `inbound_*` audit-action subtype** — triage actions on a `cr1bd_inboundemail` row.
   These are independent; triage actions stay in the `inbound_*` namespace so none is confused for another.
7. **A raw `.eml` is retained ONLY when a Case is extracted.** For `query` / `other` email **no `.eml`
   is persisted to Blob** — the mailbox keeps the mail and the `cr1bd_inboundemail` triage row holds
   **metadata + a pointer**. (This corrects any earlier text implying `.eml` bytes go to Blob for every
   category.)

## Consequences

- **Flipping `fetchOnlyWithAttachment` true→false is a Phase-2 (live-activation) prerequisite** on the
  live `digital@` webhook. It exposes the flow to **ALL inbox traffic** — but **everything is
  categorised** (no drop-junk pre-filter; spam → `other`), so there is no pre-filter to build. Cost is
  **negligible and tracked as a MONITOR, not a ceiling**: the deterministic classifier is **$0** (it
  stays within the Power Automate seeded-run allowance at the observed ~1–3k emails/month), and the
  later **optional** LLM pass is ~**$0.21–1.50/month**. The remaining interaction to watch is
  **`concurrency=1`** (a sudden flood of non-work mail could slow the work queue).
- **Classifier testing is a planned Phase-8 sub-step (gated, operator-assisted):** the operator drops
  **real sample emails** into the Phase-8 folder and the unit tests consume them. Until that corpus
  lands, classifier precision over real query/enquiry traffic is **unverified**.
- **AI-test authority (G5):** the operator holds **full authority to run AI testing on all repo data**.
  This is the explicit enabler for testing the **gated LLM classifier pass** here (and the Phase-4a
  vision/geocode work) on the repo's own sample data. (The broader data-protection sign-off in ADR-0017
  is deferred, but does not block this AI testing.)
- The locked table + taxonomy decisions should pass a **`grill-with-docs`** review before the schema is
  applied.

## Links

- ADR-0010 (dedup ladder)
- ADR-0014 (audit case-type)
- Phase 8 plan — [`docs/plans/phase-8-inbox-management/README.md`](../plans/phase-8-inbox-management/README.md)
- [`docs/open-questions.md`](../open-questions.md)

## Update (2026-06-27) — platform migration (mechanism only)

The triage **decision** (classify every email; RECEIVING WORK / QUERIES / OTHER; a dedicated triage
table; never silently dropped) stands. The Power Platform specifics are superseded by the Azure stack
(**deprovisioned 2026-06-27**): the new triage table moves from Dataverse `cr1bd_inboundemail` to a
**Postgres** `inbound_email` table (with `inbound_category` / `inbound_subtype` lookups); intake
transport is **Microsoft Graph change-notification (PUSH)** handled by **`cespk-orch-dev`**, not the
`fetchOnlyWithAttachment` Power Automate trigger; the deterministic classifier is a parser / Data-API
route. The cost / `concurrency=1` notes about the Power Automate seeded-run allowance no longer apply.

## Update (2026-06-29) — attachment-corroboration gate (over-promotion fix)

Live triage in testing surfaced ~8 **blank auto-created Cases** (no VRM, no Case/PO, no provider) and a
complaint that "most emails" were becoming Cases. Investigation separated this into **two distinct
things** — be honest about which this change fixes:

1. **The ~8 existing blank Cases are HISTORICAL artifacts, NOT classifier over-promotions.** Their
   `inbound_email` rows carry `category_code = NULL`, **empty `signals`**, and attachment-less, test-like
   subjects (`test`, `2FA authentication code`, `Terms of Service`, `Box invitation`). The current
   orchestrator always runs `classifyInbound` (which always persists non-empty `signals`) before
   `caseResolve`, so a Case whose triage row has a NULL classification could not have been minted by
   today's pipeline — these predate the triage-classifier wiring and are **not reproduced** by current
   intake (the recent inbound rows all correctly abstain to `other`, no Case). They are a **separate
   data-cleanup item** (out of scope here; they may include the operator's own early tests).
2. **A genuine FORWARD over-promotion vector in the classifier** (`cedocumentmapper_v2/rules/email_classifier.py`)
   — the bug this change fixes. The classifier promoted to `receiving_work` on an **attachment kind
   alone**, and the attachment kind is derived purely by **file extension** (`.pdf/.doc/.docx →
   instruction`, an image → `image`) with **no content inspection**. So **any** email carrying a PDF/DOC
   (a spam flyer, invoice, statement, newsletter, forwarded letter) would hit **Rule 1** and mint a Case,
   and **any** image from a known-provider domain (a forwarded chain, a signature logo, a bounced-back
   photo) would hit **Rule 2** on the provider match alone. Confirmed live against the deployed route
   (uncorroborated PDF → `other`; corroborated instruction → `receiving_work`).

This violates the ADR's **abstain-to-other** bias (NEVER auto-link / auto-create on ambiguity). The fix
adds a **corroboration gate** — a deliberate, surgical tightening of the same pure $0 classifier:

- **Rule 1 (instruction doc).** The audit-phrase and known-provider early-returns are kept (both ARE
  corroboration). The **new-client** arm now requires a corroborating signal — a **work phrase**, a body
  **Case/PO**, or a **VRM**. With none, the doc is flagged `uncorroborated_instruction_doc` and **falls
  through** to the query / abstain rules instead of minting a Case.
- **Rule 2 (images).** Promotion now requires `work_phrase OR body Case/PO OR VRM OR audit signal`. A
  **known provider domain alone no longer promotes** a bare image (it still selects the *subtype* once
  another signal corroborates); the uncorroborated case is flagged `uncorroborated_provider_image` and
  falls through. The asymmetry is deliberate: a document is a deliberate work artifact, a bare image is
  weak.

Uncorroborated attachments **abstain to `other`** at `_CONFIDENCE_ABSTAIN` (0.3) so the deferred,
gated LLM pass can target exactly those low-confidence rows. **Forward-only** fix (parser Function
`cespike-parser-dev` redeployed; orch/api untouched); the ~8 already-created blank Cases are a separate
cleanup pass. The sibling engine was absent at fix time, so the change landed in the **vendored copy
only** with a replay hunk recorded in `cedocumentmapper_v2/PROVENANCE.md`.
