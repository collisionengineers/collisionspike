/** Adopt a registration-keyed holding folder into a Case/PO archive (TKT-034). */
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { randomUUID } from 'node:crypto';
import { decideArchiveHoldingTransfer } from '@cs/domain';
import { gates } from '@cs/domain/gates';
import { dataApi, type ArchiveHoldingClaim } from '../../adapters/data-api.js';
import { box } from '../../adapters/functions-client.js';

export interface ArchiveHoldingAdoptDeps {
  claim(caseId:string,claimToken:string):Promise<ArchiveHoldingClaim>;
  rename(folderId:string,name:string):Promise<{id:string;outcome?:string}>;
  list(folderId:string,limit?:number,offset?:number):ReturnType<typeof box.listFolderItems>;
  move(fileId:string,folderId:string,name?:string):ReturnType<typeof box.moveFile>;
  deleteFile(fileId:string,expectedFolderId:string):Promise<unknown>;
  deleteFolder(folderId:string):Promise<unknown>;
  checkpoint(holdingId:string,fileId:string,payload:Parameters<typeof dataApi.checkpointArchiveHoldingFile>[2]):Promise<{updated:boolean}>;
  finalize(holdingId:string,payload:Parameters<typeof dataApi.finalizeArchiveHolding>[1]):Promise<{adopted:number}>;
  fail(holdingId:string,payload:{claimToken:string;error:string}):Promise<void>;
  audit(payload:Parameters<typeof dataApi.recordAudit>[0]):Promise<void>;
}

const realDeps:ArchiveHoldingAdoptDeps={
  claim:(caseId,claimToken)=>dataApi.claimArchiveHolding(caseId,claimToken),
  rename:(folderId,name)=>box.renameFolder(folderId,name),
  list:(folderId,limit,offset)=>box.listFolderItems(folderId,limit,offset),
  move:(fileId,folderId,name)=>box.moveFile(fileId,folderId,name),
  deleteFile:(fileId,expectedFolderId)=>box.deleteFile(fileId,expectedFolderId),
  deleteFolder:(folderId)=>box.deleteEmptyFolder(folderId),
  checkpoint:(holdingId,fileId,payload)=>dataApi.checkpointArchiveHoldingFile(holdingId,fileId,payload),
  finalize:(holdingId,payload)=>dataApi.finalizeArchiveHolding(holdingId,payload),
  fail:(holdingId,payload)=>dataApi.failArchiveHoldingAdoption(holdingId,payload),
  audit:(payload)=>dataApi.recordAudit(payload),
};

async function listAllFolderItems(deps:ArchiveHoldingAdoptDeps,folderId:string){
  const entries:Awaited<ReturnType<typeof box.listFolderItems>>['entries']=[];
  const pageSize=1_000;
  let offset=0;
  for(;;){
    const page=await deps.list(folderId,pageSize,offset);
    entries.push(...page.entries);
    offset+=page.entries.length;
    const total=Number(page.total_count);
    if(page.entries.length===0||(Number.isFinite(total)?offset>=total:page.entries.length<pageSize))break;
  }
  return entries;
}

