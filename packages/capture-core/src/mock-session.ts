import type { CaptureSessionManifest } from '@collisioncapture/contracts';
import {
  DEFAULT_ACCEPTED_MIME_TYPES,
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_SHOTS,
  emptyProgress
} from './checklist';

export function createMockManifest(overrides: Partial<CaptureSessionManifest> = {}): CaptureSessionManifest {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
  return {
    token: 'demo-token',
    status: 'open',
    caseId: 'case-demo-001',
    caseReference: 'CAP26001',
    registration: 'AB12 CDE',
    vehicleLabel: 'Ford Focus',
    expiresAt,
    maxFileBytes: DEFAULT_MAX_FILE_BYTES,
    acceptedMimeTypes: DEFAULT_ACCEPTED_MIME_TYPES,
    shots: DEFAULT_SHOTS,
    progress: emptyProgress(DEFAULT_SHOTS),
    ...overrides
  };
}

