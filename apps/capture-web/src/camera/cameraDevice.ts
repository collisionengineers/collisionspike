export type CameraStartErrorCode =
  | 'permission-denied'
  | 'camera-unavailable'
  | 'insufficient-resolution'
  | 'insecure-context'
  | 'unsupported-browser';

export class CameraStartError extends Error {
  readonly code: CameraStartErrorCode;

  constructor(code: CameraStartErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'CameraStartError';
    this.code = code;
  }
}

export type CameraCaptureMethod = 'image-capture' | 'canvas';

export const MIN_CANVAS_PIXELS = 4_000_000;

export interface CameraSession {
  stream: MediaStream;
  capability: {
    method: CameraCaptureMethod;
    width: number;
    height: number;
  };
  capture(): Promise<File>;
  stop(): void;
}

interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
}

type ImageCaptureConstructor = new (track: MediaStreamTrack) => ImageCaptureLike;

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 3840 },
    height: { ideal: 2160 }
  }
};

function browserErrorName(error: unknown): string | undefined {
  if (error instanceof DOMException) {
    return error.name;
  }

  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === 'string' ? name : undefined;
  }

  return undefined;
}

function mapStartError(error: unknown): CameraStartError {
  if (error instanceof CameraStartError) {
    return error;
  }

  const name = browserErrorName(error);

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return new CameraStartError(
      'permission-denied',
      'Camera permission was denied. Allow camera access and try again.',
      error
    );
  }

  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'NotReadableError' ||
    name === 'TrackStartError' ||
    name === 'AbortError' ||
    name === 'OverconstrainedError'
  ) {
    return new CameraStartError(
      'camera-unavailable',
      'A usable camera is not currently available.',
      error
    );
  }

  return new CameraStartError(
    'camera-unavailable',
    'The camera could not be started.',
    error
  );
}

function captureDimensions(video: HTMLVideoElement, track: MediaStreamTrack): {
  width: number;
  height: number;
} {
  const settings = track.getSettings();

  return {
    width: video.videoWidth || settings.width || 0,
    height: video.videoHeight || settings.height || 0
  };
}

function fileFromBlob(blob: Blob): File {
  const capturedAt = Date.now();
  return new File([blob], `capture-${capturedAt}.jpg`, {
    type: blob.type || 'image/jpeg',
    lastModified: capturedAt
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error('The camera frame could not be encoded as a JPEG.'));
      },
      'image/jpeg',
      0.92
    );
  });
}

export async function startCamera(video: HTMLVideoElement): Promise<CameraSession> {
  if (window.isSecureContext === false) {
    throw new CameraStartError(
      'insecure-context',
      'Camera access requires a secure HTTPS connection.'
    );
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraStartError(
      'unsupported-browser',
      'This browser does not support camera capture.'
    );
  }

  let stream: MediaStream;

  try {
    stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
  } catch (error) {
    throw mapStartError(error);
  }

  let stopped = false;
  const stop = (): void => {
    if (stopped) {
      return;
    }

    stopped = true;
    for (const track of stream.getTracks()) {
      track.stop();
    }

    if (video.srcObject === stream) {
      video.srcObject = null;
    }
  };

  try {
    const track = stream.getVideoTracks()[0];
    if (!track) {
      throw new CameraStartError(
        'camera-unavailable',
        'The camera did not provide a video track.'
      );
    }

    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();

    const dimensions = captureDimensions(video, track);
    const ImageCaptureClass = (window as typeof window & {
      ImageCapture?: ImageCaptureConstructor;
    }).ImageCapture;

    if (ImageCaptureClass) {
      let imageCapture: ImageCaptureLike | undefined;

      try {
        imageCapture = new ImageCaptureClass(track);
      } catch {
        // Some browsers expose ImageCapture without supporting the active track.
      }

      if (imageCapture) {
        return {
          stream,
          capability: {
            method: 'image-capture',
            ...dimensions
          },
          async capture(): Promise<File> {
            return fileFromBlob(await imageCapture.takePhoto());
          },
          stop
        };
      }
    }

    if (dimensions.width * dimensions.height < MIN_CANVAS_PIXELS) {
      throw new CameraStartError(
        'insufficient-resolution',
        'This live preview cannot produce a high-resolution still. Use the phone camera instead.'
      );
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      throw new CameraStartError(
        'unsupported-browser',
        'This browser cannot create camera still images.'
      );
    }

    return {
      stream,
      capability: {
        method: 'canvas',
        ...dimensions
      },
      async capture(): Promise<File> {
        const currentDimensions = captureDimensions(video, track);
        if (currentDimensions.width <= 0 || currentDimensions.height <= 0) {
          throw new Error('The camera is not ready to capture a frame.');
        }

        canvas.width = currentDimensions.width;
        canvas.height = currentDimensions.height;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return fileFromBlob(await canvasBlob(canvas));
      },
      stop
    };
  } catch (error) {
    stop();
    throw mapStartError(error);
  }
}
