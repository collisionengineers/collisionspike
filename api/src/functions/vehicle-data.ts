import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import type { JWTPayload } from 'jose';
import { authenticate, HttpError, toErrorResponse } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { callVehicleData } from '../lib/functions-client.js';
import { persistVehicleData } from '../lib/vehicle-data-persistence.js';
import { AUDIT_ACTION, writeAudit } from '../lib/audit.js';
import { recomputeStatus } from './internal.js';

interface LookupBody {
  caseId?: unknown;
  registration?: unknown;
  targetDate?: unknown;
}

type CaseLookupRow = {
  vrm: string | null;
  eva_mileage: string | null;
  eva_date_of_loss: string | null;
};

function allowedPrincipal(claims: JWTPayload): boolean {
  const roles = Array.isArray(claims.roles) ? claims.roles.filter((v): v is string => typeof v === 'string') : [];
  const staff = roles.some((role) =>
    ['CollisionSpike.User', 'CollisionSpike.Superuser', 'CollisionSpike.Admin'].includes(role),
  );
  const appOnly = claims.idtyp === 'app' || (!claims.scp && !claims.preferred_username);
  return staff || appOnly;
}

function withVehicleLookupAuth(
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>,
): (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit> {
  return async (req, ctx) => {
    try {
      const claims = await authenticate(req);
      if (!allowedPrincipal(claims)) return { status: 403, jsonBody: { error: 'forbidden' } };
      return await handler(req, ctx);
    } catch (error) {
      return toErrorResponse(error, ctx);
    }
  };
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const dmy = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : undefined;
}

app.http('vehicleDataLookup', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'vehicle-data/lookup',
  handler: withVehicleLookupAuth(async (req, ctx) => {
    const body = (await req.json().catch(() => ({}))) as LookupBody;
    const caseId = typeof body.caseId === 'string' ? body.caseId.trim() : '';
    const previewRegistration = typeof body.registration === 'string' ? body.registration.trim() : '';
    if ((!caseId && !previewRegistration) || (caseId && previewRegistration)) {
      return { status: 400, jsonBody: { error: 'supply either caseId or registration' } };
    }
    if (body.targetDate !== undefined && !isoDate(body.targetDate)) {
      return { status: 400, jsonBody: { error: 'targetDate must be YYYY-MM-DD' } };
    }

    let registration = previewRegistration;
    let documentHasMileage = false;
    let targetDate = isoDate(body.targetDate);
    if (caseId) {
      const rows = await query<CaseLookupRow>(
        'SELECT vrm, eva_mileage, eva_date_of_loss FROM case_ WHERE id = $1',
        [caseId],
      );
      if (!rows[0]) return { status: 404, jsonBody: { error: 'case not found' } };
      registration = rows[0].vrm?.trim() ?? '';
      documentHasMileage = Boolean(rows[0].eva_mileage?.trim());
      targetDate ??= isoDate(rows[0].eva_date_of_loss);
    }
    if (!registration) return { status: 400, jsonBody: { error: 'registration is required' } };

    let result;
    try {
      result = await callVehicleData({ registration, documentHasMileage, ...(targetDate ? { targetDate } : {}) });
    } catch (error) {
      ctx.error(error);
      throw new HttpError(503, 'Vehicle details are temporarily unavailable.');
    }

    if (!caseId) return { status: 200, jsonBody: result };

    const persisted = await persistVehicleData(caseId, result, {
      source: 'case_lookup',
      document_has_mileage: documentHasMileage,
    });
    await recomputeStatus(caseId);
    await writeAudit({
      action: AUDIT_ACTION.enrichment_called,
      caseId,
      summary: `Vehicle details checked: ${persisted.applied.length ? persisted.applied.join(', ') : 'no empty fields filled'}`,
      after: {
        runId: result.lookup.run_id,
        lookupStatus: result.lookup.status,
        mileageStatus: result.mileage.status,
        applied: persisted.applied,
        warning: persisted.warning ?? null,
      },
    });
    ctx.log(JSON.stringify({ evt: 'vehicleDataLookup', caseId, runId: result.lookup.run_id, applied: persisted.applied }));
    return { status: 200, jsonBody: { ...result, persisted } };
  }),
});
