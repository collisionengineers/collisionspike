# ADR-0017 — Data retention, erasure & PII lifecycle (UK GDPR)

**Status:** Proposed (2026-06-24). Surfaced by the 2026-06-24 whole-repo review. Relates to ADR-0016.
Realised as the new Phase 9.

## Context

The automated pipeline processes **third-party claimant PII** — names, VRMs, addresses, accident
detail, raw `.eml` bodies, images — across **three stores**: Dataverse (system of record), Azure Blob
(`.eml` + image bytes), and Box (one-way mirror, folders named by Case/PO).

Today **only IMAGE blobs are ever purged** (`box-blob-purge`). There is **no retention policy, no
erasure path, and no privacy / DPIA artefacts**. This is the **biggest substantive governance gap**
surfaced by the 2026-06-24 whole-repo review.

## Decision

Most of the retention-&-erasure framework is **DEFERRED, pending the operator / legal** (period,
lawful basis, litigation-hold rule). A small number of items are **active principles** now. The list
below marks each.

1. **(G1 — DEFERRED, pending operator)** Retention modelled as **TWO competing clocks** — GDPR
   data-minimisation **vs** an engineer-report **LITIGATION / EVIDENTIAL hold** (reports can be disputed
   years later) — **not a single expiry**. Recorded as the intended model; the **period** is the
   operator's to set.
2. **(G1 — DEFERRED, pending operator)** Retention-clock columns
   (`cr1bd_closedat` / `cr1bd_retentionexpiresat` + a legal-hold flag) plus a scheduled
   **case-disposition flow** that purges retained transient Blob bytes and anonymises / hard-deletes
   case + evidence PII after the window.
3. **(G4 — DEFERRED, pending operator)** A **DSAR / right-to-erasure cross-store runbook** covering
   Dataverse + Blob + Box — explicitly including the **blind spot** that **PII-adjacent identifiers live
   in Box FOLDER NAMES, File-Request URLs and Outlook CATEGORY strings OUTSIDE Dataverse**.
4. **(G3 — DEFERRED, pending operator / legal)** A **privacy-notice / DPIA / controller-processor map**
   (`docs/architecture/data-protection.md`) naming **ICO registration** and **DVLA data-use terms**
   explicitly.
5. **(G3 — DEFERRED, pending operator / legal)** A **recorded lawful basis** for DVSA / DVLA enrichment
   (legitimate interest, **VRM-only outbound**) and for valuation.
6. **(G5 — data-protection sign-off DEFERRED; AI-test authority GRANTED now)** An
   **AI-data-protection prerequisite** gating EMAIL_AI / Box-AI / vision for **production**
   (PII pre-scrub; prefer **in-tenant Azure OpenAI**, no external retain / train) is deferred. **BUT the
   operator holds FULL AUTHORITY to run AI testing on all repo data now** — an explicit enabler for the
   Phase-8 LLM classifier and the Phase-4a vision / geocode work. The deferral is on the production
   sign-off, not on development-time AI testing.
7. **(Audit-trail integrity — schema-as-code ALREADY IN THE TREE; only org-level enablement remains)** Both
   halves are already authored: **table-native auditing** (`dataverse/.build/02-tables.ps1` sets
   `IsAuditEnabled = true`, CanBeChanged, on every table) and the **cascade-delete rule** for
   `cr1bd_auditevent` (`dataverse/relationships.json`: `cr1bd_case_auditevent` uses `delete: RemoveLink` so
   audit rows survive a removed Case). What remains is **operator org-level enablement** — turning Dataverse
   auditing on at the **organisation** level so the per-table flags take effect.
8. **(G6 — store hardening; DEFERRED as a gate, but the principles are DEFINED now)** Before any purge
   is armed: **Key Vault purge-protection** (blocks permanent secret deletion during the soft-delete
   window) and **Blob soft-delete + versioning** (recoverable deletes). These are the **hard pre-step**
   ahead of arming any purge.
