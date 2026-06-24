# Decisions register — RESOLVED (operator-confirmed 2026-06-24)

_Consolidated 2026-06-24 from the whole-repo review + the two newly-integrated items (Phase 8 inbox
triage, Phase 4a inspection-address revamp) + the new Phase 9 governance work. **All items below are now
resolved** — the operator has ruled on each. This is a historical record of how the decision was made and
where it now lives; it is no longer a list of open choices._

This is the **decisions** register (judgement calls the operator has now made). It is distinct from
[docs/gated.md](./gated.md), which is the **operator-action** registry (passwords, live clicks, test
emails). Each entry: **the question · why it matters · the resolution + where it now lives**. The
operator's inline **Answer:** text is preserved verbatim under each item.

---

## Phase 8 — Inbox / triage management (ADR-0015 Proposed)

- **Q-A1 · Standalone Phase 8, or fold into Phase 2?** _Why:_ sets the taxonomy and ownership.
  **RESOLVED: standalone Phase 8** (triaging non-work email + the triage table/queue/UI is genuinely new
  scope); the `intake.definition.json` trigger-flip + dedup-generalisation are carved out as a Phase 2
  prerequisite (surgery on the live digital@ webhook). Lives in **Phase 8 / ADR-0015**.
Answer: Standalone.

- **Q-A2 · Does flipping `fetchOnlyWithAttachment` true→false force a digital@ webhook re-subscription?**
  _Why:_ if yes it's a live-designer `[RESERVED-FOR-USER]` edit, not a re-import. **RESOLVED: assume yes;
  flip only AFTER single-mailbox Phase 2 activation is proven; operator-gated.** Lives in **Phase 8 /
  ADR-0015** (with [docs/gated.md](./gated.md) holding the operator-action).
- **Q-A3 · Spam / auto-reply handling once every email hits the flow.** _Why:_ removing the attachment
  filter exposes the classifier to bounces, OOO, newsletters; the worry was junk volume + per-email cost.
  **RESOLVED: NO drop-junk pre-filter — EVERYTHING is categorised** (spam falls through to category
  `other`); that is the whole point of an automated inbox-management system. There is little spam in
  practice. **Cost is negligible and reframed as a monitor, not a ceiling:** the deterministic classifier is
  effectively **$0** (within the Power Automate seeded run limit at ~1–3k emails/mo); the later **optional**
  LLM pass is ~**$0.21–1.50/mo**. Lives in **Phase 8 / ADR-0015**.
Answer: need to determine classifier cost. We don't get much spam and everything does need to be categorized. This is the purpose of making an automated inbox management system.

- **Q-A4 · Link an inbound email to a Case — by what key, and what about ambiguity?** **RESOLVED: link by
  the Case/PO number FIRST** (each accident has its own Case/PO → its own Box folder, so collisions are
  rare), **VRM only as a fallback**. True ambiguity is rare; when it does occur (e.g. a Box "dumping folder"
  for humans) it is **surfaced to a human — never auto-linked**, keeping the **ADR-0010** no-silent-merge
  rule. Lives in **Phase 8 / ADR-0015** (link contract) + **ADR-0010** (dedup/no-silent-merge).
Answer: There should not really be amiguity. This is something we can determine in most cases. E.g. if multiple instructions are sent as a vehicle had multiple accidents, each one would have its own box folder since it has its own Case/PO number. Might need human interaction if there was a "dumping folder" on box for humans.


- **Q-A5 · `inbound_*` audit-action names + values — and the triple-loaded "audit" term.** _Why:_ "audit"
  means three different things in this codebase. **RESOLVED: KEEP all existing schema names (no table
  rename); add a short glossary note distinguishing the three senses.** The word **audit** is triple-loaded:
  **(a)** the `cr1bd_auditevent` action **LOG** (who-did-what trail); **(b)** the **ADR-0014 case-TYPE
  `audit`** (a re-inspection, `A.` prefix); **(c)** the **Phase-8 `inbound_*` audit-action subtype** (e.g.
  `inbound_work_routed` / `inbound_query_logged` / `inbound_other`). These are kept distinct by name, not
  merged. Glossary lives in **Phase 8 / ADR-0015** alongside **ADR-0014**.
Answer: Can re-clarify if audit term being overused. Discuss with user.

