/** Durable recovery for registration-keyed image holding folders (TKT-034). */
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { dataApi, type ArchiveHoldingUploadClaim } from '../../adapters/data-api.js';
import { box } from '../../adapters/functions-client.js';
import { uploadArchiveItem } from '../archive/boxArchive.js';

export interface ArchiveHoldingRecoveryDeps {
  claim(claimToken:string,limit:number):Promise<{files:ArchiveHoldingUploadClaim[]}>;
  claimDeferred(claimToken:string,limit:number):ReturnType<typeof dataApi.claimDeferredArchiveHoldingIntakes>;
  createFolder(name:string,parentId:string):Promise<{id:string}>;
  register(payload:Parameters<typeof dataApi.registerArchiveHolding>[0]):ReturnType<typeof dataApi.registerArchiveHolding>;
  completeDeferred(id:string,claimToken:string):ReturnType<typeof dataApi.completeDeferredArchiveHoldingIntake>;
  failDeferred(id:string,payload:{claimToken:string;error:string}):Promise<void>;
  upload(folderId:string,item:{filename:string;blobPath:string;contentType:string}):ReturnType<typeof uploadArchiveItem>;
  stamp(fileId:string,payload:Parameters<typeof dataApi.stampArchiveHoldingUpload>[1]):ReturnType<typeof dataApi.stampArchiveHoldingUpload>;
  fail(fileId:string,payload:{claimToken:string;error:string}):Promise<void>;
  candidates(limit:number):Promise<{caseIds:string[]}>;
}

const realDeps:ArchiveHoldingRecoveryDeps={
  claim:(token,limit)=>dataApi.claimArchiveHoldingUploads(token,limit),
  claimDeferred:(token,limit)=>dataApi.claimDeferredArchiveHoldingIntakes(token,limit),
  createFolder:(name,parentId)=>box.createFolder(name,parentId),
  register:(payload)=>dataApi.registerArchiveHolding(payload),
  completeDeferred:(id,token)=>dataApi.completeDeferredArchiveHoldingIntake(id,token),
  failDeferred:(id,payload)=>dataApi.failDeferredArchiveHoldingIntake(id,payload),
  upload:(folderId,item)=>uploadArchiveItem(folderId,item),
  stamp:(fileId,payload)=>dataApi.stampArchiveHoldingUpload(fileId,payload),
  fail:(fileId,payload)=>dataApi.failArchiveHoldingUpload(fileId,payload),
  candidates:(limit)=>dataApi.archiveHoldingAdoptionCandidates(limit),
};

export async function recoverArchiveHoldingUploads(
  claimToken:string,
  deps:ArchiveHoldingRecoveryDeps=realDeps,
):Promise<{uploaded:number;failed:number;caseIds:string[];skipped?:string}>{
  if(!gates.boxApi()||!gates.boxFolderAtIntake()||!gates.boxRegFolder())
    return {uploaded:0,failed:0,caseIds:[],skipped:'gated_off'};
  let uploaded=0;
  const failures:string[]=[];

  const uploadFiles=async(files:Array<ArchiveHoldingUploadClaim|(
    Omit<ArchiveHoldingUploadClaim,'holdingId'|'boxFolderId'|'claimToken'> & {boxFolderId:string;claimToken:string}
  )>)=>{
    for(const file of files){
      try{
        const result=await deps.upload(file.boxFolderId,{filename:file.filename,blobPath:file.blobPath,contentType:file.contentType});
        if(!result.id)throw new Error('archive upload returned no file id');
        const stamped=await deps.stamp(file.id,{claimToken:file.claimToken,boxFileId:result.id,
          boxFileUrl:`https://app.box.com/file/${encodeURIComponent(result.id)}`,
          ...(result.sha1?{boxSha1:result.sha1}:{})});
        if(!stamped.updated)throw new Error('archive upload ledger claim changed before stamp');
        uploaded++;
      }catch(error){
        const detail=error instanceof Error?error.message:String(error);
        await deps.fail(file.id,{claimToken:file.claimToken,error:detail}).catch(()=>undefined);
        failures.push(`${file.filename}: ${detail}`);
      }
    }
  };

  // First materialise arrivals that were persisted while adoption exclusively owned
  // the old folder. Folder creation is deliberately repeated here because the old
  // registration folder may have been renamed or retired in the meantime.
  const {intakes}=await deps.claimDeferred(claimToken,10);
  for(const intake of intakes){
    try{
      const folder=await deps.createFolder(intake.vrm,intake.rootFolderId);
      const reservation=await deps.register({vrm:intake.vrm,rootFolderId:intake.rootFolderId,
        boxFolderId:folder.id,sourceMessageId:intake.sourceMessageId,claimToken:intake.claimToken,files:intake.files});
      if(reservation.deferred)throw new Error('registration folder is still being filed');
      const beforeFailures=failures.length;
      await uploadFiles(reservation.files.map((file)=>({...file,boxFolderId:reservation.boxFolderId,claimToken:intake.claimToken})));
      if(failures.length!==beforeFailures)throw new Error('one or more deferred images could not be uploaded');
      const completed=await deps.completeDeferred(intake.id,intake.claimToken);
      if(!completed.updated)throw new Error('deferred intake claim changed before completion');
    }catch(error){
      const detail=error instanceof Error?error.message:String(error);
      await deps.failDeferred(intake.id,{claimToken:intake.claimToken,error:detail}).catch(()=>undefined);
      failures.push(`deferred ${intake.sourceMessageId}: ${detail}`);
    }
  }

  const {files}=await deps.claim(claimToken,25);
  await uploadFiles(files);
  // Candidate discovery excludes only the incomplete holding. A poison blob must not
  // starve unrelated complete registrations; its failed checkpoint is retried next wake.
  const {caseIds}=await deps.candidates(50);
  return {uploaded,failed:failures.length,caseIds};
}

