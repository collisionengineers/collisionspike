# Changes — TKT-283: Guided capture SPA CI deploy pipeline, CSP, custom domain

## Status
backlog

## Commits
No code changes (beyond what TKT-278 already delivered under its own tracking — see that ticket).

## Files touched
- n/a

## Summary
Renumbered and narrowed from collisioncapture's `CCAP-014` during the TKT-278 repository merge; hosting
capture and CI test/contract coverage were delivered under TKT-278 itself. This ticket covers only the
remaining CI deploy job, security headers, and custom domain, and stays `backlog` until scheduled.

## 2026-07-21 — manual deploy route now documented (does not close this ticket)
The **manual** SWA-CLI deploy route for `cespk-capture-spa-dev` (`npm run build --workspace @cs/capture-web`
→ `swa deploy apps/capture-web/dist --deployment-token …`, with the `capture-spa.bicep` IaC reference) was
added to `docs/operations/deployment.md` as a "Guided-capture SPA" runbook, so the folded-in capture app
has a documented deployment route on parity with the other deployables. This ticket's actual scope is
**unchanged and still open**: the repeatable CI deploy job, the full CSP/Permissions-Policy/Referrer-Policy/
MIME security-header set, and the custom-domain binding all remain to be done and stay operator-gated.
