# Operator clarification — 2026-07-13

The original [cutover note](./cutover.md) is retained unchanged as source evidence. Its statement that
EVA, the Archive or Outlook may each confirm a report concerns the evidence for one case **after** the
global cutover preflight passes. It does not authorize a final cutover without a working production EVA
integration, and it does not authorize writes to a test, mirror, configured-default or Viewer-only
Archive root.

The production cutover is currently blocked on all three of these operator inputs:

1. the dated, checksum-recorded and signed-off job spreadsheet;
2. an enabled, authenticated and contract-verified production EVA API; and
3. the independently confirmed production Archive root plus explicit approval and proven
   least-privilege write/rename/merge/retarget access for the acting identity.

Until all three exist in one named cutover window, work is limited to plan/runbook hardening and offline
rehearsal. There is no authority to pause live services, deploy the cutover build, call EVA, mutate
production data, rotate subscriptions, write/rename/merge production Archive content or retarget the
application.
