/** Staff-visible lifecycle for a guided-photo request. */
export type CaptureSessionStatus = 'open' | 'complete' | 'expired' | 'revoked' | 'locked';

export type CaptureGuidanceMode = 'off' | 'shadow' | 'advisory' | 'enforced';

/** A request summary deliberately contains no public link or bootstrap secret. */
export interface CaptureSessionStaffSummary {
  sessionId: string;
  status: CaptureSessionStatus;
  /** Server-owned identifier; clients must not treat this as a closed enum. */
  shotPlanId: string;
  shotPlanLabel: string;
  guidanceMode: CaptureGuidanceMode;
  expiresAt: string;
  createdAt: string;
  submittedAt?: string;
  requiredTotal: number;
  requiredCompleted: number;
}

export interface CaptureSessionListResponse {
  sessions: CaptureSessionStaffSummary[];
}

export interface CreateCaptureSessionRequest {
  shotPlanId: string;
  expiresInHours: number;
}

/** Returned only when creating/replacing a link; the URL cannot be recovered later. */
export interface CaptureSessionSecretResponse {
  session: CaptureSessionStaffSummary;
  captureUrl: string;
}
