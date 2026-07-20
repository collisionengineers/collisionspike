import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { CaptureSessionManifest, CaptureShotProgress } from '@collisioncapture/contracts';
import { completionCounts, orderedShots, requiredShotsComplete } from '@collisioncapture/core';
import { Camera, CheckCircle2, CircleAlert, CloudUpload, RotateCw, ShieldCheck, WifiOff } from 'lucide-react';
import { MockCaptureApi } from '../api/mockCaptureApi';
import type { CaptureApi, CaptureAuthorization } from '../api/captureApi';
import { HttpCaptureApi } from '../api/httpCaptureApi';
import { authorizeCapture } from '../bootstrap/bootstrapSecret';
import { ShotCaptureCard } from '../capture/ShotCaptureCard';
import { submitCaptureSession } from '../submission/submitSession';
import { useUploadCoordinator } from '../uploads/useUploadCoordinator';
import type { CaptureSessionUnavailable } from '../uploads/uploadCoordinator';
import { VehicleGuide } from '../ui/VehicleGuide';
import ceLogo from '../assets/ce-logo.png';

type LoadState =
  | { status: 'loading' }
  | {
      status: 'ready';
      manifest: CaptureSessionManifest;
      authorization: CaptureAuthorization;
    }
  | { status: 'error'; message: string };

