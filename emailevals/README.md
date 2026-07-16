# emailevals

Dataset of real Collision Engineers (CE) emails, organized by category for **evaluation
purposes**. Emails are sorted in small chunks by an AI agent and then human-reviewed for
correctness. Each batch produces a work-log that records every classification and the agent's
reasoning, so a reviewer can confirm or correct it.

CE is a UK vehicle-damage engineering assessment firm; the emails are the inbound and outbound
traffic around insurance/accident cases (instructions, images, queries, reports, billing, and the
automated machinery around them).

## Repository layout

```
to-sort/                     unsorted pool of .eml awaiting classification
  loaded-for-sorting/        the ACTIVE batch — the agent only ever sorts what is staged here
received/  sent/  internal/  the category tree (emails land in leaf folders)
work-logs/                   one task-{N}.md per batch — the review/audit trail
AGENTS.md                    operating instructions for the sorting agent
README.md                    this file
```

Empty folders carry a `.gitkeep` so the structure is preserved in git.

## How sorting works

1. A chunk of `.eml` is staged into `to-sort/loaded-for-sorting/`.
2. The agent reads each email from disk, classifies it, and `git mv`s it into exactly one leaf
   folder — or, if nothing fits, leaves it in place and flags it.
3. The agent writes `work-logs/task-{N}.md`: filename, verbatim content, where it was sorted, why,
   and a blank correction slot for the human reviewer.
4. A human reviews the work-log and adjusts anything mis-sorted; unclassified items come with a
   suggested new category for the human to accept or reject.

The agent never invents a category or creates a folder — growing the taxonomy is always a human
decision. Full rules are in [`AGENTS.md`](./AGENTS.md).

## The taxonomy

Three top-level areas by **direction**: `received/` (CE is the recipient), `sent/` (CE is the
sender), `internal/` (company-internal mail). Where a leaf corresponds to a category/subtype in the
live `collisionspike` classifier, that is noted in `(parens)`.

### `received/`

```
new-work-received/            a formal instruction / new case  (receiving_work)
  audatex                       instruction via the Audatex channel
  audit/inspectionandaudit      audit an existing engineer's report  (existing_provider_audit)
  diminution                    diminution-in-value engagement  (existing_provider_diminution)
  inspection                    standard inspection instruction
  new-client                    first-time / unknown provider  (new_client_work)
  website-work                  work arriving via the CE website  (website_enquiry)
  acknowledgement autoreply     meta-genres for this stage (see below)
  out-of-office undeliverable
pre-instruction-emails/        activity before a case exists  (pre_instruction)
  triage                        "assess before we formally instruct" — hold, do not case
  pre-instruction-info          directions about a future known instruction
  images-received               images arriving pre-instruction
  acknowledgement autoreply     meta-genres for this stage
  out-of-office undeliverable
in-progress-cases/             an open case, report not yet delivered
  cancellation                  case called off  (cancellation_notice)
  case-update/
    additional-info-received    new information on the case  (update_general)
    case-images-received        additional images on the case  (images_received)
  client-chasing-for-update/
    report-chase                provider chasing an as-yet-uncompleted report
  acknowledgement autoreply     meta-genres for this stage
  out-of-office undeliverable
post-report-emails/            the report has been delivered (hard stage boundary)
  amendment-request             correction to a delivered report  (report_amendment)
  dispute/pav-dispute           dispute over pre-accident value
  dispute/third-party-insurer-dispute
  query                         post-report question  (query_existing_work)
  report-chase                  report was sent but chased again ("not received")
  acknowledgement autoreply     meta-genres for this stage
  out-of-office undeliverable
billing/                       client-side billing  (billing)
  invoice-request-from-provider asking for CE's invoice/fee  (billing_request)
  payment-received-email        confirmation a payment was received
  remittance                    a payment made/coming notice  (payment_remittance)
non-client-related/            tooling/tenant mail, sorted BY SENDER/TOOL (not by genre)
  box-internal  claude  m365    one base folder per tool; a supplier bill → that tool's folder
automatic/                     FALLBACK for un-attributable meta-genres
  autoreply  out-of-office
undeliverable/                 FALLBACK bounce/NDR that can't be tied to a case
acknowledgement/               FALLBACK acknowledgement that can't be tied to a case
```

**Meta-genres** (`acknowledgement`, `autoreply`, `out-of-office`, `undeliverable`) are received
mail — automated or brief responses that land in our inbox, usually triggered by something CE
sent. Each is filed under the **received stage folder of the case it references**; if it can't be
tied to a case, it goes to the flat fallback (`automatic/`, `undeliverable/`, `acknowledgement/`)
at the `received/` root.

### `sent/` (outbound only)

```
report-sent                   CE's finished engineer's report going out
query-sent/additional-info-request   CE asking the provider for more information
additional-image-request      images WERE received but insufficient → ask for better/more
image-chase                   NO images received yet → initial prompt to the repairer/source
case-rejected                 CE declining an instruction (distinct from a provider cancellation)
```

`additional-image-request` vs `image-chase` is a clean split — the test is simply *were any images
received?*

### `internal/`

Company-internal mail (between staff, or from tools where the traffic is genuinely internal).

## Replies

Replies are classified **per-message on their own content** — a reply does not inherit the folder
of the message it answers (a reply to an instruction can itself be a query or cancellation). A
reply is filed into whatever category it earns, with its filename prefixed `[reply] `.

## Domain glossary

Shared vocabulary (from `collisionspike/CONTEXT.md`) so reviewers read emails the same way:

- **Work Provider** — the org that sends CE a case: insurer, solicitor, accident-management company,
  or trade source. (The preferred term; "client/customer" is avoided.)
- **Repairer** — garage/bodyshop; often holds the vehicle and the images.
- **Image Source** — whoever actually supplies images/instructions (the provider, a repairer, or a
  named intermediary).
- **Claimant / Insured** — the vehicle owner/driver.
- **Our Ref / Your Ref / VRM** — CE's case reference / the provider's reference / the vehicle
  registration mark. VRM is the primary key that ties emails to a case.
- **Instruction** — a formal request to assess a vehicle; mints a case.
- **Audit / Audit Total Loss / Diminution** — case types: auditing another engineer's report; an
  audit where the vehicle is a write-off; a diminution-in-value assessment. (Total-loss vs
  repairable audits are usually indistinguishable from the email alone.)
- **EVA** — the downstream system CE submits completed case data to.
- **Chaser** — a request CE sends for a missing item (images, info, or fee).
- **Report delivered** — CE's report has been sent to the provider; this is the hard boundary
  between `in-progress-cases` and `post-report-emails`.

## Reading emails

Emails are read directly from the `.eml` files on disk (Python `email` stdlib — see `AGENTS.md`).
No Outlook/M365 connector is required; its consent is currently expired.
