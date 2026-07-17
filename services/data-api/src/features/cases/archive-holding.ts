import { TERMINAL_STATUSES, canonicalizeVrm, decideArchiveHoldingOwner } from '@cs/domain';
import { caseStatusCodec } from '@cs/domain/codecs';
import { AUDIT_ACTION, writeAuditStrict } from '../../shared/audit.js';
import { tx,type TxQuery } from '../../platform/db/client.js';
import { requestStatusRecompute } from './status-recompute.js';

/** duplicate_keys is TEXT and may hold non-JSON (TKT-141); never coalesce it against a jsonb literal. */
export const NOT_MERGED_INTO_SQL = (col: string): string =>
  `NOT ((CASE WHEN ${col} IS NOT NULL AND pg_input_is_valid(${col},'jsonb') THEN ${col}::jsonb ELSE '{}'::jsonb END) ? 'mergedInto')`;

export interface HoldingFileInput {
  filename: string; contentType: string; size: number; blobPath: string; sha256: string;
}
export interface HoldingFileRow extends HoldingFileInput, Record<string, unknown> {
  id: string; boxFileId: string | null; boxFileUrl: string | null; boxSha1: string | null;
  canonicalBoxFileId: string | null; state: string;
}

export interface HoldingUploadClaim extends HoldingFileRow {
  holdingId: string;
  boxFolderId: string;
  claimToken: string;
}

export interface ArchiveHoldingResolution {
  state: 'none' | 'needs_choice' | 'selected';
  holdingIds: string[];
  folderIds: string[];
  candidateCaseIds: string[];
  candidateCases: Array<{caseId:string;casePo:string|null;claimantName:string|null;providerName:string|null}>;
  sources: Array<{holdingId:string;folderId:string;folderUrl:string|null;sourceMessageId:string|null;
    inboundEmailId:string|null;subject:string|null;fromAddress:string|null;receivedOn:string|null;
    bodyPreview:string|null;filenames:string[]}>;
  selectedCaseId?: string;
  canSelect: boolean;
  hasFailure:boolean;
}

export interface DeferredHoldingIntake extends Record<string,unknown> {
  id:string;sourceMessageId:string;vrm:string;rootFolderId:string;claimToken:string;files:HoldingFileInput[];
}

export interface ArchiveHoldingIntakeReservation {
  id:string;acquired:boolean;completed:boolean;busy:boolean;
}

const terminalCodes = TERMINAL_STATUSES.map((status) => caseStatusCodec.toInt(status)).filter(Boolean);

async function refreshArchiveHoldingBlockers(q:TxQuery,caseIds:string[],requestRecompute=true):Promise<void>{
  const ids=[...new Set(caseIds.filter(Boolean))];
  if(!ids.length)return;
  await q(`WITH desired AS (
      SELECT c.id,EXISTS(SELECT 1 FROM archive_holding_folder h WHERE h.state<>'adopted' AND
        (h.resolved_case_id=c.id OR (h.resolved_case_id IS NULL AND
          (h.candidate_case_ids ? c.id::text OR (h.candidate_case_ids='[]'::jsonb AND
            h.normalized_vrm=regexp_replace(upper(coalesce(c.vrm,'')),'[^A-Z0-9]','','g')))))) AS pending
      FROM case_ c WHERE c.id=ANY($1::uuid[])
    ) UPDATE case_ c SET archive_holding_pending=d.pending,updated_at=now()
      FROM desired d WHERE c.id=d.id AND c.archive_holding_pending IS DISTINCT FROM d.pending`,[ids]);
  if(requestRecompute)for(const id of ids)await requestStatusRecompute(q,id);
}

/** Reserve one message before any remote folder mutation. The deferred-intake row is
 * also the durable recovery manifest, so a crash between reservation and registration
 * is resumed by the singleton rather than creating a second registration folder. */
export async function reserveArchiveHoldingIntake(input:{sourceMessageId:string;vrm:string;rootFolderId:string;
  claimToken:string;files:HoldingFileInput[]}):Promise<ArchiveHoldingIntakeReservation>{
  return tx(async(q)=>{
    const [completed]=await q<{id:string}>(`SELECT i.id FROM archive_holding_intake i
      JOIN archive_holding_folder h ON h.id=i.holding_folder_id
      WHERE i.source_message_id=$1 AND h.state='adopted' LIMIT 1`,[input.sourceMessageId]);
    if(completed){
      const [ledger]=await q<{id:string}>(`INSERT INTO archive_holding_deferred_intake
        (source_message_id,normalized_vrm,root_folder_id,file_manifest,state,completed_at)
        VALUES ($1,$2,$3,$4::jsonb,'completed',now())
        ON CONFLICT (source_message_id) DO UPDATE SET state='completed',completed_at=coalesce(archive_holding_deferred_intake.completed_at,now()),
          claim_token=NULL,claim_expires_at=NULL,last_error=NULL,updated_at=now() RETURNING id`,
        [input.sourceMessageId,input.vrm,input.rootFolderId,JSON.stringify(input.files)]);
      return {id:ledger.id,acquired:false,completed:true,busy:false};
    }
    const [inserted]=await q<{id:string}>(`INSERT INTO archive_holding_deferred_intake
      (source_message_id,normalized_vrm,root_folder_id,file_manifest,state,claim_token,claim_expires_at,attempt_count)
      VALUES ($1,$2,$3,$4::jsonb,'processing',$5::uuid,now()+interval '10 minutes',1)
      ON CONFLICT (source_message_id) DO NOTHING RETURNING id`,
      [input.sourceMessageId,input.vrm,input.rootFolderId,JSON.stringify(input.files),input.claimToken]);
    if(inserted)return {id:inserted.id,acquired:true,completed:false,busy:false};
    const [current]=await q<{id:string;state:string;claimToken:string|null;claimActive:boolean}>(`
      SELECT id,state,claim_token AS "claimToken",claim_token IS NOT NULL AND claim_expires_at>now() AS "claimActive"
      FROM archive_holding_deferred_intake WHERE source_message_id=$1 FOR UPDATE`,[input.sourceMessageId]);
    if(!current)throw new Error('archive holding intake reservation disappeared');
    if(current.state==='completed')return {id:current.id,acquired:false,completed:true,busy:false};
    if(current.claimActive&&current.claimToken!==input.claimToken)
      return {id:current.id,acquired:false,completed:false,busy:true};
    const rows=await q<{id:string}>(`UPDATE archive_holding_deferred_intake SET state='processing',
      normalized_vrm=$2,root_folder_id=$3,file_manifest=$4::jsonb,claim_token=$5::uuid,
      claim_expires_at=now()+interval '10 minutes',attempt_count=attempt_count+1,last_error=NULL,updated_at=now()
      WHERE id=$1 AND state<>'completed' RETURNING id`,
      [current.id,input.vrm,input.rootFolderId,JSON.stringify(input.files),input.claimToken]);
    return {id:current.id,acquired:rows.length===1,completed:false,busy:rows.length===0};
  });
}

