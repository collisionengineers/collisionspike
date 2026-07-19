# Distillation note — TKT-265

**Source:** `workingspace/architecture-simplification/02-canonical-service-routes.md` step 5. **Plan:**
PLAN-008. Corrected against current source and read-only live configuration on 2026-07-19.

**Three request lanes in data-api:** staff-facing (`platform/auth/staff-auth.js`, `withRole`), internal-MSI
(`register-internal-routes.ts` behind `withServiceAuth`), and the **BFF proxy**
(`platform/http/proxy-routes.ts`, "auxiliary BFF proxy routes ... not part of the frozen DataAccess contract").

**Actual ownership:** `proxy-routes.ts` exposes `POST /api/parser/parse` and
`POST /api/location-assist/suggest` through data-api's client. The SPA calls those authenticated routes.
Orchestration's same-named methods have no production caller; live orchestration has no `LOCATION_FN_*`
setting. The apparent duplicate path is dead client surface, not a second working route.

**Sequencing:** remove and guard the dead orchestration exports before TKT-262 consolidates active client
methods. Preserve the SPA transports, staff BFF, role checks, gates, and downstream Function routes.
