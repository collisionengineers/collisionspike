\# Email Tag/ID + Inbox-Management System — Plan



\## Context



Today the intake pipeline only knows how to do \*\*one\*\* thing with a mailbox: turn an

attachment-bearing instruction email into a Case. The live trigger guard

`fetchOnlyWithAttachment: true` (in \[intake.definition.json](flows/definitions/intake.definition.json))

literally \*\*drops every email that has no attachment\*\* — so queries, chasers, and cold enquiries

are invisible to the system. Its own header comment already flags this as "a TEMPORARY filter to be

removed when a full email-management/routing system lands." \*\*This plan is that system.\*\*



The goal: classify \*\*every\*\* email arriving at the 3 shared inboxes, deterministically and auditably,

into the operator's taxonomy — then route work to the existing Case chain and everything else to a

lightweight triage record + queue. An optional, gated LLM pass is deferred to a later phase.



\*\*Decisions locked with the operator (this session):\*\*

\- \*\*Data model\*\* → a \*\*new lightweight triage table\*\* (cost analysis below shows storage is

&#x20; negligible across all options at this volume; the table wins purely on data-model fit).

\- \*\*Engine\*\* → \*\*deterministic MVP first; LLM gated and deferred\*\* to a later phase.

\- \*\*Breadth\*\* → the operator's 4 quadrants, plus a plain \*\*"Other"\*\* catch-all tab for unidentified

&#x20; email (explicitly \*not\* a "noise/spam" classifier — anything without a work/query signal just lands

&#x20; in Other).



\## Taxonomy



Two stable, additive choicesets (never renumber — same discipline as `case-status.json` /

`audit-event.json`).



`cr1bd\_inboundcategory`: `receiving\_work` | `query` | `other`



`cr1bd\_inboundsubtype` (maps the brainstorm 1:1):



| subtype | operator's taxonomy |

|---|---|

| `existing\_provider\_instruction` | RECEIVING WORK · Type1(a) base instructions |

| `existing\_provider\_audit` | RECEIVING WORK · Type1(b) audit |

| `new\_client\_work` | RECEIVING WORK · Type2 new client |

| `query\_existing\_work` | QUERIES · Type1 (about work we did) |

| `query\_new\_enquiry` | QUERIES · Type2 (new enquiry) |

| `other` | unidentified — the catch-all bucket |



There is \*\*no\*\* separate noise/OOO classifier. Bounces, out-of-office, newsletters etc. simply fail

every work/query rule and fall through to `other` — exactly the "bucket for unidentified e-mails" the

operator asked for.



\## Signal → label mapping (reuse what already exists)



| Signal | Existing source to reuse |

|---|---|

| Sender domain → existing provider? | `Init\_senderDomain` + `Filter\_exact\_domain` in \[intake.definition.json](flows/definitions/intake.definition.json) / \[provider-match.definition.json](flows/definitions/provider-match.definition.json); corpus `cr1bd\_workproviders.knownEmailDomains` (38 domains in \[email-domains.csv](dataverse/.build/email-domains.csv)). ONE → existing provider, NONE → new client, AMBIGUOUS → existing-but-unassigned. |

| Has attachments / attachment kinds | V3 trigger `body/hasAttachments`; `Compose\_kind` in \[classify-persist.definition.json](flows/definitions/classify-persist.definition.json) (instruction = strong work signal). |

| Audit instruction? | `detect\_audit\_signals(text)` in \[engine.py](functions/parser/cedocumentmapper\_v2/rules/engine.py), already surfaced in the parser `audit:{value,signals,source}` envelope (\[function\_app.py](functions/parser/function\_app.py), \[parser\_adapter.py](functions/parser/parser\_adapter.py)) per ADR-0014. Distinguishes Type1(a) vs Type1(b). |

| Subject/body keywords | NEW phrase lists modelled on `\_AUDIT\_PHRASES` / `\_IMAGE\_BASED\_PHRASES` in engine.py. |

| Body-VRM / case-ref → an OPEN Case? | Reuse `VRM\_RE` from engine.py + a Dataverse lookup on `cr1bd\_cases` (same idiom as \[case-resolve.definition.json](flows/definitions/case-resolve.definition.json), ADR-0002). A body-mentioned VRM that hits an open Case with no instruction doc ⇒ "query about work we did". |



\*\*Decision tree (first match wins):\*\*

1\. Instruction doc present → `receiving\_work`; subtype = `existing\_provider\_audit` (parser

&#x20;  `audit.value`) | `existing\_provider\_instruction` (domain ONE) | `new\_client\_work` (else).

2\. Images only, provider known or work keyword → `receiving\_work`.

3\. No attachment, ≥2 work keywords + a body-VRM (typed-in-body instruction) → `receiving\_work`.

4\. Body VRM/ref resolves to an OPEN Case, no instruction doc → `query` / `query\_existing\_work`

&#x20;  (link to that Case, \*\*do not create one\*\*).

5\. Query keyword (quote/how much/enquiry/where is…), no open-case match → `query`

&#x20;  (`query\_existing\_work` if provider known, else `query\_new\_enquiry`).

6\. Anything else → `other`.



Every rule records the fired signals into the triage row + an Action-Log entry — same explainability

discipline as `detect\_audit\_signals`.



\## Data model — new triage table



\*\*`cr1bd\_inboundemail`\*\* (new `dataverse/schema/inbound-email.json`) — exactly one row per email (the

universal "we saw this" record); a WORK row then points at the Case the existing chain creates.



Key columns: `cr1bd\_sourcemessageid` (String, \*\*alternate key\*\* — dedup anchor, mirrors the Case key);

`cr1bd\_fromaddress`, `cr1bd\_senderdomain`, `cr1bd\_sourcemailbox`, `cr1bd\_receivedat`,

`cr1bd\_hasattachments`; `cr1bd\_category` + `cr1bd\_subtype` (the two choicesets);

`cr1bd\_classifiermode` (deterministic|llm|human); `cr1bd\_signals` (Memo — JSON of fired rules);

`cr1bd\_triagestate` (new|routed|actioned|dismissed); `cr1bd\_workproviderid` (Lookup → WorkProvider);

`cr1bd\_caseid` (Lookup → Case — set for work, or for the open Case a query is about);

`cr1bd\_bodypreview` (Memo, for the triage UI).



Why not the alternatives: extending \*\*Case\*\* pollutes every case tally/dedup/readiness check with

non-work rows and still can't represent a row that will never be a case; \*\*tags-only\*\* leaves no

queryable triage queue. The new table is the backbone of the "full inbox management" surface.



Authored offline, applied live by the operator: add the two choicesets to `dataverse/choicesets/`,

register IDs in \[optionset-ids.json](dataverse/.build/optionset-ids.json), add a numbered build step

`dataverse/.build/26-inbound-email.ps1` following the existing convention. The raw `.eml` bytes keep

going to \*\*Azure Blob\*\* via classify-persist (cheap) — Dataverse holds metadata only.



\## Cost analysis (operator-requested)



Researched against current (2026) Microsoft pricing. \*\*At \~1,000–3,000 emails/month, storage is a

rounding error and does not differentiate the options.\*\*



| Meter | Rate (2026) | At \~3,000/mo |

|---|---|---|

| Dataverse \*\*database\*\* | \~$40/GB-mo overage; \*\*0 within default entitlement\*\* (raised Dec-2025) | +1 row/email ≈ 2 KB → \~36k rows/yr ≈ 0.07 GB → \*\*$0\*\* |

| Dataverse file/log | $2 / $10 per GB-mo | n/a (bytes → Blob) / negligible audit |

| Per-row / per-table charge | \*\*none\*\* | $0 |

| Azure Blob (Hot, LRS) | \~$0.018/GB-mo + \~$0.05/10k writes | \~0.375 GB → \*\*\~$0.02/mo\*\* |

| Azure Functions FC1 | $0.40/M execs after \*\*250k free\*\*; GB-s after 100k free | 3,000 `/classify-email` → \*\*$0\*\* (free grant) |

| Power Automate requests | per-action; \*\*6,000/user/day seeded free\*\* | \~1,000/day → \*\*$0\*\* (under limit) |

| LLM (later, gated) — GPT-4o-mini | $0.15 in / $0.60 out per 1M | \~500 ambiguous/mo → \*\*\~$0.21/mo\*\* |

| LLM (later, gated) — Claude Haiku 4.5 | $1.00 in / $5.00 out per 1M | \~500/mo → \*\*\~$1.50/mo\*\* |



\*\*Bottom line:\*\* the only meters that actually move are (1) \*\*Power Automate run volume\*\* — firing on

\*every\* email vs attachment-only, which is a throttling/noise concern, \*\*not\*\* a cost one until \~6k

actions/day; and (2) the \*\*optional later LLM pass\*\* (\~$0.20–1.50/mo). Storage is identical (\~2¢/mo)

across new-table / extend-Case / tags-only. → \*\*Choose the new table on fit; cost is a non-issue.\*\*

(Extend-Case would actually generate the \*most\* Dataverse writes per email, so if any option stresses

the request entitlement it is that one, not the new table.)



\## Engine — deterministic MVP (Phase A), LLM deferred (Phase C)



\*\*Where it lives:\*\* a new \*\*`POST /classify-email`\*\* route in the parser Azure Function — \*not\* Power

Fx. The strongest signals are already Python in \[engine.py](functions/parser/cedocumentmapper\_v2/rules/engine.py)

(`detect\_audit\_signals`, `VRM\_RE`, the phrase tuples); re-deriving them in Power Fx would duplicate

and drift (see the vendored-divergence memo). Python is unit-testable; flow expressions are not. The

parser's connector/function-key path already exists — the second route reuses all of it.



\- New `cedocumentmapper\_v2/rules/email\_classifier.py` beside engine.py, importing `VRM\_RE` /

&#x20; `detect\_audit\_signals` and new `\_WORK\_KEYWORDS` / `\_QUERY\_KEYWORDS` tuples (same precision

&#x20; discipline). \*\*Edit the vendored copy under `functions/parser/` and reconcile the sibling\*\*

&#x20; per the vendored-divergence memo.

\- Pure function: request `{subject, body, from, sender\_domain, provider\_match\_state,

&#x20; attachment\_kinds\[], has\_attachments}` → response `{category, subtype, confidence, signals\[],

&#x20; body\_vrm, body\_caseref, contract\_version}`. No Dataverse, no network → trivially testable. The

&#x20; flow keeps the Dataverse open-Case lookup (rule 4) on its side, mirroring how `/parse` works.

\- HTML-strip the V3 body server-side for reliable keyword/VRM scanning; `body\_vrm` also closes the

&#x20; "instructions typed in the email body, no attachment" gap.



\*\*Phase C (deferred):\*\* new default-off env-var `cr1bd\_EMAIL\_AI\_ENABLED` (sibling to

`COPILOT\_ENABLED`); only `category=other`/low-confidence rows reach a gated `triage-llm` child

returning the same shape (`classifiermode=llm`); honour the existing per-provider

`cr1bd\_aiallowed` / `cr1bd\_providerautomationmode`. Runs behind a connector (Code App CSP forbids raw

fetch).



\## Flow change — triage-first, then route



Restructure \[intake.definition.json](flows/definitions/intake.definition.json) (and

`intake-shared-mailbox.definition.json`):

1\. Flip `fetchOnlyWithAttachment` → `false`; keep `concurrency:1`, `MinIntakeDate`.

2\. Generalise Message-ID dedup: today `Find\_existing\_by\_messageId` probes `cr1bd\_cases`; also probe

&#x20;  `cr1bd\_inboundemail` so a repeat \*query\* is dropped too (ADR-0010).

3\. Provider match — reuse the existing anchored domain logic verbatim.

4\. \*\*NEW `Run\_triage` child\*\* (`flows/definitions/triage-classify.definition.json`): always

&#x20;  create/update the `cr1bd\_inboundemail` row first, call `/classify-email`, do the open-Case VRM

&#x20;  lookup, return the label.

5\. \*\*Switch on category:\*\*

&#x20;  - `receiving\_work` → the \*\*existing chain unchanged\*\* (classify-persist → parse → Case/PO →

&#x20;    status-evaluate, plus live `Run\_case\_resolve`/`Run\_enrich`); write the Case id back to the

&#x20;    triage row; refine to `existing\_provider\_audit` + `A.` prefix once parser `audit.value` known.

&#x20;  - `query` → no Case; set `cr1bd\_caseid` to the matched open Case if `query\_existing\_work`; audit

&#x20;    `inbound\_query\_logged`; stop.

&#x20;  - `other` → audit `inbound\_other`, `triagestate=new`, stop (sits in the Other tab for a human).



\*\*Reconcile first:\*\* the live intake has `Run\_enrich`/`Run\_case\_resolve` that the repo def lacks

(intake-repo-trails-live memo) — reconcile before editing so the change re-imports cleanly.



\## Labelled corpus



Today \[test-cases-and-data/test-cases/](test-cases-and-data/test-cases) has 12 dirs, \*\*all

RECEIVING-WORK\*\* (incl. audit cases `A.PCH261269`, `A.PCH261272`). No query/enquiry/other examples.

Build in three tiers:

1\. \*\*Relabel existing\*\* — a `labels.json` manifest mapping each fixture → `{category, subtype}`.

2\. \*\*Synthetic for the gaps\*\* — author plain-text `.eml` fixtures under

&#x20;  `test-cases-and-data/triage-corpus/<subtype>/`: a "where is my report for ABC123" query, a "can

&#x20;  you quote to inspect a write-off" enquiry, an unknown-domain instruction (new\_client\_work), an

&#x20;  OOO auto-reply + a bounce (→ should land in `other`). Exercise the body-only path.

3\. \*\*Gather real mail `\[RESERVED-FOR-USER]`\*\* — operator exports PII-scrubbed query/enquiry `.eml`/

&#x20;  `.msg` from the live inboxes (Claude cannot read live mail). Precision can only be trusted once

&#x20;  these land.



Wire the corpus into `functions/parser/tests/` parametrised over the manifest, so

`email\_classifier.py` has regression coverage from day one.



\## Box's role (honest)



Box is \*\*dormant\*\* (all `BOX\_\*` gates false; CCG connector authored-offline; free test account can't

do CCG/File-Requests). Keep triage \*\*off\*\* the Box critical path — every `.eml` already goes to Azure

Blob. Keep the labelled corpus \*\*in-repo\*\* for now. A future, gated `BOX\_QUERY\_ARCHIVE\_ENABLED`

(queries → a `Queries/<year>` folder) is \*\*deferred, not built now\*\*. Dataverse stays authoritative

(ADR-0012).



\## Phasing



\- \*\*Phase A — Deterministic MVP (no UI/LLM/Box).\*\* `email\_classifier.py` + `/classify-email` with

&#x20; corpus tests; `cr1bd\_inboundemail` table + 2 choicesets + audit actions; `triage-classify` child;

&#x20; restructure intake (flip trigger, generalise dedup, insert triage + Switch). \*\*Soft rollout: one

&#x20; inbox first, watch run volume.\*\* Exit: every email → a triage row + audit; work still flows to

&#x20; Cases unchanged.

\- \*\*Phase B — Query queue + Code App "Inbox / Triage" screen.\*\* List `cr1bd\_inboundemail` faceted by

&#x20; category/subtype with an \*\*Other\*\* tab; query rows show body preview + open-`.eml` + link/convert-

&#x20; to-Case; reclassify via the Dataverse-trigger-flag pattern (CSP-safe).

\- \*\*Phase C — LLM assist (gated).\*\* `EMAIL\_AI\_ENABLED` + `triage-llm` child for `other`/low-confidence

&#x20; only; honour per-provider AI flags.



\## Files to create / modify



\*\*Create:\*\* `functions/parser/cedocumentmapper\_v2/rules/email\_classifier.py` (+ sibling copy);

`flows/definitions/triage-classify.definition.json`; `dataverse/schema/inbound-email.json`;

`dataverse/choicesets/inbound-email-classification.json`; `dataverse/.build/26-inbound-email.ps1`;

`test-cases-and-data/triage-corpus/<subtype>/\*.eml` + `labels.json`;

`docs/adr/0015-email-triage-inbox-management.md`; `docs/plans/phase-8-inbox-management/README.md`.



\*\*Modify:\*\* \[intake.definition.json](flows/definitions/intake.definition.json) (+

`intake-shared-mailbox.definition.json`) — flip trigger, generalise dedup, insert triage child +

Switch + case-id write-back (reconcile live `Run\_enrich`/`Run\_case\_resolve` first);

\[function\_app.py](functions/parser/function\_app.py) — add `/classify-email`;

\[engine.py](functions/parser/cedocumentmapper\_v2/rules/engine.py) (+ sibling) — export reusable

`VRM\_RE` / phrase tuples; \[environment-variables.json](dataverse/environment-variables.json) — add

`cr1bd\_EMAIL\_AI\_ENABLED` (Phase C).



\## Verification



\- \*\*Unit:\*\* `pytest functions/parser/tests/` — new `test\_email\_classifier.py` parametrised over the

&#x20; corpus manifest; assert each fixture → expected `{category, subtype}`, and zero work/query false

&#x20; positives on the `other` fixtures (mirror `test\_audit\_detection.py`). Keep vendored+sibling in sync

&#x20; (`test\_engine\_vendored\_in\_sync`).

\- \*\*Function locally:\*\* `func start` in `functions/parser`, POST sample bodies to `/classify-email`,

&#x20; confirm the envelope + fired signals.

\- \*\*Flow (Dev):\*\* with the trigger flipped on \*\*one\*\* inbox, send (a) an attachment instruction,

&#x20; (b) a body-only "where is my report for <VRM>" against a known open Case, (c) a cold enquiry,

&#x20; (d) an OOO auto-reply. Confirm: a `cr1bd\_inboundemail` row for each; (a) creates/links a Case,

&#x20; (b) links the open Case with no new Case, (c) `query\_new\_enquiry`, (d) `other`; one Action-Log

&#x20; entry each; a repeat send is dedup-dropped.

\- \*\*Cost guard:\*\* watch the Power Platform request count on the soft-rollout inbox for a day to

&#x20; confirm headroom under the 6,000/day seeded limit before enabling the other two inboxes.



\## Risks / open items



1\. \*\*Trigger flip = volume risk\*\* — removing the attachment filter exposes the flow to all inbox

&#x20;  traffic; mitigate with single-inbox soft rollout + run-count monitoring. (Biggest operational

&#x20;  risk; storage cost is not.)

2\. \*\*Body fidelity\*\* — forwarded chains/signatures cause false VRM/keyword hits → bias to

&#x20;  "abstain → Other" over a wrong WORK label.

3\. \*\*"Audit" terminology overload\*\* (audit \*log\* vs ADR-0014 audit \*case-type\* vs this audit

&#x20;  \*subtype\*) — name new log actions `inbound\_\*`; confirm via `grill-with-docs`.

4\. \*\*Corpus mostly synthetic at first\*\* — real-mail gathering is `\[RESERVED-FOR-USER]`.

5\. \*\*Vendored parser divergence\*\* — add `email\_classifier.py` to the vendored copy and reconcile the

&#x20;  sibling.

