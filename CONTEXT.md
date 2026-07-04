# Collision Spike — Domain Language

Glossary for the Collision Engineers case-intake spike. Opinionated canonical terms; weaker
alternatives are listed under _Avoid_. This file is a **glossary only** — no implementation details
(those live in `docs/`). Built incrementally during grilling sessions.

## Language

**Work Provider**:
The organisation that sends Collision Engineers a case to assess (insurer, solicitor,
accident-management company, or direct trade source). Shorthand: "Provider".
_Avoid_: Solicitor, Insurer, Client, Customer, Account

**Principal Code**:
The short internal code identifying a Work Provider, used to build the Case/PO. **One code, two
case-renderings of the same characters:** **lowercase in EVA** (EVA Code, EVA case reference) and
**UPPERCASE in Box** (Box Code, Box folder). EVA Code and Box Code are the same value, not separate
identifiers.
_Avoid_: treating EVA Code and Box Code as different values

**Case**:
A single assessment work item for one damaged vehicle. Assembled from an instruction + evidence that
may arrive separately (correlated by **VRM** into the one open case), then progressed through review
to **EVA** submission and **Box** archival.
_Avoid_: Job, Claim, Instruction (the instruction is one input to a Case)

**Case/PO**:
The case reference: principal code + 2-digit year + 3-digit per-provider sequence, in two
case-renderings of the same characters — **EVA (lowercase)** e.g. `test26001`, **Box (UPPERCASE)**
e.g. `TEST26001`. **Generated at parse-confirm** for instructions cases (the live `intake` flow's
`Scope_generate_casepo`), so it exists well before EVA submit. Under the **Phase-7 Box pivot
(ADR-0012)** the **UPPERCASE Box folder is minted then** (`box-folder-create` at parse-confirm), and
`finalize-eva-box` later *augments* that folder rather than creating it — Box is no longer first
created in unison with EVA submission. (Auto-sequencing of the per-provider number is deferred.)
_Avoid_: Case number, PO number

**Repairer**:
A garage / bodyshop that repairs vehicles and is frequently where the vehicle and its images are.
A first-class directory entity (name, address, email, phone, Figures status). **Many-to-many with
Work Provider** — one repairer serves several providers; one provider uses several repairers.
_Avoid_: Garage, Bodyshop (informal labels only)

**Figures**:
The repair-cost estimate. "Figures = Yes" on a Repairer means that repairer supplies their own
estimate figures; otherwise Collision Engineers produce the figures.
_Avoid_: Estimate (ambiguous), Costing

**Inspection Address**:
The location recorded on a case's EVA record — most often a Repairer's address, but may be a storage
yard, the claimant's home, or the deliberate "Image Based Assessment" marker. Garage / repairer /
storage / home are **source labels**; the reusable business behind one is a Repairer.
_Avoid_: Garage (as the entity name), Location

**Image Source**:
The party that supplies a case's images (and often the instructions). A **role** that may be filled
by the **Work Provider** directly, a **Repairer** (images from the garage), or an
intermediary/individual acting for the provider (e.g. Hackney Solutions, On Track, a named WhatsApp
contact). Carries the channel and match keys used to recognise incoming WhatsApp/email and to default
the inspection address.
_Avoid_: Sub-source, Intermediary; do not confuse with the field-level provenance "sourceType"

**Provider Automation Mode**:
The per-Work-Provider level of automation allowed before EVA submission: `No auto` (staff do
everything), `Review auto` (tools may populate fields; staff review before EVA), `AI Auto` (proceeds
after a strict AI review), `Full auto` (proceeds with no human touch when all gates pass). Always
checked under a **global kill switch** (global off overrides any provider setting).
_Avoid_: Automation level, Auto mode

**EVA Readiness**:
A Case is *Ready for EVA* when every required item in its readiness checklist is satisfied or
explicitly overridden. Required set = the 12 EVA fields (valid) + image-rules (≥2 images incl.
overview-with-registration + damage closeup) + an inspection-address decision + any per-provider
extras (e.g. AX: inspection type/location/case number/request date). EVA submit is blocked until met.
_Avoid_: Complete, Done

**Missing**:
The unsatisfied items in a Case's EVA readiness checklist (e.g. images, instruction, inspection
address). Surfaced as the case's chase list.
_Avoid_: Outstanding, To-do

**Chaser**:
An assisted, tracked request to an Image Source / Repairer / Work Provider for a Case's Missing
items. Channel-aware: email chasers can be drafted (and later sent via Outlook); WhatsApp chasers are
**drafted for manual send** (WhatsApp Business constraint — ADR-0003); Audatex is await-only.
_Avoid_: Reminder, Follow-up (as the entity)

**Note**:
A free-text entry a staff member adds to a Case (observations, chase activity, address clues). Always
available and first-class, alongside structured Chasers.
_Avoid_: Comment, Memo

