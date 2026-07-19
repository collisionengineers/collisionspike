# Changes — TKT-245: Decide and harden the internal service-trust seam (withServiceAuth)

## Status

Implemented on branch `plan008/canonical-routes`. Behaviour-preserving; no live write.

## Decision

The internal `withServiceAuth` trust model is **decided: audience-only admission is AFFIRMED**. The seam
admits any token valid for the API's Entra audience with no subject/scp/app-role check. This is affirmed
(not silently kept) because the API's audience is not a public-client audience — only principals with an
app-role assignment to the API can mint a token for it — and its two legitimate managed-identity callers,
the **orchestration** app and the **Archive (box-webhook) Function**, both hold that assignment.

Hardening (an oid/appid principal allowlist, or a dedicated app-role admitting BOTH those MSIs) is
**operator-gated** and NOT built here: it changes live token admission, and hardening for only one
principal would break the other — forbidden by PLAN-006/PLAN-008's behaviour-preserving invariant.

## What changed

- `services/data-api/src/features/archive/mirror-outbox-routes.ts`: deleted the local divergent
  `withServiceAuth` copy (lines 41-53) and its now-unused `authenticate`/`toErrorResponse` and
  `HttpRequest`/`HttpResponseInit`/`InvocationContext` imports; imports the one shared
  `withServiceAuth` from `../inbound/internal/service-support.js` (the same path the sibling
  `provider-outbox-routes.ts` / `internal-evidence-routes.ts` use). The three route call sites are
  **byte-identical** — the shared helper's `(req, ctx)` signature accepts the zero-arg closures unchanged.
- `services/data-api/src/features/inbound/internal/service-support.ts`: added the TRUST MODEL docblock
  affirming audience-only admission and naming the two legitimate callers + the operator-gated hardening path.
- `docs/adr/0029-staff-identity-jose-msal-pkce.md`: dated amendment recording the decision.

Exactly one `withServiceAuth` implementation now remains repo-wide.
