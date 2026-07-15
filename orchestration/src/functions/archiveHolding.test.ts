import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@azure/functions',()=>({app:{http:vi.fn()}}));
vi.mock('durable-functions',()=>({
  app:{activity:vi.fn(),orchestration:vi.fn()}, input:{durableClient:vi.fn()}, getClient:vi.fn(),
  RetryOptions:class { backoffCoefficient=1; constructor(public firstRetryIntervalInMilliseconds:number,public maxNumberOfAttempts:number){} },
}));
const {adoptArchiveHolding}=await import('./archiveHolding.js');
const saved={...process.env};
beforeEach(()=>{process.env.BOX_API_ENABLED='true';process.env.BOX_FOLDER_AT_INTAKE_ENABLED='true';process.env.BOX_REG_FOLDER_ENABLED='true';});
afterEach(()=>{process.env={...saved};});

function baseDeps(claim:any){return {
  claim:vi.fn(async()=>claim),rename:vi.fn(async(folderId:string)=>({id:folderId})),list:vi.fn(async()=>({entries:[]})),
  move:vi.fn(async(id:string,_folder:string,name?:string)=>({id,name})),deleteFile:vi.fn(async()=>({})),
  deleteFolder:vi.fn(async()=>({})),checkpoint:vi.fn(async()=>({updated:true})),finalize:vi.fn(async()=>({adopted:1})),
  fail:vi.fn(async()=>undefined),audit:vi.fn(async()=>undefined),
} as any;}
const file={id:'ledger-file',filename:'front.jpg',contentType:'image/jpeg',size:10,blobPath:'x',sha256:'1'.repeat(64),boxFileId:'held-file',boxFileUrl:'',boxSha1:'abc',canonicalBoxFileId:null,state:'uploaded'};

