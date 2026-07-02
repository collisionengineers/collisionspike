/**
 * orchestration/src/lib/image-sniff.ts
 *
 * Minimal, dependency-free PNG/JPEG dimension sniff + a "looks like a decorative
 * signature/logo image" predicate for non-inline Graph attachments (TKT-047,
 * rules-engine-v2 Phase 2 "Signature filter"). Senders' email clients often attach a
 * signature/logo image as an ordinary (non-inline) file attachment — `graph.ts`'s
 * existing `isInline` skip only catches the clients that flag it correctly, so this
 * module gives a second, content-based filter for what slips through.
 *
 * Mirrors the vendored cedocumentmapper engine's decorative-raster filter
 * (`_MIN_EXTRACTED_IMAGE_AREA` / `is_decorative` in
 * functions/parser/cedocumentmapper_v2/application/service.py): a pixel-**area** floor
 * below which a raster is letterhead art, not a vehicle photo — and dimensions that
 * cannot be determined are never blind-flagged on that basis alone. Graph gives us
 * bytes only (no decoded dimensions, no image-processing dependency), so
 * `sniffImageDimensions` reads just enough of the PNG/JPEG header to recover
 * width*height without decoding the image.
 *
 * Pure + dependency-free by design (no `sharp`/`image-size` package) — mirrors this
 * file's neighbour `graph.ts`, which keeps the orchestration app's dependency surface
 * to @azure/functions + durable-functions + @azure/storage-blob.
 */

/**
 * Same floor as the engine's `_MIN_EXTRACTED_IMAGE_AREA` (200 * 200 px = 40,000 —
 * functions/parser/cedocumentmapper_v2/application/service.py:41, cited there as "a
 * floor well below any real photo but above typical letterhead art"). Area (not a
 * per-axis check) survives a wide-but-short banner logo while still rejecting it.
 */
export const AREA_FLOOR = 200 * 200;

/**
 * Conservative byte-size fallback for images whose pixel dimensions could not be
 * sniffed (GIF/BMP — formats this module never decodes — or a malformed/truncated
 * PNG/JPEG header). A real damage/vehicle photo from a phone camera is never this
 * small; a signature/logo GIF or BMP routinely is. Deliberately small (8 KB) so the
 * fallback only ever catches obviously decorative art: per the engine's
 * "unknown-dimensions-kept" rule, an attachment we cannot measure should stay evidence
 * unless it is ALSO tiny in byte size.
 */
export const BYTE_FLOOR_FOR_UNKNOWN = 8 * 1024;

/** Extensions this module treats as raster images when `contentType` is absent/generic. */
const IMAGE_EXTENSION_RE = /\.(png|jpe?g|gif|bmp)$/i;

/** The 8-byte PNG signature (spec-fixed): 0x89 'P' 'N' 'G' \r \n 0x1A \n. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface SignatureImageSniffOptions {
  /** Override the pixel-area floor (defaults to `AREA_FLOOR`). Mainly for tests. */
  areaFloor?: number;
  /** Override the byte-size fallback floor (defaults to `BYTE_FLOOR_FOR_UNKNOWN`). Mainly for tests. */
  byteFloorForUnknown?: number;
}

/**
 * Sniff pixel `{width, height}` from a PNG or JPEG header without decoding the image.
 * Returns `undefined` for any other format, or for malformed/truncated input — callers
 * must treat that as "unknown", never as "zero-sized" (see `isLikelySignatureImage`'s
 * unknown-dimensions handling below).
 */
export function sniffImageDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (!bytes || bytes.length === 0) return undefined;
  if (isPng(bytes)) return sniffPngDimensions(bytes);
  if (isJpeg(bytes)) return sniffJpegDimensions(bytes);
  return undefined;
}

function isPng(bytes: Buffer): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * PNG: the IHDR chunk is always the FIRST chunk, at a fixed offset (the spec
 * guarantees this — the signature is followed immediately by IHDR, never another
 * chunk type). Layout after the 8-byte signature: a 4-byte chunk length, a 4-byte
 * chunk type ("IHDR"), then the chunk data itself — 4-byte width, 4-byte height (both
 * big-endian uint32), then bit depth/color type/compression/filter/interlace + a CRC
 * (unused here). So width lives at absolute buffer offset 16-19 and height at 20-23:
 *   [0..7]   PNG signature
 *   [8..11]  chunk length (== 13 for IHDR)
 *   [12..15] chunk type ("IHDR")
 *   [16..19] width  (uint32 BE)
 *   [20..23] height (uint32 BE)
 * 24 bytes is therefore the minimum length from which dimensions can be read.
 */
function sniffPngDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 24) return undefined; // truncated before the height field
  const chunkType = bytes.toString('ascii', 12, 16);
  if (chunkType !== 'IHDR') return undefined; // spec violation — bail rather than guess
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) return undefined; // a real PNG never has a zero dimension
  return { width, height };
}

