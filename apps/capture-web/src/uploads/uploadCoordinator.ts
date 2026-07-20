import type {
  CaptureSessionManifest,
  CaptureSessionStatus,
  CaptureShotProgress,
  CaptureUploadCompleteResponse,
  CaptureUploadRequest
} from '@cs/capture-contracts';
import type { CaptureApi, CaptureAuthorization } from '../api/captureApi';
import { CaptureApiProblem, type CaptureProblemCode } from '../api/problem';
import type { DraftPhoto, DraftStore } from '../storage';
import {
  cloneClientCaptureObservation,
  unassessedObservation,
  type ClientCaptureObservation
} from '../capture/captureObservation';

export interface QueuePhotoInput {
  shotId: string;
  file: File;
  clientObservation?: ClientCaptureObservation;
  replacesSelected?: boolean;
}

export interface UploadCoordinatorOptions {
  api: CaptureApi;
  authorization: CaptureAuthorization;
  rulesVersion?: string;
  store: DraftStore;
  isOnline(): boolean;
  onProgress(progress: CaptureShotProgress): void;
  onManifest?(manifest: CaptureSessionManifest): void;
  onUnsettledChange?(hasUnsettledDrafts: boolean): void;
  onSessionUnavailable?(failure: CaptureSessionUnavailable): void;
}

export type CaptureUnavailableStatus = Exclude<CaptureSessionStatus, 'open'> | 'unavailable';

export interface CaptureSessionUnavailable {
  status: CaptureUnavailableStatus;
  code: CaptureProblemCode;
  message: string;
}

export const UNSUPPORTED_CAPTURE_FORMAT_MESSAGE =
  'This photo format is not supported. Choose a JPEG, PNG or WebP photo.';

export class UploadCoordinatorError extends Error {
  readonly code: 'unsupported-format' | 'validation' | 'unsupported' | 'session-unavailable';

  constructor(
    code: 'unsupported-format' | 'validation' | 'unsupported' | 'session-unavailable',
    message: string
  ) {
    super(message);
    this.name = 'UploadCoordinatorError';
    this.code = code;
  }
}

/** Foreground-only, retry-safe upload draining. It never stores authorization. */
export class UploadCoordinator {
  private drainPromise: Promise<void> | undefined;
  private refreshPromise: Promise<CaptureSessionManifest | undefined> | undefined;
  private drainAgain = false;
  private haltedFailure: CaptureSessionUnavailable | undefined;
  private readonly activeQueueKeys = new Set<string>();
  private readonly attemptErrors = new Map<string, UploadCoordinatorError>();

  constructor(private readonly options: UploadCoordinatorOptions) {}

  async queue(input: QueuePhotoInput): Promise<void> {
    if (this.haltedFailure) {
      throw new UploadCoordinatorError('session-unavailable', this.haltedFailure.message);
    }
    if (!isCaptureUploadContentType(input.file.type.toLowerCase())) {
      throw new UploadCoordinatorError('unsupported-format', UNSUPPORTED_CAPTURE_FORMAT_MESSAGE);
    }

    const rulesVersion = this.options.rulesVersion
      ?? input.clientObservation?.rulesVersion
      ?? 'quality-v1';
    const clientObservation = input.clientObservation
      ?? unassessedObservation('os_fallback', rulesVersion);
    this.options.onUnsettledChange?.(true);
    let draft: DraftPhoto;
    try {
      draft = await this.options.store.save({
        sessionId: this.options.authorization.sessionId,
        shotId: input.shotId,
        blob: input.file,
        fileName: input.file.name,
        clientObservation,
        replacesSelected: input.replacesSelected ?? false
      });
    } catch (error: unknown) {
      await this.updateUnsettled();
      throw error;
    }
    const key = draftKey(draft);
    this.activeQueueKeys.add(key);
    try {
      this.publishIntermediate(draft, 'queued');
      await this.drain();
      const error = this.attemptErrors.get(key) ?? this.sessionUnavailableError();
      if (error) throw error;
    } finally {
      this.activeQueueKeys.delete(key);
      this.attemptErrors.delete(key);
    }
  }

  async recover(): Promise<void> {
    if (this.haltedFailure) return;
    const drafts = await this.options.store.list(this.options.authorization.sessionId);
    for (const draft of drafts) {
      if (!isCaptureUploadContentType(draft.contentType)) {
        await this.discardUnsupported(draft);
        continue;
      }
      if (draft.status === 'queued') this.publishIntermediate(draft, 'queued');
      if (draft.status === 'uploading') this.publishIntermediate(draft, 'uploading');
      if (draft.status === 'uploaded') this.publishIntermediate(draft, 'validating');
    }
    await this.drain();
    await this.updateUnsettled();
  }

