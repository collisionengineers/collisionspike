export const MANUAL_INTAKE_ACCEPT =
  '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf';

// The canonical staff-upload endpoint currently validates PDF plus the three
// decoded image formats end to end. Word/email remain supported by automated
// mailbox parsing, but Manual Intake must not promise formats it cannot persist.
const INSTRUCTION_EXTENSIONS = ['.pdf'];
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export interface ManualIntakeFileLike {
  name: string;
  type: string;
  size?: number;
}

export const MANUAL_INTAKE_MAX_FILES = 20;
export const MANUAL_INTAKE_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MANUAL_INTAKE_MAX_TOTAL_BYTES = 100 * 1024 * 1024;

export function isInstructionFile(file: ManualIntakeFileLike): boolean {
  const name = file.name.toLowerCase();
  return INSTRUCTION_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export function isImageFile(file: ManualIntakeFileLike): boolean {
  const type = file.type.toLowerCase().split(';')[0].trim();
  if (type.startsWith('image/')) return SUPPORTED_IMAGE_TYPES.includes(type);
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

export function manualIntakeFileRejection(file: ManualIntakeFileLike): string | undefined {
  if (file.size === 0) return 'That file looks empty, so it can’t be added.';
  if (file.size !== undefined && file.size > MANUAL_INTAKE_MAX_FILE_BYTES) {
    return 'That file is too big — the limit is 15 MB.';
  }
  if (isInstructionFile(file) || isImageFile(file)) return undefined;
  const looksLikeImage =
    file.type.toLowerCase().startsWith('image/') ||
    /\.(gif|heic|heif|tiff?|bmp|avif)$/i.test(file.name);
  return looksLikeImage
    ? 'This image can’t be added. Use JPG, PNG or WebP.'
    : 'This file can’t be added. Use PDF, JPG, PNG or WebP.';
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