function isJpeg(bytes: Buffer): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8; // SOI marker
}

/** SOF0 (baseline DCT), SOF1 (extended sequential), SOF2 (progressive) — the three
 *  marker codes that carry frame dimensions, per TKT-047's "walk SOF0/1/2 markers".
 *  Other SOFn variants (arithmetic-coding, lossless, hierarchical) are not expected in
 *  practice for email attachments; hitting one of those (or anything else unmatched
 *  before a SOF0/1/2) bails to `undefined` — unknown, never guessed. */
const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2]);
/** Markers with NO length-prefixed payload to skip over: SOI/EOI + the 8 restart markers. */
const JPEG_NO_PAYLOAD_MARKERS = new Set([0xd8, 0xd9, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);

/**
 * JPEG: walk the marker segments starting at byte 2 (past the 2-byte SOI marker)
 * looking for a SOF0/1/2 marker. Every marker is `0xFF <code>`, optionally preceded by
 * extra `0xFF` fill bytes; markers that carry a payload are followed by a 2-byte
 * big-endian segment length (INCLUDING those 2 length bytes), which is how a
 * non-SOF segment is skipped to reach the next marker. A SOF segment's payload is
 * `length(2) precision(1) height(2) width(2) …` (big-endian) — note JPEG stores
 * HEIGHT before WIDTH, the opposite order from PNG's IHDR. Any structural surprise
 * (missing FF prefix, truncated segment, walking off the end without a SOF) bails to
 * `undefined` rather than guessing.
 */
function sniffJpegDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  const len = bytes.length;
  let pos = 2; // past the SOI marker (FF D8), already confirmed by isJpeg()
  while (pos < len) {
    if (bytes[pos] !== 0xff) return undefined; // expected a marker prefix here — malformed
    pos++;
    while (pos < len && bytes[pos] === 0xff) pos++; // skip 0xFF fill bytes before the marker code
    if (pos >= len) return undefined; // truncated mid-marker
    const marker = bytes[pos];
    pos++;
    if (JPEG_NO_PAYLOAD_MARKERS.has(marker)) continue;
    if (pos + 2 > len) return undefined; // truncated before the segment-length field
    const segmentLength = bytes.readUInt16BE(pos);
    if (segmentLength < 2) return undefined; // spec: length includes itself — 2 is the floor
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (pos + 7 > len) return undefined; // truncated before height/width
      const height = bytes.readUInt16BE(pos + 3);
      const width = bytes.readUInt16BE(pos + 5);
      if (!width || !height) return undefined;
      return { width, height };
    }
    pos += segmentLength; // not a SOF marker — skip its payload and keep walking
  }
  return undefined; // walked off the end without finding a SOF0/1/2 marker
}

function isImageAttachment(filename: string, contentType: string | undefined): boolean {
  if (contentType && contentType.toLowerCase().startsWith('image/')) return true;
  return IMAGE_EXTENSION_RE.test(filename ?? '');
}

/**
 * True when a Graph attachment looks like a decorative signature/logo image rather
 * than case evidence — the raster floor TKT-047 asks for. Non-image attachments (by
 * both content-type and extension) are ALWAYS `false`: this predicate only ever acts
 * on images.
 *
 * Decision table for an image attachment:
 *   - dimensions sniffed AND pixel area < `areaFloor`         → true (flag/drop)
 *   - dimensions unknown AND `bytes.length` < `byteFloorForUnknown` → true (flag/drop)
 *   - anything else (including "dimensions unknown but large enough") → false (keep)
 *
 * The second rung is Graph-specific: the vendored engine's `is_decorative` keeps
 * everything it cannot measure unconditionally (it only ever sees embedded document
 * rasters, never a bare signature file), but Graph hands us bytes with no decode step
 * at all — GIF/BMP are never dimension-sniffed here, and a malformed/truncated
 * PNG/JPEG header also comes back as "unknown". Falling all the way through to
 * "always keep" would let an obviously tiny GIF signature through untouched, so the
 * byte-size floor stands in as a conservative proxy — but it stays small enough that
 * a real (if unusually small) photo is never at risk.
 */
export function isLikelySignatureImage(
  filename: string,
  contentType: string | undefined,
  bytes: Buffer,
  opts: SignatureImageSniffOptions = {},
): boolean {
  if (!isImageAttachment(filename, contentType)) return false;

  const areaFloor = opts.areaFloor ?? AREA_FLOOR;
  const byteFloor = opts.byteFloorForUnknown ?? BYTE_FLOOR_FOR_UNKNOWN;

  const dims = sniffImageDimensions(bytes);
  if (dims) {
    return dims.width * dims.height < areaFloor;
  }
  return bytes.length < byteFloor;
}
