import { describe, it, expect } from 'vitest';
import {
  MAX_ATTACH_BYTES,
  classifyAttachment,
  partitionAttachments,
  fileCountLabel,
  attachmentNote,
  detectCaseRef,
} from './attach-validate';

/* ============================================================
   attach-validate — the assistant attach-evidence client gate (TKT-068).

   Mirrors the server's size/type rule (api/src/lib/upload-validate.ts) so a bad file
   is turned away fast, in the SAME plain-language wording. Pure functions — no I/O, no
   render — so this is a focused unit test of the state machine + rejection messages.
   ============================================================ */

/** A file stand-in — only the three fields the classifier reads (name/type/size). */
const meta = (name: string, type: string, size: number) => ({ name, type, size });

describe('classifyAttachment — accepts photos + PDFs within the cap', () => {
  it('accepts a JPEG as an image', () => {
    expect(classifyAttachment(meta('a.jpg', 'image/jpeg', 1024))).toEqual({ ok: true, kind: 'image' });
  });
  it('accepts a PNG as an image', () => {
    expect(classifyAttachment(meta('a.png', 'image/png', 1024))).toEqual({ ok: true, kind: 'image' });
  });
  it('accepts a PDF as a document', () => {
    expect(classifyAttachment(meta('a.pdf', 'application/pdf', 1024))).toEqual({ ok: true, kind: 'document' });
  });
  it('accepts right up to the 15 MB cap', () => {
    expect(classifyAttachment(meta('big.jpg', 'image/jpeg', MAX_ATTACH_BYTES))).toEqual({ ok: true, kind: 'image' });
  });
  it('tolerates a charset suffix on the type', () => {
    expect(classifyAttachment(meta('a.pdf', 'application/pdf; charset=binary', 1024))).toEqual({
      ok: true,
      kind: 'document',
    });
  });
  it('is case-insensitive on the type', () => {
    expect(classifyAttachment(meta('a.jpg', 'IMAGE/JPEG', 1024))).toEqual({ ok: true, kind: 'image' });
  });
});

describe('classifyAttachment — rejects with plain-language reasons (no engineering terms)', () => {
  it('rejects an over-cap file as too big', () => {
    const r = classifyAttachment(meta('huge.jpg', 'image/jpeg', MAX_ATTACH_BYTES + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('That file is too big — the limit is 15 MB.');
  });
  it('rejects an empty file', () => {
    const r = classifyAttachment(meta('empty.jpg', 'image/jpeg', 0));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('That file looks empty, so I did not add it.');
  });
  it('rejects an unsupported type (e.g. a spreadsheet)', () => {
    const r = classifyAttachment(meta('sheet.xlsx', 'application/vnd.ms-excel', 2048));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('I can only add photos and PDFs to a case.');
  });
  it('rejects a zip masquerading with no image/pdf type', () => {
    const r = classifyAttachment(meta('a.zip', 'application/zip', 2048));
    expect(r.ok).toBe(false);
  });
  it('never leaks an engineering term in the reason', () => {
    const reasons = [
      classifyAttachment(meta('a.xlsx', 'application/vnd.ms-excel', 2048)),
      classifyAttachment(meta('big.jpg', 'image/jpeg', MAX_ATTACH_BYTES + 1)),
      classifyAttachment(meta('empty.jpg', 'image/jpeg', 0)),
    ].flatMap((r) => (r.ok ? [] : [r.reason.toLowerCase()]));
    for (const reason of reasons) {
      for (const banned of ['mime', 'blob', 'payload', 'multipart', 'endpoint', 'byte', '401', '403']) {
        expect(reason).not.toContain(banned);
      }
    }
  });
});

describe('partitionAttachments — splits a picked set into held vs turned-away', () => {
  it('keeps the good ones and explains the bad ones', () => {
    const files = [
      meta('ok.jpg', 'image/jpeg', 1024),
      meta('big.png', 'image/png', MAX_ATTACH_BYTES + 1),
      meta('doc.pdf', 'application/pdf', 2048),
      meta('sheet.csv', 'text/csv', 512),
    ] as unknown as File[];
    const { accepted, rejected } = partitionAttachments(files);
    expect(accepted.map((f) => f.name)).toEqual(['ok.jpg', 'doc.pdf']);
    expect(rejected.map((r) => r.name)).toEqual(['big.png', 'sheet.csv']);
    expect(rejected[0].reason).toContain('too big');
    expect(rejected[1].reason).toContain('photos and PDFs');
  });
  it('returns empty arrays for an empty pick', () => {
    expect(partitionAttachments([])).toEqual({ accepted: [], rejected: [] });
  });
});

describe('fileCountLabel + attachmentNote — plain-language, plural-safe strings', () => {
  it('singular vs plural', () => {
    expect(fileCountLabel(1)).toBe('1 file');
    expect(fileCountLabel(2)).toBe('2 files');
    expect(fileCountLabel(0)).toBe('0 files');
  });
  it('names the files for the model as context (never the bytes)', () => {
    expect(attachmentNote(['photo.jpg', 'scan.pdf'])).toBe('Attached 2 files: photo.jpg, scan.pdf');
    expect(attachmentNote(['one.jpg'])).toBe('Attached 1 file: one.jpg');
  });
});

describe('detectCaseRef — sniffs a target-case handle from conversation text', () => {
  it('finds a registration in a natural request', () => {
    expect(detectCaseRef('add these to the YT13 UTV case').vrm).toBe('YT13UTV');
  });
  it('finds a Case/PO reference', () => {
    expect(detectCaseRef('put these on CCPY26050 please').casePo).toBe('CCPY26050');
  });
  it('finds both when the assistant reply names them together', () => {
    const ref = detectCaseRef('I found CCPY26050 for registration YT13 UTV in the Review queue.');
    expect(ref.casePo).toBe('CCPY26050');
    expect(ref.vrm).toBe('YT13UTV');
  });
  it('returns nothing for plain text with no handle', () => {
    expect(detectCaseRef('how many cases are in review?')).toEqual({});
  });
});