**Triage Policy** _(planned — rules-engine-v2 / ADR-0019)_:
The deterministic routing layer that turns a classified inbound email plus live context (open-case
refs, thread history, the Image-Source intermediary map, automation modes) into an action — mint,
suggest-attach, query lane, or a cancellation proposal. Distinct from the pure text **classifier**
(the vendored engine's signal extraction), which sees only the email text.
_Avoid_: Rules engine (collides with the parser's extraction rules), Router

**Case Update** _(planned taxonomy v2 — ADR-0015 amendment pending)_:
An inbound email that belongs to an existing open Case — follow-up documents, images, or information
matched by Case/PO / provider ref / job ref (VRM only as a suggest-level fallback). Routed to
attach-to-case (suggest-first), never a new Case and not a general query. Boundary: ref-match **plus
new evidence** is a Case Update; ref-match with a question only stays a Query.
_Avoid_: Update (bare), Follow-up (as a category name)

**Cancellation** _(planned taxonomy v2 — ADR-0015 amendment pending)_:
An inbound email reporting a claim/case cancelled or closed. Matched to its Case it yields a
**staff-confirmed** close/hold proposal — never an automatic close (the terminal case status is
`removed`).
_Avoid_: Closure, Cancelled (as a case status name)

**Retro case / Retroactive reconstruction** _(ADR-0022 / TKT-058)_:
A Case created **after the fact** for real-world work the system never saw (it predates go-live or
was missed), triggered by an un-linkable billing / case-update / cancellation / query email. The
gated fallback ladder links to an existing case first (ANY status, terminals included), else
reconstructs from the **Box archive** (the folder name IS the Case/PO; the archived original
instruction `.eml` runs the normal parse/create pipeline) or an **Outlook search**. Provenance:
intake channel `retro` — never disguised as an email arrival. The Case/PO is **discovered, never
minted** on this path.
_Avoid_: Backfill (that's the not-built bulk sweep), Audit case (a different, taken term)

**Archive root (read-only)** _(ADR-0022)_:
Operator-supplied Box folder id(s) holding the REAL historical case folders — distinct from the
live mirror root. The Box scope lock treats them as **read-only**: list/search/download only;
nothing is ever created, uploaded, or deleted under them (the one-way-mirror doctrine).
_Avoid_: pointing `BOX_FOLDER_ROOT_ID` at them (that's the live RW mirror root)

**Reconstruction ladder** _(ADR-0022)_:
The retro fallback's ordered rungs: link-to-existing (any status) → Box archive → Outlook `$search`
→ minimal Held anchor (archive folder found but nothing parseable) → nothing (triage row untouched
+ a `retro_reconstruction_failed` audit). Each rung honest-skips when its gate is off.

**Case Type** _(ADR-0014 / ADR-0021)_:
The kind of work a Case is, orthogonal to its status: `standard`, `audit`, `audit total loss`, or
`diminution`. Carried on the Case/PO as a **marker** prefix. NOT the same thing as a case's
instructions/images evidence composition (the queues model).
_Avoid_: Job type, Work type (as entity names); conflating with case status

**Audit (case type)**:
A second, independent CE inspection **auditing a third-party engineer's original report** (often an
EVA — Exclusive Vehicle Assessors — or CNX report attached to the instruction). The audited firm is
**never the Work Provider**; the instructing provider (e.g. PCH, QDOS) is. The third-party report is
stored as `engineer_report` evidence for comparison — never overlaid, never parsed as the instruction.
_Avoid_: treating the attached engineer's report as the instruction or its firm as the provider

**Audit Total Loss**:
The audit case type where the audited vehicle is a write-off (the deliverable includes a Pre-Accident
Valuation). **A review-time refinement of Audit** — the QDOS instruction letters are identical for
repairable vs total-loss, so it is never detected at intake.
_Avoid_: PAV case (the PAV is the deliverable, not the type)

**Diminution**:
A Diminution in Value engagement — its own case type (`D.` marker), not an audit subtype. Detection is
review-first until grounded on a real inbound diminution instruction.
_Avoid_: DIV, folding into audit

**Case/PO Marker**:
The case-type prefix on the Case/PO: none (standard), `A.` (audit), `AP.` (audit total loss), `D.`
(diminution) — lowercase in EVA (`a.pch26001`), UPPERCASE in Box (`A.PCH26001`), same characters.
**Each marker runs its own per-(provider, year) sequence** (`A.PCH26001…` independent of `PCH26…`);
exception: a QDOS **dual "report + audit report"** letter mints ONE standard-sequence case and the
audit deliverable's marker ID is **derived from that same number at review** (`QDOS261608` →
`A.QDOS261608`). Markers currently apply to **PCH (A., D.) and QDOS (A., AP., D.) only**.
_Avoid_: Audit prefix (the marker set is wider than audits)
