import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { SHA256_HEX_RE } from '@cs/domain';
import { withServiceAuth } from '../inbound/internal/service-support.js';
import { claimArchiveHolding, checkpointArchiveHoldingFile, failArchiveHoldingAdoption,
  claimArchiveHoldingUploads, claimDeferredArchiveHoldingIntakes, completeDeferredArchiveHoldingIntake,
  failDeferredArchiveHoldingIntake, failArchiveHoldingUpload, finalizeArchiveHolding,
  listArchiveHoldingAdoptionCaseIds, registerArchiveHolding, reserveArchiveHoldingIntake,
  stampArchiveHoldingUpload } from './archive-holding.js';

const body=async(req:HttpRequest)=>(await req.json()) as Record<string,unknown>;
const bad=(error:string):HttpResponseInit=>({status:400,jsonBody:{error}});
const wrap=(fn:(req:HttpRequest,ctx:InvocationContext)=>Promise<HttpResponseInit>)=>(req:HttpRequest,ctx:InvocationContext)=>withServiceAuth(req,ctx,fn);

app.http('internalArchiveHoldingReserve',{methods:['POST'],authLevel:'anonymous',route:'internal/archive-holding/reserve',handler:wrap(async(req)=>{
  const b=await body(req);const vrm=String(b.vrm??'').toUpperCase().replace(/\s+/g,'');
  if(!/^[A-Z0-9]{2,16}$/.test(vrm)||!b.rootFolderId||!b.sourceMessageId||!b.claimToken||!Array.isArray(b.files))return bad('valid vrm, root, message, claim and files are required');
  const files=(b.files as Array<Record<string,unknown>>).map((f)=>({filename:String(f.filename??''),contentType:String(f.contentType??'application/octet-stream'),size:Number(f.size??0),blobPath:String(f.blobPath??''),sha256:String(f.sha256??'').toLowerCase()}));
  if(!files.length||files.some((f)=>!f.filename||!f.blobPath||!Number.isFinite(f.size)||f.size<0||!SHA256_HEX_RE.test(f.sha256)))return bad('every image needs a filename, blob path, size and sha256');
  return {status:200,jsonBody:await reserveArchiveHoldingIntake({sourceMessageId:String(b.sourceMessageId),vrm,
    rootFolderId:String(b.rootFolderId),claimToken:String(b.claimToken),files})};
})});

app.http('internalArchiveHoldingRegister',{methods:['POST'],authLevel:'anonymous',route:'internal/archive-holding/register',handler:wrap(async(req)=>{
  const b=await body(req); const vrm=String(b.vrm??'').toUpperCase().replace(/\s+/g,'');
  if(!/^[A-Z0-9]{2,16}$/.test(vrm)||!b.rootFolderId||!b.boxFolderId||!b.sourceMessageId||!b.claimToken||!Array.isArray(b.files)) return bad('valid vrm, folder, message, claim and files are required');
  const manifest=b.files as Array<Record<string,unknown>>;
  const files=manifest.map((f)=>({filename:String(f.filename??''),contentType:String(f.contentType??'application/octet-stream'),size:Number(f.size??0),blobPath:String(f.blobPath??''),sha256:String(f.sha256??'').toLowerCase()}));
  if(!files.length||files.some((f)=>!f.filename||!f.blobPath||!Number.isFinite(f.size)||f.size<0||!SHA256_HEX_RE.test(f.sha256)))return bad('every image needs a filename, blob path, size and sha256');
  return {status:200,jsonBody:await registerArchiveHolding({vrm,rootFolderId:String(b.rootFolderId),boxFolderId:String(b.boxFolderId),sourceMessageId:String(b.sourceMessageId),claimToken:String(b.claimToken),files})};
})});

app.http('internalArchiveHoldingUploaded',{methods:['POST'],authLevel:'anonymous',route:'internal/archive-holding/files/{id}/uploaded',handler:wrap(async(req)=>{
  const b=await body(req);if(!req.params.id||!b.claimToken||!b.boxFileId)return bad('file, claim and Box file are required');
  return {status:200,jsonBody:{updated:await stampArchiveHoldingUpload({fileId:req.params.id,claimToken:String(b.claimToken),boxFileId:String(b.boxFileId),boxFileUrl:String(b.boxFileUrl??''),boxSha1:b.boxSha1?String(b.boxSha1):undefined})}};
})});

app.http('internalArchiveHoldingUploadFailed',{methods:['POST'],authLevel:'anonymous',route:'internal/archive-holding/files/{id}/failed',handler:wrap(async(req)=>{
  const b=await body(req);if(!req.params.id||!b.claimToken)return bad('file and claim are required');await failArchiveHoldingUpload(req.params.id,String(b.claimToken),String(b.error??'upload failed'));return {status:204};
})});

