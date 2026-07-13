import type {
  CaptureExchangeResponse,
  CaptureSessionManifest,
  CaptureSubmitResponse,
  CaptureUploadCompleteRequest,
  CaptureUploadCompleteResponse,
  CaptureUploadIntent,
  CaptureUploadRequest
} from '@collisioncapture/contracts';
import type { CaptureApi, CaptureAuthorization } from './captureApi';
import { CaptureApiProblem, problemFromResponse } from './problem';

const RENEWAL_SKEW_MS = 60_000;

export class HttpCaptureApi implements CaptureApi {
  readonly baseUrl: string;
  private renewalPromise: Promise<CaptureExchangeResponse> | undefined;

  constructor(baseUrl = '/api/public/capture') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  exchange(bootstrapSecret: string): Promise<CaptureExchangeResponse> {
    return this.requestJson('/exchange', {
      method: 'POST',
      body: JSON.stringify({ bootstrapSecret })
    }, undefined, 'include');
  }

  renew(): Promise<CaptureExchangeResponse> {
    if (!this.renewalPromise) {
      const pending = this.requestJson<CaptureExchangeResponse>(
        '/renew',
        { method: 'POST' },
        undefined,
        'include',
        false
      );
      this.renewalPromise = pending;
      const clear = (): void => {
        if (this.renewalPromise === pending) this.renewalPromise = undefined;
      };
      void pending.then(clear, clear);
    }
    return this.renewalPromise;
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
    idempotencyKey: string,
    request: CaptureUploadRequest
  ): Promise<CaptureUploadIntent> {
    return this.requestJson(
      `/sessions/${encodeURIComponent(authorization.sessionId)}/uploads`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
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
        'capture_retryable',
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

  submit(authorization: CaptureAuthorization, idempotencyKey: string): Promise<CaptureSubmitResponse> {
    return this.requestJson(
      `/sessions/${encodeURIComponent(authorization.sessionId)}/submit`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey }
      },
      authorization,
      'include'
    );
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit,
    authorization?: CaptureAuthorization,
    credentials: RequestCredentials = 'omit',
    allowRenew = true
  ): Promise<T> {
    if (authorization && allowRenew && shouldRenew(authorization)) {
      const renewed = await this.renew();
      this.applyRenewal(authorization, renewed);
      return this.requestJson(path, init, authorization, credentials, false);
    }

    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    if (authorization) headers.set('Authorization', `Bearer ${authorization.accessToken}`);

    const tokenUsed = authorization?.accessToken;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        cache: 'no-store',
        credentials,
        referrerPolicy: 'no-referrer'
      });
    } catch {
      throw new CaptureApiProblem(
        'capture_retryable',
        'The capture service could not be reached. Try again.',
        0
      );
    }

    if (response.status === 401 && authorization && allowRenew) {
      if (authorization.accessToken === tokenUsed) {
        const renewed = await this.renew();
        this.applyRenewal(authorization, renewed);
      }
      return this.requestJson(path, init, authorization, credentials, false);
    }

    if (!response.ok) throw await problemFromResponse(response);
    return await response.json() as T;
  }

  private applyRenewal(
    authorization: CaptureAuthorization,
    renewed: CaptureExchangeResponse
  ): void {
    if (renewed.sessionId !== authorization.sessionId) {
      throw new CaptureApiProblem(
        'capture_unauthorized',
        'This capture link is no longer authorized.',
        401
      );
    }
    authorization.accessToken = renewed.accessToken;
    authorization.accessTokenExpiresAt = renewed.accessTokenExpiresAt;
  }
}

function shouldRenew(authorization: CaptureAuthorization): boolean {
  const expiresAt = Date.parse(authorization.accessTokenExpiresAt);
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now() + RENEWAL_SKEW_MS;
}
