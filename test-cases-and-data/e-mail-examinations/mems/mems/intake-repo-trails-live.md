---
name: intake-repo-trails-live
description: "The repo intake flow definition TRAILS the live CS Intake — live has Run_enrich + Run_case_resolve wired (verified), the repo def does not; reconcile before any solution re-import."
metadata: 
  node_type: memory
  type: project
  originSessionId: 5e5bd268-e0d6-4dfb-9c9c-c735a3b9d76e
---

VERIFIED LIVE 2026-06-21 (`GET workflows(92131f3d-9cd5-4e88-aa9e-a5705a5850a0)?$select=clientdata`,
statecode=1): the live **CS Intake (shared mailbox)** invokes ALL FIVE children — classify-persist
(`2a6236f9`), parse (`468ffd29`), status-evaluate (`4d963ff7`), **enrich (`4e0f301f`)**, and
**case-resolve (`1ddb50a5`)** — plus `Scope_generate_casepo` + `Scope_capture_eml`. So **enrichment
AND auto-merge-by-registration both run live.**

**The drift:** the repo `flows/definitions/intake.definition.json` TRAILS live — it has NO
`Run_enrich` and NO `Run_case_resolve`, and its comment still rationalises case-resolve as "NOT in
this hot path." **A CollisionSpikeFlows solution re-import from the repo would REGRESS the live
wiring.** Reconcile the repo intake def (add `Run_enrich` + `Run_case_resolve` to match live) before
any re-import. Already noted in CURRENT_STATUS ("repo trails live; live is authoritative").

GOTCHA for reviews: a code-review of the **repo alone** will FALSE-POSITIVE "auto-merge never runs"
because it only reads the trailing repo def. Always verify flow wiring against the **live** clientdata
via the `az`-token Web API (see `dataverse/.build/_corpus-common.ps1` for the token pattern).
Cross-ref [[enrichment-activated]], [[queue-case-model]].
