# Historical Power Platform Box remaining steps — non-executable pointer

> **DO NOT EXECUTE THE FORMER COMMANDS OR OWNER LABELS FROM THIS FILE.** The June 2026 steps targeted the
> retired Power Platform/Dataverse/flow implementation and stale Box activation state. The environment was
> deprovisioned on 2026-06-27, and the former live Box/Key Vault/webhook/gate commands were removed on
> 2026-07-14 so they cannot become an alternate cutover path. Git history retains them as provenance.

For current work use:

- [Test-folder-only Box tooling](../../../tools/box/README.md) — permanently pinned to `392761581105`; no
  production bypass
- [TKT-178 hard blockers and missing implementation](../../tickets/blocked/TKT-178-production-archive-cutover-reconciliation/TKT-178-production-archive-cutover-reconciliation.md)
- [Future cutover specification](../go-live/runbook.md)
- [Verified live registry](../../architecture/live-environment.md)

No production Archive root/write, webhook targeting, EVA action, Outlook mutation or database cutover is
authorized. Outside a separately approved future TKT-178 window, Outlook is read-only and Archive writes stay
inside the pinned test folder.
