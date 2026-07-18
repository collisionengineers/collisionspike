// @vitest-environment jsdom

import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboundEmail } from '@cs/domain';
import { PreviewControllerProvider, SubjectPreviewCell, previewPositioning } from './subject-preview';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function email(overrides: Partial<InboundEmail> = {}): InboundEmail {
  return {
    id: 'email-1',
    name: 'Email',
    sourceMessageId: '<message-1@example.test>',
    subject: 'Alpha',
    fromAddress: 'sender@example.test',
    senderDomain: 'example.test',
    sourceMailbox: 'info@collisionengineers.co.uk',
    receivedOn: '2026-07-13T09:00:00Z',
    hasAttachments: false,
    category: 'receiving_work',
    subtype: 'existing_provider_instruction',
    confidence: 1,
    classifierMode: 'deterministic',
    signals: [],
    triageState: 'routed',
    bodyVrm: '',
    bodyCaseref: '',
    bodyPreview: 'Alpha body text',
    ...overrides,
  };
}

function treeFor(emails: InboundEmail[]) {
  return (
    <FluentProvider theme={webLightTheme}>
      <PreviewControllerProvider>
        {emails.map((e) => (
          <SubjectPreviewCell key={e.id} e={e} selected={false} onSelect={() => {}} />
        ))}
      </PreviewControllerProvider>
    </FluentProvider>
  );
}

function renderCells(emails: InboundEmail[]) {
  return render(treeFor(emails));
}

function trigger(subject: string) {
  return screen.getByRole('button', { name: subject });
}

// The single shared PopoverSurface only exists in the DOM while open, and its
// aria-label is row-specific (`Email preview — {subject}`) — unlike the
// bodyPreview TEXT, which is also rendered (identically) in the always-
// visible inert summary line, so a text query alone can't distinguish
// "open for this row" from "just the summary line is showing".
function surfaceFor(subject: string) {
  return screen.queryByLabelText(`Email preview — ${subject}`);
}

describe('subject hover/focus preview — timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('does not open before the 150ms hover-intent delay, opens at 150ms', () => {
    renderCells([email()]);
    fireEvent.pointerEnter(trigger('Alpha'));

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(surfaceFor('Alpha')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(surfaceFor('Alpha')).not.toBeNull();
  });

  it('stays open until 99ms after leaving the trigger, closes at 100ms', () => {
    renderCells([email()]);
    fireEvent.pointerEnter(trigger('Alpha'));
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(surfaceFor('Alpha')).not.toBeNull();

    fireEvent.pointerLeave(trigger('Alpha'));
    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(surfaceFor('Alpha')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(surfaceFor('Alpha')).toBeNull();
  });

  it('leaving the trigger before 150ms cancels the pending open — no flash', () => {
    renderCells([email()]);
    fireEvent.pointerEnter(trigger('Alpha'));
    act(() => {
      vi.advanceTimersByTime(80);
    });
    fireEvent.pointerLeave(trigger('Alpha'));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(surfaceFor('Alpha')).toBeNull();
  });

  it('moving the pointer from the subject into the surface keeps it open', () => {
    renderCells([email()]);
    fireEvent.pointerEnter(trigger('Alpha'));
    act(() => {
      vi.advanceTimersByTime(150);
    });
    const surface = surfaceFor('Alpha');
    expect(surface).not.toBeNull();

    fireEvent.pointerLeave(trigger('Alpha'));
    fireEvent.pointerEnter(surface!);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(surfaceFor('Alpha')).not.toBeNull();

    fireEvent.pointerLeave(surface!);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(surfaceFor('Alpha')).toBeNull();
  });
});

