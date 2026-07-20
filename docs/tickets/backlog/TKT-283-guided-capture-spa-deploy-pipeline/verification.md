# Verification — TKT-283: Guided capture SPA CI deploy pipeline, CSP, custom domain

## Verdict
PARTIALLY IMPLEMENTED — hosting IaC capture and CI test/contract jobs shipped under TKT-278; deploy job,
security headers, and custom domain remain outstanding.

## Evidence
`infrastructure/config-capture/capture-spa.bicep` compiles offline and matches live `az staticwebapp
show` output (Standard SKU, West Europe, linked backend `cespk-api-dev`). No deploy job, no expanded
`staticwebapp.config.json`, no custom domain.

## Pending / gaps
- CI deploy job for the capture SPA.
- Full CSP/Permissions-Policy/Referrer-Policy/MIME-type header set.
- Custom domain binding (operator PAYG + DNS prerequisite).

## How to re-verify
Add the deploy job, expand `staticwebapp.config.json`, verify headers via a live response check, and
bind the domain only after the operator confirms the PAYG/DNS prerequisite.
