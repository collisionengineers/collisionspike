import type { CaptureSessionManifest } from '@cs/capture-contracts';
import {
  DEFAULT_ACCEPTED_MIME_TYPES,
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_SHOTS,
  emptyProgress
} from './checklist';

export function createMockManifest(overrides: Partial<CaptureSessionManifest> = {}): CaptureSessionManifest {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
  return {
    contractVersion: '1',
    sessionId: 'capture-demo-001',
    status: 'open',
    caseReference: 'CAP26001',
    registration: 'AB12 CDE',
    vehicleLabel: 'Ford Focus',
    expiresAt,
    maxFileBytes: DEFAULT_MAX_FILE_BYTES,
    acceptedMimeTypes: DEFAULT_ACCEPTED_MIME_TYPES,
    guidanceMode: 'advisory',
    rulesVersion: 'quality-v1',
    shots: DEFAULT_SHOTS,
    progress: emptyProgress(DEFAULT_SHOTS),
    ...overrides
  };
}
