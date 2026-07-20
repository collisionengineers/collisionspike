import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CameraStartError,
  startCamera
} from './cameraDevice';

function makeVideo(width = 1920, height = 1080): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperties(video, {
    videoWidth: { configurable: true, value: width },
    videoHeight: { configurable: true, value: height }
  });
  video.play = vi.fn().mockResolvedValue(undefined);
  return video;
}

function makeCamera(width = 1920, height = 1080): {
  stream: MediaStream;
  track: MediaStreamTrack;
  stop: ReturnType<typeof vi.fn>;
} {
  const stop = vi.fn();
  const track = {
    getSettings: vi.fn().mockReturnValue({ width, height }),
    stop
  } as unknown as MediaStreamTrack;
  const stream = {
    getTracks: vi.fn().mockReturnValue([track]),
    getVideoTracks: vi.fn().mockReturnValue([track])
  } as unknown as MediaStream;

  return { stream, track, stop };
}

function setMediaDevices(getUserMedia?: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: getUserMedia ? { getUserMedia } : undefined
  });
}

describe('startCamera', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the environment camera and native ImageCapture when available', async () => {
    const { stream, track, stop } = makeCamera(4032, 3024);
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const photo = new Blob(['photo'], { type: 'image/jpeg' });
    const takePhoto = vi.fn().mockResolvedValue(photo);
    const ImageCaptureMock = vi.fn(function (receivedTrack: MediaStreamTrack) {
      expect(receivedTrack).toBe(track);
      return { takePhoto };
    });
    vi.stubGlobal('ImageCapture', ImageCaptureMock);
    setMediaDevices(getUserMedia);
    const video = makeVideo(1920, 1080);

    const session = await startCamera(video);
    const file = await session.capture();

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 3840 },
        height: { ideal: 2160 }
      }
    });
    expect(video.srcObject).toBe(stream);
    expect(video.play).toHaveBeenCalledOnce();
    expect(session.capability).toEqual({
      method: 'image-capture',
      width: 1920,
      height: 1080
    });
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/jpeg');
    expect(file.size).toBe(photo.size);

    session.stop();
    session.stop();
    expect(stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
  });

  it('captures the full video frame as JPEG when ImageCapture is unavailable', async () => {
    const { stream } = makeCamera(2560, 1600);
    setMediaDevices(vi.fn().mockResolvedValue(stream));
    const video = makeVideo(2560, 1600);
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback, type?: string) => {
      callback(new Blob(['canvas-photo'], type ? { type } : {}));
    });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage }),
      toBlob
    } as unknown as HTMLCanvasElement;
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName, options) =>
      tagName === 'canvas' ? canvas : createElement(tagName, options)
    );

    const session = await startCamera(video);
    const file = await session.capture();

    expect(session.capability).toEqual({
      method: 'canvas',
      width: 2560,
      height: 1600
    });
    expect(canvas.width).toBe(2560);
    expect(canvas.height).toBe(1600);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 2560, 1600);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.92);
    expect(file.type).toBe('image/jpeg');
  });

  it('falls back instead of presenting a low-resolution canvas capture as evidence quality', async () => {
    const { stream, stop } = makeCamera(1920, 1080);
    setMediaDevices(vi.fn().mockResolvedValue(stream));

    await expect(startCamera(makeVideo(1920, 1080))).rejects.toMatchObject({
      code: 'insufficient-resolution'
    });
    expect(stop).toHaveBeenCalledOnce();
  });

  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['SecurityError', 'permission-denied'],
    ['NotFoundError', 'camera-unavailable'],
    ['NotReadableError', 'camera-unavailable'],
    ['OverconstrainedError', 'camera-unavailable']
  ] as const)('maps %s acquisition errors to %s', async (name, code) => {
    const error = new Error('camera failed');
    error.name = name;
    setMediaDevices(vi.fn().mockRejectedValue(error));

    await expect(startCamera(makeVideo())).rejects.toMatchObject({
      name: 'CameraStartError',
      code
    });
  });

  it('rejects camera use in an insecure context before requesting permission', async () => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false
    });
    const getUserMedia = vi.fn();
    setMediaDevices(getUserMedia);

    await expect(startCamera(makeVideo())).rejects.toEqual(
      expect.objectContaining<Partial<CameraStartError>>({
        code: 'insecure-context'
      })
    );
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('reports browsers without media capture support', async () => {
    setMediaDevices();

    await expect(startCamera(makeVideo())).rejects.toMatchObject({
      code: 'unsupported-browser'
    });
  });

  it('stops acquired tracks when camera setup fails', async () => {
    const { stream, stop } = makeCamera();
    setMediaDevices(vi.fn().mockResolvedValue(stream));
    const video = makeVideo();
    video.play = vi.fn().mockRejectedValue(new Error('play failed'));

    await expect(startCamera(video)).rejects.toMatchObject({
      code: 'camera-unavailable'
    });
    expect(stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
  });
});
