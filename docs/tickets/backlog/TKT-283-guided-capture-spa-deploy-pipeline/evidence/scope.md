# Scope — TKT-283 (formerly CCAP-014)

Delivered by TKT-278 Phases 4/5: `infrastructure/config-capture/capture-spa.bicep` (read-only IaC
capture, confirmed live via `az staticwebapp show`); `.github/workflows/ci.yml`'s path-filtered
`capture-e2e` job; `.github/workflows/capture-contract.yml` extended to cover the browser side.

Still open, confirmed by direct inspection: no `static-web-apps-deploy`-style job exists in `ci.yml`;
`apps/capture-web/public/staticwebapp.config.json` lacks the CSP/Permissions-Policy/Referrer-Policy/MIME
requirements from the original CCAP-014 spec; no custom domain is bound.
