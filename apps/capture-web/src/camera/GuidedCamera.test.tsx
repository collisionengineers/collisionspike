import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuidedCamera } from './GuidedCamera';
import { startCamera } from './cameraDevice';

vi.mock('./cameraDevice', () => ({
  CameraStartError: class CameraStartError extends Error {
    readonly code = 'camera-unavailable';
  },
  startCamera: vi.fn()
}));

const mockedStartCamera = vi.mocked(startCamera);

function buttonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent?.includes(label));
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Button not found: ${label}`);
  return button;
}

describe('GuidedCamera', () => {
  let container: HTMLDivElement;
  let root: Root;
  const stop = vi.fn();
  const capture = vi.fn();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    stop.mockReset();
    capture.mockReset();
    mockedStartCamera.mockReset();
    mockedStartCamera.mockResolvedValue({
      stream: {} as MediaStream,
      capability: { method: 'canvas', width: 1920, height: 1080 },
      capture,
      stop
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:preview')
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn()
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps advisory mode gated while preserving take-anyway and the native fallback', async () => {
    const onFallback = vi.fn();

    await act(async () => {
      root.render(
        <GuidedCamera
          guidanceMode="advisory"
          rulesVersion="quality-v1"
          shotLabel="Vehicle overview"
          prompt="Fit the complete vehicle inside the frame."
          onAccept={vi.fn()}
          onClose={vi.fn()}
          onFallback={onFallback}
        />
      );
    });

    expect(mockedStartCamera).toHaveBeenCalledOnce();
    expect(buttonByText(document.body, 'Take photo').disabled).toBe(true);
    expect(buttonByText(document.body, 'Take anyway')).not.toBeNull();

    await act(async () => buttonByText(document.body, 'Use phone camera').click());
    expect(stop).toHaveBeenCalledOnce();
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it('keeps off mode manual, neutral and immediately available', async () => {
    const prompt = 'Fit the complete vehicle inside the frame.';

    await act(async () => {
      root.render(
        <GuidedCamera
          guidanceMode="off"
          rulesVersion="quality-v1"
          shotLabel="Vehicle overview"
          prompt={prompt}
          onAccept={vi.fn()}
          onClose={vi.fn()}
          onFallback={vi.fn()}
        />
      );
    });

    expect(buttonByText(document.body, 'Take photo').disabled).toBe(false);
    expect(document.body.textContent).toContain('Requested photo');
    expect(document.body.textContent).toContain(prompt);
    expect(document.body.textContent).not.toContain('Take anyway');
    expect(document.body.textContent).not.toContain('Ready to take photo');
  });

  it('keeps shadow mode neutral and non-blocking', async () => {
    const prompt = 'Fill the frame with the damaged area.';

    await act(async () => {
      root.render(
        <GuidedCamera
          guidanceMode="shadow"
          rulesVersion="quality-v1"
          shotLabel="Main damage close-up"
          prompt={prompt}
          onAccept={vi.fn()}
          onClose={vi.fn()}
          onFallback={vi.fn()}
        />
      );
    });

    expect(buttonByText(document.body, 'Take photo').disabled).toBe(false);
    expect(document.body.textContent).toContain('Requested photo');
    expect(document.body.textContent).toContain(prompt);
    expect(document.body.textContent).not.toContain('Take anyway');
    expect(document.body.textContent).not.toContain('Hold steady');
  });

  it('captures through take-anyway, supports review and accepts the resulting file', async () => {
    const file = new File(['photo'], 'capture.jpg', { type: 'image/jpeg' });
    capture.mockResolvedValue(file);
    const onAccept = vi.fn();

    await act(async () => {
      root.render(
        <GuidedCamera
          guidanceMode="advisory"
          rulesVersion="quality-v1"
          shotLabel="Main damage close-up"
          prompt="Fill the frame with the damaged area."
          onAccept={onAccept}
          onClose={vi.fn()}
          onFallback={vi.fn()}
        />
      );
    });

    await act(async () => buttonByText(document.body, 'Take anyway').click());

    expect(capture).toHaveBeenCalledOnce();
    expect(document.body.querySelector('img[alt="Preview of Main damage close-up"]')).not.toBeNull();

    await act(async () => buttonByText(document.body, 'Use photo').click());
    expect(onAccept).toHaveBeenCalledWith(file, {
      route: 'guided',
      disposition: 'unassessed',
      stableFrames: 0,
      rulesVersion: 'quality-v1'
    });
  });

  it('marks an enforced take-anyway photo for staff review without removing escape routes', async () => {
    const file = new File(['photo'], 'capture.jpg', { type: 'image/jpeg' });
    capture.mockResolvedValue(file);

    await act(async () => {
      root.render(
        <GuidedCamera
          guidanceMode="enforced"
          rulesVersion="quality-v1"
          shotLabel="Vehicle overview"
          prompt="Fit the vehicle inside the frame."
          onAccept={vi.fn()}
          onClose={vi.fn()}
          onFallback={vi.fn()}
        />
      );
    });

    expect(buttonByText(document.body, 'Take photo').disabled).toBe(true);
    expect(buttonByText(document.body, 'Use phone camera')).not.toBeNull();

    await act(async () => buttonByText(document.body, 'Take anyway').click());

    expect(document.body.textContent).toContain('Staff review needed');
    expect(document.body.textContent).toContain('before the quality checks were ready');
    expect(buttonByText(document.body, 'Use photo for staff review')).not.toBeNull();
  });

  it('stops the stream and closes cleanly', async () => {
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <GuidedCamera
          guidanceMode="advisory"
          rulesVersion="quality-v1"
          shotLabel="Vehicle overview"
          prompt="Fit the vehicle inside the frame."
          onAccept={vi.fn()}
          onClose={onClose}
          onFallback={vi.fn()}
        />
      );
    });

    const closeButton = document.body.querySelector('button[aria-label="Close camera"]');
    if (!(closeButton instanceof HTMLButtonElement)) throw new Error('Close button not found');
    await act(async () => closeButton.click());

    expect(stop).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ignores a late capture result after the dialog closes', async () => {
    let resolveCapture: ((file: File) => void) | undefined;
    capture.mockReturnValue(new Promise<File>((resolve) => {
      resolveCapture = resolve;
    }));
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <GuidedCamera
          guidanceMode="advisory"
          rulesVersion="quality-v1"
          shotLabel="Vehicle overview"
          prompt="Fit the vehicle inside the frame."
          onAccept={vi.fn()}
          onClose={onClose}
          onFallback={vi.fn()}
        />
      );
    });

    const takeAnyway = buttonByText(document.body, 'Take anyway');
    await act(async () => {
      takeAnyway.click();
      takeAnyway.click();
    });
    expect(capture).toHaveBeenCalledOnce();

    const closeButton = document.body.querySelector('button[aria-label="Close camera"]');
    if (!(closeButton instanceof HTMLButtonElement)) throw new Error('Close button not found');
    await act(async () => closeButton.click());
    await act(async () => resolveCapture?.(new File(['late'], 'late.jpg', { type: 'image/jpeg' })));

    expect(onClose).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('closes with Escape and restores focus', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <GuidedCamera
          guidanceMode="advisory"
          rulesVersion="quality-v1"
          shotLabel="Vehicle overview"
          prompt="Fit the vehicle inside the frame."
          onAccept={vi.fn()}
          onClose={onClose}
          onFallback={vi.fn()}
        />
      );
    });

    const dialog = document.body.querySelector('[role="dialog"]');
    if (!(dialog instanceof HTMLElement)) throw new Error('Dialog not found');
    await act(async () => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(onClose).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
    expect(document.activeElement).toBe(opener);
    root = createRoot(container);
    opener.remove();
  });
});