export async function registerArchiveHolding(input: {
  vrm: string; rootFolderId: string; boxFolderId: string; sourceMessageId: string;
  claimToken: string; files: HoldingFileInput[];
}): Promise<{ holdingId: string; boxFolderId: string; files: HoldingFileRow[]; deferred:boolean; replayed:boolean }> {
  return tx(async (q) => {
    await q(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`archive-holding:${input.vrm}`]);
    const defer=async(holding:{id:string;boxFolderId:string})=>{
      // Never lose an arrival merely because remote transfer currently owns (or
      // just retired) the folder returned by createFolder. Persist the blob
      // manifest independently; the monitor creates/reuses a fresh VRM folder.
      await q(`INSERT INTO archive_holding_deferred_intake
        (source_message_id,normalized_vrm,root_folder_id,file_manifest)
        VALUES ($1,$2,$3,$4::jsonb)
        ON CONFLICT (source_message_id) DO UPDATE SET
          file_manifest=EXCLUDED.file_manifest,normalized_vrm=EXCLUDED.normalized_vrm,
          root_folder_id=EXCLUDED.root_folder_id,
          state=CASE WHEN archive_holding_deferred_intake.state='completed' THEN 'completed' ELSE 'pending' END,
          claim_token=NULL,claim_expires_at=NULL,next_attempt_at=now(),last_error=NULL,updated_at=now()`,
        [input.sourceMessageId,input.vrm,input.rootFolderId,JSON.stringify(input.files)]);
      return {holdingId:holding.id,boxFolderId:holding.boxFolderId,files:[] as HoldingFileRow[],deferred:true,replayed:false};
    };
    const [prior]=await q<{id:string;boxFolderId:string;state:string;vrm:string;claimActive:boolean}>(`
      SELECT h.id,h.box_folder_id AS "boxFolderId",h.state,h.normalized_vrm AS vrm,
        h.claim_token IS NOT NULL AND h.claim_expires_at>now() AS "claimActive"
      FROM archive_holding_intake i JOIN archive_holding_folder h ON h.id=i.holding_folder_id
      WHERE i.source_message_id=$1 ORDER BY h.created_at,h.id LIMIT 1 FOR UPDATE OF h`,[input.sourceMessageId]);
    if(prior?.state==='adopted'||(prior&&prior.vrm!==input.vrm))
      return {holdingId:prior.id,boxFolderId:prior.boxFolderId,files:[],deferred:false,replayed:true};
    let holding:{id:string;boxFolderId:string;state:string;claimActive:boolean;vrm?:string}|undefined = prior ?? (await q<{ id: string; boxFolderId: string; state:string; claimActive:boolean }>(`
      SELECT id,box_folder_id AS "boxFolderId",state,
        claim_token IS NOT NULL AND claim_expires_at>now() AS "claimActive"
      FROM archive_holding_folder
      WHERE normalized_vrm=$1 AND root_folder_id=$2 AND state<>'adopted'
      ORDER BY created_at,id LIMIT 1 FOR UPDATE`,[input.vrm,input.rootFolderId]))[0];
    if(!holding){
      const [retiredFolder]=await q<{id:string;boxFolderId:string}>(`SELECT id,box_folder_id AS "boxFolderId"
        FROM archive_holding_folder WHERE box_folder_id=$1 FOR UPDATE`,[input.boxFolderId]);
      if(retiredFolder)return defer(retiredFolder);
      [holding]=await q<{id:string;boxFolderId:string;state:string;claimActive:boolean}>(`
        INSERT INTO archive_holding_folder (normalized_vrm,root_folder_id,box_folder_id,box_folder_url)
        VALUES ($1,$2,$3,$4) RETURNING id,box_folder_id AS "boxFolderId",state,false AS "claimActive"`,
        [input.vrm,input.rootFolderId,input.boxFolderId,`https://app.box.com/folder/${input.boxFolderId}`]);
    }else if((holding.state==='adopting'&&holding.claimActive)||holding.boxFolderId!==input.boxFolderId){
      return defer(holding);
    }
    // Both $2 references cast ::text: the INSERT target deduces varchar while the inner
    // `=` comparison deduces text — mixed, Postgres rejects the statement at parse time
    // ("inconsistent types deduced for parameter $2"), 500ing this route on every call.
    await q(`INSERT INTO archive_holding_intake (holding_folder_id, source_message_id, inbound_email_id)
      VALUES ($1,$2::text,(SELECT id FROM inbound_email WHERE source_message_id=$2::text LIMIT 1))
      ON CONFLICT (source_message_id) DO UPDATE SET
        inbound_email_id=coalesce(archive_holding_intake.inbound_email_id,EXCLUDED.inbound_email_id)`, [holding.id, input.sourceMessageId]);
    for (const file of input.files) {
      await q(`INSERT INTO archive_holding_file
        (holding_folder_id,source_message_id,file_name,content_type,size_bytes,blob_path,sha256)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (holding_folder_id,sha256) DO NOTHING`,
        [holding.id,input.sourceMessageId,file.filename,file.contentType,file.size,file.blobPath,file.sha256]);
    }
    const matchingCases=await q<{caseId:string}>(`SELECT id AS "caseId" FROM case_
      WHERE regexp_replace(upper(coalesce(vrm,'')),'[^A-Z0-9]','','g')=$1
        AND status_code<>ALL($2::int[]) AND ${NOT_MERGED_INTO_SQL('duplicate_keys')}`,
      [input.vrm,terminalCodes]);
    await refreshArchiveHoldingBlockers(q,matchingCases.map((row)=>row.caseId));
    await q(`UPDATE archive_holding_folder SET next_attempt_at=now(),updated_at=now() WHERE id=$1`,[holding.id]);
    const files = await q<HoldingFileRow>(`
      UPDATE archive_holding_file SET state='uploading', claim_token=$2::uuid,
        claim_expires_at=now()+interval '10 minutes', attempt_count=attempt_count+1,
        last_error=NULL, updated_at=now()
      WHERE holding_folder_id=$1 AND (
        box_file_id IS NULL AND (claim_token IS NULL OR claim_expires_at<=now() OR claim_token=$2::uuid)
      )
      RETURNING id,file_name AS filename,content_type AS "contentType",size_bytes::int AS size,
        blob_path AS "blobPath",sha256,box_file_id AS "boxFileId",box_file_url AS "boxFileUrl",
        box_sha1 AS "boxSha1",canonical_box_file_id AS "canonicalBoxFileId",state`, [holding.id,input.claimToken]);
    return { holdingId: holding.id, boxFolderId:holding.boxFolderId, files, deferred:false,replayed:false };
  });
}

