# emailevals — AGENTS.md + README.md for the email-classification dataset

## Context

`collisionsuite/emailevals/` is a dataset of real Collision Engineers `.eml` files being
sorted into a category taxonomy so that an AI agent's classifications can be human-reviewed
for correctness. There are **130 unsorted `.eml` in `to-sort/`** plus **8 staged in
`to-sort/loaded-for-sorting/`** (the active batch). The category folder tree already exists
but has **no AGENTS.md, no README.md, and no work-logs** — nothing tells a sorting agent how
to read an email, which folder rules to apply, or how to record its work.

The taxonomy was cross-checked against the live `collisionspike` inbound-email classifier
(`packages/domain/src/dto/index.ts`, `contracts/case-status.ts`,
`functions/parser/cedocumentmapper_v2/rules/email_classifier.py`), which solves the same
problem in production with 9 categories / 16 subtypes hardened over ~20 real misclassification
tickets. That vocabulary is the authority the docs cite.

## Amendments applied (this revision)

This plan reflects the operator's corrections:

1. **`general/` is dissolved** — its meta-genres (acknowledgement, autoreply, out-of-office,
   undeliverable) are **dispersed** across the tree.
2. **`internal/` moves to the top level** (sibling of `received/` and `sent/`), absorbing the
   former `general/internal`. Genuinely internal mail lands here.
   **No `incidental-ccs` bucket** — being CC'd is a delivery detail, not a category; a CC'd email
   still earns a normal category by its content (a case thread → its received stage folder;
   internal mail → `internal/`).
3. **`sent/image-chase` vs `sent/additional-image-request` is NOT an overlap** — clean split.
4. **`sent/case-rejected` to be added** (CE declining an instruction).
5. **`in-progress-cases` vs `post-report-emails` is a hard boundary** at report delivery.
6. **No `billing` subfolder under `non-client-related`** — non-client mail is sorted by
   sender/tool into a base-named folder.
7. **Meta-genres are RECEIVED, not sent** — an autoreply, out-of-office, undeliverable/NDR, or an
   inbound acknowledgement all arrive in our inbox. They are dispersed on the **received** side,
   under the case-stage folder each message references, with a flat received-side fallback for
   messages that can't be tied to a case. (Sent subfolders therefore carry only our outbound
   types — no meta-genre leaves.)
8. **The agent never invents a category.** If nothing in the existing taxonomy fits, it leaves the
   `.eml` where it is (in `loaded-for-sorting/`), records the email in the work-log with why it
   can't be classified, and **suggests a category to add**. Only a human adds folders — there is no
   agent-side "create-if-needed."

## Dispersal map — where each former `general/` leaf goes

Each meta-genre is filed under the received case-stage folder the message references (identified
from the VRM / Our-Ref / quoted text). Multiple copies of a leaf therefore exist across stages.
When a message can't be attributed to a case, it goes to the flat received-side fallback.

| Meta-genre | Dispersed to (a copy under each referenced stage) | Fallback (un-attributable) |
|---|---|---|
| `autoreply` | `received/new-work-received/`, `received/pre-instruction-emails/`, `received/in-progress-cases/`, `received/post-report-emails/` | `received/automatic/autoreply/` |
| `out-of-office` | (same received stage folders) | `received/automatic/out-of-office/` |
| `undeliverable` | (same received stage folders) | `received/undeliverable/` |
| `acknowledgement` | the received stage folder it acknowledges (`new-work-received/`, `in-progress-cases/`, `post-report-emails/`) | `received/acknowledgement/` |

CCs are **not** a meta-genre — being CC'd is a delivery detail. A CC'd email is classified by its
content into a normal category (case thread → its received stage folder; internal mail →
`internal/`). There is no `external-cc`/`internal-cc` leaf.

Direction note: these meta-genres are received because they land in our inbox. They are *triggered
by* our outbound (a report/query/chase we sent), but "responds to our outbound" ≠ "is outbound," so
they stay on the received side — filed under the stage of the case they reference.

