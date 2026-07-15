# Review 190626 — action checklist

Status meanings: `done` means implemented with recorded evidence; `pending` means operator or live proof
is still required. Current tickets and the live registry, not this dated checklist, hold changing state.

## 1a — binding-review convention

Requirements:

- Dated operator reviews outrank older plans, ADRs, documents and code for the surfaces they cover.
- A later review is the only review-level supersession mechanism.
- Requirements must be transcribed into self-contained text and tracked to completion.

State: **done**. The convention is defined in `docs/reviews/README.md` and linked from current agent
guidance.

## 1b — broad product checks

Requirements:

- EVA required fields must match both the external contract and Collision Engineers' process.
- Remove decorative red bars that do not communicate state.
- Keep vehicle enrichment, image/document reading, postcode lookup, AI assistance and document parsing
  status honest and testable.

State: **done for the documented requirements**. Current availability and live gates belong only in
`LIVE_FACTS.json` and `docs/operations/live-environment.md`.

## 2 — dashboard

Requirements:

- Do not duplicate pipeline and work-now counts.
- Collapse parsing/submission mechanics into handler-recognisable work states.
- Every case ready to send must first be reviewed unless an explicitly approved provider policy says
  otherwise.
- Use one logo treatment, prevent navigation clipping and remove implementation copy.

State: **done**, subject to later dashboard decisions in `010726/decisions.md` and
`020726/decisions.md`.

## 3 — navigation

Requirements:

- Name provider administration **Provider settings** and audit history **Action logs**.
- Present case work through one first-class queue surface with useful queue tabs.
- Provide a separate Add evidence path that links material to an existing case.
- Do not keep a dedicated Done today page when the same outcome is available in dashboard/history.

State: **done**.

## 4 — manual case intake

Requirements:

- Support drag-and-drop, multiple files and a fully manual route.
- Remove implementation explanations and decorative AI-like parse iconography.
- Derive case type from the material held; staff do not choose it directly.
- Keep VRM, Case/PO and provider reference distinct.
- Capture both work provider and principal.
- Use plain source wording; do not expose internal provenance terminology.
- Normalise inspection addresses and allow vehicle-detail/mileage lookup when available.
- Label Date of loss as **Date of incident**.
- Enforce the agreed EVA required fields and keep VAT manual unless a proven source exists.

State: **done for the product behavior**. Later readiness and inbox decisions remain authoritative.

## 5a — case workspace

Requirements:

- Reduce text noise and name imported material by its recognisable source.
- Add evidence through the real intake surface.
- Offer the EVA export only when readiness passes.
- Use `*` or **Required** rather than repeated error prose.
- Keep inspection-address choices concise.
- Make chasers minimal, record **Log as chased**, and derive held state from facts.
- Never expose ADR or internal execution language in the UI.
- Present one canonical missing-image/readiness signal.

State: **done**, with later case-workspace reviews taking precedence.

## 5b — queues

Requirements:

- Provider filters show providers represented in the active queue.
- Status filters appear only where a queue spans multiple statuses.
- Define Needs action around actual chase or missing-information facts.
- Show EVA export only for ready cases.
- Route insufficient incoming material to an exceptions/attention surface instead of creating an
  invalid case.

State: **done**, with later queue rulings taking precedence.

## 6 — provider settings

Requirements:

- Show active/archive state and an honest last-used value.
- Replace placeholder corpora with useful current reference-data summaries.
- Use plain language for assisted import and clearly state unavailable actions.
- Provider editing must be functional or explicitly unavailable; it must not look like a broken form.

State: **done**.
