import { describe, it, expect } from 'vitest';
import { createDataverseDataAccess } from './dataverse-source';
import { statusToInt } from './adapter';
import type { CaseRecord, EvidenceRecord, GeneratedServices } from './types';

/* ============================================================
   #4 manual case merge — data-layer behaviour over a fake services bundle.

   Exercises the REAL dataverse-source mergeCandidates/mergeCases logic against an
   in-memory GeneratedServices stand-in: same-provider candidate scoping, evidence
   reparenting, and the source's retire-to-linked_to_instruction write.
   ============================================================ */

function makeServices() {
  const cases: CaseRecord[] = [
    { cr1bd_caseid: 'INSTR', cr1bd_casepo: 'AX26001', cr1bd_provider_code: 'AX', cr1bd_evaworkprovider: 'AX', cr1bd_status: statusToInt('needs_review') },
    { cr1bd_caseid: 'IMGS', cr1bd_provider_code: 'AX', cr1bd_evaworkprovider: 'AX', cr1bd_status: statusToInt('missing_required_fields') },
    { cr1bd_caseid: 'OTHER', cr1bd_casepo: 'QD26002', cr1bd_provider_code: 'QDOS', cr1bd_evaworkprovider: 'QDOS', cr1bd_status: statusToInt('needs_review') },
    { cr1bd_caseid: 'DONE', cr1bd_provider_code: 'AX', cr1bd_evaworkprovider: 'AX', cr1bd_status: statusToInt('eva_submitted') },
  ];
  const evidence: EvidenceRecord[] = [
    { cr1bd_evidenceid: 'E1', _cr1bd_caseid_value: 'IMGS' },
    { cr1bd_evidenceid: 'E2', _cr1bd_caseid_value: 'IMGS' },
    { cr1bd_evidenceid: 'E3', _cr1bd_caseid_value: 'INSTR' },
  ];

  const idFromFilter = (filter?: string): string | undefined => {
    const m = filter?.match(/_cr1bd_caseid_value eq (\S+)/);
    return m?.[1];
  };

  const services = {
    cases: {
      get: async (id: string) => ({ data: cases.find((c) => c.cr1bd_caseid === id) }),
      getAll: async () => ({ data: [...cases] }),
      update: async (id: string, changes: Partial<CaseRecord>) => {
        const row = cases.find((c) => c.cr1bd_caseid === id);
        if (row) Object.assign(row, changes);
        return { data: undefined };
      },
    },
    evidence: {
      getAll: async (opts?: { filter?: string }) => {
        const cid = idFromFilter(opts?.filter);
        return { data: cid ? evidence.filter((e) => e._cr1bd_caseid_value === cid) : [...evidence] };
      },
      update: async (id: string, changes: Partial<EvidenceRecord>) => {
        const row = evidence.find((e) => e.cr1bd_evidenceid === id);
        if (row) {
          // Live Web API: a lookup is rebound via @odata.bind on WRITE; the bare
          // `_value` form is read-only. Simulate the bind (set the read-back value)
          // and REJECT a bare `_value` write so the suite guards the live shape.
          if ('_cr1bd_caseid_value' in changes) {
            throw new Error('read-only _cr1bd_caseid_value on write; use cr1bd_Caseid@odata.bind');
          }
          const bind = (changes as Record<string, unknown>)['cr1bd_Caseid@odata.bind'] as
            | string
            | undefined;
          if (bind) {
            const m = bind.match(/\(([^)]+)\)/);
            if (m) row._cr1bd_caseid_value = m[1];
          }
          for (const [k, v] of Object.entries(changes)) {
            if (k !== 'cr1bd_Caseid@odata.bind' && k !== '_cr1bd_caseid_value') {
              (row as Record<string, unknown>)[k] = v;
            }
          }
        }
        return { data: undefined };
      },
    },
  } as unknown as GeneratedServices;

  return { services, cases, evidence };
}

describe('#4 manual case merge — mergeCandidates', () => {
  it('offers only OPEN, same-provider cases, excluding self/terminal/merged', async () => {
    const { services } = makeServices();
    const da = createDataverseDataAccess(services);
    const out = await da.mergeCandidates('IMGS');
    const ids = out.map((c) => c.id).sort();
    expect(ids).toEqual(['INSTR']); // not IMGS (self), not OTHER (QDOS), not DONE (terminal)
  });
});

