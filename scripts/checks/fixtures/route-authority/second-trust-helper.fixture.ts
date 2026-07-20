// NEGATIVE FIXTURE for check-route-authority (TKT-266). NOT production code and NOT scanned by the
// normal run (it lives outside services/<svc>/src). The unit test feeds it to analyzeAuthHelpers.
// If `reintroducedServiceAuth` below stops being flagged, or `gatedWrapper` starts being flagged,
// the internal-trust-seam guard has regressed.
//
// The imports are illustrative only — the guard is purely syntactic.
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

declare function authenticate(req: HttpRequest): Promise<{ roles?: string[] }>;
declare function toErrorResponse(e: unknown, ctx: InvocationContext): HttpResponseInit;
declare function allowedPrincipal(claims: { roles?: string[] }): boolean;

type Handler = (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;

// (a) MUST be flagged: a SECOND audience-only wrapper — authenticate then invoke the handler with no
// subject/role/scope/principal branch between them. This is the exact TKT-245 regression.
export async function reintroducedServiceAuth(
  req: HttpRequest,
  ctx: InvocationContext,
  fn: Handler,
): Promise<HttpResponseInit> {
  try {
    await authenticate(req);
  } catch (e) {
    return toErrorResponse(e, ctx);
  }
  return fn(req, ctx);
}

// (b) MUST NOT be flagged: it authenticates AND invokes the handler, but gates a PRINCIPAL first
// (allowedPrincipal). This is the withVehicleLookupAuth shape — AST precision must let it pass.
export async function gatedWrapper(
  req: HttpRequest,
  ctx: InvocationContext,
  fn: Handler,
): Promise<HttpResponseInit> {
  const claims = await authenticate(req);
  if (!allowedPrincipal(claims)) return { status: 403 };
  return fn(req, ctx);
}