export async function claimDeferredArchiveHoldingIntakes(claimToken:string,limit=10):Promise<DeferredHoldingIntake[]>{
  const bounded=Math.max(1,Math.min(50,Math.trunc(limit)||10));
  return tx((q)=>q<DeferredHoldingIntake>(`WITH picked AS (
      SELECT id FROM archive_holding_deferred_intake
      WHERE state<>'completed' AND next_attempt_at<=now()
        AND (claim_token IS NULL OR claim_expires_at<=now() OR claim_token=$1::uuid)
      ORDER BY next_attempt_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT $2
    ) UPDATE archive_holding_deferred_intake d SET state='processing',claim_token=$1::uuid,
      claim_expires_at=now()+interval '10 minutes',attempt_count=attempt_count+1,last_error=NULL,updated_at=now()
    FROM picked WHERE d.id=picked.id
    RETURNING d.id,d.source_message_id AS "sourceMessageId",d.normalized_vrm AS vrm,
      d.root_folder_id AS "rootFolderId",d.file_manifest AS files,$1::text AS "claimToken"`,[claimToken,bounded]));
}

export async function completeDeferredArchiveHoldingIntake(id:string,claimToken:string):Promise<boolean>{
  const rows=await tx((q)=>q<{id:string}>(`UPDATE archive_holding_deferred_intake SET state='completed',
    claim_token=NULL,claim_expires_at=NULL,last_error=NULL,completed_at=now(),updated_at=now()
    WHERE id=$1 AND claim_token=$2::uuid RETURNING id`,[id,claimToken]));
  return rows.length===1;
}

export async function failDeferredArchiveHoldingIntake(id:string,claimToken:string,error:string):Promise<void>{
  await tx((q)=>q(`UPDATE archive_holding_deferred_intake SET state='failed',claim_token=NULL,
    claim_expires_at=NULL,
    next_attempt_at=now()+make_interval(secs=>least(3600,(30*power(2,least(attempt_count,7)))::int)),
    last_error=$3,updated_at=now() WHERE id=$1 AND claim_token=$2::uuid`,
    [id,claimToken,error.slice(0,400)]));
}

export async function stampArchiveHoldingUpload(input: {
  fileId: string; claimToken: string; boxFileId: string; boxFileUrl: string; boxSha1?: string;
}): Promise<boolean> {
  const rows = await tx((q) => q<{ id: string }>(`UPDATE archive_holding_file SET
    box_file_id=$3,box_file_url=$4,box_sha1=NULLIF($5,''),state='uploaded',claim_token=NULL,
    claim_expires_at=NULL,last_error=NULL,updated_at=now()
    WHERE id=$1 AND claim_token=$2::uuid AND box_file_id IS NULL RETURNING id`,
    [input.fileId,input.claimToken,input.boxFileId,input.boxFileUrl,input.boxSha1 ?? '']));
  return rows.length === 1;
}

export async function failArchiveHoldingUpload(fileId: string, claimToken: string, error: string): Promise<void> {
  await tx((q) => q(`UPDATE archive_holding_file SET state='failed',claim_token=NULL,claim_expires_at=NULL,
    next_attempt_at=now()+make_interval(secs=>least(3600,(30*power(2,least(attempt_count,7)))::int)),
    last_error=$3,updated_at=now() WHERE id=$1 AND claim_token=$2::uuid`, [fileId,claimToken,error.slice(0,400)]));
}

/** Claim failed/reserved upload rows independently of the original intake instance.
 * The blob path is durable, so a monitor can finish an upload after Durable exhausts
 * the arrival's retries. SKIP LOCKED permits an operator-triggered recovery alongside
 * the singleton without uploading the same row twice. */
export async function claimArchiveHoldingUploads(claimToken:string,limit=25):Promise<HoldingUploadClaim[]>{
  const bounded=Math.max(1,Math.min(100,Math.trunc(limit)||25));
  return tx((q)=>q<HoldingUploadClaim>(`WITH picked AS (
      SELECT f.id FROM archive_holding_file f
      JOIN archive_holding_folder h ON h.id=f.holding_folder_id
      WHERE f.box_file_id IS NULL AND h.state<>'adopted'
        AND NOT (h.state='adopting' AND h.claim_token IS NOT NULL AND h.claim_expires_at>now())
        AND f.next_attempt_at<=now()
        AND (f.claim_token IS NULL OR f.claim_expires_at<=now() OR f.claim_token=$1::uuid)
      ORDER BY f.next_attempt_at,f.created_at,f.id FOR UPDATE OF f SKIP LOCKED LIMIT $2
    ), claimed AS (
      UPDATE archive_holding_file f SET state='uploading',claim_token=$1::uuid,
        claim_expires_at=now()+interval '10 minutes',attempt_count=attempt_count+1,
        last_error=NULL,updated_at=now()
      FROM picked WHERE f.id=picked.id
      RETURNING f.*
    ) SELECT c.id,c.holding_folder_id AS "holdingId",h.box_folder_id AS "boxFolderId",
      $1::text AS "claimToken",c.file_name AS filename,c.content_type AS "contentType",
      c.size_bytes::int AS size,c.blob_path AS "blobPath",c.sha256,c.box_file_id AS "boxFileId",
      c.box_file_url AS "boxFileUrl",c.box_sha1 AS "boxSha1",
      c.canonical_box_file_id AS "canonicalBoxFileId",c.state
    FROM claimed c JOIN archive_holding_folder h ON h.id=c.holding_folder_id
    ORDER BY c.created_at,c.id`,[claimToken,bounded]));
}