describe('archive holding adoption',()=>{
  it('reuses the orchestration-stable claim token across an activity retry',async()=>{
    const claimToken='11111111-1111-4111-8111-111111111111';
    const d=baseDeps({kind:'none'});
    await adoptArchiveHolding('case-1',d,claimToken);
    expect(d.claim).toHaveBeenCalledWith('case-1',claimToken);
  });
  it('renames the holding folder when it becomes the canonical Case/PO folder',async()=>{
    const d=baseDeps({kind:'claimed',holdingId:'h',claimToken:'token',mode:'rename',holdingFolderId:'held',canonicalFolderId:'held',casePo:'QDOS26079',files:[file]});
    expect(await adoptArchiveHolding('case-1',d)).toMatchObject({outcome:'adopted',folderId:'held'});
    expect(d.rename).toHaveBeenCalledWith('held','QDOS26079');expect(d.move).not.toHaveBeenCalled();
  });
  it('deduplicates identical bytes, then retires only the empty holding folder',async()=>{
    const d=baseDeps({kind:'claimed',holdingId:'h',claimToken:'token',mode:'merge',holdingFolderId:'held',canonicalFolderId:'case-folder',casePo:'QDOS26079',files:[file]});
    d.list.mockResolvedValue({entries:[{id:'canonical-file',name:'other.jpg',type:'file',sha1:'ABC'}]});
    await adoptArchiveHolding('case-1',d);
    expect(d.deleteFile).toHaveBeenCalledWith('held-file','held');
    expect(d.checkpoint.mock.calls[0][2]).toMatchObject({kind:'deduplicated',canonicalFileId:'canonical-file',sourceRetired:true});
    expect(d.deleteFolder).toHaveBeenCalledWith('held');
  });
  it('enumerates every destination page before deciding content identity',async()=>{
    const d=baseDeps({kind:'claimed',holdingId:'h',claimToken:'token',mode:'merge',holdingFolderId:'held',canonicalFolderId:'case-folder',casePo:'QDOS26079',files:[file]});
    d.list.mockImplementation(async(_folder:string,_limit:number,offset:number)=>offset===0
      ? {entries:Array.from({length:1000},(_,i)=>({id:`other-${i}`,name:`other-${i}.jpg`,type:'file',sha1:'def'})),total_count:1001}
      : {entries:[{id:'canonical-file',name:'last.jpg',type:'file',sha1:'ABC'}],total_count:1001});
    await adoptArchiveHolding('case-1',d);
    expect(d.list).toHaveBeenCalledTimes(2);
    expect(d.deleteFile).toHaveBeenCalledWith('held-file','held');
    expect(d.move).not.toHaveBeenCalled();
  });
  it('recovers a moved file whose checkpoint response was lost without deleting the canonical copy',async()=>{
    const d=baseDeps({kind:'claimed',holdingId:'h',claimToken:'token',mode:'merge',holdingFolderId:'held',canonicalFolderId:'case-folder',casePo:'QDOS26079',files:[file]});
    d.list.mockResolvedValue({entries:[{id:'held-file',name:'front.jpg',type:'file',sha1:'ABC'}],total_count:1});
    await adoptArchiveHolding('case-1',d);
    expect(d.deleteFile).not.toHaveBeenCalled();
    expect(d.checkpoint.mock.calls[0][2]).toMatchObject({kind:'moved',canonicalFileId:'held-file',sourceRetired:true});
  });
  it('merges into a pre-existing Case/PO folder when rename reports a name conflict',async()=>{
    const d=baseDeps({kind:'claimed',holdingId:'h',claimToken:'token',mode:'rename',holdingFolderId:'held',canonicalFolderId:'held',casePo:'QDOS26079',files:[file]});
    d.rename.mockResolvedValue({id:'existing-case-folder',outcome:'conflict'});
    await adoptArchiveHolding('case-1',d);
    expect(d.move).toHaveBeenCalledWith('held-file','existing-case-folder','front.jpg');
    expect(d.deleteFolder).toHaveBeenCalledWith('held');
    expect(d.finalize.mock.calls[0][1]).toMatchObject({folderId:'existing-case-folder'});
  });
  it('never guesses when multiple active cases share a registration',async()=>{
    const d=baseDeps({kind:'ambiguous',candidates:['a','b'],changed:true});
    expect(await adoptArchiveHolding('a',d)).toEqual({outcome:'ambiguous',candidates:['a','b']});
    expect(d.rename).not.toHaveBeenCalled();expect(d.move).not.toHaveBeenCalled();
    expect(d.audit).toHaveBeenCalledOnce();
  });
  it('does not repeat an unchanged ambiguity audit on a durable retry',async()=>{
    const d=baseDeps({kind:'ambiguous',candidates:['a','b'],changed:false});
    expect(await adoptArchiveHolding('a',d)).toEqual({outcome:'ambiguous',candidates:['a','b']});
    expect(d.audit).not.toHaveBeenCalled();
  });
  it('records a failure checkpoint after a mid-transfer fault',async()=>{
    const d=baseDeps({kind:'claimed',holdingId:'h',claimToken:'token',mode:'merge',holdingFolderId:'held',canonicalFolderId:'case-folder',casePo:'QDOS26079',files:[file]});
    d.move.mockRejectedValue(new Error('move failed'));
    await expect(adoptArchiveHolding('case-1',d)).rejects.toThrow('move failed');
    expect(d.fail).toHaveBeenCalledWith('h',{claimToken:'token',error:'move failed'});
  });
  it('stops and converges on retry when the canonical rename fails',async()=>{
    const claim={kind:'claimed',holdingId:'h',claimToken:'token',mode:'rename',holdingFolderId:'held',canonicalFolderId:'held',casePo:'QDOS26079',files:[file]};
    const d=baseDeps(claim);d.rename.mockRejectedValueOnce(new Error('rename failed')).mockResolvedValue({id:'held'});
    await expect(adoptArchiveHolding('case-1',d)).rejects.toThrow('rename failed');
    expect(d.list).not.toHaveBeenCalled();expect(d.move).not.toHaveBeenCalled();expect(d.finalize).not.toHaveBeenCalled();
    await expect(adoptArchiveHolding('case-1',d)).resolves.toMatchObject({outcome:'adopted'});
    expect(d.finalize).toHaveBeenCalledOnce();
  });
  it('stops before moving bytes and converges when destination enumeration fails',async()=>{
    const claim={kind:'claimed',holdingId:'h',claimToken:'token',mode:'merge',holdingFolderId:'held',canonicalFolderId:'case-folder',casePo:'QDOS26079',files:[file]};
    const d=baseDeps(claim);d.list.mockRejectedValueOnce(new Error('list failed')).mockResolvedValue({entries:[],total_count:0});
    await expect(adoptArchiveHolding('case-1',d)).rejects.toThrow('list failed');
    expect(d.move).not.toHaveBeenCalled();expect(d.deleteFile).not.toHaveBeenCalled();expect(d.finalize).not.toHaveBeenCalled();
    await expect(adoptArchiveHolding('case-1',d)).resolves.toMatchObject({outcome:'adopted'});
    expect(d.move).toHaveBeenCalledOnce();expect(d.finalize).toHaveBeenCalledOnce();
  });
  it('keeps both copies safe and converges when duplicate-source retirement fails',async()=>{
    const claim={kind:'claimed',holdingId:'h',claimToken:'token',mode:'merge',holdingFolderId:'held',canonicalFolderId:'case-folder',casePo:'QDOS26079',files:[file]};
    const d=baseDeps(claim);d.list.mockResolvedValue({entries:[{id:'canonical-file',name:'front.jpg',type:'file',sha1:'ABC'}],total_count:1});
    d.deleteFile.mockRejectedValueOnce(new Error('delete failed')).mockResolvedValue({});
    await expect(adoptArchiveHolding('case-1',d)).rejects.toThrow('delete failed');
    expect(d.checkpoint).not.toHaveBeenCalled();expect(d.deleteFolder).not.toHaveBeenCalled();expect(d.finalize).not.toHaveBeenCalled();
    await expect(adoptArchiveHolding('case-1',d)).resolves.toMatchObject({outcome:'adopted'});
    expect(d.checkpoint).toHaveBeenCalledOnce();expect(d.finalize).toHaveBeenCalledOnce();
  });
  it('does not finalize early and converges when empty-folder retirement fails',async()=>{
    const moved={...file,state:'moved'};
    const claim={kind:'claimed',holdingId:'h',claimToken:'token',mode:'merge',holdingFolderId:'held',canonicalFolderId:'case-folder',casePo:'QDOS26079',files:[moved]};
    const d=baseDeps(claim);d.deleteFolder.mockRejectedValueOnce(new Error('retire failed')).mockResolvedValue({});
    await expect(adoptArchiveHolding('case-1',d)).rejects.toThrow('retire failed');
    expect(d.move).not.toHaveBeenCalled();expect(d.deleteFile).not.toHaveBeenCalled();expect(d.finalize).not.toHaveBeenCalled();
    await expect(adoptArchiveHolding('case-1',d)).resolves.toMatchObject({outcome:'adopted'});
    expect(d.finalize).toHaveBeenCalledOnce();
  });
  it('replays safely when the deduplicated source was deleted but its checkpoint response was lost',async()=>{
    const claim={kind:'claimed',holdingId:'h',claimToken:'token',mode:'merge',holdingFolderId:'held',canonicalFolderId:'case-folder',casePo:'QDOS26079',files:[file]};
    const d=baseDeps(claim);d.list.mockResolvedValue({entries:[{id:'canonical-file',name:'existing.jpg',type:'file',sha1:'ABC'}],total_count:1});
    d.checkpoint.mockRejectedValueOnce(new Error('checkpoint response lost')).mockResolvedValue({updated:true});
    await expect(adoptArchiveHolding('case-1',d,'11111111-1111-4111-8111-111111111111')).rejects.toThrow('checkpoint response lost');
    await expect(adoptArchiveHolding('case-1',d,'11111111-1111-4111-8111-111111111111')).resolves.toMatchObject({outcome:'adopted'});
    expect(d.deleteFile).toHaveBeenCalledTimes(2);expect(d.finalize).toHaveBeenCalledOnce();
  });
  it('replays safely when empty-folder retirement succeeded before finalization failed',async()=>{
    const replayFile={...file};
    const claim={kind:'claimed',holdingId:'h',claimToken:'token',mode:'merge',holdingFolderId:'held',canonicalFolderId:'case-folder',casePo:'QDOS26079',files:[replayFile]};
    const d=baseDeps(claim);d.finalize.mockRejectedValueOnce(new Error('finalize unavailable')).mockResolvedValue({adopted:1});
    await expect(adoptArchiveHolding('case-1',d)).rejects.toThrow('finalize unavailable');
    replayFile.state='moved';
    await expect(adoptArchiveHolding('case-1',d)).resolves.toMatchObject({outcome:'adopted'});
    expect(d.deleteFolder).toHaveBeenCalledTimes(2);expect(d.move).toHaveBeenCalledOnce();
  });
  it('treats a lost finalization response as complete on replay without repeating remote mutations',async()=>{
    const claim={kind:'claimed',holdingId:'h',claimToken:'token',mode:'merge',holdingFolderId:'held',canonicalFolderId:'case-folder',casePo:'QDOS26079',files:[file]};
    const d=baseDeps(claim);d.claim.mockResolvedValueOnce(claim).mockResolvedValueOnce({kind:'complete'});
    d.finalize.mockRejectedValueOnce(new Error('response lost after commit'));
    await expect(adoptArchiveHolding('case-1',d)).rejects.toThrow('response lost after commit');
    await expect(adoptArchiveHolding('case-1',d)).resolves.toEqual({outcome:'complete'});
    expect(d.move).toHaveBeenCalledOnce();expect(d.deleteFolder).toHaveBeenCalledOnce();
  });
  it('stops immediately when a transfer checkpoint loses its lease to another claimant',async()=>{
    const claim={kind:'claimed',holdingId:'h',claimToken:'old-token',mode:'merge',holdingFolderId:'held',canonicalFolderId:'case-folder',casePo:'QDOS26079',files:[file]};
    const d=baseDeps(claim);d.checkpoint.mockResolvedValue({updated:false});
    await expect(adoptArchiveHolding('case-1',d)).rejects.toThrow('lost its claim');
    expect(d.finalize).not.toHaveBeenCalled();
    expect(d.fail).toHaveBeenCalledWith('h',expect.objectContaining({claimToken:'old-token'}));
  });
});
