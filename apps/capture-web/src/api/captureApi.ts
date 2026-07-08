import type {
  CaptureSessionManifest,
  CaptureSubmitResponse,
  CaptureUploadCompleteResponse,
  CaptureUploadIntent,
  CaptureUploadRequest
} from '@collisioncapture/contracts';

export interface CaptureApi {
  getManifest(token: string): Promise<CaptureSessionManifest>;
  createUpload(token: string, request: CaptureUploadRequest): Promise<CaptureUploadIntent>;
  uploadFile(intent: CaptureUploadIntent, file: File): Promise<void>;
  completeUpload(token: string, uploadId: string, file: File): Promise<CaptureUploadCompleteResponse>;
  submit(token: string): Promise<CaptureSubmitResponse>;
}

