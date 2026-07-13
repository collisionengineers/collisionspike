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
import type { CaptureApi, CaptureAuthorization } from './captureApi';
import { CaptureApiProblem, problemFromResponse } from './problem';

export class HttpCaptureApi implements CaptureApi {
  readonly baseUrl: string;

  constructor(baseUrl = '/api/public/capture') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  exchange(bootstrapSecret: string): Promise<CaptureExchangeResponse> {
    return this.requestJson('/exchange', {
      method: 'POST',
      body: JSON.stringify({ bootstrapSecret })
    });
  }

  getManifest(authorization: CaptureAuthorization): Promise<CaptureSessionManifest> {
    return this.requestJson(
      `/sessions/${encodeURIComponent(authorization.sessionId)}`,
      { method: 'GET' },
      authorization
    );
  }

  createUpload(
    authorization: CaptureAuthorization,
    request: CaptureUploadRequest
  ): Promise<CaptureUploadIntent> {
    return this.requestJson(
      `/sessions/${encodeURIComponent(authorization.sessionId)}/uploads`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': request.idempotencyKey },
        body: JSON.stringify(request)
      },
      authorization
    );
  }

  async uploadFile(intent: CaptureUploadIntent, file: File): Promise<void> {
    if (intent.method !== 'direct' || !intent.uploadUrl) {
      throw new CaptureApiProblem(
        'capture_unsupported',
        'The upload destination is unavailable.',
        0
      );
    }

    let response: Response;
    try {
      response = await fetch(intent.uploadUrl, {
        method: 'PUT',
        headers: new Headers(intent.headers),
        body: file,
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      });
    } catch {
      throw new CaptureApiProblem(
        'capture_retryable',
        'The photo upload was interrupted. Try again.',
        0
      );
    }

    if (!response.ok) {
      throw new CaptureApiProblem(
        response.status === 401 || response.status === 403
          ? 'capture_unauthorized'
          : 'capture_retryable',
        'The photo upload could not be completed. Try again.',
        response.status
      );
    }
  }

  completeUpload(
    authorization: CaptureAuthorization,
    assetId: string,
    request: CaptureUploadCompleteRequest
  ): Promise<CaptureUploadCompleteResponse> {
    return this.requestJson(
      `/sessions/${encodeURIComponent(authorization.sessionId)}/uploads/${encodeURIComponent(assetId)}/complete`,
      { method: 'POST', body: JSON.stringify(request) },
      authorization
    );
  }

  submit(
    authorization: CaptureAuthorization,
    request: CaptureSubmitRequest
  ): Promise<CaptureSubmitResponse> {
    return this.requestJson(
      `/sessions/${encodeURIComponent(authorization.sessionId)}/submit`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': request.idempotencyKey },
        body: JSON.stringify(request)
      },
      authorization
    );
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit,
    authorization?: CaptureAuthorization
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    if (authorization) headers.set('Authorization', `Bearer ${authorization.accessToken}`);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      });
    } catch {
      throw new CaptureApiProblem(
        'capture_retryable',
        'The capture service could not be reached. Try again.',
        0
      );
    }

    if (!response.ok) throw await problemFromResponse(response);
    return await response.json() as T;
  }
}
