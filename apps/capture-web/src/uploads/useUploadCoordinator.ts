import { useEffect, useMemo } from 'react';
import type { CaptureShotProgress } from '@collisioncapture/contracts';
import type { CaptureApi, CaptureAuthorization } from '../api/captureApi';
import { createDraftStore } from '../storage';
import { UploadCoordinator } from './uploadCoordinator';

export function useUploadCoordinator(
  api: CaptureApi,
  authorization: CaptureAuthorization,
  onProgress: (progress: CaptureShotProgress) => void
): UploadCoordinator {
  const store = useMemo(() => createDraftStore(), []);
  const coordinator = useMemo(() => new UploadCoordinator({
    api,
    authorization,
    store,
    isOnline: () => navigator.onLine,
    onProgress
  }), [api, authorization, onProgress, store]);

  useEffect(() => {
    const drain = (): void => {
      void coordinator.drain();
    };
    const drainWhenVisible = (): void => {
      if (document.visibilityState === 'visible') drain();
    };

    void coordinator.recover();
    window.addEventListener('online', drain);
    window.addEventListener('focus', drain);
    document.addEventListener('visibilitychange', drainWhenVisible);
    return () => {
      window.removeEventListener('online', drain);
      window.removeEventListener('focus', drain);
      document.removeEventListener('visibilitychange', drainWhenVisible);
    };
  }, [coordinator]);

  return coordinator;
}