- **Q-A6 · Classifier testing against real sample emails.** _Why:_ classifier precision on body-only +
  "other" fall-through is untrustworthy on synthetic data alone. **RESOLVED: this is a planned Phase-8
  sub-step — the operator drops real sample emails into the Phase-8 folder and the tests consume them**
  (a gated operator step). Lives in **Phase 8 / ADR-0015** (test sub-step); the drop itself is recorded in
  [docs/gated.md](./gated.md).
Answer: This barely even makes sense as a question? Clarify this more precisely with me.

- **Q-A7 · Raw `.eml` retention for NON-work email.** _Why:_ retaining full bodies of cold third-party
  enquiries indefinitely is a minimisation problem from day one. **RESOLVED: a raw `.eml` is retained ONLY
  when a Case is extracted.** For query/other email **no `.eml` bytes are persisted to Blob** — the mailbox
  keeps the mail and the triage row holds only metadata + a pointer. (This **corrects** any earlier text
  that said `.eml` bytes go to Blob for all categories.) Lives in **Phase 8 / ADR-0015**.
Nobody said we retain any .eml files in this case. We retain a .eml file in a situation where a CASE is extracted.

## Phase 4a — Inspection-address revamp (ADR-0016 Proposed)

- **Q-B1 · "Entirely replace" scope** — suggestion layer only / also the Confirmed rows / full truncate?
  **RESOLVED: FULL replace from the vetted EVA export.** It is the 100% vetted source (the current corpus
  held best-guess addresses). **Back up the current corpus to the repo FIRST** (export/download all current
  location data and commit it as a backup), **then replace entirely.** Every imported row is a **SUGGESTION
  (`decisionMode=Unknown`)** — **ADR-0013 stays intact**: staff still pick per case and nothing
  auto-confirms. Lives in **Phase 4a / ADR-0016** (with **ADR-0013** binding).
Answer: Scope is entirely replace. This is the 100% fully vetted export. Some addresses were a best guess basis in the current corpus. Propose to export/download all current location data and save to repo as a backup, then replace entirely with new data.

- **Q-B2 · How to map each inspection to a provider/Principal?** **RESOLVED: parse the Principal from the
  export's `Case ID` leading alpha prefix** — `Case ID` IS our Case/PO number (Principal/Provider Code +
  digits), so e.g. `CCPY26050` → Principal `CCPY`. **BRANCH:** if the `Case ID` is **VRM-shaped** it is an
  **INDIVIDUAL case keyed by VRM** (no Principal code). Lives in **Phase 4a / ADR-0016** (provider mapping)
  + the cross-cutting **Case/PO keying rule** below.
Answer: The export does have a provider code (principal). The "Case ID" field in the export is our Case/PO number system. Which, as has already been defined, is Principal/Provider Code and numbers. Therefore, any letters in the Case ID field in the fullevaexportinspectionaddresses.xslx export DOES contain all principals. 

- **Q-B3 · Site dedup key** — (provider + normalised postcode) / (provider + full address) / site name?
  **RESOLVED: dedup sites on the FULL address (provider + full address), with postcode as the secondary
  key** — the export carries full addresses. Lives in **Phase 4a / ADR-0016**.
Answer: There are full addresses on the export.

- **Q-B4 · "Always image-based" auto-derive from the export?** _Why:_ a high image-based % may signal
  **missing data, not policy.** **RESOLVED: NO — "always image-based" is OPERATOR-DESIGNATED for specific
  providers only; it is NOT statistically derived from the export.** Lives in **Phase 4a / ADR-0016**.
Answer: NO. Only specific providers will be set/labelled as always image based. 

