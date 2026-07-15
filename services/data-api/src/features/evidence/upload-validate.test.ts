import { describe, expect, it } from 'vitest';
import {
  classifyUpload,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_DECODED_BYTES,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_IMAGE_PIXELS,
  MAX_UPLOAD_TOTAL_BYTES,
  UPLOAD_DECODE_TIMEOUT_SECONDS,
  validateUploadBatch,
  validateUploadContent,
} from './upload-validate.js';

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);
const fromBase64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'));
const JPEG = fromBase64('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAB//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AI4BJH7/2Q==');
const PNG = fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWNQaHig0PCAAUIBACcOBgEUBAlLAAAAAElFTkSuQmCC');
const WEBP = fromBase64('UklGRjoAAABXRUJQVlA4IC4AAAAQAgCdASoCAAIAAUAmJaACdLoB+AH4AAPIAP7paR/7B0wZc/xXv/U4EngP35gA');
const SHALLOW_JPEG = bytes(
  0xff, 0xd8,
  0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0,
  0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0,
  0x11, 0xff, 0xd9,
);
const SHALLOW_PNG = bytes(
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 12, 0x49, 0x44, 0x41, 0x54,
  0x78, 0x9c, 0x63, 0x60, 0x60, 0x60, 0, 0, 0, 4, 0, 1,
  0, 0, 0, 0,
  0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0,
);
const SHALLOW_WEBP = bytes(
  0x52, 0x49, 0x46, 0x46, 18, 0, 0, 0,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
  6, 0, 0, 0, 0x2f, 0, 0, 0, 0, 0,
);
function pdfFixture(objectBody = '<<>>', startXrefOverride?: number): Uint8Array {
  const prefix = `%PDF-1.7\n1 0 obj\n${objectBody}\nendobj\n`;
  const xrefOffset = new TextEncoder().encode(prefix).length;
  return new TextEncoder().encode(
    `${prefix}xref\n0 1\n0000000000 65535 f\n` +
    `trailer\n<< /Size 1 >>\nstartxref\n${startXrefOverride ?? xrefOffset}\n%%EOF`,
  );
}
const PDF = pdfFixture();

