# Distillation note — TKT-254

**Source:** `03-cloud-estate-cleanup.md` scope item 3. **Plan:** PLAN-009. Live re-verified read-only
2026-07-19 (`PLAN-009.dossier.json`).

**EVA Key Vault `cespkevakvufa3ci`:** zero secrets (so the EVA `EVA_CLIENT_ID`/`EVA_CLIENT_SECRET` references
are unresolved). Keys and certificates could **not** be enumerated — the auditing identity holds the Key Vault
Secrets role only (ForbiddenByRbac on keys/certs). So disposal must wait on an elevated read that proves the
vault holds no keys or certificates either.

**SCM basic-publishing enabled (`scm.allow = true`)** on the helper apps: `cespike-parser-dev`, `cespkbox-fn`,
`cespkenrich-fn`, `cespkeva-fn`, `cespkeval-fn`, `cespkloc-fn`. Already disabled on `cespk-api-dev` and
`cespk-orch-dev`; the OCR app is a Container App with no Kudu/SCM surface.

**Safety:** every change here is a **live write** requiring separate operator authorisation and live
post-verification; no secret value is ever printed or committed.
