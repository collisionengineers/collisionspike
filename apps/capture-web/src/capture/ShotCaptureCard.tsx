import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type {
  CaptureSessionManifest,
  CaptureShotDefinition,
  CaptureShotProgress,
  CaptureUploadRequest
} from '@collisioncapture/contracts';
import { validateUploadRequest } from '@collisioncapture/core';
import { Camera, CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react';
import type { CaptureApi, CaptureAuthorization } from '../api/captureApi';
import { GuidedCamera } from '../camera/GuidedCamera';

interface ShotCaptureCardProps {
  api: CaptureApi;
  authorization: CaptureAuthorization;
  manifest: CaptureSessionManifest;
  shot: CaptureShotDefinition;
  progress: CaptureShotProgress | undefined;
  onProgress: (progress: CaptureShotProgress) => void;
}

export function ShotCaptureCard({
  api,
  authorization,
  manifest,
  shot,
  progress,
  onProgress
}: ShotCaptureCardProps): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [attemptBusy, setAttemptBusy] = useState(false);

  const status = progress?.status ?? 'empty';
  const isBusy = status === 'uploading' || attemptBusy;
  const isDone = status === 'accepted' || status === 'pending_review';

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
      const sha256 = await hashFile(file);
      const request: CaptureUploadRequest = {
        ...fileDetails,
        idempotencyKey: crypto.randomUUID(),
        sha256
      };
      const intent = await api.createUpload(authorization, request);
      await api.uploadFile(intent, file);
      const completed = await api.completeUpload(authorization, intent.assetId, {
        sizeBytes: file.size,
        sha256
      });
      onProgress({
        shotId: shot.id,
        status: completed.status,
        uploadId: intent.uploadId,
        assetId: completed.assetId,
        fileName: file.name
      });
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
          {error ? (
            <p className="inline-error">
              <CircleAlert aria-hidden="true" />
              {error}
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
        <span>{isDone ? 'Retake' : 'Take photo'}</span>
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

async function hashFile(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await fileBytes(file));
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function fileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return await file.arrayBuffer();

  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('The photo could not be read.'));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('The photo could not be read.'));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
