# Power Platform-native capabilities — what actually helps the intake workflow

> **Research lane 1 of 4** · `collisionspike` (CE UK vehicle-damage case intake) · written 2026-06-18.
> **Question:** of the *native* Power Platform features (Copilot Studio, AI Builder, Dataverse
> features, Power Automate patterns, Power BI, Power Pages, ALM/governance), which genuinely move the
> needle on **intake throughput** and **data quality** for *this* workflow, and which are
> premature/low-value? Azure/AI services and the domain integrations (EVA/Box/DVSA/parser) are
> covered in other lanes and are out of scope here.
>
> **Grounding:** the M1 vertical slice is built and deployed (Code App + Dataverse 11 tables +
> parser Function + 10 flows). **Email intake is live (2026-06-18):** `CS Intake` / Provider Match /
> Case Resolve are ON on `digital@`; a test email created a real `cr1bd_cases` row. The frontier is
> now **downstream-flow activation** (Classify+Persist, Parse, Status Evaluate, Enrich), **corpus
> incorporation**, **address-matching**, and the **Code App parser→connector fix** — not live email
> intake activation. EVA/Box finalisation remains off. ~1,000 cases/mo, 5 staff, all-Microsoft.
> Hard principles respected throughout: **offline build vs operator activation**, and **no mock/seed
> case data** — nothing below asks Claude to touch live inboxes/SharePoint/Box/EVA or to fabricate
> cases. Capability/licensing claims verified against Microsoft Learn (June 2026); see *Sources*.

## How to read this

Each item: **Value** (High/Med/Low) · **Effort** (S/M/L) · *why it helps **here*** (grounded in the
actual pipeline) · licensing/gotcha. "Effort" is build effort assuming the team already runs the
Code App + Dataverse + flows. A separate **Do NOT / not yet** list and a **top-5 shortlist** close
the doc.

The single most important framing: **the bottleneck this spike is solving is human review throughput
and data completeness on partial cases — not a shortage of AI.** The parser already extracts the 12
EVA fields deterministically for free, and the corpus analysis already lives as CSVs. So native
features that *sharpen review, search, status hygiene, chasing, and governance* beat features that
*add a second probabilistic extraction layer*.

---

## Copilot

### Copilot Studio agent / Copilot in the Code App (staff assistant over Dataverse cases)
**Value: Low (now) → Med (much later, M3+) · Effort: M**

