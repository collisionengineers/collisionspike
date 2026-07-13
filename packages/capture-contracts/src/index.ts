import type { components } from './generated';

export type { components, operations, paths } from './generated';

type ApiSchemas = components['schemas'];

export type CaptureSessionStatus = ApiSchemas['CaptureSessionStatus'];
export type GuidanceMode = ApiSchemas['GuidanceMode'];
export type ShotRole = ApiSchemas['ShotRole'];
export type EvidenceImageRole = ApiSchemas['EvidenceImageRole'];
export type CaptureShotDefinition = ApiSchemas['CaptureShotDefinition'];

/** Exact progress shape returned by the public capture API. */
export type CaptureShotProgressTransport = ApiSchemas['CaptureShotProgress'];

/** Browser-only fields used while a draft is queued or uploaded. They never cross the API boundary. */
export interface CaptureShotProgressLocal {
  localDraftId?: string;
  uploadId?: string;
  fileName?: string;
}

export type CaptureShotProgress = CaptureShotProgressTransport & CaptureShotProgressLocal;

/** Exact manifest shape generated from CollisionSpike OpenAPI. */
export type CaptureSessionManifestTransport = ApiSchemas['CaptureSessionManifest'];

/** Browser view of the manifest with optional local progress metadata. */
export type CaptureSessionManifest = Omit<CaptureSessionManifestTransport, 'progress'> & {
  progress: CaptureShotProgress[];
};

export type CaptureUploadRequest = ApiSchemas['CaptureUploadRequest'];
export type ClientCaptureSignals = ApiSchemas['ClientCaptureSignals'];
export type ClientCaptureObservation = ApiSchemas['ClientCaptureObservation'];
export type CaptureUploadIntentTransport = ApiSchemas['CaptureUploadIntent'];

/** Development-only upload intent used by the explicit local demo adapter. */
export interface CaptureMockUploadIntent {
  uploadId: string;
  assetId: string;
  method: 'mock';
  expiresAt: string;
}

export type CaptureUploadIntent = CaptureUploadIntentTransport | CaptureMockUploadIntent;
export type CaptureUploadCompleteRequest = ApiSchemas['CaptureUploadCompleteRequest'];
export type CaptureUploadCompleteResponse = ApiSchemas['CaptureUploadCompleteResponse'];
export type CaptureExchangeRequest = ApiSchemas['CaptureExchangeRequest'];
export type CaptureExchangeResponse = ApiSchemas['CaptureExchangeResponse'];
export type CaptureSubmitResponse = ApiSchemas['CaptureSubmitResponse'];
export type CaptureApiError = ApiSchemas['CaptureApiProblem'];
