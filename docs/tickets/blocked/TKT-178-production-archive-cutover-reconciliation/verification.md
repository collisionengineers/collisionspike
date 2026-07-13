# Verification — TKT-178: Reconcile active cases and the Archive at production cutover

## Verdict
PENDING

## Acceptance evidence matrix

| Acceptance | Offline/rehearsal evidence required | Signed-in/live evidence required | Verdict |
|---|---|---|---|
| A1 — all execution gates fail closed | Input-contract tests reject any missing job sheet/hash/signature, EVA probe, exact production root/write authority, backup/restore proof, frozen dry-run hash or named window approval; test/mirror/default/Viewer-only roots are refused. | Signed-in preflight records every approved artifact, successful EVA probe, exact root and acting-identity permissions, deployed versions, backups, dry-run hash and approval references. | PENDING |
| A2 — restorable backups and inventories | Snapshot/restore rehearsal reconstructs every scoped relationship and Archive object with matching hashes/IDs or documented provider-safe replacements. | Authenticated immutable backup manifests are captured and restore access is confirmed before production writes. | PENDING |
| A3 — complete deterministic ledger | Fixture union tests prove no job-sheet or system row is omitted and every required field/outcome is populated. | Read-only production counts independently reconcile job sheet, cases and scoped folders to the frozen ledger. | PENDING |
| A4 — precedence and ambiguity refusal | Matching tests cover exact, normalized, weak, one-to-many and conflicting cases and assert only unambiguous high-strength matches proceed. | Independent reviewer samples each live match class and every ambiguous row remains held before approval. | PENDING |
| A5 — one qualifying completion signal | EVA/Archive/Outlook fixtures prove each permitted case-specific report signal and reject generic/draft/estimate/inbound controls. | Every proposed production completion links to inspectable authenticated source evidence from at least one permitted system. | PENDING |
| A6 — EVA is a mandatory whole-run gate | Gate/auth/contract tests prove every unavailable, disabled, unauthenticated, misrouted or incomplete state aborts before mutation; no `not queried` path may proceed. | A successful authenticated non-mutating production EVA contract probe is captured before the execution window; every scoped ledger row records its EVA query result. | PENDING |
| A7 — immutable zero-write dry-run and approval | Mutation spies/database/provider fixtures prove dry-run has no writes and output/rollback plans are deterministic and hashable. | Production audit/network logs show zero writes during dry-run and retain named approval of the frozen hash. | PENDING |
| A8 — lossless canonical rename/merge | Snapshot executor tests preserve every listed record/byte and deduplicate only stable-ID/hash twins under normal and fault paths. | Approved production before/after samples reconcile cases, folders, unique hashes, notes, links, decisions and audits. | PENDING |
| A9 — conflicts stop one row without overwrite | Collision/missing-byte/human-conflict fixtures prove row-local hold, continued run and resumable decision path. | Each live held conflict shows its reason and unchanged before-state; unrelated approved rows can complete. | PENDING |
| A10 — Outlook read-only and separately authorized writes | Graph/provider call tests reject Outlook mutations, Viewer-only Archive authority and any target/action absent from the frozen ledger/root/permission scope. | Authenticated Graph/audit evidence shows Outlook reads only; the acting Archive identity's least-privilege write scope and exact approval are proven before every production write beneath the approved root. | PENDING |
| A11 — idempotent checkpointed execution | Replay, response-loss, interruption and partial-failure tests assert one case/Case-PO/folder/byte/link/status transition. | Reconcile checkpoint/resume on a genuine approved ledger operation if naturally required; do not interrupt production solely for proof. | PENDING |
| A12 — evidence-based completed placement | Status tests map qualifying evidence to existing completed categories and retain active/held state for negative and conflicting rows. | Signed-in UI plus database/source checks prove each sampled completed row and each retained active/held control. | PENDING |
| A13 — guarded production-root retarget | Configuration/restart/rollback tests reject retarget outside the named window, wrong identity/root/scope or before invariants, and preserve the prior value for tested recovery. | Record exact approved root, actor, permission scope, window, config change and health; the next genuine operator-designated case archives below it with plain UI copy. | PENDING |
| A14 — 100% final accounting and invariants | Reconciliation tests fail on omitted rows, duplicate Case/PO/folder identity, orphan links, missing notes/hashes or unsupported completion. | Independent production queries and signed-in samples account for every ledger row and prove all aggregate invariants. | PENDING |
| A15 — runnable runbook and independent verification | A second operator follows the rehearsal runbook through interruption and rollback without undocumented steps. | Independent verifier samples every production outcome class against job sheet and retained source evidence before sign-off. | PENDING |

## Pending / gaps
TKT-178 is **BLOCKED**. The signed job sheet has not been supplied; the production EVA API is not
enabled, authenticated and verified; and the production Archive target plus write/rename/merge/retarget
authorization have not been approved or proven. No live cutover, deployment, production mutation, EVA
call or Archive retarget has run.

## How to re-verify
Do not execute from this ticket. First complete the offline runbook and rehearsal evidence. Only after
all three operator inputs and the remaining gates exist in one named window may future implementation
attach authenticated live evidence to every matrix row. Preserve the dry-run approval hash and backups,
and keep `PENDING` until an independent verifier certifies all fifteen acceptance lines.
