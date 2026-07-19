# Distillation note — TKT-265

**Source:** `02-canonical-service-routes.md` step 5. **Plan:** PLAN-008. Re-verified read-only 2026-07-19
(`PLAN-008.dossier.json`).

**Three request lanes in data-api:** staff-facing (`platform/auth/staff-auth.js`, `withRole`), internal-MSI
(`register-internal-routes.ts` behind `withServiceAuth`), and the **BFF proxy**
(`platform/http/proxy-routes.ts`, "auxiliary BFF proxy routes ... not part of the frozen DataAccess contract").

**Duplication:** `proxy-routes.ts` re-exposes `POST /api/parser/parse` (→ `callParser`) and
`POST /api/location-assist/suggest` (→ `callLocationSuggest`) through data-api's `service-client.ts` — the same
parser + location-suggest capabilities orchestration reaches directly. A third path to the same capability.

**Sequencing:** settle one canonical path once the SPA-transport migration is confirmed complete; after
TKT-262 collapses the client. Preserve staff-auth + gated routes.
