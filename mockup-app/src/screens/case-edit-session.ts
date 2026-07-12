import {
  EVA_FIELD_ORDER,
  normaliseEvaEdit,
  type Case,
  type CaseUpdateInput,
  type EvaFieldKey,
  type InspectionDecisionInput,
} from '@cs/domain';

export interface CaseEditInspectionDraft {
  decisionMode: Case['inspectionDecision'];
  sourceLabel: string;
  sourceNote: string;
  /** True only after this edit session deliberately changes/confirms the choice. */
  touched: boolean;
}

export interface CaseEditValidationIssue {
  fieldKey: EvaFieldKey;
  message: string;
}

export type ExplicitCaseSaveInput = CaseUpdateInput & { editSession: true };

export function initialInspectionDraft(c: Case): CaseEditInspectionDraft {
  return {
    decisionMode: c.inspectionDecision,
    sourceLabel: c.inspectionDecision === 'image_based' ? 'image_based' : 'manual',
    sourceNote: '',
    touched: false,
  };
}

/** Build the new edit-session baseline after a separately saved server mutation.
 * The caller may adopt this only when the main draft is clean. */
export function persistedSessionSnapshot(updated: Case) {
  return {
    draft: updated,
    persisted: updated,
    version: updated.version ?? '',
    inspection: initialInspectionDraft(updated),
  } as const;
}

function changedEvaFields(
  persisted: Case,
  draft: Case,
): Partial<Record<EvaFieldKey, string>> {
  const changed: Partial<Record<EvaFieldKey, string>> = {};
  for (const { key } of EVA_FIELD_ORDER) {
    const before = persisted.evaFields[key]?.value ?? '';
    const after = draft.evaFields[key]?.value ?? '';
    if (after !== before) changed[key] = after;
  }
  return changed;
}

function inspectionChanged(
  persisted: Case,
  draft: Case,
  inspection: CaseEditInspectionDraft,
): boolean {
  return (
    inspection.decisionMode !== persisted.inspectionDecision ||
    draft.evaFields.inspectionAddress.value !== persisted.evaFields.inspectionAddress.value ||
    inspection.touched
  );
}

function inspectionInput(
  draft: Case,
  inspection: CaseEditInspectionDraft,
): InspectionDecisionInput {
  const imageBased = inspection.decisionMode === 'image_based';
  return {
    decisionMode: inspection.decisionMode,
    sourceLabel: inspection.sourceLabel.trim() || (imageBased ? 'image_based' : 'manual'),
    sourceNote:
      inspection.sourceNote.trim() ||
      (imageBased ? '' : 'Entered and confirmed by staff'),
    ...(imageBased
      ? {}
      : {
          addressLines: draft.evaFields.inspectionAddress.value
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        }),
  };
}

/** Build the single reviewed request. Undefined means a true no-op: no request and
 *  therefore no audit/status churn. */
export function buildExplicitCaseSave(
  persisted: Case,
  draft: Case,
  inspection: CaseEditInspectionDraft,
): ExplicitCaseSaveInput | undefined {
  const evaFields = changedEvaFields(persisted, draft);
  const hasInspectionChange = inspectionChanged(persisted, draft, inspection);
  const caseTypeChanged = (draft.caseType ?? 'standard') !== (persisted.caseType ?? 'standard');
  if (Object.keys(evaFields).length === 0 && !hasInspectionChange && !caseTypeChanged) return undefined;
  const decision = hasInspectionChange ? inspectionInput(draft, inspection) : undefined;
  if (decision) {
    evaFields.inspectionAddress =
      decision.decisionMode === 'image_based'
        ? 'Image Based Assessment'
        : (decision.addressLines ?? []).join('\n');
  }

  return {
    editSession: true,
    ...(Object.keys(evaFields).length > 0 ? { evaFields } : {}),
    ...(decision ? { inspectionDecision: decision } : {}),
    ...(caseTypeChanged ? { caseType: draft.caseType ?? 'standard' } : {}),
  };
}

/** The case-page save uses the same required flags and value normaliser as the
 *  readiness/write boundary. All issues are returned so the screen can point to
 *  every field, rather than stopping at the first one. */
export function validateCaseEdit(
  draft: Case,
  inspection: CaseEditInspectionDraft,
  persisted?: Case,
): CaseEditValidationIssue[] {
  const issues: CaseEditValidationIssue[] = [];
  for (const field of EVA_FIELD_ORDER) {
    const raw = draft.evaFields[field.key]?.value ?? '';
    if (field.required && !raw.trim()) {
      issues.push({ fieldKey: field.key, message: 'Required' });
      continue;
    }
    const normalized = normaliseEvaEdit(field.key, raw);
    if ('error' in normalized) {
      issues.push({ fieldKey: field.key, message: 'Check this value' });
    }
  }

  const address = draft.evaFields.inspectionAddress.value.trim();
  if (inspection.decisionMode === 'unknown') {
    issues.push({
      fieldKey: 'inspectionAddress',
      message: 'Choose an inspection address or Image Based Assessment',
    });
  } else if (inspection.decisionMode === 'image_based') {
    if (address !== 'Image Based Assessment') {
      issues.push({ fieldKey: 'inspectionAddress', message: 'Confirm Image Based Assessment' });
    }
    const reasonIsPartOfThisSave =
      !persisted || inspectionChanged(persisted, draft, inspection);
    if (reasonIsPartOfThisSave && !inspection.sourceNote.trim()) {
      issues.push({ fieldKey: 'inspectionAddress', message: 'Add the assessment reason' });
    }
  } else if (!address || address === 'Image Based Assessment') {
    issues.push({ fieldKey: 'inspectionAddress', message: 'Choose an inspection address' });
  } else {
    const lines = address.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length > 6 || lines.some((line) => line.length > 200)) {
      issues.push({ fieldKey: 'inspectionAddress', message: 'Use up to 6 address lines' });
    }
  }

  return issues.filter(
    (issue, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.fieldKey === issue.fieldKey && candidate.message === issue.message,
      ) === index,
  );
}

export function shouldBlockCaseNavigation(hasUnsavedChanges: boolean): boolean {
  return hasUnsavedChanges;
}
