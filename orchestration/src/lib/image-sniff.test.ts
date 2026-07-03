import { describe, expect, it } from 'vitest';
import {
  AREA_FLOOR,
  BYTE_FLOOR_FOR_UNKNOWN,
  isLikelySignatureImage,
  sniffImageDimensions,
} from './image-sniff.js';

/* ---------- minimal real-format header builders (table-driven cases below build on these) ---------- */

const PNG_SIGNATURE_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * A minimal but structurally real PNG header: the 8-byte signature + an IHDR chunk
 * carrying width/height. `sniffPngDimensions` never reads past byte 23 (the end of
 * the height field), so the rest of a real IHDR (bit depth/color type/compression/
 * filter/interlace + a CRC) is intentionally omitted — this is a valid PNG *header*,
 * not a byte-valid decodable PNG.
 */
function makePngHeader(width: number, height: number): Buffer {
  const prefix = Buffer.from([
    ...PNG_SIGNATURE_BYTES,
    0x00, 0x00, 0x00, 0x0d, // IHDR chunk length = 13 (spec-fixed)
    0x49, 0x48, 0x44, 0x52, // "IHDR"
  ]);
  const dims = Buffer.alloc(8);
  dims.writeUInt32BE(width, 0);
  dims.writeUInt32BE(height, 4);
  return Buffer.concat([prefix, dims]);
}

/**
 * A minimal but structurally real JPEG header: SOI + a SOF0 segment carrying
 * height/width (JPEG stores height BEFORE width) + a plausible 3-component (YCbCr)
 * tail so the segment length itself is realistic — even though the sniff returns as
 * soon as it reads height/width and never looks at the component bytes.
 */
function makeJpegHeader(width: number, height: number): Buffer {
  return Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0 (baseline DCT)
    0x00, 0x11, // segment length = 17 (2 length + 1 precision + 2 height + 2 width + 1 numComponents + 3*3 component bytes)
    0x08, // precision (8-bit)
    (height >> 8) & 0xff, height & 0xff, // height, big-endian uint16
    (width >> 8) & 0xff, width & 0xff, // width, big-endian uint16
    0x03, // 3 components (YCbCr)
    0x01, 0x22, 0x00, // component 1 (Y):  id, sampling factors, quant-table id
    0x02, 0x11, 0x01, // component 2 (Cb)
    0x03, 0x11, 0x01, // component 3 (Cr)
  ]);
}

/**
 * A GIF is never dimension-sniffed (this module only decodes PNG/JPEG headers) — pad
 * the real `GIF89a` magic out to an arbitrary total length so the byte-floor fallback
 * in `isLikelySignatureImage` can be exercised on both sides of `BYTE_FLOOR_FOR_UNKNOWN`.
 */
function makeGifOfSize(totalBytes: number): Buffer {
  const magic = Buffer.from('GIF89a', 'ascii');
  const buf = Buffer.alloc(Math.max(totalBytes, magic.length));
  magic.copy(buf, 0);
  return buf;
}

/* ---------- sniffImageDimensions ---------- */

describe('sniffImageDimensions', () => {
  const found: Array<{ label: string; bytes: Buffer; expected: { width: number; height: number } }> = [
    { label: '100x100 PNG', bytes: makePngHeader(100, 100), expected: { width: 100, height: 100 } },
    { label: '2000x1500 JPEG', bytes: makeJpegHeader(2000, 1500), expected: { width: 2000, height: 1500 } },
    {
      label: '1x1 PNG (smallest legal dimension — distinguishes "sniffed but tiny" from "unsniffable")',
      bytes: makePngHeader(1, 1),
      expected: { width: 1, height: 1 },
    },
  ];
  for (const { label, bytes, expected } of found) {
    it(`${label} → sniffed correctly`, () => {
      expect(sniffImageDimensions(bytes)).toEqual(expected);
    });
  }

  const malformed: Array<{ label: string; bytes: Buffer }> = [
    { label: 'empty buffer', bytes: Buffer.alloc(0) },
    {
      label: 'random junk (no PNG/JPEG magic bytes)',
      bytes: Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]),
    },
    { label: 'GIF magic (unsupported format — never sniffed)', bytes: makeGifOfSize(100) },
    { label: 'PNG signature only, truncated before IHDR', bytes: Buffer.from(PNG_SIGNATURE_BYTES) },
    {
      label: 'PNG signature + non-IHDR first chunk (spec violation)',
      bytes: Buffer.concat([
        Buffer.from(PNG_SIGNATURE_BYTES),
        Buffer.from([0x00, 0x00, 0x00, 0x00, 0x62, 0x41, 0x44, 0x21, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      ]),
    },
    { label: 'JPEG SOI with no SOF before EOF', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
    {
      label: 'JPEG SOF marker segment truncated (no precision/height/width)',
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]),
    },
  ];
  for (const { label, bytes } of malformed) {
    it(`${label} → undefined (unknown, never guessed)`, () => {
      expect(sniffImageDimensions(bytes)).toBeUndefined();
    });
  }
});

