import type { DraftPhoto, DraftPhotoInput, DraftStore, DraftUploadState } from './draftStore';
import { IndexedDbDraftStore, type IndexedDbDraftStoreOptions } from './indexedDbDraftStore';
import { MemoryDraftStore } from './memoryDraftStore';

export interface CreateDraftStoreOptions extends IndexedDbDraftStoreOptions {
  disableIndexedDB?: boolean;
}

export function createDraftStore(options: CreateDraftStoreOptions = {}): DraftStore {
  const memory = new MemoryDraftStore(options);
  const factory = options.disableIndexedDB ? undefined : options.indexedDB ?? globalThis.indexedDB;
  if (!factory) return memory;

  const indexed = new IndexedDbDraftStore({ ...options, indexedDB: factory });
  return new ResilientDraftStore(indexed, memory);
}

export class ResilientDraftStore implements DraftStore {
  private useFallback = false;

  constructor(
    private readonly primary: DraftStore,
    private readonly fallback: MemoryDraftStore
  ) {}

  async save(input: DraftPhotoInput): Promise<DraftPhoto> {
    if (this.useFallback) return this.fallback.save(input);
    try {
      const draft = await this.primary.save(input);
      this.fallback.restore(draft);
      return draft;
    } catch {
      this.useFallback = true;
      return this.fallback.save(input);
    }
  }

  async get(sessionId: string, shotId: string): Promise<DraftPhoto | undefined> {
    if (this.useFallback) return this.fallback.get(sessionId, shotId);
    try {
      const draft = await this.primary.get(sessionId, shotId);
      if (!draft) return this.fallback.get(sessionId, shotId);
      this.fallback.restore(draft);
      return draft;
    } catch {
      this.useFallback = true;
      return this.fallback.get(sessionId, shotId);
    }
  }

  async list(sessionId: string): Promise<DraftPhoto[]> {
    if (this.useFallback) return this.fallback.list(sessionId);
    try {
      const drafts = await this.primary.list(sessionId);
      if (drafts.length === 0) return this.fallback.list(sessionId);
      for (const draft of drafts) this.fallback.restore(draft);
      return drafts;
    } catch {
      this.useFallback = true;
      return this.fallback.list(sessionId);
    }
  }

  async setUploadState(
    sessionId: string,
    shotId: string,
    status: DraftUploadState,
    uploadId?: string,
    assetId?: string,
    expectedIdempotencyKey?: string
  ): Promise<DraftPhoto | undefined> {
    if (this.useFallback) {
      return this.fallback.setUploadState(
        sessionId,
        shotId,
        status,
        uploadId,
        assetId,
        expectedIdempotencyKey
      );
    }
    try {
      const draft = await this.primary.setUploadState(
        sessionId,
        shotId,
        status,
        uploadId,
        assetId,
        expectedIdempotencyKey
      );
      if (draft) {
        this.fallback.restore(draft);
        return draft;
      }
      return this.fallback.setUploadState(
        sessionId,
        shotId,
        status,
        uploadId,
        assetId,
        expectedIdempotencyKey
      );
    } catch {
      this.useFallback = true;
      return this.fallback.setUploadState(
        sessionId,
        shotId,
        status,
        uploadId,
        assetId,
        expectedIdempotencyKey
      );
    }
  }

  async clearShot(
    sessionId: string,
    shotId: string,
    expectedIdempotencyKey?: string
  ): Promise<boolean> {
    let primaryCleared = false;
    try {
      primaryCleared = await this.primary.clearShot(
        sessionId,
        shotId,
        expectedIdempotencyKey
      );
    } catch {
      this.useFallback = true;
    }
    const fallbackCleared = await this.fallback.clearShot(
      sessionId,
      shotId,
      expectedIdempotencyKey
    );
    return primaryCleared || fallbackCleared;
  }

  async clearSession(sessionId: string): Promise<void> {
    try {
      await this.primary.clearSession(sessionId);
    } catch {
      this.useFallback = true;
    }
    await this.fallback.clearSession(sessionId);
  }
}
