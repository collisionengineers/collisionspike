import type {
  CaptureShotProgress,
  CaptureUploadCompleteResponse,
  CaptureUploadIntent,
  CaptureUploadRequest
} from '@collisioncapture/contracts';
import type { CaptureApi, CaptureAuthorization } from '../api/captureApi';
import type { DraftPhoto, DraftStore } from '../storage';

export interface QueuePhotoInput {
  shotId: string;
  file: File;
  replacesSelected?: boolean;
}

export interface UploadCoordinatorOptions {
  api: CaptureApi;
  authorization: CaptureAuthorization;
  store: DraftStore;
  isOnline(): boolean;
  onProgress(progress: CaptureShotProgress): void;
}

/** Foreground-only, retry-safe upload draining. It never stores authorization. */
export class UploadCoordinator {
  private drainPromise: Promise<void> | undefined;

  constructor(private readonly options: UploadCoordinatorOptions) {}

  async queue(input: QueuePhotoInput): Promise<void> {
    const draft = await this.options.store.save({
      sessionId: this.options.authorization.sessionId,
      shotId: input.shotId,
      blob: input.file,
      fileName: input.file.name,
      replacesSelected: input.replacesSelected ?? false
    });
    this.publishIntermediate(draft, 'queued');
    await this.drain();
  }

  async recover(): Promise<void> {
    const drafts = await this.options.store.list(this.options.authorization.sessionId);
    for (const draft of drafts) {
      if (draft.status === 'queued') this.publishIntermediate(draft, 'queued');
      if (draft.status === 'uploading') this.publishIntermediate(draft, 'uploading');
    }
    await this.drain();
  }

  async clearSession(): Promise<void> {
    await this.options.store.clearSession(this.options.authorization.sessionId);
  }

  async drain(): Promise<void> {
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = this.drainQueued().finally(() => {
      this.drainPromise = undefined;
    });
    return this.drainPromise;
  }

  private async drainQueued(): Promise<void> {
    if (!this.options.isOnline()) return;
    const drafts = await this.options.store.list(this.options.authorization.sessionId);
    for (const draft of drafts) {
      if (!this.options.isOnline()) return;
      if (draft.status !== 'queued') continue;
      await this.upload(draft);
    }
  }

  private async upload(draft: DraftPhoto): Promise<void> {
    await this.options.store.setUploadState(
      draft.sessionId,
      draft.shotId,
      'uploading',
      draft.uploadId
    );
    this.publishIntermediate(draft, 'uploading');

    try {
      const intent = await this.options.api.createUpload(
        this.options.authorization,
        uploadRequest(draft)
      );
      await this.options.store.setUploadState(
        draft.sessionId,
        draft.shotId,
        'uploading',
        intent.uploadId
      );
      await this.options.api.uploadFile(intent, fileFromDraft(draft));
      const completed = await this.options.api.completeUpload(
        this.options.authorization,
        intent.assetId,
        { sizeBytes: draft.sizeBytes, sha256: draft.sha256 }
      );
      await this.finish(draft, intent, completed);
    } catch {
      await this.options.store.setUploadState(draft.sessionId, draft.shotId, 'queued');
      this.publishIntermediate(draft, 'retryable', 'This photo is saved and will retry.');
    }
  }

  private async finish(
    draft: DraftPhoto,
    intent: CaptureUploadIntent,
    completed: CaptureUploadCompleteResponse
  ): Promise<void> {
    if (completed.status === 'validating') {
      await this.options.store.setUploadState(
        draft.sessionId,
        draft.shotId,
        'uploaded',
        intent.uploadId
      );
      this.publishIntermediate(draft, 'validating');
      return;
    }

    await this.options.store.clearShot(draft.sessionId, draft.shotId);
    this.options.onProgress({
      shotId: draft.shotId,
      status: completed.status,
      uploadId: intent.uploadId,
      assetId: completed.assetId,
      fileName: draft.fileName
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

function uploadRequest(draft: DraftPhoto): CaptureUploadRequest {
  return {
    shotId: draft.shotId,
    idempotencyKey: draft.idempotencyKey,
    fileName: draft.fileName,
    contentType: draft.contentType,
    sizeBytes: draft.sizeBytes,
    sha256: draft.sha256
  };
}

function fileFromDraft(draft: DraftPhoto): File {
  return new File([draft.blob], draft.fileName, { type: draft.contentType });
}
