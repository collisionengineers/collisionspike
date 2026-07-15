// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cases as fixtureCases } from '../__fixtures__/cases';
import {
  configureDataAccess,
  createMockDataAccess,
  useMockDataAccess,
  type EvidenceUploadResult,
} from '../data';
import type { DataAccessExt } from '../data/rest-client';
import { AddEvidence } from './AddEvidence';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const openCases = fixtureCases.slice(0, 2);
let uploadEvidence: ReturnType<typeof vi.fn>;

function result(overrides: Partial<EvidenceUploadResult> = {}): EvidenceUploadResult {
  return {
    status: 201,
    added: [{
      fileIndex: 0,
      fileName: 'photo.jpg',
      evidenceId: 'ev-1',
      duplicate: false,
    }],
    rejected: [],
    ...overrides,
  };
}

beforeEach(() => {
  navigate.mockReset();
  uploadEvidence = vi.fn();
  const base = createMockDataAccess();
  configureDataAccess({
    ...base,
    casesForQueue: vi.fn(async (queue: string) => queue === 'not-ready' ? openCases : []),
    uploadEvidence,
  } as DataAccessExt);
});

afterEach(() => {
  cleanup();
  useMockDataAccess();
});

async function selectFirstCaseAndFiles(files: File[]): Promise<void> {
  const user = userEvent.setup();
  render(<AddEvidence />);
  const caseButton = await screen.findByRole('button', { name: new RegExp(openCases[0].vrm, 'i') });
  await user.click(caseButton);
  await user.upload(screen.getByLabelText('Choose evidence files'), files);
}

describe('Add evidence rendered workflow', () => {
  it('uploads through the real action before it navigates', async () => {
    let resolveUpload!: (value: EvidenceUploadResult) => void;
    uploadEvidence.mockReturnValue(new Promise((resolve) => { resolveUpload = resolve; }));
    await selectFirstCaseAndFiles([
      new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
    ]);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: new RegExp(`Add to ${openCases[0].vrm}`, 'i') }));
    expect(uploadEvidence).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();

    resolveUpload(result());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/case/${openCases[0].id}`));
  });

  it('clears a selected target when the active search hides it', async () => {
    await selectFirstCaseAndFiles([
      new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
    ]);
    const user = userEvent.setup();
    const search = screen.getByRole('searchbox', { name: 'Search open cases' });
    await user.type(search, openCases[1].vrm);

    expect(screen.queryByRole('button', { name: new RegExp(openCases[0].vrm, 'i') })).toBeNull();
    expect((screen.getByRole('button', { name: 'Add to case' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('blocks double submit and keeps duplicate-named files, target, key and announcements for retries', async () => {
    let resolveFirst!: (value: EvidenceUploadResult) => void;
    uploadEvidence
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(result({
        status: 400,
        added: [],
        rejected: [
          { fileIndex: 0, fileName: 'photo.jpg', reason: 'Still damaged.' },
          { fileIndex: 1, fileName: 'photo.jpg', reason: 'Still damaged.' },
        ],
      }));
    const duplicateFiles = [
      new File(['first'], 'photo.jpg', { type: 'image/jpeg' }),
      new File(['second'], 'photo.jpg', { type: 'image/jpeg' }),
    ];
    await selectFirstCaseAndFiles(duplicateFiles);

    const submit = screen.getByRole('button', { name: new RegExp(`Add to ${openCases[0].vrm}`, 'i') });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(uploadEvidence).toHaveBeenCalledTimes(1);
    const firstKey = uploadEvidence.mock.calls[0][2].idempotencyKey as string;

    resolveFirst(result({
      status: 207,
      added: [{
        fileIndex: 1,
        fileName: 'photo.jpg',
        evidenceId: 'ev-2',
        duplicate: false,
      }],
      rejected: [{ fileIndex: 0, fileName: 'photo.jpg', reason: 'That photo is damaged.' }],
    }));
    const partialAlert = await screen.findByRole('alert');
    expect(partialAlert.textContent).toContain('photo.jpg (file 1)');
    expect(screen.getAllByText('photo.jpg')).toHaveLength(2);
    expect(navigate).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: new RegExp(`Add to ${openCases[0].vrm}`, 'i') }));
    await waitFor(() => expect(uploadEvidence).toHaveBeenCalledTimes(2));
    expect(uploadEvidence.mock.calls[1][2].idempotencyKey).toBe(firstKey);
    const totalAlert = await screen.findByRole('alert');
    expect(totalAlert.textContent).toContain('The files were not added');
    expect(screen.getAllByText('photo.jpg')).toHaveLength(2);
    expect((screen.getByRole('button', {
      name: new RegExp(`Add to ${openCases[0].vrm}`, 'i'),
    }) as HTMLButtonElement).disabled).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