## Decisions locked (from clarifying questions)

- **Replies:** classified **per-message** on their own content, moved into whichever category they
  earn, filename prefixed `[reply] `. A reply is *not* glued to its thread's opening folder.
- **Reading:** parse the `.eml` **from disk** with Python's `email` stdlib (validated working). No
  Outlook/M365 connector — its consent is expired (there is a `consent request … has expired.eml`
  in `to-sort` as proof).
- **Meta-genre dispersal:** by referenced case-stage (received side), flat received-side fallback.
- **Scope:** author `AGENTS.md` + `README.md`, plus the folder restructuring the amendments imply.
  No `.eml` are moved this session; the first real sorting batch runs later, governed by these docs.

## Target folder tree (post-amendment)

```
received/
  new-work-received/    {audatex, audit/inspectionandaudit, diminution, inspection,
                         new-client, website-work,
                         acknowledgement, autoreply, out-of-office, undeliverable}
  pre-instruction-emails/  {triage, pre-instruction-info, images-received}
  in-progress-cases/    {cancellation,
                         case-update/{additional-info-received, case-images-received},
                         client-chasing-for-update/report-chase,
                         acknowledgement, autoreply, out-of-office, undeliverable}
  post-report-emails/   {amendment-request, dispute/{pav-dispute, third-party-insurer-dispute},
                         query, report-chase,                         <- report-chase NEW
                         acknowledgement, autoreply, out-of-office, undeliverable}
  billing/              {invoice-request-from-provider, payment-received-email, remittance}
  non-client-related/   {box-internal, claude, m365}   <- by sender/tool; no genre subfolders;
                                                           new tool = new base folder; billing dropped
  automatic/            {autoreply, out-of-office}      <- FALLBACK for un-attributable
  undeliverable/                                        <- FALLBACK
  acknowledgement/                                      <- FALLBACK
sent/
  report-sent/          (outbound only — no meta-genre leaves)
  query-sent/           {additional-info-request}
  additional-image-request/
  image-chase/
  case-rejected/        <- NEW
internal/               <- moved to TOP LEVEL; absorbs former general/internal
```
(`general/` no longer exists; everything under it has been dispersed above.)

## Deliverable 1 — `emailevals/AGENTS.md`

Operating manual for the sorting agent. Sections:

1. **Mission** — sort `.eml` from `to-sort/loaded-for-sorting/` into the category tree; every email
   gets exactly one category; correctness is human-reviewed via work-logs.
2. **Batch protocol**
   - Only sort files currently in `to-sort/loaded-for-sorting/`; do not reach into `to-sort/` root.
     "Small chunks" = whatever is staged there (currently 8).
   - Per file: read → classify → `git mv` into the destination folder → record in the work-log.
     Moving is the action (the file leaves `loaded-for-sorting/`).
3. **How to read an email** — validated helper (sender, subject, plain-text body; fall back to
   HTML→text; strip signatures/quoted trailers when transcribing):
   ```python
   import email; from email import policy
   m = email.message_from_binary_file(open(PATH,'rb'), policy=policy.default)
   sender, subject = m['from'], m['subject']
   body = m.get_body(preferencelist=('plain','html'))
   text = body.get_content() if body else ''
   attachments = [p.get_filename() for p in m.iter_attachments()]
   ```
   - **Attachment caveat:** many instructions carry their substance in an attached PDF and leave
     the body a bare signature (verified on the David Oxley instruction). When the body is
     signature-only, classify from **subject + attachment name(s)** and say so in the work-log.
