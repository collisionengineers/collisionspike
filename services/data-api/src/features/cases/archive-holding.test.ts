import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ tx: vi.fn(), q: vi.fn() }));
vi.mock('../../platform/db/client.js', () => ({ tx: db.tx }));
const audit = vi.hoisted(() => ({ strict: vi.fn() }));
vi.mock('../../shared/audit.js', () => ({
  AUDIT_ACTION: { box_synced: 100000016,inbound_linked:100000036 },
  writeAuditStrict: audit.strict,
}));
const status = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./status-recompute.js', () => ({ requestStatusRecompute: status.request }));

const { claimArchiveHolding, claimArchiveHoldingUploads, checkpointArchiveHoldingFile, finalizeArchiveHolding,
  listArchiveHoldingAdoptionCaseIds, readArchiveHoldingResolution, registerArchiveHolding, resolveArchiveHolding,
  reserveArchiveHoldingIntake,claimDeferredArchiveHoldingIntakes, failArchiveHoldingAdoption, failArchiveHoldingUpload,
  failDeferredArchiveHoldingIntake } = await import('./archive-holding.js');

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const CLAIM = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  db.q.mockReset();
  db.tx.mockReset().mockImplementation(async (work: (q: typeof db.q) => Promise<unknown>) => work(db.q));
  audit.strict.mockReset().mockResolvedValue(undefined);
  status.request.mockReset().mockResolvedValue(1);
});

