import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { GuidanceMode } from '@cs/capture-contracts';
import { CheckCircle2, CircleAlert, Image as ImageIcon, RotateCcw, X } from 'lucide-react';
import {
  analyseDecodedFallbackPhoto,
  type FallbackPhotoAnalysis
} from './fallbackPhotoAnalysis';
import {
  assessedObservation,
  unassessedObservation,
  type ClientCaptureObservation
} from './captureObservation';

export interface FallbackPhotoReviewProps {
  file: File;
  guidanceMode: GuidanceMode;
  rulesVersion: string;
  shotLabel: string;
  onCancel(): void;
  onRetake(): void;
  onUse(file: File, observation: ClientCaptureObservation): void;
}

/** Review step for photos returned by the OS camera/file picker.
 *
 * The native picker cannot host CollisionCapture guidance, so the selected
 * file must return to an accessible in-page confirmation step before it is
 * persisted or uploaded.
 */
export function FallbackPhotoReview({
  file,
  guidanceMode,
  rulesVersion,
  shotLabel,
  onCancel,
  onRetake,
  onUse
}: FallbackPhotoReviewProps): ReactElement {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [analysis, setAnalysis] = useState<FallbackPhotoAnalysis | null>(null);

  useEffect(() => {
    setAnalysis(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const analysePreview = (image: HTMLImageElement): void => {
    if (guidanceMode === 'off') return;
    try {
      setAnalysis(analyseDecodedFallbackPhoto(image));
    } catch {
      // Decode, canvas, or pixel-read failures remain neutral. The fallback
      // must stay usable on browsers that cannot run local image guidance.
      setAnalysis(null);
    }
  };

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const appRoot = document.getElementById('root');
    const previousOverflow = document.body.style.overflow;
    appRoot?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    cancelButtonRef.current?.focus();

    return () => {
      appRoot?.removeAttribute('inert');
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
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

  const showsAnalysis =
    (guidanceMode === 'advisory' || guidanceMode === 'enforced') && analysis !== null;
  const hasQualityWarning = showsAnalysis && !analysis.evaluation.passing;
  const guidanceClassName = !showsAnalysis
    ? 'camera-quality is-neutral'
    : analysis.evaluation.passing
      ? 'camera-quality is-ready'
      : 'camera-quality';
  const guidanceIcon = !showsAnalysis
    ? <ImageIcon aria-hidden="true" />
    : analysis.evaluation.passing
      ? <CheckCircle2 aria-hidden="true" />
      : <CircleAlert aria-hidden="true" />;
  const guidanceHeading = !showsAnalysis
    ? 'Check your photo'
    : analysis.evaluation.instruction;
  const guidanceDetail = !showsAnalysis
    ? 'Make sure the requested view is clear before using it.'
    : analysis.evaluation.passing
      ? 'Brightness, contrast and sharpness are within the current guidance range.'
      : guidanceMode === 'enforced'
        ? 'This checks only brightness, contrast and sharpness. Retake it, or use it for staff review.'
        : 'This checks only brightness, contrast and sharpness. Retake it or use it as it is.';
  const useLabel = guidanceMode === 'enforced' && hasQualityWarning
    ? 'Use for staff review'
    : 'Use photo';
  const observation = guidanceMode === 'off' || analysis === null
    ? unassessedObservation('os_fallback', rulesVersion)
    : assessedObservation({
        route: 'os_fallback',
        rulesVersion,
        evaluation: analysis.evaluation,
        signals: analysis.signals,
        stableFrames: 0,
        ready: analysis.evaluation.passing
      });

  return createPortal(
    <div
      ref={dialogRef}
      className="camera-dialog fallback-review-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fallback-review-title"
      onKeyDown={handleKeyDown}
    >
      <header className="camera-header">
        <div>
          <span className="camera-eyebrow">Phone camera photo</span>
          <h2 id="fallback-review-title">Check {shotLabel}</h2>
        </div>
        <button
          ref={cancelButtonRef}
          className="camera-close"
          type="button"
          onClick={onCancel}
          aria-label="Cancel photo review"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="camera-stage fallback-review-stage">
        {previewUrl ? (
          <img
            className="camera-review-image"
            src={previewUrl}
            alt={`Preview of ${shotLabel}`}
            onLoad={(event) => analysePreview(event.currentTarget)}
          />
        ) : (
          <div className="camera-stage-message" role="status">
            <ImageIcon aria-hidden="true" />
            <strong>Preparing photo</strong>
          </div>
        )}
      </div>

      <section className="camera-guidance" aria-live="polite">
        <div className={guidanceClassName}>
          {guidanceIcon}
          <div>
            <strong>{guidanceHeading}</strong>
            <span>{guidanceDetail}</span>
          </div>
        </div>
      </section>

      <footer className="camera-actions fallback-review-actions">
        <button className="camera-text-action" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="camera-secondary" type="button" onClick={onRetake}>
          <RotateCcw aria-hidden="true" />
          Choose another
        </button>
        <button
          className="camera-shutter is-ready"
          type="button"
          onClick={() => onUse(file, observation)}
        >
          <CheckCircle2 aria-hidden="true" />
          {useLabel}
        </button>
      </footer>
    </div>,
    document.body
  );
}