describe('subject hover/focus preview — single active row', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('never leaves a stale or duplicate preview during rapid row traversal', () => {
    const a = email({ id: 'a', subject: 'Alpha', bodyPreview: 'Alpha body text' });
    const b = email({ id: 'b', subject: 'Bravo', bodyPreview: 'Bravo body text' });
    renderCells([a, b]);

    fireEvent.pointerEnter(trigger('Alpha'));
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(surfaceFor('Alpha')).not.toBeNull();

    // Rapid transit: leave Alpha, enter Bravo, well before Alpha's close timer
    // (or Bravo's own open timer) would otherwise fire.
    fireEvent.pointerLeave(trigger('Alpha'));
    fireEvent.pointerEnter(trigger('Bravo'));
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(surfaceFor('Alpha')).toBeNull();
    expect(surfaceFor('Bravo')).not.toBeNull();
    expect(screen.getAllByLabelText(/Email preview —/)).toHaveLength(1);
  });

  it('hovering a second row before the first opens shows only the second', () => {
    const a = email({ id: 'a', subject: 'Alpha', bodyPreview: 'Alpha body text' });
    const b = email({ id: 'b', subject: 'Bravo', bodyPreview: 'Bravo body text' });
    renderCells([a, b]);

    fireEvent.pointerEnter(trigger('Alpha'));
    act(() => {
      vi.advanceTimersByTime(60);
    });
    fireEvent.pointerLeave(trigger('Alpha'));
    fireEvent.pointerEnter(trigger('Bravo'));
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(surfaceFor('Alpha')).toBeNull();
    expect(surfaceFor('Bravo')).not.toBeNull();
  });
});

describe('subject hover/focus preview — row unmount cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('a pending open never fires once its row is filtered away before 150ms', () => {
    const a = email({ id: 'a', subject: 'Alpha', bodyPreview: 'Alpha body text' });
    const b = email({ id: 'b', subject: 'Bravo', bodyPreview: 'Bravo body text' });
    const { rerender } = renderCells([a, b]);

    fireEvent.pointerEnter(trigger('Alpha'));
    act(() => {
      vi.advanceTimersByTime(80);
    });
    // Simulate a search/filter change removing Alpha's row before its
    // 150ms open-intent timer would otherwise fire.
    rerender(treeFor([b]));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(surfaceFor('Alpha')).toBeNull();
    expect(surfaceFor('Bravo')).toBeNull();
    expect(screen.queryAllByLabelText(/Email preview —/)).toHaveLength(0);
  });

  it('closes immediately when its row is filtered away while its preview is open', () => {
    const a = email({ id: 'a', subject: 'Alpha', bodyPreview: 'Alpha body text' });
    const b = email({ id: 'b', subject: 'Bravo', bodyPreview: 'Bravo body text' });
    const { rerender } = renderCells([a, b]);

    fireEvent.pointerEnter(trigger('Alpha'));
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(surfaceFor('Alpha')).not.toBeNull();

    // Simulate a search/filter change removing Alpha's row while its preview
    // is still open — the shared surface must not stay anchored to it.
    rerender(treeFor([b]));

    expect(surfaceFor('Alpha')).toBeNull();
    expect(screen.queryAllByLabelText(/Email preview —/)).toHaveLength(0);
  });
});

describe('subject hover/focus preview — keyboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('opens immediately on focus (no hover-intent delay) and closes on blur', () => {
    renderCells([email()]);
    fireEvent.focus(trigger('Alpha'));
    expect(surfaceFor('Alpha')).not.toBeNull();

    fireEvent.blur(trigger('Alpha'));
    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(surfaceFor('Alpha')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(surfaceFor('Alpha')).toBeNull();
  });

  it('gives the preview surface a row-specific accessible name', () => {
    renderCells([email({ subject: 'Alpha' })]);
    fireEvent.focus(trigger('Alpha'));
    expect(surfaceFor('Alpha')).not.toBeNull();
  });
});

describe('subject hover/focus preview — placement configuration', () => {
  // Real flip/shift-at-viewport-edges behavior needs a real layout engine and
  // is proven live (signed-in Chrome), not in jsdom — this only proves the
  // positioning CONFIGURATION passed to the Popover is correct: a top/bottom
  // placement (never sideways, so it can't cover the VRM/Ref/Status/Actions
  // columns) with a vertical fallback.
  it('only ever flips above/below, never sideways', () => {
    expect(previewPositioning.position).toBe('below');
    expect(previewPositioning.fallbackPositions).toEqual(['above']);
  });
});
