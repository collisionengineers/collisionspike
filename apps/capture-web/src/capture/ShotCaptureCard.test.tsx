import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockManifest } from '@collisioncapture/core';
import { ShotCaptureCard } from './ShotCaptureCard';

vi.mock('../camera/GuidedCamera', () => ({
  GuidedCamera: ({ onAccept }: { onAccept(file: File): void }) => (
    <button
      type="button"
      onClick={() => onAccept(new File(['replacement'], 'replacement.jpg', { type: 'image/jpeg' }))}
    >
      Accept replacement
    </button>
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
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
});
