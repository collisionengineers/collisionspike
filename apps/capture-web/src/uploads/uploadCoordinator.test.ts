import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockManifest } from '@cs/capture-core';
import type { CaptureApi, CaptureAuthorization } from '../api/captureApi';
import { CaptureApiProblem, type CaptureProblemCode } from '../api/problem';
import { MemoryDraftStore } from '../storage';
import {
  UNSUPPORTED_CAPTURE_FORMAT_MESSAGE,
  UploadCoordinator,
  UploadCoordinatorError
} from './uploadCoordinator';

const authorization: CaptureAuthorization = {
  sessionId: 'session-1',
  accessToken: 'ephemeral',
  accessTokenExpiresAt: '2026-07-13T12:00:00.000Z'
};

function fakeApi() {
  return {
    exchange: vi.fn(),
    renew: vi.fn(),
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

  it('rejects an unsupported file before it enters persistent retry state', async () => {
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

    await expect(coordinator.queue({
      shotId: 'overview',
      file: new File(['photo'], 'overview.heic', { type: 'image/heic' })
    })).rejects.toEqual(expect.objectContaining<Partial<UploadCoordinatorError>>({
      code: 'unsupported-format',
      message: UNSUPPORTED_CAPTURE_FORMAT_MESSAGE
    }));

    expect(await store.get('session-1', 'overview')).toBeUndefined();
    expect(api.createUpload).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('discards a legacy unsupported draft and reports a safe rejection once', async () => {
    const api = fakeApi();
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    await store.save({
      sessionId: 'session-1',
      shotId: 'overview',
      blob: new Blob(['legacy'], { type: 'image/heic' }),
      fileName: 'legacy.heic'
    });
    const onProgress = vi.fn();
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => true,
      onProgress
    });

    await coordinator.recover();

    expect(await store.get('session-1', 'overview')).toBeUndefined();
    expect(api.createUpload).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith({
      shotId: 'overview',
      status: 'rejected',
      fileName: 'legacy.heic',
      rejectionReason: UNSUPPORTED_CAPTURE_FORMAT_MESSAGE
    });
  });

  it('silently discards an unsupported replacement without overwriting an accepted shot', async () => {
    const api = fakeApi();
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    await store.save({
      sessionId: 'session-1',
      shotId: 'overview',
      blob: new Blob(['legacy'], { type: 'image/heic' }),
      fileName: 'legacy.heic',
      replacesSelected: true
    });
    const onProgress = vi.fn();
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => true,
      onProgress
    });

    await coordinator.recover();

    expect(await store.get('session-1', 'overview')).toBeUndefined();
    expect(api.createUpload).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
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

    expect(api.createUpload).toHaveBeenCalledWith(
      authorization,
      queued?.idempotencyKey,
      expect.objectContaining({
        sha256: queued?.sha256,
        clientObservation: {
          route: 'os_fallback',
          disposition: 'unassessed',
          stableFrames: 0,
          rulesVersion: 'quality-v1'
        }
      })
    );
    expect(api.createUpload.mock.calls[0]?.[2]).not.toHaveProperty('idempotencyKey');
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
    expect(api.createUpload.mock.calls[0]?.[1]).toBe(failed?.idempotencyKey);
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'retryable' }));
  });

  it('keeps a direct-upload SAS failure retryable without closing the capture session', async () => {
    const api = fakeApi();
    api.uploadFile.mockRejectedValueOnce(
      new CaptureApiProblem('capture_retryable', 'The upload permission expired. Try again.', 403)
    );
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    const onSessionUnavailable = vi.fn();
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => true,
      onProgress: vi.fn(),
      onSessionUnavailable
    });

    await coordinator.queue({
      shotId: 'overview',
      file: new File(['photo'], 'overview.jpg', { type: 'image/jpeg' })
    });

    expect(await store.get('session-1', 'overview')).toMatchObject({ status: 'queued' });
    expect(onSessionUnavailable).not.toHaveBeenCalled();
  });

  it.each([
    ['capture_validation', 'validation', 422, 'This photo could not be read safely. Take it again.'],
    ['capture_unsupported', 'unsupported', 415, 'Use a JPG, PNG or WebP photo.']
  ] as const)(
    'clears a terminal %s attempt and returns actionable feedback to the caller',
    async (problemCode, coordinatorCode, status, message) => {
      const api = fakeApi();
      api.createUpload.mockRejectedValueOnce(
        new CaptureApiProblem(problemCode, message, status)
      );
      const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
      const coordinator = new UploadCoordinator({
        api,
        authorization,
        store,
        isOnline: () => true,
        onProgress: vi.fn()
      });

      await expect(coordinator.queue({
        shotId: 'overview',
        file: new File(['bad-photo'], 'overview.jpg', { type: 'image/jpeg' })
      })).rejects.toMatchObject({ code: coordinatorCode, message });

      expect(await store.get('session-1', 'overview')).toBeUndefined();
      expect(api.createUpload).toHaveBeenCalledOnce();
    }
  );

  it('reports a recovered server-rejected draft once and removes it from retry state', async () => {
    const api = fakeApi();
    api.completeUpload.mockRejectedValueOnce(
      new CaptureApiProblem(
        'capture_validation',
        'This photo is damaged. Take it again.',
        422
      )
    );
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    await store.save({
      sessionId: 'session-1',
      shotId: 'overview',
      blob: new Blob(['bad-photo'], { type: 'image/jpeg' }),
      fileName: 'overview.jpg'
    });
    const onProgress = vi.fn();
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => true,
      onProgress
    });

    await coordinator.recover();

    expect(await store.get('session-1', 'overview')).toBeUndefined();
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'rejected',
      rejectionReason: 'This photo is damaged. Take it again.'
    }));
  });

  it('keeps an accepted selection when its replacement fails server validation', async () => {
    const api = fakeApi();
    api.completeUpload.mockRejectedValueOnce(
      new CaptureApiProblem('capture_validation', 'Take this photo again.', 422)
    );
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    const onProgress = vi.fn();
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => true,
      onProgress
    });

    await expect(coordinator.queue({
      shotId: 'overview',
      file: new File(['replacement'], 'replacement.jpg', { type: 'image/jpeg' }),
      replacesSelected: true
    })).rejects.toMatchObject({
      code: 'validation',
      message: 'Take this photo again.'
    });

    expect(await store.get('session-1', 'overview')).toBeUndefined();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it.each([
    ['capture_expired', 410, 'expired'],
    ['capture_revoked', 410, 'revoked'],
    ['capture_locked', 423, 'locked'],
    ['capture_unauthorized', 401, 'unavailable'],
    ['capture_missing', 404, 'unavailable']
  ] as const)(
    'halts after %s, retains the draft, and notifies the app once',
    async (code, status, unavailableStatus) => {
      const api = fakeApi();
      const message = `Safe ${code} message.`;
      api.createUpload.mockRejectedValueOnce(
        new CaptureApiProblem(code as CaptureProblemCode, message, status)
      );
      const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
      const onSessionUnavailable = vi.fn();
      const coordinator = new UploadCoordinator({
        api,
        authorization,
        store,
        isOnline: () => true,
        onProgress: vi.fn(),
        onSessionUnavailable
      });

      await expect(coordinator.queue({
        shotId: 'overview',
        file: new File(['photo'], 'overview.jpg', { type: 'image/jpeg' })
      })).rejects.toMatchObject({ code: 'session-unavailable', message });

      expect(await store.get('session-1', 'overview')).toMatchObject({ status: 'queued' });
      expect(onSessionUnavailable).toHaveBeenCalledOnce();
      expect(onSessionUnavailable).toHaveBeenCalledWith({
        status: unavailableStatus,
        code,
        message
      });

      await coordinator.drain();
      expect(api.createUpload).toHaveBeenCalledOnce();
      expect(onSessionUnavailable).toHaveBeenCalledOnce();
    }
  );

  it('stops one drain at the first unavailable response and retains later drafts untouched', async () => {
    const api = fakeApi();
    api.createUpload.mockRejectedValueOnce(
      new CaptureApiProblem('capture_expired', 'This link expired.', 410)
    );
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    await store.save({
      sessionId: 'session-1',
      shotId: 'overview',
      blob: new Blob(['overview'], { type: 'image/jpeg' }),
      fileName: 'overview.jpg',
      capturedAt: '2026-07-13T10:00:00.000Z'
    });
    await store.save({
      sessionId: 'session-1',
      shotId: 'damage-closeup',
      blob: new Blob(['damage'], { type: 'image/jpeg' }),
      fileName: 'damage.jpg',
      capturedAt: '2026-07-13T10:01:00.000Z'
    });
    const onSessionUnavailable = vi.fn();
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => true,
      onProgress: vi.fn(),
      onSessionUnavailable
    });

    await coordinator.recover();

    expect(api.createUpload).toHaveBeenCalledOnce();
    expect(onSessionUnavailable).toHaveBeenCalledOnce();
    expect(await store.get('session-1', 'overview')).toMatchObject({ status: 'queued' });
    expect(await store.get('session-1', 'damage-closeup')).toMatchObject({ status: 'queued' });
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

  it('resumes completion for a persisted uploaded asset without sending its bytes again', async () => {
    const api = fakeApi();
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    const saved = await store.save({
      sessionId: 'session-1',
      shotId: 'overview',
      blob: new Blob(['already-uploaded'], { type: 'image/jpeg' }),
      fileName: 'overview.jpg'
    });
    await store.setUploadState(
      'session-1',
      'overview',
      'uploaded',
      'upload-1',
      'asset-1',
      saved.idempotencyKey
    );
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => true,
      onProgress: vi.fn()
    });

    await coordinator.recover();

    expect(api.createUpload).not.toHaveBeenCalled();
    expect(api.uploadFile).not.toHaveBeenCalled();
    expect(api.completeUpload).toHaveBeenCalledWith(
      authorization,
      'asset-1',
      { sizeBytes: saved.sizeBytes, sha256: saved.sha256 }
    );
    expect(await store.get('session-1', 'overview')).toBeUndefined();
  });

  it('accepts authoritative final progress after a lost-response conflict', async () => {
    const api = fakeApi();
    api.completeUpload.mockRejectedValueOnce(
      new CaptureApiProblem('capture_conflict', 'Another upload was selected.', 409)
    );
    api.getManifest.mockResolvedValueOnce({
      ...createMockManifest(),
      sessionId: 'session-1',
      progress: [{ shotId: 'overview', status: 'accepted', assetId: 'asset-server' }]
    });
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    const saved = await store.save({
      sessionId: 'session-1',
      shotId: 'overview',
      blob: new Blob(['replacement'], { type: 'image/jpeg' }),
      fileName: 'replacement.jpg',
      replacesSelected: true
    });
    await store.setUploadState(
      'session-1',
      'overview',
      'uploaded',
      'upload-local',
      'asset-local',
      saved.idempotencyKey
    );
    const onProgress = vi.fn();
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => true,
      onProgress
    });

    await coordinator.recover();

    expect(await store.get('session-1', 'overview')).toBeUndefined();
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      shotId: 'overview',
      status: 'accepted',
      assetId: 'asset-server'
    }));
  });

  it('lets authoritative selected progress clear a stale non-replacement draft', async () => {
    const api = fakeApi();
    api.getManifest.mockResolvedValueOnce({
      ...createMockManifest(),
      sessionId: 'session-1',
      progress: [{ shotId: 'overview', status: 'pending_review', assetId: 'asset-server' }]
    });
    const store = new MemoryDraftStore({ crypto: webcrypto as unknown as Crypto });
    await store.save({
      sessionId: 'session-1',
      shotId: 'overview',
      blob: new Blob(['stale-local'], { type: 'image/jpeg' }),
      fileName: 'stale.jpg'
    });
    const onProgress = vi.fn();
    const coordinator = new UploadCoordinator({
      api,
      authorization,
      store,
      isOnline: () => true,
      onProgress
    });

    await coordinator.refreshManifest();

    expect(await store.get('session-1', 'overview')).toBeUndefined();
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'pending_review',
      assetId: 'asset-server'
    }));
    expect(onProgress).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'queued' }));
  });
});
