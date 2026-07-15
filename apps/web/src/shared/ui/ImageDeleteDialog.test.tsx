// @vitest-environment jsdom

import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageDeleteDialog } from './ImageDeleteDialog';

beforeEach(() => {
  Object.defineProperty(globalThis, 'NodeFilter', {
    configurable: true,
    value: window.NodeFilter,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderDialog(overrides?: Partial<React.ComponentProps<typeof ImageDeleteDialog>>) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <FluentProvider theme={webLightTheme}>
      <ImageDeleteDialog
        open
        fileName="damage-nearside.jpg"
        busy={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
        {...overrides}
      />
    </FluentProvider>,
  );
  return { onCancel, onConfirm };
}

describe('ImageDeleteDialog', () => {
  it('names the image and explains the Archive/source boundary', () => {
    renderDialog();
    expect(screen.getByText('damage-nearside.jpg')).toBeTruthy();
    expect(screen.getByText(/Archive folder/)).toBeTruthy();
    expect(screen.getByText(/source email or document will stay/)).toBeTruthy();
  });

  it('cancels without invoking the confirmed mutation', async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('invokes deletion only from the explicit confirmation button', async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Delete image' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('keeps a partial failure visible with a retry action', () => {
    renderDialog({ error: 'The Archive copy could not be removed.' });
    expect(screen.getByText('The Archive copy could not be removed.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