  async clearSession(): Promise<void> {
    await this.options.store.clearSession(this.options.authorization.sessionId);
    this.options.onUnsettledChange?.(false);
  }

  async handleApiFailure(error: unknown): Promise<boolean> {
    if (!(error instanceof CaptureApiProblem) || error.retryable) return false;
    if (error.code === 'capture_conflict') {
      const manifest = await this.refreshManifest();
      return manifest !== undefined && manifest.status !== 'open';
    }
    if (
      error.code === 'capture_expired' ||
      error.code === 'capture_revoked' ||
      error.code === 'capture_locked' ||
      error.code === 'capture_missing' ||
      error.code === 'capture_unauthorized'
    ) {
      this.haltFailure(problemFailure(error));
      return true;
    }
    return false;
  }

  async refreshManifest(): Promise<CaptureSessionManifest | undefined> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performManifestRefresh().finally(() => {
      this.refreshPromise = undefined;
    });
    return this.refreshPromise;
  }

  private async performManifestRefresh(): Promise<CaptureSessionManifest | undefined> {
    if (this.haltedFailure || !this.options.isOnline()) return undefined;
    try {
      const manifest = await this.options.api.getManifest(this.options.authorization);
      await this.reconcileManifest(manifest);
      return manifest;
    } catch (error: unknown) {
      if (error instanceof CaptureApiProblem && isSessionTerminalProblem(error)) {
        this.haltFailure(problemFailure(error));
      }
      return undefined;
    }
  }

  async drain(): Promise<void> {
    if (this.haltedFailure) return;
    if (this.drainPromise) {
      this.drainAgain = true;
      return this.drainPromise;
    }
    this.drainPromise = this.drainUntilSettled().finally(() => {
      this.drainPromise = undefined;
    });
    return this.drainPromise;
  }

  private async drainUntilSettled(): Promise<void> {
    do {
      this.drainAgain = false;
      await this.drainQueued();
    } while (this.drainAgain && !this.haltedFailure);
  }

  private async drainQueued(): Promise<void> {
    if (this.haltedFailure || !this.options.isOnline()) return;
    const drafts = await this.options.store.list(this.options.authorization.sessionId);
    for (const draft of drafts) {
      if (!this.options.isOnline()) return;
      if (draft.status !== 'queued' && draft.status !== 'uploaded') continue;
      if (!isCaptureUploadContentType(draft.contentType)) {
        await this.discardUnsupported(draft);
        continue;
      }
      await this.processDraft(draft);
      if (this.haltedFailure) return;
    }
  }

  private async processDraft(draft: DraftPhoto): Promise<void> {
    if (draft.status === 'uploaded' && draft.uploadId && draft.assetId) {
      this.publishIntermediate(draft, 'validating');
      await this.completeDraft(draft);
      return;
    }

    if (draft.status === 'uploaded' && draft.uploadId) {
      await this.resumeUploaded(draft);
      return;
    }

    if (draft.status === 'uploaded') {
      const queued = await this.options.store.setUploadState(
        draft.sessionId,
        draft.shotId,
        'queued',
        undefined,
        undefined,
        draft.idempotencyKey
      );
      if (queued) await this.upload(queued);
      return;
    }

    await this.upload(draft);
  }

  private async upload(draft: DraftPhoto): Promise<void> {
    const uploading = await this.options.store.setUploadState(
      draft.sessionId,
      draft.shotId,
      'uploading',
      draft.uploadId,
      draft.assetId,
      draft.idempotencyKey
    );
    if (!uploading) return;
    this.publishIntermediate(uploading, 'uploading');

    let currentDraft: DraftPhoto = uploading;
    try {
      const intent = await this.options.api.createUpload(
        this.options.authorization,
        draft.idempotencyKey,
        uploadRequest(
          draft,
          this.options.rulesVersion ?? draft.clientObservation?.rulesVersion ?? 'quality-v1'
        )
      );
      const intentDraft = await this.options.store.setUploadState(
        draft.sessionId,
        draft.shotId,
        'uploading',
        intent.uploadId,
        intent.assetId,
        draft.idempotencyKey
      );
      if (!intentDraft) return;
      currentDraft = intentDraft;
      await this.options.api.uploadFile(intent, fileFromDraft(draft));
      const uploadedDraft = await this.options.store.setUploadState(
        draft.sessionId,
        draft.shotId,
        'uploaded',
        intent.uploadId,
        intent.assetId,
        draft.idempotencyKey
      );
      if (!uploadedDraft) return;
      currentDraft = uploadedDraft;
      this.publishIntermediate(currentDraft, 'validating');
      await this.completeDraft(currentDraft);
    } catch (error: unknown) {
      await this.handleUploadFailure(currentDraft, error);
    }
  }

  private async resumeUploaded(draft: DraftPhoto): Promise<void> {
    try {
      const intent = await this.options.api.createUpload(
        this.options.authorization,
        draft.idempotencyKey,
        uploadRequest(
          draft,
          this.options.rulesVersion ?? draft.clientObservation?.rulesVersion ?? 'quality-v1'
        )
      );
      if (intent.uploadId !== draft.uploadId) {
        await this.handleUploadFailure(draft, new CaptureApiProblem(
          'capture_conflict',
          'The saved upload no longer matches this capture attempt.',
          409
        ));
        return;
      }
      const recovered = await this.options.store.setUploadState(
        draft.sessionId,
        draft.shotId,
        'uploaded',
        intent.uploadId,
        intent.assetId,
        draft.idempotencyKey
      );
      if (!recovered) return;
      this.publishIntermediate(recovered, 'validating');
      await this.completeDraft(recovered);
    } catch (error: unknown) {
      await this.handleUploadFailure(draft, error);
    }
  }

  private async completeDraft(draft: DraftPhoto): Promise<void> {
    if (!draft.uploadId || !draft.assetId) {
      await this.options.store.setUploadState(
        draft.sessionId,
        draft.shotId,
        'queued',
        draft.uploadId,
        draft.assetId,
        draft.idempotencyKey
      );
      return;
    }
    try {
      const completed = await this.options.api.completeUpload(
        this.options.authorization,
        draft.assetId,
        { sizeBytes: draft.sizeBytes, sha256: draft.sha256 }
      );
      await this.finish(draft, completed);
    } catch (error: unknown) {
      await this.handleUploadFailure(draft, error);
    }
  }

  private async handleUploadFailure(draft: DraftPhoto, error: unknown): Promise<void> {
    if (error instanceof CaptureApiProblem) {
      if (error.code === 'capture_conflict') {
        const resolved = await this.reconcileConflict(draft);
        if (resolved) return;
        await this.retainForRetry(draft);
        return;
      }

      if (error.code === 'capture_validation' || error.code === 'capture_unsupported') {
        const coordinatorError = new UploadCoordinatorError(
          error.code === 'capture_validation' ? 'validation' : 'unsupported',
          error.message
        );
        await this.rejectAttempt(draft, coordinatorError);
        return;
      }

      if (isSessionTerminalProblem(error)) {
        await this.haltSession(draft, error);
        return;
      }
    }

    await this.retainForRetry(draft);
  }

  private async retainForRetry(draft: DraftPhoto): Promise<void> {
    const resumable = Boolean(draft.status === 'uploaded' && draft.uploadId && draft.assetId);
    const retained = await this.options.store.setUploadState(
      draft.sessionId,
      draft.shotId,
      resumable ? 'uploaded' : 'queued',
      draft.uploadId,
      draft.assetId,
      draft.idempotencyKey
    );
    if (retained) {
      this.publishIntermediate(retained, 'retryable', 'This photo is saved and will retry.');
    }
  }

  private async reconcileConflict(draft: DraftPhoto): Promise<boolean> {
    try {
      const manifest = await this.refreshManifest();
      if (!manifest) return Boolean(this.haltedFailure);
      if (this.haltedFailure) return true;
      const authoritative = manifest.progress.find((progress) =>
        progress.shotId === draft.shotId && isFinalProgress(progress.status)
      );
      if (authoritative) {
        const cleared = await this.options.store.clearShot(
          draft.sessionId,
          draft.shotId,
          draft.idempotencyKey
        );
        if (cleared) {
          await this.updateUnsettled();
          this.options.onProgress({
            ...authoritative,
            fileName: draft.fileName,
            ...(draft.uploadId === undefined ? {} : { uploadId: draft.uploadId })
          });
        }
        return cleared || (await this.options.store.get(draft.sessionId, draft.shotId)) === undefined;
      }
      return (await this.options.store.get(draft.sessionId, draft.shotId)) === undefined;
    } catch (error: unknown) {
      if (error instanceof CaptureApiProblem && isSessionTerminalProblem(error)) {
        this.haltFailure(problemFailure(error));
        return true;
      }
      return false;
    }
  }

  private async rejectAttempt(
    draft: DraftPhoto,
    error: UploadCoordinatorError
  ): Promise<void> {
    const key = draftKey(draft);
    const cleared = await this.options.store.clearShot(
      draft.sessionId,
      draft.shotId,
      draft.idempotencyKey
    );
    if (!cleared) return;
    await this.updateUnsettled();
    if (this.activeQueueKeys.has(key)) {
      this.attemptErrors.set(key, error);
      return;
    }
    if (draft.replacesSelected) return;
    this.options.onProgress({
      shotId: draft.shotId,
      status: 'rejected',
      fileName: draft.fileName,
      rejectionReason: error.message
    });
  }

  private async haltSession(draft: DraftPhoto, problem: CaptureApiProblem): Promise<void> {
    await this.options.store.setUploadState(
      draft.sessionId,
      draft.shotId,
      draft.status === 'uploaded' ? 'uploaded' : 'queued',
      draft.uploadId,
      draft.assetId,
      draft.idempotencyKey
    );
    this.haltFailure(problemFailure(problem));
  }

  private async finish(
    draft: DraftPhoto,
    completed: CaptureUploadCompleteResponse
  ): Promise<void> {
    if (completed.shotId !== draft.shotId || completed.assetId !== draft.assetId) {
      throw new CaptureApiProblem(
        'capture_conflict',
        'The completed upload does not match this capture attempt.',
        409
      );
    }
    const cleared = await this.options.store.clearShot(
      draft.sessionId,
      draft.shotId,
      draft.idempotencyKey
    );
    if (!cleared) return;
    await this.updateUnsettled();
    this.options.onProgress({
      shotId: draft.shotId,
      status: completed.status,
      ...(draft.uploadId === undefined ? {} : { uploadId: draft.uploadId }),
      assetId: completed.assetId,
      fileName: draft.fileName
    });
  }

  private async reconcileManifest(manifest: CaptureSessionManifest): Promise<void> {
    if (manifest.sessionId !== this.options.authorization.sessionId) {
      throw new CaptureApiProblem(
        'capture_unauthorized',
        'This capture link is no longer authorized.',
        401
      );
    }
    this.options.onManifest?.(manifest);

    if (manifest.status !== 'open') {
      if (manifest.status === 'complete') {
        await this.options.store.clearSession(this.options.authorization.sessionId);
        this.options.onUnsettledChange?.(false);
      }
      this.haltFailure(manifestFailure(manifest.status));
      return;
    }

    const drafts = await this.options.store.list(this.options.authorization.sessionId);
    for (const draft of drafts) {
      const matchingFinal = manifest.progress.find((progress) =>
        progress.shotId === draft.shotId &&
        progress.assetId !== undefined &&
        progress.assetId === draft.assetId &&
        isFinalProgress(progress.status)
      );
      const selectedByServer = manifest.progress.find((progress) =>
        progress.shotId === draft.shotId &&
        progress.assetId !== undefined &&
        isSelectedProgress(progress.status)
      );
      const authoritative = matchingFinal ?? (draft.replacesSelected ? undefined : selectedByServer);
      if (authoritative) {
        const cleared = await this.options.store.clearShot(
          draft.sessionId,
          draft.shotId,
          draft.idempotencyKey
        );
        if (!cleared) continue;
        this.options.onProgress({
          ...authoritative,
          fileName: draft.fileName,
          ...(draft.uploadId === undefined ? {} : { uploadId: draft.uploadId })
        });
        continue;
      }

      if (draft.status === 'uploaded') this.publishIntermediate(draft, 'validating');
      if (draft.status === 'uploading') this.publishIntermediate(draft, 'uploading');
      if (draft.status === 'queued') this.publishIntermediate(draft, 'queued');
    }
    await this.updateUnsettled();
  }

  private haltFailure(failure: CaptureSessionUnavailable): void {
    if (this.haltedFailure) return;
    this.haltedFailure = failure;
    for (const key of this.activeQueueKeys) {
      this.attemptErrors.set(
        key,
        new UploadCoordinatorError('session-unavailable', failure.message)
      );
    }
    this.options.onSessionUnavailable?.(failure);
  }

  private sessionUnavailableError(): UploadCoordinatorError | undefined {
    if (!this.haltedFailure) return undefined;
    return new UploadCoordinatorError('session-unavailable', this.haltedFailure.message);
  }

  private async updateUnsettled(): Promise<void> {
    if (!this.options.onUnsettledChange) return;
    const drafts = await this.options.store.list(this.options.authorization.sessionId);
    this.options.onUnsettledChange(drafts.length > 0);
  }

  private async discardUnsupported(draft: DraftPhoto): Promise<void> {
    const cleared = await this.options.store.clearShot(
      draft.sessionId,
      draft.shotId,
      draft.idempotencyKey
    );
    if (!cleared) return;
    await this.updateUnsettled();
    if (draft.replacesSelected) return;
    this.options.onProgress({
      shotId: draft.shotId,
      status: 'rejected',
      fileName: draft.fileName,
      rejectionReason: UNSUPPORTED_CAPTURE_FORMAT_MESSAGE
    });
  }

  private publishIntermediate(
    draft: DraftPhoto,
    status: 'queued' | 'uploading' | 'validating' | 'retryable',
    rejectionReason?: string
  ): void {
    if (draft.replacesSelected) return;
    this.options.onProgress({
      shotId: draft.shotId,
      status,
      localDraftId: `${draft.sessionId}:${draft.shotId}`,
      fileName: draft.fileName,
      ...(draft.uploadId === undefined ? {} : { uploadId: draft.uploadId }),
      ...(rejectionReason === undefined ? {} : { rejectionReason })
    });
  }
}

