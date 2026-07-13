import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface Registration {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: { http: (name: string, options: Registration) => registrations.set(name, options) },
}));

const auth = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock('../lib/auth.js', () => {
  class HttpError extends Error {
    constructor(public readonly status: number, message: string) {
      super(message);
    }
  }
  return {
    authenticate: auth.authenticate,
    HttpError,
    toErrorResponse: (error: unknown) => error instanceof HttpError
      ? { status: error.status, jsonBody: { error: error.message } }
      : { status: 500, jsonBody: { error: 'internal' } },
  };
});

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../lib/db.js', () => ({ query: db.query }));

const canonical = vi.hoisted(() => ({ callVehicleData: vi.fn() }));
vi.mock('../lib/functions-client.js', () => ({ callVehicleData: canonical.callVehicleData }));

const persistence = vi.hoisted(() => ({
  loadVehicleDataReplay: vi.fn(),
  persistVehicleData: vi.fn(),
}));
vi.mock('../lib/vehicle-data-persistence.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/vehicle-data-persistence.js')>();
  return {
    vehicleDataDigest: actual.vehicleDataDigest,
    loadVehicleDataReplay: persistence.loadVehicleDataReplay,
    persistVehicleData: persistence.persistVehicleData,
  };
});

const status = vi.hoisted(() => ({ recomputeStatus: vi.fn() }));
vi.mock('./internal.js', () => ({ recomputeStatus: status.recomputeStatus }));

await import('./vehicle-data.js');
const handler = registrations.get('vehicleDataLookup')!.handler;
const ctx = { log: vi.fn(), error: vi.fn() } as unknown as InvocationContext;

function request(body: unknown): HttpRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers({ authorization: 'Bearer test' }),
  } as unknown as HttpRequest;
}

