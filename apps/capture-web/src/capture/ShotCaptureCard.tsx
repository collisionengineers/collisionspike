import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type {
  CaptureSessionManifest,
  CaptureShotDefinition,
  CaptureShotProgress
} from '@collisioncapture/contracts';
import { validateUploadRequest } from '@collisioncapture/core';
import { Camera, CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react';
import { GuidedCamera } from '../camera/GuidedCamera';

interface ShotCaptureCardProps {
  manifest: CaptureSessionManifest;
  shot: CaptureShotDefinition;
  progress: CaptureShotProgress | undefined;
  onProgress: (progress: CaptureShotProgress) => void;
  onPhoto: (file: File, replacesSelected: boolean) => Promise<void>;
}

export function ShotCaptureCard({
  manifest,
  shot,
  progress,
  onProgress,
  onPhoto
}: ShotCaptureCardProps): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [attemptBusy, setAttemptBusy] = useState(false);

  const status = progress?.status ?? 'empty';
  const isBusy = status === 'uploading' || status === 'validating' || attemptBusy;
  const isDone = status === 'accepted' || status === 'pending_review';
  const displayError = error ?? progress?.rejectionReason;
  const pendingMessage = status === 'queued'
    ? 'Saved on this device. It will upload when a connection is available.'
    : status === 'uploading'
      ? 'Uploading this photo…'
      : status === 'validating'
        ? 'Uploaded. Collision Engineers is checking the file.'
        : null;

  const chooseFallbackFile = (): void => {
    inputRef.current?.click();
  };

  const upload = async (file: File): Promise<void> => {
    setError(null);
    const fileDetails = {
      shotId: shot.id,
      fileName: file.name,
      contentType: file.type.toLowerCase(),
      sizeBytes: file.size
    };

    const check = validateUploadRequest(fileDetails, {
      maxFileBytes: manifest.maxFileBytes,
      acceptedMimeTypes: manifest.acceptedMimeTypes
    });

    if (!check.ok) {
      setError(check.reason);
      if (!isDone) {
        onProgress({
          shotId: shot.id,
          status: 'rejected',
          rejectionReason: check.reason
        });
      }
      return;
    }

    setAttemptBusy(true);
    if (!isDone) {
      onProgress({
        shotId: shot.id,
        status: 'uploading',
        fileName: file.name
      });
    }

    try {
      await onPhoto(file, isDone);
    } catch {
      const message = 'This photo did not upload. Try again.';
      setError(message);
      if (!isDone) {
        onProgress({
          shotId: shot.id,
          status: 'rejected',
          fileName: file.name,
          rejectionReason: message
        });
      }
    } finally {
      setAttemptBusy(false);
    }
  };

  return (
    <article className={`shot-card ${isDone ? 'done' : ''}`} aria-busy={isBusy}>
      <div className="shot-main">
        <div className="shot-index" aria-hidden="true">
          {isDone ? <CheckCircle2 /> : shot.sequence / 10}
        </div>
        <div>
          <div className="shot-title-row">
            <h2>{shot.label}</h2>
            {shot.required ? <span className="required-chip">Required</span> : null}
          </div>
          <p>{shot.prompt}</p>
          {pendingMessage ? <p className="inline-status">{pendingMessage}</p> : null}
          {displayError ? (
            <p className="inline-error">
              <CircleAlert aria-hidden="true" />
              {displayError}
            </p>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        className="file-input"
        type="file"
        tabIndex={-1}
        aria-hidden="true"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void upload(file);
          event.currentTarget.value = '';
        }}
      />

      <button
        className="icon-button"
        type="button"
        disabled={isBusy}
        onClick={() => setCameraOpen(true)}
      >
        {isBusy ? <LoaderCircle aria-hidden="true" className="spin" /> : <Camera aria-hidden="true" />}
        <span>
          {isDone
            ? 'Retake'
            : status === 'queued'
              ? 'Replace saved photo'
              : status === 'validating'
                ? 'Checking photo'
                : 'Take photo'}
        </span>
      </button>

      {cameraOpen ? (
        <GuidedCamera
          shotLabel={shot.label}
          prompt={shot.prompt}
          onAccept={(file) => {
            setCameraOpen(false);
            void upload(file);
          }}
          onClose={() => setCameraOpen(false)}
          onFallback={() => {
            setCameraOpen(false);
            chooseFallbackFile();
          }}
        />
      ) : null}
    </article>
  );
}
