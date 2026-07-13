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

class ResilientDraftStore implements DraftStore {
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
    uploadId?: string
  ): Promise<DraftPhoto | undefined> {
    if (this.useFallback) return this.fallback.setUploadState(sessionId, shotId, status, uploadId);
    try {
      const draft = await this.primary.setUploadState(sessionId, shotId, status, uploadId);
      if (draft) this.fallback.restore(draft);
      return draft;
    } catch {
      this.useFallback = true;
      return this.fallback.setUploadState(sessionId, shotId, status, uploadId);
    }
  }

  async clearShot(sessionId: string, shotId: string): Promise<void> {
    if (this.useFallback) return this.fallback.clearShot(sessionId, shotId);
    try {
      await this.primary.clearShot(sessionId, shotId);
    } catch {
      this.useFallback = true;
    }
    await this.fallback.clearShot(sessionId, shotId);
  }

  async clearSession(sessionId: string): Promise<void> {
    if (this.useFallback) return this.fallback.clearSession(sessionId);
    try {
      await this.primary.clearSession(sessionId);
    } catch {
      this.useFallback = true;
    }
    await this.fallback.clearSession(sessionId);
  }
}
