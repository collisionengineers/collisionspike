---
id: TKT-254
title: Close credential hygiene on the EVA vault and helper-app SCM basic auth
status: backlog
priority: P1
area: platform
tickets-it-relates-to: [TKT-252, TKT-257]
research-link: docs/tickets/backlog/TKT-254-credential-hygiene-eva-vault-and-scm-basic-auth/evidence/distillation-note.md
plan: PLAN-009
---

# Close credential hygiene on the EVA vault and helper-app SCM basic auth

## Problem
Two credential-hygiene gaps: the EVA app's client-id/secret references point at a Key Vault that holds no
secrets (so the references are unresolved), and several helper function apps still allow SCM/Kudu
basic-publishing credentials — a passwordless-posture regression.

## Evidence
Read-only live pass 2026-07-19: Key Vault `cespkevakvufa3ci` returned zero secrets; its keys and certificates
could not be enumerated by the auditing identity (Key Vault RBAC granted Secrets only), so "truly empty" is
confirmed for secrets but not yet for keys/certs. SCM basic-publishing (`basicPublishingCredentialsPolicies/scm`,
`allow = true`) is enabled on the helper apps `cespike-parser-dev`, `cespkbox-fn`, `cespkenrich-fn`,
`cespkeva-fn`, `cespkeval-fn`, `cespkloc-fn`; it is already disabled on the two app-tier apps, and the OCR app
is a Container App with no SCM surface.

## Proposed change
Resolve the dangling EVA references (populate the vault or remove the references from the consuming config),
then dispose the EVA Key Vault only once an elevated read confirms it holds no secrets, keys, or certificates.
Separately, disable SCM/Kudu basic-publishing on the helper apps that still allow it. All live writes are
operator-authorised and verified live.

## Acceptance
- **A1.** The EVA client-id/secret references are either resolved (vault populated) or removed from the
  consuming configuration, recorded per reference.
- **A2.** Before the EVA Key Vault is disposed, an elevated read confirms zero secrets **and** zero
  keys/certificates; disposal occurs only under operator authorisation and is verified live.
- **A3.** SCM/Kudu basic-publishing credentials are disabled on the helper apps that currently allow it; each
  is verified live (`scm` policy `allow = false`) with timestamps.
- **A4.** No secret value is printed, committed, or logged at any step.
- **A5.** Before/after cloud-inventory runs are banked into `evidence/`; the redaction sweep exits clean.

## Validation
- Per-reference resolution recorded; elevated vault read evidence banked; live `scm` policy shows `false` on
  each helper app post-change; inventory diff before/after.

## Research
Distilled from `03-cloud-estate-cleanup.md` scope item 3; the empty-secrets state, the RBAC read limitation on
keys/certs, and the exact set of SCM-basic-auth helper apps were re-verified read-only on 2026-07-19
(`PLAN-009.dossier`).

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
