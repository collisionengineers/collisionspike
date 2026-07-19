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
Two undocumented, integration-shaped resources sit in the estate with no clear owner: the `valuationbot-mcp`
container image and the `P2P Server` Entra app registration. Either could belong to the AI-realignment axis or
to an external party, so neither can be deleted on sight.

## Evidence
Read-only live pass 2026-07-19: `valuationbot-mcp` exists in ACR `cespkocracraeee76` (multiple tags, most
recent push 2026-06-25), distinct from the OCR image. `P2P Server` app registration exists
(`appId d0b7c608-…`, single-tenant, identifier URI `urn:p2p_cert`) with no credentials, no API permissions,
and no readable owner; a backing service principal exists. Sign-in activity is unavailable (tenant has no
Entra ID P1/P2), matching the 2026-07-17 inventory's "unknown purpose".

## Proposed change
Two phases, by design. **(a)** A read-only provenance pass per resource — creation, consumers, credential and
permission state — presented to the operator for a keep/dispose/reassign ruling. **(b)** Only after explicit
operator authorisation, dispose (delete the image repository / delete the app registration). Deletion is
irreversible; this gate is non-negotiable.

## Acceptance
- **A1.** Phase (a) produces a provenance dossier for each resource in `evidence/`; no deletion occurs in
  phase (a).
- **A2.** The operator's disposition ruling (keep / dispose / reassign to the AI-realignment axis) is recorded
  per resource before any deletion.
- **A3.** Deletion occurs only under explicit per-ticket operator authorisation and is verified live afterward
  (image repository absent / app registration absent) with timestamps.
- **A4.** If the ruling is "keep", the resource is instead documented (owner, purpose) and the ticket closes
  with that recorded disposition.
- **A5.** No credential value or secret is printed, committed, or logged.

## Validation
- The provenance dossiers exist and are dated; post-disposition live checks confirm absence; a "keep" outcome
  produces a documentation entry instead. Redaction sweep clean on banked evidence.

## Research
Distilled from `03-cloud-estate-cleanup.md` scope item 2; both resources' existence and low-signal ownership
were re-verified read-only on 2026-07-19 (`PLAN-009.dossier`). The confirm-then-dispose gate mirrors the
draft's irreversibility requirement.

## Artifacts
- [Distillation note](./evidence/distillation-note.md)
