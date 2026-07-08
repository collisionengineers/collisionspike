import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { CaptureSessionManifest, CaptureShotProgress } from '@collisioncapture/contracts';
import { completionCounts, orderedShots, requiredShotsComplete } from '@collisioncapture/core';
import { Camera, CheckCircle2, CircleAlert, CloudUpload, RotateCw, ShieldCheck, WifiOff } from 'lucide-react';
import { MockCaptureApi } from '../api/mockCaptureApi';
import { ShotCaptureCard } from '../capture/ShotCaptureCard';
import { VehicleGuide } from '../ui/VehicleGuide';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; manifest: CaptureSessionManifest }
  | { status: 'error'; message: string };

const api = new MockCaptureApi();

export function CaptureApp(): ReactElement {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') ?? 'demo-token';
    api.getManifest(token)
      .then((manifest) => setLoadState({ status: 'ready', manifest }))
      .catch(() => setLoadState({ status: 'error', message: 'This link cannot be opened.' }));
  }, []);

  useEffect(() => {
    const updateOnline = (): void => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const updateProgress = (progress: CaptureShotProgress): void => {
    setLoadState((current) => {
      if (current.status !== 'ready') return current;
      const next = current.manifest.progress.filter((item) => item.shotId !== progress.shotId);
      return {
        status: 'ready',
        manifest: {
          ...current.manifest,
          progress: [...next, progress]
        }
      };
    });
  };

  const submit = async (): Promise<void> => {
    if (loadState.status !== 'ready') return;
    await api.submit(loadState.manifest.token);
    setLoadState({
      status: 'ready',
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
      online={online}
      onProgress={updateProgress}
      onSubmit={submit}
    />
  );
}

interface CaptureFlowProps {
  manifest: CaptureSessionManifest;
  online: boolean;
  onProgress: (progress: CaptureShotProgress) => void;
  onSubmit: () => Promise<void>;
}

function CaptureFlow({ manifest, online, onProgress, onSubmit }: CaptureFlowProps): ReactElement {
  const shots = useMemo(() => orderedShots(manifest.shots), [manifest.shots]);
  const counts = completionCounts(manifest);
  const canSubmit = requiredShotsComplete(manifest) && manifest.status === 'open';

  const progressPercent = Math.round((counts.totalDone / counts.total) * 100);
  const isComplete = manifest.status === 'complete';

  return (
    <main className="shell">
      <header className="topbar" aria-label="Capture summary">
        <div className="case-lockup">
          <span className="case-label">Vehicle photos</span>
          <h1>{manifest.registration ?? 'Registration needed'}</h1>
          <p>{[manifest.vehicleLabel, manifest.caseReference].filter(Boolean).join(' - ')}</p>
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
              api={api}
              manifest={manifest}
              shot={shot}
              progress={manifest.progress.find((item) => item.shotId === shot.id)}
              onProgress={onProgress}
            />
          ))}
        </div>
      </section>

      <footer className="submit-bar">
        <div>
          <span className="eyebrow">Send to Collision Engineers</span>
          <p>{isComplete ? 'Photos received.' : canSubmit ? 'Required photos are ready.' : 'Two required photos are needed.'}</p>
        </div>
        <button className="primary-action" disabled={!canSubmit} onClick={() => void onSubmit()}>
          {isComplete ? <CheckCircle2 aria-hidden="true" /> : <Camera aria-hidden="true" />}
          {isComplete ? 'Sent' : 'Send photos'}
        </button>
      </footer>
    </main>
  );
}
