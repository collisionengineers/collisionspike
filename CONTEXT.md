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
e.g. `TEST26001`. Entered by staff at EVA submit (auto-sequencing deferred). Box upload uses the
uppercase form, in unison with EVA submission.
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