function claimRows(overrides: {
  state?: string;
  candidates?: Array<{ caseId: string; casePo: string | null }>;
  claimSucceeds?: boolean;
  previousCandidates?: string[];
  previousFolders?: string[];
  holdings?: Array<Record<string, unknown>>;
  pendingFiles?: number;
  targetAvailable?: boolean;
  linkedCases?: string[];
} = {}) {
  const candidates = overrides.candidates ?? [{ caseId: CASE_ID, casePo: 'QDOS26079' }];
  db.q.mockImplementation(async (sql: string) => {
    if (/SELECT vrm FROM case_/i.test(sql)) return [{ vrm: 'AB12 CDE' }];
    if (/pg_advisory_xact_lock/i.test(sql)) return [];
    if (/SELECT id,vrm,case_po/i.test(sql)) {
      return overrides.targetAvailable===false?[]:[{ id: CASE_ID, vrm: 'AB12 CDE', casePo: 'QDOS26079', boxFolderId: null }];
    }
    if (/FROM archive_holding_folder WHERE normalized_vrm/i.test(sql)) {
      return overrides.holdings ?? [{
        id: '33333333-3333-4333-8333-333333333333', boxFolderId: 'held',
        state: overrides.state ?? 'open', adoptedCaseId: null, claimToken: null,
        resolvedCaseId:null,claimActive: false, candidateCaseIds: overrides.previousCandidates ?? [], candidateFolderIds: overrides.previousFolders ?? [],
      }];
    }
    if (/SELECT id AS "caseId"/i.test(sql)) return candidates;
    if(/SELECT DISTINCT ie\.case_id AS "caseId"/i.test(sql))return (overrides.linkedCases??[]).map((caseId)=>({caseId}));
    if (/SET state=(?:'ambiguous'|CASE WHEN)/i.test(sql) || /SET on_hold=true/i.test(sql)
      || /SET (?:state='open',)?candidate_case_ids=\$2::jsonb/i.test(sql)) return [];
    if(/UPDATE case_ c SET archive_holding_pending/i.test(sql))return [];
    if (/SELECT count\(\*\)::text AS count FROM archive_holding_file/i.test(sql)) return [{count:String(overrides.pendingFiles??0)}];
    if (/SET state='adopting'/i.test(sql)) {
      return overrides.claimSucceeds === false ? [] : [{ id: '33333333-3333-4333-8333-333333333333' }];
    }
    if (/SET adoption_mode=/i.test(sql)) return [];
    if (/FROM archive_holding_file/i.test(sql)) return [];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
}

describe('archive holding claims', () => {
  it('takes the registration advisory lock before the case row and returns busy to a concurrent claimant', async () => {
    claimRows({ state: 'adopting', claimSucceeds: false,previousCandidates:[CASE_ID] });
    await expect(claimArchiveHolding(CASE_ID, CLAIM)).resolves.toEqual({ kind: 'busy' });
    const statements = db.q.mock.calls.map(([sql]) => String(sql));
    const triage=db.q.mock.calls.findIndex(([,params])=>Array.isArray(params)&&String(params[0]).startsWith('triage:vrm:'));
    const archive=statements.findIndex((sql)=>/pg_advisory_xact_lock\(hashtext\(\$1\)\)/i.test(sql));
    const caseLock=statements.findIndex((sql) => /SELECT id,vrm,case_po/i.test(sql));
    expect(triage).toBeGreaterThanOrEqual(0);expect(triage).toBeLessThan(archive);expect(archive).toBeLessThan(caseLock);
    expect(statements.some((sql)=>/mergedInto/.test(sql))).toBe(true);
  });

  it('settles one exact observation, then detects a concurrently committed second instruction before adoption',async()=>{
    claimRows();
    await expect(claimArchiveHolding(CASE_ID,CLAIM)).resolves.toEqual({kind:'busy'});
    expect(db.q.mock.calls.some(([sql])=>/next_attempt_at=now\(\)\+interval '2 minutes'/i.test(String(sql)))).toBe(true);
    expect(db.q.mock.calls.some(([sql])=>/SET state='adopting'/i.test(String(sql)))).toBe(false);

    const other='44444444-4444-4444-8444-444444444444';
    db.q.mockClear();
    claimRows({previousCandidates:[CASE_ID],candidates:[
      {caseId:CASE_ID,casePo:'QDOS26079'},{caseId:other,casePo:'QDOS26080'},
    ]});
    await expect(claimArchiveHolding(CASE_ID,CLAIM)).resolves.toMatchObject({
      kind:'ambiguous',candidates:[CASE_ID,other],changed:true,
    });
    expect(db.q.mock.calls.some(([sql])=>/SET state='adopting'/i.test(String(sql)))).toBe(false);
  });

  it('makes a formerly ambiguous holding non-selectable while re-settling one remaining candidate',async()=>{
    const departed='44444444-4444-4444-8444-444444444444';
    claimRows({state:'ambiguous',previousCandidates:[CASE_ID,departed],previousFolders:['held']});
    await expect(claimArchiveHolding(CASE_ID,CLAIM)).resolves.toEqual({kind:'busy'});
    const settle=String(db.q.mock.calls.find(([sql])=>/next_attempt_at=now\(\)\+interval '2 minutes'/i.test(String(sql)))?.[0]??'');
    expect(settle).toMatch(/SET state='open',candidate_case_ids/i);

    const replacement='55555555-5555-4555-8555-555555555555';
    db.q.mockClear();
    claimRows({state:'open',previousCandidates:[CASE_ID],previousFolders:['held'],candidates:[
      {caseId:CASE_ID,casePo:'QDOS26079'},{caseId:replacement,casePo:'QDOS26081'},
    ]});
    await expect(claimArchiveHolding(CASE_ID,CLAIM)).resolves.toMatchObject({
      kind:'ambiguous',candidates:[CASE_ID,replacement],changed:true,
    });
    expect(db.q.mock.calls.some(([sql])=>/SET state='adopting'/i.test(String(sql)))).toBe(false);
  });

  it('does not repeat an unchanged ambiguity signal', async () => {
    const other = '44444444-4444-4444-8444-444444444444';
    claimRows({
      state: 'ambiguous', previousCandidates: [CASE_ID, other], previousFolders: ['held'],
      candidates: [{ caseId: CASE_ID, casePo: 'QDOS26079' }, { caseId: other, casePo: 'QDOS26080' }],
    });
    await expect(claimArchiveHolding(CASE_ID, CLAIM)).resolves.toEqual({
      kind: 'ambiguous', candidates: [CASE_ID, other], folders: ['held'], changed: false,
    });
    expect(db.q.mock.calls.some(([sql]) => /SET on_hold=true/i.test(String(sql)))).toBe(true);
  });

  it('never files images away from a source email that staff already linked elsewhere',async()=>{
    const linked='44444444-4444-4444-8444-444444444444';
    claimRows({previousCandidates:[CASE_ID],linkedCases:[linked]});
    await expect(claimArchiveHolding(CASE_ID,CLAIM)).resolves.toMatchObject({
      kind:'ambiguous',candidates:[CASE_ID,linked],changed:true,
    });
    expect(db.q.mock.calls.some(([sql])=>/SET state='adopting'/i.test(String(sql)))).toBe(false);
    expect(db.q.mock.calls.some(([sql])=>/last_error='A source email is linked to another case'/i.test(String(sql)))).toBe(true);
  });

  it('never guesses between multiple unresolved registration folders', async () => {
    claimRows({ holdings: [
      { id: '33333333-3333-4333-8333-333333333333', boxFolderId: 'held-a', state: 'open', adoptedCaseId: null, claimToken: null, claimActive: false, candidateCaseIds: [], candidateFolderIds: [] },
      { id: '44444444-4444-4444-8444-444444444444', boxFolderId: 'held-b', state: 'open', adoptedCaseId: null, claimToken: null, claimActive: false, candidateCaseIds: [], candidateFolderIds: [] },
    ] });
    await expect(claimArchiveHolding(CASE_ID, CLAIM)).resolves.toEqual({
      kind: 'ambiguous', candidates: [CASE_ID], folders: ['held-a', 'held-b'], changed: true,
    });
    expect(db.q.mock.calls.some(([sql]) => /SET state='adopting'/i.test(String(sql)))).toBe(false);
  });

  it('never steals a folder already adopted by another case',async()=>{
    const other='44444444-4444-4444-8444-444444444444';
    claimRows({holdings:[{id:'33333333-3333-4333-8333-333333333333',boxFolderId:'other-case-folder',state:'adopted',adoptedCaseId:other,claimToken:null,claimActive:false,candidateCaseIds:[],candidateFolderIds:[]}]});
    await expect(claimArchiveHolding(CASE_ID,CLAIM)).resolves.toEqual({kind:'none'});
    expect(db.q.mock.calls.some(([sql])=>/SET state='adopting'/i.test(String(sql)))).toBe(false);
  });

  it('ignores an old adopted epoch and claims the new holding for a later case on the same registration',async()=>{
    const other='44444444-4444-4444-8444-444444444444';
    claimRows({holdings:[
      {id:'55555555-5555-4555-8555-555555555555',boxFolderId:'old-case-folder',state:'adopted',adoptedCaseId:other,resolvedCaseId:null,claimToken:null,claimActive:false,candidateCaseIds:[],candidateFolderIds:[]},
      {id:'33333333-3333-4333-8333-333333333333',boxFolderId:'new-holding',state:'open',adoptedCaseId:null,resolvedCaseId:null,claimToken:null,claimActive:false,retryDeferred:false,candidateCaseIds:[CASE_ID],candidateFolderIds:['new-holding']},
    ]});
    await expect(claimArchiveHolding(CASE_ID,CLAIM)).resolves.toMatchObject({kind:'claimed',holdingId:'33333333-3333-4333-8333-333333333333'});
  });

  it('does not claim for a case that won a merge race and is now retired',async()=>{
    claimRows({targetAvailable:false});
    await expect(claimArchiveHolding(CASE_ID,CLAIM)).resolves.toEqual({kind:'none'});
    expect(db.q.mock.calls.some(([sql])=>/FROM archive_holding_folder/i.test(String(sql)))).toBe(false);
  });

  it('processes explicitly assigned folders one epoch at a time instead of guessing',async()=>{
    claimRows({holdings:[
      {id:'33333333-3333-4333-8333-333333333333',boxFolderId:'held-a',state:'ambiguous',adoptedCaseId:null,resolvedCaseId:CASE_ID,claimToken:null,claimActive:false,candidateCaseIds:[CASE_ID],candidateFolderIds:['held-a','held-b']},
      {id:'44444444-4444-4444-8444-444444444444',boxFolderId:'held-b',state:'ambiguous',adoptedCaseId:null,resolvedCaseId:CASE_ID,claimToken:null,claimActive:false,candidateCaseIds:[CASE_ID],candidateFolderIds:['held-a','held-b']},
    ]});
    await expect(claimArchiveHolding(CASE_ID,CLAIM)).resolves.toMatchObject({kind:'claimed',holdingId:'33333333-3333-4333-8333-333333333333'});
  });

  it('does not rename or transfer a holding folder until every reserved byte is uploaded',async()=>{
    claimRows({pendingFiles:1,previousCandidates:[CASE_ID]});
    await expect(claimArchiveHolding(CASE_ID,CLAIM)).resolves.toEqual({kind:'busy'});
    expect(db.q.mock.calls.some(([sql])=>/SET state='adopting'/i.test(String(sql)))).toBe(false);
  });

  it('never overrides a staff assignment when another case later becomes the sole active match',async()=>{
    const selected='44444444-4444-4444-8444-444444444444';
    claimRows({holdings:[{id:'33333333-3333-4333-8333-333333333333',boxFolderId:'held',state:'ambiguous',
      adoptedCaseId:null,resolvedCaseId:selected,claimToken:null,claimActive:false,
      candidateCaseIds:[selected],candidateFolderIds:['held']}]});
    await expect(claimArchiveHolding(CASE_ID,CLAIM)).resolves.toEqual({
      kind:'ambiguous',candidates:[selected],folders:['held'],changed:false,
    });
    expect(db.q.mock.calls.some(([sql])=>/SET state='adopting'/i.test(String(sql)))).toBe(false);
    expect(db.q.mock.calls.some(([sql])=>/SELECT id AS "caseId"/i.test(String(sql)))).toBe(false);
  });
});

describe('archive holding recovery discovery',()=>{
  it('claims expired upload rows with skip-locked and a bounded lease',async()=>{
    db.q.mockResolvedValue([{id:'file-1',holdingId:'holding-1',boxFolderId:'held',claimToken:CLAIM}]);
    await expect(claimArchiveHoldingUploads(CLAIM,500)).resolves.toHaveLength(1);
    const [sql,params]=db.q.mock.calls[0];
    expect(String(sql)).toMatch(/FOR UPDATE OF f SKIP LOCKED/);
    expect(String(sql)).toMatch(/claim_expires_at=now\(\)\+interval '10 minutes'/);
    expect(String(sql)).toMatch(/f\.next_attempt_at<=now\(\)/);
    expect(String(sql)).toMatch(/ORDER BY f\.next_attempt_at/);
    expect(params).toEqual([CLAIM,100]);
  });

  it('discovers every active candidate after every holding byte has an archive file id',async()=>{
    const other='44444444-4444-4444-8444-444444444444';db.q.mockResolvedValue([{caseId:CASE_ID},{caseId:other}]);
    await expect(listArchiveHoldingAdoptionCaseIds()).resolves.toEqual([CASE_ID,other]);
    const sql=String(db.q.mock.calls[0][0]);
    expect(sql).toMatch(/NOT EXISTS[\s\S]*box_file_id IS NULL/);
    expect(sql).toMatch(/resolved_case_id IS NULL/);
    expect(sql).toMatch(/resolved_case_id/);
    expect(sql).toMatch(/JOIN LATERAL[\s\S]*LIMIT 1/);
    expect(sql).toMatch(/h\.next_attempt_at<=now\(\)/);
  });

  it('backs poison rows off so later eligible work can enter each bounded batch',async()=>{
    db.q.mockResolvedValue([]);
    await claimDeferredArchiveHoldingIntakes(CLAIM,10);
    expect(String(db.q.mock.calls[0][0])).toMatch(/next_attempt_at<=now\(\)[\s\S]*ORDER BY next_attempt_at/);
    await failDeferredArchiveHoldingIntake('deferred-1',CLAIM,'poison');
    await failArchiveHoldingUpload('file-1',CLAIM,'poison');
    await failArchiveHoldingAdoption('holding-1',CLAIM,'poison');
    for(const call of db.q.mock.calls.slice(1))expect(String(call[0])).toMatch(/next_attempt_at=now\(\)\+make_interval/);
  });
});

describe('archive holding staff resolution',()=>{
  it('does not expose or allow selection from a provisional exact-match observation',async()=>{
    db.q.mockImplementation(async(sql:string,params?:unknown[])=>{
      if(/SELECT vrm FROM case_[\s\S]*mergedInto/i.test(sql))return [{vrm:'AB-12 CDE'}];
      if(/SELECT id,box_folder_id AS "folderId"/i.test(sql)){
        expect(sql).toMatch(/state IN \('ambiguous','failed'\)/);
        expect(params).toEqual(['AB12CDE']);
        return [];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(readArchiveHoldingResolution(CASE_ID)).resolves.toEqual({state:'none',holdingIds:[],folderIds:[],
      candidateCaseIds:[],candidateCases:[],sources:[],canSelect:false,hasFailure:false});

    db.q.mockImplementation(async(sql:string)=>{
      if(/SELECT vrm FROM case_ WHERE id=\$1$/i.test(sql.trim()))return [{vrm:'AB12 CDE'}];
      if(/pg_advisory_xact_lock/i.test(sql))return [];
      if(/SELECT id FROM case_[\s\S]*FOR UPDATE/i.test(sql))return [{id:CASE_ID}];
      if(/SELECT id,resolved_case_id/i.test(sql)){
        expect(sql).toMatch(/state IN \('ambiguous','failed'\)/);
        return [];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(resolveArchiveHolding(CASE_ID,'staff-1')).rejects.toThrow('no registration image folder');
    expect(audit.strict).not.toHaveBeenCalled();
  });

  it('surfaces an automatic adoption failure on its exact candidate case',async()=>{
    db.q.mockImplementation(async(sql:string)=>{
      if(/SELECT vrm FROM case_[\s\S]*mergedInto/i.test(sql))return [{vrm:'AB12 CDE'}];
      if(/SELECT id,box_folder_id AS "folderId"/i.test(sql))return [{id:'33333333-3333-4333-8333-333333333333',folderId:'held',state:'failed',candidateCaseIds:[CASE_ID],resolvedCaseId:null}];
      if(/SELECT c\.id AS "caseId"/i.test(sql))return [{caseId:CASE_ID,casePo:'QDOS26079',claimantName:'Jane Driver',providerName:'QDOS'}];
      if(/SELECT h\.id AS "holdingId"/i.test(sql))return [{holdingId:'33333333-3333-4333-8333-333333333333',folderId:'held',folderUrl:'https://app.box.com/folder/held',sourceMessageId:'m1',inboundEmailId:'email-1',subject:'Images',fromAddress:'sender@example.test',receivedOn:'2026-07-13T08:00:00Z',bodyPreview:'Vehicle images attached',filenames:['front.jpg']}];
      if(/SELECT DISTINCT ie\.case_id AS "caseId"/i.test(sql))return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(readArchiveHoldingResolution(CASE_ID)).resolves.toMatchObject({state:'needs_choice',hasFailure:true,canSelect:true,
      holdingIds:['33333333-3333-4333-8333-333333333333'],candidateCaseIds:[CASE_ID]});
  });

  it('shows a candidate and records an explicit assignment under the registration lock',async()=>{
    db.q.mockImplementation(async(sql:string)=>{
      if(/SELECT vrm FROM case_[\s\S]*mergedInto/i.test(sql))return [{vrm:'AB12 CDE'}];
      if(/SELECT id,box_folder_id AS "folderId"/i.test(sql))return [{id:'33333333-3333-4333-8333-333333333333',folderId:'held',candidateCaseIds:[CASE_ID],resolvedCaseId:null}];
      if(/SELECT c\.id AS "caseId"/i.test(sql))return [{caseId:CASE_ID,casePo:'QDOS26079',claimantName:'Jane Driver',providerName:'QDOS'}];
      if(/SELECT h\.id AS "holdingId"/i.test(sql))return [{holdingId:'33333333-3333-4333-8333-333333333333',folderId:'held',folderUrl:'https://app.box.com/folder/held',sourceMessageId:'m1',inboundEmailId:'email-1',subject:'Images',fromAddress:'sender@example.test',receivedOn:'2026-07-13T08:00:00Z',bodyPreview:'Vehicle images attached',filenames:['front.jpg']}];
      if(/SELECT DISTINCT ie\.case_id AS "caseId"/i.test(sql))return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(readArchiveHoldingResolution(CASE_ID)).resolves.toMatchObject({state:'needs_choice',canSelect:true,
      candidateCases:[{caseId:CASE_ID,casePo:'QDOS26079',claimantName:'Jane Driver',providerName:'QDOS'}],
      sources:[{subject:'Images',bodyPreview:'Vehicle images attached',filenames:['front.jpg']}],folderIds:['held']});

    db.q.mockImplementation(async(sql:string)=>{
      if(/SELECT vrm FROM case_ WHERE id=\$1$/i.test(sql.trim()))return [{vrm:'AB12 CDE'}];
      if(/pg_advisory_xact_lock/i.test(sql))return [];
      if(/SELECT id FROM case_[\s\S]*FOR UPDATE/i.test(sql))return [{id:CASE_ID}];
      if(/SELECT id,resolved_case_id/i.test(sql))return [{id:'33333333-3333-4333-8333-333333333333',resolvedCaseId:null}];
      if(/SELECT DISTINCT ie\.case_id AS "caseId"/i.test(sql))return [];
      if(/UPDATE archive_holding_folder SET resolved_case_id/i.test(sql))return [{id:'33333333-3333-4333-8333-333333333333'}];
      if(/UPDATE case_ SET on_hold=true/i.test(sql))return [];
      if(/UPDATE case_ c SET archive_holding_pending/i.test(sql))return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(resolveArchiveHolding(CASE_ID,'staff-1')).resolves.toEqual({resolved:1,holdingIds:['33333333-3333-4333-8333-333333333333']});
    expect(audit.strict).toHaveBeenCalledWith(expect.objectContaining({caseId:CASE_ID,actor:'staff-1'}),db.q);
    const statements=db.q.mock.calls.map(([sql])=>String(sql));
    expect(statements.findIndex((sql)=>/pg_advisory_xact_lock/i.test(sql)))
      .toBeLessThan(statements.findIndex((sql)=>/SELECT id FROM case_[\s\S]*FOR UPDATE/i.test(sql)));
  });
  it('treats a repeated staff assignment as a no-op without a duplicate audit',async()=>{
    db.q.mockImplementation(async(sql:string)=>{
      if(/SELECT vrm FROM case_ WHERE id=\$1$/i.test(sql.trim()))return [{vrm:'AB12 CDE'}];
      if(/pg_advisory_xact_lock/i.test(sql))return [];
      if(/SELECT id FROM case_[\s\S]*FOR UPDATE/i.test(sql))return [{id:CASE_ID}];
      if(/SELECT id,resolved_case_id/i.test(sql))return [{id:'33333333-3333-4333-8333-333333333333',resolvedCaseId:CASE_ID,claimActive:false}];
      if(/SELECT DISTINCT ie\.case_id AS "caseId"/i.test(sql))return [];
      if(/UPDATE archive_holding_folder SET resolved_case_id/i.test(sql))return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(resolveArchiveHolding(CASE_ID,'staff-1')).resolves.toEqual({resolved:0,holdingIds:[]});
    expect(audit.strict).not.toHaveBeenCalled();
    expect(db.q.mock.calls.some(([sql])=>/UPDATE case_ SET on_hold=true/i.test(String(sql)))).toBe(false);
  });
  it('refuses to reassign a folder while its remote adoption lease is active',async()=>{
    db.q.mockImplementation(async(sql:string)=>{
      if(/SELECT vrm FROM case_ WHERE id=\$1$/i.test(sql.trim()))return [{vrm:'AB12 CDE'}];
      if(/pg_advisory_xact_lock/i.test(sql))return [];
      if(/SELECT id FROM case_[\s\S]*FOR UPDATE/i.test(sql))return [{id:CASE_ID}];
      if(/SELECT id,resolved_case_id/i.test(sql))return [{id:'33333333-3333-4333-8333-333333333333',resolvedCaseId:null,claimActive:true}];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(resolveArchiveHolding(CASE_ID,'staff-1')).rejects.toThrow('currently being filed');
    expect(audit.strict).not.toHaveBeenCalled();
  });
});

describe('archive holding registration epochs',()=>{
  it('returns a terminal replay after the source message was adopted without creating another epoch',async()=>{
    db.q.mockImplementation(async(sql:string)=>{
      if(/pg_advisory_xact_lock/i.test(sql))return [];
      if(/FROM archive_holding_intake i JOIN archive_holding_folder h/i.test(sql))return [{
        id:'33333333-3333-4333-8333-333333333333',boxFolderId:'case-folder',state:'adopted',vrm:'AB12CDE',claimActive:false,
      }];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(registerArchiveHolding({vrm:'AB12CDE',rootFolderId:'root',boxFolderId:'new-folder',
      sourceMessageId:'m-adopted',claimToken:CLAIM,files:[
        {filename:'front.jpg',contentType:'image/jpeg',size:1,blobPath:'m/front.jpg',sha256:'a'.repeat(64)},
      ]})).resolves.toMatchObject({replayed:true,deferred:false,files:[],boxFolderId:'case-folder'});
    expect(db.q.mock.calls.some(([sql])=>/INSERT INTO archive_holding_folder|INSERT INTO archive_holding_file/i.test(String(sql)))).toBe(false);
  });

  it('starts a new active holding epoch after the prior folder was adopted',async()=>{
    db.q.mockImplementation(async(sql:string)=>{
      if(/pg_advisory_xact_lock/i.test(sql))return [];
      if(/FROM archive_holding_intake i JOIN archive_holding_folder h/i.test(sql))return [];
      if(/SELECT id,box_folder_id AS "boxFolderId",state,[\s\S]*FROM archive_holding_folder/i.test(sql))return [];
      if(/FROM archive_holding_folder WHERE box_folder_id=\$1/i.test(sql))return [];
      if(/INSERT INTO archive_holding_folder/i.test(sql))return [{id:'55555555-5555-4555-8555-555555555555',boxFolderId:'new-vrm-folder'}];
      if(/INSERT INTO archive_holding_intake|INSERT INTO archive_holding_file/i.test(sql))return [];
      if(/SELECT id AS "caseId" FROM case_/i.test(sql))return [];
      if(/UPDATE archive_holding_folder SET next_attempt_at/i.test(sql))return [];
      if(/UPDATE archive_holding_file SET state='uploading'/i.test(sql))return [{id:'file-1',filename:'front.jpg'}];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const result=await registerArchiveHolding({vrm:'AB12CDE',rootFolderId:'root',boxFolderId:'new-vrm-folder',sourceMessageId:'m2',claimToken:CLAIM,files:[
      {filename:'front.jpg',contentType:'image/jpeg',size:1,blobPath:'m2/front.jpg',sha256:'a'.repeat(64)},
    ]});
    expect(result).toMatchObject({holdingId:'55555555-5555-4555-8555-555555555555',boxFolderId:'new-vrm-folder'});
    expect(db.q.mock.calls.some(([sql])=>/state<>'adopted'/.test(String(sql)))).toBe(true);
  });

  it('persists a replayable manifest instead of losing images while an adoption lease is live',async()=>{
    db.q.mockImplementation(async(sql:string)=>{
      if(/pg_advisory_xact_lock/i.test(sql))return [];
      if(/FROM archive_holding_intake i JOIN archive_holding_folder h/i.test(sql))return [];
      if(/SELECT id,box_folder_id AS "boxFolderId",state,/i.test(sql))return [{id:'33333333-3333-4333-8333-333333333333',boxFolderId:'held',state:'adopting',claimActive:true}];
      if(/INSERT INTO archive_holding_deferred_intake/i.test(sql))return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(registerArchiveHolding({vrm:'AB12CDE',rootFolderId:'root',boxFolderId:'held',sourceMessageId:'m2',claimToken:CLAIM,files:[
      {filename:'front.jpg',contentType:'image/jpeg',size:1,blobPath:'m2/front.jpg',sha256:'a'.repeat(64)},
    ]})).resolves.toMatchObject({deferred:true,files:[]});
    expect(db.q.mock.calls.some(([sql])=>/INSERT INTO archive_holding_deferred_intake/i.test(String(sql)))).toBe(true);
    expect(db.q.mock.calls.some(([sql])=>/INSERT INTO archive_holding_file/i.test(String(sql)))).toBe(false);
  });
  it('persists a deferred manifest when a failed old epoch points at a retired folder id',async()=>{
    db.q.mockImplementation(async(sql:string)=>{
      if(/pg_advisory_xact_lock/i.test(sql))return [];
      if(/FROM archive_holding_intake i JOIN archive_holding_folder h/i.test(sql))return [];
      if(/SELECT id,box_folder_id AS "boxFolderId",state,/i.test(sql))return [{id:'33333333-3333-4333-8333-333333333333',boxFolderId:'retired-folder',state:'failed',claimActive:false}];
      if(/INSERT INTO archive_holding_deferred_intake/i.test(sql))return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(registerArchiveHolding({vrm:'AB12CDE',rootFolderId:'root',boxFolderId:'new-folder',sourceMessageId:'m3',claimToken:CLAIM,files:[
      {filename:'rear.jpg',contentType:'image/jpeg',size:1,blobPath:'m3/rear.jpg',sha256:'b'.repeat(64)},
    ]})).resolves.toMatchObject({deferred:true,files:[]});
    expect(db.q.mock.calls.some(([sql])=>/INSERT INTO archive_holding_deferred_intake/i.test(String(sql)))).toBe(true);
  });

  it('defers when createFolder returned an id that adoption retired before registration acquired the lock',async()=>{
    db.q.mockImplementation(async(sql:string)=>{
      if(/pg_advisory_xact_lock/i.test(sql))return [];
      if(/FROM archive_holding_intake i JOIN archive_holding_folder h/i.test(sql))return [];
      if(/SELECT id,box_folder_id AS "boxFolderId",state,[\s\S]*FROM archive_holding_folder/i.test(sql))return [];
      if(/FROM archive_holding_folder WHERE box_folder_id=\$1/i.test(sql))return [{id:'33333333-3333-4333-8333-333333333333',boxFolderId:'renamed-case-folder'}];
      if(/INSERT INTO archive_holding_deferred_intake/i.test(sql))return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(registerArchiveHolding({vrm:'AB12CDE',rootFolderId:'root',boxFolderId:'renamed-case-folder',
      sourceMessageId:'m-after-rename',claimToken:CLAIM,files:[
        {filename:'late.jpg',contentType:'image/jpeg',size:1,blobPath:'late.jpg',sha256:'c'.repeat(64)},
      ]})).resolves.toMatchObject({holdingId:'33333333-3333-4333-8333-333333333333',deferred:true,files:[]});
    expect(db.q.mock.calls.some(([sql])=>/INSERT INTO archive_holding_folder/i.test(String(sql)))).toBe(false);
    expect(db.q.mock.calls.some(([sql])=>/INSERT INTO archive_holding_file/i.test(String(sql)))).toBe(false);
  });
});

describe('archive holding intake reservation',()=>{
  it('turns an adopted legacy intake into a completed message ledger before any remote mutation',async()=>{
    db.q.mockImplementation(async(sql:string)=>{
      if(/SELECT i\.id FROM archive_holding_intake/i.test(sql))return [{id:'prior'}];
      if(/INSERT INTO archive_holding_deferred_intake/i.test(sql))return [{id:'ledger'}];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(reserveArchiveHoldingIntake({sourceMessageId:'m-adopted',vrm:'AB12CDE',rootFolderId:'root',
      claimToken:CLAIM,files:[{filename:'front.jpg',contentType:'image/jpeg',size:1,blobPath:'m/front.jpg',sha256:'a'.repeat(64)}]}))
      .resolves.toEqual({id:'ledger',acquired:false,completed:true,busy:false});
  });
});

describe('archive holding transfer lease',()=>{
  it('requires an unexpired claim and renews it atomically with every checkpoint',async()=>{
    db.q.mockResolvedValue([{id:'file-1'}]);
    await expect(checkpointArchiveHoldingFile({holdingId:'33333333-3333-4333-8333-333333333333',fileId:'file-1',claimToken:CLAIM,kind:'moved',canonicalFileId:'box-file',canonicalFileUrl:'url',sourceRetired:true})).resolves.toBe(true);
    const sql=String(db.q.mock.calls[0][0]);
    expect(sql).toMatch(/claim_expires_at>now\(\)/);
    expect(sql).toMatch(/claim_expires_at=now\(\)\+interval '10 minutes'/);
    expect(sql).toMatch(/stamped JOIN renewed/);
  });
});

function finalizeRows(lockedVrm='AB12CDE',sourceRows:Array<{id:string;caseId:string|null}>=[]) {
  db.q.mockImplementation(async (sql: string) => {
    if (/SELECT normalized_vrm AS vrm FROM archive_holding_folder/i.test(sql)) return [{vrm:'AB12CDE'}];
    if (/pg_advisory_xact_lock/i.test(sql)) return [];
    if (/SELECT id,vrm FROM case_[\s\S]*mergedInto/i.test(sql)) return [{id:CASE_ID,vrm:lockedVrm}];
    if (/SELECT adoption_mode AS mode/i.test(sql)) return [{ mode: 'merge', holdingFolderId: 'held',vrm:'AB12CDE' }];
    if(/SELECT ie\.id,ie\.case_id AS "caseId"/i.test(sql))return sourceRows;
    if (/SELECT count\(\*\)/i.test(sql)) return [{ count: '0' }];
    if (/UPDATE case_ SET box_folder_id/i.test(sql)) return [{ id: CASE_ID }];
    if (/INSERT INTO evidence/i.test(sql)) return [{ id: 'evidence-1' }];
    if (/UPDATE inbound_email ie SET/i.test(sql))return sourceRows.map((row)=>({id:row.id}));
    if(/UPDATE archive_holding_folder SET state='transferred'/i.test(sql))return [{id:'33333333-3333-4333-8333-333333333333'}];
    if(/UPDATE case_ c SET archive_holding_pending/i.test(sql))return [];
    if (/UPDATE evidence e SET/i.test(sql) || /UPDATE archive_holding_file/i.test(sql) || /UPDATE archive_holding_folder SET state='adopted'/i.test(sql)) return [];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
}

describe('archive holding finalization', () => {
  it('records adoption strictly in the same transaction before requesting readiness recompute', async () => {
    finalizeRows();
    await expect(finalizeArchiveHolding({
      holdingId: '33333333-3333-4333-8333-333333333333', caseId: CASE_ID, claimToken: CLAIM,
      folderId: 'case-folder', folderUrl: 'https://app.box.com/folder/case-folder',
    })).resolves.toEqual({ adopted: 1 });
    expect(audit.strict).toHaveBeenCalledWith(expect.objectContaining({
      action: 100000016, caseId: CASE_ID,
      after: expect.objectContaining({ holdingId: '33333333-3333-4333-8333-333333333333', folderId: 'case-folder', adopted: 1 }),
    }), db.q);
    expect(audit.strict.mock.invocationCallOrder[0]).toBeLessThan(status.request.mock.invocationCallOrder[0]);
    const statements=db.q.mock.calls.map(([sql])=>String(sql));
    expect(statements.findIndex((sql)=>/SELECT id,vrm FROM case_[\s\S]*FOR UPDATE/i.test(sql)))
      .toBeLessThan(statements.findIndex((sql)=>/SELECT adoption_mode AS mode/i.test(sql)));
    expect(statements.some((sql)=>/UPDATE evidence e SET[\s\S]*box_file_id=coalesce/i.test(sql))).toBe(true);
    expect(statements.findIndex((sql)=>/SET state='transferred'/i.test(sql)))
      .toBeLessThan(statements.findIndex((sql)=>/UPDATE inbound_email ie SET/i.test(sql)));
  });

  it('does not allow adoption to commit without its required audit', async () => {
    finalizeRows();
    audit.strict.mockRejectedValue(new Error('audit unavailable'));
    await expect(finalizeArchiveHolding({
      holdingId: '33333333-3333-4333-8333-333333333333', caseId: CASE_ID, claimToken: CLAIM,
      folderId: 'case-folder', folderUrl: 'https://app.box.com/folder/case-folder',
    })).rejects.toThrow('audit unavailable');
    expect(status.request).not.toHaveBeenCalled();
  });

  it('links the source email, clears its unmatched marker, and audits the reconciliation atomically',async()=>{
    finalizeRows('AB12CDE',[{id:'email-1',caseId:null}]);
    await expect(finalizeArchiveHolding({holdingId:'33333333-3333-4333-8333-333333333333',caseId:CASE_ID,
      claimToken:CLAIM,folderId:'case-folder',folderUrl:'https://app.box.com/folder/case-folder'}))
      .resolves.toEqual({adopted:1});
    const inboundSql=String(db.q.mock.calls.find(([sql])=>/UPDATE inbound_email ie SET/i.test(String(sql)))?.[0]??'');
    expect(inboundSql).toMatch(/case_id=\$2/);expect(inboundSql).toMatch(/attention_reason=NULL/);
    expect(audit.strict).toHaveBeenCalledWith(expect.objectContaining({action:100000036,caseId:CASE_ID,
      after:expect.objectContaining({inboundEmailIds:['email-1']})}),db.q);
  });

  it('refuses to steal an email link changed by staff during the remote transfer',async()=>{
    finalizeRows('AB12CDE',[{id:'email-1',caseId:'44444444-4444-4444-8444-444444444444'}]);
    await expect(finalizeArchiveHolding({holdingId:'33333333-3333-4333-8333-333333333333',caseId:CASE_ID,
      claimToken:CLAIM,folderId:'case-folder',folderUrl:'https://app.box.com/folder/case-folder'}))
      .rejects.toThrow('source email was linked to another case');
    expect(db.q.mock.calls.some(([sql])=>/UPDATE case_ SET box_folder_id/i.test(String(sql)))).toBe(false);
  });

  it('refuses to attach held images when staff correct the case registration during transfer',async()=>{
    finalizeRows('ZZ99ZZZ');
    await expect(finalizeArchiveHolding({holdingId:'33333333-3333-4333-8333-333333333333',caseId:CASE_ID,
      claimToken:CLAIM,folderId:'case-folder',folderUrl:'https://app.box.com/folder/case-folder'}))
      .rejects.toThrow('registration changed');
    expect(db.q.mock.calls.some(([sql])=>/UPDATE case_ SET box_folder_id/i.test(String(sql)))).toBe(false);
    expect(audit.strict).not.toHaveBeenCalled();
  });
});
