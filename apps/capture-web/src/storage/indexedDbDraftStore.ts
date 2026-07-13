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
import { compareDrafts } from './memoryDraftStore';

const DEFAULT_DATABASE_NAME = 'collisioncapture-drafts';
const DATABASE_VERSION = 1;
const DRAFT_STORE = 'drafts';
const SESSION_INDEX = 'sessionId';

export interface IndexedDbDraftStoreOptions extends DraftStoreDependencies {
  indexedDB?: IDBFactory;
  databaseName?: string;
}

export class IndexedDbDraftStore implements DraftStore {
  private databasePromise: Promise<IDBDatabase> | undefined;
  private readonly factory: IDBFactory;
  private readonly databaseName: string;
  private readonly dependencies: DraftStoreDependencies;

  constructor(options: IndexedDbDraftStoreOptions = {}) {
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) throw new Error('IndexedDB is unavailable.');
    this.factory = factory;
    this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
    this.dependencies = {
      ...(options.crypto === undefined ? {} : { crypto: options.crypto }),
      ...(options.now === undefined ? {} : { now: options.now })
    };
  }

  async save(input: DraftPhotoInput): Promise<DraftPhoto> {
    const draft = await createDraftPhoto(input, this.dependencies);
    await this.put(draft);
    return cloneDraft(draft);
  }

  async get(sessionId: string, shotId: string): Promise<DraftPhoto | undefined> {
    assertDraftKey(sessionId, shotId);
    const database = await this.open();
    const transaction = database.transaction(DRAFT_STORE, 'readonly');
    const request = transaction.objectStore(DRAFT_STORE).get([sessionId, shotId]);
    const stored = await requestResult<DraftPhoto | undefined>(request);
    await transactionDone(transaction);
    if (!stored) return undefined;

    const draft = rehydrateDraft(stored);
    if (draft.status !== stored.status) await this.put(draft);
    return draft;
  }

  async list(sessionId: string): Promise<DraftPhoto[]> {
    if (sessionId.trim().length === 0) throw new Error('sessionId is required.');
    const database = await this.open();
    const transaction = database.transaction(DRAFT_STORE, 'readonly');
    const request = transaction.objectStore(DRAFT_STORE).index(SESSION_INDEX).getAll(sessionId);
    const stored = await requestResult<DraftPhoto[]>(request);
    await transactionDone(transaction);

    const rehydrated = stored.map(rehydrateDraft);
    const interrupted = rehydrated.filter((draft, index) => draft.status !== stored[index]?.status);
    if (interrupted.length > 0) await Promise.all(interrupted.map((draft) => this.put(draft)));
    return rehydrated.sort(compareDrafts);
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
    const database = await this.open();
    const transaction = database.transaction(DRAFT_STORE, 'readwrite');
    const store = transaction.objectStore(DRAFT_STORE);
    const stored = await requestResult<DraftPhoto | undefined>(store.get([sessionId, shotId]));
    if (!stored) {
      await transactionDone(transaction);
      return undefined;
    }
    if (expectedIdempotencyKey && stored.idempotencyKey !== expectedIdempotencyKey) {
      await transactionDone(transaction);
      return undefined;
    }

    const updated: DraftPhoto = {
      ...cloneDraft(stored),
      status,
      ...(uploadId === undefined ? {} : { uploadId }),
      ...(assetId === undefined ? {} : { assetId }),
      updatedAt: (this.dependencies.now ?? (() => new Date()))().toISOString()
    };
    store.put(cloneDraft(updated));
    await transactionDone(transaction);
    return cloneDraft(updated);
  }

  async clearShot(
    sessionId: string,
    shotId: string,
    expectedIdempotencyKey?: string
  ): Promise<boolean> {
    assertDraftKey(sessionId, shotId);
    const database = await this.open();
    const transaction = database.transaction(DRAFT_STORE, 'readwrite');
    const store = transaction.objectStore(DRAFT_STORE);
    const stored = await requestResult<DraftPhoto | undefined>(store.get([sessionId, shotId]));
    if (!stored || (expectedIdempotencyKey && stored.idempotencyKey !== expectedIdempotencyKey)) {
      await transactionDone(transaction);
      return false;
    }
    store.delete([sessionId, shotId]);
    await transactionDone(transaction);
    return true;
  }

  async clearSession(sessionId: string): Promise<void> {
    if (sessionId.trim().length === 0) throw new Error('sessionId is required.');
    const database = await this.open();
    const transaction = database.transaction(DRAFT_STORE, 'readwrite');
    const store = transaction.objectStore(DRAFT_STORE);
    const request = store.index(SESSION_INDEX).getAllKeys(sessionId);
    const keys = await requestResult<IDBValidKey[]>(request);
    for (const key of keys) store.delete(key);
    await transactionDone(transaction);
  }

  close(): void {
    if (!this.databasePromise) return;
    void this.databasePromise.then((database) => database.close());
    this.databasePromise = undefined;
  }

  private async put(draft: DraftPhoto): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(DRAFT_STORE, 'readwrite');
    transaction.objectStore(DRAFT_STORE).put(cloneDraft(draft));
    await transactionDone(transaction);
  }

  private open(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        let request: IDBOpenDBRequest;
        try {
          request = this.factory.open(this.databaseName, DATABASE_VERSION);
        } catch (error) {
          reject(error);
          return;
        }

        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(DRAFT_STORE)) {
            const store = database.createObjectStore(DRAFT_STORE, {
              keyPath: ['sessionId', 'shotId']
            });
            store.createIndex(SESSION_INDEX, 'sessionId', { unique: false });
          }
        };
        request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened.'));
        request.onblocked = () => reject(new Error('IndexedDB is blocked by another browser tab.'));
        request.onsuccess = () => resolve(request.result);
      });
    }
    return this.databasePromise;
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
  });
}
