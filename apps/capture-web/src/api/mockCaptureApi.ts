import type {
  CaptureSessionManifest,
  CaptureSubmitResponse,
  CaptureUploadCompleteResponse,
  CaptureUploadIntent,
  CaptureUploadRequest
} from '@collisioncapture/contracts';
import { createMockManifest } from '@collisioncapture/core';
import type { CaptureApi } from './captureApi';

const delay = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

export class MockCaptureApi implements CaptureApi {
  private manifest = createMockManifest();

  async getManifest(token: string): Promise<CaptureSessionManifest> {
    await delay(120);
    this.manifest = {
      ...this.manifest,
      token
    };
    return this.manifest;
  }

  async createUpload(_token: string, _request: CaptureUploadRequest): Promise<CaptureUploadIntent> {
    await delay(180);
    return {
      uploadId: crypto.randomUUID(),
      method: 'mock',
      expiresAt: new Date(Date.now() + 1000 * 60 * 10).toISOString()
    };
  }

  async uploadFile(_intent: CaptureUploadIntent, _file: File): Promise<void> {
    await delay(350);
  }

  async completeUpload(
    _token: string,
    uploadId: string,
    file: File
  ): Promise<CaptureUploadCompleteResponse> {
    await delay(180);
    const shotId = file.name.split('__')[0] ?? uploadId;
    return {
      evidenceId: `ev-${uploadId}`,
      shotId,
      status: 'uploaded'
    };
  }

  async submit(_token: string): Promise<CaptureSubmitResponse> {
    await delay(200);
    return {
      status: 'complete',
      completedAt: new Date().toISOString()
    };
  }
}

