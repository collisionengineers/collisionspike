// @vitest-environment jsdom
import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

vi.mock('../data', () => ({
  QUEUES: [
    { name: 'not-ready', label: 'Not ready' },
    { name: 'review', label: 'Review' },
    { name: 'held', label: 'Held' },
  ],
  data: {
    queueCounts: vi.fn().mockResolvedValue({ 'not-ready': 3, review: 2, held: 1 }),
    inboundEmailCounts: vi.fn().mockResolvedValue({ untriaged: 4 }),
  },
  useAiChatGate: () => ({ data: { enabled: false, writeEnabled: false } }),
}));

function renderShell() {
  render(
    createElement(
      MemoryRouter,
      { initialEntries: ['/'] },
      createElement(
        Routes,
        null,
        createElement(
          Route,
          { element: createElement(AppShell) },
          createElement(Route, { index: true, element: createElement('div', null, 'Dashboard body') }),
        ),
      ),
    ),
  );
}

describe('AppShell compact navigation', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 800px)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('starts compact, keeps direct queue links named, and expands as an overlay', () => {
    renderShell();

    expect(screen.getByRole('button', { name: 'Expand navigation' }).getAttribute('aria-controls'))
      .toBe('primary-navigation');
    expect(screen.getByRole('link', { name: /Not ready/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Review/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Held/ })).toBeTruthy();
    expect(screen.getByPlaceholderText('Search VRM, claimant, Case/PO…')).toBeTruthy();

    const expandButton = screen.getByRole('button', { name: 'Expand navigation' });
    fireEvent.click(expandButton);

    const closeButton = screen.getByRole('button', { name: 'Close navigation' });
    expect(document.activeElement).toBe(closeButton);
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Add evidence')).toBeTruthy();

    fireEvent.click(closeButton);
    expect(screen.queryByRole('button', { name: 'Close navigation' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBe(document.activeElement);
  });
});
