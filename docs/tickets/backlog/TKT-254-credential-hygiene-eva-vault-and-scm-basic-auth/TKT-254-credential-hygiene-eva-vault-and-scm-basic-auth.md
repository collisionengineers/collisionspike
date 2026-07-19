---
id: TKT-254
title: Close credential hygiene on the EVA vault and helper-app SCM basic auth
status: backlog
priority: P1
area: platform
tickets-it-relates-to: [TKT-252, TKT-255, TKT-257]
research-link: docs/tickets/backlog/TKT-254-credential-hygiene-eva-vault-and-scm-basic-auth/evidence/distillation-note.md
plan: PLAN-009
---

# Close credential hygiene on the EVA vault and helper-app SCM basic auth

## Problem
Two credential-hygiene gaps: the EVA app's client-id/secret references point at a Key Vault that holds no
secrets (so the references are unresolved); and several helper function apps still allow SCM/Kudu
basic-publishing credentials — a passwordless-posture regression.

**Out of scope — CarClaims is off-limits.** `cloud-inventory-2026-07-17.md` flags the `CarClaims Website` app
registration (expired secret, Graph mail consent) as a "[Security — act]" item, but per the hard repository
rule (AGENTS.md → Live-system safety) **CarClaims must never be touched** — no rotate, revoke, retire, or any
mutation. It is deliberately excluded from this ticket and is not a remediation target here or anywhere.

## Evidence
Read-only live pass 2026-07-19: Key Vault `cespkevakvufa3ci` returned zero secrets; its keys and certificates
could not be enumerated by the auditing identity (Key Vault RBAC granted Secrets only, `ForbiddenByRbac` on
keys/certs), so "truly empty" is confirmed for secrets but not yet for keys/certs. SCM basic-publishing
(`basicPublishingCredentialsPolicies/scm`, `allow = true`) is enabled on the helper apps `cespike-parser-dev`,
`cespkbox-fn`, `cespkenrich-fn`, `cespkeva-fn`, `cespkloc-fn` — **five** apps. (`cespkeval-fn` /
`cespkeval-fn-6c6fxd` also currently shows `allow = true`, but it is the EVA-validation app that **TKT-252
retires first**, so it is deliberately excluded from this remediation list — do not confuse it with the kept
EVA Sentry app `cespkeva-fn`, one letter apart.) SCM is already disabled on the two app-tier apps
(`cespk-api-dev`, `cespk-orch-dev`), and the OCR app is Functions-on-Container-Apps (`serverFarmId = null`,
no Kudu/SCM surface).

## Proposed change
Resolve the dangling EVA references (populate the vault or remove the references from the consuming config),
then dispose the EVA Key Vault only once an elevated read confirms it holds no secrets, keys, or certificates.
Separately, disable SCM/Kudu basic-publishing on the five helper apps that still allow it (excluding the
TKT-252-retired EVA-validation app) **and encode that disabled policy in the retained bicep** so a recreated
app cannot silently re-enable basic publishing — this is coordinated with TKT-255's bicep rationalisation, as
no `basicPublishingCredentialsPolicies` resource exists in any `services/functions/*/infra/main.bicep` today.
All live writes are operator-authorised and verified live. **CarClaims is not in scope and is never touched.**

## Acceptance
- **A1.** The EVA client-id/secret references are either resolved (vault populated) or removed from the
  consuming configuration, recorded per reference.
- **A2.** Before the EVA Key Vault is disposed, an elevated read confirms zero secrets **and** zero
  keys/certificates; disposal occurs only under operator authorisation and is verified live.
- **A3.** SCM/Kudu basic-publishing credentials are disabled on the five helper apps that currently allow it
  (`cespike-parser-dev`, `cespkbox-fn`, `cespkenrich-fn`, `cespkeva-fn`, `cespkloc-fn`; the EVA-validation app
  is excluded because TKT-252 retires it first); each is verified live (`scm` policy `allow = false`) with
  timestamps.
- **A3b.** The disabled SCM policy is persisted in the retained per-service bicep
  (`basicPublishingCredentialsPolicies/scm` with `allow: false`), coordinated with TKT-255, and verified by a
  what-if / recreation check so a redeploy preserves the passwordless posture — the live mutation alone is not
  sufficient closure.
- **A4.** No secret value is printed, committed, or logged at any step.
- **A5.** Before/after cloud-inventory runs are banked into `evidence/`; the redaction sweep exits clean.
- **A6.** CarClaims is not touched by this ticket in any way (no rotate / revoke / retire / read-for-mutation);
  it is recorded as off-limits per AGENTS.md and left entirely alone.

## Validation
- Per-reference resolution recorded; elevated vault read evidence banked; live `scm` policy shows `false` on
  each of the five helper apps post-change and the retained bicep encodes the same (what-if / recreation
  check); inventory diff before/after. CarClaims is untouched throughout.

## Research
Distilled from `03-cloud-estate-cleanup.md` scope item 3; the empty-secrets state, the RBAC read limitation on
keys/certs, and the exact set of SCM-basic-auth helper apps were re-verified read-only on 2026-07-19 — see the
banked [PLAN-009 live-verification dossier](../../plans/PLAN-009.dossier.md). The `cespkeval-fn` exclusion
(retired by TKT-252) and the absence of any `basicPublishingCredentialsPolicies` resource in the per-service
bicep are the corrections folded in here. CarClaims, though flagged in the inventory, is **explicitly out of
scope** — a hard repository rule forbids touching it (AGENTS.md → Live-system safety).

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
