// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  configureDataAccess,
  createEmptyDataAccess,
  useEmptyDataAccess,
  type EvidenceUploadResult,
} from '../../data';
import type { CreateCaseInput } from '@cs/domain';
import type { DataAccessExt } from '../../data/rest-client';
import { ManualIntake } from './ManualIntake';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

let createCase: ReturnType<typeof vi.fn>;
let uploadEvidence: ReturnType<typeof vi.fn>;

const uploadResult = (): EvidenceUploadResult => ({
  status: 201,
  added: [{
    fileIndex: 0,
    fileName: 'vehicle.jpg',
    evidenceId: 'evidence-1',
    duplicate: false,
  }],
  rejected: [],
});

beforeEach(() => {
  navigate.mockReset();
  sessionStorage.clear();
  createCase = vi.fn(async () => ({ id: 'case-image-test' }));
  uploadEvidence = vi.fn(async () => uploadResult());
  const base = createEmptyDataAccess();
  configureDataAccess({
    ...base,
    createCase,
    uploadEvidence,
    holdNewCasesDefault: vi.fn(async () => false),
  } as DataAccessExt);
});

afterEach(() => {
  cleanup();
  useEmptyDataAccess();
  sessionStorage.clear();
});

async function openImagesOnly(files: File[] = []): Promise<void> {
  const user = userEvent.setup();
  render(<ManualIntake />);
  if (files.length > 0) {
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error('Manual Intake file input was not rendered');
    fireEvent.change(fileInput, { target: { files } });
  }
  await user.click(screen.getByRole('button', { name: 'Images only (no instructions yet)' }));
}

describe('Manual Intake images-only rendered workflow', () => {
  it('renders one coherent claimant and vehicle group without insured or instruction-only fields', async () => {
    await openImagesOnly();

    const details = screen.getByRole('group', { name: 'Claimant and vehicle details' });
    const labels = ['Claimant name', 'Registration', 'Make', 'Vehicle model', 'Mileage'];
    const controls = labels.map((label) => within(details).getByLabelText(new RegExp(`^${label}`)));

    for (const control of controls) expect(details.contains(control)).toBe(true);
    for (let index = 1; index < controls.length; index += 1) {
      expect(controls[index - 1].compareDocumentPosition(controls[index]) & Node.DOCUMENT_POSITION_FOLLOWING)
        .toBeTruthy();
    }

    expect(screen.queryByLabelText('Insured Name')).toBeNull();
    expect(screen.queryByLabelText('Work provider')).toBeNull();
    expect(screen.queryByLabelText('Principal')).toBeNull();
    expect(screen.queryByLabelText("Provider's reference / Claim No")).toBeNull();
    expect(screen.queryByLabelText('Intake status')).toBeNull();
    expect(screen.queryByLabelText('Accident circumstances')).toBeNull();
    expect(screen.queryByLabelText('Inspect on (inspection date)')).toBeNull();
  });

  it('requires only image-arrival, registration, model, location and at least one photo', async () => {
    await openImagesOnly();

    const warning = screen.getByText('Required before creating').closest('[role="group"]');
    if (!warning) throw new Error('Required-fields warning was not rendered');
    expect(warning.textContent).toContain('Registration');
    expect(warning.textContent).toContain('Received from');
    expect(warning.textContent).toContain('Vehicle model');
    expect(warning.textContent).toContain('Location');
    expect(warning.textContent).toContain('At least one photo');
    expect(warning.textContent).not.toContain('Claimant name');
    expect((screen.getByRole('button', { name: 'Create case' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it('persists claimant identity but cannot submit insured or provider fields', async () => {
    const user = userEvent.setup();
    await openImagesOnly([
      new File(['disposable image'], 'vehicle.jpg', { type: 'image/jpeg' }),
    ]);

    // These assertions exercise the controlled form state and submit contract,
    // not keyboard mechanics. Direct changes keep this large rendered form
    // deterministic under the full repository gate instead of spending the
    // default timeout dispatching dozens of synthetic key events.
    fireEvent.change(screen.getByLabelText(/^Received from/), {
      target: { value: 'TKT-024 verification' },
    });
    fireEvent.change(screen.getByLabelText('Claimant name'), {
      target: { value: 'Rachael Driver' },
    });
    fireEvent.change(screen.getByLabelText(/^Registration/), {
      target: { value: 'T24IMG' },
    });
    fireEvent.change(screen.getByLabelText(/^Vehicle model/), {
      target: { value: 'Test vehicle' },
    });
    fireEvent.change(screen.getByLabelText(/^Location/), {
      target: { value: 'Test inspection address' },
    });

    const submit = screen.getByRole('button', { name: 'Create case' });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    await user.click(submit);

    await waitFor(() => expect(createCase).toHaveBeenCalledTimes(1));
    const input = createCase.mock.calls[0][0] as CreateCaseInput;
    expect(input.evaFields.claimantName.value).toBe('Rachael Driver');
    expect(input.vrm).toBe('T24IMG');
    expect(input.status).toBe('ingested');
    expect(input.sourceLabel).toBe('Images received — from TKT-024 verification');
    expect(input).not.toHaveProperty('insuredName');
    expect(input).not.toHaveProperty('provider');
    expect(input).not.toHaveProperty('providerCode');
    expect(input).not.toHaveProperty('providerReference');
    expect(createCase.mock.calls[0][1]).toBeUndefined();

    await waitFor(() => expect(uploadEvidence).toHaveBeenCalledTimes(1));
    expect(uploadEvidence.mock.calls[0][0]).toBe('case-image-test');
    expect(uploadEvidence.mock.calls[0][2]).toMatchObject({
      source: 'manual_intake',
      fileRoles: ['extra'],
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/case/case-image-test'));
  });
});
