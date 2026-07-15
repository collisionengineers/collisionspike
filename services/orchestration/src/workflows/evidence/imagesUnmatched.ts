/** Registration-keyed image holding intake (TKT-034). */
import * as df from 'durable-functions';
import { createHash, randomUUID } from 'node:crypto';
import { describeEvidence } from '@cs/domain';
import { gates } from '@cs/domain/gates';
import { dataApi } from '../../adapters/data-api.js';
import { downloadEvidenceBytes, uploadEvidenceBytes } from '../../platform/blob.js';
import { callExtractImages, box } from '../../adapters/functions-client.js';
import { assessSignatureImage } from '../../platform/image-sniff.js';
import { uploadArchiveItem } from '../archive/boxArchive.js';

export interface UnmatchedImageAttachment {
  filename: string; contentType: string; blobPath: string; size: number; sha256?: string;
}

export interface ImagesUnmatchedDeps {
  markAttention(sourceMessageId: string): Promise<{stamped:boolean}>;
  createFolder(name: string, parentId: string): Promise<{ id: string }>;
  hash(blobPath: string): Promise<string>;
  isSignature(item: UnmatchedImageAttachment): Promise<boolean>;
  reserve(payload:Parameters<typeof dataApi.reserveArchiveHoldingIntake>[0]):ReturnType<typeof dataApi.reserveArchiveHoldingIntake>;
  register(payload: Parameters<typeof dataApi.registerArchiveHolding>[0]): ReturnType<typeof dataApi.registerArchiveHolding>;
  complete(id:string,claimToken:string):ReturnType<typeof dataApi.completeDeferredArchiveHoldingIntake>;
  upload(folderId: string, item: { filename: string; blobPath: string; contentType: string }): ReturnType<typeof uploadArchiveItem>;
  stamp(fileId: string, payload: Parameters<typeof dataApi.stampArchiveHoldingUpload>[1]): ReturnType<typeof dataApi.stampArchiveHoldingUpload>;
  fail(fileId: string, payload: { claimToken: string; error: string }): Promise<void>;
  expand(document: UnmatchedImageAttachment, vrm: string, sourceMessageId: string): Promise<UnmatchedImageAttachment[]>;
}

const IMAGE_DOCUMENT_RE=/(?:images?|photos?|damage|\bimg[\W_]|vd\s*image).*\.pdf$/i;

async function expandImageDocument(document:UnmatchedImageAttachment,vrm:string,sourceMessageId:string):Promise<UnmatchedImageAttachment[]>{
  const bytes=await downloadEvidenceBytes(document.blobPath);
  const extracted=await callExtractImages({documentBase64:bytes.toString('base64'),filename:document.filename,vrm});
  const stem=document.filename.replace(/\.pdf$/i,'');
  const images:UnmatchedImageAttachment[]=[];
  for(const image of extracted.images??[]){
    const content=Buffer.from(image.content_base64,'base64');
    if(!content.length)continue;
    const filename=`${stem}__${image.filename}`;
    const landed=await uploadEvidenceBytes(sourceMessageId,filename,content,image.content_type);
    images.push({filename,contentType:image.content_type,blobPath:landed.blobPath,size:landed.size,
      sha256:createHash('sha256').update(content).digest('hex')});
  }
  return images;
}

const realDeps: ImagesUnmatchedDeps = {
  markAttention: (sourceMessageId) => dataApi.markInboundAttention({ sourceMessageId, reason: 'images_no_match' }),
  createFolder: (name, parentId) => box.createFolder(name, parentId),
  hash: async (blobPath) => createHash('sha256').update(await downloadEvidenceBytes(blobPath)).digest('hex'),
  // Graph already applies this byte/dimension verdict before blob landing. Keep the
  // same content-based check here as replay/import defence; never discard a genuine
  // vehicle photo merely because Outlook called it image001.jpg.
  isSignature: async (item) => assessSignatureImage(
    item.filename,
    item.contentType,
    await downloadEvidenceBytes(item.blobPath),
  ).flagged,
  reserve:(payload)=>dataApi.reserveArchiveHoldingIntake(payload),
  register: (payload) => dataApi.registerArchiveHolding(payload),
  complete:(id,claimToken)=>dataApi.completeDeferredArchiveHoldingIntake(id,claimToken),
  upload: (folderId, item) => uploadArchiveItem(folderId, item),
  stamp: (fileId, payload) => dataApi.stampArchiveHoldingUpload(fileId, payload),
  fail: (fileId, payload) => dataApi.failArchiveHoldingUpload(fileId, payload),
  expand: expandImageDocument,
};