/** Cases whose complete holding epoch can now be adopted. This covers both recovery
 * and the instruction-first race: when the instruction saw no holding, the later image
 * upload is discovered here and converges into the already-created Case/PO folder. */
export async function listArchiveHoldingAdoptionCaseIds(limit=50):Promise<string[]>{
  const bounded=Math.max(1,Math.min(200,Math.trunc(limit)||50));
  return tx(async(q)=>{
    const rows=await q<{caseId:string}>(`WITH eligible AS (
      SELECT DISTINCT ON (h.normalized_vrm) h.id,h.normalized_vrm,h.resolved_case_id,h.next_attempt_at
      FROM archive_holding_folder h
      WHERE h.state<>'adopted'
        AND h.next_attempt_at<=now()
        AND NOT (h.claim_token IS NOT NULL AND h.claim_expires_at>now())
        AND NOT EXISTS (SELECT 1 FROM archive_holding_file f
          WHERE f.holding_folder_id=h.id AND f.box_file_id IS NULL)
      ORDER BY h.normalized_vrm,h.next_attempt_at,h.created_at,h.id
    ) SELECT picked.id AS "caseId" FROM eligible e
      JOIN LATERAL (SELECT c.id FROM case_ c
        WHERE ((e.resolved_case_id IS NOT NULL AND c.id=e.resolved_case_id)
          OR (e.resolved_case_id IS NULL
            AND regexp_replace(upper(coalesce(c.vrm,'')),'[^A-Z0-9]','','g')=e.normalized_vrm))
          AND c.case_po IS NOT NULL
          AND c.status_code<>ALL($1::int[])
          AND ${NOT_MERGED_INTO_SQL('c.duplicate_keys')}
        ORDER BY c.created_at,c.id LIMIT 1) picked ON true
      ORDER BY e.next_attempt_at,e.id LIMIT $2`,[terminalCodes,bounded]);
    const ids=rows.map((row)=>row.caseId);
    await refreshArchiveHoldingBlockers(q,ids);
    return ids;
  });
}

export async function readArchiveHoldingResolution(caseId:string):Promise<ArchiveHoldingResolution>{
  return tx(async(q)=>{
    const [target]=await q<{vrm:string|null}>(`SELECT vrm FROM case_ WHERE id=$1
      AND ${NOT_MERGED_INTO_SQL('duplicate_keys')}`,[caseId]);
    const vrm=canonicalizeVrm(target?.vrm);
    if(!vrm)return {state:'none',holdingIds:[],folderIds:[],candidateCaseIds:[],candidateCases:[],sources:[],canSelect:false,hasFailure:false};
    const rows=await q<{id:string;folderId:string;state:string;candidateCaseIds:unknown;resolvedCaseId:string|null}>(`
      SELECT id,box_folder_id AS "folderId",state,candidate_case_ids AS "candidateCaseIds",
        resolved_case_id AS "resolvedCaseId"
      FROM archive_holding_folder WHERE normalized_vrm=$1
        AND state IN ('ambiguous','failed')
      ORDER BY created_at,id`,[vrm]);
    const relevant=rows.filter((row)=>{
      const ids=Array.isArray(row.candidateCaseIds)?row.candidateCaseIds.filter((id):id is string=>typeof id==='string'):[];
      return row.resolvedCaseId===caseId||ids.includes(caseId);
    });
    if(!relevant.length)return {state:'none',holdingIds:[],folderIds:[],candidateCaseIds:[],candidateCases:[],sources:[],canSelect:false,hasFailure:false};
    const candidates=[...new Set(relevant.flatMap((row)=>Array.isArray(row.candidateCaseIds)
      ? row.candidateCaseIds.filter((id):id is string=>typeof id==='string'):[]))];
    const candidateCases=candidates.length?await q<{caseId:string;casePo:string|null;claimantName:string|null;providerName:string|null}>(`
      SELECT c.id AS "caseId",c.case_po AS "casePo",NULLIF(btrim(c.eva_claimant_name),'') AS "claimantName",
        wp.display_name AS "providerName"
      FROM case_ c LEFT JOIN work_provider wp ON wp.id=c.work_provider_id
      WHERE c.id=ANY($1::uuid[]) ORDER BY c.created_at,c.id`,[candidates]):[];
    const sources=await q<{holdingId:string;folderId:string;folderUrl:string|null;sourceMessageId:string|null;
      inboundEmailId:string|null;subject:string|null;fromAddress:string|null;receivedOn:string|null;
      bodyPreview:string|null;filenames:unknown}>(`
      SELECT h.id AS "holdingId",h.box_folder_id AS "folderId",h.box_folder_url AS "folderUrl",
        i.source_message_id AS "sourceMessageId",ie.id AS "inboundEmailId",ie.subject,
        ie.from_address AS "fromAddress",ie.received_on AS "receivedOn",ie.body_preview AS "bodyPreview",
        coalesce(jsonb_agg(DISTINCT f.file_name) FILTER (WHERE f.id IS NOT NULL),'[]'::jsonb) AS filenames
      FROM archive_holding_folder h
      LEFT JOIN archive_holding_intake i ON i.holding_folder_id=h.id
      LEFT JOIN inbound_email ie ON ie.source_message_id=i.source_message_id
      LEFT JOIN archive_holding_file f ON f.holding_folder_id=h.id
      WHERE h.id=ANY($1::uuid[])
      GROUP BY h.id,h.box_folder_id,h.box_folder_url,i.source_message_id,i.created_at,
        ie.id,ie.subject,ie.from_address,ie.received_on,ie.body_preview
      ORDER BY h.created_at,i.created_at`,[relevant.map((row)=>row.id)]);
    const sourceConflicts=await q<{caseId:string}>(`SELECT DISTINCT ie.case_id AS "caseId"
      FROM archive_holding_intake i JOIN inbound_email ie ON ie.source_message_id=i.source_message_id
      WHERE i.holding_folder_id=ANY($1::uuid[]) AND ie.case_id IS NOT NULL AND ie.case_id<>$2`,
      [relevant.map((row)=>row.id),caseId]);
    const selected=relevant.every((row)=>row.resolvedCaseId===caseId);
    const conflicting=relevant.some((row)=>row.resolvedCaseId!==null&&row.resolvedCaseId!==caseId);
    return {state:selected?'selected':'needs_choice',holdingIds:relevant.map((row)=>row.id),
      folderIds:relevant.map((row)=>row.folderId),candidateCaseIds:candidates,candidateCases,
      sources:sources.map((source)=>({...source,filenames:Array.isArray(source.filenames)
        ? source.filenames.filter((name):name is string=>typeof name==='string'):[]})),
      ...(selected?{selectedCaseId:caseId}:{}),
      canSelect:!selected&&!conflicting&&!sourceConflicts.length&&candidates.includes(caseId),
      hasFailure:relevant.some((row)=>row.state==='failed')};
  });
}

