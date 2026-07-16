import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const registrations=vi.hoisted(()=>({activities:new Map<string,any>(),orchestrations:new Map<string,any>(),timers:new Map<string,any>(),http:new Map<string,any>()}));
vi.mock('@azure/functions',()=>({app:{
  http:(name:string,value:any)=>registrations.http.set(name,value),
  timer:(name:string,value:any)=>registrations.timers.set(name,value),
}}));
vi.mock('durable-functions',()=>({
  app:{activity:(name:string,value:any)=>registrations.activities.set(name,value),orchestration:(name:string,value:any)=>registrations.orchestrations.set(name,value)},
  input:{durableClient:vi.fn()},getClient:vi.fn(),
  RetryOptions:class{backoffCoefficient=1;maxRetryIntervalInMilliseconds=0;constructor(public firstRetryIntervalInMilliseconds:number,public maxNumberOfAttempts:number){}},
}));

const {recoverArchiveHoldingUploads,ARCHIVE_HOLDING_MONITOR_INSTANCE_ID}=await import('./archive-holding-monitor.js');
const saved={...process.env};
beforeEach(()=>{
  process.env.BOX_API_ENABLED='true';process.env.BOX_FOLDER_AT_INTAKE_ENABLED='true';
  process.env.BOX_REG_FOLDER_ENABLED='true';process.env.BOX_FOLDER_ROOT_ID='test-root';
});
afterEach(()=>{process.env={...saved};});

const file=(id:string)=>({id,holdingId:'holding-1',boxFolderId:'held',claimToken:'11111111-1111-4111-8111-111111111111',
  filename:`${id}.jpg`,contentType:'image/jpeg',size:10,blobPath:`m/${id}.jpg`,sha256:id.padEnd(64,'a').slice(0,64),
  boxFileId:null,boxFileUrl:null,boxSha1:null,canonicalBoxFileId:null,state:'uploading'});

function deps(files:any[]){return{
  claim:vi.fn(async()=>({files})),claimDeferred:vi.fn(async()=>({intakes:[]})),createFolder:vi.fn(async()=>({id:'held'})),
  register:vi.fn(),completeDeferred:vi.fn(async()=>({updated:true})),failDeferred:vi.fn(async()=>undefined),
  upload:vi.fn(async(_folder:string,item:any)=>({id:`box-${item.filename}`,sha1:'b'.repeat(40)})),
  stamp:vi.fn(async()=>({updated:true})),fail:vi.fn(async()=>undefined),candidates:vi.fn(async()=>({caseIds:['case-1']})),
} as any;}

describe('archive holding recovery monitor',()=>{
  it('stamps every recovered upload before releasing an exact case for adoption',async()=>{
    const d=deps([file('one'),file('two')]);
    await expect(recoverArchiveHoldingUploads('11111111-1111-4111-8111-111111111111',d))
      .resolves.toEqual({uploaded:2,failed:0,caseIds:['case-1']});
    expect(d.stamp).toHaveBeenCalledTimes(2);
    expect(d.stamp.mock.invocationCallOrder[1]).toBeLessThan(d.candidates.mock.invocationCallOrder[0]);
  });

  it('checkpoints one failed holding without starving an unrelated complete holding',async()=>{
    const d=deps([file('one'),file('two')]);
    d.upload.mockImplementation(async(_folder:string,item:any)=>{
      if(item.filename==='two.jpg')throw new Error('temporary outage');
      return {id:'box-one',sha1:'b'.repeat(40)};
    });
    await expect(recoverArchiveHoldingUploads('11111111-1111-4111-8111-111111111111',d))
      .resolves.toEqual({uploaded:1,failed:1,caseIds:['case-1']});
    expect(d.stamp).toHaveBeenCalledOnce();expect(d.fail).toHaveBeenCalledOnce();
    expect(d.candidates).toHaveBeenCalledOnce();
  });

  it('converges instruction-first / holding-second ordering even when no upload needs recovery',async()=>{
    const d=deps([]);
    await expect(recoverArchiveHoldingUploads('11111111-1111-4111-8111-111111111111',d))
      .resolves.toEqual({uploaded:0,failed:0,caseIds:['case-1']});
    expect(d.candidates).toHaveBeenCalledOnce();
  });

  it('persists through adoption-in-progress and later materialises the deferred arrival',async()=>{
    const d=deps([]);const held=file('late');
    d.claimDeferred.mockResolvedValue({intakes:[{id:'deferred-1',sourceMessageId:'message-2',vrm:'AB12CDE',
      rootFolderId:'test-root',claimToken:held.claimToken,files:[{filename:held.filename,contentType:held.contentType,
        size:held.size,blobPath:held.blobPath,sha256:held.sha256}]}]});
    d.register.mockResolvedValue({holdingId:'holding-2',boxFolderId:'new-vrm-folder',deferred:false,
      files:[{...held,id:'late',boxFolderId:undefined,claimToken:undefined}]});
    await expect(recoverArchiveHoldingUploads(held.claimToken,d)).resolves.toMatchObject({uploaded:1,failed:0});
    expect(d.createFolder).toHaveBeenCalledWith('AB12CDE','test-root');
    expect(d.completeDeferred).toHaveBeenCalledWith('deferred-1',held.claimToken);
  });

  it('registers one fixed durable singleton and stable replay claim ids',()=>{
    expect(ARCHIVE_HOLDING_MONITOR_INSTANCE_ID).toBe('archive-holding-recovery-monitor-singleton');
    expect(registrations.timers.get('archive-holding-monitor-bootstrap')).toMatchObject({runOnStartup:true});
    const handler=registrations.orchestrations.get('archiveHoldingRecoveryMonitorOrchestrator');
    const calls:any[]=[];
    const ctx={df:{callActivityWithRetry:(...args:any[])=>{calls.push(args);return {task:calls.length};},
      newGuid:(name:string)=>`stable:${name}`,currentUtcDateTime:new Date('2026-07-13T00:00:00Z'),
      createTimer:vi.fn(()=>({timer:true})),continueAsNew:vi.fn(),isReplaying:false},log:vi.fn()};
    const run=handler(ctx);run.next();run.next({caseIds:['case-1','case-2']});run.next({outcome:'ambiguous'});
    expect(calls[0][0]).toBe('archiveHoldingRecoverUploads');
    expect(calls[0][2]).toEqual({claimToken:'stable:archive-holding-upload-recovery'});
    expect(calls[1][0]).toBe('archiveHoldingAdopt');
    expect(calls[1][2]).toEqual({caseId:'case-1',claimToken:'stable:archive-holding-adopt-0'});
    expect(calls[2][2]).toEqual({caseId:'case-2',claimToken:'stable:archive-holding-adopt-1'});
  });
});
