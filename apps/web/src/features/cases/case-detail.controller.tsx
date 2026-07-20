import { useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';
import { Link, Toast, ToastBody, ToastTitle, useToastController } from '@fluentui/react-components';
import { computeReadiness, useSeverityChipStyles, type ChecklistItem, type GuidedPhotoLink } from '../../shared/ui';
import { data, EVA_FIELD_ORDER, dueInfo, getSharedLink, statusToStage, checkVrm, useBoxGates, useCaseUpdate, useDeleteCaseImageGate, useLogChase, useInspectionAddressSuggestions, useLocationAssistGate, activeGetSharedLinkTransport, serverMessageOf, type Case, type CaseStatus, type EvaFieldKey, type Evidence, type PipelineStageKey, type SuggestedAddress } from '../../data';
import { canSubmitCaseToEva, allowedCaseTypes, CASE_PO_SHAPE_RE, derivedMarkerCasePo, isValidEvaMileage, normalizeCasePo, type CaseWorkType } from '@cs/domain';
import { GLOBAL_TOASTER_ID } from '../../shared/ui';
import { inspectionChoiceForCase } from '../../shared/ui/InspectionChoice';
// DataAccessExt: the SPA-side seam with the work-todo-spike additive methods
// (removeCase). The base DataAccess in '@cs/domain' stays the frozen server contract.
// DataAccessExt: the SPA-side seam with the work-todo-spike additive methods
// (removeCase). The base DataAccess in '@cs/domain' stays the frozen server contract.
import type { DataAccessExt } from '../../data/rest-client';
import { buildExplicitCaseSave, canCheckVehicleDetails, initialInspectionDraft, persistedSessionSnapshot, shouldBlockCaseNavigation, validateCaseEdit, type CaseEditInspectionDraft, type InspectionAddressDraftSnapshot } from './case-edit-session';

/* ============================================================
   CaseDetail — the core review screen.
   Header (back / title / status / actions) + a count-only "blocked"
   MessageBar, then a 2fr/1fr grid: MAIN tabs [Fields|Evidence|Address|
   Notes|Chasers] and a SIDEBAR with the ONE canonical readiness list
   (each ✗ row deep-links to the owning tab + field) and a greyed
   read-only "Case facts" panel.

   Case fields use one explicit draft/save transaction. Photo controls remain
   individually server-confirmed and are labelled separately on the Evidence tab.
   ============================================================ */

/* ============================================================
   CaseDetail — the core review screen.
   Header (back / title / status / actions) + a count-only "blocked"
   MessageBar, then a 2fr/1fr grid: MAIN tabs [Fields|Evidence|Address|
   Notes|Chasers] and a SIDEBAR with the ONE canonical readiness list
   (each ✗ row deep-links to the owning tab + field) and a greyed
   read-only "Case facts" panel.

   Case fields use one explicit draft/save transaction. Photo controls remain
   individually server-confirmed and are labelled separately on the Evidence tab.
   ============================================================ */
import { useStyles } from './case-detail.styles';
export type TabName = 'fields' | 'evidence' | 'address' | 'notes' | 'chasers' | 'emails';

/* The EVA field clusters, label/required lookup, and the editable field row are
   shared with ManualIntake (src/shared/ui/EvaFields.tsx) so they cannot drift. */

export const POLICY_LABEL: Record<Case['inspectionDecision'], string> = {
  confirmed_physical: 'Physical inspection (confirmed)',
  manual: 'Manual override',
  image_based: 'Image Based Assessment',
  unknown: 'Undecided',
};

/* Plain-English case work-type labels (ADR-0021 / TKT-057). The AP. refinement is
   a REVIEW-time decision — the QDOS instruction letters are identical whether the
   audit resolves repairable or total-loss, so a reviewer sets it here. */
export const CASE_WORK_TYPE_LABELS: Record<CaseWorkType, string> = {
  standard: 'Standard case',
  audit: 'Audit review',
  audit_total_loss: 'Total-loss audit review',
  diminution: 'Diminution review',
};

/** Friendly label per evidence kind for the Documents list. */
export const EVIDENCE_KIND_LABEL: Record<string, string> = {
  instruction: 'Instruction',
  email: 'Email (.eml)',
  valuation: 'Valuation report',
  eva_payload: 'EVA file',
  video: 'Video',
  image: 'Photo',
  other: 'Document',
};

/* Map this case's status onto the pipeline-spine stage it should light "you are
   here". Uses the shared funnel map (mock/queues.ts) so spine + dashboard agree.
   `error` has no funnel stage (statusToStage → undefined); on the per-case spine
   it still needs a home, and "Not ready" is the least-wrong placement for a
   stalled/errored case. */
function caseStageKey(status: CaseStatus): PipelineStageKey {
  return statusToStage(status) ?? 'not_ready';
}

/* Resolve a readiness ChecklistItem to the tab that owns it and, for a field
   item, the EvaFieldKey to focus. Keeps the deep-link the ONE blocker UI. */
function checklistTarget(item: ChecklistItem, c: Case): { tab: TabName; fieldKey?: EvaFieldKey } {
  if (item.group === 'images') return { tab: 'evidence' };
  if (item.group === 'source') return { tab: 'evidence' };
  if (item.group === 'address') return { tab: 'address' };
  if (item.group === 'conflicts') {
    const conflict = EVA_FIELD_ORDER.find((d) => c.evaFields[d.key].reviewState === 'conflict');
    return { tab: 'fields', fieldKey: conflict?.key };
  }
  // fields group — id is `field-<key>`.
  const key = item.id.startsWith('field-') ? (item.id.slice('field-'.length) as EvaFieldKey) : undefined;
  return { tab: 'fields', fieldKey: key };
}

/* ---------- Evidence card ---------- */

/* ---------- Evidence card ---------- */
import { useAddressWorkflow } from './case-detail-address';
import { useEvidenceWorkflow } from './case-detail-evidence';
import type { CaseDetailViewProps } from './case-detail.types';

export function useCaseDetailController({ caseData, images, imagesLoading, onRefreshImages }: CaseDetailViewProps) {
  const styles = useStyles();
  const chips = useSeverityChipStyles();
  const { logChase } = useLogChase();
  const navigate = useNavigate();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  // One local working copy plus the last server-confirmed baseline. EVA fields and
  // the inspection decision remain here until the explicit Save succeeds.
  const [c, setC] = useState<Case>(caseData);
  const [persistedCase, setPersistedCase] = useState<Case>(caseData);
  const [caseVersion, setCaseVersion] = useState(caseData.version ?? '');
  const [savingEdits, setSavingEdits] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [saveConflict, setSaveConflict] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  // Editable VRM (issue #12) — the human-correction safety net for a mis-extracted
  // registration. View mode shows the plate; edit mode swaps in a validated field.
  const { update: updateCaseVrm, saving: savingVrm } = useCaseUpdate();
  const [editingVrm, setEditingVrm] = useState(false);
  const [vrmDraft, setVrmDraft] = useState(caseData.vrm);
  // ADR-0022 transition seam — staff stamp the REAL Case/PO at EVA-add (own hook
  // instance so its saving flag never crosses with the VRM editor's).
  const { update: updateCasePo, saving: savingPo } = useCaseUpdate();
  const [editingPo, setEditingPo] = useState(false);
  const [poDraft, setPoDraft] = useState(caseData.casePo ?? '');
  const vrmInputRef = useRef<HTMLInputElement>(null);
  const vrmEditBtnRef = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<TabName>('fields');
  const [noteDraft, setNoteDraft] = useState('');
  const [overrideAddr, setOverrideAddr] = useState(
    inspectionChoiceForCase(caseData) === 'image_based',
  );
  const [overrideReason, setOverrideReason] = useState('');
  const [inspectionDraft, setInspectionDraft] = useState<CaseEditInspectionDraft>(() =>
    initialInspectionDraft(caseData),
  );
  // Plain-language source of a confirmed suggestion. It remains part of the
  // unsaved edit session until Save changes succeeds.
  const [confirmedProvenance, setConfirmedProvenance] = useState<
    { sourceLabel: string; sourceNote: string } | undefined
  >(undefined);
  // Preserve an unsaved physical-address choice while the handler temporarily
  // switches to Image Based Assessment, so switching back before Save is lossless.
  const [addressDraftSnapshot, setAddressDraftSnapshot] =
    useState<InspectionAddressDraftSnapshot>();
  const decisionMode = inspectionDraft.decisionMode;

  /** Adopt a complete server-confirmed snapshot after an isolated mutation. Those
   * controls are disabled while this edit session is dirty, so the snapshot is the
   * new draft and baseline together rather than a competing local edit. */
  const adoptPersistedCase = (updated: Case) => {
    const snapshot = persistedSessionSnapshot(updated);
    setC(snapshot.draft);
    setPersistedCase(snapshot.persisted);
    setCaseVersion(snapshot.version);
    setInspectionDraft(snapshot.inspection);
    setOverrideAddr(updated.inspectionDecision === 'image_based');
    setOverrideReason('');
    setConfirmedProvenance(undefined);
    setAddressDraftSnapshot(undefined);
    setSaveError(undefined);
    setSaveConflict(false);
  };

  const refreshAfterAiPromotion = async () => {
    onRefreshImages();
    const updated = await data.caseById(c.id);
    if (updated) adoptPersistedCase(updated);
  };

  // Low-confidence inspection-address SUGGESTIONS for this case (corpus). Always
  // surfaced strictly as suggestions; picking one copies it into the manual draft
  // and sets the decision to manual — it NEVER auto-confirms or sets image_based.
  // Search term for the inspection-address corpus. Empty = the ranked shortlist
  // (≤8); ≥2 chars searches the whole ~2,200-row corpus (TKT-062 — the picker used
  // to dump every row). The server ignores <2 chars, so typing "" restores the shortlist.
  const [addrSearch, setAddrSearch] = useState('');
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const suggestionsQuery = useInspectionAddressSuggestions(caseData.id, addrSearch);
  const suggestions = suggestionsQuery.data ?? [];
  const addrSearching = addrSearch.trim().length >= 2;

  // Live location-assist (Phase 4a) — a reviewer-invoked action that PROPOSES
  // candidate inspection locations from the case's own photos + text clues. Gated
  // off by default (the action is hidden unless LOCATION_ASSIST_ENABLED &&
  // AZURE_MAPS_ENABLED are on AND the API base is set). Returned candidates are
  // surfaced strictly as suggestions; picking one runs the SAME confirm path as a
  // corpus suggestion (copy into the manual draft + decision=manual). NOTHING
  // auto-applies and nothing fires on load — only the explicit button click calls
  // out. The candidates live ONLY in this working copy until "Use this address".
  const { data: assistGate } = useLocationAssistGate();
  const locationAssistEnabled = assistGate?.enabled ?? false;
  // The deeper AI vision-reasoning escalation (TKT-078) — ships DARK, so this is false live today.
  const assistAiEnabled = assistGate?.aiEnabled ?? false;
  const [assistRunning, setAssistRunning] = useState(false);
  const [assistCandidates, setAssistCandidates] = useState<SuggestedAddress[]>([]);
  // null = not run yet; true/false = the last run's "no confident location" result.
  const [assistNoResult, setAssistNoResult] = useState<boolean | null>(null);
  // Box (Archive) feature gates — undefined/loading reads as all-off. The chaser
  // upload-link action needs BOTH the gate AND a configured template; the
  // "Open in Archive" deep link needs only the master API gate.
  const { data: gates } = useBoxGates();
  const archiveEnabled = gates?.apiEnabled ?? false;
  const uploadLinkEnabled = (gates?.fileRequestEnabled ?? false) && (gates?.fileRequestTemplateConfigured ?? false);
  const [openingArchive, setOpeningArchive] = useState(false);

  /* "Open in Archive" — fetch the server-minted folder deep link, then open it in
     a new tab (an external navigation, NOT a fetch — CSP `connect-src` is moot).
     Honest states: a not_connected / folder_not_ready / error toasts the reason
     and opens nothing. NO iframe / embed — link only. */
  const onOpenInArchive = async () => {
    if (openingArchive) return;
    setOpeningArchive(true);
    try {
      const result = await getSharedLink(c.id, activeGetSharedLinkTransport);
      if (result.status === 'ok' && result.data?.folderUrl) {
        window.open(result.data.folderUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      const reason =
        result.status === 'folder_not_ready'
          ? 'The case archive folder isn’t ready yet.'
          : result.message ?? 'The archive isn’t available yet.';
      dispatchToast(
        <Toast>
          <ToastTitle>Can’t open the archive</ToastTitle>
          <ToastBody>{reason}</ToastBody>
        </Toast>,
        { intent: 'warning' },
      );
    } finally {
      setOpeningArchive(false);
    }
  };

  // Focus targets for field deep-links (keyed by EvaFieldKey).
  const fieldRefs = useRef<Partial<Record<EvaFieldKey, HTMLElement | null>>>({});
  const registerRef = (key: EvaFieldKey, el: HTMLElement | null) => {
    fieldRefs.current[key] = el;
  };

  // TKT-124: the photo set is IMAGE-kind evidence ONLY (kind-based, not filename).
  // The server /images route already filters to kind=image, but a mislabelled or
  // mislabelled row (.eml/PDF marked image-adjacent) must never reach the photo grid or
  // the EVA photo orderer — non-image artifacts belong to the Documents list.
  const imageEvidence = useMemo(() => images.filter((e) => e.kind === 'image'), [images]);
  // Mirror server-confirmed image edits into the working copy so readiness recomputes.
  const [imgState, setImgState] = useState<Evidence[]>(imageEvidence);
  // Adopt fresh server truth whenever the fetched image set changes (first load can
  // land after mount; onRefreshImages refetches after an AI promotion). Server truth
  // also wins on refresh after any outside change.
  useEffect(() => {
    setImgState(imageEvidence);
  }, [imageEvidence]);

  // Readiness is derived from the working copy (with current image edits folded in).
  const liveCase: Case = {
    ...c,
    evidence: [
      ...imgState,
      ...c.evidence.filter((e) => e.kind !== 'image'),
    ],
  };
  const readiness = computeReadiness(liveCase);
  const blocked = !canSubmitCaseToEva(liveCase);
  const workflowBlocked = readiness.ready && blocked;
  const blockerCount = readiness.missing.length + (workflowBlocked ? 1 : 0);
  const vehicleNeedsAttention = c.vrm.trim().length > 0 && (
    !c.evaFields.vehicleModel.value.trim() || !isValidEvaMileage(c.evaFields.mileage.value)
  );
  const vehicleWarning = c.vehicleLookup?.warning ?? (
    vehicleNeedsAttention ? 'Vehicle model or mileage is missing.' : undefined
  );

  const caseSaveInput = buildExplicitCaseSave(persistedCase, c, inspectionDraft);
  const hasUnsavedChanges = caseSaveInput !== undefined;
  const editValidation = hasUnsavedChanges
    ? validateCaseEdit(c, inspectionDraft, persistedCase)
    : [];
  const validationByField = new Map(
    editValidation.map((issue) => [issue.fieldKey, issue.message] as const),
  );
  const invalidFieldCount = new Set(editValidation.map((issue) => issue.fieldKey)).size;
  const canSaveEdits =
    hasUnsavedChanges &&
    editValidation.length === 0 &&
    caseVersion.length > 0 &&
    !savingEdits &&
    !saveConflict;
  const navigationBlocker = useBlocker(shouldBlockCaseNavigation(hasUnsavedChanges));

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeClose);
    return () => window.removeEventListener('beforeunload', warnBeforeClose);
  }, [hasUnsavedChanges]);

  const toast = (title: string) =>
    dispatchToast(
      <Toast>
        <ToastTitle>{title}</ToastTitle>
      </Toast>,
      { intent: 'success' },
    );
  const [checkingVehicle, setCheckingVehicle] = useState(false);
  const checkVehicleAgain = async () => {
    if (!canCheckVehicleDetails(hasUnsavedChanges, checkingVehicle, c.vrm)) return;
    setCheckingVehicle(true);
    try {
      await data.lookupVehicle({ caseId: c.id });
      const updated = await data.caseById(c.id);
      if (!updated) throw new Error('case refresh returned no case');
      // The action is disabled while the draft is dirty, so adopting the full
      // server snapshot safely advances draft, baseline and optimistic version
      // together. A later Save therefore cannot use a stale version.
      adoptPersistedCase(updated);
      toast('Vehicle details checked');
    } catch {
      dispatchToast(
        <Toast><ToastTitle>Couldn’t check vehicle details — try again</ToastTitle></Toast>,
        { intent: 'error' },
      );
    } finally {
      setCheckingVehicle(false);
    }
  };

  const restorePersistedDraft = () => {
    setC(persistedCase);
    setInspectionDraft(initialInspectionDraft(persistedCase));
    setOverrideAddr(persistedCase.inspectionDecision === 'image_based');
    setOverrideReason('');
    setConfirmedProvenance(undefined);
    setAddressDraftSnapshot(undefined);
    setSaveError(undefined);
    setSaveConflict(false);
    setDiscardOpen(false);
  };

  const saveCaseEdits = async () => {
    if (!caseSaveInput || editValidation.length > 0 || savingEdits) return;
    if (!caseVersion) {
      setSaveError('Reload this case before saving your changes.');
      return;
    }
    setSavingEdits(true);
    setSaveError(undefined);
    setSaveConflict(false);
    try {
      const updated = await (data as DataAccessExt).saveCaseEdits(
        c.id,
        caseSaveInput,
        caseVersion,
      );
      setC(updated);
      setPersistedCase(updated);
      setCaseVersion(updated.version ?? caseVersion);
      setInspectionDraft(initialInspectionDraft(updated));
      setOverrideAddr(updated.inspectionDecision === 'image_based');
      setOverrideReason('');
      setConfirmedProvenance(undefined);
      setAddressDraftSnapshot(undefined);
      toast('Changes saved');
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error
          ? Number((error as { status?: unknown }).status)
          : 0;
      const conflict = status === 409;
      setSaveConflict(conflict);
      setSaveError(
        conflict
          ? 'This case changed while you were editing it. Reload it before saving.'
          : serverMessageOf(error) ?? 'Your changes weren’t saved. Check your connection and try again.',
      );
    } finally {
      setSavingEdits(false);
    }
  };

  const reloadLatestForReconcile = async () => {
    if (!caseSaveInput || savingEdits) return;
    setSavingEdits(true);
    try {
      const latest = await data.caseById(c.id);
      if (!latest?.version) {
        setSaveError('Couldn’t reload the latest case. Try again.');
        return;
      }
      // Rebase only the fields this session actually changed. Concurrent edits to
      // every other field stay on the latest server copy and cannot be overwritten.
      const intendedFields = caseSaveInput.evaFields ?? {};
      const reconciled: Case = {
        ...latest,
        evaFields: {
          ...latest.evaFields,
          ...Object.fromEntries(
            Object.keys(intendedFields).map((key) => [
              key,
              c.evaFields[key as EvaFieldKey],
            ]),
          ),
        },
      };
      if (caseSaveInput.caseType !== undefined) {
        if (c.caseType) reconciled.caseType = c.caseType;
        else delete reconciled.caseType;
      }
      setPersistedCase(latest);
      setCaseVersion(latest.version);
      setC(reconciled);
      setInspectionDraft(
        caseSaveInput.inspectionDecision ? inspectionDraft : initialInspectionDraft(latest),
      );
      setAddressDraftSnapshot(undefined);
      setSaveConflict(false);
      setSaveError(undefined);
      toast('Latest case loaded — review your changes before saving');
    } catch {
      setSaveError('Couldn’t reload the latest case. Try again.');
    } finally {
      setSavingEdits(false);
    }
  };

  /* --- Case type (TKT-057 — the AP. review-time refinement) ---
     This is part of the same explicit draft as the EVA fields. */
  const currentCaseType: CaseWorkType = c.caseType ?? 'standard';
  const caseTypeOptions = useMemo<CaseWorkType[]>(() => {
    const opts = new Set<CaseWorkType>(['standard', ...allowedCaseTypes(c.providerCode)]);
    opts.add(currentCaseType); // never hide the current value, even off-allowlist
    return [...opts];
  }, [c.providerCode, currentCaseType]);
  const showCaseTypeControl =
    allowedCaseTypes(c.providerCode).length > 0 || currentCaseType !== 'standard';
  const derivedAuditId = derivedMarkerCasePo(currentCaseType, c.casePo);
  const setCaseType = (next: CaseWorkType) => {
    if (next === currentCaseType) return;
    setC((previous) => {
      const updated = { ...previous };
      if (next === 'standard') delete updated.caseType;
      else updated.caseType = next;
      return updated;
    });
    toast('Case type selected — save changes when ready');
  };

  /* --- Close case (TKT-010, re-scoped 2026-07-08) ---
     Available to ALL staff (the Superuser gate is dropped — the API guard is now
     CollisionSpike.User). A CLOSE, not a delete: the server sets the terminal
     soft state and keeps every detail (non-destructive, reversible in principle);
     the case just leaves the work queues. The Box folder is NEVER auto-deleted —
     the checkbox is an ACK only (ADR-0017). */
  const isRemoved = c.status === 'removed';
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeConfirmText, setRemoveConfirmText] = useState('');
  const [removeAckBox, setRemoveAckBox] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const [removing, setRemoving] = useState(false);
  // What the operator must type to confirm — the Case/PO, or the VRM/id if there's none yet.
  const removeMatch = (c.casePo || c.vrm || c.id).trim();
  const removeConfirmed =
    removeMatch.length > 0 && removeConfirmText.trim().toUpperCase() === removeMatch.toUpperCase();

  const openRemove = () => {
    setRemoveConfirmText('');
    setRemoveAckBox(false);
    setRemoveReason('');
    setRemoveOpen(true);
  };

  const doRemove = async () => {
    if (!removeConfirmed || removing) return;
    setRemoving(true);
    try {
      const result = await (data as DataAccessExt).removeCase(c.id, {
        acknowledgeArchiveFolderHandled: removeAckBox,
        ...(removeReason.trim() ? { reason: removeReason.trim() } : {}),
      });
      setRemoveOpen(false);
      // Surface the archive deep link so the operator can handle Box separately
      // (it is NEVER auto-deleted). The toast persists across the navigate-away.
      dispatchToast(
        <Toast>
          <ToastTitle>{result.alreadyRemoved ? 'Case already closed' : 'Case closed'}</ToastTitle>
          <ToastBody>
            {result.boxFolderUrl ? (
              <Link inline href={result.boxFolderUrl} target="_blank" rel="noopener noreferrer">
                Open archive folder
              </Link>
            ) : (
              'Remember to handle the archive folder separately.'
            )}
          </ToastBody>
        </Toast>,
        { intent: 'success' },
      );
      navigate('/');
    } catch {
      setRemoving(false);
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t close the case — try again</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    }
  };

  /* --- editable VRM (issue #12) --- */
  const vrmCheck = checkVrm(vrmDraft);
  const beginEditVrm = () => {
    setVrmDraft(c.vrm);
    setEditingVrm(true);
    // Focus the input once it mounts (next frame).
    requestAnimationFrame(() => vrmInputRef.current?.focus());
  };
  const cancelEditVrm = () => {
    setEditingVrm(false);
    setVrmDraft(c.vrm);
    requestAnimationFrame(() => vrmEditBtnRef.current?.focus());
  };
  const saveVrm = async () => {
    const check = checkVrm(vrmDraft);
    if (check.status === 'empty') return; // hard block — Save is disabled anyway
    const next = check.vrm;
    if (next === c.vrm) {
      // No actual change — close without a write.
      setEditingVrm(false);
      requestAnimationFrame(() => vrmEditBtnRef.current?.focus());
      return;
    }
    try {
      const updated = await updateCaseVrm(c.id, { vrm: next });
      // Merge the FULL server-returned Case: the PATCH recomputes status + readiness,
      // so changing the registration can move the case server-side. Keeping only
      // `updated.vrm` would leave the screen rendering a stale status/checklist/pipeline.
      // (VRM editing is its own isolated editor, so this won't clobber other concurrent edits.)
      adoptPersistedCase(updated);
      setEditingVrm(false);
      toast('Registration updated');
      requestAnimationFrame(() => vrmEditBtnRef.current?.focus());
    } catch {
      // Mutation failures surface (rest-client doesn't swallow them) — keep the
      // editor open so the operator can retry; never a silent "success".
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t update registration — try again</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    }
  };

  /* --- editable Case/PO (ADR-0022 transition: stamp the REAL number at EVA-add) --- */
  const poNormalized = normalizeCasePo(poDraft);
  const poShapeOk = poNormalized !== '' && CASE_PO_SHAPE_RE.test(poNormalized);
  const beginEditPo = () => {
    setPoDraft(c.casePo ?? '');
    setEditingPo(true);
  };
  const cancelEditPo = () => {
    setEditingPo(false);
    setPoDraft(c.casePo ?? '');
  };
  const savePo = async () => {
    if (!poShapeOk) return; // Save is disabled anyway
    if (poNormalized === (c.casePo ?? '').toUpperCase()) {
      setEditingPo(false);
      return;
    }
    try {
      const updated = await updateCasePo(c.id, { casePo: poNormalized });
      adoptPersistedCase(updated);
      setEditingPo(false);
      toast('Case/PO updated');
    } catch (e) {
      const inUse = String(e).includes('case_po_in_use') || String(e).includes(' 409 ');
      dispatchToast(
        <Toast>
          <ToastTitle>
            {inUse
              ? `Couldn’t set ${poNormalized} — that number already belongs to another case`
              : 'Couldn’t update the Case/PO — try again'}
          </ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    }
  };

  /* Switch to a tab and (for field items) focus + reveal the offending field. */
  const goToBlocker = (item: ChecklistItem) => {
    const { tab: targetTab, fieldKey } = checklistTarget(item, liveCase);
    setTab(targetTab);
    if (targetTab === 'fields' && fieldKey) {
      // Wait for the Fields tab to mount, then focus the control.
      requestAnimationFrame(() => {
        const el = fieldRefs.current[fieldKey];
        const row = document.getElementById(`field-${fieldKey}`);
        // Honour prefers-reduced-motion for the deep-link scroll.
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        row?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        el?.focus();
      });
    }
  };

  const focusFirstEditIssue = () => {
    const first = editValidation[0];
    if (!first) return;
    setTab('fields');
    requestAnimationFrame(() => {
      document.getElementById(`field-${first.fieldKey}`)?.scrollIntoView({ block: 'center' });
      fieldRefs.current[first.fieldKey]?.focus();
    });
  };

  /* --- field edits --- */
  const onTextChange = (key: EvaFieldKey, value: string) => {
    setC((prev) => {
      if (!prev) return prev;
      const f = prev.evaFields[key];
      return {
        ...prev,
        evaFields: {
          ...prev.evaFields,
          // Staff edit: mark reviewed.
          [key]: { ...f, value, reviewState: 'reviewed' },
        },
      };
    });
    if (key === 'inspectionAddress') {
      const trimmed = value.trim();
      setInspectionDraft((current) => ({
        decisionMode:
          trimmed === 'Image Based Assessment'
            ? 'image_based'
            : trimmed
              ? 'manual'
              : 'unknown',
        sourceLabel: trimmed === 'Image Based Assessment' ? 'image_based' : 'manual',
        sourceNote:
          trimmed === 'Image Based Assessment'
            ? current.sourceNote
            : 'Entered and confirmed by staff',
        touched: true,
      }));
      setOverrideAddr(trimmed === 'Image Based Assessment');
      if (trimmed !== 'Image Based Assessment') setOverrideReason('');
      setConfirmedProvenance(undefined);
    }
  };

  /* Pick a SUGGESTED location (corpus OR live-assist): copy its lines into the
     manual inspection-address draft (marking the field reviewed) and set the
     decision to MANUAL. This is the ONLY place a suggestion touches the case, and
     only on an explicit click — it never auto-confirms, never writes image_based,
     and never fires on load.

     The decision is routed through resolveInspectionDecision (ADR-0013 confirmation
     path): a 'use_physical_address' choice with a real address resolves to
     decisionMode='manual'. We capture the plain-language source in the local draft;
     the explicit Save persists it with the address and decision. The sourceLabel is a CONFIRMED label
     ('confirmed:assist' / 'confirmed:corpus') — NOT 'suggested*' — so the row records
     where the confirmed manual decision came from (source label and source note)
     WITHOUT becoming a new unconfirmed suggestion (the suggestions query + the Admin
     split + isSuggestedAddressRecord all key on the 'suggested' prefix). */
  const { useSuggestion, chooseInspection, changeImageBasedReason, onSuggestLocation } = useAddressWorkflow({ addrSearching, addressDraftSnapshot, assistCandidates, assistNoResult, assistRunning, c, confirmedProvenance, dispatchToast, imgState, inspectionDraft, locationAssistEnabled, onTextChange, overrideAddr, overrideReason, persistedCase, setAddressDraftSnapshot, setAssistCandidates, setAssistNoResult, setAssistRunning, setC, setConfirmedProvenance, setInspectionDraft, setOverrideAddr, setOverrideReason, setTab, suggestions, suggestionsQuery, toast });

  // TKT-089: role/registration/EVA-use/include changes are durable server mutations.
  // The working copy changes only after the server confirms; failures keep the prior row.
  const { evidenceMutations, evidenceSaveErrors, onRole, onRegistrationVisible, onAcceptedForEva, onExclude, onDismissReflection, addNote, acceptedImages, setEvaOrderKeys, exportingEva, onExportForEva, markingDone, onMarkReportDelivered } = useEvidenceWorkflow({ dispatchToast, imgState, setImgState, liveCase, setC, noteDraft, setNoteDraft, toast });

  // --- Delete case image (TKT-160) — destructive, so gate-driven visibility (the
  // control is hidden entirely while the gate is off/loading) plus an explicit
  // confirm dialog whose dismiss/cancel path can never fire the mutation.
  const { data: deleteGate } = useDeleteCaseImageGate();
  const deleteImageEnabled = deleteGate?.enabled ?? false;
  const [deleteImageTarget, setDeleteImageTarget] = useState<Evidence | undefined>(undefined);
  const [deletingImage, setDeletingImage] = useState(false);
  const [deleteImageError, setDeleteImageError] = useState<string | undefined>(undefined);
  const openDeleteImage = (ev: Evidence) => {
    setDeleteImageTarget(ev);
    setDeleteImageError(undefined);
  };
  const cancelDeleteImage = () => {
    if (deletingImage) return;
    setDeleteImageTarget(undefined);
    setDeleteImageError(undefined);
  };
  const confirmDeleteImage = async () => {
    const target = deleteImageTarget;
    if (!target || deletingImage) return;
    setDeletingImage(true);
    setDeleteImageError(undefined);
    try {
      await (data as DataAccessExt).deleteCaseImage(c.id, target.id);
      setImgState((prev) => prev.filter((e) => e.id !== target.id));
      setDeleteImageTarget(undefined);
      toast('Image deleted');
    } catch (error) {
      setDeleteImageError(serverMessageOf(error) ?? 'Couldn’t delete this image. Try again.');
    } finally {
      setDeletingImage(false);
    }
  };

  // --- Guided photo request link (TKT-200) — the one-time capture-session URL
  // returned by create/replace, handed straight to the Chasers tab draft.
  // Cancelling the session that supplied the current draft clears it, so an
  // older cancelled link can never linger in a still-open newer draft.
  const [guidedPhotoLink, setGuidedPhotoLink] = useState<GuidedPhotoLink | undefined>(undefined);
  const onGuidedPhotoLinkCancelled = (sessionId: string) => {
    setGuidedPhotoLink((prev) => (prev?.sessionId === sessionId ? undefined : prev));
  };

  // TKT-002 (display-only): images are present but NONE (non-excluded) shows a
  // readable registration — the case can't be EVA-ready until a vehicle overview
  // with the full plate arrives. Derived from the per-image registrationVisible
  // flag the OCR (plate_ocr) sets at intake.
  const noViewableRegistration =
    imgState.some((e) => !e.excluded) && !imgState.some((e) => !e.excluded && e.registrationVisible);
  // Non-image artifacts (source email, instruction PDFs, …) for the Documents list.
  const documents = c.evidence.filter((e) => e.kind !== 'image' && e.kind !== 'video');
  const notesNewestFirst = c.notes; // already inserted newest-first

  /* --- header subtitle --- */
  const subtitle = [c.vehicleModel, c.vehicleYear ? `(${c.vehicleYear})` : undefined]
    .filter(Boolean)
    .join(' ');

  // VRM now renders as a plate; the Futura title carries Case/PO · provider.
  const titleText = [c.casePo, c.provider].filter(Boolean).join('  ·  ');
  const stageKey = caseStageKey(c.status);
  const due = dueInfo(c); // ONE shared due/aging parser for the header chip.

  return { acceptedImages, addNote, addrSearch, addrSearching, archiveEnabled, assistAiEnabled, assistCandidates, assistNoResult, assistRunning, beginEditPo, beginEditVrm, blocked, blockerCount, c, canSaveEdits, cancelDeleteImage, cancelEditPo, cancelEditVrm, caseTypeOptions, caseVersion, changeImageBasedReason, checkVehicleAgain, checkingVehicle, chips, chooseInspection, confirmDeleteImage, confirmedProvenance, currentCaseType, decisionMode, deleteImageEnabled, deleteImageError, deleteImageTarget, deletingImage, derivedAuditId, discardOpen, dispatchToast, doRemove, documents, due, editValidation, editingPo, editingVrm, evidenceMutations, evidenceSaveErrors, exportingEva, focusFirstEditIssue, goToBlocker, guidedPhotoLink, hasUnsavedChanges, imgState, inspectionDraft, invalidFieldCount, isRemoved, liveCase, locationAssistEnabled, logChase, markingDone, navigate, navigationBlocker, noViewableRegistration, noteDraft, notesNewestFirst, onAcceptedForEva, onDismissReflection, onExclude, onExportForEva, onGuidedPhotoLinkCancelled, onMarkReportDelivered, onOpenInArchive, onRegistrationVisible, onRole, onSuggestLocation, onTextChange, openDeleteImage, openRemove, openingArchive, overrideAddr, overrideReason, persistedCase, poDraft, poShapeOk, readiness, refreshAfterAiPromotion, registerRef, reloadLatestForReconcile, removeAckBox, removeConfirmText, removeConfirmed, removeMatch, removeOpen, removeReason, removing, restorePersistedDraft, saveCaseEdits, saveConflict, saveError, savePo, saveVrm, savingEdits, savingPo, savingVrm, setAddrSearch, setC, setCaseType, setCaseVersion, setDiscardOpen, setEvaOrderKeys, setGuidedPhotoLink, setNoteDraft, setPersistedCase, setPoDraft, setRemoveAckBox, setRemoveConfirmText, setRemoveOpen, setRemoveReason, setShowAllSuggestions, setTab, setVrmDraft, showAllSuggestions, showCaseTypeControl, stageKey, styles, subtitle, suggestions, tab, titleText, toast, uploadLinkEnabled, useSuggestion, validationByField, vehicleWarning, vrmCheck, vrmDraft, vrmEditBtnRef, vrmInputRef, workflowBlocked, imagesLoading };
}
