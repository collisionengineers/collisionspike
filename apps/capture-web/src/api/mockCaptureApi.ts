import type {
  CaptureExchangeResponse,
  CaptureSessionManifest,
  CaptureSubmitRequest,
  CaptureSubmitResponse,
  CaptureUploadCompleteRequest,
  CaptureUploadCompleteResponse,
  CaptureUploadIntent,
  CaptureUploadRequest
} from '@collisioncapture/contracts';
import { createMockManifest, requiredShotsComplete } from '@collisioncapture/core';
import type { CaptureApi, CaptureAuthorization } from './captureApi';

const delay = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

export class MockCaptureApi implements CaptureApi {
  private manifest = createMockManifest();
  private readonly attempts = new Map<string, CaptureUploadIntent & { shotId: string }>();

  async exchange(bootstrapSecret: string): Promise<CaptureExchangeResponse> {
    await delay(40);
    if (bootstrapSecret !== 'demo') throw new Error('Invalid demo capture link.');
    return {
      sessionId: this.manifest.sessionId,
      accessToken: 'demo-access-token',
      accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    };
  }

  async getManifest(authorization: CaptureAuthorization): Promise<CaptureSessionManifest> {
    await delay(120);
    this.assertSession(authorization);
    return structuredClone(this.manifest);
  }

  async createUpload(
    authorization: CaptureAuthorization,
    request: CaptureUploadRequest
  ): Promise<CaptureUploadIntent> {
    await delay(180);
    this.assertSession(authorization);
    const existing = this.attempts.get(request.idempotencyKey);
    if (existing) return existing;

    const intent = {
      uploadId: crypto.randomUUID(),
      assetId: crypto.randomUUID(),
      shotId: request.shotId,
      method: 'mock' as const,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    };
    this.attempts.set(request.idempotencyKey, intent);
    return intent;
  }

  async uploadFile(intent: CaptureUploadIntent, _file: File): Promise<void> {
    if (intent.method !== 'mock') throw new Error('Unexpected demo upload method.');
    await delay(350);
  }

  async completeUpload(
    authorization: CaptureAuthorization,
    assetId: string,
    _request: CaptureUploadCompleteRequest
  ): Promise<CaptureUploadCompleteResponse> {
    await delay(180);
    this.assertSession(authorization);
    const attempt = [...this.attempts.values()].find((candidate) => candidate.assetId === assetId);
    if (!attempt) throw new Error('Unknown demo upload.');

    const progress = this.manifest.progress.filter((item) => item.shotId !== attempt.shotId);
    this.manifest = {
      ...this.manifest,
      progress: [...progress, {
        shotId: attempt.shotId,
        status: 'accepted',
        uploadId: attempt.uploadId,
        assetId
      }]
    };
    return { assetId, shotId: attempt.shotId, status: 'accepted' };
  }

  async submit(
    authorization: CaptureAuthorization,
    _request: CaptureSubmitRequest
  ): Promise<CaptureSubmitResponse> {
    await delay(200);
    this.assertSession(authorization);
    if (!requiredShotsComplete(this.manifest)) throw new Error('Required photos are missing.');
    this.manifest = { ...this.manifest, status: 'complete' };
    return {
      status: 'complete',
      completedAt: new Date().toISOString()
    };
  }

  private assertSession(authorization: CaptureAuthorization): void {
    if (
      authorization.sessionId !== this.manifest.sessionId ||
      authorization.accessToken !== 'demo-access-token'
    ) {
      throw new Error('Invalid demo session.');
    }
  }
}