export async function adoptArchiveHolding(caseId:string,deps:ArchiveHoldingAdoptDeps=realDeps,stableClaimToken?:string):Promise<{outcome:string;folderId?:string;adopted?:number;candidates?:string[];folders?:string[]}>{
  if(!gates.boxApi()||!gates.boxFolderAtIntake()||!gates.boxRegFolder())return {outcome:'gated_off'};
  const claimToken=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stableClaimToken??'')
    ? stableClaimToken!
    : randomUUID();
  const claim=await deps.claim(caseId,claimToken);
  if(claim.kind==='none'||claim.kind==='complete')return {outcome:claim.kind};
  if(claim.kind==='ambiguous'){
    if(claim.changed)await deps.audit({action:'box_synced',caseId,summary:'Registration image folder needs a case choice before it can be filed',severity:'warning',after:{candidateCaseIds:claim.candidates??[],candidateFolderIds:claim.folders??[]}}).catch(()=>undefined);
    return {outcome:'ambiguous',candidates:claim.candidates,...(claim.folders?{folders:claim.folders}:{})};
  }
  if(claim.kind==='busy')throw new Error('archive holding adoption is already claimed');
  const activeClaimToken=claim.claimToken;
  try{
    let finalFolderId=claim.canonicalFolderId;
    let transferRequired=claim.mode==='merge';
    if(claim.mode==='rename'){
      const renamed=await deps.rename(claim.holdingFolderId,claim.casePo.toUpperCase());
      if(!renamed.id)throw new Error('archive holding rename returned no folder id');
      // A pre-existing Case/PO folder produces a Box 409 conflict. The facade returns
      // that in-scope folder id, so adopt by the same transfer path instead of looping.
      if(renamed.id!==claim.holdingFolderId){finalFolderId=renamed.id;transferRequired=true;}
    }
    if(transferRequired){
      const destination=await listAllFolderItems(deps,finalFolderId);
      for(const file of claim.files){
        if(['moved','deduplicated','adopted'].includes(file.state))continue;
        if(!file.boxFileId)throw new Error(`held image ${file.id} has no archive file id`);
        const decision=decideArchiveHoldingTransfer(file.filename,file.boxSha1??undefined,file.sha256,destination);
        if(decision.kind==='deduplicate'){
          // A move preserves the Box file id. If the move succeeded but its checkpoint
          // response was lost, the destination match IS the source id: recover the moved
          // checkpoint and never delete the only canonical copy. A different id proves a
          // canonical duplicate exists, so only then may the held source be retired.
          const recoveredMove=decision.existingFileId===file.boxFileId;
          if(!recoveredMove)await deps.deleteFile(file.boxFileId,claim.holdingFolderId);
          const stamped=await deps.checkpoint(claim.holdingId,file.id,{claimToken:activeClaimToken,kind:recoveredMove?'moved':'deduplicated',canonicalFileId:decision.existingFileId,canonicalFileUrl:`https://app.box.com/file/${encodeURIComponent(decision.existingFileId)}`,sourceRetired:true});
          if(!stamped.updated)throw new Error('archive holding dedup checkpoint lost its claim');
        }else{
          const moved=await deps.move(file.boxFileId,finalFolderId,decision.name);
          if(!moved.id)throw new Error('archive holding move returned no file id');
          const stamped=await deps.checkpoint(claim.holdingId,file.id,{claimToken:activeClaimToken,kind:'moved',canonicalFileId:moved.id,canonicalFileUrl:`https://app.box.com/file/${encodeURIComponent(moved.id)}`,sourceRetired:true});
          if(!stamped.updated)throw new Error('archive holding move checkpoint lost its claim');
          destination.push({id:moved.id,name:moved.name??decision.name,type:'file',sha1:moved.sha1});
        }
      }
      // Facade refuses non-empty/recursive deletion. A partial transfer remains retryable.
      await deps.deleteFolder(claim.holdingFolderId);
    }
    const folderUrl=`https://app.box.com/folder/${encodeURIComponent(finalFolderId)}`;
    const finalized=await deps.finalize(claim.holdingId,{caseId,claimToken:activeClaimToken,folderId:finalFolderId,folderUrl});
    return {outcome:'adopted',folderId:finalFolderId,adopted:finalized.adopted};
  }catch(error){
    await deps.fail(claim.holdingId,{claimToken:activeClaimToken,error:error instanceof Error?error.message:String(error)}).catch(()=>undefined);
    throw error;
  }
}

df.app.activity('archiveHoldingAdopt',{handler:async(input:{caseId:string;claimToken?:string},ctx)=>{
  const result=await adoptArchiveHolding(input.caseId,realDeps,input.claimToken);ctx.log(JSON.stringify({evt:'archiveHoldingAdopt',caseId:input.caseId,...result}));return result;
}});
const retry=new df.RetryOptions(5_000,3);retry.backoffCoefficient=2;
df.app.orchestration('archiveHoldingAdoptOrchestrator',function*(ctx){
  const input=ctx.df.getInput() as {caseId:string};
  return yield ctx.df.callActivityWithRetry('archiveHoldingAdopt',retry,{...input,claimToken:ctx.df.newGuid('archive-holding-adopt')});
});
app.http('archive-holding-adopt-start',{methods:['POST'],authLevel:'function',route:'archive-holding-adopt/{caseId}',extraInputs:[df.input.durableClient()],handler:async(req:HttpRequest,ctx:InvocationContext):Promise<HttpResponseInit>=>{
  const caseId=req.params.caseId;if(!caseId)return {status:400,jsonBody:{error:'caseId is required'}};
  const client=df.getClient(ctx);const instanceId=`archive-holding-adopt-${caseId}`;
  await client.startNew('archiveHoldingAdoptOrchestrator',{instanceId,input:{caseId}});
  return client.createCheckStatusResponse(req,instanceId);
}});
