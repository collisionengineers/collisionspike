# Phase 9 — Data Governance, Retention & Erasure (additive)

**Goal:** give the automated intake pipeline a **UK-GDPR data-retention, erasure and PII-lifecycle
posture**. The pipeline now processes **third-party claimant PII** — names, VRMs, addresses, accident
detail, raw `.eml` bodies, and images — across **THREE stores**: **Dataverse** (system of record),
**Azure Blob** (transient `.eml` + image bytes), and **Box** (one-way mirror, folders named by Case/PO).
Today the only thing ever purged is **image blobs** (`box-blob-purge`, status-driven, default-OFF). There
is **no retention policy, no erasure path, and no privacy/DPIA artefact**. Phase 9 closes that gap.

> **Binding decision:** [ADR-0017 — Data Governance, Retention & Erasure](../../adr/0017-data-retention-erasure-pii-lifecycle.md)
> (**Proposed**). Read it before acting. This is the biggest substantive gap surfaced by the 2026-06-24
> review.

> **Same additive pattern as Phase 7 / Phase 8.** Everything Claude can build — the retention-clock schema,
> the disposition flow, the DSAR runbook, the DPIA/controller-processor doc, the audit-integrity config, the
> store-hardening steps — is **built offline, gated-OFF, and the operator activates** in
> [DEPLOY-RUNBOOK](../../../DEPLOY-RUNBOOK.md) order. The numbers and policy that drive it
> (**retention period, lawful basis, litigation-hold rule, ICO registration**) are **business/legal input**
> and are `[RESERVED-FOR-USER]` — see [docs/gated.md](../../gated.md).

**Status:** **PLANNED / not built.** Nothing in this phase is in the tree yet. The schema + flows are
Claude-buildable offline and lint-verifiable; the policy inputs are operator/legal. See
[ROADMAP.md](../../../ROADMAP.md) Phase 9.

---

## The central tension — two competing clocks

Retention here is **not a single number**. Two clocks pull in opposite directions and the design must
model **both**:

1. **GDPR data-minimisation** — claimant PII must not be kept longer than necessary; default to expiry +
   deletion/anonymisation once the case is closed and the window lapses.
2. **Litigation / evidential hold** — an engineer's report can become **evidence in an insurance or court
   dispute years later**. A case under (or potentially under) dispute must be **exempt** from the
   minimisation purge.

So the model is **a default minimisation expiry _plus_ a legal-hold exemption flag** — never one expiry
value. The disposition flow purges on the minimisation clock **only when no hold is set**.

---

## Implementation checklist

Legend: **[C]** = Claude-buildable offline (lint/parity-verifiable) · **[O]** = operator/legal-gated
(a policy number, a tenant-admin change, a lawful-basis sign-off, or a live confirm) · **[DEFERRED]** =
**recorded as deferred-pending-operator — not active work** (do not treat these as in-flight). State each
line `[ ]` until built/flipped.

> **Deferral note (operator decisions).** Most of the policy/legal governance surface is **DEFERRED pending
> the operator**: the **retention period** (G1), **legal hold** (G2), **ICO/DVLA registration** (G3), the
> **DSAR cross-store blind-spot** runbook (G4), and **store hardening** (G6) are all recorded as
> deferred-pending-operator below — **not** active build work. **Data-protection sign-off (G5) is likewise
> deferred, BUT the operator has FULL AUTHORITY for AI testing on all repo data** — an enabler for the
> Phase-8 LLM classifier and the Phase-4a vision/geocode work. The **3-role model (G8)** is partly built now
> (see item 9). Two hardening definitions and one absolute principle are stated explicitly below even while
> the broader hardening is deferred.

1. **[DEFERRED · G1] Retention-clock schema on `cr1bd_case`** — add `cr1bd_closedat` (when the case reached a terminal
   state), `cr1bd_retentionexpiresat` (computed from `closedat` + the policy window), and a **legal-hold
   flag** (boolean + optional reason/`heldby`). _Why:_ the disposition flow needs a per-case clock and a
   per-case exemption; one global number cannot express the two-clock model. _Offline:_ author the columns +
   `verify-parity.mjs` lock; _operator:_ supplies the **window length** + applies live.
2. **[DEFERRED · G2] Scheduled case-disposition flow** (sibling to `box-blob-purge`) — `Recurrence` trigger, gated;
   for cases where `cr1bd_retentionexpiresat < now` **AND no legal hold**: purge any **retained transient
   Blob bytes**, then **anonymise or hard-delete** the case + its Evidence PII per policy; audit every
   branch. _Why:_ `box-blob-purge` only clears archived image blobs — `.eml` bodies, claimant identity
   fields, and Evidence rows are never disposed of today. _Offline:_ author + lint the flow; _operator:_
   confirms anonymise-vs-hard-delete policy + flips the gate (test env first).
3. **[DEFERRED · G4] DSAR / right-to-erasure cross-store runbook** — a documented, repeatable erasure procedure
   spanning **Dataverse (FetchXML by claimant/VRM/Case)** + **Azure Blob (prefix list + delete)** + **the
   Box folder by Case/PO**. _Why:_ a data-subject erasure request must reach **every** store, not just the
   system of record. **⚠️ ERASURE BLIND-SPOT (call out explicitly in the runbook):** PII-adjacent
   identifiers also live **OUTSIDE Dataverse** — in **Box folder NAMES** (Case/PO), **File-Request URLs**,
   and **Outlook CATEGORY strings**. The runbook must enumerate and cover these, or erasure is incomplete.
   _Offline:_ author the runbook; _operator:_ executes it (touches live stores).
