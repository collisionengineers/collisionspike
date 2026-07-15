import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@azure/functions',()=>({app:{http:vi.fn()}}));
vi.mock('durable-functions',()=>({
  app:{activity:vi.fn(),orchestration:vi.fn()}, input:{durableClient:vi.fn()}, getClient:vi.fn(),
  RetryOptions:class { backoffCoefficient=1; constructor(public firstRetryIntervalInMilliseconds:number,public maxNumberOfAttempts:number){} },
}));

const {holdUnmatchedImages}=await import('./imagesUnmatched.js');

const saved={...process.env};
beforeEach(()=>{
  process.env.BOX_API_ENABLED='true';process.env.BOX_REG_FOLDER_ENABLED='true';process.env.BOX_FOLDER_ROOT_ID='test-root';process.env.PDF_MAPPER_ENABLED='true';
});
afterEach(()=>{process.env={...saved};});

function deps(overrides:Record<string,unknown>={}){
  return {
    markAttention:vi.fn(async()=>({stamped:true})), createFolder:vi.fn(async()=>({id:'holding-folder'})),
    hash:vi.fn(async()=> 'a'.repeat(64)), isSignature:vi.fn(async(item:any)=>item.blobPath==='signature'),
    reserve:vi.fn(async()=>({id:'intake-1',acquired:true,completed:false,busy:false})),
    register:vi.fn(async(payload:any)=>({
      holdingId:'holding-1',boxFolderId:'holding-folder',deferred:false,replayed:false,
      files:payload.files.map((f:any,i:number)=>({...f,id:`file-${i}`,boxFileId:null,boxFileUrl:null,
        boxSha1:null,canonicalBoxFileId:null,state:'uploading'})),
    })),
    complete:vi.fn(async()=>({updated:true})),
    upload:vi.fn(async()=>({id:'box-file',sha1:'b'.repeat(40)})), stamp:vi.fn(async()=>({updated:true})),
    fail:vi.fn(async()=>undefined),expand:vi.fn(async()=>[]),...overrides,
  } as any;
}

