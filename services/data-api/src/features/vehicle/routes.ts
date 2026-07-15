import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import type { JWTPayload } from 'jose';
import { canonicalizeVrm, isValidEvaMileage } from '@cs/domain';
import { authenticate, HttpError, toErrorResponse } from '../../platform/auth/staff-auth.js';
import { query } from '../../platform/db/client.js';
import { callVehicleData } from '../../platform/http/service-client.js';
import {
  loadVehicleDataReplay,
  persistVehicleData,
  vehicleDataDigest,
} from './persistence.js';
import { recomputeStatus } from '../inbound/internal/service-support.js';

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
  if (staff) return true;
  const appOnly = claims.idtyp === 'app' || (!claims.scp && !claims.preferred_username);
  if (!appOnly) return false;
  const claimBag = claims as Record<string, unknown>;
  const clientId = typeof claimBag.azp === 'string'
    ? claimBag.azp
    : typeof claimBag.appid === 'string'
      ? claimBag.appid
      : '';
  const allowedServiceClients = new Set(
    (process.env.VEHICLE_DATA_SERVICE_CLIENT_IDS ?? '')
      .split(/[;,\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  return Boolean(clientId) && allowedServiceClients.has(clientId.toLowerCase());
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
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dmy = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const year = Number(iso?.[1] ?? dmy?.[3]);
  const month = Number(iso?.[2] ?? dmy?.[2]);
  const day = Number(iso?.[3] ?? dmy?.[1]);
  if (!year || !month || !day) return undefined;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return undefined;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

app.http('vehicleDataLookup', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'vehicle-data/lookup',
  handler: withVehicleLookupAuth(async (req, ctx) => {
    const body = (await req.json().catch(() => ({}))) as LookupBody;
    const caseId = typeof body.caseId === 'string' ? body.caseId.trim() : '';
    const previewRegistration = typeof body.registration === 'string' ? body.registration.trim() : '';
    if (!caseId && !previewRegistration) {
      return { status: 400, jsonBody: { error: 'supply caseId or registration' } };
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
      const savedRegistration = rows[0].vrm?.trim() ?? '';
      if (
        savedRegistration &&
        previewRegistration &&
        canonicalizeVrm(savedRegistration) !== canonicalizeVrm(previewRegistration)
      ) {
        return { status: 409, jsonBody: { error: 'registration conflicts with the saved case' } };
      }
      registration = savedRegistration || previewRegistration;
      documentHasMileage = isValidEvaMileage(rows[0].eva_mileage ?? '');
      targetDate ??= isoDate(rows[0].eva_date_of_loss);
    }
    if (!registration) return { status: 400, jsonBody: { error: 'registration is required' } };

    const requestShape = {
      caseId,
      registration: canonicalizeVrm(registration),
      targetDate: targetDate ?? null,
    };
    // Bind a Durable retry to caller-controlled, operation-stable identity only.
    // documentHasMileage is deliberately excluded: a successful first attempt can
    // fill eva_mileage before its activity result is checkpointed, so including it
    // would make the at-least-once retry conflict with its own committed result.
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
    if (persisted.replayed && idempotencyKey) {
      const replay = await loadVehicleDataReplay(caseId, idempotencyKey, requestSha256);
      if (!replay) throw new Error('persisted vehicle lookup replay could not be loaded');
      ctx.log(JSON.stringify({ evt: 'vehicleDataLookupReplay', caseId, runId: replay.result.lookup.run_id }));
      return { status: 200, jsonBody: { ...replay.result, persisted: replay.persisted } };
    }
    ctx.log(JSON.stringify({ evt: 'vehicleDataLookup', caseId, runId: result.lookup.run_id, applied: persisted.applied }));
    return { status: 200, jsonBody: { ...result, persisted } };
  }),
});
