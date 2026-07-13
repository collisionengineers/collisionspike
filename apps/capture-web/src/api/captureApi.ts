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

export interface CaptureAuthorization {
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface CaptureApi {
  exchange(bootstrapSecret: string): Promise<CaptureExchangeResponse>;
  getManifest(authorization: CaptureAuthorization): Promise<CaptureSessionManifest>;
  createUpload(
    authorization: CaptureAuthorization,
    request: CaptureUploadRequest
  ): Promise<CaptureUploadIntent>;
  uploadFile(intent: CaptureUploadIntent, file: File): Promise<void>;
  completeUpload(
    authorization: CaptureAuthorization,
    assetId: string,
    request: CaptureUploadCompleteRequest
  ): Promise<CaptureUploadCompleteResponse>;
  submit(
    authorization: CaptureAuthorization,
    request: CaptureSubmitRequest
  ): Promise<CaptureSubmitResponse>;
}
