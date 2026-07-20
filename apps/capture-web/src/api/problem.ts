import type { CaptureApiError } from '@collisioncapture/contracts';

export type CaptureProblemCode = CaptureApiError['error'];

const RETRYABLE_CODES = new Set<CaptureProblemCode>(['capture_retryable']);

export class CaptureApiProblem extends Error {
  readonly code: CaptureProblemCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: CaptureProblemCode, message: string, status: number) {
    super(message);
    this.name = 'CaptureApiProblem';
    this.code = code;
    this.status = status;
    this.retryable = status >= 500 || status === 408 || status === 429 || RETRYABLE_CODES.has(code);
  }
}

export async function problemFromResponse(response: Response): Promise<CaptureApiProblem> {
  let payload: Partial<CaptureApiError> | undefined;
  try {
    payload = await response.json() as Partial<CaptureApiError>;
  } catch {
    payload = undefined;
  }

  const code = isProblemCode(payload?.error) ? payload.error : codeFromStatus(response.status);
  const message = typeof payload?.message === 'string' && payload.message.trim()
    ? payload.message
    : defaultMessage(code);
  return new CaptureApiProblem(code, message, response.status);
}

function isProblemCode(value: unknown): value is CaptureProblemCode {
  return typeof value === 'string' && [
    'capture_missing',
    'capture_expired',
    'capture_revoked',
    'capture_locked',
    'capture_unsupported',
    'capture_validation',
    'capture_conflict',
    'capture_unauthorized',
    'capture_retryable',
    'capture_unknown'
  ].includes(value);
}

function codeFromStatus(status: number): CaptureProblemCode {
  if (status === 401 || status === 403) return 'capture_unauthorized';
  if (status === 404) return 'capture_missing';
  if (status === 409) return 'capture_conflict';
  if (status === 410) return 'capture_expired';
  if (status === 422) return 'capture_validation';
  if (status === 408 || status === 429 || status >= 500) return 'capture_retryable';
  return 'capture_unknown';
}

function defaultMessage(code: CaptureProblemCode): string {
  switch (code) {
    case 'capture_expired': return 'This capture link has expired.';
    case 'capture_revoked': return 'This capture link has been replaced.';
    case 'capture_locked': return 'This capture session needs staff attention.';
    case 'capture_missing': return 'This capture link could not be found.';
    case 'capture_unsupported': return 'This capture request is not supported.';
    case 'capture_validation': return 'The photo did not pass validation.';
    case 'capture_conflict': return 'The capture changed. Refresh and try again.';
    case 'capture_unauthorized': return 'This capture link is no longer authorized.';
    case 'capture_retryable': return 'The service is temporarily unavailable. Try again.';
    default: return 'The capture request could not be completed.';
  }
}