export async function holdUnmatchedImages(input: {
  internetMessageId?: string; vrm?: string; attachments?: UnmatchedImageAttachment[]; claimToken?: string;
}, deps: ImagesUnmatchedDeps = realDeps): Promise<{ stamped: boolean; boxFolderId?: string; uploaded: number; boxSkipped?: string }> {
  const sourceMessageId=(input.internetMessageId??'').trim();
  const vrm=(input.vrm??'').trim().toUpperCase().replace(/\s+/g,'');
  let stamped=false;
  // The inbox attention row is how staff discover this lane. Do not create an
  // otherwise invisible remote holding when that durable marker could not be saved;
  // Durable will retry the activity before any folder mutation occurs.
  if(sourceMessageId){
    const attention=await deps.markAttention(sourceMessageId);
    if(!attention.stamped)throw new Error('inbox attention marker was not saved');
    stamped=true;
  }
  const attachments=input.attachments??[];
  const rasterImages:UnmatchedImageAttachment[]=[];
  for(const item of attachments.filter((candidate)=>describeEvidence(candidate.filename,candidate.contentType).isImage)){
    if(!await deps.isSignature(item))rasterImages.push(item);
  }
  const imageDocuments=gates.pdfMapper()?attachments.filter((item)=>IMAGE_DOCUMENT_RE.test(item.filename)):[];
  if(!gates.boxRegFolder())return {stamped,uploaded:0,boxSkipped:'reg_folder_gate_off'};
  if(!gates.boxApi())return {stamped,uploaded:0,boxSkipped:'box_gate_off'};
  if(!vrm)return {stamped,uploaded:0,boxSkipped:'no_registration'};
  const rootFolderId=gates.boxFolderRootId();
  if(!rootFolderId)return {stamped,uploaded:0,boxSkipped:'no_root_id'};
  if(!sourceMessageId)return {stamped,uploaded:0,boxSkipped:'no_message_id'};

  const images=[...rasterImages];
  for(const document of imageDocuments)images.push(...await deps.expand(document,vrm,sourceMessageId));
  if(!images.length)return {stamped,uploaded:0,boxSkipped:'no_images'}; // never report an empty folder as success

  const files=[];
  for(const image of images){
    const supplied=(image.sha256??'').toLowerCase();
    const sha256=/^[0-9a-f]{64}$/.test(supplied)?supplied:await deps.hash(image.blobPath);
    files.push({...image,sha256});
  }
  const claimToken=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.claimToken??'')
    ? input.claimToken!
    : randomUUID();
  const intake=await deps.reserve({vrm,rootFolderId,sourceMessageId,claimToken,files});
  if(intake.completed)return {stamped,uploaded:0,boxSkipped:'message_replay'};
  if(!intake.acquired)throw new Error('registration image intake is already being processed');
  const folder=await deps.createFolder(vrm,rootFolderId);
  const reservation=await deps.register({vrm,rootFolderId,boxFolderId:folder.id,sourceMessageId,claimToken,files});
  if(reservation.deferred)throw new Error('registration image upload queued while folder filing is in progress');
  if(reservation.replayed){
    const completed=await deps.complete(intake.id,claimToken);
    if(!completed.updated)throw new Error('registration image replay could not be completed');
    return {stamped,boxFolderId:reservation.boxFolderId,uploaded:0,boxSkipped:'message_replay'};
  }
  let uploaded=0;
  const failures:string[]=[];
  for(const file of reservation.files){
    try{
      const result=await deps.upload(reservation.boxFolderId,{filename:file.filename,blobPath:file.blobPath,contentType:file.contentType});
      if(!result.id)throw new Error('archive upload returned no file id');
      const stampedUpload=await deps.stamp(file.id,{claimToken,boxFileId:result.id,boxFileUrl:`https://app.box.com/file/${encodeURIComponent(result.id)}`,...(result.sha1?{boxSha1:result.sha1}:{})});
      if(!stampedUpload.updated)throw new Error('archive upload ledger claim changed before stamp');
      uploaded++;
    }catch(error){
      const detail=error instanceof Error?error.message:String(error);
      await deps.fail(file.id,{claimToken,error:detail}).catch(()=>undefined);
      failures.push(`${file.filename}: ${detail}`);
    }
  }
  if(failures.length)throw new Error(`unmatched image holding incomplete: ${failures.join('; ')}`);
  const completed=await deps.complete(intake.id,claimToken);
  if(!completed.updated)throw new Error('registration image intake completion was not saved');
  return {stamped,boxFolderId:reservation.boxFolderId,uploaded};
}

df.app.activity('imagesUnmatched',{handler:async(input:{internetMessageId?:string;vrm?:string;attachments?:UnmatchedImageAttachment[];claimToken?:string},ctx)=>{
  const result=await holdUnmatchedImages(input);
  ctx.log(JSON.stringify({evt:'imagesUnmatched',...result,vrm:(input.vrm??'').replace(/\s+/g,'').toUpperCase()||undefined}));
  return result;
}});
