// @vitest-environment jsdom
import { FluentProvider, Toaster, webLightTheme } from '@fluentui/react-components';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { cases } from '../__fixtures__/cases';
import { ChaserPanel } from './ChaserPanel';
import { GLOBAL_TOASTER_ID } from './toaster';

const clipboard = vi.hoisted(() => ({ writeText: vi.fn() }));

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
