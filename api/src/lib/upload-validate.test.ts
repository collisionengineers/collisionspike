import { describe, it, expect } from 'vitest';
import { classifyUpload, MAX_UPLOAD_BYTES } from './upload-validate.js';

describe('classifyUpload (TKT-068)', () => {
  it('accepts images and PDFs within the size cap', () => {
    expect(classifyUpload('image/jpeg', 1000)).toEqual({ ok: true, kind: 'image' });
    expect(classifyUpload('image/png', 1000)).toEqual({ ok: true, kind: 'image' });
    expect(classifyUpload('application/pdf', 1000)).toEqual({ ok: true, kind: 'document' });
    expect(classifyUpload('image/jpeg; charset=binary', 1000)).toEqual({ ok: true, kind: 'image' });
  });

  it('rejects empty, oversized, and unsupported files with plain-language reasons', () => {
    expect(classifyUpload('image/jpeg', 0).ok).toBe(false);
    const big = classifyUpload('image/jpeg', MAX_UPLOAD_BYTES + 1);
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.reason).toMatch(/15 MB/);
    const bad = classifyUpload('application/zip', 1000);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/photos and PDFs/i);
  });

  it('rejection reasons carry no engineering vocabulary (UI-language rule)', () => {
    for (const r of [
      classifyUpload('application/zip', 10),
      classifyUpload('image/jpeg', 0),
      classifyUpload('image/jpeg', MAX_UPLOAD_BYTES + 1),
    ]) {
      if (!r.ok) expect(r.reason).not.toMatch(/\b(blob|mime|content-type|bytes|multipart|500|null)\b/i);
    }
  });
});