*Why it (mostly doesn't) help here:* the staff job is a **bounded queue-work UI** — open the next
`needs_review` case, eyeball the 12 parsed fields + images, fix two empty fields (telephone/email,
B2), click submit. A conversational agent adds little to a 5-person team doing structured triage; the
Code App's own list/filter/detail screens are faster than asking an agent. There is a real future
seam — "find the open case for VRM `LT09 XYZ`", "which provider is `PCH`?", "summarise this
instruction" — but those are **search and a parser job**, not a copilot, today. Genuinely useful only
once the corpus + many closed cases exist and staff want NL Q&A over history (M3+).

*If/when built, the path is clean and first-party:* Code App → **Microsoft Copilot Studio connector**
(`how-to/connect-to-copilot-studio`, `code-apps-preview:add-mcscopilot` skill), grounded on cases via
the **Dataverse MCP server** / knowledge center. So this is a *defer*, not a *can't*.

*Licensing/gotcha:* **the cost model changed (Sept 2025)** — Copilot Studio is **Copilot Credits**:
prepaid **$200/mo = 25,000 credits**, or **PAYG $0.01/credit**, a generative message ≈ 2 credits. The
older `microsoft-stack.md` "$0–30/mo" figure is light for anything beyond a toy. The connector is
still **Preview**. Keep the existing `COPILOT_ENABLED` gate; do not spend M1/M2 effort here.

---

## AI Builder

### AI Builder — document processing / prediction / category classification
**Value: Low · Effort: M · (overlaps the existing Azure parser — mostly redundant)**

*Why it doesn't help here:* the instruction-parsing problem is **already solved deterministically**
by `cedocumentmapper_v2.0` (live on the parser Function, 12-field EVA contract, schema-validated,
≈£0). AI Builder *document processing* is a second, **probabilistic, credit-metered** extractor for
the same job — it loses on cost, determinism, and the existing investment. `microsoft-stack.md` §4
already adopts "deterministic first, Document Intelligence only for the docs the rules miss"; AI
Builder doc-processing sits *behind* even that fallback. **Category classification** (email/attachment
routing) is likewise handled in typed TS today (`src/domain` classification + ADR-0010 dedup) and in
the flow's attachment filter — moving it to AI Builder buys nothing and adds metering.

*The one AI-Builder-shaped task that is real* — **image classification** (overview vs
`damage_closeup`) — is already correctly scoped: **ADR-0009 defers it to M2**, with **Foundry vision**
(not Custom Vision, which retires 2028-09-25) for person/reflection. That is an *image-AI / Azure*
lane decision, not an intake-throughput win to pull forward now.

*Licensing/gotcha (this is the headline AI-Builder fact for a 2026 build):* **AI Builder credits are
being retired.** Seeded credits in Power Apps Premium (500/license) and the AI Builder capacity add-on
are **removed on 2026-11-01**; **new customers can no longer buy the add-on** and must consume
**Copilot Credits** instead (Learn: *End of AI Builder credits*, *Overview of licensing*). So the
`microsoft-stack.md` assumption "AI Builder ≈ $0, included with Premium" **expires within months of
this build**. Treat any AI Builder usage as net-new Copilot-Credit spend — which further weakens an
already weak case versus the free deterministic parser.

---

## Dataverse features

### Dataverse search (relevance search)
**Value: High · Effort: S**

*Why it helps here:* a case-intake desk lives on lookup — "find the case for this VRM / claim ref /
claimant / provider code." Dataverse search gives **fuzzy, multi-table, relevance-ranked** results
(handles misspellings, partial reg) and — critically for this domain — **searches inside stored
documents** (PDF/EML/JSON ≤2 MB) and notes/attachments, so staff can find a case by content of the
instruction, not just indexed fields. It is **opt-out / on by default for production environments**,
and it is the **prerequisite for every future Copilot/AI grounding** over cases. Cheap, high daily
value, and it unblocks the deferred Copilot story.

*Licensing/gotcha:* counts toward Dataverse **storage** entitlement (small at this corpus size); in
non-production environments an admin must enable it; turning it **off** deprovisions the index within
12h and a re-enable triggers a full re-sync. Enable it in the Sandbox + future Test/Prod; add the
right columns to Quick Find views so VRM/claim-ref/provider-code are indexed.

### Rollup & calculated columns
**Value: Med · Effort: S**

*Why it helps here:* **calculated columns** can derive display/lookup values with zero flow code —
e.g. the **UPPERCASE Box folder name** from the Case/PO, a `daysSinceIngest` ageing value to drive
chaser timing and a "stale cases" view, or a normalised provider display name. **Rollups** can show,
per provider or per inbox, **open-case counts / oldest-open-age** for a lightweight in-Dataverse
ops view without standing up Power BI. Native, declarative, free.

*Licensing/gotcha:* rollups recalc on a **~1h scheduled job** (not real-time) — fine for ageing/queue
metrics, **wrong** for anything the dedup/EVA-readiness gate must decide synchronously (keep those in
the parser/flow/TS path). Calculated columns can't call connectors and have function limits.

### Business rules
**Value: Low–Med · Effort: S**

*Why it's marginal here:* business rules (show/hide/require/default at the form level) are a
**model-driven/canvas** affordance. The UI here is a **React Code App** that owns its own validation
in TypeScript (the EVA-readiness gate, the address-policy gate, image-rules) — duplicating that logic
in Dataverse business rules **splits the source of truth**. Useful only for a thin server-side
guard-rail if data is ever edited *outside* the Code App (e.g. directly in a model-driven grid or via
import). Low priority while the Code App is the sole writer.

*Licensing/gotcha:* form-scoped business rules don't run for Code App writes; only the
"Entity"-scope subset runs server-side. Don't rely on them as the app's validation.

### Low-code plug-ins
**Value: Low (not yet) · Effort: M**

*Why to avoid for now:* tempting for server-side validation (e.g. enforce Case/PO format, reject a
duplicate on write regardless of client). **But the feature is in flux:** instant low-code plug-ins
are **deprioritised and being replaced by "Functions in Dataverse"**, still **preview**, "not for
production" (Learn: *Use low-code plug-ins in Dataverse (preview)*). Building M1 transactional
integrity on a preview surface that Microsoft is mid-rewrite on is a poor bet. The same guarantees are
available **now** via the flows (dedup ladder already encoded in `case-resolve`) and, if hard
server-side enforcement is later required, a **conventional C# plug-in** or **Custom API** is the GA
path. Park behind a "when Dataverse Functions reaches GA" trigger.

*Licensing/gotcha:* preview, no production SLA; Power Fx subset only; the instant variant is a dead
end. Don't put the dedup/EVA gate here.

### Auditing
**Value: High · Effort: S**

*Why it helps here:* the predecessor tool's **lack of version control / audit was a named problem**,
and the domain needs an evidentiary trail (who reviewed, when status moved `needs_review →
ready_for_eva → eva_submitted`, what field changed pre-submission). The schema already models an
**`AuditEvent`** table and field-level provenance; Dataverse **native column auditing** complements
that for free at the platform layer (change history per row/column, who/when). Directly serves the
"confirm AuditEvent rows for ingest/review/submit" roadmap item (Phase 3e) and any later dispute.

*Licensing/gotcha:* must be enabled at **environment** + per-table/column; audit logs **consume log
storage** (manage retention) and aren't a substitute for the app's own semantic `AuditEvent` rows —
run **both** (platform audit = tamper-evident change log; `AuditEvent` = business-event timeline).

---

## Power Automate patterns

> All of these are **standard, GA, and already central to the spike** (10 flows + the
> `power-automate-flow` skill that encodes intake/dedup/status/EVA-Box/chaser patterns). The
> recommendation is **"keep doing this well,"** not "adopt something new." Listed because robustness
> here *is* throughput.

### Robust error handling / retry / Scopes (try-catch)
**Value: High · Effort: S (already in the patterns)**

*Why it helps here:* the pipeline crosses fragile boundaries — shared-mailbox trigger, parser
Function, EVA, Box. Native **exponential retry policies** (transient faults), **Configure run-after**,
and **Scope-based try/catch** keep a flaky EVA/Box call from dropping a case silently and give a
failure trail. The EVA+Box step is explicitly an **atomic finalisation** — try/catch with
compensation is exactly right so a case can't end up in EVA but not Box (or vice-versa). This is the
difference between "1,000 cases/mo flow reliably" and "staff chase ghosts."

*Gotcha:* AI-Builder/long doc actions have their own 60-min timeout semantics; the parser is your own
Function so set sane timeouts + retry there.

### Approvals
**Value: Low–Med · Effort: S**

*Why it's marginal here:* the human-review step is **queue work inside the Code App** (open case →
verify → submit), not an out-of-band sign-off, so the Approvals connector (Teams/Outlook
approve/reject cards) is **not** the natural fit for the core gate. It earns a place only for a
genuine *secondary* authorisation — e.g. a manager approving an **Address override-with-reason**, or
sign-off before a **production EVA cutover**. Keep the readiness gate in the app; reserve Approvals
for true exceptions.