function uploadRequest(
  draft: DraftPhoto,
  rulesVersion: string
): CaptureUploadRequest & { clientObservation: ClientCaptureObservation } {
  if (!isCaptureUploadContentType(draft.contentType)) {
    throw new Error('The saved photo format is not supported by the capture contract.');
  }

  return {
    shotId: draft.shotId,
    fileName: draft.fileName,
    contentType: draft.contentType,
    sizeBytes: draft.sizeBytes,
    sha256: draft.sha256,
    clientObservation: observationForRules(draft.clientObservation, rulesVersion)
  };
}

function observationForRules(
  observation: ClientCaptureObservation | undefined,
  rulesVersion: string
): ClientCaptureObservation {
  if (observation?.rulesVersion === rulesVersion) {
    return cloneClientCaptureObservation(observation);
  }
  return unassessedObservation(observation?.route ?? 'os_fallback', rulesVersion);
}

function isCaptureUploadContentType(
  value: string
): value is CaptureUploadRequest['contentType'] {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp';
}

function fileFromDraft(draft: DraftPhoto): File {
  return new File([draft.blob], draft.fileName, { type: draft.contentType });
}

function draftKey(draft: Pick<DraftPhoto, 'sessionId' | 'shotId'>): string {
  return `${draft.sessionId}\u0000${draft.shotId}`;
}

