import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createDraftStore } from './createDraftStore';
import type { DraftPhotoInput } from './draftStore';
import { IndexedDbDraftStore } from './indexedDbDraftStore';
import { MemoryDraftStore } from './memoryDraftStore';

const cryptoProvider = webcrypto as unknown as Crypto;

function draftInput(
  sessionId: string,
  shotId: string,
  contents = `${sessionId}:${shotId}`,
  capturedAt?: string
): DraftPhotoInput {
  return {
    sessionId,
    shotId,
    blob: new NodeBlob([contents], { type: 'image/jpeg' }) as unknown as Blob,
    fileName: `${shotId}.jpg`,
    ...(capturedAt === undefined ? {} : { capturedAt })
  };
}

function indexedStore(factory = new IDBFactory(), databaseName = cryptoProvider.randomUUID()): IndexedDbDraftStore {
  return new IndexedDbDraftStore({
    indexedDB: factory,
    databaseName,
    crypto: cryptoProvider,
    now: () => new Date('2026-07-13T10:00:00.000Z')
  });
}

async function blobText(blob: Blob): Promise<string> {
  return (blob as Blob & { text(): Promise<string> }).text();
}

describe('IndexedDbDraftStore', () => {
  it('persists an image blob with deterministic SHA-256 and stable idempotency metadata', async () => {
    const store = indexedStore();
    const saved = await store.save(draftInput('session-a', 'overview', 'hello'));

    expect(saved).toMatchObject({
      sessionId: 'session-a',
      shotId: 'overview',
      fileName: 'overview.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 5,
      sha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      status: 'queued',
      capturedAt: '2026-07-13T10:00:00.000Z',
      updatedAt: '2026-07-13T10:00:00.000Z'
    });
    expect(saved.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);

    const restored = await store.get('session-a', 'overview');
    expect(restored?.idempotencyKey).toBe(saved.idempotencyKey);
    expect(restored?.sha256).toBe(saved.sha256);
    expect(restored && await blobText(restored.blob)).toBe('hello');
    store.close();
  });

  it('keys drafts by session and shot, replacing only the matching photo', async () => {
    const store = indexedStore();
    const first = await store.save(draftInput('session-a', 'overview', 'old'));
    await store.save(draftInput('session-a', 'damage', 'damage'));
    await store.save(draftInput('session-b', 'overview', 'other session'));
    const replacement = await store.save(draftInput('session-a', 'overview', 'new'));

    expect(replacement.idempotencyKey).not.toBe(first.idempotencyKey);
    const restored = await store.get('session-a', 'overview');
    expect(restored && await blobText(restored.blob)).toBe('new');
    expect((await store.list('session-a')).map((draft) => draft.shotId)).toEqual(['damage', 'overview']);
    expect((await store.list('session-b')).map((draft) => draft.shotId)).toEqual(['overview']);
    store.close();
  });

  it('rehydrates an interrupted upload as queued and persists the recovery state', async () => {
    const factory = new IDBFactory();
    const databaseName = cryptoProvider.randomUUID();
    const firstStore = indexedStore(factory, databaseName);
    await firstStore.save(draftInput('session-a', 'overview'));
    await firstStore.setUploadState('session-a', 'overview', 'uploading', 'upload-123');
    firstStore.close();

    const reopenedStore = indexedStore(factory, databaseName);
    const recovered = await reopenedStore.get('session-a', 'overview');
    expect(recovered).toMatchObject({ status: 'queued', uploadId: 'upload-123' });
    reopenedStore.close();

    const openedAgain = indexedStore(factory, databaseName);
    expect(await openedAgain.get('session-a', 'overview')).toMatchObject({
      status: 'queued',
      uploadId: 'upload-123'
    });
    openedAgain.close();
  });

  it('rehydrates every interrupted upload when a session draft list is restored', async () => {
    const factory = new IDBFactory();
    const databaseName = cryptoProvider.randomUUID();
    const firstStore = indexedStore(factory, databaseName);
    await firstStore.save(draftInput('session-a', 'overview'));
    await firstStore.save(draftInput('session-a', 'damage'));
    await firstStore.setUploadState('session-a', 'overview', 'uploading', 'upload-overview');
    await firstStore.setUploadState('session-a', 'damage', 'uploading', 'upload-damage');
    firstStore.close();

    const reopenedStore = indexedStore(factory, databaseName);
    expect((await reopenedStore.list('session-a')).map(({ status, uploadId }) => ({ status, uploadId })))
      .toEqual([
        { status: 'queued', uploadId: 'upload-damage' },
        { status: 'queued', uploadId: 'upload-overview' }
      ]);
    reopenedStore.close();
  });

  it('keeps completed drafts marked uploaded so they are not treated as retryable', async () => {
    const factory = new IDBFactory();
    const databaseName = cryptoProvider.randomUUID();
    const firstStore = indexedStore(factory, databaseName);
    const saved = await firstStore.save(draftInput('session-a', 'overview'));
    await firstStore.setUploadState('session-a', 'overview', 'uploaded', 'upload-complete');
    firstStore.close();

    const reopenedStore = indexedStore(factory, databaseName);
    const completed = await reopenedStore.get('session-a', 'overview');
    expect(completed).toMatchObject({
      status: 'uploaded',
      uploadId: 'upload-complete',
      idempotencyKey: saved.idempotencyKey
    });
    reopenedStore.close();
  });

  it('clears one shot or a whole session without affecting other sessions', async () => {
    const store = indexedStore();
    await store.save(draftInput('session-a', 'overview'));
    await store.save(draftInput('session-a', 'damage'));
    await store.save(draftInput('session-b', 'overview'));

    await store.clearShot('session-a', 'overview');
    expect(await store.get('session-a', 'overview')).toBeUndefined();
    expect(await store.get('session-a', 'damage')).toBeDefined();

    await store.clearSession('session-a');
    expect(await store.list('session-a')).toEqual([]);
    expect(await store.get('session-b', 'overview')).toBeDefined();
    store.close();
  });

  it('sorts session drafts deterministically by capture time and shot id', async () => {
    const store = indexedStore();
    await store.save(draftInput('session-a', 'z-shot', 'z', '2026-07-13T10:02:00.000Z'));
    await store.save(draftInput('session-a', 'b-shot', 'b', '2026-07-13T10:01:00.000Z'));
    await store.save(draftInput('session-a', 'a-shot', 'a', '2026-07-13T10:01:00.000Z'));

    expect((await store.list('session-a')).map((draft) => draft.shotId)).toEqual([
      'a-shot',
      'b-shot',
      'z-shot'
    ]);
    store.close();
  });

  it('whitelists the persisted fields and never stores an over-wide token property', async () => {
    const store = indexedStore();
    const overWideInput = {
      ...draftInput('session-a', 'overview'),
      token: 'must-not-be-persisted',
      caseId: 'must-not-be-persisted'
    } as DraftPhotoInput;

    const saved = await store.save(overWideInput);
    const restored = await store.get('session-a', 'overview');
    expect(saved).not.toHaveProperty('token');
    expect(saved).not.toHaveProperty('caseId');
    expect(restored).not.toHaveProperty('token');
    expect(restored).not.toHaveProperty('caseId');
    store.close();
  });

  it('validates composite keys and leaves missing drafts unchanged', async () => {
    const store = indexedStore();
    await expect(store.save(draftInput('', 'overview'))).rejects.toThrow('sessionId is required');
    await expect(store.save(draftInput('session-a', ''))).rejects.toThrow('shotId is required');
    await expect(store.setUploadState('session-a', 'missing', 'uploading')).resolves.toBeUndefined();
    store.close();
  });
});

