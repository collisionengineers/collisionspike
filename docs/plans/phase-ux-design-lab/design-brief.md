# collisionspike — UX Design Lab · Shared Design Brief (Stage A)

> **The ONE canonical artifact every design direction must satisfy.** It fixes the screen/feature
> inventory (Phases 1–9), the navigation model, the **main-page inbox cockpit**, the retained **queues**
> model, **case detail**, the per-role **user flows**, and the binding **business rules** the UI must
> honour. Every one of the 8+ directions must cover this *same* feature surface — that guarantee is what
> makes them comparable. Aesthetics are deliberately **out of scope here** (open exploration belongs to the
> divergence stage); re-anchoring to the CE brand + Fluent v9 happens only at port.
>
> **Companion files:** [`rubric.json`](./rubric.json) (the scoring rubric) · [`README.md`](./README.md)
> (the workflow) · [`../../design/ui-ux.md`](../../design/ui-ux.md) (the as-built M1 IA + status machine) ·
> [`../../design/THEME-MAPPING.md`](../../design/THEME-MAPPING.md) (the frozen CE→Fluent tokens — port only).
>
> **Authority:** where this brief and an ADR/review disagree, the higher doc wins (binding review > ADR >
> architecture/requirements > plans). This brief re-states binding rules; it does not re-specify them.

---

## 0. Who the product is for (write from their side of the screen)

A **single-operator case-intake workspace** for Collision Engineers. Two live roles + one deferred:

| Role | Owns | In scope |
|---|---|---|
| **Intake staff** (Dataverse "User" role) | **every case-intake action** — triage the whole inbox, review cases, chase, enrich, decide the address, submit to EVA, archive | **Yes — the primary user. Optimise for them.** |
| **Admin** (Dataverse "Admin" role) | **settings + audit** — provider corpus, automation modes/gates, Improvement-Review queue, governance/retention, roles, the audit trail | **Yes — secondary.** |
| **Engineer** | future assessment work after handoff | **Modelled only — out of scope.** Reserve a nav entry; do not design it. |

The job-to-be-done in one line: **turn three messy shared inboxes into clean, complete EVA cases — and
chase the missing pieces — without ever losing an email or silently guessing.**

---

## 1. Navigation model

One persistent **app shell** wraps every route: a left rail (primary nav) + a top bar (title, global
search by VRM / Case-PO / claimant, user/role). The app is a small set of top-level destinations:

```
AppShell
├── Inbox cockpit  (/)            ← HOME. Manages the WHOLE inbox + new cases + KPIs + queues snapshot
├── Inbox / Triage (/inbox)       ← full triage list: Receiving work · Queries · Other  (Phase 8)
├── Queues         (/queues)      ← retained: Not ready · Review · Held  (partitioned by who acts next)
│     └── Ready-for-EVA           ← a pinned action surface (also reached from the cockpit)
├── Case detail    (/case/:id)    ← the review workspace (12 EVA fields + evidence + readiness + chasers)
│     └── Submit to EVA  (/case/:id/submit)   ← route-driven modal over case detail
├── Manual intake  (/intake)      ← upload a PDF → parse → create a Case (the no-email path)
├── Admin / Corpus (/admin)       ← providers · repairers · inspection-address corpus · automation modes
│     ├── Improvement Review      ← staff-correction signals → corpus/parser/policy tasks
│     └── Settings / Governance   ← env-var gates · retention + legal hold · roles · audit log
└── Engineer       (/engineer)    ← reserved, deferred (do not design)
```

**Nav rules the directions must honour:**
- The **left rail is primary nav**, not content. It carries the top-level destinations with **inline live
  counts**. Counts are **drainable depth** (go down as work clears), never lifetime totals.
- Exactly **one** surface may carry an urgent/blocker tone at a time — spend it on the one actionable
  backlog (Review / past-due), not on dead or non-actionable items.
- The **submit dialog is a route** (linkable, back-button-friendly, modal over the case it submits).
- Admin and intake-staff surfaces are **distinct**; an intake-staff session should not see the governance
  controls as primary nav (least-privilege — Phase 9 roles).
- Collapses to icons on narrow viewports; responsive-web-first, but lay out so a tablet works.

---

## 2. Screen / feature inventory (Phases 1–9) — the coverage contract

Every direction must show it can render **all of these**. "Coverage" in the rubric is measured against this
table. Items marked **gated** are real features that exist behind a default-off flag — the UI shows them in
an honest *disabled / not-connected* state, never a fake one.

