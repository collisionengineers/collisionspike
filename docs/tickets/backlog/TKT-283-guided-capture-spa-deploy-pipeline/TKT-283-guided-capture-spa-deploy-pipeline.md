---
id: TKT-283
title: Guided capture — SPA CI deploy pipeline, CSP headers, and custom domain
status: backlog
priority: P2
area: infra
tickets-it-relates-to: [TKT-278]
research-link: docs/tickets/backlog/TKT-283-guided-capture-spa-deploy-pipeline/evidence/scope.md
---

# Guided capture — SPA CI deploy pipeline, CSP headers, and custom domain

## Problem

Renumbered and narrowed from collisioncapture's `CCAP-014-swa-hosting-ci-deploy` during the TKT-278
repository merge. TKT-278 Phase 4/5 already delivered: `infrastructure/config-capture/capture-spa.bicep`
(read-only IaC capture of the live `cespk-capture-spa-dev` Standard SWA) and a path-filtered
`capture-e2e` Playwright job plus an extended `capture-contract.yml`. Still missing, verified against the
live app:

- No CI **deploy** job targets the capture SPA (`ci.yml` has no `static-web-apps-deploy`-style job for
  it) — the resource was provisioned once via the SWA CLI, not by a repeatable pipeline.
- `apps/capture-web/public/staticwebapp.config.json` is minimal (SPA fallback, a blanket no-store
  header, immutable asset caching) — it has none of the original CCAP-014 security-header requirements
  (CSP `script-src`/`worker-src`/`connect-src` scoped to the evidence/model blob origins,
  `Permissions-Policy: camera=(self)`, `Referrer-Policy: no-referrer`, `.wasm`/`.onnx` MIME types).
- No custom domain is bound (`capture.collisionengineers.co.uk` remains NXDOMAIN, gated on PAYG + DNS
  per the original deployment plan).

## Evidence

- [Scope](./evidence/scope.md) — what Phase 4/5 delivered vs. what's still open, with file references.

## Proposed change

Add a real CI deploy job for `cespk-capture-spa-dev` (following this repo's other deploy-gate
conventions — main-branch-only, per `docs/operations/deployment.md`); write the full CSP/
Permissions-Policy/Referrer-Policy/MIME-type security-header set into
`staticwebapp.config.json`; bind the custom domain once PAYG + DNS are confirmed by the operator.

## Acceptance

- A CI job deploys the capture SPA on main-branch changes, replacing the one-off SWA-CLI provisioning.
- `staticwebapp.config.json` carries the full security-header set this flow's threat model requires.
- The custom domain is bound and verified only after the operator confirms PAYG + DNS — this ticket does
  not itself authorize that spend/DNS change.

## Artifacts

- [Changes made](./changes.md)
- [Verification](./verification.md)
- [Scope](./evidence/scope.md)
