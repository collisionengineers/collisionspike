import { useEffect, useMemo, useState } from 'react';
import type { CaptureShotProgress } from '@collisioncapture/contracts';
import type { CaptureSessionManifest } from '@collisioncapture/contracts';
import type { CaptureApi, CaptureAuthorization } from '../api/captureApi';
import { createDraftStore } from '../storage';
import {
  UploadCoordinator,
  type CaptureSessionUnavailable
} from './uploadCoordinator';

export interface UploadCoordinatorHandle {
  coordinator: UploadCoordinator;
  hasUnsettledDrafts: boolean;
  recoveryComplete: boolean;
}

export function useUploadCoordinator(
  api: CaptureApi,
  authorization: CaptureAuthorization,
  rulesVersion: string,
  onProgress: (progress: CaptureShotProgress) => void,
  onSessionUnavailable?: (failure: CaptureSessionUnavailable) => void,
  onManifest?: (manifest: CaptureSessionManifest) => void,
  hasUnsettledServerProgress = false
): UploadCoordinatorHandle {
  const store = useMemo(() => createDraftStore(), []);
  const [hasUnsettledDrafts, setHasUnsettledDrafts] = useState(false);
  const [recoveredCoordinator, setRecoveredCoordinator] = useState<UploadCoordinator | null>(null);
  const coordinator = useMemo(() => new UploadCoordinator({
    api,
    authorization,
    rulesVersion,
    store,
    isOnline: () => navigator.onLine,
    onProgress,
    onUnsettledChange: setHasUnsettledDrafts,
    ...(onManifest === undefined ? {} : { onManifest }),
    ...(onSessionUnavailable === undefined ? {} : { onSessionUnavailable })
  }), [
    api,
    authorization,
    rulesVersion,
    onProgress,
    onManifest,
    onSessionUnavailable,
    store
  ]);

  useEffect(() => {
    let active = true;
    const synchronize = (): void => {
      void coordinator.drain().then(() => coordinator.refreshManifest());
    };
    const synchronizeWhenVisible = (): void => {
      if (document.visibilityState === 'visible') synchronize();
    };

    void coordinator.recover()
      .then(() => coordinator.refreshManifest())
      .then(() => {
        if (active) setRecoveredCoordinator(coordinator);
      })
      .catch(() => {
        // Fail closed: submission stays disabled if local recovery cannot be inspected.
      });
    window.addEventListener('online', synchronize);
    window.addEventListener('focus', synchronize);
    document.addEventListener('visibilitychange', synchronizeWhenVisible);
    return () => {
      active = false;
      window.removeEventListener('online', synchronize);
      window.removeEventListener('focus', synchronize);
      document.removeEventListener('visibilitychange', synchronizeWhenVisible);
    };
  }, [coordinator]);

  useEffect(() => {
    if (!hasUnsettledServerProgress && !hasUnsettledDrafts) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (attempts >= 12) {
        window.clearInterval(timer);
        return;
      }
      if (!navigator.onLine || document.visibilityState !== 'visible') return;
      attempts += 1;
      void coordinator.refreshManifest();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [coordinator, hasUnsettledDrafts, hasUnsettledServerProgress]);

  return {
    coordinator,
    hasUnsettledDrafts,
    recoveryComplete: recoveredCoordinator === coordinator
  };
}
