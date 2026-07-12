export const MANUAL_INTAKE_ACCEPT =
  '.jpg,.jpeg,.png,.webp,.pdf,.docx,.doc,.eml,.msg,image/jpeg,image/png,image/webp';

const INSTRUCTION_EXTENSIONS = ['.pdf', '.docx', '.doc', '.eml', '.msg'];
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export interface ManualIntakeFileLike {
  name: string;
  type: string;
}

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
  if (isInstructionFile(file) || isImageFile(file)) return undefined;
  const looksLikeImage =
    file.type.toLowerCase().startsWith('image/') ||
    /\.(gif|heic|heif|tiff?|bmp|avif)$/i.test(file.name);
  return looksLikeImage
    ? 'This image can’t be added. Use JPG, PNG or WebP.'
    : 'This file can’t be added. Use PDF, Word, email, JPG, PNG or WebP.';
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
