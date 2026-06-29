---
name: activation-boundary
description: Claude performs Azure activations directly (deploy, app-settings/gates, RBAC, Key Vault refs, Postgres fixes); the operator retains only secret VALUES Claude lacks, live email sends, Entra Global-Admin consent, and high-blast-radius prod cutover confirmation.
metadata:
  type: feedback
---

The operator lifted the original "build offline only" boundary: **Claude wires up the activations
itself.** On the Azure PaaS stack that means Claude may directly build + deploy the Function apps
(`cespk-api-dev` / `cespk-orch-dev`), set app-settings + flip feature gates, grant RBAC / managed-identity
roles, move secrets to Key Vault references, and correct Postgres data — then verify live where possible.

**Still the operator's (genuine gaps, not policy):**
- **Secret VALUES Claude doesn't hold** (e.g. EVA test credentials).
- **Live email sends** — Claude has no send capability, so **confirming a Graph push subscription
  actually fires is theirs**. `digital@` test sends are authorised; **never** send to the `info@` /
  `engineers@` / `desk@` live inboxes.
- **Entra Global-Admin consent** (Microsoft Graph application permissions can only be GA-consented; see
  [[exchange-rbac-unblocks-graph-intake]] for the RBAC route that sidesteps it for mailbox scopes).
- **High-blast-radius production cutover** — apply safely, then flag the single confirming step.

Non-sensitive keys (DVSA/DVLA/parser, per the operator) are **not** something to fuss about leaking.

**Why:** the predecessor tool's lack of control over live services was a problem; the operator decided
Claude should drive activations and retain only the steps Claude physically cannot do.

**How to apply:** do the activation; verify it; for anything you cannot verify (a webhook fire, a prod
cutover), apply it safely and flag the one confirming step. The live operator-blocker registry is
**`docs/gated.md`** — consult it for what currently needs the operator. Rendered UI strings must never
leak internal engineering terms. Relates to [[enrichment-mileage-caveat]], [[working-approach]].