### Scheduled chasers
**Value: High · Effort: S–M (flow built; activation gated)**

*Why it helps here:* **partial cases are the core problem** — instructions without images, or images
without instructions, held until complete. A **scheduled (recurrence) flow** that finds aged-incomplete
cases and **drafts** a channel-aware chaser is squarely the throughput lever. The `chaser-draft` flow
already exists (imported OFF), correctly **draft-only behind the outbound kill switch** (ADR-0003;
WhatsApp drafted for manual send). Pair the schedule with a `daysSinceIngest` calculated column /
rollup (above) for "what to chase."

*Gotcha:* respect the **draft-only** boundary — no automated sends in the spike; WhatsApp Business has
**no free automated send**. Targeting the right garage needs the Phase 1b.3 garage↔provider N:N
(operator worklists), so full value lands after corpus incorporation.

### Child flows & concurrency control
**Value: Med · Effort: S–M**

*Why it helps here:* **child flows** factor shared logic the pipeline repeats — dedup resolution,
status transition, provenance-stamped Case upsert — into reusable units called by each inbox's intake
flow (DRY across 3 mailboxes; matches the existing `case-resolve`/`classify-persist` split).
**Concurrency control** matters because two emails for the **same case** can arrive near-simultaneously
(instructions + images) — bounding `Apply to each` concurrency (or serialising per case key) prevents
a **dedup race** that creates duplicate Cases. Directly protects the data-quality goal.