export function CaptureApp(): ReactElement {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [online, setOnline] = useState(() => navigator.onLine);
  const api = useMemo<CaptureApi>(() => {
    const explicitDemo = new URLSearchParams(window.location.hash.slice(1)).get('capture') === 'demo';
    return import.meta.env.DEV && explicitDemo ? new MockCaptureApi() : new HttpCaptureApi();
  }, []);

  useEffect(() => {
    void authorizeCapture(api, window.location, window.history, import.meta.env.DEV)
      .then(async (exchange) => {
        const authorization: CaptureAuthorization = exchange;
        const manifest = await api.getManifest(authorization);
        setLoadState({ status: 'ready', manifest, authorization });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'This link cannot be opened.';
        setLoadState({ status: 'error', message });
      });
  }, [api]);

  useEffect(() => {
    const updateOnline = (): void => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const updateProgress = useCallback((progress: CaptureShotProgress): void => {
    setLoadState((current) => {
      if (current.status !== 'ready') return current;
      const next = current.manifest.progress.filter((item) => item.shotId !== progress.shotId);
      return {
        status: 'ready',
        authorization: current.authorization,
        manifest: {
          ...current.manifest,
          progress: [...next, progress]
        }
      };
    });
  }, []);

  const markSessionUnavailable = useCallback((failure: CaptureSessionUnavailable): void => {
    setLoadState((current) => {
      if (current.status !== 'ready') return current;
      if (failure.status === 'unavailable') {
        return { status: 'error', message: failure.message };
      }
      return {
        status: 'ready',
        authorization: current.authorization,
        manifest: {
          ...current.manifest,
          status: failure.status
        }
      };
    });
  }, []);

  const replaceManifest = useCallback((manifest: CaptureSessionManifest): void => {
    setLoadState((current) => {
      if (current.status !== 'ready' || manifest.sessionId !== current.manifest.sessionId) {
        return current;
      }
      return {
        status: 'ready',
        authorization: current.authorization,
        manifest
      };
    });
  }, []);

  const submit = async (): Promise<void> => {
    if (loadState.status !== 'ready') return;
    await submitCaptureSession(api, loadState.authorization);
    setLoadState({
      status: 'ready',
      authorization: loadState.authorization,
      manifest: {
        ...loadState.manifest,
        status: 'complete'
      }
    });
  };

  if (loadState.status === 'loading') {
    return (
      <main className="shell centered">
        <RotateCw aria-hidden="true" className="spin" />
        <p>Opening capture link...</p>
      </main>
    );
  }

  if (loadState.status === 'error') {
    return (
      <main className="shell centered">
        <CircleAlert aria-hidden="true" />
        <h1>Link unavailable</h1>
        <p>{loadState.message}</p>
      </main>
    );
  }

  return (
    <CaptureFlow
      manifest={loadState.manifest}
      api={api}
      authorization={loadState.authorization}
      online={online}
      onProgress={updateProgress}
      onSessionUnavailable={markSessionUnavailable}
      onManifest={replaceManifest}
      onSubmit={submit}
    />
  );
}

interface CaptureFlowProps {
  api: CaptureApi;
  authorization: CaptureAuthorization;
  manifest: CaptureSessionManifest;
  online: boolean;
  onProgress: (progress: CaptureShotProgress) => void;
  onSessionUnavailable?: (failure: CaptureSessionUnavailable) => void;
  onManifest?: (manifest: CaptureSessionManifest) => void;
  onSubmit: () => Promise<void>;
}

type SubmitState = 'idle' | 'submitting' | 'error';

export function CaptureFlow({
  api,
  authorization,
  manifest,
  online,
  onProgress,
  onSessionUnavailable,
  onManifest,
  onSubmit
}: CaptureFlowProps): ReactElement {
  const shots = useMemo(() => orderedShots(manifest.shots), [manifest.shots]);
  const hasUnsettledServerProgress = manifest.progress.some((progress) =>
    progress.status === 'queued' ||
    progress.status === 'uploading' ||
    progress.status === 'validating' ||
    progress.status === 'retryable'
  );
  const { coordinator, hasUnsettledDrafts, recoveryComplete } = useUploadCoordinator(
    api,
    authorization,
    manifest.rulesVersion,
    onProgress,
    onSessionUnavailable,
    onManifest,
    hasUnsettledServerProgress
  );
  const submitInFlight = useRef(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const counts = completionCounts(manifest);
  const canSubmit = requiredShotsComplete(manifest) &&
    manifest.status === 'open' &&
    recoveryComplete &&
    !hasUnsettledDrafts &&
    !hasUnsettledServerProgress;

  const progressPercent = counts.requiredTotal > 0
    ? Math.round((counts.requiredDone / counts.requiredTotal) * 100)
    : 100;
  const isComplete = manifest.status === 'complete';
  const isSubmitting = submitState === 'submitting';
  const submitAndClear = async (): Promise<void> => {
    if (submitInFlight.current || !canSubmit) return;
    submitInFlight.current = true;
    setSubmitState('submitting');

    try {
      await onSubmit();
    } catch (error: unknown) {
      const handled = await coordinator.handleApiFailure(error);
      setSubmitState(handled ? 'idle' : 'error');
      submitInFlight.current = false;
      return;
    }

    // Drafts are intentionally retained until the server confirms submission.
    // Cleanup is best effort because a local storage failure must not misreport
    // a successful send as failed.
    try {
      await coordinator.clearSession();
    } catch {
      // A later visit can safely clean up the retained local drafts.
    }
    setSubmitState('idle');
    submitInFlight.current = false;
  };

  const footerMessage = captureFooterMessage(
    manifest.status,
    canSubmit,
    counts.requiredTotal - counts.requiredDone,
    submitState
  );

  return (
    <main className="shell">
      <header className="topbar" aria-label="Capture summary">
        <div className="brand-case-lockup">
          <img className="ce-logo" src={ceLogo} alt="Collision Engineers" />
          <div className="case-lockup">
            <span className="case-label">Vehicle photos</span>
            <h1>{manifest.registration ?? 'Registration needed'}</h1>
            <p>{[manifest.vehicleLabel, manifest.caseReference].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="status-stack">
          <span className={online ? 'pill ok' : 'pill warn'}>
            {online ? <CloudUpload aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
            {online ? 'Ready to upload' : 'Waiting for signal'}
          </span>
          <span className="pill neutral">
            <ShieldCheck aria-hidden="true" />
            Private link
          </span>
        </div>
      </header>

      <section className="capture-board" aria-label="Photo capture">
        <div className="guide-panel">
          <VehicleGuide activePercent={progressPercent} />
          <div className="progress-copy">
            <span className="eyebrow">Required photos</span>
            <strong>{counts.requiredDone} of {counts.requiredTotal} complete</strong>
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </div>

        <div className="shot-list">
          {shots.map((shot) => (
            <ShotCaptureCard
              key={shot.id}
              manifest={manifest}
              shot={shot}
              progress={manifest.progress.find((item) => item.shotId === shot.id)}
              onProgress={onProgress}
              onPhoto={(file, replacesSelected, clientObservation) => coordinator.queue({
                shotId: shot.id,
                file,
                replacesSelected,
                clientObservation
              })}
            />
          ))}
        </div>
      </section>

      <footer className="submit-bar">
        <div>
          <span className="eyebrow">Send to Collision Engineers</span>
          <p
            className={submitState === 'error' ? 'submit-message error' : 'submit-message'}
            role={submitState === 'error' ? 'alert' : 'status'}
            aria-live={submitState === 'error' ? 'assertive' : 'polite'}
          >
            {footerMessage}
          </p>
        </div>
        <button
          className="primary-action"
          disabled={!canSubmit || isSubmitting}
          aria-busy={isSubmitting}
          onClick={() => void submitAndClear()}
        >
          {isComplete
            ? <CheckCircle2 aria-hidden="true" />
            : isSubmitting
              ? <RotateCw aria-hidden="true" className="spin" />
              : manifest.status === 'open'
                ? <Camera aria-hidden="true" />
                : <CircleAlert aria-hidden="true" />}
          {submitButtonLabel(manifest.status, submitState)}
        </button>
      </footer>
    </main>
  );
}

export function captureFooterMessage(
  status: CaptureSessionManifest['status'],
  canSubmit: boolean,
  remainingRequired: number,
  submitState: SubmitState
): string {
  if (status === 'complete') return 'Photos received.';
  if (status === 'expired') return 'This link has expired. Ask Collision Engineers for a new link.';
  if (status === 'revoked') return 'This link is no longer active. Ask Collision Engineers for a new link.';
  if (status === 'locked') return 'This link has been paused. Contact Collision Engineers for help.';
  if (submitState === 'submitting') return 'Sending photos securely…';
  if (submitState === 'error') return 'Photos were not sent. They are still saved. Check your connection and try again.';
  if (canSubmit) return 'Required photos are ready.';

  const remaining = Math.max(0, remainingRequired);
  if (remaining === 0) return 'Photo checks are still finishing.';
  return `${remaining} required ${remaining === 1 ? 'photo' : 'photos'} still needed.`;
}

function submitButtonLabel(
  status: CaptureSessionManifest['status'],
  submitState: SubmitState
): string {
  if (status === 'complete') return 'Sent';
  if (status !== 'open') return 'Link unavailable';
  if (submitState === 'submitting') return 'Sending…';
  if (submitState === 'error') return 'Try sending again';
  return 'Send photos';
}
