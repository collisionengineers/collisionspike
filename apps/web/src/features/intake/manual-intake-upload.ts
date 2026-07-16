import type { EvidenceUploadResult } from '../../data';
import { evidenceUploadIsComplete } from '../../shared/evidence/evidence-upload-result';

export interface ManualIntakeUploadFile {
  name: string;
}

export interface ManualIntakeUploadItem {
  fileIndex: number;
  fileName: string;
  role: 'instruction' | 'extra';
  state: 'added' | 'outstanding';
  evidenceId?: string;
  reason?: string;
}

export interface ManualIntakeUploadOutcome {
  complete: boolean;
  message: string;
  items: ManualIntakeUploadItem[];
}

/** Turn the canonical upload response into a complete per-selected-file ledger.
 * Missing identities are always outstanding, even when the transport returned 2xx. */
export function manualIntakeUploadOutcome(
  result: EvidenceUploadResult,
  files: readonly ManualIntakeUploadFile[],
  instructionIndex: number,
): ManualIntakeUploadOutcome {
  const added = new Map(
    result.added
      .filter((item) => item.evidenceId.trim().length > 0)
      .map((item) => [item.fileIndex, item] as const),
  );
  const rejected = new Map(result.rejected.map((item) => [item.fileIndex, item.reason] as const));
  const items = files.map<ManualIntakeUploadItem>((file, fileIndex) => {
    const confirmed = added.get(fileIndex);
    return {
      fileIndex,
      fileName: file.name,
      role: fileIndex === instructionIndex ? 'instruction' : 'extra',
      state: confirmed ? 'added' : 'outstanding',
      ...(confirmed ? { evidenceId: confirmed.evidenceId } : {}),
      ...(!confirmed
        ? {
            reason:
              rejected.get(fileIndex) ??
              'We could not confirm this file was added. Try it again.',
          }
        : {}),
    };
  });
  const complete = evidenceUploadIsComplete(result, files.length);
  if (complete) {
    const extras = files.length - (instructionIndex >= 0 ? 1 : 0);
    const roleSummary = instructionIndex >= 0
      ? extras > 0
        ? `the instruction and ${extras} extra file${extras === 1 ? '' : 's'}`
        : 'the instruction'
      : `${files.length} file${files.length === 1 ? '' : 's'}`;
    return {
      complete: true,
      message: `Case created — ${roleSummary} added`,
      items,
    };
  }
  const outstanding = items.filter((item) => item.state === 'outstanding').length;
  const addedCount = items.length - outstanding;
  if (result.manualIntakeCompletion === 'not_bound' && addedCount === items.length) {
    return {
      complete: false,
      message: 'The files were added, but the case could not be marked finished. Retry to confirm.',
      items,
    };
  }
  return {
    complete: false,
    message:
      addedCount > 0
        ? `Case created — ${addedCount} of ${items.length} files added. ${outstanding} still ${outstanding === 1 ? 'needs' : 'need'} attention.`
        : `Case created, but ${outstanding === 1 ? 'the file was' : 'the files were'} not added.`,
    items,
  };
}
