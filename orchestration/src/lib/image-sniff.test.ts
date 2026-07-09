import { describe, expect, it } from 'vitest';
import {
  AREA_FLOOR,
  BANNER_ASPECT_RATIO,
  BANNER_MAX_SHORT_SIDE,
  BYTE_FLOOR_FOR_UNKNOWN,
  assessSignatureImage,
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
 * A GIF signature padded with ZEROED logical-screen dimensions (a malformed header):
 * `sniffGifDimensions` refuses zero dims, so this sniffs to `undefined` — which is
 * exactly what lets the byte-floor fallback in `isLikelySignatureImage` be exercised
 * on both sides of `BYTE_FLOOR_FOR_UNKNOWN`.
 */
function makeGifOfSize(totalBytes: number): Buffer {
  const magic = Buffer.from('GIF89a', 'ascii');
  const buf = Buffer.alloc(Math.max(totalBytes, magic.length));
  magic.copy(buf, 0);
  return buf;
}

/**
 * A minimal but structurally real GIF header: the 6-byte version signature followed by
 * the Logical Screen Descriptor's width/height (little-endian uint16 at bytes 6-9),
 * optionally padded out to a total byte length (to prove dims WIN over the byte floor).
 */
function makeGifHeader(width: number, height: number, opts: { version?: '87a' | '89a'; totalBytes?: number } = {}): Buffer {
  const header = Buffer.alloc(Math.max(opts.totalBytes ?? 13, 13)); // + packed/bg/ratio bytes
  Buffer.from(`GIF${opts.version ?? '89a'}`, 'ascii').copy(header, 0);
  header.writeUInt16LE(width, 6);
  header.writeUInt16LE(height, 8);
  return header;
}

/**
 * A minimal but structurally real BMP header: the 14-byte file header ("BM" + sizes)
 * followed by a BITMAPINFOHEADER (DIB size 40, int32 LE width at 18, int32 LE height
 * at 22 — negative height = top-down DIB) or a BITMAPCOREHEADER (DIB size 12, uint16
 * dims) when `core` is set.
 */
function makeBmpHeader(width: number, height: number, opts: { core?: boolean; dibSize?: number } = {}): Buffer {
  const buf = Buffer.alloc(40);
  buf.write('BM', 0, 'ascii');
  if (opts.core) {
    buf.writeUInt32LE(12, 14); // BITMAPCOREHEADER
    buf.writeUInt16LE(width, 18);
    buf.writeUInt16LE(height, 20);
  } else {
    buf.writeUInt32LE(opts.dibSize ?? 40, 14); // BITMAPINFOHEADER (or an override)
    buf.writeInt32LE(width, 18);
    buf.writeInt32LE(height, 22);
  }
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
    { label: '600x150 GIF89a', bytes: makeGifHeader(600, 150), expected: { width: 600, height: 150 } },
    { label: '320x200 GIF87a', bytes: makeGifHeader(320, 200, { version: '87a' }), expected: { width: 320, height: 200 } },
    { label: '640x480 BMP (BITMAPINFOHEADER)', bytes: makeBmpHeader(640, 480), expected: { width: 640, height: 480 } },
    {
      label: '640x480 top-down BMP (negative height — magnitude is the pixel height)',
      bytes: makeBmpHeader(640, -480),
      expected: { width: 640, height: 480 },
    },
    { label: '300x200 BMP (BITMAPCOREHEADER, uint16 dims)', bytes: makeBmpHeader(300, 200, { core: true }), expected: { width: 300, height: 200 } },
    {
      label: '108-byte DIB (BITMAPV4HEADER) BMP — the >=40 branch covers the extended headers',
      bytes: makeBmpHeader(800, 600, { dibSize: 108 }),
      expected: { width: 800, height: 600 },
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
    { label: 'GIF header with zeroed logical-screen dims (malformed)', bytes: makeGifOfSize(100) },
    { label: 'GIF signature truncated before the dimension fields', bytes: Buffer.from('GIF89a', 'ascii') },
    { label: 'BMP truncated before the INFOHEADER height field', bytes: makeBmpHeader(640, 480).subarray(0, 20) },
    { label: 'BMP with an unrecognised DIB header size', bytes: makeBmpHeader(640, 480, { dibSize: 16 }) },
    { label: 'BMP with a non-positive INFOHEADER width', bytes: makeBmpHeader(-640, 480) },
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

  /* ---- above-floor banner shapes (TKT-047 2026-07-08 live leak / TKT-089) ---- */

  const bannerFlagged: Array<{ label: string; name: string; contentType: string; bytes: Buffer }> = [
    { label: '600x150 PNG wide signature banner (area 90,000 — ABOVE the floor)', name: 'signature.png', contentType: 'image/png', bytes: makePngHeader(600, 150) },
    { label: '600x150 JPEG wide signature banner', name: 'signature.jpg', contentType: 'image/jpeg', bytes: makeJpegHeader(600, 150) },
    { label: '900x180 GIF letterhead banner', name: 'letterhead.gif', contentType: 'image/gif', bytes: makeGifHeader(900, 180) },
    { label: '150x800 BMP tall sidebar strip', name: 'sidebar.bmp', contentType: 'image/bmp', bytes: makeBmpHeader(150, 800) },
    { label: '840x240 PNG — both banner boundaries inclusive (aspect exactly 3.5, short side exactly 240)', name: 'strip.png', contentType: 'image/png', bytes: makePngHeader(840, 240) },
  ];
  for (const { label, name, contentType, bytes } of bannerFlagged) {
    it(`flags ${label} via the banner-shape rung`, () => {
      expect(assessSignatureImage(name, contentType, bytes)).toMatchObject({ flagged: true, reason: 'banner-shape' });
    });
  }

  const photoShapesKept: Array<{ label: string; bytes: Buffer }> = [
    { label: '4032x3024 JPEG (12MP phone photo)', bytes: makeJpegHeader(4032, 3024) },
    { label: '1920x1080 PNG (16:9)', bytes: makePngHeader(1920, 1080) },
    { label: '3000x1000 JPEG (3:1 pano crop — aspect below the 3.5 threshold)', bytes: makeJpegHeader(3000, 1000) },
    { label: '845x241 PNG (extreme aspect but short side just over the 240px cap)', bytes: makePngHeader(845, 241) },
    { label: '4000x1000 JPEG (4:1 but short side 1000 — a real panorama)', bytes: makeJpegHeader(4000, 1000) },
  ];
  for (const { label, bytes } of photoShapesKept) {
    it(`recall guard: keeps ${label}`, () => {
      expect(isLikelySignatureImage('photo.jpg', 'image/jpeg', bytes)).toBe(false);
    });
  }

  it('exports the banner thresholds mirrored from the engine (3.5:1, 240px)', () => {
    expect(BANNER_ASPECT_RATIO).toBe(3.5);
    expect(BANNER_MAX_SHORT_SIDE).toBe(240);
  });

  /* ---- GIF/BMP now get a real dimension verdict instead of byte-floor-only ---- */

  it('flags a small-dims GIF via the area floor even when its byte size is large', () => {
    // Before the GIF sniff, a padded signature GIF above 8KB escaped entirely.
    const bytes = makeGifHeader(200, 100, { totalBytes: BYTE_FLOOR_FOR_UNKNOWN * 4 });
    expect(200 * 100).toBeLessThan(AREA_FLOOR);
    expect(assessSignatureImage('sig.gif', 'image/gif', bytes)).toMatchObject({ flagged: true, reason: 'area-floor' });
  });

  it('keeps a photo-dims GIF even when its byte size is tiny — sniffed dims win over the byte floor', () => {
    const bytes = makeGifHeader(1600, 1200); // 13 bytes total, far under the byte floor
    expect(bytes.length).toBeLessThan(BYTE_FLOOR_FOR_UNKNOWN);
    expect(isLikelySignatureImage('photo.gif', 'image/gif', bytes)).toBe(false);
  });

  /* ---- assessSignatureImage verdict envelope (feeds the graph.ts skip trace) ---- */

  it('reports area-floor with dims for a sub-floor image', () => {
    expect(assessSignatureImage('logo.png', 'image/png', makePngHeader(100, 100))).toEqual({
      flagged: true,
      reason: 'area-floor',
      dims: { width: 100, height: 100 },
    });
  });

  it('reports byte-floor (no dims) for a tiny unsniffable image', () => {
    expect(assessSignatureImage('sig.gif', 'image/gif', makeGifOfSize(512))).toEqual({
      flagged: true,
      reason: 'byte-floor',
    });
  });

  it('reports unflagged WITH dims for a kept photo (dims stay available to callers)', () => {
    expect(assessSignatureImage('photo.jpg', 'image/jpeg', makeJpegHeader(2000, 1500))).toEqual({
      flagged: false,
      dims: { width: 2000, height: 1500 },
    });
  });

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
