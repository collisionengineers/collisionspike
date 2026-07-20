import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FallbackPhotoReview } from './FallbackPhotoReview';
import { analyseDecodedFallbackPhoto } from './fallbackPhotoAnalysis';

vi.mock('./fallbackPhotoAnalysis', () => ({
  analyseDecodedFallbackPhoto: vi.fn()
}));

const mockedAnalyseDecodedFallbackPhoto = vi.mocked(analyseDecodedFallbackPhoto);
const qualityWarning = {
  signals: { brightness: 0.5, contrast: 0.1, sharpness: 0.01, motion: 0 },
  evaluation: {
    issue: 'not-sharp' as const,
    instruction: 'Tap to focus and hold steady.',
    passing: false
  }
};

function buttonByText(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')]
    .find((candidate) => candidate.textContent?.includes(label));
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Button not found: ${label}`);
  return button;
}

describe('FallbackPhotoReview', () => {
  let container: HTMLDivElement;
  let root: Root;
  const file = new File(['photo'], 'phone-camera.jpg', { type: 'image/jpeg' });
  const revokeObjectUrl = vi.fn();

  beforeEach(() => {
    revokeObjectUrl.mockReset();
    mockedAnalyseDecodedFallbackPhoto.mockReset();
    mockedAnalyseDecodedFallbackPhoto.mockReturnValue({
      signals: { brightness: 0.5, contrast: 0.2, sharpness: 0.1, motion: 0 },
      evaluation: {
        issue: null,
        instruction: 'Photo quality looks good.',
        passing: true
      }
    });
    container = document.createElement('div');
    container.id = 'root';
    document.body.append(container);
    root = createRoot(container);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:fallback-preview')
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.querySelectorAll('.fallback-review-dialog').forEach((node) => node.remove());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('previews the native photo and uses it only after explicit confirmation', async () => {
    const onUse = vi.fn();

    await act(async () => {
      root.render(
        <FallbackPhotoReview
          file={file}
          guidanceMode="off"
          rulesVersion="quality-v1"
          shotLabel="Vehicle overview"
          onCancel={vi.fn()}
          onRetake={vi.fn()}
          onUse={onUse}
        />
      );
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(document.querySelector('img[alt="Preview of Vehicle overview"]')).not.toBeNull();
    expect(document.querySelector('button[aria-label="Cancel photo review"]')).toBe(document.activeElement);
    expect(onUse).not.toHaveBeenCalled();

    await act(async () => buttonByText('Use photo').click());
    expect(onUse).toHaveBeenCalledWith(file, {
      route: 'os_fallback',
      disposition: 'unassessed',
      stableFrames: 0,
      rulesVersion: 'quality-v1'
    });
  });

  it('offers cancel, retake, and Escape without uploading', async () => {
    const onCancel = vi.fn();
    const onRetake = vi.fn();
    const onUse = vi.fn();

    await act(async () => {
      root.render(
        <FallbackPhotoReview
          file={file}
          guidanceMode="off"
          rulesVersion="quality-v1"
          shotLabel="Main damage close-up"
          onCancel={onCancel}
          onRetake={onRetake}
          onUse={onUse}
        />
      );
    });

    await act(async () => buttonByText('Choose another').click());
    expect(onRetake).toHaveBeenCalledOnce();
    expect(onUse).not.toHaveBeenCalled();

    await act(async () => buttonByText('Cancel').click());
    expect(onCancel).toHaveBeenCalledOnce();

    const dialog = document.querySelector('[role="dialog"]');
    if (!(dialog instanceof HTMLElement)) throw new Error('Review dialog not found');
    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onUse).not.toHaveBeenCalled();
  });

  it('revokes its object URL when the review closes', async () => {
    await act(async () => {
      root.render(
        <FallbackPhotoReview
          file={file}
          guidanceMode="off"
          rulesVersion="quality-v1"
          shotLabel="Vehicle overview"
          onCancel={vi.fn()}
          onRetake={vi.fn()}
          onUse={vi.fn()}
        />
      );
    });

    await act(async () => root.render(<div />));
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:fallback-preview');
  });

  it('does not analyse the decoded preview when guidance is off', async () => {
    await act(async () => {
      root.render(
        <FallbackPhotoReview
          file={file}
          guidanceMode="off"
          rulesVersion="quality-v1"
          shotLabel="Vehicle overview"
          onCancel={vi.fn()}
          onRetake={vi.fn()}
          onUse={vi.fn()}
        />
      );
    });

    const image = document.querySelector('img[alt="Preview of Vehicle overview"]');
    if (!(image instanceof HTMLImageElement)) throw new Error('Preview image not found');
    await act(async () => image.dispatchEvent(new Event('load', { bubbles: true })));

    expect(mockedAnalyseDecodedFallbackPhoto).not.toHaveBeenCalled();
    expect(document.querySelector('.camera-quality.is-neutral')?.textContent).toContain(
      'Check your photo'
    );
  });

  it('runs shadow analysis without exposing its result as user guidance', async () => {
    mockedAnalyseDecodedFallbackPhoto.mockReturnValue(qualityWarning);
    await act(async () => {
      root.render(
        <FallbackPhotoReview
          file={file}
          guidanceMode="shadow"
          rulesVersion="quality-v1"
          shotLabel="Vehicle overview"
          onCancel={vi.fn()}
          onRetake={vi.fn()}
          onUse={vi.fn()}
        />
      );
    });

    const image = document.querySelector('img[alt="Preview of Vehicle overview"]');
    if (!(image instanceof HTMLImageElement)) throw new Error('Preview image not found');
    await act(async () => image.dispatchEvent(new Event('load', { bubbles: true })));

    expect(mockedAnalyseDecodedFallbackPhoto).toHaveBeenCalledWith(image);
    expect(document.querySelector('.camera-quality.is-neutral')?.textContent).toContain(
      'Check your photo'
    );
    expect(document.body.textContent).not.toContain('Tap to focus and hold steady.');
  });

  it('shows advisory quality advice without blocking either review choice', async () => {
    mockedAnalyseDecodedFallbackPhoto.mockReturnValue(qualityWarning);
    await act(async () => {
      root.render(
        <FallbackPhotoReview
          file={file}
          guidanceMode="advisory"
          rulesVersion="quality-v1"
          shotLabel="Vehicle overview"
          onCancel={vi.fn()}
          onRetake={vi.fn()}
          onUse={vi.fn()}
        />
      );
    });

    const image = document.querySelector('img[alt="Preview of Vehicle overview"]');
    if (!(image instanceof HTMLImageElement)) throw new Error('Preview image not found');
    await act(async () => image.dispatchEvent(new Event('load', { bubbles: true })));

    expect(document.body.textContent).toContain('Tap to focus and hold steady.');
    expect(document.body.textContent).toContain('brightness, contrast and sharpness');
    expect(buttonByText('Choose another').disabled).toBe(false);
    expect(buttonByText('Use photo').disabled).toBe(false);
  });

  it('labels an enforced warning for staff review without removing either escape route', async () => {
    mockedAnalyseDecodedFallbackPhoto.mockReturnValue(qualityWarning);
    const onUse = vi.fn();
    await act(async () => {
      root.render(
        <FallbackPhotoReview
          file={file}
          guidanceMode="enforced"
          rulesVersion="quality-v1"
          shotLabel="Vehicle overview"
          onCancel={vi.fn()}
          onRetake={vi.fn()}
          onUse={onUse}
        />
      );
    });

    const image = document.querySelector('img[alt="Preview of Vehicle overview"]');
    if (!(image instanceof HTMLImageElement)) throw new Error('Preview image not found');
    await act(async () => image.dispatchEvent(new Event('load', { bubbles: true })));

    expect(document.body.textContent).toContain('use it for staff review');
    expect(buttonByText('Choose another').disabled).toBe(false);
    const useForReview = buttonByText('Use for staff review');
    expect(useForReview.disabled).toBe(false);
    await act(async () => useForReview.click());
    expect(onUse).toHaveBeenCalledWith(file, {
      route: 'os_fallback',
      disposition: 'take_anyway',
      issue: 'not-sharp',
      signals: qualityWarning.signals,
      stableFrames: 0,
      rulesVersion: 'quality-v1'
    });
  });

  it('keeps analysis failures neutral and leaves confirmation available', async () => {
    mockedAnalyseDecodedFallbackPhoto.mockImplementation(() => {
      throw new Error('canvas unavailable');
    });
    await act(async () => {
      root.render(
        <FallbackPhotoReview
          file={file}
          guidanceMode="advisory"
          rulesVersion="quality-v1"
          shotLabel="Vehicle overview"
          onCancel={vi.fn()}
          onRetake={vi.fn()}
          onUse={vi.fn()}
        />
      );
    });

    const image = document.querySelector('img[alt="Preview of Vehicle overview"]');
    if (!(image instanceof HTMLImageElement)) throw new Error('Preview image not found');
    await act(async () => image.dispatchEvent(new Event('load', { bubbles: true })));

    expect(document.querySelector('.camera-quality.is-neutral')?.textContent).toContain(
      'Check your photo'
    );
    expect(buttonByText('Use photo').disabled).toBe(false);
  });
});
