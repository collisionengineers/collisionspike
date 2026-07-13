export const MANUAL_INTAKE_ACCEPT =
  '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf';

// The canonical staff-upload endpoint currently validates PDF plus the three
// decoded image formats end to end. Word/email remain supported by automated
// mailbox parsing, but Manual Intake must not promise formats it cannot persist.
type CanonicalManualType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
const EXTENSION_TYPE: Record<string, CanonicalManualType> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
};
const MIME_TYPE: Record<string, CanonicalManualType> = {
  'image/jpeg': 'image/jpeg', 'image/jpg': 'image/jpeg', 'image/png': 'image/png',
  'image/webp': 'image/webp', 'application/pdf': 'application/pdf',
};

export interface ManualIntakeFileLike {
  name: string;
  type: string;
  size?: number;
}

export const MANUAL_INTAKE_MAX_FILES = 20;
export const MANUAL_INTAKE_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MANUAL_INTAKE_MAX_TOTAL_BYTES = 100 * 1024 * 1024;

function metadataType(file: ManualIntakeFileLike): CanonicalManualType | undefined {
  const declared = file.type.toLowerCase().split(';')[0].trim();
  const extension = /\.([a-z0-9]+)$/i.exec(file.name.trim())?.[1]?.toLowerCase() ?? '';
  const declaredType = MIME_TYPE[declared];
  const extensionType = EXTENSION_TYPE[extension];
  if (extension && !extensionType) return undefined;
  if (declared && declared !== 'application/octet-stream' && !declaredType) return undefined;
  if (declaredType && extensionType && declaredType !== extensionType) return undefined;
  return declaredType ?? extensionType;
}

export function isInstructionFile(file: ManualIntakeFileLike): boolean {
  return metadataType(file) === 'application/pdf';
}

export function isImageFile(file: ManualIntakeFileLike): boolean {
  const type = metadataType(file);
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
}

export function manualIntakeFileRejection(file: ManualIntakeFileLike): string | undefined {
  if (file.size === 0) return 'That file looks empty, so it can’t be added.';
  if (file.size !== undefined && file.size > MANUAL_INTAKE_MAX_FILE_BYTES) {
    return 'That file is too big — the limit is 15 MB.';
  }
  const declared = file.type.toLowerCase().split(';')[0].trim();
  const extension = /\.([a-z0-9]+)$/i.exec(file.name.trim())?.[1]?.toLowerCase() ?? '';
  const declaredType = MIME_TYPE[declared];
  const extensionType = EXTENSION_TYPE[extension];
  if (declaredType && extensionType && declaredType !== extensionType) {
    return 'That file name and format do not match.';
  }
  if (isInstructionFile(file) || isImageFile(file)) return undefined;
  const looksLikeImage =
    file.type.toLowerCase().startsWith('image/') ||
    /\.(gif|heic|heif|tiff?|bmp|avif)$/i.test(file.name);
  return looksLikeImage
    ? 'This image can’t be added. Use JPG, PNG or WebP.'
    : 'This file can’t be added. Use PDF, JPG, PNG or WebP.';
}

/** The server hashes bytes; equal browser metadata must never discard a distinct file. */
export function appendManualIntakeFiles<T>(current: readonly T[], incoming: Iterable<T>): T[] {
  return [...current, ...incoming];
}

/** Choose a parse target only before a case is created; recovery requires an
 * explicit staff choice and never promotes the next PDF automatically. */
export function nextManualInstruction<T extends ManualIntakeFileLike>(
  current: T | undefined,
  incoming: readonly T[],
  allowAutomatic: boolean,
): T | undefined {
  return current ?? (allowAutomatic ? incoming.find(isInstructionFile) : undefined);
}

export function manualIntakeBatchRejection(
  files: readonly ManualIntakeFileLike[],
): string | undefined {
  if (files.length > MANUAL_INTAKE_MAX_FILES) {
    return `Choose no more than ${MANUAL_INTAKE_MAX_FILES} files at once.`;
  }
  const total = files.reduce(
    (sum, file) => sum + (Number.isFinite(file.size) ? Number(file.size) : 0),
    0,
  );
  return total > MANUAL_INTAKE_MAX_TOTAL_BYTES
    ? 'Those files are too large to add together.'
    : undefined;
}

export function partitionManualIntakeFiles<T extends ManualIntakeFileLike>(files: readonly T[]): {
  accepted: T[];
  rejected: Array<{ file: T; reason: string }>;
} {
  const accepted: T[] = [];
  const rejected: Array<{ file: T; reason: string }> = [];
  for (const file of files) {
    const reason = manualIntakeFileRejection(file);
    if (reason) rejected.push({ file, reason });
    else accepted.push(file);
  }
  return { accepted, rejected };
}
