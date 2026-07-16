// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cases as fixtureCases } from '../../__fixtures__/cases';
import { configureDataAccess, createEmptyDataAccess, useEmptyDataAccess } from '../../data';
import type { DataAccessExt } from '../../data/rest-client';
import { AttachConfirmCard } from './AttachConfirmCard';

const target = fixtureCases[0];
let uploadEvidence: ReturnType<typeof vi.fn>;

beforeEach(() => {
  uploadEvidence = vi.fn()
    .mockResolvedValueOnce({
      status: 207,
      added: [{
        fileIndex: 0,
        fileName: 'one.jpg',
        evidenceId: 'ev-1',
        duplicate: false,
      }],
      rejected: [{ fileIndex: 1, fileName: 'two.jpg', reason: 'That photo is damaged.' }],
    })
    .mockResolvedValueOnce({
      status: 200,
      added: [
        { fileIndex: 0, fileName: 'one.jpg', evidenceId: 'ev-1', duplicate: true },
        { fileIndex: 1, fileName: 'two.jpg', evidenceId: 'ev-2', duplicate: false },
      ],
      rejected: [],
    });
  configureDataAccess({
    ...createEmptyDataAccess(),
    openVrmTwins: vi.fn(async () => [target]),
    uploadEvidence,
  } as DataAccessExt);
});

afterEach(() => {
  cleanup();
  useEmptyDataAccess();
});

describe('Attach confirmation upload state', () => {
  it('keeps a partial result in the error/retry phase and reuses the same key', async () => {
    const files = [
      new File(['one'], 'one.jpg', { type: 'image/jpeg' }),
      new File(['two'], 'two.jpg', { type: 'image/jpeg' }),
    ];
    const user = userEvent.setup();
    render(
      <AttachConfirmCard
        files={files}
        suggestedVrm={target.vrm}
        onDone={vi.fn()}
      />,
    );

    const confirm = await screen.findByRole('button', { name: /Add 2 files to/i });
    await user.click(confirm);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("1 file couldn't be added");
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();

    const retry = screen.getByRole('button', { name: /Add 2 files to/i });
    await user.click(retry);
    await screen.findByRole('status');
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(uploadEvidence).toHaveBeenCalledTimes(2);
    expect(uploadEvidence.mock.calls[1][2].idempotencyKey)
      .toBe(uploadEvidence.mock.calls[0][2].idempotencyKey);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
