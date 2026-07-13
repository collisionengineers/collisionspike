import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import type { JWTPayload } from 'jose';
import { isValidEvaMileage } from '@cs/domain';
import { authenticate, HttpError, toErrorResponse } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { callVehicleData } from '../lib/functions-client.js';
import {
  loadVehicleDataReplay,
  persistVehicleData,
  vehicleDataDigest,
} from '../lib/vehicle-data-persistence.js';
import { recomputeStatus } from './internal.js';

interface LookupBody {
  caseId?: unknown;
  registration?: unknown;
  targetDate?: unknown;
  idempotencyKey?: unknown;
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
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
    if (idempotencyKey && (!caseId || idempotencyKey.length > 200)) {
      return { status: 400, jsonBody: { error: 'idempotencyKey requires caseId and must be at most 200 characters' } };
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
      documentHasMileage = isValidEvaMileage(rows[0].eva_mileage ?? '');
      targetDate ??= isoDate(rows[0].eva_date_of_loss);
    }
    if (!registration) return { status: 400, jsonBody: { error: 'registration is required' } };

    const requestShape = {
      caseId,
      registration,
      targetDate: targetDate ?? null,
      documentHasMileage,
    };
    const requestSha256 = vehicleDataDigest(requestShape);
    if (caseId && idempotencyKey) {
      let replay;
      try {
        replay = await loadVehicleDataReplay(caseId, idempotencyKey, requestSha256);
      } catch (error) {
        throw new HttpError(409, error instanceof Error ? error.message : 'vehicle lookup retry conflict');
      }
      if (replay) {
        await recomputeStatus(caseId);
        ctx.log(JSON.stringify({ evt: 'vehicleDataLookupReplay', caseId, runId: replay.result.lookup.run_id }));
        return { status: 200, jsonBody: { ...replay.result, persisted: replay.persisted } };
      }
    }

    let result;
    try {
      result = await callVehicleData({
        registration,
        documentHasMileage,
        ...(targetDate ? { targetDate } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });
    } catch (error) {
      ctx.error(error);
      throw new HttpError(503, 'Vehicle details are temporarily unavailable.');
    }

    if (!caseId) return { status: 200, jsonBody: result };

    const persisted = await persistVehicleData(caseId, result, {
      source: idempotencyKey ? 'orchestration' : 'case_lookup',
      document_has_mileage: documentHasMileage,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
      request_sha256: requestSha256,
    });
    await recomputeStatus(caseId);
    ctx.log(JSON.stringify({ evt: 'vehicleDataLookup', caseId, runId: result.lookup.run_id, applied: persisted.applied }));
    return { status: 200, jsonBody: { ...result, persisted } };
  }),
});
