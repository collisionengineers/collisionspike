import { describe, expect, it } from 'vitest';
import type { Case, InboundEmail, ProposedAction } from '../data';
import {
  buildConfirmationRows,
  phaseForExecution,
  targetForProposal,
  type ConfirmationSnapshot,
} from './ConfirmActionCard';

function proposal(
  capability: string,
  params: Record<string, unknown>,
  body: Record<string, unknown> = params,
): ProposedAction {
  return {
    capability,
    title: 'Review this change',
    method: capability === 'reclassify_inbound' || capability === 'edit_case_fields' ? 'PATCH' : 'POST',
    path: 'resolved/path',
    params,
    body,
  };
}

const caseValue = {
  id: 'c-1',
  vrm: 'AB12 CDE',
  provider: 'Acuity Law',
  providerCode: 'CCPY',
  caseType: 'audit',
  onHold: false,
  inspectionDecision: 'unknown',
  evaFields: {
    claimantName: { value: 'Old name' },
    vehicleModel: { value: 'Ford Focus' },
    inspectionAddress: { value: '' },
  },
  chasers: [
    { channel: 'email', templateUsed: 'Instruction reminder' },
  ],
} as unknown as Case;

const inboundValue = {
  id: 'mail-1',
  subject: 'Instruction received',
  category: 'other',
  subtype: 'other',
  triageState: 'new',
} as InboundEmail;

const caseSnapshot: ConfirmationSnapshot = { kind: 'case', value: caseValue };
const inboundSnapshot: ConfirmationSnapshot = { kind: 'inbound', value: inboundValue };

describe('ConfirmActionCard fresh-target routing', () => {
  it('requires an independent case or inbound read, while create_case has no target', () => {
    expect(targetForProposal(proposal('set_on_hold', { caseId: 'c-1', onHold: true })))
      .toEqual({ kind: 'case', id: 'c-1' });
    expect(targetForProposal(proposal('set_triage_state', { inboundId: 'mail-1', state: 'routed' })))
      .toEqual({ kind: 'inbound', id: 'mail-1' });
    expect(targetForProposal(proposal('reclassify_inbound', { inboundId: 'mail-1', category: 'query' })))
      .toEqual({ kind: 'inbound', id: 'mail-1' });
    expect(targetForProposal(proposal('create_case', { vrm: 'XY12ABC' })))
      .toEqual({ kind: 'none' });
  });
});

describe('ConfirmActionCard capability-specific before/after rows', () => {
  it('shows real current case values for hold and editable fields', () => {
    expect(
      buildConfirmationRows(
        proposal('set_on_hold', { caseId: 'c-1', onHold: true }),
        caseSnapshot,
      ),
    ).toEqual([{ label: 'Case state', before: 'Active', after: 'Held' }]);

    expect(
      buildConfirmationRows(
        proposal('edit_case_fields', {
          caseId: 'c-1',
          vrm: 'XY12ABC',
          caseType: 'audit_total_loss',
          evaFields: { claimantName: 'New name', vehicleModel: 'Audi A3' },
        }),
        caseSnapshot,
      ),
    ).toEqual([
      { label: 'Registration', before: 'AB12 CDE', after: 'XY12ABC' },
      { label: 'Case type', before: 'Audit', after: 'Total-loss audit' },
      { label: 'Claimant name', before: 'Old name', after: 'New name' },
      { label: 'Vehicle model', before: 'Ford Focus', after: 'Audi A3' },
    ]);
  });

  it('shows the inspection decision and chase as changes from current server truth', () => {
    expect(
      buildConfirmationRows(
        proposal('save_inspection_decision', {
          caseId: 'c-1',
          decisionMode: 'address',
          addressLines: ['1 High Street', 'Manchester'],
          postcode: 'M1 1AA',
          sourceNote: 'Confirmed with claimant',
        }),
        caseSnapshot,
      ),
    ).toEqual([
      { label: 'Inspection method', before: 'Not decided', after: 'Physical address' },
      {
        label: 'Decision details',
        before: 'Not set',
        after: '1 High Street, Manchester, M1 1AA',
      },
    ]);

    expect(
      buildConfirmationRows(
        proposal('log_chase', {
          caseId: 'c-1',
          channel: 'whatsapp',
          templateLabel: 'Photo reminder',
          note: 'Asked for an overview photo',
        }),
        caseSnapshot,
      ),
    ).toEqual([
      {
        label: 'Latest chase',
        before: 'Email · Instruction reminder',
        after: 'WhatsApp · Photo reminder',
      },
      { label: 'New note', before: 'No new note', after: 'Asked for an overview photo' },
    ]);
  });

  it('uses the independently fetched inbound row for triage and classification comparisons', () => {
    expect(
      buildConfirmationRows(
        proposal('set_triage_state', { inboundId: 'mail-1', state: 'routed' }),
        inboundSnapshot,
      ),
    ).toEqual([{ label: 'Email state', before: 'New', after: 'Routed' }]);

    expect(
      buildConfirmationRows(
        proposal('reclassify_inbound', {
          inboundId: 'mail-1',
          category: 'receiving_work',
          subtype: 'existing_provider_instruction',
        }),
        inboundSnapshot,
      ),
    ).toEqual([
      { label: 'Email type', before: 'Other', after: 'Receiving work' },
      { label: 'Email detail', before: 'Other', after: 'Existing provider instruction' },
    ]);
  });

  it('shows create_case as a new record without pretending there is a target to re-fetch', () => {
    expect(
      buildConfirmationRows(
        proposal('create_case', {
          vrm: 'XY12ABC',
          providerCode: 'CCPY',
          claimantName: 'Alex Smith',
        }),
        { kind: 'none' },
      ),
    ).toEqual([
      { label: 'Registration', before: 'No case', after: 'XY12ABC' },
      { label: 'Work provider', before: 'No case', after: 'CCPY' },
      { label: 'Claimant', before: 'No case', after: 'Alex Smith' },
    ]);
  });

  it('keeps the confirmation rows in staff language', () => {
    const rendered = JSON.stringify(
      buildConfirmationRows(
        proposal('edit_case_fields', {
          caseId: 'c-1',
          evaFields: { claimantName: 'New name' },
        }),
        caseSnapshot,
      ),
    );
    expect(rendered).not.toMatch(/API|endpoint|payload|schema|JSON|Azure|Postgres|MSAL|JWT/i);
  });
});

describe('ConfirmActionCard completion transitions', () => {
  it('leaves Applying on success, stale state, and network failure', () => {
    expect(phaseForExecution({ ok: true, status: 204 })).toBe('done');
    expect(phaseForExecution({ ok: false, status: 409 })).toBe('stale');
    expect(phaseForExecution({ ok: false, status: 0, error: 'offline' })).toBe('error');
  });
});
