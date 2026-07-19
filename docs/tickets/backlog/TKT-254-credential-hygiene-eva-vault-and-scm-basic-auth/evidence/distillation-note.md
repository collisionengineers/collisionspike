# Distillation note — TKT-254

**Source:** `03-cloud-estate-cleanup.md` scope item 3. **Plan:** PLAN-009. Live re-verified read-only
2026-07-19 — banked in the [PLAN-009 live-verification dossier](../../../plans/PLAN-009.dossier.md).

**EVA Key Vault `cespkevakvufa3ci`:** zero secrets (so the EVA `EVA_CLIENT_ID`/`EVA_CLIENT_SECRET` references
are unresolved). Keys and certificates could **not** be enumerated — the auditing identity holds the Key Vault
Secrets role only (ForbiddenByRbac on keys/certs). So disposal must wait on an elevated read that proves the
vault holds no keys or certificates either.

**SCM basic-publishing enabled (`scm.allow = true`)** on the helper apps: `cespike-parser-dev`, `cespkbox-fn`,
`cespkenrich-fn`, `cespkeva-fn`, `cespkloc-fn` — **five** apps for remediation. `cespkeval-fn`
(`cespkeval-fn-6c6fxd`) also shows `allow = true` but is **excluded**: it is the EVA-validation app TKT-252
retires first, and it differs by one letter from the kept EVA Sentry app `cespkeva-fn` (`cespkeva-fn-ufa3ci`)
— an easy fat-finger under authorisation, so the exclusion is called out explicitly. Already disabled on
`cespk-api-dev` and `cespk-orch-dev`; the OCR app is Functions-on-Container-Apps (`serverFarmId = null`, no
Kudu/SCM surface).

**No IaC persistence today:** no `basicPublishingCredentialsPolicies` resource exists in any
`services/functions/*/infra/main.bicep`, so a redeploy would re-enable basic publishing. The disabled policy
must be encoded in the retained bicep (coordinated with TKT-255), not just mutated live.

**CarClaims — OFF-LIMITS, out of scope.** `docs/operations/cloud-inventory-2026-07-17.md` flags the
`CarClaims Website` app-registration secret as expired 2026-04-29 (Graph mail consent) as a "[Security — act]"
item. A **hard repository rule** (AGENTS.md → Live-system safety) forbids touching CarClaims — no rotate,
revoke, retire, or any mutation. It is deliberately excluded from this ticket and is never a remediation
target. (An earlier draft of this ticket wrongly folded in a CarClaims disposition; that has been removed.)

**Safety:** every change here is a **live write** requiring separate operator authorisation and live
post-verification; no secret value is ever printed or committed.