function unavailableStatus(code: CaptureProblemCode): CaptureUnavailableStatus {
  if (code === 'capture_expired') return 'expired';
  if (code === 'capture_revoked') return 'revoked';
  if (code === 'capture_locked') return 'locked';
  return 'unavailable';
}

function problemFailure(problem: CaptureApiProblem): CaptureSessionUnavailable {
  return {
    status: unavailableStatus(problem.code),
    code: problem.code,
    message: problem.message
  };
}

function isSessionTerminalProblem(problem: CaptureApiProblem): boolean {
  return problem.code === 'capture_expired' ||
    problem.code === 'capture_revoked' ||
    problem.code === 'capture_locked' ||
    problem.code === 'capture_missing' ||
    problem.code === 'capture_unauthorized';
}

function manifestFailure(status: Exclude<CaptureSessionStatus, 'open'>): CaptureSessionUnavailable {
  const message = status === 'complete'
    ? 'This capture session is already complete.'
    : status === 'expired'
      ? 'This capture link has expired.'
      : status === 'revoked'
        ? 'This capture link is no longer active.'
        : 'This capture session needs staff attention.';
  return {
    status,
    code: 'capture_conflict',
    message
  };
}

function isFinalProgress(status: CaptureShotProgress['status']): boolean {
  return status === 'accepted' || status === 'pending_review' || status === 'rejected';
}

function isSelectedProgress(status: CaptureShotProgress['status']): boolean {
  return status === 'accepted' || status === 'pending_review';
}