/** Explicit staff choice for an ambiguous registration. It records identity only;
 * the durable monitor performs the remote archive mutation and retries it safely. */
export async function resolveArchiveHolding(caseId:string,actor:string):Promise<{resolved:number;holdingIds:string[]}>{
  return tx(async(q)=>{
    const [probe]=await q<{vrm:string|null}>(`SELECT vrm FROM case_ WHERE id=$1`,[caseId]);
    const vrm=canonicalizeVrm(probe?.vrm);
    if(!vrm)throw new Error('case registration is unavailable');
    await q(`SELECT pg_advisory_xact_lock(hashtext($1))`,[`archive-holding:${vrm}`]);
    const target=await q<{id:string}>(`SELECT id FROM case_ WHERE id=$1
      AND status_code<>ALL($2::int[]) AND ${NOT_MERGED_INTO_SQL('duplicate_keys')}
      FOR UPDATE`,[caseId,terminalCodes]);
    if(!target.length)throw new Error('case is not available for registration image filing');
    const holdings=await q<{id:string;resolvedCaseId:string|null;claimActive:boolean;candidateCaseIds:unknown}>(`SELECT id,resolved_case_id AS "resolvedCaseId",
        candidate_case_ids AS "candidateCaseIds",
        claim_token IS NOT NULL AND claim_expires_at>now() AS "claimActive"
      FROM archive_holding_folder WHERE normalized_vrm=$1 AND state IN ('ambiguous','failed')
        AND candidate_case_ids ? $2 ORDER BY created_at,id FOR UPDATE`,[vrm,caseId]);
    if(!holdings.length)throw new Error('no registration image folder is awaiting this case choice');
    if(holdings.some((row)=>row.claimActive))throw new Error('registration image folder is currently being filed');
    const sourceConflicts=await q<{caseId:string}>(`SELECT DISTINCT ie.case_id AS "caseId"
      FROM archive_holding_intake i JOIN inbound_email ie ON ie.source_message_id=i.source_message_id
      WHERE i.holding_folder_id=ANY($1::uuid[]) AND ie.case_id IS NOT NULL AND ie.case_id<>$2`,
      [holdings.map((row)=>row.id),caseId]);
    if(sourceConflicts.length)throw new Error('a source email is linked to another case');
    if(holdings.some((row)=>row.resolvedCaseId&&row.resolvedCaseId!==caseId))
      throw new Error('registration image folder was already assigned to another case');
    const ids=holdings.map((row)=>row.id);
    const changed=await q<{id:string}>(`UPDATE archive_holding_folder SET resolved_case_id=$2,
      resolved_by=$3,resolved_at=coalesce(resolved_at,now()),next_attempt_at=now(),updated_at=now()
      WHERE id=ANY($1::uuid[]) AND resolved_case_id IS NULL RETURNING id`,
      [ids,caseId,actor]);
    if(!changed.length)return {resolved:0,holdingIds:[]};
    await q(`UPDATE case_ SET on_hold=true,updated_at=now() WHERE id=$1`,[caseId]);
    await refreshArchiveHoldingBlockers(q,[caseId,...holdings.flatMap((row)=>Array.isArray(row.candidateCaseIds)
      ? row.candidateCaseIds.filter((id):id is string=>typeof id==='string'):[])]);
    await writeAuditStrict({action:AUDIT_ACTION.box_synced,caseId,actor,
      summary:'Registration image folder assigned to this case',
      after:{holdingIds:changed.map((row)=>row.id),registration:vrm}},q);
    return {resolved:changed.length,holdingIds:changed.map((row)=>row.id)};
  });
}

export type HoldingClaim =
  | { kind: 'none' | 'busy' | 'complete' | 'ambiguous'; candidates?: string[]; folders?: string[]; changed?: boolean }
  | { kind: 'claimed'; holdingId: string; claimToken: string; mode: 'rename'|'merge';
      holdingFolderId: string; canonicalFolderId: string; casePo: string; files: HoldingFileRow[] };