*Gotcha:* child flows need a solution + connection-reference discipline (already the ALM posture);
over-tight concurrency throttles the 1,000/mo throughput — tune, don't default to 1 globally.

---

## Power BI (embedded)

### Power BI Embedded — corpus / throughput analytics
**Value: Med · Effort: M**

*Why it helps here (later):* the session just produced **real, reproducible analytics** over 33k+ EVA
cases (provider recency bands, 137 active-but-off-jobsheet principals, inspection-location heatmap
CH/B/M/OL/LU/RH, 57% part-postcode rate, dormant tail). Those are **management/ops insights**, and a
Power BI report **embeds cleanly in the React Code App** (`powerbi-client-react`, first-party). A
live throughput dashboard (cases/day by inbox, time-in-status, chase backlog, provider mix) is a
natural M2+ deliverable once live intake is flowing and there's *operational* data to show.

*Why not yet:* (a) **no mock data** principle — a dashboard over an empty/seed-only store shows
nothing real until live intake runs; the corpus analysis is **historical** and already serves the
modelling decisions as CSVs, so it doesn't need a BI surface to be useful. (b) For *throughput*
metrics, the **rollup/calculated-column** route gives 80% of the early value with far less setup. Pull
Power BI in when (1) live cases accumulate and (2) someone needs trend/exec views.

*Licensing/gotcha:* **"embed for your organization" = every viewer needs a Power BI license**
(Pro/PPU, or free under a Fabric **F64+** capacity). For 5 internal staff, **Power BI Pro per user**
(~$14/user/mo) is the pragmatic route — a **real add-on cost** not in the current platform subtotal.
Don't assume Premium covers it.

---

## Power Pages

### Power Pages — provider/garage portal (image upload, chase responses)
**Value: Low (for the spike) · Effort: L**

*Why it doesn't help the spike now:* a portal where garages/providers self-upload images and answer
chasers is a **plausible long-term throughput win** (cut the email round-trip that creates partial
cases) — but it is a **large, separate build** with its own auth, page-permission hardening, content
moderation, and a brand-new external-trust surface, and it **fights the current architecture**: intake
today is **email-first** (3 shared inboxes) and the whole offline/operator boundary, dedup, and
provider-matching are built around that. A portal is a *different intake channel*, i.e. an M3+ product
decision, not an M1 accelerator. The corpus analysis even shows the relationships you'd need to target
a portal (provider→yard) **aren't loaded yet** (Phase 1b.3).

*Licensing/gotcha:* **external authenticated users are a real recurring cost** — **$200/mo per 100-user
pack** (Tier 1) or **$4/active user/mo PAYG** (Learn: *Power Pages licensing*), plus the security
burden of an internet-facing site handling third-party uploads. High effort + new attack surface +
ongoing licence for a benefit the email path already delivers in the spike. Defer.

---

## ALM / governance

### Solutions + environment strategy + ALM pipelines
**Value: High · Effort: S (already adopted)**