| # | Screen / feature | What it does | Key data it shows | Phase(s) |
|---|---|---|---|---|
| S1 | **Inbox cockpit (home)** | The operator's single morning view: whole inbox + new cases + KPIs + queues snapshot | see §3 | 1, 8 |
| S2 | **Inbox / Triage list** | Every inbound email classified into Receiving work / Queries / Other; reclassify, link, convert | from · domain · mailbox · received-at · attachments? · category+subtype · body preview · triage state | 8 |
| S3 | **Queues** | The three standing triage partitions (Not ready / Review / Held) + Ready-for-EVA | VRM · Case/PO · provider · status · outstanding item · channel · age/due | 1, 3, 4 |
| S4 | **Case detail** | The review workspace — verify 12 EVA fields, curate evidence, decide address, chase, gate submit | see §5 | 1, 3, 4, 5, 7 |
| S5 | **EVA submit dialog** | The final readiness gate + Case/PO mint + JSON-export / Sentry-REST choice | readiness summary · Case/PO (Principal+YY+NNN) · EVA code · Box folder · submission path | 3 |
| S6 | **Manual intake** | Upload an instruction PDF → parse → create a Case (no email) | drop zone · parse progress · the parsed 12-field preview | 1 |
| S7 | **Evidence / photos** *(case-detail tab)* | Curate images; set roles; mark registration-visible; exclude reflections; set EVA photo order | thumbnail grid · role · reg-visible badge · exclude switch · reorderable preview-then-all list | 3, 5 |
| S8 | **Inspection address** *(case-detail tab)* | Pick a ranked offline suggestion / edit / record "Image Based Assessment" with a reason | suggestions (seen-N-times · last-date) · policy badge · 6-line address · IBA reason | 4 |
| S9 | **Chasers** *(case-detail tab)* | Draft an image/info chaser (never auto-sends); or copy a Box File-Request upload link | channel (Email/WhatsApp) · template → editable draft · Copy / Log-as-drafted · Box link (gated) | 4, 7 |
| S10 | **Enrichment** *(case-detail action/tab, gated)* | Trigger DVSA/DVLA → make/model/mileage with provenance | make · model · year · mileage estimate · source/provenance | 3, 5 |
| S11 | **Audit / case history** *(case-detail tab)* | The per-case action log (every automated + manual action) | timestamped AuditEvent rows · actor · action · signals | 1, 9 |
| S12 | **"Open in Box"** *(evidence, gated)* | A server-minted deep link to the case's Box folder (linked, **not** embedded — no iframe) | folder link state · box_synced badge | 7 |
| S13 | **Admin / Corpus** | Manage WorkProviders, Repairers, the inspection-address corpus; per-provider toggles | provider code/domains · automation mode · AI/EVA/enrichment/outbound/address-policy toggles | 1, 4, 5 |
| S14 | **Improvement Review queue** (Admin) | Triage staff-correction signals into corpus/parser/policy tasks | signal · field · before/after · action (one-off / task / ignore) | 1, 5 |
| S15 | **Settings / Governance** (Admin) | Env-var gates; retention clock + legal hold; roles; DSAR/erasure entry; audit integrity | gate name+state · retention window · legal-hold flag+reason · role matrix | 5, 9 |
| S16 | **Valuation** *(case-detail, gated, later)* | Staff-triggered comparable valuation; attach the evidence PDF | valuation figure · companion-report PDF link | 5c |
| S17 | **Copilot assistant** *(gated, later)* | A staff assistant over Dataverse | conversational panel (gated off) | 5c |

> A direction does **not** have to make S16/S17 beautiful, but it must show **where they live** and that the
> IA has room for them (relevance to the finished product). S1–S9 + S13/S15 are the load-bearing screens.

---

## 3. The main-page **inbox cockpit** (S1) — full spec

**Purpose.** Not a scoreboard — the operator's **command surface for clearing two backlogs at once**: the
**inbox** (every email triaged) and the **case pipeline** (every case pushed to EVA). It now manages the
**whole inbox**, not just case-bearing email. Top-to-bottom it answers: *what's the pipeline doing?* → *what
landed in my inbox?* → *what can I drain right now?* → *how are we doing today?* → *what do I chase next?*

**The three kinds of number — never conflated** (the single most important cockpit rule):

