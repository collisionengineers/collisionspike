import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureSessionManifest } from '@cs/capture-contracts';
import { createMockManifest, requiredShotsComplete } from '@cs/capture-core';
import type { CaptureApi, CaptureAuthorization } from '../api/captureApi';
import type { CaptureSessionUnavailable } from '../uploads/uploadCoordinator';
import { useUploadCoordinator } from '../uploads/useUploadCoordinator';
import { CaptureApp, CaptureFlow, captureFooterMessage } from './CaptureApp';

vi.mock('../uploads/useUploadCoordinator', () => ({
  useUploadCoordinator: vi.fn()
}));

const mockedUseUploadCoordinator = vi.mocked(useUploadCoordinator);

function readyManifest(overrides: Partial<CaptureSessionManifest> = {}): CaptureSessionManifest {
  const manifest = createMockManifest();
  return {
    ...manifest,
    progress: manifest.shots.map((shot) => ({
      shotId: shot.id,
      status: shot.required ? 'accepted' : 'empty'
    })),
    ...overrides
  };
}

function buttonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent?.includes(label));
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Button not found: ${label}`);
  return button;
}

function deferred(): {
  promise: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
} {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('capture app readiness', () => {
  it('keeps submit blocked until required shots upload', () => {
    expect(requiredShotsComplete(createMockManifest())).toBe(false);
  });

  it.each([
    ['expired', 'This link has expired. Ask Collision Engineers for a new link.'],
    ['revoked', 'This link is no longer active. Ask Collision Engineers for a new link.'],
    ['locked', 'This link has been paused. Contact Collision Engineers for help.']
  ] as const)('describes a %s session without a misleading remaining count', (status, expected) => {
    expect(captureFooterMessage(status, false, -3, 'idle')).toBe(expected);
  });

  it('describes a zero-remaining open session as awaiting checks', () => {
    expect(captureFooterMessage('open', false, 0, 'idle')).toBe('Photo checks are still finishing.');
  });
});

describe('CaptureFlow submission', () => {
  let container: HTMLDivElement;
  let root: Root;
  const clearSession = vi.fn();
  const handleApiFailure = vi.fn();
  const authorization: CaptureAuthorization = {
    sessionId: 'session-1',
    accessToken: 'memory-only-token',
    // Always in the future: a wall-clock literal here silently expires and
    // reroutes authorizedFetch through renewal (the 2026-07-14 time bomb).
    accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString()
  };
  const api = {} as CaptureApi;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    clearSession.mockReset().mockResolvedValue(undefined);
    handleApiFailure.mockReset().mockResolvedValue(false);
    mockedUseUploadCoordinator.mockReturnValue(
      {
        coordinator: { clearSession, handleApiFailure },
        hasUnsettledDrafts: false,
        recoveryComplete: true
      } as unknown as ReturnType<typeof useUploadCoordinator>
    );
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows an accessible busy state and retains drafts when sending fails', async () => {
    const attempt = deferred();
    const onSubmit = vi.fn(() => attempt.promise);

    await act(async () => {
      root.render(
        <CaptureFlow
          api={api}
          authorization={authorization}
          manifest={readyManifest()}
          online
          onProgress={vi.fn()}
          onSubmit={onSubmit}
        />
      );
    });

    await act(async () => buttonByText(container, 'Send photos').click());

    const sending = buttonByText(container, 'Sending…');
    expect(sending.disabled).toBe(true);
    expect(sending.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Sending photos securely');
    expect(clearSession).not.toHaveBeenCalled();

    await act(async () => {
      attempt.reject(new Error('network details must not be rendered'));
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'Photos were not sent. They are still saved.'
      );
    });
    expect(container.textContent).not.toContain('network details');
    expect(buttonByText(container, 'Try sending again').disabled).toBe(false);
    expect(clearSession).not.toHaveBeenCalled();
  });

  it('clears drafts only after submission is confirmed', async () => {
    const attempt = deferred();

    await act(async () => {
      root.render(
        <CaptureFlow
          api={api}
          authorization={authorization}
          manifest={readyManifest()}
          online
          onProgress={vi.fn()}
          onSubmit={() => attempt.promise}
        />
      );
    });

    await act(async () => buttonByText(container, 'Send photos').click());
    expect(clearSession).not.toHaveBeenCalled();

    await act(async () => {
      attempt.resolve();
      await attempt.promise;
    });

    await vi.waitFor(() => expect(clearSession).toHaveBeenCalledOnce());
  });

  it('blocks submission while a local draft is still unsettled', async () => {
    mockedUseUploadCoordinator.mockReturnValue({
      coordinator: { clearSession, handleApiFailure },
      hasUnsettledDrafts: true,
      recoveryComplete: true
    } as unknown as ReturnType<typeof useUploadCoordinator>);

    await act(async () => {
      root.render(
        <CaptureFlow
          api={api}
          authorization={authorization}
          manifest={readyManifest()}
          online
          onProgress={vi.fn()}
          onSubmit={vi.fn()}
        />
      );
    });

    expect(buttonByText(container, 'Send photos').disabled).toBe(true);
    expect(container.textContent).toContain('Photo checks are still finishing.');
  });

  it('blocks submission until persisted drafts have been recovered', async () => {
    mockedUseUploadCoordinator.mockReturnValue({
      coordinator: { clearSession, handleApiFailure },
      hasUnsettledDrafts: false,
      recoveryComplete: false
    } as unknown as ReturnType<typeof useUploadCoordinator>);

    await act(async () => {
      root.render(
        <CaptureFlow
          api={api}
          authorization={authorization}
          manifest={readyManifest()}
          online
          onProgress={vi.fn()}
          onSubmit={vi.fn()}
        />
      );
    });

    expect(buttonByText(container, 'Send photos').disabled).toBe(true);
    expect(container.textContent).toContain('Photo checks are still finishing.');
  });
});

describe('CaptureApp upload-session closure', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    mockedUseUploadCoordinator.mockReset();
    mockedUseUploadCoordinator.mockReturnValue(
      {
        coordinator: { clearSession: vi.fn() },
        hasUnsettledDrafts: false,
        recoveryComplete: true
      } as unknown as ReturnType<typeof useUploadCoordinator>
    );
    window.history.replaceState(null, '', `/#capture=${'a'.repeat(43)}`);
    const authorization: CaptureAuthorization = {
      sessionId: 'capture-session-demo',
      accessToken: 'memory-only-token',
      // Must outlive the renewal skew or getManifest renews first and consumes
      // the mocked manifest response as an exchange payload.
      accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString()
    };
    const jsonResponse = (body: unknown): Response => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(authorization))
      .mockResolvedValueOnce(jsonResponse(createMockManifest())));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderReadyApp(): Promise<(
    failure: CaptureSessionUnavailable
  ) => void> {
    await act(async () => {
      root.render(<CaptureApp />);
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain('AB12 CDE');
    const callback = mockedUseUploadCoordinator.mock.calls.at(-1)?.[4];
    if (!callback) throw new Error('Session unavailable callback was not registered');
    return callback;
  }

  it('renders an authoritative expired state reported by the upload coordinator', async () => {
    const onUnavailable = await renderReadyApp();

    await act(async () => onUnavailable({
      status: 'expired',
      code: 'capture_expired',
      message: 'This link expired.'
    }));

    expect(container.textContent).toContain(
      'This link has expired. Ask Collision Engineers for a new link.'
    );
    expect(buttonByText(container, 'Link unavailable').disabled).toBe(true);
  });

  it('replaces the capture flow with a safe unavailable state for authorization failure', async () => {
    const onUnavailable = await renderReadyApp();

    await act(async () => onUnavailable({
      status: 'unavailable',
      code: 'capture_unauthorized',
      message: 'This capture link is no longer authorized.'
    }));

    expect(container.textContent).toContain('Link unavailable');
    expect(container.textContent).toContain('This capture link is no longer authorized.');
    expect(container.textContent).not.toContain('Vehicle photos');
  });
});
