/**
 * Server-owned validation for every staff evidence upload.
 *
 * The browser picker mirrors this list, but the server is authoritative: count,
 * aggregate size, per-file size, declared type and the file signature all have to
 * agree before a byte can be stored. SVG and broad `image/*` acceptance are
 * deliberately excluded because active/vector content is not a vehicle photo.
 */

import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB per file
export const MAX_UPLOAD_FILES = 20;
export const MAX_UPLOAD_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB per request
/** One-at-a-time full decode allows current 24 MP phones while bounding RGBA at 128 MB. */
export const MAX_UPLOAD_IMAGE_PIXELS = 32_000_000;
export const MAX_UPLOAD_DECODED_BYTES = MAX_UPLOAD_IMAGE_PIXELS * 4;
export const UPLOAD_DECODE_TIMEOUT_SECONDS = 5;

export type UploadKind = 'image' | 'document';
export type CanonicalUploadType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'application/pdf';

export type UploadCheck =
  | { ok: true; kind: UploadKind; contentType: CanonicalUploadType }
  | { ok: false; reason: string };

const EXTENSION_TYPE: Record<string, CanonicalUploadType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

const MIME_TYPE: Record<string, CanonicalUploadType> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'application/pdf': 'application/pdf',
};

function extensionOf(filename: string): string {
  return /\.([a-z0-9]+)$/i.exec(filename.trim())?.[1]?.toLowerCase() ?? '';
}

/** Fast metadata gate; `validateUploadContent` remains the byte-level authority. */
export function classifyUpload(contentType: string, size: number, filename = ''): UploadCheck {
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, reason: 'That file looks empty, so I did not add it.' };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'That file is too big — the limit is 15 MB.' };
  }
  const declared = (contentType || '').toLowerCase().split(';')[0].trim();
  const extension = extensionOf(filename);
  const declaredType = MIME_TYPE[declared];
  const extensionType = EXTENSION_TYPE[extension];
  if (extension && !extensionType) {
    return { ok: false, reason: 'You can add JPG, PNG or WebP photos, and PDFs.' };
  }
  if (declared && declared !== 'application/octet-stream' && !declaredType) {
    return { ok: false, reason: 'You can add JPG, PNG or WebP photos, and PDFs.' };
  }
  if (declaredType && extensionType && declaredType !== extensionType) {
    return { ok: false, reason: 'That file name and format do not match.' };
  }
  const canonical = declaredType ?? extensionType;
  if (!canonical) {
    return { ok: false, reason: 'You can add JPG, PNG or WebP photos, and PDFs.' };
  }
  return {
    ok: true,
    kind: canonical === 'application/pdf' ? 'document' : 'image',
    contentType: canonical,
  };
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function uint32Be(bytes: Uint8Array, start: number): number {
  return (((bytes[start] ?? 0) * 0x1000000) + ((bytes[start + 1] ?? 0) << 16)
    + ((bytes[start + 2] ?? 0) << 8) + (bytes[start + 3] ?? 0)) >>> 0;
}

function uint32Le(bytes: Uint8Array, start: number): number {
  return ((bytes[start] ?? 0) + ((bytes[start + 1] ?? 0) << 8)
    + ((bytes[start + 2] ?? 0) << 16) + ((bytes[start + 3] ?? 0) * 0x1000000)) >>> 0;
}

function containsAscii(bytes: Uint8Array, needle: string, start = 0): boolean {
  const target = [...needle].map((character) => character.charCodeAt(0));
  for (let offset = Math.max(0, start); offset <= bytes.length - target.length; offset++) {
    if (target.every((value, index) => bytes[offset + index] === value)) return true;
  }
  return false;
}

