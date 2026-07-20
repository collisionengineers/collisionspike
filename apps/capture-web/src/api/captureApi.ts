import type {
  CaptureExchangeResponse,
  CaptureSessionManifest,
  CaptureSubmitResponse,
  CaptureUploadCompleteRequest,
  CaptureUploadCompleteResponse,
  CaptureUploadIntent,
  CaptureUploadRequest
} from '@collisioncapture/contracts';

export interface CaptureAuthorization {
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface CaptureApi {
  exchange(bootstrapSecret: string): Promise<CaptureExchangeResponse>;
  renew(): Promise<CaptureExchangeResponse>;
  getManifest(authorization: CaptureAuthorization): Promise<CaptureSessionManifest>;
  createUpload(
    authorization: CaptureAuthorization,
    idempotencyKey: string,
    request: CaptureUploadRequest
  ): Promise<CaptureUploadIntent>;
  uploadFile(intent: CaptureUploadIntent, file: File): Promise<void>;
  completeUpload(
    authorization: CaptureAuthorization,
    assetId: string,
    request: CaptureUploadCompleteRequest
  ): Promise<CaptureUploadCompleteResponse>;
  submit(authorization: CaptureAuthorization, idempotencyKey: string): Promise<CaptureSubmitResponse>;
}
