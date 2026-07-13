import { describe, expect, it, vi } from 'vitest';
import type { CaptureApi, CaptureAuthorization } from '../api/captureApi';
import {
  getOrCreateSubmitKey,
  submitStorageKey,
  type SubmitKeyStorage
} from './submitKeyStore';
import { submitCaptureSession } from './submitSession';

class MemoryStorage implements SubmitKeyStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const authorization: CaptureAuthorization = {
  sessionId: 'session-1',
  accessToken: 'must-not-be-persisted',
  accessTokenExpiresAt: '2026-07-14T12:00:00.000Z'
};

describe('submit session resilience', () => {
  it('reuses one non-secret key for a session across store consumers', () => {
    const storage = new MemoryStorage();
    const randomUUID = vi.fn(() => '00000000-0000-4000-8000-000000000001' as `${string}-${string}-${string}-${string}-${string}`);

    const first = getOrCreateSubmitKey('session-1', { storage, crypto: { randomUUID } });
    const reopened = getOrCreateSubmitKey('session-1', { storage, crypto: { randomUUID } });

    expect(reopened).toBe(first);
    expect(randomUUID).toHaveBeenCalledOnce();
    expect([...storage.values.values()]).toEqual([first]);
    expect(JSON.stringify([...storage.values])).not.toContain(authorization.accessToken);
  });

  it('retains the key after failure, reuses it for retry, and clears it after success', async () => {
    const storage = new MemoryStorage();
    const randomUUID = vi.fn(() => '00000000-0000-4000-8000-000000000002' as `${string}-${string}-${string}-${string}-${string}`);
    const submit = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 'complete', completedAt: '2026-07-13T12:00:00.000Z' });
    const api = { submit } as Pick<CaptureApi, 'submit'>;
    const dependencies = { storage, crypto: { randomUUID } };

    await expect(submitCaptureSession(api, authorization, dependencies)).rejects.toThrow('offline');
    const retained = storage.getItem(submitStorageKey(authorization.sessionId));
    expect(retained).toBeTruthy();

    await expect(submitCaptureSession(api, authorization, dependencies)).resolves.toMatchObject({
      status: 'complete'
    });

    expect(submit.mock.calls.map((call) => call[1])).toEqual([retained, retained]);
    expect(storage.getItem(submitStorageKey(authorization.sessionId))).toBeNull();
    expect(randomUUID).toHaveBeenCalledOnce();
  });
});
