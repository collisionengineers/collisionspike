export type FileValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export interface FileValidationPolicy {
  maxFileBytes: number;
  acceptedMimeTypes: readonly string[];
}

export interface UploadFileCandidate {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export function validateUploadRequest(
  request: UploadFileCandidate,
  policy: FileValidationPolicy
): FileValidationResult {
  if (!request.fileName.trim()) {
    return { ok: false, reason: 'Choose a photo before continuing.' };
  }
  if (!Number.isFinite(request.sizeBytes) || request.sizeBytes <= 0) {
    return { ok: false, reason: 'That photo looks empty. Take it again.' };
  }
  if (request.sizeBytes > policy.maxFileBytes) {
    return { ok: false, reason: 'That photo is too large. Take it again at normal camera size.' };
  }
  if (!policy.acceptedMimeTypes.includes(request.contentType.toLowerCase())) {
    return { ok: false, reason: 'Use a photo from the camera.' };
  }
  return { ok: true };
}
