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
import type { CaptureApi } from '../api/captureApi';

interface ShotCaptureCardProps {
  api: CaptureApi;
  manifest: CaptureSessionManifest;
  shot: CaptureShotDefinition;
  progress: CaptureShotProgress | undefined;
  onProgress: (progress: CaptureShotProgress) => void;
}

export function ShotCaptureCard({
  api,
  manifest,
  shot,
  progress,
  onProgress
}: ShotCaptureCardProps): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = progress?.status ?? 'empty';
  const isBusy = status === 'uploading';
  const isDone = status === 'uploaded';

  const chooseFile = (): void => {
    inputRef.current?.click();
  };

  const upload = async (file: File): Promise<void> => {
    setError(null);
    const request: CaptureUploadRequest = {
      shotId: shot.id,
      fileName: file.name,
      contentType: file.type.toLowerCase(),
      sizeBytes: file.size
    };

    const check = validateUploadRequest(request, {
      maxFileBytes: manifest.maxFileBytes,
      acceptedMimeTypes: manifest.acceptedMimeTypes
    });

    if (!check.ok) {
      setError(check.reason);
      onProgress({
        shotId: shot.id,
        status: 'rejected',
        rejectionReason: check.reason
      });
      return;
    }

    onProgress({
      shotId: shot.id,
      status: 'uploading',
      fileName: file.name
    });

    try {
      const intent = await api.createUpload(manifest.token, request);
      await api.uploadFile(intent, file);
      const completed = await api.completeUpload(manifest.token, intent.uploadId, file);
      onProgress({
        shotId: shot.id,
        status: 'uploaded',
        uploadId: intent.uploadId,
        evidenceId: completed.evidenceId,
        fileName: file.name
      });
    } catch {
      const message = 'This photo did not upload. Try again.';
      setError(message);
      onProgress({
        shotId: shot.id,
        status: 'rejected',
        fileName: file.name,
        rejectionReason: message
      });
    }
  };

  return (
    <article className={`shot-card ${isDone ? 'done' : ''}`}>
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
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void upload(file);
          event.currentTarget.value = '';
        }}
      />

      <button className="icon-button" type="button" disabled={isBusy} onClick={chooseFile}>
        {isBusy ? <LoaderCircle aria-hidden="true" className="spin" /> : <Camera aria-hidden="true" />}
        <span>{isDone ? 'Retake' : 'Take photo'}</span>
      </button>
    </article>
  );
}
