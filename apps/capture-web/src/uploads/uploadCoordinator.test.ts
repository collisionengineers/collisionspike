import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureApi, CaptureAuthorization } from '../api/captureApi';
import { MemoryDraftStore } from '../storage';
import { UploadCoordinator } from './uploadCoordinator';

const authorization: CaptureAuthorization = {
  sessionId: 'session-1',
  accessToken: 'ephemeral',
  accessTokenExpiresAt: '2026-07-13T12:00:00.000Z'
};

function fakeApi() {
  return {
    exchange: vi.fn(),
    getManifest: vi.fn(),
    createUpload: vi.fn().mockResolvedValue({
      uploadId: 'upload-1',
      assetId: 'asset-1',
      method: 'mock',
      expiresAt: '2026-07-13T12:00:00.000Z'
    }),
    uploadFile: vi.fn().mockResolvedValue(undefined),
    completeUpload: vi.fn().mockResolvedValue({
      assetId: 'asset-1',
      shotId: 'overview',
      status: 'accepted'
    }),
    submit: vi.fn()
  } satisfies CaptureApi;
}

describe('UploadCoordinator', () => {
  beforeEach(() => vi.stubGlobal('crypto', webcrypto));

  it('keeps an offline photo queued with a stable hash and idempotency key', async () => {
    const api = fakeApi();
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    const onProgress = vi.fn();
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => false,
      onProgress
    });

    await coordinator.queue({
      shotId: 'overview',
      file: new File(['photo'], 'overview.jpg', { type: 'image/jpeg' })
    });

    const draft = await store.get('session-1', 'overview');
    expect(draft).toMatchObject({ status: 'queued', shotId: 'overview' });
    expect(draft?.sha256).toHaveLength(64);
    expect(draft?.idempotencyKey).toBeTruthy();
    expect(api.createUpload).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'queued' }));
  });

  it('drains on reconnect and clears an accepted local blob', async () => {
    const api = fakeApi();
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    let online = false;
    const onProgress = vi.fn();
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => online,
      onProgress
    });
    await coordinator.queue({
      shotId: 'overview',
      file: new File(['photo'], 'overview.jpg', { type: 'image/jpeg' })
    });
    const queued = await store.get('session-1', 'overview');

    online = true;
    await coordinator.drain();

    expect(api.createUpload).toHaveBeenCalledWith(authorization, expect.objectContaining({
      idempotencyKey: queued?.idempotencyKey,
      sha256: queued?.sha256
    }));
    expect(api.uploadFile).toHaveBeenCalledOnce();
    expect(await store.get('session-1', 'overview')).toBeUndefined();
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'accepted',
      assetId: 'asset-1'
    }));
  });

  it('rehydrates offline queued progress without attempting a network request', async () => {
    const api = fakeApi();
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    await store.save({
      sessionId: 'session-1',
      shotId: 'overview',
      blob: new Blob(['saved'], { type: 'image/jpeg' }),
      fileName: 'overview.jpg'
    });
    const onProgress = vi.fn();
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => false,
      onProgress
    });

    await coordinator.recover();
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      shotId: 'overview',
      status: 'queued'
    }));
    expect(api.createUpload).not.toHaveBeenCalled();
  });

  it('returns a failed upload to the queue without changing its idempotency key', async () => {
    const api = fakeApi();
    api.uploadFile.mockRejectedValueOnce(new Error('network'));
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    const onProgress = vi.fn();
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => true,
      onProgress
    });
    await coordinator.queue({
      shotId: 'overview',
      file: new File(['photo'], 'overview.jpg', { type: 'image/jpeg' })
    });

    const failed = await store.get('session-1', 'overview');
    expect(failed?.status).toBe('queued');
    expect(api.createUpload.mock.calls[0]?.[1].idempotencyKey).toBe(failed?.idempotencyKey);
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'retryable' }));
  });

  it('does not publish transient replacement states over an accepted selection', async () => {
    const api = fakeApi();
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    const onProgress = vi.fn();
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => true,
      onProgress
    });

    await coordinator.queue({
      shotId: 'overview',
      file: new File(['replacement'], 'replacement.jpg', { type: 'image/jpeg' }),
      replacesSelected: true
    });

    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }));
  });

  it('coalesces concurrent drains so one draft uploads once', async () => {
    const api = fakeApi();
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    let online = false;
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => online,
      onProgress: vi.fn()
    });
    await coordinator.queue({
      shotId: 'overview',
      file: new File(['photo'], 'overview.jpg', { type: 'image/jpeg' })
    });
    online = true;

    await Promise.all([coordinator.drain(), coordinator.drain(), coordinator.drain()]);
    expect(api.createUpload).toHaveBeenCalledOnce();
  });
});