describe('memory fallback', () => {
  it('uses the in-memory store when IndexedDB is unavailable', async () => {
    const store = createDraftStore({
      disableIndexedDB: true,
      crypto: cryptoProvider,
      now: () => new Date('2026-07-13T10:00:00.000Z')
    });
    await store.save(draftInput('session-a', 'overview'));
    await store.setUploadState('session-a', 'overview', 'uploading', 'upload-123');

    expect(await store.get('session-a', 'overview')).toMatchObject({
      status: 'queued',
      uploadId: 'upload-123'
    });
  });

  it('falls back at runtime when opening IndexedDB fails', async () => {
    const brokenFactory = {
      open: () => {
        throw new Error('storage disabled');
      }
    } as unknown as IDBFactory;
    const store = createDraftStore({
      indexedDB: brokenFactory,
      crypto: cryptoProvider,
      now: () => new Date('2026-07-13T10:00:00.000Z')
    });

    const saved = await store.save(draftInput('session-a', 'overview'));
    expect(saved.status).toBe('queued');
    expect(await store.get('session-a', 'overview')).toMatchObject({
      sha256: saved.sha256,
      idempotencyKey: saved.idempotencyKey
    });
  });

  it('returns copies so caller mutation cannot corrupt in-memory recovery state', async () => {
    const store = new MemoryDraftStore({ crypto: cryptoProvider });
    const saved = await store.save(draftInput('session-a', 'overview'));
    saved.status = 'uploaded';

    expect(await store.get('session-a', 'overview')).toMatchObject({ status: 'queued' });
  });
});