9. **(NO AUTOMATED DELETION FROM BOX — active principle)** **Box is never deleted automatically, ever.**
   The only automated delete in the system is `box-blob-purge`, which removes the **transient Azure
   Blob** image bytes **already archived to Box** — it **never touches Box itself**. Box stays a
   write/retain-only archive (consistent with the ADR-0012 one-way mirror).
10. **(G8 — role model; built NOW offline, gated-OFF)** **Three roles**, two built now:
    **User** (all case-intake actions) and **Admin** (settings + audit-log access) are built **now,
    offline, gated-OFF**; **Engineer** (future assessment functionality) is **DEFERRED / out of scope**.

## Consequences

- Realised as the new **Phase 9**; the bulk of it is **deferred-pending-operator** (see the per-item
  tags above), not active work.
- **As-built (2026-06-24, offline / gated-OFF — NOT live):** the Claude-buildable surface was authored this
  sweep — the retention-clock schema + `cr1bd_CASE_DISPOSITION_ENABLED` gate + `27-retention-schema.ps1`
  (items 1–2), the scheduled `case-disposition` flow + `case_disposed=100000026` (item 2), the DSAR/erasure
  runbook (item 3), `data-protection.md` (item 4), the bicep store-hardening (item 8, IaC half only —
  `cespkevidstdev01` is operator-applied), and the 3-role schema-as-code (item 10). The auditing schema-as-code
  (item 7) was already in the tree. **The operator activations (gate flip, role assignment, org-level auditing,
  the `cespkevidstdev01` hardening) are tracked in [`docs/gated.md`](../gated.md) §7 (G1–G8).**
- The **retention period + lawful basis + litigation-hold rule are `[RESERVED-FOR-USER]`** (legal).
- The inspection-address export `.xlsx` (ADR-0016) is **intentionally git-tracked** — it is critical
  corpus data and the operator has decided it stays in the repo. It is **not** treated as a
  PII-in-git problem here.

## Links

- Phase 9 plan — [`docs/plans/phase-9-data-governance/README.md`](../plans/phase-9-data-governance/README.md)
- [`docs/gated.md`](../gated.md)
- ADR-0016 (inspection-address corpus — the git-tracked EVA full-address export)

## Update (2026-06-27) — platform migration (mechanism only)

The retention / erasure / PII **decisions** stand; the **"As-built (2026-06-24)" surface** named above was
the Power Platform build (`27-retention-schema.ps1`, the `case-disposition` Power Automate flow,
`cr1bd_CASE_DISPOSITION_ENABLED`, Dataverse auditing), **deprovisioned 2026-06-27**. The Azure
equivalents: retention-clock columns + disposition live in **Postgres** + the **Data API** (gate
`CASE_DISPOSITION_ENABLED`); audit is the append-only Postgres `audit_event` table (RLS-enforced); the
role model is the Entra app-roles **`CollisionSpike.User` / `.Superuser`** (the **Admin** role above was
renamed → **Superuser**), with **`.Engineer`** deferred. The `[RESERVED-FOR-USER]` legal items and the
git-tracked corpus `.xlsx` are unchanged.

## Amendment (2026-07-13) — TKT-160 is not a retention/disposition purge

Item 9 prohibits automated retention, disposition, reconciliation and source-replay deletion. It does
not prohibit a staff member from explicitly deleting one named case image. That narrow action is
implemented as a server-authorised, durable cross-store transaction: exact case/image ownership and
Box folder/root scope are verified; the selected image's Blob and Box file are removed idempotently;
its source email/document, containing folder and sibling evidence remain untouched; and actor/outcome
audit survives the active evidence row. Partial failure is retryable and cannot be shown as success.

This exception does not choose or change any deferred retention period, lawful basis, legal-hold or
whole-case erasure policy. It cannot be invoked by a timer or disposition sweep. Operational proof is
restricted to a designated test case/folder as described in
[`docs/runbooks/delete-case-image.md`](../runbooks/delete-case-image.md).
