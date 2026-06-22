import { describe, it, expect } from 'vitest';
import { createDataverseDataAccess } from './dataverse-source';
import { mockDataAccess } from './mock-source';
import { BOX_GATES_ALL_FALSE } from './types';
import type {
  GeneratedServices,
  GeneratedTableService,
  EnvironmentVariableDefinitionRecord,
  EnvironmentVariableValueRecord,
  OperationResult,
} from './types';

/* getBoxGates() over the Dataverse source: default all-false when the env-var
   tables aren't wired, coalesce when they are, cache (one fetch), and stay
   all-false on a read failure — the honest-off contract the whole feature leans
   on (a misread must never switch Box ON). */

/** A getAll-only fake table service backed by a fixed row set; counts calls. */
function fakeService<T>(rows: T[], onGetAll?: () => void): GeneratedTableService<T> {
  return {
    getAll: async (): Promise<OperationResult<T[]>> => {
      onGetAll?.();
      return { data: rows };
    },
    get: async () => ({ data: undefined }),
    create: async () => ({ data: undefined as unknown as T }),
    update: async () => ({ data: undefined }),
  };
}

/** A getAll that throws — to prove the all-false-on-failure path. */
function throwingService<T>(): GeneratedTableService<T> {
  return {
    getAll: async () => {
      throw new Error('OData 500');
    },
    get: async () => ({ data: undefined }),
    create: async () => ({ data: undefined as unknown as T }),
    update: async () => ({ data: undefined }),
  };
}

/** Build a GeneratedServices stub carrying only the env-var services we need. */
function servicesWith(
  defs?: GeneratedTableService<EnvironmentVariableDefinitionRecord>,
  vals?: GeneratedTableService<EnvironmentVariableValueRecord>,
): GeneratedServices {
  return {
    ...(defs ? { environmentVariableDefinitions: defs } : {}),
    ...(vals ? { environmentVariableValues: vals } : {}),
  } as unknown as GeneratedServices;
}

describe('getBoxGates over the Dataverse source', () => {
  it('returns all-false when the env-var tables are not wired', async () => {
    const da = createDataverseDataAccess(servicesWith());
    expect(await da.getBoxGates()).toEqual(BOX_GATES_ALL_FALSE);
  });

  it('reads + coalesces real definition/value rows', async () => {
    const defs: EnvironmentVariableDefinitionRecord[] = [
      { environmentvariabledefinitionid: 'a', schemaname: 'cr1bd_BOX_API_ENABLED', defaultvalue: 'false' },
      { environmentvariabledefinitionid: 'f', schemaname: 'cr1bd_BOX_FILEREQUEST_ENABLED', defaultvalue: 'false' },
      { environmentvariabledefinitionid: 't', schemaname: 'cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID', defaultvalue: '' },
    ];
    const vals: EnvironmentVariableValueRecord[] = [
      { _environmentvariabledefinitionid_value: 'a', value: 'true' },
      { _environmentvariabledefinitionid_value: 'f', value: 'true' },
      { _environmentvariabledefinitionid_value: 't', value: 'fr_42' },
    ];
    const da = createDataverseDataAccess(servicesWith(fakeService(defs), fakeService(vals)));
    const gates = await da.getBoxGates();
    expect(gates.apiEnabled).toBe(true);
    expect(gates.fileRequestEnabled).toBe(true);
    expect(gates.fileRequestTemplateConfigured).toBe(true);
    expect(gates.embedEnabled).toBe(false);
  });

  it('returns all-false when the read throws (never enables on error)', async () => {
    const da = createDataverseDataAccess(
      servicesWith(throwingService(), throwingService()),
    );
    expect(await da.getBoxGates()).toEqual(BOX_GATES_ALL_FALSE);
  });

  it('caches the result — a second call does not re-query', async () => {
    let defCalls = 0;
    const defs: EnvironmentVariableDefinitionRecord[] = [
      { environmentvariabledefinitionid: 'a', schemaname: 'cr1bd_BOX_API_ENABLED', defaultvalue: 'true' },
    ];
    const da = createDataverseDataAccess(
      servicesWith(fakeService(defs, () => { defCalls += 1; }), fakeService([])),
    );
    const first = await da.getBoxGates();
    const second = await da.getBoxGates();
    expect(first).toBe(second); // same cached promise result
    expect(defCalls).toBe(1);
  });
});

describe('getBoxGates over the empty default (mock) source', () => {
  it('is all-false (Box off until the live source is injected)', async () => {
    expect(await mockDataAccess.getBoxGates()).toEqual(BOX_GATES_ALL_FALSE);
  });
});