describe('#4 manual case merge — mergeCases', () => {
  it('reparents the source evidence onto the target and retires the source', async () => {
    const { services, cases, evidence } = makeServices();
    const da = createDataverseDataAccess(services);

    const res = await da.mergeCases('IMGS', 'INSTR');

    expect(res).toEqual({ targetCaseId: 'INSTR', movedEvidence: 2 });

    // E1 + E2 now belong to the target; E3 untouched.
    expect(evidence.filter((e) => e._cr1bd_caseid_value === 'INSTR').map((e) => e.cr1bd_evidenceid).sort())
      .toEqual(['E1', 'E2', 'E3']);
    expect(evidence.filter((e) => e._cr1bd_caseid_value === 'IMGS')).toHaveLength(0);

    // Source retired: linked_to_instruction (caseType 'merged'), survivor recorded, hold cleared.
    const src = cases.find((c) => c.cr1bd_caseid === 'IMGS')!;
    expect(src.cr1bd_status).toBe(statusToInt('linked_to_instruction'));
    expect(src.cr1bd_onhold).toBe(false);
    expect(JSON.parse(src.cr1bd_duplicatekeys ?? '{}')).toEqual({ mergedInto: 'INSTR' });
  });

  it('refuses to merge a case into itself', async () => {
    const { services } = makeServices();
    const da = createDataverseDataAccess(services);
    await expect(da.mergeCases('IMGS', 'IMGS')).rejects.toThrow(/itself/i);
  });

  it('refuses to merge across different providers', async () => {
    const { services } = makeServices();
    const da = createDataverseDataAccess(services);
    await expect(da.mergeCases('IMGS', 'OTHER')).rejects.toThrow(/provider/i);
  });

  it('refuses to merge into a finalised (terminal) case', async () => {
    const { services } = makeServices();
    const da = createDataverseDataAccess(services);
    await expect(da.mergeCases('IMGS', 'DONE')).rejects.toThrow(/terminal|finalised/i);
  });
});

/* ============================================================
   Hold-by-default env-var write — the ONE Code-App env-var write. Locks the
   @odata.bind navigation-property bind on the create branch (the var ships
   default-only, so the FIRST toggle on any environment hits create, not update).
   ============================================================ */
describe('hold-by-default env-var write', () => {
  function makeEnvServices() {
    const defs = [
      {
        environmentvariabledefinitionid: 'DEF1',
        schemaname: 'cr1bd_HOLD_NEW_CASES_BY_DEFAULT',
        defaultvalue: 'false',
      },
    ];
    const values: Array<Record<string, unknown>> = [];
    let lastCreate: Record<string, unknown> | undefined;
    const services = {
      environmentVariableDefinitions: {
        getAll: async () => ({ data: [...defs] }),
      },
      environmentVariableValues: {
        getAll: async () => ({ data: [...values] }),
        create: async (rec: Record<string, unknown>) => {
          lastCreate = rec;
          values.push(rec);
          return { data: rec };
        },
        update: async () => ({ data: undefined }),
      },
    } as unknown as GeneratedServices;
    return { services, getLastCreate: () => lastCreate };
  }

  it('binds the definition via @odata.bind on the FIRST write (default-only, no value row)', async () => {
    const { services, getLastCreate } = makeEnvServices();
    const da = createDataverseDataAccess(services);
    await da.setHoldNewCasesDefault(true);
    const rec = getLastCreate()!;
    expect(rec.value).toBe('true');
    expect(rec['EnvironmentVariableDefinitionId@odata.bind']).toBe(
      '/environmentvariabledefinitions(DEF1)',
    );
    // The read-only _value form must NOT be used on a write.
    expect(rec._environmentvariabledefinitionid_value).toBeUndefined();
  });

  it('reads false when the env-var tables are not wired into the seam', async () => {
    const da = createDataverseDataAccess({} as unknown as GeneratedServices);
    expect(await da.getHoldNewCasesDefault()).toBe(false);
  });
});