export async function claimArchiveHolding(caseId: string, claimToken: string): Promise<HoldingClaim> {
  return tx(async (q) => {
    const [probe] = await q<{vrm:string|null}>(`SELECT vrm FROM case_ WHERE id=$1`,[caseId]);
    if(!probe?.vrm)return {kind:'none'};
    const vrm=canonicalizeVrm(probe.vrm);
    // Case minting takes this same key. The first exact observation is only a
    // candidate snapshot (below); after the settle timer, this lock waits for any
    // already-running same-VRM mint before the second and decisive re-read.
    await q(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [`triage:vrm:${vrm}`]);
    await q(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`archive-holding:${vrm}`]);
    // Lock only after the registration advisory lock. Two same-registration cases can
    // no longer deadlock by each holding its case row while waiting for the other lock.
    const [target] = await q<{ id:string;vrm:string|null;casePo:string|null;boxFolderId:string|null }>(
      `SELECT id,vrm,case_po AS "casePo",box_folder_id AS "boxFolderId" FROM case_
       WHERE id=$1 AND status_code<>ALL($2::int[])
         AND ${NOT_MERGED_INTO_SQL('duplicate_keys')} FOR UPDATE`, [caseId,terminalCodes]);
    if (!target?.vrm || !target.casePo || canonicalizeVrm(target.vrm)!==vrm) return { kind: 'none' };
    const holdings = await q<{ id:string;boxFolderId:string;state:string;adoptedCaseId:string|null;resolvedCaseId:string|null;claimToken:string|null;claimActive:boolean;retryDeferred:boolean;candidateCaseIds:unknown;candidateFolderIds:unknown }>(`
      SELECT id,box_folder_id AS "boxFolderId",state,adopted_case_id AS "adoptedCaseId",claim_token AS "claimToken",
        resolved_case_id AS "resolvedCaseId",
        claim_token IS NOT NULL AND claim_expires_at>now() AS "claimActive",
        next_attempt_at>now() AS "retryDeferred",
        candidate_case_ids AS "candidateCaseIds",candidate_folder_ids AS "candidateFolderIds"
      FROM archive_holding_folder WHERE normalized_vrm=$1 ORDER BY created_at,id FOR UPDATE`, [vrm]);
    if (!holdings.length) return { kind: 'none' };
    const currentAlreadyAdopted=holdings.some((item)=>item.state==='adopted'&&item.adoptedCaseId===caseId);
    // Adopted epochs are immutable history, regardless of which former case owned them.
    // A later legitimate case for the same registration must be free to adopt a new epoch.
    const unresolved=holdings.filter((item)=>item.state!=='adopted');
    if (!unresolved.length) return { kind:currentAlreadyAdopted?'complete':'none' };
    if(unresolved.some((item)=>item.claimActive&&item.claimToken!==claimToken))return {kind:'busy'};
    const explicitlySelected=unresolved.every((item)=>item.resolvedCaseId===caseId);
    const explicitlyOwnedElsewhere=unresolved.some((item)=>typeof item.resolvedCaseId==='string'&&item.resolvedCaseId!==caseId);
    if(explicitlyOwnedElsewhere){
      const candidateIds=[...new Set(unresolved.flatMap((item)=>Array.isArray(item.candidateCaseIds)
        ? item.candidateCaseIds.filter((id):id is string=>typeof id==='string'):[]))];
      return {kind:'ambiguous',candidates:candidateIds,folders:unresolved.map((item)=>item.boxFolderId),changed:false};
    }
    if(!explicitlySelected&&unresolved.some((item)=>item.retryDeferred))return {kind:'busy'};
    const holding=unresolved[0];
    const candidates = await q<{ caseId:string;casePo:string|null }>(`
      SELECT id AS "caseId",case_po AS "casePo" FROM case_
      WHERE regexp_replace(upper(coalesce(vrm,'')),'[^A-Z0-9]','','g')=$1
        AND status_code <> ALL($2::int[])
        AND ${NOT_MERGED_INTO_SQL('duplicate_keys')}
      ORDER BY created_at,id`, [vrm,terminalCodes]);
    const linkedElsewhere=await q<{caseId:string}>(`SELECT DISTINCT ie.case_id AS "caseId"
      FROM archive_holding_intake i JOIN inbound_email ie ON ie.source_message_id=i.source_message_id
      WHERE i.holding_folder_id=ANY($1::uuid[]) AND ie.case_id IS NOT NULL AND ie.case_id<>$2`,
      [unresolved.map((item)=>item.id),caseId]);
    if(linkedElsewhere.length){
      const ids=[...new Set([...candidates.map((candidate)=>candidate.caseId),...linkedElsewhere.map((row)=>row.caseId)])];
      const folders=unresolved.map((item)=>item.boxFolderId);
      const changed=unresolved.some((item)=>item.state!=='ambiguous'||JSON.stringify(
        Array.isArray(item.candidateCaseIds)?item.candidateCaseIds:[])!==JSON.stringify(ids));
      await q(`UPDATE archive_holding_folder SET state='ambiguous',candidate_case_ids=$2::jsonb,
        candidate_folder_ids=$3::jsonb,claim_token=NULL,claim_expires_at=NULL,
        last_error='A source email is linked to another case',next_attempt_at=now()+interval '15 minutes',updated_at=now()
        WHERE id=ANY($1::uuid[])`,[unresolved.map((item)=>item.id),JSON.stringify(ids),JSON.stringify(folders)]);
      if(candidates.length)await q(`UPDATE case_ SET on_hold=true,updated_at=now() WHERE id=ANY($1::uuid[])`,
        [candidates.map((candidate)=>candidate.caseId)]);
      await refreshArchiveHoldingBlockers(q,ids);
      return {kind:'ambiguous',candidates:ids,folders,changed};
    }
    const owner = decideArchiveHoldingOwner(candidates);
    const exactOwner=unresolved.length===1&&owner.kind==='exact'&&owner.candidate.caseId===caseId;
    if(!explicitlySelected&&exactOwner){
      const previous=Array.isArray(holding.candidateCaseIds)
        ? holding.candidateCaseIds.filter((id):id is string=>typeof id==='string'):[];
      if(previous.length!==1||previous[0]!==caseId){
        await q(`UPDATE archive_holding_folder SET state='open',candidate_case_ids=$2::jsonb,candidate_folder_ids=$3::jsonb,
          claim_token=NULL,claim_expires_at=NULL,next_attempt_at=now()+interval '2 minutes',updated_at=now()
          WHERE id=$1`,[holding.id,JSON.stringify([caseId]),JSON.stringify([holding.boxFolderId])]);
        await refreshArchiveHoldingBlockers(q,[caseId]);
        return {kind:'busy'};
      }
    }
    if (!explicitlySelected&&(unresolved.length!==1 || owner.kind!=='exact' || owner.candidate.caseId!==caseId)) {
      const ids = candidates.map((candidate) => candidate.caseId);
      const folders=unresolved.map((item)=>item.boxFolderId);
      const changed=unresolved.some((item)=>{
        const previousIds=Array.isArray(item.candidateCaseIds)?item.candidateCaseIds.filter((id):id is string=>typeof id==='string'):[];
        const previousFolders=Array.isArray(item.candidateFolderIds)?item.candidateFolderIds.filter((id):id is string=>typeof id==='string'):[];
        return !['ambiguous','adopted'].includes(item.state)||JSON.stringify(previousIds)!==JSON.stringify(ids)||JSON.stringify(previousFolders)!==JSON.stringify(folders);
      });
      await q(`UPDATE archive_holding_folder SET state=CASE WHEN state='adopted' THEN state ELSE 'ambiguous' END,
        candidate_case_ids=$2::jsonb,candidate_folder_ids=$3::jsonb,claim_token=NULL,claim_expires_at=NULL,
        attempt_count=attempt_count+1,next_attempt_at=now()+interval '15 minutes',updated_at=now()
        WHERE id=ANY($1::uuid[])`, [unresolved.map((item)=>item.id),JSON.stringify(ids),JSON.stringify(folders)]);
      if (ids.length) await q(`UPDATE case_ SET on_hold=true,updated_at=now() WHERE id=ANY($1::uuid[])`, [ids]);
      await refreshArchiveHoldingBlockers(q,ids);
      return { kind:'ambiguous', candidates:ids, folders, changed };
    }
    const [pendingUpload]=await q<{count:string}>(`SELECT count(*)::text AS count FROM archive_holding_file
      WHERE holding_folder_id=$1 AND box_file_id IS NULL`,[holding.id]);
    if(Number(pendingUpload?.count??0)>0)return {kind:'busy'};
    const claimed = await q<{ id:string }>(`UPDATE archive_holding_folder SET state='adopting',claim_token=$2::uuid,
      claim_expires_at=now()+interval '10 minutes',attempt_count=attempt_count+1,last_error=NULL,updated_at=now()
      WHERE id=$1 AND (claim_token IS NULL OR claim_expires_at<=now() OR claim_token=$2::uuid) RETURNING id`, [holding.id,claimToken]);
    if (!claimed.length) return { kind:'busy' };
    const mode = !target.boxFolderId || target.boxFolderId===holding.boxFolderId ? 'rename' : 'merge';
    const canonicalFolderId = target.boxFolderId ?? holding.boxFolderId;
    await q(`UPDATE archive_holding_folder SET adoption_mode=$2,adopted_case_id=$3,canonical_folder_id=$4 WHERE id=$1`,
      [holding.id,mode,caseId,canonicalFolderId]);
    await refreshArchiveHoldingBlockers(q,[caseId]);
    const files = await q<HoldingFileRow>(`SELECT id,file_name AS filename,content_type AS "contentType",
      size_bytes::int AS size,blob_path AS "blobPath",sha256,box_file_id AS "boxFileId",
      box_file_url AS "boxFileUrl",box_sha1 AS "boxSha1",canonical_box_file_id AS "canonicalBoxFileId",state
      FROM archive_holding_file WHERE holding_folder_id=$1 AND box_file_id IS NOT NULL ORDER BY created_at,id`, [holding.id]);
    return { kind:'claimed',holdingId:holding.id,claimToken,mode,holdingFolderId:holding.boxFolderId,
      canonicalFolderId,casePo:target.casePo,files };
  });
}

