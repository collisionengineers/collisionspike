import { useEffect, useRef } from 'react';
import { Toast, ToastTitle, useToastController } from '@fluentui/react-components';
import { suggestLocations, buildSuggestLocationRequest, useInspectionAddressSuggestions, activeLocationAssistTransport, type Case, type EvaFieldKey, type Evidence, type SuggestedAddress } from '../../data';
import { resolveInspectionDecision } from '@cs/domain';
import { type InspectionChoice } from '../../shared/ui/InspectionChoice';
import { inspectionAddressDraftSnapshot, restoreInspectionAddressDraft, restorePersistedImageBasedChoice, startInspectionAddressDraft, type CaseEditInspectionDraft, type InspectionAddressDraftSnapshot } from './case-edit-session';
import type { TabName } from './case-detail.controller';

import type { Dispatch, SetStateAction } from 'react';

interface AddressWorkflowArgs {
  addrSearching: boolean;
  addressDraftSnapshot: InspectionAddressDraftSnapshot | undefined;
  assistCandidates: SuggestedAddress[];
  assistNoResult: boolean | null;
  assistRunning: boolean;
  c: Case;
  confirmedProvenance: { sourceLabel: string; sourceNote: string } | undefined;
  dispatchToast: ReturnType<typeof useToastController>['dispatchToast'];
  imgState: Evidence[];
  inspectionDraft: CaseEditInspectionDraft;
  locationAssistEnabled: boolean;
  onTextChange: (key: EvaFieldKey, value: string) => void;
  overrideAddr: boolean;
  overrideReason: string;
  persistedCase: Case;
  setAddressDraftSnapshot: Dispatch<SetStateAction<InspectionAddressDraftSnapshot | undefined>>;
  setAssistCandidates: Dispatch<SetStateAction<SuggestedAddress[]>>;
  setAssistNoResult: Dispatch<SetStateAction<boolean | null>>;
  setAssistRunning: Dispatch<SetStateAction<boolean>>;
  setC: Dispatch<SetStateAction<Case>>;
  setConfirmedProvenance: Dispatch<SetStateAction<{ sourceLabel: string; sourceNote: string } | undefined>>;
  setInspectionDraft: Dispatch<SetStateAction<CaseEditInspectionDraft>>;
  setOverrideAddr: Dispatch<SetStateAction<boolean>>;
  setOverrideReason: Dispatch<SetStateAction<string>>;
  setTab: Dispatch<SetStateAction<TabName>>;
  suggestions: SuggestedAddress[];
  suggestionsQuery: ReturnType<typeof useInspectionAddressSuggestions>;
  toast: (title: string) => void;
}

