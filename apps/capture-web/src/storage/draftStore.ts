export type DraftUploadState = 'queued' | 'uploading' | 'uploaded';

export interface DraftPhotoInput {
  sessionId: string;
  shotId: string;
  blob: Blob;
  fileName: string;
  replacesSelected?: boolean;
  capturedAt?: string;
}

export interface DraftPhoto {
  sessionId: string;
  shotId: string;
  blob: Blob;
  fileName: string;
  replacesSelected: boolean;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  idempotencyKey: string;
  status: DraftUploadState;
  uploadId?: string;
  capturedAt: string;
  updatedAt: string;
}

export interface DraftStore {
  save(input: DraftPhotoInput): Promise<DraftPhoto>;
  get(sessionId: string, shotId: string): Promise<DraftPhoto | undefined>;
  list(sessionId: string): Promise<DraftPhoto[]>;
  setUploadState(
    sessionId: string,
    shotId: string,
    status: DraftUploadState,
    uploadId?: string
  ): Promise<DraftPhoto | undefined>;
  clearShot(sessionId: string, shotId: string): Promise<void>;
  clearSession(sessionId: string): Promise<void>;
}

export interface DraftStoreDependencies {
  crypto?: Crypto;
  now?: () => Date;
}

export function assertDraftKey(sessionId: string, shotId: string): void {
  if (sessionId.trim().length === 0) throw new Error('sessionId is required.');
  if (shotId.trim().length === 0) throw new Error('shotId is required.');
}

export async function createDraftPhoto(
  input: DraftPhotoInput,
  dependencies: DraftStoreDependencies = {}
): Promise<DraftPhoto> {
  assertDraftKey(input.sessionId, input.shotId);
  if (input.fileName.trim().length === 0) throw new Error('fileName is required.');

  const cryptoProvider = dependencies.crypto ?? globalThis.crypto;
  if (!cryptoProvider?.subtle || typeof cryptoProvider.randomUUID !== 'function') {
    throw new Error('Secure browser cryptography is required to persist a photo draft.');
  }

  const now = (dependencies.now ?? (() => new Date()))().toISOString();
  const capturedAt = input.capturedAt ?? now;
  const bytes = await readBlob(input.blob);
  const hash = await cryptoProvider.subtle.digest('SHA-256', bytes);

  // Explicit field selection prevents capture tokens or other over-wide caller data
  // from crossing the local persistence boundary.
  return {
    sessionId: input.sessionId,
    shotId: input.shotId,
    blob: input.blob,
    fileName: input.fileName,
    replacesSelected: input.replacesSelected ?? false,
    contentType: input.blob.type || 'application/octet-stream',
    sizeBytes: input.blob.size,
    sha256: toHex(hash),
    idempotencyKey: cryptoProvider.randomUUID(),
    status: 'queued',
    capturedAt,
    updatedAt: now
  };
}

export function cloneDraft(draft: DraftPhoto): DraftPhoto {
  return {
    sessionId: draft.sessionId,
    shotId: draft.shotId,
    blob: draft.blob,
    fileName: draft.fileName,
    replacesSelected: draft.replacesSelected,
    contentType: draft.contentType,
    sizeBytes: draft.sizeBytes,
    sha256: draft.sha256,
    idempotencyKey: draft.idempotencyKey,
    status: draft.status,
    ...(draft.uploadId === undefined ? {} : { uploadId: draft.uploadId }),
    capturedAt: draft.capturedAt,
    updatedAt: draft.updatedAt
  };
}

export function rehydrateDraft(draft: DraftPhoto): DraftPhoto {
  const copy = cloneDraft(draft);
  return copy.status === 'uploading' ? { ...copy, status: 'queued' } : copy;
}

async function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('The photo draft could not be read.'));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('The photo draft could not be read.'));
    };
    reader.readAsArrayBuffer(blob);
  });
}

function toHex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