*Why it helps here:* the predecessor's **no-version-control** failure is the explicit thing this spike
must not repeat. Everything is already in **solutions** (`CollisionSpike`, `CollisionSpikeFlows`) with
**connection references + environment variables** (the feature gates), built in a **dedicated Sandbox,
not Default**, with a Dev→Test→Prod promotion intent. Keep it — and use **Test** as the place to flip
`ENRICHMENT_ENABLED` / `EVA_API_ENABLED` so live credentials never touch Dev. This *is* the
governance win; it's done, so the action is "hold the line," and add a managed-solution export to
Test before any gate flip.

*Gotcha:* keep flows OFF + connection refs unbound on import (already the posture); don't let env-var
**values** (secrets) into the repo (already gated).

### Managed Environments
**Value: High · Effort: S**

*Why it helps here:* turning the target environment into a **Managed Environment** unlocks the
governance controls that matter for a workflow handling claimant PII + third-party data — **DLP
enforcement teeth, maker/sharing limits, usage insights, solution-checker enforcement** — and it is
**included as an entitlement with Power Apps Premium** (which every Code App user already needs), so
there's **no extra licence cost** to enable it. Note also: **Managed-Environment licensing-compliance
notifications start June 2026** (now) — being deliberate about which environment is Managed avoids
surprise end-user "get a license" prompts.

*Licensing/gotcha:* once Managed, **every active user must hold a qualifying premium licence** (fine —
Premium is already required for Code Apps), and the **Developer Plan does not satisfy** this. Enable on
the Sandbox/Test/Prod that run the app; be aware it makes the licence requirement enforced, not
optional.

### DLP policies
**Value: High · Effort: S**

*Why it helps here:* the pipeline mixes **business connectors** (Office 365 Outlook, Dataverse, Box,
the custom parser/enrichment/EVA connectors) with a tenant full of **non-business** connectors. A DLP
policy that puts the intake connectors in **Business** and blocks casual cross-mixing prevents a maker
from accidentally wiring claimant data into a consumer service — a concrete data-protection win for a
small team moving fast, and cheap to author. Strongest when paired with Managed Environments (which
gives DLP real enforcement).

*Licensing/gotcha:* DLP is tenant/environment admin (operator) work — **not a Claude/offline step**;
it lives in the operator's activation checklist alongside the connection bindings. Test the policy
doesn't break the legitimate intake connectors before enforcing.

---

## Do NOT do / not yet (with reasons)

| Item | Verdict | Reason (grounded) |
|---|---|---|
| **AI Builder document processing** | **Don't** | Duplicates the free deterministic parser (12-field EVA, already live); probabilistic + credit-metered for a solved job. `microsoft-stack.md` already relegates even Document Intelligence to fallback. |
| **AI Builder credits as a "free" assumption** | **Re-plan** | Seeded credits removed **2026-11-01**; new add-on purchase closed; usage moves to **Copilot Credits**. Any AI Builder/image-AI cost line in `microsoft-stack.md` must be re-priced. |
| **Low-code plug-ins / Dataverse Functions** | **Not yet** | Preview, "not for production"; **instant low-code plug-ins deprioritised / being replaced**. Don't build M1 transactional integrity on a moving preview — flows already encode dedup; use C# plug-in/Custom API if hard server-side enforcement is later needed. |
| **Copilot Studio agent (now)** | **Defer (M3+)** | Bounded queue-work UI doesn't need conversational AI for 5 staff; real value only over a large closed-case history. Path is clean + gated (`COPILOT_ENABLED`) — revisit later, don't spend M1/M2. |
| **Power Pages garage portal** | **Defer (M3+ product call)** | Large separate build + new external-trust/attack surface + **$200/100-user or $4/user/mo** ongoing; email intake already delivers the spike's benefit; provider→yard links not even loaded yet. |
| **Power BI dashboard (now)** | **Not yet** | "No mock data" → nothing real to show until live intake runs; historical corpus already serves modelling as CSVs; rollups give early throughput metrics cheaper. Each viewer needs a **Pro/PPU** licence. |
| **Business rules as app validation** | **Don't** | Splits the source of truth — the React Code App owns validation (EVA gate, address policy, image-rules) in TS; form-scope rules don't even run for Code App writes. |
| **Approvals for the core review gate** | **Don't (core)** | Review is in-app queue work, not out-of-band sign-off; reserve Approvals only for true exceptions (address override, prod cutover). |