app.http('internalArchiveHoldingUploadClaim',{methods:['POST'],authLevel:'anonymous',route:'internal/archive-holding/uploads/claim',handler:wrap(async(req)=>{
  const b=await body(req);if(!b.claimToken)return bad('claim is required');
  return {status:200,jsonBody:{files:await claimArchiveHoldingUploads(String(b.claimToken),Number(b.limit??25))}};
})});

app.http('internalArchiveHoldingAdoptionCandidates',{methods:['GET'],authLevel:'anonymous',route:'internal/archive-holding/adoption-candidates',handler:wrap(async(req)=>{
  const limit=Number(req.query.get('limit')??50);
  return {status:200,jsonBody:{caseIds:await listArchiveHoldingAdoptionCaseIds(limit)}};
})});

app.http('internalArchiveHoldingDeferredClaim',{methods:['POST'],authLevel:'anonymous',route:'internal/archive-holding/deferred/claim',handler:wrap(async(req)=>{
  const b=await body(req);if(!b.claimToken)return bad('claim is required');
  return {status:200,jsonBody:{intakes:await claimDeferredArchiveHoldingIntakes(String(b.claimToken),Number(b.limit??10))}};
})});

app.http('internalArchiveHoldingDeferredComplete',{methods:['POST'],authLevel:'anonymous',route:'internal/archive-holding/deferred/{id}/complete',handler:wrap(async(req)=>{
  const b=await body(req);if(!req.params.id||!b.claimToken)return bad('intake and claim are required');
  return {status:200,jsonBody:{updated:await completeDeferredArchiveHoldingIntake(req.params.id,String(b.claimToken))}};
})});

app.http('internalArchiveHoldingDeferredFailed',{methods:['POST'],authLevel:'anonymous',route:'internal/archive-holding/deferred/{id}/failed',handler:wrap(async(req)=>{
  const b=await body(req);if(!req.params.id||!b.claimToken)return bad('intake and claim are required');
  await failDeferredArchiveHoldingIntake(req.params.id,String(b.claimToken),String(b.error??'deferred intake failed'));
  return {status:204};
})});

app.http('internalArchiveHoldingClaim',{methods:['POST'],authLevel:'anonymous',route:'internal/cases/{id}/archive-holding/claim',handler:wrap(async(req)=>{
  const b=await body(req);if(!req.params.id||!b.claimToken)return bad('case and claim are required');return {status:200,jsonBody:await claimArchiveHolding(req.params.id,String(b.claimToken))};
})});

app.http('internalArchiveHoldingCheckpoint',{methods:['POST'],authLevel:'anonymous',route:'internal/archive-holding/{id}/files/{fileId}/checkpoint',handler:wrap(async(req)=>{
  const b=await body(req);if(!req.params.id||!req.params.fileId||!b.claimToken||!['moved','deduplicated'].includes(String(b.kind))||!b.canonicalFileId||b.sourceRetired!==true)return bad('holding, file, claim, canonical file and completed source retirement are required');
  return {status:200,jsonBody:{updated:await checkpointArchiveHoldingFile({holdingId:req.params.id,fileId:req.params.fileId,claimToken:String(b.claimToken),kind:String(b.kind) as 'moved'|'deduplicated',canonicalFileId:String(b.canonicalFileId??''),canonicalFileUrl:String(b.canonicalFileUrl??''),sourceRetired:Boolean(b.sourceRetired)})}};
})});

app.http('internalArchiveHoldingFinalize',{methods:['POST'],authLevel:'anonymous',route:'internal/archive-holding/{id}/finalize',handler:wrap(async(req)=>{
  const b=await body(req);if(!req.params.id||!b.caseId||!b.claimToken||!b.folderId)return bad('holding, case, claim and folder are required');return {status:200,jsonBody:await finalizeArchiveHolding({holdingId:req.params.id,caseId:String(b.caseId),claimToken:String(b.claimToken),folderId:String(b.folderId),folderUrl:String(b.folderUrl??'')})};
})});

app.http('internalArchiveHoldingAdoptionFailed',{methods:['POST'],authLevel:'anonymous',route:'internal/archive-holding/{id}/failed',handler:wrap(async(req)=>{
  const b=await body(req);if(!req.params.id||!b.claimToken)return bad('holding and claim are required');await failArchiveHoldingAdoption(req.params.id,String(b.claimToken),String(b.error??'adoption failed'));return {status:204};
})});