describe('staff upload validation', () => {
  it('advertises only the photo/PDF formats the signature gate implements', () => {
    expect(classifyUpload('image/jpeg', 1000, 'a.jpg')).toMatchObject({ ok: true, contentType: 'image/jpeg' });
    expect(classifyUpload('image/png', 1000, 'a.png')).toMatchObject({ ok: true, contentType: 'image/png' });
    expect(classifyUpload('image/webp', 1000, 'a.webp')).toMatchObject({ ok: true, contentType: 'image/webp' });
    expect(classifyUpload('image/heic', 1000, 'a.heic').ok).toBe(false);
    expect(classifyUpload('application/pdf', 1000, 'a.pdf')).toMatchObject({ ok: true, kind: 'document' });
    expect(classifyUpload('image/svg+xml', 1000, 'a.svg').ok).toBe(false);
    expect(classifyUpload('message/rfc822', 1000, 'a.eml').ok).toBe(false);
  });

  it('fully decodes real JPEG, PNG and WebP fixtures and accepts a complete PDF', async () => {
    const fixtures: Array<[string, string, Uint8Array]> = [
      ['image/jpeg', 'a.jpg', JPEG],
      ['image/png', 'a.png', PNG],
      ['image/webp', 'a.webp', WEBP],
      ['application/pdf', 'a.pdf', PDF],
    ];
    for (const [contentType, name, body] of fixtures) {
      const metadata = classifyUpload(contentType, body.length, name);
      expect(metadata.ok).toBe(true);
      if (metadata.ok) expect((await validateUploadContent(metadata, body)).ok).toBe(true);
    }
  });

  it('rejects renamed or contradictory content before storage', async () => {
    const jpeg = classifyUpload('image/jpeg', 8, 'photo.jpg');
    expect(jpeg.ok).toBe(true);
    if (jpeg.ok) {
      expect((await validateUploadContent(jpeg, new TextEncoder().encode('<script>'))).ok).toBe(false);
      expect((await validateUploadContent(jpeg, PDF)).ok).toBe(false);
    }
    expect(classifyUpload('image/jpeg', PNG.length, 'photo.png').ok).toBe(false);
    expect(classifyUpload('application/pdf', JPEG.length, 'photo.jpg').ok).toBe(false);
    expect(classifyUpload('application/pdf', PDF.length, 'document.exe').ok).toBe(false);
  });

  it('rejects header-only and truncated containers', async () => {
    const fixtures: Array<[string, string, Uint8Array]> = [
      ['image/jpeg', 'a.jpg', bytes(0xff, 0xd8, 0xff, 0xe0)],
      ['image/png', 'a.png', PNG.slice(0, 33)],
      ['image/webp', 'a.webp', new TextEncoder().encode('RIFFxxxxWEBP')],
      ['application/pdf', 'a.pdf', new TextEncoder().encode('%PDF-1.7')],
    ];
    for (const [contentType, name, body] of fixtures) {
      const metadata = classifyUpload(contentType, Math.max(body.length, 1), name);
      expect(metadata.ok).toBe(true);
      if (metadata.ok) expect((await validateUploadContent(metadata, body)).ok).toBe(false);
    }
    const pngWithoutImageData = bytes(
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
      0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0,
    );
    const pngMetadata = classifyUpload('image/png', pngWithoutImageData.length, 'a.png');
    expect(pngMetadata.ok).toBe(true);
    if (pngMetadata.ok) expect((await validateUploadContent(pngMetadata, pngWithoutImageData)).ok).toBe(false);

    const vp8xOnly = bytes(
      0x52, 0x49, 0x46, 0x46, 22, 0, 0, 0,
      0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58,
      10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    );
    const webpMetadata = classifyUpload('image/webp', vp8xOnly.length, 'a.webp');
    expect(webpMetadata.ok).toBe(true);
    if (webpMetadata.ok) expect((await validateUploadContent(webpMetadata, vp8xOnly)).ok).toBe(false);

    const vp8lHeaderOnly = SHALLOW_WEBP.slice();
    vp8lHeaderOnly[16] = 5; // signature + dimension/version word, but no coded image data
    const losslessMetadata = classifyUpload('image/webp', vp8lHeaderOnly.length, 'a.webp');
    expect(losslessMetadata.ok).toBe(true);
    if (losslessMetadata.ok) {
      expect((await validateUploadContent(losslessMetadata, vp8lHeaderOnly)).ok).toBe(false);
    }

    const jpegWithTruncatedComponentTables = bytes(
      0xff, 0xd8,
      0xff, 0xc0, 0, 8, 8, 0, 1, 0, 1, 1,
      0xff, 0xda, 0, 6, 0, 0, 0, 0,
      0x11, 0x11, 0xff, 0xd9,
    );
    const jpegComponentMetadata = classifyUpload(
      'image/jpeg',
      jpegWithTruncatedComponentTables.length,
      'a.jpg',
    );
    expect(jpegComponentMetadata.ok).toBe(true);
    if (jpegComponentMetadata.ok) {
      expect((await validateUploadContent(jpegComponentMetadata, jpegWithTruncatedComponentTables)).ok)
        .toBe(false);
    }
  });

  it('rejects structurally plausible image containers whose pixels cannot decode', async () => {
    const vp8xWithLosslessImage = bytes(
      0x52, 0x49, 0x46, 0x46, 36, 0, 0, 0,
      0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0x56, 0x50, 0x38, 0x4c, 6, 0, 0, 0, 0x2f, 0, 0, 0, 0, 0,
    );
    const metadata = classifyUpload('image/webp', vp8xWithLosslessImage.length, 'a.webp');
    expect(metadata.ok).toBe(true);
    if (metadata.ok) expect((await validateUploadContent(metadata, vp8xWithLosslessImage)).ok).toBe(false);

    for (const [contentType, name, body] of [
      ['image/jpeg', 'fake.jpg', SHALLOW_JPEG],
      ['image/png', 'fake.png', SHALLOW_PNG],
      ['image/webp', 'fake.webp', SHALLOW_WEBP],
    ] as const) {
      const shallow = classifyUpload(contentType, body.length, name);
      expect(shallow.ok).toBe(true);
      if (shallow.ok) expect((await validateUploadContent(shallow, body)).ok).toBe(false);
    }
  });

  it('requires startxref to resolve to a classic table or cross-reference stream object', async () => {
    const classicMetadata = classifyUpload('application/pdf', PDF.length, 'a.pdf');
    expect(classicMetadata.ok).toBe(true);
    if (classicMetadata.ok) expect((await validateUploadContent(classicMetadata, PDF)).ok).toBe(true);

    const wrongOffset = pdfFixture('<<>>', 9);
    const wrongMetadata = classifyUpload('application/pdf', wrongOffset.length, 'a.pdf');
    expect(wrongMetadata.ok).toBe(true);
    if (wrongMetadata.ok) expect((await validateUploadContent(wrongMetadata, wrongOffset)).ok).toBe(false);

    const streamPrefix =
      '%PDF-1.7\n1 0 obj\n<< /Type/XRef /Length 1 >>\nstream\nx\nendstream\nendobj\n';
    const xrefStream = new TextEncoder().encode(
      `${streamPrefix}startxref\n9\n%%EOF`,
    );
    const streamMetadata = classifyUpload('application/pdf', xrefStream.length, 'a.pdf');
    expect(streamMetadata.ok).toBe(true);
    if (streamMetadata.ok) expect((await validateUploadContent(streamMetadata, xrefStream)).ok).toBe(true);

    const largePayload = 'x'.repeat(2500);
    const largeXrefStream = new TextEncoder().encode(
      '%PDF-1.7\n1 0 obj\n<< /Type /XRef /Length 2500 >>\nstream\n' +
      `${largePayload}\nendstream\nendobj\nstartxref\n9\n%%EOF`,
    );
    const largeStreamMetadata = classifyUpload(
      'application/pdf',
      largeXrefStream.length,
      'a.pdf',
    );
    expect(largeStreamMetadata.ok).toBe(true);
    if (largeStreamMetadata.ok) {
      expect((await validateUploadContent(largeStreamMetadata, largeXrefStream)).ok).toBe(true);
    }

    const borrowedMarker = new TextEncoder().encode(
      '%PDF-1.7\n1 0 obj\n<<>>\nendobj\n' +
      '2 0 obj\n<< /Type /XRef /Length 1 >>\nstream\nx\nendstream\nendobj\n' +
      'startxref\n9\n%%EOF',
    );
    const borrowedMetadata = classifyUpload(
      'application/pdf',
      borrowedMarker.length,
      'a.pdf',
    );
    expect(borrowedMetadata.ok).toBe(true);
    if (borrowedMetadata.ok) {
      expect((await validateUploadContent(borrowedMetadata, borrowedMarker)).ok).toBe(false);
    }

    const typeOutsideDictionary = new TextEncoder().encode(
      '%PDF-1.7\n1 0 obj\n/Type /XRef\n<< /Length 1 >>\nstream\n' +
      'x\nendstream\nendobj\nstartxref\n9\n%%EOF',
    );
    const outsideMetadata = classifyUpload(
      'application/pdf',
      typeOutsideDictionary.length,
      'a.pdf',
    );
    expect(outsideMetadata.ok).toBe(true);
    if (outsideMetadata.ok) {
      expect((await validateUploadContent(outsideMetadata, typeOutsideDictionary)).ok).toBe(false);
    }
  });

  it('enforces per-file, count and aggregate caps', () => {
    expect(classifyUpload('image/jpeg', 0, 'a.jpg').ok).toBe(false);
    expect(classifyUpload('image/jpeg', MAX_UPLOAD_BYTES + 1, 'a.jpg').ok).toBe(false);
    expect(validateUploadBatch(Array.from({ length: MAX_UPLOAD_FILES + 1 }, () => ({ size: 1 })))).toMatch(/no more/i);
    expect(validateUploadBatch([{ size: MAX_UPLOAD_TOTAL_BYTES + 1 }])).toMatch(/too large/i);
    expect(validateUploadBatch([{ size: 1 }, { size: 2 }])).toBeUndefined();
    expect(MAX_UPLOAD_IMAGE_PIXELS).toBe(32_000_000);
    expect(MAX_UPLOAD_DECODED_BYTES).toBe(128_000_000);
    expect(UPLOAD_DECODE_TIMEOUT_SECONDS).toBe(5);
  });

  it('keeps every refusal in plain handler language', () => {
    const reasons = [
      classifyUpload('application/zip', 10, 'a.zip'),
      classifyUpload('image/jpeg', 0, 'a.jpg'),
      classifyUpload('image/jpeg', MAX_UPLOAD_BYTES + 1, 'a.jpg'),
    ].flatMap((result) => result.ok ? [] : [result.reason]);
    for (const reason of reasons) {
      expect(reason).not.toMatch(/\b(blob|mime|content-type|bytes|multipart|500|null|api)\b/i);
    }
  });
});