df.app.activity('archiveHoldingRecoverUploads',{handler:async(input:{claimToken:string},ctx)=>{
  const result=await recoverArchiveHoldingUploads(input.claimToken);
  ctx.log(JSON.stringify({evt:'archiveHoldingRecoverUploads',...result}));
  return result;
}});

export const ARCHIVE_HOLDING_MONITOR_INSTANCE_ID='archive-holding-recovery-monitor-singleton';
const intervalMinutes=Number(process.env.ARCHIVE_HOLDING_MONITOR_INTERVAL_MINUTES??'5');
const intervalMs=(Number.isFinite(intervalMinutes)&&intervalMinutes>0?intervalMinutes:5)*60_000;
const recoveryRetry=new df.RetryOptions(15_000,4);recoveryRetry.backoffCoefficient=2;recoveryRetry.maxRetryIntervalInMilliseconds=120_000;
const adoptionRetry=new df.RetryOptions(5_000,3);adoptionRetry.backoffCoefficient=2;

df.app.orchestration('archiveHoldingRecoveryMonitorOrchestrator',function*(ctx){
  try{
    const recovered=(yield ctx.df.callActivityWithRetry('archiveHoldingRecoverUploads',recoveryRetry,
      {claimToken:ctx.df.newGuid('archive-holding-upload-recovery')})) as {caseIds?:string[]};
    const caseIds=[...new Set(recovered.caseIds??[])];
    for(let index=0;index<caseIds.length;index++){
      try{
        yield ctx.df.callActivityWithRetry('archiveHoldingAdopt',adoptionRetry,
          {caseId:caseIds[index],claimToken:ctx.df.newGuid(`archive-holding-adopt-${index}`)});
      }catch(error){
        if(!ctx.df.isReplaying)ctx.log(`[archiveHoldingMonitor] adoption failed for ${caseIds[index]}: ${String(error)}`);
      }
    }
  }catch(error){
    if(!ctx.df.isReplaying)ctx.log(`[archiveHoldingMonitor] recovery failed after retries; rescheduling: ${String(error)}`);
  }
  const next=new Date(ctx.df.currentUtcDateTime.getTime()+intervalMs);
  yield ctx.df.createTimer(next);
  ctx.df.continueAsNew(undefined);
});

async function readMonitor(client:df.DurableClient):Promise<{runtimeStatus:string;running:boolean}>{
  try{
    const status=await client.getStatus(ARCHIVE_HOLDING_MONITOR_INSTANCE_ID);
    const runtimeStatus=String(status?.runtimeStatus??'Unknown');
    return {runtimeStatus,running:['Running','Pending','ContinuedAsNew'].includes(runtimeStatus)};
  }catch(error){
    const detail=error instanceof Error?error.message:String(error);
    if(!/\b404\b|not found|could not find any data/i.test(detail))throw error;
    return {runtimeStatus:'NotFound',running:false};
  }
}

export async function ensureArchiveHoldingMonitor(client:df.DurableClient):Promise<{started:boolean;runtimeStatus:string}>{
  const current=await readMonitor(client);
  if(current.running)return {started:false,runtimeStatus:current.runtimeStatus};
  try{await client.startNew('archiveHoldingRecoveryMonitorOrchestrator',{instanceId:ARCHIVE_HOLDING_MONITOR_INSTANCE_ID});}
  catch(error){
    const raced=await readMonitor(client).catch(()=>undefined);
    if(raced?.running)return {started:false,runtimeStatus:raced.runtimeStatus};
    throw error;
  }
  return {started:true,runtimeStatus:'Pending'};
}

app.http('archive-holding-monitor',{methods:['GET','POST'],authLevel:'function',route:'maintenance/archive-holding-monitor',
  extraInputs:[df.input.durableClient()],handler:async(req:HttpRequest,ctx:InvocationContext):Promise<HttpResponseInit>=>{
    const client=df.getClient(ctx);
    try{
      const monitor=req.method.toUpperCase()==='POST'?await ensureArchiveHoldingMonitor(client):await readMonitor(client);
      const running='running' in monitor?monitor.running:true;
      return {status:running?200:503,jsonBody:{ok:running,instanceId:ARCHIVE_HOLDING_MONITOR_INSTANCE_ID,...monitor}};
    }catch(error){
      const detail=error instanceof Error?error.message:String(error);ctx.error(`[archiveHoldingMonitor] ${detail}`);
      return {status:503,jsonBody:{ok:false,error:detail}};
    }
  }});

app.timer('archive-holding-monitor-bootstrap',{schedule:'0 0 * * * *',runOnStartup:true,
  extraInputs:[df.input.durableClient()],handler:async(_timer:unknown,ctx:InvocationContext)=>{
    try{await ensureArchiveHoldingMonitor(df.getClient(ctx));}
    catch(error){ctx.warn(`[archiveHoldingMonitor] bootstrap failed: ${error instanceof Error?error.message:String(error)}`);}
  }});