export async function checkpointArchiveHoldingFile(input:{
  holdingId:string;fileId:string;claimToken:string;kind:'moved'|'deduplicated';canonicalFileId:string;canonicalFileUrl:string;sourceRetired:boolean;
}):Promise<boolean>{
  const rows=await tx((q)=>q<{id:string}>(`WITH stamped AS (
    UPDATE archive_holding_file f SET state=$4,canonical_box_file_id=$5,
      canonical_box_file_url=$6,source_retired=$7,updated_at=now()
    FROM archive_holding_folder h WHERE f.id=$2 AND f.holding_folder_id=h.id AND h.id=$1
      AND h.claim_token=$3::uuid AND h.claim_expires_at>now() RETURNING f.id
  ), renewed AS (
    UPDATE archive_holding_folder h SET claim_expires_at=now()+interval '10 minutes',updated_at=now()
    WHERE h.id=$1 AND h.claim_token=$3::uuid AND EXISTS(SELECT 1 FROM stamped) RETURNING h.id
  ) SELECT stamped.id FROM stamped JOIN renewed ON true`,[input.holdingId,input.fileId,input.claimToken,input.kind,input.canonicalFileId,input.canonicalFileUrl,input.sourceRetired]));
  return rows.length===1;
}

export async function finalizeArchiveHolding(input:{holdingId:string;caseId:string;claimToken:string;folderId:string;folderUrl:string}):Promise<{adopted:number}>{
  return tx(async(q)=>{
    const [holdingProbe]=await q<{vrm:string}>(`SELECT normalized_vrm AS vrm FROM archive_holding_folder
      WHERE id=$1 AND adopted_case_id=$2`,[input.holdingId,input.caseId]);
    if(!holdingProbe?.vrm)throw new Error('archive holding identity is unavailable during adoption');
    await q(`SELECT pg_advisory_xact_lock(hashtext($1))`,[`archive-holding:${holdingProbe.vrm}`]);
    const lockedCase=await q<{id:string;vrm:string|null}>(`SELECT id,vrm FROM case_ WHERE id=$1
      AND ${NOT_MERGED_INTO_SQL('duplicate_keys')} FOR UPDATE`,[input.caseId]);
    if(!lockedCase.length)throw new Error('case was merged during archive adoption');
    const lockedVrm=canonicalizeVrm(lockedCase[0].vrm);
    const [holding]=await q<{mode:string;holdingFolderId:string;vrm:string}>(`SELECT adoption_mode AS mode,
      box_folder_id AS "holdingFolderId",normalized_vrm AS vrm FROM archive_holding_folder
      WHERE id=$1 AND adopted_case_id=$2 AND claim_token=$3::uuid AND claim_expires_at>now() FOR UPDATE`,[input.holdingId,input.caseId,input.claimToken]);
    if(!holding) throw new Error('archive holding claim is no longer current');
    if(!lockedVrm||lockedVrm!==holding.vrm||holding.vrm!==holdingProbe.vrm)
      throw new Error('case registration changed during archive adoption');
    const sourceRows=await q<{id:string;caseId:string|null}>(`SELECT ie.id,ie.case_id AS "caseId"
      FROM archive_holding_intake i JOIN inbound_email ie ON ie.source_message_id=i.source_message_id
      WHERE i.holding_folder_id=$1 ORDER BY ie.created_at,ie.id FOR UPDATE OF ie`,[input.holdingId]);
    if(sourceRows.some((row)=>row.caseId!==null&&row.caseId!==input.caseId))
      throw new Error('a source email was linked to another case during archive adoption');
    const promotedInPlace=holding.mode==='rename'&&input.folderId===holding.holdingFolderId;
    const incomplete=await q<{count:string}>(`SELECT count(*)::text AS count FROM archive_holding_file WHERE holding_folder_id=$1
      AND (box_file_id IS NULL OR ($2=false AND (state NOT IN ('moved','deduplicated','adopted') OR source_retired=false)))`,[input.holdingId,promotedInPlace]);
    if(Number(incomplete[0]?.count ?? 0)>0) throw new Error('archive holding transfer is incomplete');
    const stamped=await q<{id:string}>(`UPDATE case_ SET box_folder_id=$2,box_folder_url=$3,updated_at=now() WHERE id=$1
      AND (box_folder_id IS NULL OR box_folder_id=$2) RETURNING id`,[input.caseId,input.folderId,input.folderUrl]);
    if(!stamped.length)throw new Error('case archive folder changed during adoption');
    await q(`UPDATE evidence e SET
      box_file_id=coalesce(e.box_file_id,coalesce(f.canonical_box_file_id,f.box_file_id)),
      box_file_url=coalesce(e.box_file_url,coalesce(f.canonical_box_file_url,f.box_file_url)),
      storage_path=coalesce(e.storage_path,f.blob_path),updated_at=now()
      FROM archive_holding_file f WHERE f.holding_folder_id=$1 AND e.case_id=$2 AND e.sha256=f.sha256`,
      [input.holdingId,input.caseId]);
    const rows=await q<{id:string}>(`INSERT INTO evidence
      (file_name,case_id,kind_code,image_role_code,accepted_for_eva,excluded,sha256,content_type,size_bytes,
       storage_path,source_message_id,source_label,box_file_id,box_file_url)
      SELECT f.file_name,$2,100000000,100000003,false,false,f.sha256,f.content_type,f.size_bytes,f.blob_path,
       f.source_message_id,'box_upload_archive_holding',coalesce(f.canonical_box_file_id,f.box_file_id),
       coalesce(f.canonical_box_file_url,f.box_file_url)
      FROM archive_holding_file f WHERE f.holding_folder_id=$1
        AND NOT EXISTS (SELECT 1 FROM evidence e WHERE e.case_id=$2 AND e.sha256=f.sha256)
      RETURNING id`,[input.holdingId,input.caseId]);
    await q(`UPDATE archive_holding_file f SET evidence_id=e.id,state='adopted',updated_at=now()
      FROM evidence e WHERE f.holding_folder_id=$1 AND e.case_id=$2 AND e.sha256=f.sha256`,[input.holdingId,input.caseId]);
    const transferred=await q<{id:string}>(`UPDATE archive_holding_folder SET state='transferred',updated_at=now()
      WHERE id=$1 AND adopted_case_id=$2 AND claim_token=$3::uuid AND claim_expires_at>now() RETURNING id`,
      [input.holdingId,input.caseId,input.claimToken]);
    if(!transferred.length)throw new Error('archive holding claim changed before source email reconciliation');
    const linkedInbound=await q<{id:string}>(`UPDATE inbound_email ie SET case_id=$2,
      triage_state=CASE WHEN ie.triage_state IN ('actioned','dismissed') THEN ie.triage_state ELSE 'routed' END,
      attention_reason=NULL,updated_at=now()
      FROM archive_holding_intake i WHERE i.holding_folder_id=$1 AND ie.source_message_id=i.source_message_id
        AND (ie.case_id IS NULL OR ie.case_id=$2) RETURNING ie.id`,[input.holdingId,input.caseId]);
    await q(`UPDATE archive_holding_folder SET state='adopted',canonical_folder_id=$4,retired_at=now(),
      claim_token=NULL,claim_expires_at=NULL,last_error=NULL,updated_at=now() WHERE id=$1 AND adopted_case_id=$2 AND claim_token=$3::uuid`,
      [input.holdingId,input.caseId,input.claimToken,input.folderId]);
    await refreshArchiveHoldingBlockers(q,[input.caseId],false);
    const newlyLinked=sourceRows.filter((row)=>row.caseId===null).map((row)=>row.id);
    if(newlyLinked.length)await writeAuditStrict({action:AUDIT_ACTION.inbound_linked,caseId:input.caseId,
      actor:'archive-holding-adopt',summary:'Image email linked to this case after its photos were filed',
      before:{caseId:null},after:{caseId:input.caseId,inboundEmailIds:newlyLinked}},q);
    await writeAuditStrict({
      action:AUDIT_ACTION.box_synced,
      caseId:input.caseId,
      actor:'archive-holding-adopt',
      summary:'Registration image folder filed into the case archive',
      after:{holdingId:input.holdingId,mode:holding.mode,folderId:input.folderId,adopted:rows.length,
        inboundEmailIds:linkedInbound.map((row)=>row.id)},
    },q);
    await requestStatusRecompute(q,input.caseId);
    return {adopted:rows.length};
  });
}

export async function failArchiveHoldingAdoption(holdingId:string,claimToken:string,error:string):Promise<void>{
  await tx((q)=>q(`UPDATE archive_holding_folder SET state='failed',claim_token=NULL,claim_expires_at=NULL,
    next_attempt_at=now()+make_interval(secs=>least(3600,(30*power(2,least(attempt_count,7)))::int)),
    last_error=$3,updated_at=now() WHERE id=$1 AND claim_token=$2::uuid`,[holdingId,claimToken,error.slice(0,400)]));
}