| Kind | Question | Behaviour |
|---|---|---|
| **Live depth** | "What can I drain right now?" | goes **down** as work clears (Review, Held, Ready-to-submit, untriaged inbox) |
| **Windowed throughput** | "How are we doing today/this week?" | resets each window (In today, Submitted today, Cleared this week) |
| **Aging / exceptions** | "What do I chase *next*?" | oldest-due-first, severity-ramped |

**Terminal states (submitted, archived) appear ONLY as windowed throughput — never as a lifetime total.**

**Regions, in priority order:**

- **R0 — Pipeline hero.** A connected stage strip of the real sequence
  **New → Parsing → Review → Chasing/Held → Ready → Submitted → Box**, a count per stage, the
  **Chasing/Held (stuck)** stage emphasised. The one signature, bold device.
- **R1 — Inbox triage (the whole inbox).** Three segments with counts: **Receiving work · Queries · Other**.
  Each segment lists its top untriaged items (sender · domain · subject/preview · received-at · subtype).
  **"Other"** surfaces unidentified email a human must categorise (the catch-all — spam/auto-replies fall
  here). Each row → confirm/reclassify, or open in mailbox, or (Receiving work) jump to the created Case.
  This is the Phase-8 surface promoted onto the home page — it is **new top-level real estate**.
- **R2 — Live work · drainable now.** Large deep-link tiles: **Review** (a person must act — the one
  blocker-toned tile when > 0), **Held** (chaser out), **Ready to submit**, plus **New cases** just created
  from inbound work. These are *always-now depth* numbers.
- **R3 — Today / this week · windowed.** Inline cells: **In today · Submitted today · Cleared this week**.
  The **only** place terminal states surface, and only as throughput.
- **R4 — Chase next · oldest due first.** The hero worklist: oldest cases needing a person, each row
  **verb-led** ("Chase garage for images", "Resolve duplicate", "Decide address"), with VRM + vehicle +
  provider + a due pill on a severity ramp (neutral → attention ≤2d → blocker past-due). Above it, exception
  tallies (N past due, N duplicate, N conflict).
- **R5 — Queues snapshot.** Three deep-link tiles — **Not ready / Review / Held** counts — into `/queues`.

**Header:** title · global search · an "Updated HH:MM · Refresh" affordance. **States:** empty-inbox and
empty-needs-action both get a calm "nothing waiting — last checked HH:MM" panel; loading → skeletons;
error → the polled-counts seam shows an honest retry, never a blank zero.

---

## 4. The retained **queues** model (S3)

The queues page answers one operational question: **does a *person* have to do something, or is the
*system* still working — and if a person, is it *us* or someone we're waiting on?** Three standing
partitions **by who acts next**, plus a pinned Ready surface:

| Queue | Who acts next | Member statuses / reasons | The operator's read |
|---|---|---|---|
| **Not ready** | the **system** (or nothing yet) | `new_email`, `ingested`, `linked_to_instruction` | "arriving / parsing — just watch it flow" |
| **Review** | **intake staff** (us) | `needs_review`, `missing_required_fields`, `duplicate_risk`, `conflict`, `error` (recoverable) | "I verify, resolve, complete → push to Ready" |
| **Held** | an **external party** (chaser is out) | `missing_images`, `missing_instructions` — partial cases with an active/draftable chaser | "waiting on the garage/provider — chase + monitor" |
| **Ready for EVA** *(pinned)* | **intake staff** (final submit) | `ready_for_eva` | "all gates green — submit + archive" |