function completeJpeg(bytes: Uint8Array): boolean {
  if (
    bytes.length < 24
    || !startsWith(bytes, [0xff, 0xd8])
    || bytes[bytes.length - 2] !== 0xff
    || bytes[bytes.length - 1] !== 0xd9
  ) return false;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  let frameComponents = 0;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker == null || marker === 0x00 || marker === 0xd9) return false;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length - 2) return false;
    const segmentLength = ((bytes[offset] ?? 0) << 8) + (bytes[offset + 1] ?? 0);
    if (segmentLength < 2 || offset + segmentLength > bytes.length - 2) return false;
    if (sofMarkers.has(marker)) {
      const components = bytes[offset + 7] ?? 0;
      if (components < 1 || components > 4 || segmentLength !== 8 + (3 * components)) return false;
      const height = ((bytes[offset + 3] ?? 0) << 8) + (bytes[offset + 4] ?? 0);
      const width = ((bytes[offset + 5] ?? 0) << 8) + (bytes[offset + 6] ?? 0);
      if (width === 0 || height === 0) return false;
      frameComponents = components;
    }
    if (marker === 0xda) {
      const scanComponents = bytes[offset + 2] ?? 0;
      const scanStart = offset + segmentLength;
      return frameComponents > 0
        && scanComponents > 0
        && scanComponents <= frameComponents
        && segmentLength === 6 + (2 * scanComponents)
        && scanStart < bytes.length - 2;
    }
    offset += segmentLength;
  }
  return false;
}

function completePng(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return false;
  let offset = 8;
  let first = true;
  let imageDataBytes = 0;
  const zlibHeader: number[] = [];
  while (offset + 12 <= bytes.length) {
    const length = uint32Be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const next = offset + 12 + length;
    if (next > bytes.length) return false;
    if (first) {
      if (
        type !== 'IHDR'
        || length !== 13
        || uint32Be(bytes, offset + 8) === 0
        || uint32Be(bytes, offset + 12) === 0
      ) return false;
      first = false;
    }
    if (type === 'IDAT' && length > 0) {
      imageDataBytes += length;
      for (let index = 0; index < length && zlibHeader.length < 2; index++) {
        zlibHeader.push(bytes[offset + 8 + index] ?? 0);
      }
    }
    if (type === 'IEND') {
      const [cmf = 0, flg = 0] = zlibHeader;
      const validZlibHeader = (cmf & 0x0f) === 8
        && (cmf >> 4) <= 7
        && (((cmf << 8) + flg) % 31 === 0);
      return length === 0
        && imageDataBytes >= 6
        && validZlibHeader
        && next === bytes.length;
    }
    offset = next;
  }
  return false;
}

function completeWebp(bytes: Uint8Array): boolean {
  if (
    bytes.length < 20
    || ascii(bytes, 0, 4) !== 'RIFF'
    || ascii(bytes, 8, 4) !== 'WEBP'
    || uint32Le(bytes, 4) + 8 !== bytes.length
  ) return false;
  let offset = 12;
  let sawImagePayload = false;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = uint32Le(bytes, offset + 4);
    const dataStart = offset + 8;
    const next = dataStart + size + (size % 2);
    if (next > bytes.length) return false;
    if (type === 'VP8 ' && size > 10) {
      const width = ((bytes[dataStart + 6] ?? 0) + ((bytes[dataStart + 7] ?? 0) << 8)) & 0x3fff;
      const height = ((bytes[dataStart + 8] ?? 0) + ((bytes[dataStart + 9] ?? 0) << 8)) & 0x3fff;
      sawImagePayload = width > 0
        && height > 0
        && bytes[dataStart + 3] === 0x9d
        && bytes[dataStart + 4] === 0x01
        && bytes[dataStart + 5] === 0x2a;
    } else if (type === 'VP8L' && size > 5) {
      sawImagePayload = bytes[dataStart] === 0x2f && ((bytes[dataStart + 4] ?? 0) & 0xe0) === 0;
    } else if (type === 'VP8X' && size !== 10) {
      return false;
    }
    offset = next;
  }
  return offset === bytes.length && sawImagePayload;
}

