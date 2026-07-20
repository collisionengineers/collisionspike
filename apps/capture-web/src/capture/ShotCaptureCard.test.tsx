import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidanceMode } from '@cs/capture-contracts';
import { createMockManifest } from '@cs/capture-core';
import {
  UNSUPPORTED_CAPTURE_FORMAT_MESSAGE,
  UploadCoordinatorError
} from '../uploads/uploadCoordinator';
import { ShotCaptureCard } from './ShotCaptureCard';

vi.mock('../camera/GuidedCamera', () => ({
  GuidedCamera: ({
    guidanceMode,
    onAccept,
    onFallback
  }: {
    guidanceMode: GuidanceMode;
    onAccept(file: File): void;
    onFallback(): void;
  }) => (
    <div data-guidance-mode={guidanceMode}>
      <button
        type="button"
        onClick={() => onAccept(new File(['replacement'], 'replacement.jpg', { type: 'image/jpeg' }))}
      >
        Accept replacement
      </button>
      <button type="button" onClick={onFallback}>Use fallback</button>
    </div>
  )
}));

describe('ShotCaptureCard', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:fallback-preview')
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

  it('passes the manifest guidance mode into the camera', async () => {
    const manifest = { ...createMockManifest(), guidanceMode: 'shadow' as const };
    const shot = manifest.shots[0]!;

    await act(async () => {
      root.render(
        <ShotCaptureCard
          manifest={manifest}
          shot={shot}
          progress={{ shotId: shot.id, status: 'empty' }}
          onProgress={vi.fn()}
          onPhoto={vi.fn()}
        />
      );
    });

    const take = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Take photo'));
    if (!(take instanceof HTMLButtonElement)) throw new Error('Take photo button not found');
    await act(async () => take.click());

    expect(container.querySelector('[data-guidance-mode="shadow"]')).not.toBeNull();
  });

  it('reviews an OS/file fallback before queueing it', async () => {
    const manifest = createMockManifest();
    const shot = manifest.shots[0]!;
    const onPhoto = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <ShotCaptureCard
          manifest={manifest}
          shot={shot}
          progress={{ shotId: shot.id, status: 'empty' }}
          onProgress={vi.fn()}
          onPhoto={onPhoto}
        />
      );
    });

    const take = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Take photo'));
    if (!(take instanceof HTMLButtonElement)) throw new Error('Take photo button not found');
    await act(async () => take.click());

    const fallback = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Use fallback'));
    if (!(fallback instanceof HTMLButtonElement)) throw new Error('Fallback button not found');
    await act(async () => fallback.click());

    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('File input not found');
    const file = new File(['phone-photo'], 'overview.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Check Vehicle overview');
    expect(onPhoto).not.toHaveBeenCalled();

    const usePhoto = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Use photo'));
    if (!(usePhoto instanceof HTMLButtonElement)) throw new Error('Use photo button not found');
    await act(async () => {
      usePhoto.click();
      await vi.waitFor(() => expect(onPhoto).toHaveBeenCalledWith(file, false, {
        route: 'os_fallback',
        disposition: 'unassessed',
        stableFrames: 0,
        rulesVersion: manifest.rulesVersion
      }));
    });
  });

  it('keeps the accepted asset selected when a replacement upload fails', async () => {
    const manifest = createMockManifest();
    const shot = manifest.shots[0]!;
    const onProgress = vi.fn();
    const onPhoto = vi.fn().mockRejectedValue(new Error('offline'));

    await act(async () => {
      root.render(
        <ShotCaptureCard
          manifest={manifest}
          shot={shot}
          progress={{ shotId: shot.id, status: 'accepted', assetId: 'asset-original' }}
          onProgress={onProgress}
          onPhoto={onPhoto}
        />
      );
    });

    const retake = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Retake'));
    if (!(retake instanceof HTMLButtonElement)) throw new Error('Retake button not found');
    await act(async () => retake.click());

    const accept = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Accept replacement'));
    if (!(accept instanceof HTMLButtonElement)) throw new Error('Replacement button not found');
    await act(async () => {
      accept.click();
      await vi.waitFor(() => expect(onPhoto).toHaveBeenCalledOnce());
    });

    expect(onProgress).not.toHaveBeenCalled();
    expect(container.textContent).toContain('This photo did not upload. Try again.');
    expect(container.querySelector('.shot-card.done')).not.toBeNull();
  });

  it('surfaces the safe actionable message for a rejected capture format', async () => {
    const manifest = createMockManifest();
    const shot = manifest.shots[0]!;
    const onProgress = vi.fn();
    const onPhoto = vi.fn().mockRejectedValue(
      new UploadCoordinatorError('unsupported-format', UNSUPPORTED_CAPTURE_FORMAT_MESSAGE)
    );

    await act(async () => {
      root.render(
        <ShotCaptureCard
          manifest={manifest}
          shot={shot}
          progress={{ shotId: shot.id, status: 'empty' }}
          onProgress={onProgress}
          onPhoto={onPhoto}
        />
      );
    });

    const take = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Take photo'));
    if (!(take instanceof HTMLButtonElement)) throw new Error('Take photo button not found');
    await act(async () => take.click());

    const accept = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Accept replacement'));
    if (!(accept instanceof HTMLButtonElement)) throw new Error('Capture accept button not found');
    await act(async () => {
      accept.click();
      await vi.waitFor(() => expect(onPhoto).toHaveBeenCalledOnce());
    });

    expect(container.textContent).toContain(UNSUPPORTED_CAPTURE_FORMAT_MESSAGE);
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'rejected',
      rejectionReason: UNSUPPORTED_CAPTURE_FORMAT_MESSAGE
    }));
  });
});