- **Q-B5 · "Closest to accident" (helper #2b).** **RESOLVED: IMPLEMENT NOW as a suggestion-ORDERING signal
  only** (never an auto-select, so **ADR-0013 is not reopened**). Use an **accident location/postcode WHEN
  PRESENT** in the instruction (formats vary — opportunistic, best-effort), else fall back to **claimant
  home-address proximity** (a soft signal, not a guarantee — they may have been travelling). Needs two
  best-effort parser extractions + gated geocoding. Lives in **Phase 4a / ADR-0016** (with **ADR-0013**
  binding).
Answer: This may well be extractable from the initial instructions.

- **Q-B6 · Rank suggestions most-common / recency-weighted now, or defer?** **RESOLVED: do NOT defer —
  frequency + recency ranking is implemented NOW and surfaced in the Code App NOW** (not an M2
  fast-follow). Lives in **Phase 4a / ADR-0016**.
Answer: Do not defer. Implementing now.


## Phase 9 — Data governance, retention & erasure (ADR-0017 Proposed)

- **Q-G1 · Statutory retention period + lawful basis** (cases, `.eml`, images, PII). **RESOLVED: DEFERRED
  (Phase 9) — recorded as deferred-pending-operator** (business/legal input). Not active work. Lives in
  **Phase 9 / ADR-0017** under _Deferred (Phase 9)_.
Asnswer: Defer.

- **Q-G2 · Litigation / evidential hold.** _Why:_ engineer reports can be disputed years later — a
  minimisation expiry and an evidential-hold are **two competing clocks**, not one. **RESOLVED: DEFERRED
  (Phase 9) — recorded as deferred-pending-operator.** Not active work. Lives in **Phase 9 / ADR-0017**
  under _Deferred (Phase 9)_.
Answer: Defer

- **Q-G3 · ICO registration + DVLA data-use terms.** _Why:_ systematically processing third-party claimant
  PII + pulling DVLA data are hard compliance obligations, not footnotes. **RESOLVED: DEFERRED (Phase 9) —
  recorded as deferred-pending-operator.** Not active work. Lives in **Phase 9 / ADR-0017** under
  _Deferred (Phase 9)_.
Answer: Defer.

- **Q-G4 · DSAR erasure blind spot.** _Why:_ PII-adjacent identifiers live in **Box folder names,
  File-Request URLs and Outlook category strings** outside Dataverse — the one-way mirror doesn't cover
  them. **RESOLVED: DEFERRED (Phase 9) — recorded as deferred-pending-operator.** Not active work. Lives in
  **Phase 9 / ADR-0017** under _Deferred (Phase 9)_.
Answer: Defer.

- **Q-G5 · AI provider data-protection** for `EMAIL_AI` / Box-AI / Copilot / vision. **RESOLVED: the
  data-protection sign-off is DEFERRED, BUT the operator has FULL AUTHORITY for AI testing on all data in
  the repo** — this is an explicit enabler for the **Phase-8 LLM classifier** and **Phase-4a vision/geocode**
  work. (Note: G5 is the one Phase-9 item that is _not_ in the deferred-blocked list below — testing is
  unblocked; only the formal sign-off is deferred.) Lives in **Phase 9 / ADR-0017** + **Phase 8** /
  **Phase 4a**.
Answer: Defer. We have full authority for AI testing on all data provided in repo.

- **Q-G6 · KV purge-protection + Blob soft-delete/versioning before prod.** **RESOLVED: DEFERRED
  (Phase 9), with the design now defined and one principle promoted to law.** Definitions:
  **KV purge-protection** = blocks _permanent_ secret deletion during the soft-delete window (a deleted
  secret stays recoverable, not destroyed, until the retention window elapses); **Blob soft-delete +
  versioning** = recoverable deletes on the `evidence` container (deleted/overwritten bytes stay
  recoverable), and is the **hard pre-step before any purge is armed**. **EXPLICIT PRINCIPLE: NO AUTOMATED
  DELETION FROM BOX, EVER** — `box-blob-purge` only deletes _transient Azure Blob image bytes that are
  already archived to Box_; it never deletes anything in Box itself. Lives in **Phase 9 / ADR-0017** under
  _Deferred (Phase 9)_; the no-Box-deletion principle is also reflected in **ADR-0012**.
Answer: Define this in more detail. Consider it deferred as anything related to deleting data in box is strictly forbidden as an automated process.

- **Q-G7 · The `fullevaexportinspectionaddresses.xlsx` spreadsheet committed to git.** **RESOLVED: it STAYS
  git-tracked** — it is **critical corpus-building data** required in version control. It is **NOT** treated
  as a PII-in-git problem: do **not** move it to `raw/`, do **not** scrub it, do **not** rewrite history.
  (This reverses the earlier "move under `raw/`" recommendation.) Lives in **Phase 4a / ADR-0016** (it is the
  corpus source-of-truth).
Answer: No. This is critical corpus building data and is required to be git tracked.

- **Q-G8 · Staff least-privilege roles.** _Why:_ `roles-and-permissions.md` is planned but unbuilt — every
  user opens the live app with no role separation. **RESOLVED: three roles.** **User** (all case-intake
  actions) and **Admin** (settings + audit logs) are **built now** (authored offline, gated-OFF; operator
  assigns at activation). **Engineer is DEFERRED** — it is for future assessment functionality (carrying out
  assessments / further integrations), **out of current scope**. Lives in **Phase 9 / ADR-0017** +
  `roles-and-permissions.md`.
Answer: We need 3 roles essentially. User, Engineer, Admin. User - can perform any actions on case intake. Admin - access to settings and audit logs. Engineer - possible deferral. This would be for future further integrations where we may look to include functionality or systems for carrying out assessments. This is not within the current scope. 

### Deferred (Phase 9)

The following Phase-9 governance items are **deferred-pending-operator** — recorded, not active work
(**ADR-0017** holds the placeholder schema where one exists; the operator supplies the policy later):

- **Q-G1** — statutory retention period + lawful basis.
- **Q-G2** — litigation / evidential hold (minimisation expiry vs `legal-hold`).
- **Q-G3** — ICO registration + DVLA VES data-use terms.
- **Q-G4** — DSAR erasure blind spot (Box folder names, File-Request URLs, Outlook category strings).
- **Q-G6** — KV purge-protection + Blob soft-delete/versioning (definitions above; deferred), under the
  standing principle **NO AUTOMATED DELETION FROM BOX, EVER**.

(**Q-G5** is NOT in this list: the formal data-protection sign-off is deferred, but AI testing on repo data
is **unblocked** — see the G5 resolution above. **Q-G7** and **Q-G8** are resolved, not deferred.)


## Cross-cutting build / delivery

- **Q-X1 · CI for the offline gate.** _Why:_ `verify-all.mjs` is only ever run locally. **RESOLVED:
  LOCAL-only CI — NO GitHub Actions.** Add only checks that can be run locally, after agreeing what each
  check does. CD stays manual `[DEPLOY-WITH-LOGIN]`. Lives in **Phase 6** (cutover prerequisites) /
  DEPLOY-RUNBOOK.
Answer: Add any CI that can be ran LOCALLY (NOT github actions) after discussion on what these checks do.

- **Q-X2 · `verify-all.mjs` under-tests** — it runs pytest for only `parser` + `enrichment`; evavalidation,
  evasentry, box-webhook and `ocr/` never run yet are cited as gate-covered. **RESOLVED: widen the gate to
  discover all suites across `functions/*` + `ocr/`, but first define what each suite tests and agree
  implementations with the operator.** Lives in **Phase 6** (cutover prerequisites) / DEPLOY-RUNBOOK.
Answer: Define what these tests would entail and we will discuss implementations.


- **Q-X3 · ALM / environments + the EVA "test env" + why JSON drag-drop is the EVA path.** **RESOLVED on
  several points.** (1) **The EVA TEST ENVIRONMENT EXISTS** — credentials are in Infisical (it is not yet
  ideal). (2) **The real reason JSON drag-drop is the current EVA path is a VENDOR limitation, not merely an
  "M1 fallback":** Minotaur Software's Sentry API currently supports only **ONE principal code** for API
  submissions — it cannot route different work-provider codes, so REST would force every case under a single
  work provider. Minotaur is patching this; **no ETA**. **EVA REST stays gated pending that patch + a parity
  test.** (3) **Enrichment is SEPARATE from EVA:** enrichment (DVSA/DVLA) runs **at intake, pre-EVA** to
  obtain data, and is **LIVE in Dev** (gate ON since 06-21); EVA is the downstream system cases are passed to
  once requirements are met. "Replacing EVA" is a future, out-of-scope goal. (4) ALM: record a "production
  cutover prerequisites" note (managed export, Dev→Test→Prod, DLP groups) in **Phase 6**; do not stand up a
  blocking ALM phase for the spike. Lives in **Phase 6** + the EVA/integration docs + **ADR-0005**.
Answer: Enrichment and EVA are not the same. EVA is a system we pass the cases to once all requirements are met. Enrichment refers to tools that obtain data during the initial intake, before submitting to EVA. The ultimate end goal would be to replace EVA as per Q-G8 but this is not in scope at this time. The EVA "Test env" does exist. I have credentials for it, and these are included in infisical. This test env is not currently ideal, as Minotaur Software (EVA developers) have said we can only use one principal code for API calls currently. Their API lacks the functionality to use different codes. This presents an issue because we would be forced to submit everything as though it is one work provider. They are currently working on patching this but I have yet to receive an update. Due to this, we are using the fallback option of exporting to JSON for drag+drop functionality.

- **Q-X4 · Reconcile repo `intake.definition.json` to live.** _Clarification:_ this is **NOT "stuff isn't
  deployed"** — it is the opposite. The `Run_enrich` and `Run_case_resolve` action cards **ARE deployed and
  running LIVE**, but they are **MISSING from the repo definition** (the repo def TRAILS live). So a naive
  solution re-import _from_ the repo would **REGRESS live**. **RESOLVED: reconcile the repo def UP to live**
  (needs a live flow export — operator-assisted) + add a "reconcile repo flow defs to live before any
  export/import" step to **DEPLOY-RUNBOOK §8**. Lives in DEPLOY-RUNBOOK / **CURRENT_STATUS**.
Answer: This isn't an open question? This just means stuff isn't deployed, correct?


## Doc-hygiene ambiguities (resolve as part of the rewrite)

- **Q-H1 · Enrichment-flip date 06-20 vs 06-21** (inconsistent across docs). **RESOLVED: these are two
  distinct events — keep BOTH.** The enrichment **GATE-ON date is 06-21**; the **06-20** entries are the
  **WIRING** (an earlier, separate event). Do not collapse 06-20 into 06-21. Lives in **CURRENT_STATUS** /
  ROADMAP / [docs/gated.md](./gated.md).
Answer: agree 06-21

- **Q-H2 · Parser-502 "residual" — still occurring?** **RESOLVED: defined and FIXED — not a live blocker.**
  The issue: on **2026-06-19 16:49 UTC** an unreadable/corrupt instruction PDF escaped as an **unhandled
  502**. **Fixed 2026-06-19:** the handler now returns **422** for unreadable documents → routes to
  `needs_review` with **no retry**, guarded by the regression test **`test_unreadable_document_returns_422`**.
  Reframe any "residual / being fixed separately" wording to **"fixed 2026-06-19, regression-guarded."**
  Lives in **CURRENT_STATUS** + the parser docs.
Answer: Define this issue

- **Q-H3 · 37 over-length principal codes — still a blocker?** **RESOLVED: not a blocker; they are
  EVA-export NAME-ARTIFACTS, not real codes.** **Keep `cr1bd_principalcode` `maxLength=8`** (the schema is
  unchanged — fix any stale "widened 8→12" claim). Handling: **canonicalise only the 5 active recurring
  businesses** — `WHITELINE`, `BLACKLINE`, `SILVERLINE`, `PROACTIVE`, `WATERMANS`; **DEFER `SILVER 100`**
  (different/unclear Case/PO process); **reclassify the within-24-month individuals as VRM-keyed** (no code);
  **DISREGARD the 19 used >24 months ago.** Full list at
  [docs/reference/over-length-principal-codes.md](./reference/over-length-principal-codes.md). Lives in
  **CURRENT_STATUS** + that reference + the **Case/PO keying rule** below.
Answer: I never provided a specific maximum length for these codes - this was likely decided by Claude erroneously. Are there any implications to raising the length? Furthermore, 37 sounds like a lot. The majority of principal codes would be quite short (2-6 characters)


## New cross-cutting decisions (recorded 2026-06-24)

These were settled in the same review and are recorded here because they cut across several phases.

- **Case/PO keying rule (provider vs individual).** **RESOLVED:** **PROVIDER work** mints a Case/PO of
  `Principal` + `YY` + `NNN` (e.g. `CCPY26050`); an **INDIVIDUAL / private claimant** uses the **VRM as the
  Case/PO key** (no minted Principal code). This is cross-cutting: it governs **Case/PO generation**, the
  **ADR-0010 dedup** ladder, **Box folder naming**, and **Phase-4a provider mapping** (the `Case ID`-prefix
  parse and its VRM-shaped branch in **Q-B2**, and the individual reclassification in **Q-H3**).

- **EVA one-principal-code limit (vendor fact).** **RESOLVED / recorded:** Minotaur Software's Sentry API
  currently supports only **one principal code** per API submission and cannot route different work-provider
  codes. This is **why JSON drag-drop is the current EVA path** (not merely an "M1 fallback"); **EVA REST
  stays gated** pending Minotaur's patch (no ETA) + a parity test. See **Q-X3**; lives in the EVA/integration
  docs + **ADR-0005**.

