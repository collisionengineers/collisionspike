export type CaptureToken = string;

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
  status: 'empty' | 'ready' | 'uploading' | 'uploaded' | 'rejected';
  localDraftId?: string;
  uploadId?: string;
  evidenceId?: string;
  fileName?: string;
  rejectionReason?: string;
}

export interface CaptureSessionManifest {
  token: CaptureToken;
  status: CaptureSessionStatus;
  caseId: string;
  caseReference?: string;
  registration?: string;
  vehicleLabel?: string;
  expiresAt: string;
  maxFileBytes: number;
  acceptedMimeTypes: string[];
  shots: CaptureShotDefinition[];
  progress: CaptureShotProgress[];
}

export interface CaptureUploadRequest {
  shotId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256?: string;
}

export interface CaptureUploadIntent {
  uploadId: string;
  method: 'direct' | 'mock';
  uploadUrl?: string;
  headers?: Record<string, string>;
  expiresAt: string;
}

export interface CaptureUploadCompleteRequest {
  uploadId: string;
  sizeBytes: number;
  sha256?: string;
}

export interface CaptureUploadCompleteResponse {
  evidenceId: string;
  shotId: string;
  status: 'uploaded';
}

export interface CaptureSubmitResponse {
  status: 'complete';
  completedAt: string;
}

export interface CaptureApiError {
  error: string;
  message: string;
}

