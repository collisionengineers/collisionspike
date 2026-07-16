// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  configureDataAccess,
  type CaptureSessionStaffSummary,
} from '../../data';
import type { DataAccessExt } from '../../data/rest-client';
import { createEmptyDataAccess } from '../../data/empty-source';
import { GuidedPhotoRequestPanel } from './GuidedPhotoRequestPanel';

const openSession: CaptureSessionStaffSummary = {
  sessionId: 'session-1',
  status: 'open',
  shotPlanId: 'essential-v1',
  shotPlanLabel: 'Essential photos',
  guidanceMode: 'advisory',
  createdAt: '2026-07-13T12:00:00.000Z',
  expiresAt: '2026-07-16T12:00:00.000Z',
  requiredTotal: 2,
  requiredCompleted: 0,
};

let captureSessions: ReturnType<typeof vi.fn>;
let createCaptureSession: ReturnType<typeof vi.fn>;
let rotateCaptureSession: ReturnType<typeof vi.fn>;
let revokeCaptureSession: ReturnType<typeof vi.fn>;

beforeEach(() => {
  captureSessions = vi.fn(async () => [openSession]);
  createCaptureSession = vi.fn(async () => ({
    session: openSession,
    captureUrl: 'https://capture.test/#new-link',
  }));
  rotateCaptureSession = vi.fn(async () => ({
    session: openSession,
    captureUrl: 'https://capture.test/#replacement-link',
  }));
  revokeCaptureSession = vi.fn(async () => ({ ...openSession, status: 'revoked' }));
  configureDataAccess({
    ...createEmptyDataAccess(),
    captureSessions,
    createCaptureSession,
    rotateCaptureSession,
    revokeCaptureSession,
  } as DataAccessExt);
});

afterEach(() => {
  cleanup();
  configureDataAccess(createEmptyDataAccess());
});

describe('GuidedPhotoRequestPanel', () => {
  it('creates the default three-day essential request and exposes its link once', async () => {
    const user = userEvent.setup();
    const onLinkReady = vi.fn();
    render(
      <GuidedPhotoRequestPanel caseId="case-1" onLinkReady={onLinkReady} />,
    );

    await screen.findByText('Essential photos');
    await user.click(screen.getByRole('button', { name: 'Create request' }));

    await waitFor(() => {
      expect(createCaptureSession).toHaveBeenCalledWith('case-1', {
        shotPlanId: 'essential-v1',
        expiresInHours: 72,
      });
    });
    expect(onLinkReady).toHaveBeenCalledWith({
      sessionId: 'session-1',
      captureUrl: 'https://capture.test/#new-link',
      shotPlanLabel: 'Essential photos',
      expiresAt: openSession.expiresAt,
    });
    expect(screen.queryByText('https://capture.test/#new-link')).toBeNull();
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
  });

  it('warns that replacing the link stops the old one before returning the new link', async () => {
    const user = userEvent.setup();
    const onLinkReady = vi.fn();
    render(
      <GuidedPhotoRequestPanel caseId="case-1" onLinkReady={onLinkReady} />,
    );

    await user.click(await screen.findByRole('button', { name: 'Replace link' }));
    expect(screen.getByText('The old link will stop working. A new link will be added to the draft.'))
      .toBeTruthy();
    const replaceDialog = await screen.findByRole(
      'dialog',
      { hidden: true },
      { timeout: 5_000 },
    );
    await user.click(await within(replaceDialog).findByRole(
      'button',
      { name: 'Replace link', hidden: true },
      { timeout: 5_000 },
    ));

    await waitFor(() => expect(rotateCaptureSession).toHaveBeenCalledWith('session-1'));
    expect(onLinkReady).toHaveBeenCalledWith(
      expect.objectContaining({ captureUrl: 'https://capture.test/#replacement-link' }),
    );
  }, 15_000);

  it('requires confirmation before cancelling an open link', async () => {
    const user = userEvent.setup();
    const onLinkCancelled = vi.fn();
    render(
      <GuidedPhotoRequestPanel
        caseId="case-1"
        onLinkReady={vi.fn()}
        onLinkCancelled={onLinkCancelled}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Cancel link' }));
    expect(screen.getByText(/The link will stop working immediately/)).toBeTruthy();
    const cancelDialog = await screen.findByRole(
      'dialog',
      { hidden: true },
      { timeout: 5_000 },
    );
    await user.click(await within(cancelDialog).findByRole(
      'button',
      { name: 'Cancel link', hidden: true },
      { timeout: 5_000 },
    ));

    await waitFor(() => expect(revokeCaptureSession).toHaveBeenCalledWith('session-1'));
    expect(onLinkCancelled).toHaveBeenCalledWith('session-1');
  }, 15_000);

  it('shows existing requests but blocks creation for a closed case', async () => {
    render(
      <GuidedPhotoRequestPanel caseId="case-1" disabled onLinkReady={vi.fn()} />,
    );

    expect(await screen.findByText(/This case is closed/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create request' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Replace link' })).toBeNull();
  });
});
