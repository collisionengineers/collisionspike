import type { CaptureSubmitResponse } from '@collisioncapture/contracts';
import type { CaptureApi, CaptureAuthorization } from '../api/captureApi';
import {
  clearSubmitKey,
  getOrCreateSubmitKey,
  type SubmitKeyDependencies
} from './submitKeyStore';

export async function submitCaptureSession(
  api: Pick<CaptureApi, 'submit'>,
  authorization: CaptureAuthorization,
  dependencies: SubmitKeyDependencies = {}
): Promise<CaptureSubmitResponse> {
  const idempotencyKey = getOrCreateSubmitKey(authorization.sessionId, dependencies);
  const response = await api.submit(authorization, idempotencyKey);
  clearSubmitKey(authorization.sessionId, dependencies);
  return response;
}
