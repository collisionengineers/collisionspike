import { describe, expect, it } from 'vitest';
import { EVA_FIELD_ORDER, type Case, type EvaFields } from '@cs/domain';
import {
  buildExplicitCaseSave,
  canCheckVehicleDetails,
  initialInspectionDraft,
  inspectionAddressDraftSnapshot,
  persistedSessionSnapshot,
  restoreInspectionAddressDraft,
  restorePersistedImageBasedChoice,
  shouldBlockCaseNavigation,
  startInspectionAddressDraft,
  validateCaseEdit,
} from './case-edit-session';

function caseOf(overrides: Partial<Case> = {}): Case {
  const evaFields = Object.fromEntries(
    EVA_FIELD_ORDER.map((field) => [
      field.key,
      {
        value:
          field.key === 'inspectionAddress'
            ? '1 Test Road\nLondon'
            : field.required
              ? `${field.label} value`
              : '',
        provenance: { sourceType: 'staff', sourceLabel: 'Saved' },
        reviewState: 'reviewed',
      },
    ]),
  ) as unknown as EvaFields;
  // Date fields use their real domain format.
  evaFields.dateOfLoss.value = '01/07/2026';
  evaFields.dateOfInstruction.value = '02/07/2026';
  return {
    id: 'case-1',
    version: 'v1',
    vrm: 'AB12CDE',
    provider: 'QDOS',
    providerCode: 'QDOS',
    vehicleModel: 'Ford Focus',
    evaFields,
    evidence: [],
    notes: [],
    chasers: [],
    overviewFacts: {},
    status: 'needs_review',
    missing: [],
    channel: { kind: 'email', mode: 'auto', sourceMailbox: 'info@example.test' },
    ageDays: 1,
    inspectionDecision: 'manual',
    createdAt: '01/07/2026',
    ...overrides,
  };
}

function clone(c: Case): Case {
  return structuredClone(c);
}