function result() {
  return {
    contract_version: 'vehicle-data.v1',
    algorithm_version: 'mot-display-estimator.v2',
    lookup: { run_id: 'run-1', status: 'found' },
    mileage: { status: 'observed', warnings: [] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.VEHICLE_DATA_SERVICE_CLIENT_IDS;
  auth.authenticate.mockResolvedValue({ roles: ['CollisionSpike.User'], preferred_username: 'staff@example.test' });
  canonical.callVehicleData.mockResolvedValue(result());
  persistence.loadVehicleDataReplay.mockResolvedValue(null);
  persistence.persistVehicleData.mockResolvedValue({ applied: [], retryable: false, replayed: false });
  status.recomputeStatus.mockResolvedValue(undefined);
});

describe('vehicleDataLookup HTTP boundary', () => {
  it('validates the request shape and target date before lookup', async () => {
    await expect(handler(request({}), ctx)).resolves.toMatchObject({ status: 400 });
    await expect(handler(request({ registration: 'AB12CDE', targetDate: '2026/07/13' }), ctx))
      .resolves.toMatchObject({ status: 400 });
    await expect(handler(request({ registration: 'AB12CDE', targetDate: '2026-02-31' }), ctx))
      .resolves.toMatchObject({ status: 400 });
    await expect(handler(request({ registration: 'AB12CDE', idempotencyKey: 'preview-key' }), ctx))
      .resolves.toMatchObject({ status: 400 });
    expect(canonical.callVehicleData).not.toHaveBeenCalled();
  });

  it('permits staff preview without persisting a case', async () => {
    const response = await handler(request({ registration: ' ab12cde ', targetDate: '2026-07-13' }), ctx);
    expect(response.status).toBe(200);
    expect(canonical.callVehicleData).toHaveBeenCalledWith({
      registration: 'ab12cde',
      documentHasMileage: false,
      targetDate: '2026-07-13',
    });
    expect(persistence.persistVehicleData).not.toHaveBeenCalled();
  });

  it('rejects an arbitrary app-only token and accepts only a configured service client', async () => {
    auth.authenticate.mockResolvedValue({ idtyp: 'app', azp: 'orchestration-client' });
    await expect(handler(request({ registration: 'AB12CDE' }), ctx))
      .resolves.toMatchObject({ status: 403 });

    process.env.VEHICLE_DATA_SERVICE_CLIENT_IDS = 'other-client,ORCHESTRATION-CLIENT';
    await expect(handler(request({ registration: 'AB12CDE' }), ctx))
      .resolves.toMatchObject({ status: 200 });
  });

  it('uses the activity registration only when the saved case has no VRM', async () => {
    db.query.mockResolvedValue([{
      vrm: null,
      eva_mileage: null,
      eva_date_of_loss: '13/07/2026',
    }]);
    const response = await handler(request({
      caseId: 'case-1',
      registration: 'AB12 CDE',
      idempotencyKey: 'intake:instance-1:vehicle-data:case-1',
    }), ctx);
    expect(response.status).toBe(200);
    expect(canonical.callVehicleData).toHaveBeenCalledWith({
      registration: 'AB12 CDE',
      documentHasMileage: false,
      targetDate: '2026-07-13',
      idempotencyKey: 'intake:instance-1:vehicle-data:case-1',
    });
    expect(persistence.persistVehicleData).toHaveBeenCalledOnce();
    expect(status.recomputeStatus).toHaveBeenCalledWith('case-1');
  });

  it('keeps the durable request digest stable when an equivalent saved VRM appears', async () => {
    db.query
      .mockResolvedValueOnce([{
        vrm: null,
        eva_mileage: null,
        eva_date_of_loss: '13/07/2026',
      }])
      .mockResolvedValueOnce([{
        vrm: 'AB12CDE',
        eva_mileage: null,
        eva_date_of_loss: '13/07/2026',
      }]);
    const replay = {
      result: result(),
      persisted: { applied: [], retryable: false, replayed: true },
    };
    persistence.loadVehicleDataReplay
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(replay);
    const operation = {
      caseId: 'case-1',
      registration: 'AB12 CDE',
      idempotencyKey: 'intake:instance-1:vehicle-data:case-1',
    };

    await expect(handler(request(operation), ctx)).resolves.toMatchObject({ status: 200 });
    await expect(handler(request(operation), ctx)).resolves.toMatchObject({ status: 200 });

    const firstDigest = persistence.loadVehicleDataReplay.mock.calls[0]?.[2];
    const retryDigest = persistence.loadVehicleDataReplay.mock.calls[1]?.[2];
    expect(firstDigest).toBe(retryDigest);
    expect(canonical.callVehicleData).toHaveBeenCalledOnce();
  });

  it('fails closed when the activity registration conflicts with the saved case', async () => {
    db.query.mockResolvedValue([{
      vrm: 'XY99ZZZ',
      eva_mileage: null,
      eva_date_of_loss: null,
    }]);
    await expect(handler(request({ caseId: 'case-1', registration: 'AB12CDE' }), ctx))
      .resolves.toMatchObject({ status: 409 });
    expect(canonical.callVehicleData).not.toHaveBeenCalled();
  });

  it('maps a replay identity conflict to 409', async () => {
    db.query.mockResolvedValue([{
      vrm: 'AB12CDE',
      eva_mileage: null,
      eva_date_of_loss: null,
    }]);
    persistence.loadVehicleDataReplay.mockRejectedValue(new Error('conflicts with another request'));
    await expect(handler(request({
      caseId: 'case-1',
      idempotencyKey: 'intake:instance-1:vehicle-data:case-1',
    }), ctx)).resolves.toMatchObject({
      status: 409,
      jsonBody: { error: 'conflicts with another request' },
    });
  });

  it('returns the first committed response when concurrent work loses the idempotency race', async () => {
    db.query.mockResolvedValue([{
      vrm: 'AB12CDE',
      eva_mileage: null,
      eva_date_of_loss: null,
    }]);
    const winner = {
      ...result(),
      lookup: { run_id: 'run-1', status: 'found', retrieved_at: '2026-07-13T06:00:00Z' },
    };
    const loser = {
      ...result(),
      lookup: { run_id: 'run-1', status: 'found', retrieved_at: '2026-07-13T06:00:01Z' },
    };
    canonical.callVehicleData.mockResolvedValue(loser);
    persistence.persistVehicleData.mockResolvedValue({
      applied: [],
      retryable: false,
      replayed: true,
    });
    persistence.loadVehicleDataReplay
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        result: winner,
        persisted: { applied: [], retryable: false, replayed: true },
      });

    const response = await handler(request({
      caseId: 'case-1',
      idempotencyKey: 'intake:instance-1:vehicle-data:case-1',
    }), ctx);

    expect(response.status).toBe(200);
    expect(response.jsonBody).toMatchObject({
      lookup: { retrieved_at: '2026-07-13T06:00:00Z' },
      persisted: { replayed: true },
    });
    expect(persistence.loadVehicleDataReplay).toHaveBeenCalledTimes(2);
  });
});
