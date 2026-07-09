# Changes — TKT-010: Delete/remove case with confirm + optional Box-folder removal

## Status
Blocked (operator) — soft-remove + confirm dialog are coded and live enum rows applied; the action is
Superuser-gated and the operator's principal is not yet app-role-assigned `CollisionSpike.Superuser`.

## Commits
- `94902ce` — mega-commit implementing TKT-001..014,019,020 → added the soft-remove case action, the
  confirm dialog, and the supporting status/enum rows.
- `d5e2d4b` — add the 3 missing case Box API routes the SPA calls (Open-in-Box 404 fix) → file
  `api/src/functions/cases.ts`; included the delete/finalize plumbing the delete action depends on.

## Files touched
- `api/src/functions/cases.ts` (delete/finalize plumbing + Box routes).
- SPA delete-case action + confirm dialog with the Box-folder tickbox (within the `94902ce` change set).

## Summary
A soft-remove case action with a confirmation dialog (including the optional "also remove Box folder"
tickbox) is coded and the live enum rows are applied; deletion is audited against the append-only trail.
Per ADR-0017, the Box side is ACK-only — there is no automated Box delete — so the tickbox records an
operator acknowledgement rather than triggering an automated Box folder deletion; reconcile the ticket
text accordingly. The action is Superuser-gated and cannot be exercised until the operator grants the
app-role.

---

## 2026-07-09 — Re-scope DELIVERED: "Close case", all staff, NON-destructive (PLAN-003 UI wave)

**SEMANTICS CHANGE (prominent).** Per the 2026-07-08 operator re-scope, the action is now a
**Close**, not a delete, and it is **no longer destructive**:

- **Role guard relaxed** — `DELETE /api/cases/{id}` (`api/src/functions/cases.ts`) is now
  `withRole('CollisionSpike.User')` (was Superuser). This also dissolves the old operator block
  (Superuser assignment no longer needed for this action).
- **PII anonymisation REMOVED from this path.** The old handler blanked the 12 EVA fields, VRM,
  name, all ov_* facts, claimant address, and scrubbed note/evidence/inbound_email rows. The new
  handler writes ONLY `status_code -> 'removed'` (terminal; UI wording "Closed"), `on_hold=false`,
  `closed_at=now()` — the case keeps every detail and is **reversible in principle**. Data-protection
  ERASURE remains a separate, deliberate operator action (ADR-0017 / data-protection.md) — this
  button no longer performs it.
- Audit kept: one `case_removed` row, summary "Case closed: …", the archive ACK + optional reason in
  `after`. Box folder removal stays ACK-only (ADR-0017) — never automated.
- Idempotent re-close unchanged (`alreadyRemoved: true`).

**SPA (`mockup-app/src/screens/CaseDetail.tsx` + `components/StatusBadge.tsx`)**:
- Overflow menu now renders for ALL staff (`useIsSuperuser` gate dropped); item reads **"Close
  case…"** (FolderClosed icon, no Trash iconography).
- Dialog: title "Close case"; info bar **"Close case — it will leave the work queues. Nothing is
  deleted. Every detail stays on the record…"**; the typed-confirm friction + archive ACK + optional
  reason are KEPT; buttons "Close case"/"Closing…"; toasts "Case closed"/"Case already closed".
- Closed-case banner: "This case is closed — It has left the work queues. Nothing was deleted…";
  the status chip label for the stored `removed` state now reads **"Closed"** (muted, FolderClosed).

**Tests** — new `api/src/functions/cases-close.test.ts` (registration-capture + real-jose harness):
pins the **User-role 200** (the guard relaxation), 401/403, the non-destructive UPDATE (no PII
blanking SQL, no note/evidence/inbound scrubs), the "Case closed" `case_removed` audit with the
audit-only ACK, idempotent re-close, 404.

**Deploy + live proof**: api republished + SPA deployed. Live E2E: closed case
`f94fee69-117e-4682-8b53-54c6cbf288a7` (TE57IMG) via the dialog → toast "Case closed" → reopened by
URL: banner "This case is closed", VRM/model/details ALL intact, status chip "Closed". Evidence:
`evidence/live-close-case-dialog.png`, `evidence/live-closed-case-non-destructive.png`.

**Remainders**: the queues hide closed cases (terminal status owns no queue) — unchanged; a
"reopen" affordance doesn't exist yet (reversible in principle via a status write; suggest a
follow-up ticket if staff need it in-app).