---

## Top-5 ranked shortlist (do these)

1. **Managed Environments + DLP policy** *(High / S, operator step)* — biggest governance return for a
   PII-handling pipeline, **already paid for** via Power Apps Premium; DLP fences the intake connectors;
   compliance notifications land June 2026 so be deliberate now. *(Operator-gated — sits in the
   activation checklist, not the offline build.)*
2. **Dataverse search (relevance search)** *(High / S)* — turns the case desk into a real lookup tool
   (fuzzy VRM/claim-ref/provider, **search inside stored PDFs/EMLs**), on-by-default for production, and
   the **prerequisite** for any future Copilot grounding. Cheap, high daily value.
3. **Dataverse auditing + keep the `AuditEvent` timeline** *(High / S)* — closes the predecessor's
   no-audit failure with a tamper-evident platform change log alongside the business-event rows;
   directly serves the EVA-readiness/audit roadmap and future disputes.
4. **Power Automate robustness — exponential retry + Scope try/catch on the atomic EVA+Box finalisation,
   child flows for shared logic, bounded concurrency to kill the dedup race** *(High / S, already in the
   patterns)* — reliability at 1,000 cases/mo *is* throughput; hardest-edged on the EVA/Box atomic step
   and the same-case concurrent-arrival race.
5. **Scheduled draft-only chasers + a `daysSinceIngest` calculated column/rollup for ageing** *(High /
   S–M)* — attacks the core "partial case" problem directly; flow already built (OFF, draft-only per
   ADR-0003); the ageing column drives both the chase schedule and a "stale cases" view. *(Full
   garage-targeting value lands after Phase 1b.3 corpus incorporation.)*

> **Net:** the high-value native moves are all about **governance, search, audit, reliability, and
> chasing** — sharpening the human-review pipeline you already have. The flashy items (Copilot,
> AI Builder, Power Pages, Power BI) are **defer-or-don't** for the spike: they either duplicate the
> free deterministic parser, depend on live/closed-case data you correctly won't fake, add a new
> external surface, or now carry credit/licence costs the original stack doc under-counted.

---

## Sources (Microsoft Learn, verified June 2026)

- Code apps overview / Premium licence / new npm CLI replacing `pac code` — `power-apps/developer/code-apps/overview`
- Code App → Copilot Studio connector — `power-apps/developer/code-apps/how-to/connect-to-copilot-studio`
- Copilot Studio billing (Copilot Credits) — `microsoft-copilot-studio/billing-licensing`
- AI Builder credit retirement (2026-11-01) — `ai-builder/endofaibcredits`, `ai-builder/administer-licensing`, `ai-builder/credit-management`
- Dataverse search (opt-out, doc search, AI grounding) — `power-platform/admin/configure-relevance-search-organization`, `power-apps/user/search`
- Low-code plug-ins preview / deprioritised, replaced by Functions — `power-apps/maker/data-platform/low-code-plug-ins`, `…/functions-overview`
- Power Automate error handling / retry / run-after / scopes — `power-automate/guidance/coding-guidelines/error-handling`
- Power BI embed in React — `javascript/api/overview/powerbi/powerbi-client-react`; embed licensing — `power-bi/developer/embedded/embedded-analytics-power-bi`
- Power Pages licensing (authenticated/anonymous per-user) — `power-platform/admin/powerapps-flow-licensing-faq#power-pages`, `power-platform/admin/pay-as-you-go-meters`
- Managed Environments (entitlement, June-2026 compliance) — `power-platform/admin/managed-environment-licensing`, `…/managed-environment-overview`
