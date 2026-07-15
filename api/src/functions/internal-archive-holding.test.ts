import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
interface Registration{methods?:string[];authLevel?:string;route?:string;handler:(req:HttpRequest,ctx:InvocationContext)=>Promise<HttpResponseInit>}
const registrations=vi.hoisted(()=>new Map<string,Registration>());
const store=vi.hoisted(()=>({reserve:vi.fn(),register:vi.fn(),uploaded:vi.fn(),uploadFailed:vi.fn(),uploadClaim:vi.fn(),deferredClaim:vi.fn(),deferredComplete:vi.fn(),deferredFailed:vi.fn(),adoptionCandidates:vi.fn(),claim:vi.fn(),checkpoint:vi.fn(),finalize:vi.fn(),adoptionFailed:vi.fn()}));
vi.mock('@azure/functions',()=>({app:{http:(name:string,registration:Registration)=>registrations.set(name,registration)}}));
vi.mock('./internal.js',()=>({withServiceAuth:async(req:HttpRequest,ctx:InvocationContext,next:Registration['handler'])=>next(req,ctx)}));
vi.mock('../lib/archive-holding.js',()=>({
  reserveArchiveHoldingIntake:store.reserve,registerArchiveHolding:store.register,
  stampArchiveHoldingUpload:store.uploaded,failArchiveHoldingUpload:store.uploadFailed,
  claimArchiveHolding:store.claim,checkpointArchiveHoldingFile:store.checkpoint,finalizeArchiveHolding:store.finalize,
  failArchiveHoldingAdoption:store.adoptionFailed,claimArchiveHoldingUploads:store.uploadClaim,
  listArchiveHoldingAdoptionCaseIds:store.adoptionCandidates,claimDeferredArchiveHoldingIntakes:store.deferredClaim,
  completeDeferredArchiveHoldingIntake:store.deferredComplete,failDeferredArchiveHoldingIntake:store.deferredFailed,
}));
await import('./internal-archive-holding.js');
const ctx={error:vi.fn()} as unknown as InvocationContext;
const req=(params:Record<string,string>,value:unknown)=>({params,json:async()=>value}) as unknown as HttpRequest;
beforeEach(()=>{for(const fn of Object.values(store))fn.mockReset();});

describe('archive holding internal API',()=>{
  it('registers service-only routes and refuses an empty image manifest',async()=>{
    expect(registrations.get('internalArchiveHoldingRegister')).toMatchObject({methods:['POST'],authLevel:'anonymous',route:'internal/archive-holding/register'});
    const route=registrations.get('internalArchiveHoldingRegister')!;
    const response=await route.handler(req({}, {vrm:'AB12CDE',rootFolderId:'root',boxFolderId:'folder',sourceMessageId:'m',claimToken:'11111111-1111-4111-8111-111111111111',files:[]}),ctx);
    expect(response.status).toBe(400);expect(store.register).not.toHaveBeenCalled();
  });
  it('normalises registration and persists a valid upload reservation',async()=>{
    store.register.mockResolvedValue({holdingId:'h',files:[]});
    const response=await registrations.get('internalArchiveHoldingRegister')!.handler(req({}, {vrm:'ab12 cde',rootFolderId:'root',boxFolderId:'folder',sourceMessageId:'m',claimToken:'11111111-1111-4111-8111-111111111111',files:[{filename:'front.jpg',contentType:'image/jpeg',size:10,blobPath:'m/front.jpg',sha256:'a'.repeat(64)}]}),ctx);
    expect(response.status).toBe(200);expect(store.register.mock.calls[0][0]).toMatchObject({vrm:'AB12CDE',boxFolderId:'folder'});
  });
  it('exposes the exact-case adoption claim and transfer checkpoint',async()=>{
    store.claim.mockResolvedValue({kind:'ambiguous',candidates:['a','b']});
    const claimed=await registrations.get('internalArchiveHoldingClaim')!.handler(req({id:'case-a'},{claimToken:'11111111-1111-4111-8111-111111111111'}),ctx);
    expect(claimed.jsonBody).toEqual({kind:'ambiguous',candidates:['a','b']});
    store.checkpoint.mockResolvedValue(true);
    const checkpointed=await registrations.get('internalArchiveHoldingCheckpoint')!.handler(req({id:'h',fileId:'f'},{claimToken:'11111111-1111-4111-8111-111111111111',kind:'moved',canonicalFileId:'box-f',canonicalFileUrl:'url',sourceRetired:true}),ctx);
    expect(checkpointed.jsonBody).toEqual({updated:true});
  });
  it('exposes recovery claims and ready adoption candidates only through service auth',async()=>{
    store.uploadClaim.mockResolvedValue([{id:'file-1'}]);
    const recovered=await registrations.get('internalArchiveHoldingUploadClaim')!.handler(req({}, {claimToken:'11111111-1111-4111-8111-111111111111',limit:10}),ctx);
    expect(recovered.jsonBody).toEqual({files:[{id:'file-1'}]});
    store.adoptionCandidates.mockResolvedValue(['case-1']);
    const candidateReq={params:{},query:new URLSearchParams('limit=10'),json:async()=>({})} as unknown as HttpRequest;
    const candidates=await registrations.get('internalArchiveHoldingAdoptionCandidates')!.handler(candidateReq,ctx);
    expect(candidates.jsonBody).toEqual({caseIds:['case-1']});
    store.deferredClaim.mockResolvedValue([{id:'deferred-1'}]);
    const deferred=await registrations.get('internalArchiveHoldingDeferredClaim')!.handler(req({}, {claimToken:'11111111-1111-4111-8111-111111111111'}),ctx);
    expect(deferred.jsonBody).toEqual({intakes:[{id:'deferred-1'}]});
  });
});