export function useAddressWorkflow(args: AddressWorkflowArgs) {
  const { addrSearching, addressDraftSnapshot, assistCandidates, assistNoResult, assistRunning, c, confirmedProvenance, dispatchToast, imgState, inspectionDraft, locationAssistEnabled, onTextChange, overrideAddr, overrideReason, persistedCase, setAddressDraftSnapshot, setAssistCandidates, setAssistNoResult, setAssistRunning, setC, setConfirmedProvenance, setInspectionDraft, setOverrideAddr, setOverrideReason, setTab, suggestions, suggestionsQuery, toast } = args;
  const useSuggestion = (s: SuggestedAddress) => {
    const lines = [...s.lines, s.postcode].map((l) => (l ?? '').trim()).filter(Boolean);
    if (lines.length === 0) {
      // A candidate with no usable address lines (e.g. a live-assist hit that resolved
      // to only a place label) cannot become a manual physical-address decision. Tell
      // the reviewer rather than silently no-op'ing the button.
      toast(
        'This suggestion has no usable address — pick another, or record Image Based Assessment with a reason',
      );
      return;
    }
    const draft = lines.join('\n');
    // Validate the confirmation through the policy resolver. We use the prefer_address
    // default (a confirmed physical address resolves to a manual human decision).
    // The provider-policy prefill remains server-owned; this reviewer-invoked physical
    // address choice is validated as a manual decision before it enters the draft.
    const decision = resolveInspectionDecision('prefer_address', lines.length > 0, {
      choice: 'use_physical_address',
    });
    // Defensive: only apply when the resolver returns a non-image-based manual
    // decision (it will, for a non-empty address). NOTHING auto-applies otherwise.
    if (decision.imageBased || decision.needsReviewerDecision) return;
    const resolvedMode = decision.decisionMode ?? 'manual';
    onTextChange('inspectionAddress', draft);
    setOverrideAddr(false); // a real address supersedes any image-based override
    setAddressDraftSnapshot(undefined);
    // Capture the confirmed decision's provenance into local state (rendered as the
    // caption below the draft). The reviewer has just CONFIRMED this pick, so the
    // sourceLabel must NOT start with 'suggested' — that prefix is reserved for the
    // unconfirmed corpus candidates (isSuggestedAddressRecord keys on it, and the
    // suggestions query filters on it). A confirmed pick carries 'confirmed:assist'
    // (a live-assist pick the reviewer accepted) or 'confirmed:corpus' (a catalogue
    // row the reviewer accepted) — mirroring the 'suggested:*' shape but excluded
    // from the suggestion set. The human-facing note still says "Suggested from the
    // photos" (no engineering terms; describes where the candidate came from).
    const provenance =
      s.source === 'assist'
        ? {
            sourceLabel: 'confirmed:assist',
            sourceNote: s.evidenceNote
              ? `Suggested from the photos — ${s.evidenceNote.split('\n')[0]}`
              : 'Suggested from the photos',
          }
        : { sourceLabel: 'confirmed:corpus', sourceNote: 'Picked from suggested locations' };
    setInspectionDraft({
      decisionMode: resolvedMode,
      sourceLabel: provenance.sourceLabel,
      sourceNote: provenance.sourceNote,
      touched: true,
    });
    // Live-assist picks set the caption; corpus picks clear it (parity with prior behaviour).
    setConfirmedProvenance(s.source === 'assist' ? provenance : undefined);
    setTab('address');
    toast('Address selected — save changes when ready');
  };

  const chooseInspection = (choice: InspectionChoice) => {
    if (choice === 'address') {
      setOverrideAddr(false);
      if (addressDraftSnapshot) {
        const restored = restoreInspectionAddressDraft(c, addressDraftSnapshot);
        setC(restored.draft);
        setInspectionDraft(restored.inspection);
        setConfirmedProvenance(restored.provenance);
        setAddressDraftSnapshot(undefined);
      } else if (inspectionDraft.decisionMode === 'image_based') {
        onTextChange('inspectionAddress', '');
        setInspectionDraft(startInspectionAddressDraft());
        setOverrideReason('');
        setConfirmedProvenance(undefined);
      }
      return;
    }

    // Returning to the saved image-based decision is a true no-op. Reset only
    // the inspection slice, preserving any unrelated fields in this edit session.
    const restored = restorePersistedImageBasedChoice(persistedCase, c, inspectionDraft);
    if (restored) {
      setOverrideAddr(true);
      setC(restored.draft);
      setInspectionDraft(restored.inspection);
      setOverrideReason('');
      setConfirmedProvenance(undefined);
      setAddressDraftSnapshot(undefined);
      return;
    }

    if (!overrideAddr) {
      setAddressDraftSnapshot(
        inspectionAddressDraftSnapshot(c, inspectionDraft, confirmedProvenance),
      );
    }
    onTextChange('inspectionAddress', 'Image Based Assessment');
    setInspectionDraft({
      decisionMode: 'image_based',
      sourceLabel: 'image_based',
      sourceNote: overrideReason,
      touched: true,
    });
    setConfirmedProvenance(undefined);
  };

  const changeImageBasedReason = (reason: string) => {
    setOverrideReason(reason);
    setInspectionDraft((current) =>
      current.decisionMode === 'image_based'
        ? { ...current, sourceNote: reason, touched: true }
        : current,
    );
  };

  /* Run the live location-assist (Phase 4a). Builds the request from data ALREADY
     loaded on this screen (the non-excluded photos -> photo_refs; the accident-
     circumstances + claimant-address text -> text_clues), calls the injected
     transport, and stores the returned candidates in this working copy. It does
     NOT write the case, does NOT set the EVA address, and does NOT auto-select —
     each candidate is rendered as a suggestion the reviewer must confirm. */
  const onSuggestLocation = async (deep = false) => {
    if (assistRunning || !locationAssistEnabled) return;
    setAssistRunning(true);
    try {
      // The claimant-address clue is a Case-identity
      // field carried through the data layer onto the domain Case (adapter maps it
      // 1:1, like vrm/casePo). The request builder omits an empty clue, and the
      // Function tolerates a text-clue-less run.
      const claimantAddressClue: string | undefined = c.claimantAddress;
      const req = buildSuggestLocationRequest({
        caseId: c.id,
        ...(c.casePo ? { casePo: c.casePo } : {}),
        photos: imgState
          .filter((e) => !e.excluded)
          .map((e) => ({
            id: e.id,
            ...(e.boxFileId ? { boxFileId: e.boxFileId } : {}),
            fileName: e.fileName,
            imageRole: e.imageRole,
          })),
        accidentCircumstances: c.evaFields.accidentCircumstances.value,
        // Claimant address is a Case-identity clue the
        // adapter carries onto the domain Case. Passed best-effort; omitted when
        // empty so the request still builds (the Function tolerates a clue-less run).
        ...(claimantAddressClue ? { claimantAddress: claimantAddressClue } : {}),
        ...(deep ? { deep: true } : {}),
      });
      const result = await suggestLocations(req, activeLocationAssistTransport);
      setAssistCandidates(result.suggestions);
      setAssistNoResult(result.noConfidentLocation && result.suggestions.length === 0);
    } catch {
      // Honest plain-language failure — never a synthetic candidate.
      setAssistCandidates([]);
      setAssistNoResult(null);
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t suggest a location — try again</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setAssistRunning(false);
    }
  };

  /* Auto-RUN the assist ONCE when the corpus shortlist is empty and the case has photos
     (TKT-077). This is auto-SUGGEST only — it surfaces candidates the reviewer must still
     confirm; it NEVER auto-applies a location (ADR-0013). The "Suggest location" button stays
     available for a manual re-run. Guarded by a ref so it fires at most once per mounted case. */
  const autoRanAssistRef = useRef(false);
  useEffect(() => {
    if (autoRanAssistRef.current) return;
    if (!locationAssistEnabled) return;
    if (addrSearching) return; // don't fire while the reviewer is searching the corpus
    if (suggestionsQuery.loading) return; // wait for the corpus shortlist to settle
    if (suggestions.length > 0) return; // corpus already has matches — no assist needed
    if (assistRunning || assistCandidates.length > 0 || assistNoResult !== null) return;
    if (!imgState.some((e) => !e.excluded)) return; // needs at least one usable photo
    autoRanAssistRef.current = true;
    void onSuggestLocation(false);
    // onSuggestLocation is intentionally omitted (ref-guarded single fire).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    locationAssistEnabled,
    addrSearching,
    suggestionsQuery.loading,
    suggestions.length,
    assistRunning,
    assistCandidates.length,
    assistNoResult,
    imgState,
  ]);
  return { useSuggestion, chooseInspection, changeImageBasedReason, onSuggestLocation };
}
