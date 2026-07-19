---
id: TKT-253
title: Confirm-then-dispose the ambiguous image and app registration
status: backlog
priority: P2
area: platform
tickets-it-relates-to: [TKT-252, TKT-257]
research-link: docs/tickets/backlog/TKT-253-dispose-ambiguous-image-and-app-registration/evidence/distillation-note.md
plan: PLAN-009
---

# Confirm-then-dispose the ambiguous image and app registration

## Problem
Two integration-shaped resources sit in the estate that the repository does not account for: the
`valuationbot-mcp` container image and the `P2P Server` Entra app registration.

- **`valuationbot-mcp` — ownership now resolved (operator ruling, 2026-07-19).** It is an operator-owned MCP
  server, deliberately added to the subscription and used by the operator; it is **not a collisionspike
  component**. It does not function correctly on Azure, so the operator's disposition is to **decommission it
  and take it down** (delete the image repository). This ticket carries that ruling; the live deletion is
  still a separately operator-authorised mutation.
- **`P2P Server` — still unowned.** No credentials, permissions, or readable owner; it could belong to the
  AI-realignment axis or to an external party, so it cannot be deleted on sight and still needs a provenance
  pass and an explicit operator ruling before any disposal.

## Evidence
Read-only live pass 2026-07-19: `valuationbot-mcp` exists in ACR `cespkocracraeee76` (multiple tags, most
recent push 2026-06-25), distinct from the OCR image. The operator has since confirmed it is their own MCP
server, intentionally added but non-functional on Azure, and to be decommissioned (it is not a collisionspike
resource). `P2P Server` app registration exists (`appId d0b7c608-…`, single-tenant, identifier URI
`urn:p2p_cert`) with no credentials, no API permissions, and no readable owner; a backing service principal
exists. Sign-in activity is unavailable (tenant has no Entra ID P1/P2), matching the 2026-07-17 inventory's
"unknown purpose".

## Proposed change
Two phases, by design. **(a)** A read-only provenance pass per resource — creation, consumers, credential and
permission state — presented to the operator for a keep/dispose/reassign ruling. For `valuationbot-mcp` that
ruling is already on record (**dispose / decommission** — operator-owned, non-functional on Azure), so its
phase (a) is a provenance bank plus that recorded ruling; `P2P Server` still requires the full provenance pass
before a ruling. **(b)** Only after explicit operator authorisation, dispose (delete the image repository /
delete the app registration). Deletion is irreversible; this gate is non-negotiable.

## Acceptance
- **A1.** Phase (a) produces a provenance dossier for each resource in `evidence/`; no deletion occurs in
  phase (a).
- **A2.** The operator's disposition ruling is recorded per resource before any deletion: for
  `valuationbot-mcp` the ruling is **dispose (decommission)** — operator-owned, non-functional on Azure, not a
  collisionspike component; for `P2P Server` a keep / dispose / reassign ruling is captured from its
  provenance pass.
- **A3.** Deletion occurs only under explicit per-ticket operator authorisation and is verified live afterward
  (image repository absent / app registration absent) with timestamps.
- **A4.** If a ruling is "keep", that resource is instead documented (owner, purpose) and the ticket records
  that disposition; the `valuationbot-mcp` decommission is not blocked by any `P2P Server` outcome (the two
  resources are disposed independently).
- **A5.** No credential value or secret is printed, committed, or logged.

## Validation
- The provenance dossiers exist and are dated; post-disposition live checks confirm absence; a "keep" outcome
  produces a documentation entry instead. Redaction sweep clean on banked evidence.

## Research
Distilled from `03-cloud-estate-cleanup.md` scope item 2; both resources' existence and low-signal ownership
were re-verified read-only on 2026-07-19 — see the banked
[PLAN-009 live-verification dossier](../../plans/PLAN-009.dossier.md). The `valuationbot-mcp` ownership and
decommission disposition were subsequently confirmed by the operator (2026-07-19). The confirm-then-dispose
gate mirrors the draft's irreversibility requirement.

## Artifacts
- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Distillation note](./evidence/distillation-note.md)