describe('explicit case edit session', () => {
  it('advances draft, baseline and version together after an isolated saved mutation', () => {
    const updated = caseOf({ version: 'v2', vrm: 'XY12ZAB' });
    const snapshot = persistedSessionSnapshot(updated);

    expect(snapshot.draft).toBe(updated);
    expect(snapshot.persisted).toBe(updated);
    expect(snapshot.version).toBe('v2');
    expect(snapshot.inspection).toEqual(initialInspectionDraft(updated));
    expect(
      buildExplicitCaseSave(snapshot.persisted, snapshot.draft, snapshot.inspection),
    ).toBeUndefined();
  });

  it('does not issue a no-op save and resetting to persisted values cancels the draft', () => {
    const persisted = caseOf();
    expect(buildExplicitCaseSave(persisted, clone(persisted), initialInspectionDraft(persisted)))
      .toBeUndefined();

    const edited = clone(persisted);
    edited.evaFields.claimantName.value = 'Changed claimant';
    expect(buildExplicitCaseSave(persisted, edited, initialInspectionDraft(persisted))).toBeDefined();
    expect(buildExplicitCaseSave(persisted, clone(persisted), initialInspectionDraft(persisted)))
      .toBeUndefined();
  });

  it('collects a multi-field change into one request', () => {
    const persisted = caseOf();
    const draft = clone(persisted);
    draft.evaFields.claimantName.value = 'Jane Example';
    draft.evaFields.vehicleModel.value = 'Audi A3';

    expect(buildExplicitCaseSave(persisted, draft, initialInspectionDraft(persisted))).toEqual({
      editSession: true,
      evaFields: { claimantName: 'Jane Example', vehicleModel: 'Audi A3' },
    });
  });

  it('keeps the case type in the same reviewed save', () => {
    const persisted = caseOf();
    const draft = clone(persisted);
    draft.caseType = 'audit';
    expect(buildExplicitCaseSave(persisted, draft, initialInspectionDraft(persisted))).toEqual({
      editSession: true,
      caseType: 'audit',
    });
  });

  it('keeps a physical address and its decision in the same request', () => {
    const persisted = caseOf({ inspectionDecision: 'unknown' });
    const draft = clone(persisted);
    draft.evaFields.inspectionAddress.value = ' 10 Example Road \n London ';

    expect(
      buildExplicitCaseSave(persisted, draft, {
        decisionMode: 'manual',
        sourceLabel: 'confirmed:corpus',
        sourceNote: 'Picked from suggested locations',
        touched: true,
      }),
    ).toEqual({
      editSession: true,
      evaFields: { inspectionAddress: '10 Example Road\nLondon' },
      inspectionDecision: {
        decisionMode: 'manual',
        sourceLabel: 'confirmed:corpus',
        sourceNote: 'Picked from suggested locations',
        addressLines: ['10 Example Road', 'London'],
      },
    });
  });

  it('keeps Image Based Assessment and its reason in the same stable retry body', () => {
    const persisted = caseOf();
    const draft = clone(persisted);
    draft.evaFields.inspectionAddress.value = 'Image Based Assessment';
    const inspection = {
      decisionMode: 'image_based' as const,
      sourceLabel: 'image_based',
      sourceNote: 'Provider accepts a photo assessment',
      touched: true,
    };

    const first = buildExplicitCaseSave(persisted, draft, inspection);
    const retry = buildExplicitCaseSave(persisted, draft, inspection);
    expect(retry).toEqual(first);
    expect(first).toMatchObject({
      editSession: true,
      evaFields: { inspectionAddress: 'Image Based Assessment' },
      inspectionDecision: {
        decisionMode: 'image_based',
        sourceNote: 'Provider accepts a photo assessment',
      },
    });
  });

  it('reports every required/format issue and an undecided inspection choice', () => {
    const draft = caseOf({ inspectionDecision: 'unknown' });
    draft.evaFields.workProvider.value = '';
    draft.evaFields.claimantName.value = '';
    draft.evaFields.dateOfLoss.value = '2026-07-01';
    draft.evaFields.inspectionAddress.value = '';

    const issues = validateCaseEdit(draft, initialInspectionDraft(draft), draft);
    expect(issues).toEqual(expect.arrayContaining([
      { fieldKey: 'workProvider', message: 'Required' },
      { fieldKey: 'claimantName', message: 'Required' },
      { fieldKey: 'dateOfLoss', message: 'Check this value' },
      { fieldKey: 'inspectionAddress', message: 'Required' },
      {
        fieldKey: 'inspectionAddress',
        message: 'Choose an inspection address or Image Based Assessment',
      },
    ]));
  });

  it('does not demand a lost historical image-based reason for an unrelated edit', () => {
    const persisted = caseOf({ inspectionDecision: 'image_based' });
    persisted.evaFields.inspectionAddress.value = 'Image Based Assessment';
    const draft = clone(persisted);
    draft.evaFields.claimantName.value = 'Jane Example';
    const issues = validateCaseEdit(draft, initialInspectionDraft(persisted), persisted);
    expect(issues.some((issue) => issue.message === 'Add the assessment reason')).toBe(false);
  });

  it('blocks Save when a saved image-based case switches to address without choosing one', () => {
    const persisted = caseOf({ inspectionDecision: 'image_based' });
    persisted.evaFields.inspectionAddress.value = 'Image Based Assessment';
    const draft = clone(persisted);
    draft.evaFields.inspectionAddress.value = '';
    const inspection = startInspectionAddressDraft();

    expect(inspection).toMatchObject({ decisionMode: 'unknown', touched: true });
    expect(validateCaseEdit(draft, inspection, persisted)).toEqual(expect.arrayContaining([
      { fieldKey: 'inspectionAddress', message: 'Required' },
      {
        fieldKey: 'inspectionAddress',
        message: 'Choose an inspection address or Image Based Assessment',
      },
    ]));
  });

  it('restores a saved image-based choice as a true no-op after an address detour', () => {
    const persisted = caseOf({ inspectionDecision: 'image_based' });
    persisted.evaFields.inspectionAddress.value = 'Image Based Assessment';
    const addressDraft = clone(persisted);
    addressDraft.evaFields.inspectionAddress.value = '';

    const restored = restorePersistedImageBasedChoice(
      persisted,
      addressDraft,
      startInspectionAddressDraft(),
    );
    expect(restored).toBeDefined();
    if (!restored) throw new Error('expected the saved image-based choice to be restored');

    const save = buildExplicitCaseSave(persisted, restored.draft, restored.inspection);
    expect(restored.inspection).toMatchObject({
      decisionMode: 'image_based',
      sourceNote: '',
      touched: false,
    });
    expect(validateCaseEdit(restored.draft, restored.inspection, persisted)).not.toEqual(
      expect.arrayContaining([
        { fieldKey: 'inspectionAddress', message: 'Add the assessment reason' },
      ]),
    );
    expect(save).toBeUndefined();
    expect(shouldBlockCaseNavigation(save !== undefined)).toBe(false);
  });

  it('retains a selected physical-address draft and its source across an image-based detour', () => {
    const persisted = caseOf({ inspectionDecision: 'image_based' });
    persisted.evaFields.inspectionAddress.value = 'Image Based Assessment';
    const addressDraft = clone(persisted);
    addressDraft.evaFields.inspectionAddress.value = '10 Example Road\nLondon';
    const inspection = {
      decisionMode: 'manual' as const,
      sourceLabel: 'confirmed:corpus',
      sourceNote: 'Picked from suggested locations',
      touched: true,
    };
    const provenance = {
      sourceLabel: 'confirmed:corpus',
      sourceNote: 'Picked from suggested locations',
    };

    expect(restorePersistedImageBasedChoice(persisted, addressDraft, inspection)).toBeUndefined();
    const snapshot = inspectionAddressDraftSnapshot(addressDraft, inspection, provenance);
    const imageBasedDraft = clone(addressDraft);
    imageBasedDraft.evaFields.inspectionAddress.value = 'Image Based Assessment';
    const restored = restoreInspectionAddressDraft(imageBasedDraft, snapshot);

    expect(restored.draft.evaFields.inspectionAddress.value).toBe('10 Example Road\nLondon');
    expect(restored.inspection).toEqual(inspection);
    expect(restored.provenance).toEqual(provenance);
  });

  it('blocks route/window navigation exactly while a draft is dirty', () => {
    expect(shouldBlockCaseNavigation(false)).toBe(false);
    expect(shouldBlockCaseNavigation(true)).toBe(true);
    expect(shouldBlockCaseNavigation(true, '/cases/case-1', '/cases/case-1')).toBe(false);
    expect(shouldBlockCaseNavigation(true, '/cases/case-1', '/cases/case-2')).toBe(true);
  });

  it('allows a vehicle refresh only for a clean versioned edit session', () => {
    expect(canCheckVehicleDetails(false, false, 'AB12 CDE')).toBe(true);
    expect(canCheckVehicleDetails(true, false, 'AB12 CDE')).toBe(false);
    expect(canCheckVehicleDetails(false, true, 'AB12 CDE')).toBe(false);
    expect(canCheckVehicleDetails(false, false, '   ')).toBe(false);
  });
});
