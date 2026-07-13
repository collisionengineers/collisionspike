export type CaptureSessionStatus =
  | 'open'
  | 'complete'
  | 'expired'
  | 'revoked'
  | 'locked';

export type ShotRole =
  | 'overview'
  | 'damage_closeup'
  | 'damage_context'
  | 'front_left'
  | 'front_right'
  | 'rear_left'
  | 'rear_right'
  | 'vin'
  | 'odometer'
  | 'additional';

export type EvidenceImageRole = 'overview' | 'damage_closeup' | 'additional' | 'unknown';

export interface CaptureShotDefinition {
  id: string;
  role: ShotRole;
  evidenceRole: EvidenceImageRole;
  label: string;
  prompt: string;
  required: boolean;
  sequence: number;
}

export interface CaptureShotProgress {
  shotId: string;
  status:
    | 'empty'
    | 'draft'
    | 'queued'
    | 'uploading'
    | 'validating'
    | 'accepted'
    | 'pending_review'
    | 'retryable'
    | 'rejected';
  localDraftId?: string;
  uploadId?: string;
  assetId?: string;
  fileName?: string;
  rejectionReason?: string;
}

export interface CaptureSessionManifest {
  contractVersion: '1';
  sessionId: string;
  status: CaptureSessionStatus;
  caseReference?: string;
  registration?: string;
  vehicleLabel?: string;
  expiresAt: string;
  maxFileBytes: number;
  acceptedMimeTypes: string[];
  guidanceMode: 'off' | 'shadow' | 'advisory' | 'enforced';
  rulesVersion: string;
  modelVersion?: string;
  shots: CaptureShotDefinition[];
  progress: CaptureShotProgress[];
}

export interface CaptureUploadRequest {
  shotId: string;
  idempotencyKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

export interface CaptureUploadIntent {
  uploadId: string;
  assetId: string;
  method: 'direct' | 'mock';
  uploadUrl?: string;
  headers?: Record<string, string>;
  expiresAt: string;
}

export interface CaptureUploadCompleteRequest {
  sizeBytes: number;
  sha256: string;
}

export interface CaptureUploadCompleteResponse {
  assetId: string;
  shotId: string;
  status: 'validating' | 'accepted' | 'pending_review';
}

export interface CaptureExchangeRequest {
  bootstrapSecret: string;
}

export interface CaptureExchangeResponse {
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface CaptureSubmitRequest {
  idempotencyKey: string;
}

export interface CaptureSubmitResponse {
  status: 'complete';
  completedAt: string;
}

export interface CaptureApiError {
  error: string;
  message: string;
}