4. **Classification decision rules**
   - **Direction first** — is CE the recipient (→ `received/`), the sender (→ `sent/`), or is this
     purely internal (→ `internal/`)?
   - **new-work-received vs pre-instruction-emails** — is a *formal instruction* present (→ new-work),
     or directions/triage/images *before* a case exists (→ pre-instruction)? `triage` =
     assess-before-we-instruct (hold, don't case); `pre-instruction-info` = directions about a future
     known instruction; `images-received` = images landing pre-instruction.
   - **in-progress-cases vs post-report-emails — HARD boundary at report delivery.** A report is sent
     the moment it is completed, so the case stage flips cleanly when the report goes out. Any case
     email pre-dating report delivery → `in-progress-cases`; any post-dating it → `post-report-emails`.
     - "clarify X in the report" / dispute / amendment ⇒ a report exists ⇒ **post-report** (the case
       is not in progress once the report is out).
     - "where is my report" ⇒ the report has normally already been sent ⇒
       **`post-report-emails/report-chase`**; the mirror `in-progress-cases/client-chasing-for-update/
       report-chase` exists only when the report genuinely hasn't been completed/sent yet. The
       duplicate `report-chase` in both stages is a deliberate safety net for "sent but not received."
   - **billing three-way (client)** — `remittance` (payment made/coming), `payment-received-email`
     (receipt confirmation), `invoice-request-from-provider` (asking for CE's invoice/fee).
   - **non-client-related — sort by sender/tool, not genre.** All Microsoft/M365 → `m365`; Claude/
     Anthropic → `claude`; Box → `box-internal`. No genre subfolders here — a supplier bill from a
     tool goes to that tool's base folder. If a new tool/vendor has no matching folder, do **not**
     create one — leave the email and suggest the folder in the work-log (see unclassified rule).
   - **cancellation** — provider calling a case off (any stage) → `in-progress-cases/cancellation`;
     beware forwarded cancellations with the original instruction PDF still attached — do **not** file
     as new work.
   - **sent image folders (clean split, not an overlap):**
     - `image-chase` — chasing images that have **not been received yet** (initial prompt to a
       repairer/source who has sent nothing).
     - `additional-image-request` — images **have** been received but are **insufficient** (wrong
       angle, blurry, missing damage/plate); requesting better/more.
   - **case-rejected** — CE **declining an instruction** (our outbound). Distinct from a provider
     cancellation (their inbound) and from a query.
   - **Meta-genres are RECEIVED and dispersed by referenced case-stage** — an `autoreply` /
     `out-of-office` / `undeliverable` / (inbound) `acknowledgement` is filed under the received
     case-stage folder of the case it references (found via VRM / Our-Ref / quoted subject). If it
     can't be attributed to a case, use the flat received-side fallback (`received/automatic/…`,
     `received/undeliverable`, `received/acknowledgement`). Use the dispersal map.
   - **CCs are not a category** — being CC'd is a delivery detail. Classify a CC'd email by its
     content: a case thread → its received stage folder; internal mail → `internal/`.
   - **Ambiguity rule** — if two folders are defensible, pick the more conservative and record the
     alternative in the correction field.
   - **Cannot-classify rule** — if the agent believes *no* existing category fits, it must **not
     invent one**. Leave the `.eml` in `loaded-for-sorting/`, and in the work-log record it as
     unclassified, explain why nothing fits, and **suggest a category to add**. A human decides
     whether to grow the taxonomy.
5. **Reply handling** — per-message; classify on the reply's own content; prefix filename
   `[reply] `; keep the rest of the original filename.
6. **Work-log requirement** — every batch writes `work-logs/task-{N}.md` (format below); N = next
   integer after the highest existing `task-*.md`.
7. **Guardrails** — never delete an `.eml` (only move); never edit email contents; never invent a
   category or create a folder. If nothing fits, leave the file in `loaded-for-sorting/`, log why,
   and suggest a category to add (cannot-classify rule).

## Deliverable 2 — `emailevals/README.md`

Human-facing overview. Sections:

1. **Purpose** — "Dataset of emails for evaluation, organized by category. Sorted in small chunks by
   an AI agent and human-reviewed for correctness."
2. **Layout** — `to-sort/` (unsorted pool) → `to-sort/loaded-for-sorting/` (active batch) → category
   tree (`received/ · sent/ · internal/`) → `work-logs/` (audit trail per batch).
3. **The full taxonomy tree** (the target tree above), annotated with a one-line definition per leaf
   and the collisionspike category/subtype it corresponds to. Documents the dispersed meta-genre
   leaves + fallback, and the two image-folder definitions.
4. **How sorting works** — the batch protocol in prose; points to AGENTS.md for agent rules.
5. **Domain glossary** — Work Provider, Repairer, Image Source, Claimant, Our Ref / Your Ref / VRM,
   instruction, audit / audit-total-loss / diminution, EVA, chaser, report delivered — short
   definitions from collisionspike's CONTEXT.md so reviewers share vocabulary.
6. **Connector note** — reading is from `.eml` on disk; the M365/Outlook connector is not required and
   its consent is currently expired.

## Work-log format (`work-logs/task-{N}.md`)

Structured list; one entry per email in the batch:

```markdown
# task-{N} — sorted {count} emails ({unclassified} left unclassified)

## 1. `<exact filename>`
- **From:** <sender>
- **Content:** <exact message text, sender's words only — no signature, no quoted
  trailer, no MIME boilerplate; note if substance is in a named attachment>
- **Sorted to:** `<destination folder path>`
- **Why:** <agent's reasoning: which rule/signal drove the category>
- **Correction:** <blank for human reviewer; agent fills only if directed>
```

For an email the agent **cannot** classify, the file stays in `loaded-for-sorting/` and its entry
uses the unclassified form instead:

```markdown
## 2. `<exact filename>`  — UNCLASSIFIED (left in loaded-for-sorting/)
- **From:** <sender>
- **Content:** <exact message text as above>
- **Why unclassifiable:** <what the email is, and why no existing category fits>
- **Suggested category to add:** `<proposed folder path>` — <one-line definition/justification>
- **Correction:** <blank for human reviewer>
```

## Critical files & structural changes

- **Create docs:** `emailevals/AGENTS.md`, `emailevals/README.md`
- **Restructure folders** (implementation step, not yet executed):
  - Move `general/internal` → top-level `internal/`. Drop the `general/incidental-ccs` tree (CCs
    are classified by content, not as a bucket).
  - Disperse `acknowledgement` / `autoreply` / `out-of-office` / `undeliverable` as leaves under the
    received stage parents (`new-work-received`, `in-progress-cases`, `post-report-emails`), plus the
    flat fallbacks `received/automatic/{autoreply,out-of-office}`, `received/undeliverable`,
    `received/acknowledgement`.
  - Add `received/post-report-emails/report-chase`.
  - Add `sent/case-rejected`.
  - Remove `received/non-client-related/billing`.
  - Remove the now-empty `general/` tree once its leaves are dispersed.
- **Reference (do not modify):** `active/collisionspike/packages/domain/src/dto/index.ts`
  (categories/subtypes), `.../contracts/case-status.ts` (lifecycle),
  `.../functions/parser/cedocumentmapper_v2/rules/email_classifier.py` (live rules),
  `collisionspike/CONTEXT.md` (glossary).

## Verification

Docs + folder-restructure change, so verification is a review pass plus a structure check:

1. **Coverage check** — for each of the 8 `loaded-for-sorting/` emails, confirm AGENTS.md's rules
   point to exactly one existing folder (dry-run on paper; no files moved). If any email has no home,
   surface the gap before finalizing.
2. **Helper check** — re-confirm the Python extractor yields sender/subject/body on 2–3 more varied
   `.eml` (an auto-reply, a billing remittance).
3. **Dispersal check** — confirm every meta-genre named in AGENTS.md has a real destination leaf (both
   the per-stage copies and the fallbacks), and no `general/` reference survives.
4. **Round-trip check** — the work-log template captures everything a reviewer needs to overturn a
   decision.
5. **No stray edits** — `git status` shows only the intended new markdown + folder changes under
   `emailevals/`.

## Out of scope (this session)

Moving any `.eml`; running the first batch; renewing the M365 connector; subdividing `internal/`.