4. **[DEFERRED · G3] Privacy-notice / DPIA / controller-processor map** at
   [docs/architecture/data-protection.md](../../architecture/data-protection.md) — who controls what, who
   processes what, lawful bases, recipients (EVA, DVSA, DVLA), retention, and the data-subject rights path.
   Box is a **processor** under the one-way mirror; name **ICO registration** and **DVLA data-use terms**
   explicitly. _Why:_ a DPIA is effectively mandatory for systematic large-scale PII processing; the doc is
   the controller-facing artefact regulators expect. _Offline:_ author the doc; _operator:_ confirms ICO
   registration + signs the DPIA.
5. **[DEFERRED · G3] Recorded lawful basis for enrichment + valuation** — document the lawful basis for the
   **DVSA/DVLA enrichment** (legitimate interest; **VRM-only outbound** — no claimant identity leaves the
   tenant) and for **valuation** (before `VALUATION_ENABLED` is ever flipped). _Why:_ outbound third-party
   API calls on personal-data-linked identifiers need a recorded basis. _Offline:_ author the analysis;
   _operator:_ signs off.
6. **[C/O · G5] AI-data-protection prerequisite (production sign-off DEFERRED; TESTING authorised)** — the
   formal data-protection **sign-off is deferred**, but the operator has **FULL AUTHORITY for AI testing on
   all repo data**, so the Phase-8 LLM classifier and the Phase-4a vision/geocode work may be **tested now**
   on repo data. The production precondition that **remains deferred** before `EMAIL_AI` (Phase 8c),
   **Box-AI**, **Copilot** (`COPILOT_ENABLED`), or **vision** (Phase 5b) can flip on **live**: **PII
   pre-scrub** of any text/image sent to a model; **prefer in-tenant Azure OpenAI with no external
   retain/train**; and a **`[RESERVED-FOR-USER]` sign-off per gate**. _Why:_ sending claimant PII to an LLM
   in production without a no-retain/no-train guarantee is an unassessed processing activity — but testing on
   repo data is the operator's call and is authorised. _Offline:_ author the prerequisite + wire the
   pre-scrub; _operator:_ signs off per gate before live.
7. **[C/O] Audit-trail integrity** — enable **native Dataverse auditing** on `cr1bd_case`, `cr1bd_evidence`,
   and `cr1bd_auditevent`; and **define the cascade-delete rule** for `cr1bd_auditevent` (what becomes of the
   audit rows when a Case is hard-deleted by the disposition flow or a DSAR). _Why:_ disposition/erasure must
   not silently destroy the audit trail, and the trail must be tamper-evident. _Offline:_ author the audit
   config + the cascade decision; _operator:_ enables auditing on the live tables.
8. **[DEFERRED · G6] Store hardening before prod** — the broader hardening is deferred-pending-operator, but
   two definitions and one absolute principle are recorded now:
   - **Key Vault purge-protection** on the **enrichment / EVA / Box** vaults — purge-protection **blocks
     permanent secret deletion during the soft-delete window**, so an accidental/malicious wipe is
     recoverable within that window.
   - **Azure Blob `evidence` container soft-delete + versioning** — gives **recoverable deletes** (a mis-fire
     can be restored); this is the **hard pre-step before any purge flow is armed** (`box-blob-purge`).
   - **PRINCIPLE — NO AUTOMATED DELETION FROM BOX, EVER.** `box-blob-purge` only deletes **transient Azure
     Blob image bytes that have already been archived to Box** — it **never** deletes anything in Box itself.
     Box content is removed by a human only; no flow, schedule, or disposition job deletes from Box.
   _Offline:_ author the bicep/config; _operator:_ applies it live **before** any purge flow is armed.
9. **[C · G8] Sibling — staff least-privilege Dataverse security roles (3-role model)** — **promote** the
   currently-orphan PLANNING-ONLY doc [docs/roles-and-permissions.md](../../roles-and-permissions.md) into
   this phase and **author the `cr1bd_*` security roles offline, gated-OFF**. Three roles:
   - **User** — **all case-intake actions** (the day-to-day intake/triage/review/EVA-export work). **Built
     now** (offline, gated-OFF).
   - **Admin** — **settings + audit logs** (environment-variable gates, configuration, the `cr1bd_auditevent`
     trail). **Built now** (offline, gated-OFF).
   - **Engineer** — **DEFERRED** (future assessment functionality, **out of scope** for this phase).
   _Why:_ least-privilege staff access is part of the same governance posture (today everything runs as
   System Administrator). _Offline:_ author the User + Admin roles; _operator:_ assigns them.

---

## Plans in this phase

- [ADR-0017](../../adr/0017-data-retention-erasure-pii-lifecycle.md) — the binding decision (**Proposed**):
  the two-clock retention model + the cross-store erasure scope.
- [docs/architecture/data-protection.md](../../architecture/data-protection.md) — the DPIA /
  controller-processor map (**item 4**, to be authored).
- [docs/roles-and-permissions.md](../../roles-and-permissions.md) — the sibling least-privilege roles plan
  (**item 9**, promote from orphan).

## Needs the operator

Cross-linked in [docs/gated.md](../../gated.md). The **policy/legal** inputs are hard blockers Claude
cannot supply:

- the **statutory retention period** (the minimisation window length);
- the **lawful basis** for enrichment + valuation processing;
- the **litigation / legal-hold rule** (what triggers a hold, who sets/clears it);
- **ICO registration** confirmation (and DVLA data-use terms);
- the **DLP connector policy** (tenant-admin) governing which connectors may touch PII;
- the **per-AI-gate sign-off** (item 6) before any model sees claimant PII **in production** — AI **testing**
  on repo data is already authorised (G5).

> The vetted EVA export
> `docs/plans/to-integrate-into-phases/inspection-address-revamp/fullevaexportinspectionaddresses.xlsx`
> **stays git-tracked** — it is critical corpus data and an operator decision; it is **not** treated as a
> PII-in-git problem here.
