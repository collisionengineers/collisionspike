// @vitest-environment jsdom
import { FluentProvider, Toaster, webLightTheme } from '@fluentui/react-components';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { Case, Evidence } from '../../data';
import { cases } from '../../__fixtures__/cases';
import { ChaserPanel } from './ChaserPanel';
import { GLOBAL_TOASTER_ID } from './toaster';

const clipboard = vi.hoisted(() => ({ writeText: vi.fn() }));

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: crypto.randomUUID(),
    fileName: 'photo.jpg',
    kind: 'image',
    imageRole: 'additional',
    registrationVisible: false,
    acceptedForEva: true,
    excluded: false,
    sourceLabel: 'Test upload',
    ...overrides,
  };
}

function panelCase(images: Evidence[]): Case {
  return {
    ...cases[0],
    chasers: [],
    evidence: [
      ...images,
      evidence({
        id: 'instruction',
        fileName: 'instruction.pdf',
        kind: 'instruction',
        imageRole: 'unknown',
        acceptedForEva: false,
      }),
    ],
  };
}

function panel(c: Case) {
  return (
    <FluentProvider theme={webLightTheme}>
      <ChaserPanel case={c} fileRequestEnabled />
      <Toaster toasterId={GLOBAL_TOASTER_ID} />
    </FluentProvider>
  );
}

function renderPanel(overrides: Partial<ComponentProps<typeof ChaserPanel>> = {}) {
  const props: ComponentProps<typeof ChaserPanel> = {
    case: cases[1], // instruction present, photographs missing
    fileRequestEnabled: true,
    onRequestUploadLink: vi.fn(async () => ({
      status: 'ok' as const,
      data: { fileRequestUrl: 'https://app.box.com/f/active-token' },
    })),
    ...overrides,
  };
  render(
    <FluentProvider theme={webLightTheme}>
      <ChaserPanel {...props} />
      <Toaster toasterId={GLOBAL_TOASTER_ID} />
    </FluentProvider>,
  );
  return props;
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'NodeFilter', {
    configurable: true,
    value: window.NodeFilter,
  });
  clipboard.writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: clipboard,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('image chaser link requirement', () => {
  it('copies the editable message and active upload link together', async () => {
    const props = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));

    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledOnce());
    expect(props.onRequestUploadLink).toHaveBeenCalledWith(cases[1].id);
    expect(clipboard.writeText.mock.calls[0][0]).toContain(
      'Upload your photos here:\nhttps://app.box.com/f/active-token',
    );
    expect((screen.getByRole('textbox', { name: 'Draft' }) as HTMLTextAreaElement).value)
      .toContain('https://app.box.com/f/active-token');
  });

  it('copies nothing and logs nothing when link provisioning fails', async () => {
    const onLogChased = vi.fn();
    renderPanel({
      onLogChased,
      onRequestUploadLink: vi.fn(async () => ({
        status: 'error' as const,
        message: 'The upload link could not be prepared. Try again.',
      })),
    });

    await userEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    await waitFor(() => expect(screen.getByText('No upload link yet')).toBeTruthy());
    expect(clipboard.writeText).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Log as chased' }));
    await waitFor(() => expect(screen.getAllByText('No upload link yet').length).toBeGreaterThan(0));
    expect(onLogChased).not.toHaveBeenCalled();
  });
});

describe('live image-gap recomputation', () => {
  it('removes a replacement request as soon as concurrent review resolves', async () => {
    const overview = evidence({ imageRole: 'overview', registrationVisible: true });
    const closeup = evidence({ imageRole: 'damage_closeup' });
    const pending = evidence({ excluded: true, reviewRequired: true });
    const view = render(panel(panelCase([overview, closeup, pending])));

    expect((screen.getByRole('textbox', { name: 'Draft' }) as HTMLTextAreaElement).value)
      .toContain('cannot yet be used');

    view.rerender(panel(panelCase([overview, closeup, { ...pending, reviewRequired: false }])));
    await waitFor(() => expect(screen.getByText(
      'Nothing to chase — this case already has its instruction and images.',
    )).toBeTruthy());
  });

  it('reopens image requests after accepted photos are excluded, then closes them after upload', async () => {
    const overview = evidence({ imageRole: 'overview', registrationVisible: true });
    const closeup = evidence({ imageRole: 'damage_closeup' });
    const view = render(panel(panelCase([overview, closeup])));
    expect(screen.getByText(
      'Nothing to chase — this case already has its instruction and images.',
    )).toBeTruthy();

    view.rerender(panel(panelCase([
      { ...overview, excluded: true },
      { ...closeup, excluded: true },
    ])));
    await waitFor(() => expect(
      (screen.getByRole('textbox', { name: 'Draft' }) as HTMLTextAreaElement).value,
    ).toContain('do not yet have enough usable photographs'));

    view.rerender(panel(panelCase([
      evidence({ imageRole: 'overview', registrationVisible: true }),
      evidence({ imageRole: 'damage_closeup' }),
    ])));
    await waitFor(() => expect(screen.getByText(
      'Nothing to chase — this case already has its instruction and images.',
    )).toBeTruthy());
  });

  it('moves to the next unresolved role after a classification change', async () => {
    const overviewCandidate = evidence({ imageRole: 'additional', registrationVisible: true });
    const closeup = evidence({ imageRole: 'damage_closeup' });
    const view = render(panel(panelCase([overviewCandidate, closeup])));

    expect((screen.getByRole('textbox', { name: 'Draft' }) as HTMLTextAreaElement).value)
      .toContain('whole vehicle');

    view.rerender(panel(panelCase([
      { ...overviewCandidate, imageRole: 'overview' },
      closeup,
    ])));
    await waitFor(() => expect(screen.getByText(
      'Nothing to chase — this case already has its instruction and images.',
    )).toBeTruthy());
  });

  it('replaces the draft when the case changes after a merge or navigation', async () => {
    const firstCase = panelCase([]);
    const secondCase = {
      ...panelCase([]),
      id: 'merged-case',
      vrm: 'ZZ99 ZZZ',
    };
    const view = render(panel(firstCase));
    const draft = screen.getByRole('textbox', { name: 'Draft' }) as HTMLTextAreaElement;
    await userEvent.clear(draft);
    await userEvent.type(draft, 'Handler edit for the old case');

    view.rerender(panel(secondCase));
    await waitFor(() => expect(
      (screen.getByRole('textbox', { name: 'Draft' }) as HTMLTextAreaElement).value,
    ).toContain('ZZ99 ZZZ'));
    expect((screen.getByRole('textbox', { name: 'Draft' }) as HTMLTextAreaElement).value)
      .not.toContain('old case');
  });
});
