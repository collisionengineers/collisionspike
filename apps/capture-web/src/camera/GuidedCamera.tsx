import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';
import {
  advanceGuidanceStability,
  analyseFrameQuality,
  containedMediaRect,
  evaluateFrameQuality,
  insetRect,
  type Rect,
  type GuidanceStabilityState
} from '@collisioncapture/core';
import {
  Camera,
  CheckCircle2,
  CircleAlert,
  Images,
  RotateCcw,
  X
} from 'lucide-react';
import { CameraStartError, startCamera, type CameraSession } from './cameraDevice';

const ANALYSIS_INTERVAL_MS = 200;
const ANALYSIS_WIDTH = 160;

type CameraPhase = 'starting' | 'live' | 'capturing' | 'review' | 'error';

export interface GuidedCameraProps {
  shotLabel: string;
  prompt: string;
  onAccept(file: File): void;
  onClose(): void;
  onFallback(): void;
}

export function GuidedCamera({
  shotLabel,
  prompt,
  onAccept,
  onClose,
  onFallback
}: GuidedCameraProps): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<CameraSession | null>(null);
  const previousLumaRef = useRef<Float32Array | undefined>(undefined);
  const stabilityRef = useRef<GuidanceStabilityState | undefined>(undefined);
  const analysisBusyRef = useRef(false);
  const previewUrlRef = useRef<string | null>(null);
  const captureOperationRef = useRef(0);
  const captureInFlightRef = useRef(false);

  const [phase, setPhase] = useState<CameraPhase>('starting');
  const [cameraRun, setCameraRun] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('Starting the camera…');
  const [ready, setReady] = useState(false);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [guideRect, setGuideRect] = useState<Rect | null>(null);

  const clearPreview = useCallback((): void => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setCapturedFile(null);
  }, []);

  const stopCamera = useCallback((): void => {
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, []);

  const syncGuideRect = useCallback((): void => {
    const stage = stageRef.current;
    const video = videoRef.current;
    if (
      !stage ||
      !video ||
      stage.clientWidth < 1 ||
      stage.clientHeight < 1 ||
      video.videoWidth < 1 ||
      video.videoHeight < 1
    ) {
      setGuideRect(null);
      return;
    }

    const visible = containedMediaRect(
      stage.clientWidth,
      stage.clientHeight,
      video.videoWidth,
      video.videoHeight
    );
    setGuideRect(insetRect(visible, 0.07));
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    previousLumaRef.current = undefined;
    stabilityRef.current = undefined;
    setReady(false);
    setInstruction('Starting the camera…');
    setErrorMessage(null);

    void startCamera(video)
      .then((session) => {
        if (cancelled) {
          session.stop();
          return;
        }
        sessionRef.current = session;
        setPhase('live');
        setInstruction('Fit the subject inside the guide.');
        syncGuideRect();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof CameraStartError
          ? error.message
          : 'The camera could not be started.';
        setErrorMessage(message);
        setPhase('error');
      });

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraRun, stopCamera, syncGuideRect]);

  useEffect(() => {
    if (phase !== 'live' && phase !== 'capturing') return;

    syncGuideRect();
    const stage = stageRef.current;
    if (stage && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(syncGuideRect);
      observer.observe(stage);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', syncGuideRect);
    return () => window.removeEventListener('resize', syncGuideRect);
  }, [phase, syncGuideRect]);

  useEffect(() => {
    if (phase !== 'live') return;

    const timer = window.setInterval(() => {
      if (analysisBusyRef.current) return;
      const video = videoRef.current;
      const canvas = analysisCanvasRef.current;
      if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      if (video.videoWidth < 1 || video.videoHeight < 1) return;

      analysisBusyRef.current = true;
      try {
        const aspect = video.videoHeight / video.videoWidth;
        canvas.width = ANALYSIS_WIDTH;
        canvas.height = Math.max(1, Math.round(ANALYSIS_WIDTH * aspect));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Frame analysis is unavailable.');

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const analysis = analyseFrameQuality(
          pixels.data,
          canvas.width,
          canvas.height,
          previousLumaRef.current
        );
        previousLumaRef.current = analysis.currentLuma;

        const evaluation = evaluateFrameQuality(analysis.signals);
        const stability = advanceGuidanceStability(stabilityRef.current, evaluation);
        stabilityRef.current = stability;
        setReady(stability.ready);
        setInstruction(
          stability.ready
            ? 'Ready to take photo.'
            : evaluation.passing
              ? 'Hold steady…'
              : evaluation.instruction
        );
      } catch {
        stabilityRef.current = undefined;
        setReady(false);
        setInstruction('Live quality guidance is unavailable. You can still take the photo.');
      } finally {
        analysisBusyRef.current = false;
      }
    }, ANALYSIS_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => () => {
    captureOperationRef.current += 1;
    stopCamera();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, [stopCamera]);

  const capture = async (): Promise<void> => {
    const session = sessionRef.current;
    if (!session || phase !== 'live' || captureInFlightRef.current) return;

    captureInFlightRef.current = true;
    const operation = ++captureOperationRef.current;
    setPhase('capturing');
    try {
      const file = await session.capture();
      if (operation !== captureOperationRef.current) return;
      const url = URL.createObjectURL(file);
      clearPreview();
      previewUrlRef.current = url;
      setCapturedFile(file);
      setPreviewUrl(url);
      stopCamera();
      setPhase('review');
    } catch {
      if (operation !== captureOperationRef.current) return;
      setErrorMessage('The photo could not be captured. Try again or use the phone camera.');
      setPhase('error');
      stopCamera();
    } finally {
      if (operation === captureOperationRef.current) {
        captureInFlightRef.current = false;
      }
    }
  };

  const retake = (): void => {
    captureOperationRef.current += 1;
    captureInFlightRef.current = false;
    clearPreview();
    setPhase('starting');
    setCameraRun((value) => value + 1);
  };

  const close = (): void => {
    captureOperationRef.current += 1;
    captureInFlightRef.current = false;
    stopCamera();
    clearPreview();
    onClose();
  };

  const fallback = (): void => {
    captureOperationRef.current += 1;
    captureInFlightRef.current = false;
    stopCamera();
    clearPreview();
    onFallback();
  };

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const appRoot = document.getElementById('root');
    const previousOverflow = document.body.style.overflow;
    appRoot?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      appRoot?.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )];
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      ref={dialogRef}
      className="camera-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-title"
      onKeyDown={handleDialogKeyDown}
    >
      <header className="camera-header">
        <div>
          <span className="camera-eyebrow">Guided capture</span>
          <h2 id="camera-title">{shotLabel}</h2>
        </div>
        <button ref={closeButtonRef} className="camera-close" type="button" onClick={close} aria-label="Close camera">
          <X aria-hidden="true" />
        </button>
      </header>

      <div ref={stageRef} className="camera-stage">
        <video
          ref={videoRef}
          className={phase === 'review' ? 'camera-video is-hidden' : 'camera-video'}
          muted
          playsInline
          onLoadedMetadata={syncGuideRect}
          aria-label="Live camera preview"
        />
        <canvas ref={analysisCanvasRef} className="camera-analysis-canvas" aria-hidden="true" />

        {phase === 'review' && previewUrl ? (
          <img className="camera-review-image" src={previewUrl} alt={`Preview of ${shotLabel}`} />
        ) : null}

        {(phase === 'live' || phase === 'capturing') && guideRect ? (
          <div
            className={ready ? 'camera-guide is-ready' : 'camera-guide'}
            style={{
              left: guideRect.x,
              top: guideRect.y,
              width: guideRect.width,
              height: guideRect.height
            }}
            aria-hidden="true"
          >
            <span className="camera-guide-corner top-left" />
            <span className="camera-guide-corner top-right" />
            <span className="camera-guide-corner bottom-left" />
            <span className="camera-guide-corner bottom-right" />
          </div>
        ) : null}

        {phase === 'starting' ? (
          <div className="camera-stage-message" role="status">
            <Camera aria-hidden="true" />
            <strong>Starting camera</strong>
            <span>Your browser may ask for permission.</span>
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="camera-stage-message is-error" role="alert">
            <CircleAlert aria-hidden="true" />
            <strong>Camera unavailable</strong>
            <span>{errorMessage}</span>
          </div>
        ) : null}
      </div>

      <section className="camera-guidance" aria-live="polite">
        <div className={ready ? 'camera-quality is-ready' : 'camera-quality'}>
          {ready ? <CheckCircle2 aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
          <div>
            <strong>{phase === 'review' ? 'Check your photo' : instruction}</strong>
            <span>{phase === 'review' ? 'Make sure the important detail is clear.' : prompt}</span>
          </div>
        </div>
      </section>

      <footer className="camera-actions">
        {phase === 'live' ? (
          <>
            <button className="camera-secondary" type="button" onClick={fallback}>
              <Images aria-hidden="true" />
              Use phone camera
            </button>
            <button
              className={ready ? 'camera-shutter is-ready' : 'camera-shutter'}
              type="button"
              onClick={() => void capture()}
              disabled={!ready}
            >
              <Camera aria-hidden="true" />
              Take photo
            </button>
            {!ready ? (
              <button className="camera-text-action" type="button" onClick={() => void capture()}>
                Take anyway
              </button>
            ) : null}
          </>
        ) : null}

        {phase === 'capturing' ? <span className="camera-busy" role="status">Capturing…</span> : null}

        {phase === 'review' && capturedFile ? (
          <>
            <button className="camera-secondary" type="button" onClick={retake}>
              <RotateCcw aria-hidden="true" />
              Retake
            </button>
            <button className="camera-shutter is-ready" type="button" onClick={() => onAccept(capturedFile)}>
              <CheckCircle2 aria-hidden="true" />
              Use photo
            </button>
          </>
        ) : null}

        {phase === 'error' ? (
          <>
            <button className="camera-secondary" type="button" onClick={retake}>
              <RotateCcw aria-hidden="true" />
              Try again
            </button>
            <button className="camera-shutter" type="button" onClick={fallback}>
              <Images aria-hidden="true" />
              Use phone camera
            </button>
          </>
        ) : null}
      </footer>
    </div>,
    document.body
  );
}