- A case is in **exactly one** queue, derived from its status. **Review** is the one blocker-toned queue;
  the rest are muted. **Ready for EVA** is a persistent action surface (a tab/region reachable from both the
  cockpit's "Ready to submit" tile and the queues page) — submitted/archived cases are **not** a standing
  queue (they're windowed throughput on the cockpit).
- **Per-queue toolbar:** search (VRM / Case-PO / claimant / model) + filters **Provider · Status · Channel ·
  Age**; a live "n of m" count. **Review** additionally exposes **reason facet chips** (Missing images ·
  Missing instructions · Duplicate · Conflict) that filter the grid and pick each row's **verb + icon** so
  the operator reads *what to do*, not just *what's wrong*.
- **Grid columns:** VRM (numberplate chip; duplicates flagged) · Case/PO (mono) · Provider (name + code) ·
  Status (badge w/ label) · Outstanding (verb-led first-missing item, "+n more") · Channel (email/WhatsApp) ·
  Age/Due (severity-aware). Row → case detail.
- **Entry/exit flows:** a row opens case detail; resolving the case re-derives its status → it moves queue
  (Review→Ready→submitted→Box) or, when a chaser is sent, Review→Held; a Held case auto-advances Held→Review
  when the missing piece arrives (Box File-Request webhook). **Empty** and **over-filtered** states differ.

---

## 5. **Case detail** (S4) — contents

The core review workspace. Layout: a slim **pipeline spine** (the open case's place in New→…→Box) · a
**header** (VRM plate · Case/PO · provider · vehicle subtitle · status badge · channel · age/due) with an
**actions cluster** (Upload evidence · Export JSON · Copy JSON · Open in Box *(gated)* · Enrich *(gated)* ·
**Submit to EVA** — disabled while readiness is blocked · **Delete case** — junk/dup only, writes an
AuditEvent) · a **readiness MessageBar** when blocked · then a **main panel (tabs) + sticky sidebar**.

**Tabs (main panel):**
1. **Fields** — the **12 EVA fields** in four legible clusters, each field an editable control + a **unified
   provenance badge**; required-but-empty fields show an inline error; editing marks the field reviewed.
   A live EVA JSON preview sits below.
2. **Evidence** — thumbnail grid; per-image **Role** dropdown · **registration-visible** badge ·
   **Exclude (person reflection)** switch; a banner restates the **EVA photo order**; a **keyboard-reorderable**
   list seeded *[overview-with-reg, damage-closeup] then all accepted images again*.
3. **Address** — pick a **ranked offline suggestion** (with a "seen N times · last <date>" hint) / edit to a
   full 6-line address / record **"Image Based Assessment" with a required typed reason**; a per-provider
   **policy** badge; never a silent default.
4. **Chasers** — channel (Email/WhatsApp) + template → editable **draft**; Copy / Log-as-drafted; **never
   auto-sends**; the Box **File-Request** upload link when gated on.
5. **Notes** — add-note + newest-first list.
6. **History** — the per-case **AuditEvent** trail.
7. **Enrichment** *(gated)* — DVSA/DVLA make/model/mileage with provenance.

**Sidebar (sticky):** the **one canonical Readiness checklist** — a ✔/✖ per readiness rule, **every ✗ a
deep-link** that jumps to the owning tab/field; below it a greyed read-only **Case facts** panel that does
**not** drive readiness.

**The 12 EVA fields (exact contract order, grouped):**

| Cluster | Fields |
|---|---|
| **Provider & claimant** | 1 Work provider · 2 Claimant name · 3 Claimant telephone · 4 Claimant email |
| **Vehicle** | 5 Vehicle (make/model) · 6 Mileage · 7 Mileage unit (Miles/Km) · 8 VAT status (Yes/No) |
| **Incident** | 9 Accident circumstances · 10 Inspection address (6-line) |
| **Dates** | 11 Date of loss · 12 Date of instruction |

**Field-level provenance** — one unified badge per field, encoding three things at once: a **source key**
(PDF · AI · Corpus · Manual · DVLA), an **uppercase source label**, and a **shape-coded review glyph**
(**check** = reviewed · **dot** = needs review · **triangle** = conflict · *none* = not required) — never
colour alone (each glyph also carries an sr-only label).

---

## 6. Binding business rules the UI must honour (encode, don't re-derive)

- **Status state machine.** `new_email → ingested → needs_review → ready_for_eva → eva_submitted →
  box_synced`; **held** branches `missing_required_fields` / `missing_images` / `duplicate_risk`;
  `linked_to_instruction` (a partial joined its other half); `error` is recoverable (re-enters the
  pipeline). Status is **never colour-only** — every badge carries a label.
- **Deterministic readiness gate** (the single source of truth the checklist, the submit button, and the
  dialog all share): (1) every **required field** non-empty; (2) **image rules** — ≥2 accepted images incl.
  ≥1 `overview` **with registration visible** + ≥1 `damage_closeup`; (3) **inspection address decided**;
  (4) **no conflicts** left. Ready ⟺ zero outstanding.
- **Case/PO format.** `Principal` (4-char provider code) + 2-digit year + 3-digit provider sequence (e.g.
  `CCPY26050`). An **individual / private claimant** (no work provider) is keyed by **VRM** instead. In the
  submit dialog the **Principal + year are locked**; only the **3-digit sequence is editable**. EVA code is
  **lowercased**, the **Box folder is UPPERCASED** — show the coupling live before submit.
- **EVA photo order.** Upload **2 preview photos** first (vehicle overview **showing the full
  registration** + main-damage closeup), then **all** photos in sequence **including those two again**.
- **Photo exclusion.** Any photo showing a **person's reflection** is unusable — excludable with the switch.
- **No silent merge / no silent address.** Duplicates are surfaced for a human decision (never auto-merged);
  "Image Based Assessment" is a **recorded decision with a reason**, never the parser's default.
- **Provenance from day one.** Every EVA-relevant field carries a source + review state.
- **Gated integrations are honest.** EVA (`EVA_API_ENABLED`), enrichment, Azure Maps, Copilot, the `BOX_*`
  set, `EMAIL_AI`, retention — all default-off. The UI renders them **disabled / not-connected**, never
  faked. EVA's current path is **JSON drag-drop export**; **Sentry REST** is the gated later path.
- **Box is a one-way mirror; Dataverse is authoritative.** Evidence is a **server-minted deep link**
  ("Open in Box"), **not** an iframe (no `frame-src`). Nothing is ever auto-deleted from Box.
- **Triage persistence.** A Case-extracted email persists an `.eml`; **query/other email stays in the
  mailbox** — the triage row holds metadata + an "open in mailbox" pointer only.
- **Audit everything.** Every automated + manual action writes an AuditEvent (delete included).

---

## 7. Core user flows (jobs-to-be-done, keyed to role)

**Intake staff**

1. **Triage the inbox.** Email arrives at one of 3 shared inboxes → deterministically classified → appears
   on the cockpit under **Receiving work / Queries / Other** → staff **confirm or reclassify** → *work*
   routes into the Case pipeline · *query* links to its open Case (or is logged) · *other* parks for a human.
2. **Review a new case → ready.** Open from "New cases" / Review queue → verify the **12 fields** (resolve
   every `needs_review` / `conflict`) → **decide the address** → **curate photos** (roles, reg-visible,
   exclude reflections, set order) → readiness flips **green**.
3. **Submit to EVA + archive.** Submit dialog → readiness gate → **Case/PO** hero (type only the 3-digit
   sequence) → choose **JSON drag-drop export** (or gated Sentry REST) → success → **Box folder augmented**.
4. **Chase a partial (Held).** Missing images/instructions → **draft** an Email/WhatsApp chaser **or** copy a
   **Box File-Request** link → log it → case sits in **Held** → auto-advances to **Review** on upload.
5. **Resolve a duplicate.** `duplicate_risk` → review the pair side-by-side → **decide** (no auto-merge).
6. **Pick the inspection address.** Address tab → pick a ranked suggestion / edit / **IBA with a reason**.
7. **Enrich** *(gated).* Trigger DVSA/DVLA → make/model/mileage populate with provenance, then review.
8. **Delete a junk case.** Confirmed delete → AuditEvent (+ prompt for manual Box archival if Box is live).
9. **Manual intake.** Upload an instruction PDF → parse → new Case → straight into flow 2.

**Admin**

10. **Govern the corpus.** Edit WorkProviders / Repairers / inspection-address corpus; set **automation
    mode** + per-provider toggles (AI / EVA / enrichment / outbound / address policy); loosening policy
    requires a **reason + impact count**; referenced records are deactivated/merged, never deleted.
11. **Run Improvement Review.** Staff corrections raise **ImprovementSignals** → mark one-off / create a
    corpus|parser|policy task / ignore (staff edits never silently change active rules).
12. **Govern data + access.** Flip env-var gates; set the **retention window + legal-hold** flag; reach the
    DSAR/erasure runbook; view the **audit trail**; manage the 3-role least-privilege model.

---

## 8. Constraints the winner ports back into (rubric-weighted, not a divergence limit)

Explore freely now; the winner must **re-anchor** to: **Fluent UI v9** components, **CSP `connect-src
'none'`** (connectors/data-seam only — no raw fetch, no iframes), the **CE brand** (CE-red `#db0816`,
Futura **display-only**, **2px** radii, charcoal rail as system chrome), and **relative asset paths**.
Reuse the existing component library where it fits: `VrmPlate`, `PipelineStrip`, `StatusBadge`,
`ProvenanceBadge`, `ReadinessChecklist`, `ImageOrderList`, `ChaserPanel`, `EvaFieldRow`, `Panel`,
`SectionHeading`, skeletons/async states. **Accessibility is a gate, not a nicety:** visible focus, AA
contrast, **colour never the sole signal**, ≥44px touch targets, reduced-motion. These are exactly the
last two rubric dimensions — design with them in, not bolted on.
