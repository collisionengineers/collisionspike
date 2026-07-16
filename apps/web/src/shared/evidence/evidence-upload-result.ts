import type { EvidenceUploadResult } from '../../data';

/** One upload is complete only when every selected file has a confirmed identity. */
export function evidenceUploadIsComplete(
  result: EvidenceUploadResult,
  expectedCount: number,
): boolean {
  const confirmedIndexes = new Set(result.added.map((item) => item.fileIndex));
  return (
    expectedCount > 0 &&
    (result.status === 200 || result.status === 201) &&
    result.rejected.length === 0 &&
    result.added.length === expectedCount &&
    confirmedIndexes.size === expectedCount &&
    result.added.every(
      (item) => Number.isInteger(item.fileIndex)
        && item.fileIndex >= 0
        && item.fileIndex < expectedCount
        && typeof item.evidenceId === 'string'
        && item.evidenceId.trim().length > 0,
    )
  );
}

/**
 * Add evidence already renders file-specific refusals. This covers responses that
 * carry only a top-level error, plus an apparently successful response that did not
 * confirm every selected file. Raw server wording is deliberately not shown.
 */
export function addEvidenceTopLevelMessage(
  result: EvidenceUploadResult,
  expectedCount: number,
): string | undefined {
  if (result.rejected.length > 0 || evidenceUploadIsComplete(result, expectedCount)) {
    return undefined;
  }
  if (result.status === 401) {
    return 'Your sign-in has expired. Refresh the page, then try again.';
  }
  if (result.status === 403) {
    return 'You do not have permission to add files to this case.';
  }
  if (result.status === 0 || result.status >= 500) {
    return 'The files could not be added right now. Try again.';
  }
  if (result.status < 200 || result.status >= 300 || result.error) {
    return 'The files could not be added. Check the selected case and files, then try again.';
  }
  return 'We could not confirm that every file was added. The selected files are still here; try again.';
}

export interface ManualIntakeEvidenceNotice {
  complete: boolean;
  intent: 'success' | 'error';
  message: string;
}

/** Truthful toast state for the images-only new-case flow, which always opens the case. */
export function manualIntakeEvidenceNotice(
  result: EvidenceUploadResult,
  expectedCount: number,
): ManualIntakeEvidenceNotice {
  if (evidenceUploadIsComplete(result, expectedCount)) {
    return {
      complete: true,
      intent: 'success',
      message: `Case created — ${expectedCount} photo${expectedCount === 1 ? '' : 's'} attached`,
    };
  }

  const confirmedCount = Math.min(
    expectedCount,
    result.added.filter(
      (item) => typeof item.evidenceId === 'string' && item.evidenceId.trim().length > 0,
    ).length,
  );
  if (confirmedCount > 0 && confirmedCount < expectedCount) {
    const remaining = expectedCount - confirmedCount;
    return {
      complete: false,
      intent: 'error',
      message:
        `Case created — ${confirmedCount} of ${expectedCount} photos attached. ` +
        `Add the remaining ${remaining === 1 ? 'photo' : 'photos'} from the case.`,
    };
  }
  if (confirmedCount > 0) {
    return {
      complete: false,
      intent: 'error',
      message: 'Case created — some photos still need to be added from the case.',
    };
  }
  return {
    complete: false,
    intent: 'error',
    message: 'Case created, but the photos could not be attached — open the case to add them',
  };
}
