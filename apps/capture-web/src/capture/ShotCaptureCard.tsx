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
import { UploadCoordinatorError } from '../uploads/uploadCoordinator';
import { FallbackPhotoReview } from './FallbackPhotoReview';
import type { ClientCaptureObservation } from './captureObservation';

interface ShotCaptureCardProps {
  manifest: CaptureSessionManifest;
  shot: CaptureShotDefinition;
  progress: CaptureShotProgress | undefined;
  onProgress: (progress: CaptureShotProgress) => void;
  onPhoto: (
    file: File,
    replacesSelected: boolean,
    observation: ClientCaptureObservation
  ) => Promise<void>;
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
  const [fallbackFile, setFallbackFile] = useState<File | null>(null);
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

  const upload = async (
    file: File,
    observation: ClientCaptureObservation
  ): Promise<void> => {
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
      await onPhoto(file, isDone, observation);
    } catch (uploadError: unknown) {
      const coordinatorError = uploadError instanceof UploadCoordinatorError
        ? uploadError
        : undefined;
      const message = coordinatorError?.message ?? 'This photo did not upload. Try again.';
      setError(message);
      if (!isDone && coordinatorError?.code !== 'session-unavailable') {
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
        disabled={manifest.status !== 'open'}
        tabIndex={-1}
        aria-hidden="true"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            setError(null);
            setFallbackFile(file);
          }
          event.currentTarget.value = '';
        }}
      />

      <button
        className="icon-button"
        type="button"
        disabled={isBusy || manifest.status !== 'open'}
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
          guidanceMode={manifest.guidanceMode}
          rulesVersion={manifest.rulesVersion}
          shotLabel={shot.label}
          prompt={shot.prompt}
          framing={shot.guidanceProfile?.framing}
          onAccept={(file, observation) => {
            setCameraOpen(false);
            void upload(file, observation);
          }}
          onClose={() => setCameraOpen(false)}
          onFallback={() => {
            setCameraOpen(false);
            chooseFallbackFile();
          }}
        />
      ) : null}

      {fallbackFile ? (
        <FallbackPhotoReview
          file={fallbackFile}
          guidanceMode={manifest.guidanceMode}
          rulesVersion={manifest.rulesVersion}
          shotLabel={shot.label}
          onCancel={() => setFallbackFile(null)}
          onRetake={() => {
            setFallbackFile(null);
            chooseFallbackFile();
          }}
          onUse={(file, observation) => {
            setFallbackFile(null);
            void upload(file, observation);
          }}
        />
      ) : null}
    </article>
  );
}