/* ---------- isLikelySignatureImage ---------- */

describe('isLikelySignatureImage', () => {
  it('flags a 100x100 PNG (area 10,000, below the 40,000 = 200x200 area floor) as a likely signature/logo', () => {
    expect(100 * 100).toBeLessThan(AREA_FLOOR);
    expect(isLikelySignatureImage('logo.png', 'image/png', makePngHeader(100, 100))).toBe(true);
  });

  it('keeps a 2000x1500 JPEG (area 3,000,000, far above the floor) — a real damage photo', () => {
    expect(2000 * 1500).toBeGreaterThan(AREA_FLOOR);
    expect(isLikelySignatureImage('damage-overview.jpg', 'image/jpeg', makeJpegHeader(2000, 1500))).toBe(false);
  });

  it('detects an image by file extension when contentType is absent', () => {
    expect(isLikelySignatureImage('sig.PNG', undefined, makePngHeader(50, 50))).toBe(true);
  });

  it('detects an image by contentType when the filename carries no recognised extension', () => {
    expect(isLikelySignatureImage('image1', 'image/png', makePngHeader(50, 50))).toBe(true);
  });

  const gifByteFloor: Array<{ label: string; size: number; expected: boolean }> = [
    { label: 'well under the byte floor', size: 512, expected: true },
    { label: 'just under the byte floor', size: BYTE_FLOOR_FOR_UNKNOWN - 1, expected: true },
    { label: 'exactly at the byte floor (boundary is exclusive — kept)', size: BYTE_FLOOR_FOR_UNKNOWN, expected: false },
    { label: 'over the byte floor', size: BYTE_FLOOR_FOR_UNKNOWN + 5_000, expected: false },
  ];
  for (const { label, size, expected } of gifByteFloor) {
    it(`GIF (dimensions unsniffable) ${label} → flagged=${expected}`, () => {
      expect(isLikelySignatureImage('sig.gif', 'image/gif', makeGifOfSize(size))).toBe(expected);
    });
  }

  it('keeps a large malformed/truncated PNG-ish buffer — unknown dimensions, but too big to be decorative', () => {
    // Starts with the PNG signature but never reaches a valid IHDR: dimensions sniff to
    // undefined, and at well over the byte floor it must be KEPT, not blind-flagged — this is
    // exactly the over-triggering the byte-size fallback exists to avoid.
    const bytes = Buffer.concat([Buffer.from(PNG_SIGNATURE_BYTES), Buffer.alloc(BYTE_FLOOR_FOR_UNKNOWN, 0xab)]);
    expect(sniffImageDimensions(bytes)).toBeUndefined();
    expect(isLikelySignatureImage('scan.png', 'image/png', bytes)).toBe(false);
  });

  const nonImage: Array<{ name: string; contentType: string }> = [
    { name: 'instruction.pdf', contentType: 'application/pdf' },
    { name: 'report.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    { name: 'forwarded-message.eml', contentType: 'message/rfc822' },
  ];
  for (const { name, contentType } of nonImage) {
    it(`non-image attachment ${name} (${contentType}) is never flagged, regardless of size`, () => {
      const tiny = Buffer.alloc(10, 0xff); // smaller than the byte floor — would flag if treated as an image
      expect(isLikelySignatureImage(name, contentType, tiny)).toBe(false);
    });
  }
});