function completePdf(bytes: Uint8Array): boolean {
  if (bytes.length < 64 || !/^%PDF-(?:1\.[0-7]|2\.0)$/u.test(ascii(bytes, 0, 8))) return false;
  const tail = ascii(bytes, Math.max(0, bytes.length - 2048), Math.min(2048, bytes.length));
  const startXref = /startxref\s+(\d+)\s+%%EOF\s*$/u.exec(tail);
  const xrefOffset = startXref ? Number(startXref[1]) : Number.NaN;
  if (!Number.isSafeInteger(xrefOffset) || xrefOffset < 0 || xrefOffset >= bytes.length) return false;
  const xrefWindow = ascii(bytes, xrefOffset, Math.min(2048, bytes.length - xrefOffset));
  const objectHeader = /^\d+\s+\d+\s+obj\b/u.exec(xrefWindow);
  const streamMarker = /\bstream(?:\r\n|\r|\n)/u.exec(xrefWindow);
  const firstEndObject = xrefWindow.indexOf('endobj');
  const pointedDictionary = objectHeader && streamMarker
    ? xrefWindow.slice(objectHeader[0].length, streamMarker.index).trim()
    : '';
  const pointsToCrossReference = /^xref(?:\s|$)/u.test(xrefWindow)
    || (
      objectHeader != null
      && streamMarker != null
      && (firstEndObject < 0 || firstEndObject > streamMarker.index)
      && pointedDictionary.startsWith('<<')
      && pointedDictionary.endsWith('>>')
      && /\/Type\s*\/XRef\b/u.test(pointedDictionary)
    );
  return containsAscii(bytes, ' obj')
    && containsAscii(bytes, 'endobj')
    && pointsToCrossReference;
}

function detectedType(bytes: Uint8Array): CanonicalUploadType | undefined {
  // Reject header-only/truncated payloads. These are inexpensive structural
  // checks, not a decoder, but they prove each file has its required container
  // boundaries rather than merely a spoofed first few bytes.
  if (completeJpeg(bytes)) return 'image/jpeg';
  if (completePng(bytes)) return 'image/png';
  if (completeWebp(bytes)) return 'image/webp';
  if (completePdf(bytes)) return 'application/pdf';
  return undefined;
}

async function fullyDecodeImage(bytes: Uint8Array): Promise<boolean> {
  try {
    // metadata() does not decode compressed pixels. Raw buffer output forces libvips
    // to consume every frame completely while these bounds cap untrusted work.
    const { data, info } = await sharp(bytes, {
      animated: true,
      pages: -1,
      failOn: 'warning',
      limitInputPixels: MAX_UPLOAD_IMAGE_PIXELS,
      limitInputChannels: 4,
      sequentialRead: true,
      unlimited: false,
    })
      .timeout({ seconds: UPLOAD_DECODE_TIMEOUT_SECONDS })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const decodedBytes = info.width * info.height * info.channels;
    return info.width > 0
      && info.height > 0
      && info.channels > 0
      && decodedBytes <= MAX_UPLOAD_DECODED_BYTES
      && data.length === decodedBytes;
  } catch {
    return false;
  }
}

/** Refuse renamed, structurally corrupt or undecodable content before Blob storage. */
export async function validateUploadContent(
  expected: UploadCheck & { ok: true },
  bytes: Uint8Array,
): Promise<UploadCheck> {
  const detected = detectedType(bytes);
  if (!detected || detected !== expected.contentType) {
    return { ok: false, reason: 'That file does not match a supported photo or PDF format.' };
  }
  if (expected.kind === 'image' && !(await fullyDecodeImage(bytes))) {
    return { ok: false, reason: 'That photo is damaged or cannot be read safely.' };
  }
  return {
    ok: true,
    kind: detected === 'application/pdf' ? 'document' : 'image',
    contentType: detected,
  };
}

export function validateUploadBatch(files: readonly { size: number }[]): string | undefined {
  if (files.length > MAX_UPLOAD_FILES) return `Choose no more than ${MAX_UPLOAD_FILES} files at once.`;
  const total = files.reduce((sum, file) => sum + (Number.isFinite(file.size) ? file.size : 0), 0);
  if (total > MAX_UPLOAD_TOTAL_BYTES) return 'Those files are too large to add together.';
  return undefined;
}