describe('unmatched image holding intake',()=>{
  it('creates one VRM folder, persists the association, and uploads every genuine image',async()=>{
    const d=deps();
    const result=await holdUnmatchedImages({internetMessageId:'<m1>',vrm:'ab12 cde',attachments:[
      {filename:'front.jpg',contentType:'image/jpeg',blobPath:'m1/front.jpg',size:10,sha256:'1'.repeat(64)},
      {filename:'instruction.pdf',contentType:'application/pdf',blobPath:'m1/i.pdf',size:20},
      {filename:'rear.png',contentType:'image/png',blobPath:'m1/rear.png',size:11},
    ]},d);
    expect(result).toMatchObject({boxFolderId:'holding-folder',uploaded:2});
    expect(d.createFolder).toHaveBeenCalledWith('AB12CDE','test-root');
    expect(d.register.mock.calls[0][0].files).toHaveLength(2);
    expect(d.upload).toHaveBeenCalledTimes(2);expect(d.stamp).toHaveBeenCalledTimes(2);
    expect(d.complete).toHaveBeenCalledWith('intake-1',expect.any(String));
  });

  it('never archives an email signature image alongside a genuine vehicle photo',async()=>{
    const d=deps();
    await holdUnmatchedImages({internetMessageId:'m',vrm:'AB12CDE',attachments:[
      {filename:'damage.jpg',contentType:'image/jpeg',blobPath:'damage',size:20,sha256:'1'.repeat(64)},
      {filename:'image001.png',contentType:'image/png',blobPath:'signature',size:10,sha256:'2'.repeat(64)},
    ]},d);
    expect(d.register.mock.calls[0][0].files.map((item:any)=>item.filename)).toEqual(['damage.jpg']);
    expect(d.upload).toHaveBeenCalledOnce();
  });

  it('keeps a genuine full-size vehicle photo even when Outlook names it image001.jpg',async()=>{
    const d=deps({isSignature:vi.fn(async()=>false)});
    await holdUnmatchedImages({internetMessageId:'m',vrm:'AB12CDE',attachments:[
      {filename:'image001.jpg',contentType:'image/jpeg',blobPath:'large-vehicle-photo',size:750_000,sha256:'2'.repeat(64)},
    ]},d);
    expect(d.register.mock.calls[0][0].files.map((item:any)=>item.filename)).toEqual(['image001.jpg']);
    expect(d.upload).toHaveBeenCalledOnce();
  });

  it('expands a photos-in-a-PDF delivery into held image bytes',async()=>{
    const extracted={filename:'Images - CVD__img_1_1.jpg',contentType:'image/jpeg',blobPath:'derived/img.jpg',size:30,sha256:'3'.repeat(64)};
    const d=deps({expand:vi.fn(async()=>[extracted])});
    const pdf={filename:'Images - CVD.pdf',contentType:'application/pdf',blobPath:'source/images.pdf',size:100};
    const result=await holdUnmatchedImages({internetMessageId:'m',vrm:'AB12CDE',attachments:[pdf]},d);
    expect(d.expand).toHaveBeenCalledWith(pdf,'AB12CDE','m');
    expect(d.register.mock.calls[0][0].files).toEqual([extracted]);
    expect(result.uploaded).toBe(1);
  });

  it('reuses the orchestration-stable claim token across an activity retry',async()=>{
    const d=deps();const claimToken='11111111-1111-4111-8111-111111111111';
    await holdUnmatchedImages({internetMessageId:'m',vrm:'AB12CDE',claimToken,attachments:[
      {filename:'front.jpg',contentType:'image/jpeg',blobPath:'x',size:1,sha256:'1'.repeat(64)},
    ]},d);
    expect(d.register.mock.calls[0][0].claimToken).toBe(claimToken);
    expect(d.reserve.mock.calls[0][0].claimToken).toBe(claimToken);
    expect(d.stamp.mock.calls[0][1].claimToken).toBe(claimToken);
  });

  it('does not create a second folder when the message ledger says adoption already completed',async()=>{
    const d=deps({reserve:vi.fn(async()=>({id:'intake-1',acquired:false,completed:true,busy:false}))});
    const result=await holdUnmatchedImages({internetMessageId:'m',vrm:'AB12CDE',attachments:[
      {filename:'front.jpg',contentType:'image/jpeg',blobPath:'x',size:1,sha256:'1'.repeat(64)},
    ]},d);
    expect(result).toMatchObject({uploaded:0,boxSkipped:'message_replay'});
    expect(d.createFolder).not.toHaveBeenCalled();expect(d.register).not.toHaveBeenCalled();
  });

  it('never creates an empty holding folder',async()=>{
    const d=deps();const result=await holdUnmatchedImages({internetMessageId:'m',vrm:'AB12CDE',attachments:[{filename:'readme.pdf',contentType:'application/pdf',blobPath:'x',size:1}]},d);
    expect(result.boxSkipped).toBe('no_images');expect(d.createFolder).not.toHaveBeenCalled();
  });

  it('does not create an invisible archive holding when the inbox attention marker fails',async()=>{
    const d=deps({markAttention:vi.fn(async()=>{throw new Error('attention unavailable');})});
    await expect(holdUnmatchedImages({internetMessageId:'m',vrm:'AB12CDE',attachments:[
      {filename:'front.jpg',contentType:'image/jpeg',blobPath:'x',size:1,sha256:'1'.repeat(64)},
    ]},d)).rejects.toThrow('attention unavailable');
    expect(d.createFolder).not.toHaveBeenCalled();
    expect(d.register).not.toHaveBeenCalled();
    expect(d.upload).not.toHaveBeenCalled();
  });

  it('also stops when the attention endpoint responds without stamping a row',async()=>{
    const d=deps({markAttention:vi.fn(async()=>({stamped:false}))});
    await expect(holdUnmatchedImages({internetMessageId:'m',vrm:'AB12CDE',attachments:[
      {filename:'front.jpg',contentType:'image/jpeg',blobPath:'x',size:1,sha256:'1'.repeat(64)},
    ]},d)).rejects.toThrow('attention marker was not saved');
    expect(d.createFolder).not.toHaveBeenCalled();
  });

  it('fails the activity after checkpointing an upload failure so Durable retries it',async()=>{
    const d=deps({upload:vi.fn(async()=>{throw new Error('Box unavailable');})});
    await expect(holdUnmatchedImages({internetMessageId:'m',vrm:'AB12CDE',attachments:[{filename:'front.jpg',contentType:'image/jpeg',blobPath:'x',size:1,sha256:'1'.repeat(64)}]},d)).rejects.toThrow('holding incomplete');
    expect(d.fail).toHaveBeenCalledOnce();
  });
});
