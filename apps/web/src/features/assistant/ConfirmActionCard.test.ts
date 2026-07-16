import { describe, expect, it } from 'vitest';
import type { Case, InboundEmail, ProposedAction } from '../../data';
import {
  buildConfirmationRows,
  confirmationTargetLabel,
  phaseForExecution,
  committedWriteTargetForResult,
  proposalAlreadyApplied,
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
    dateOfLoss: { value: '01/07/2026' },
    vatStatus: { value: 'Yes' },
    mileageUnit: { value: 'Km' },
    inspectionAddress: { value: '' },
  },
  chasers: [
    { channel: 'email', templateUsed: 'Instruction reminder' },
  ],
} as unknown as Case;

const inboundValue = {
  id: 'mail-1',
  subject: 'Instruction received',
  fromAddress: 'sender@example.test',
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
    expect(targetForProposal(proposal('reclassify_inbound', { inboundId: 'mail-1', tag: 'Query' })))
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
          evaFields: {
            claimantName: 'New name',
            vehicleModel: 'Audi A3',
            dateOfLoss: '11/07/2026',
            vatStatus: 'No',
            mileageUnit: 'Miles',
          },
        }),
        caseSnapshot,
      ),
    ).toEqual([
      { label: 'Registration', before: 'AB12 CDE', after: 'XY12ABC' },
      { label: 'Case type', before: 'Audit', after: 'Total-loss audit' },
      { label: 'Claimant name', before: 'Old name', after: 'New name' },
      { label: 'Vehicle model', before: 'Ford Focus', after: 'Audi A3' },
      { label: 'Date of incident', before: '01/07/2026', after: '11/07/2026' },
      { label: 'VAT status', before: 'Yes', after: 'No' },
      { label: 'Mileage unit', before: 'Km', after: 'Miles' },
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
          tag: 'Inspection',
          reason: 'The attached instruction confirms the email type.',
        }),
        inboundSnapshot,
      ),
    ).toEqual([
      { label: 'Email type', before: 'Other', after: 'Receiving work' },
      { label: 'Email detail', before: 'Other', after: 'Existing provider instruction' },
      {
        label: 'Reason',
        before: 'No reason recorded',
        after: 'The attached instruction confirms the email type.',
      },
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

  it('identifies the exact independently fetched case or email', () => {
    expect(confirmationTargetLabel(caseSnapshot)).toBe('Case Not numbered · AB12 CDE');
    expect(confirmationTargetLabel(inboundSnapshot)).toBe(
      'Email · Instruction received · sender@example.test',
    );
  });
});

describe('ConfirmActionCard already-applied protection', () => {
  it('recognises state-setting proposals only when every requested value matches', () => {
    const appliedCase = {
      ...caseValue,
      vrm: 'XY12 ABC',
      caseType: 'audit_total_loss',
      onHold: true,
      inspectionDecision: 'confirmed_physical',
      evaFields: {
        ...caseValue.evaFields,
        claimantName: { value: 'New name' },
        inspectionAddress: { value: '1 High Street\nManchester\nM1 1AA' },
      },
      chasers: [
        ...caseValue.chasers,
        { channel: 'whatsapp', templateUsed: 'Photo reminder' },
      ],
      notes: [{ text: 'Asked for an overview photo' }],
    } as unknown as Case;
    const appliedSnapshot: ConfirmationSnapshot = { kind: 'case', value: appliedCase };

    expect(proposalAlreadyApplied(
      proposal('set_on_hold', { caseId: 'c-1', onHold: true }),
      appliedSnapshot,
    )).toBe(true);
    expect(proposalAlreadyApplied(
      proposal('edit_case_fields', {
        caseId: 'c-1',
        vrm: 'XY12ABC',
        caseType: 'audit_total_loss',
        evaFields: { claimantName: 'New name' },
      }),
      appliedSnapshot,
    )).toBe(true);
    expect(proposalAlreadyApplied(
      proposal('save_inspection_decision', {
        caseId: 'c-1',
        decisionMode: 'confirmed_physical',
        addressLines: ['1 High Street', 'Manchester'],
        postcode: 'M1 1AA',
      }),
      appliedSnapshot,
    )).toBe(false);
    expect(proposalAlreadyApplied(
      proposal('log_chase', {
        caseId: 'c-1',
        channel: 'whatsapp',
        templateLabel: 'Photo reminder',
        note: 'Asked for an overview photo',
      }),
      appliedSnapshot,
    )).toBe(false);
  });

  it('recognises applied inbound changes but never guesses that a case create succeeded', () => {
    const appliedInbound: ConfirmationSnapshot = {
      kind: 'inbound',
      value: {
        ...inboundValue,
        category: 'query',
        subtype: 'query_existing_work',
        triageState: 'routed',
      },
    };
    expect(proposalAlreadyApplied(
      proposal('set_triage_state', { inboundId: 'mail-1', state: 'routed' }),
      appliedInbound,
    )).toBe(true);
    expect(proposalAlreadyApplied(
      proposal('reclassify_inbound', { inboundId: 'mail-1', tag: 'Query' }),
      appliedInbound,
    )).toBe(true);
    expect(proposalAlreadyApplied(
      proposal('create_case', { vrm: 'XY12ABC' }),
      { kind: 'none' },
    )).toBe(false);
  });
});

describe('ConfirmActionCard completion transitions', () => {
  it('leaves Applying on success, stale state, and network failure', () => {
    expect(phaseForExecution({ ok: true, status: 204 })).toBe('done');
    expect(phaseForExecution({ ok: false, status: 409 })).toBe('stale');
    expect(phaseForExecution({ ok: false, status: 0, error: 'offline' })).toBe('ambiguous');
  });

  it('invalidates only the resource confirmed by a successful commit', () => {
    expect(committedWriteTargetForResult(
      { kind: 'case', id: 'case-1' },
      { ok: true, status: 204 },
    )).toEqual({ kind: 'case', id: 'case-1' });
    expect(committedWriteTargetForResult(
      { kind: 'inbound', id: 'mail-1' },
      { ok: true, status: 200 },
    )).toEqual({ kind: 'inbound', id: 'mail-1' });
    expect(committedWriteTargetForResult(
      { kind: 'none' },
      { ok: true, status: 201, resourceId: 'case-new' },
    )).toEqual({ kind: 'case', id: 'case-new' });
    expect(committedWriteTargetForResult(
      { kind: 'case', id: 'case-1' },
      { ok: false, status: 409 },
    )).toBeUndefined();
  });
});
