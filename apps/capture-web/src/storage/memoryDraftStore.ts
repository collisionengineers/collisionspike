import {
  assertDraftKey,
  cloneDraft,
  createDraftPhoto,
  rehydrateDraft,
  type DraftPhoto,
  type DraftPhotoInput,
  type DraftStore,
  type DraftStoreDependencies,
  type DraftUploadState
} from './draftStore';

export class MemoryDraftStore implements DraftStore {
  private readonly drafts = new Map<string, DraftPhoto>();

  constructor(private readonly dependencies: DraftStoreDependencies = {}) {}

  async save(input: DraftPhotoInput): Promise<DraftPhoto> {
    const draft = await createDraftPhoto(input, this.dependencies);
    this.restore(draft);
    return cloneDraft(draft);
  }

  async get(sessionId: string, shotId: string): Promise<DraftPhoto | undefined> {
    assertDraftKey(sessionId, shotId);
    const stored = this.drafts.get(keyOf(sessionId, shotId));
    if (!stored) return undefined;

    const draft = rehydrateDraft(stored);
    if (draft.status !== stored.status) this.restore(draft);
    return draft;
  }

  async list(sessionId: string): Promise<DraftPhoto[]> {
    if (sessionId.trim().length === 0) throw new Error('sessionId is required.');

    const drafts = [...this.drafts.values()]
      .filter((draft) => draft.sessionId === sessionId)
      .map((draft) => rehydrateDraft(draft))
      .sort(compareDrafts);
    for (const draft of drafts) this.restore(draft);
    return drafts;
  }

  async setUploadState(
    sessionId: string,
    shotId: string,
    status: DraftUploadState,
    uploadId?: string,
    assetId?: string,
    expectedIdempotencyKey?: string
  ): Promise<DraftPhoto | undefined> {
    assertDraftKey(sessionId, shotId);
    const stored = this.drafts.get(keyOf(sessionId, shotId));
    if (!stored) return undefined;
    if (expectedIdempotencyKey && stored.idempotencyKey !== expectedIdempotencyKey) {
      return undefined;
    }

    const updated: DraftPhoto = {
      ...cloneDraft(stored),
      status,
      ...(uploadId === undefined ? {} : { uploadId }),
      ...(assetId === undefined ? {} : { assetId }),
      updatedAt: (this.dependencies.now ?? (() => new Date()))().toISOString()
    };
    this.restore(updated);
    return cloneDraft(updated);
  }

  async clearShot(
    sessionId: string,
    shotId: string,
    expectedIdempotencyKey?: string
  ): Promise<boolean> {
    assertDraftKey(sessionId, shotId);
    const key = keyOf(sessionId, shotId);
    const stored = this.drafts.get(key);
    if (!stored || (expectedIdempotencyKey && stored.idempotencyKey !== expectedIdempotencyKey)) {
      return false;
    }
    this.drafts.delete(key);
    return true;
  }

  async clearSession(sessionId: string): Promise<void> {
    if (sessionId.trim().length === 0) throw new Error('sessionId is required.');
    for (const [key, draft] of this.drafts) {
      if (draft.sessionId === sessionId) this.drafts.delete(key);
    }
  }

  restore(draft: DraftPhoto): void {
    this.drafts.set(keyOf(draft.sessionId, draft.shotId), cloneDraft(draft));
  }
}

export function compareDrafts(left: DraftPhoto, right: DraftPhoto): number {
  return left.capturedAt.localeCompare(right.capturedAt) || left.shotId.localeCompare(right.shotId);
}

function keyOf(sessionId: string, shotId: string): string {
  return `${sessionId}\u0000${shotId}`;
}
