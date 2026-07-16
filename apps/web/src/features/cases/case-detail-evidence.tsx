import { useEffect, useMemo, useRef, useState } from 'react';
import { zipSync } from 'fflate';
import { Toast, ToastBody, ToastTitle, useToastController } from '@fluentui/react-components';
import { data, type Case, type Evidence, type ImageRole, type Note } from '../../data';
import { buildEvaJson } from '@cs/domain';
import { buildEvaImageOrder } from '../../shared/ui/ImageOrderList';
import { buildEvaZipImageSpecs, evaExportBaseName, orderEntriesByKeys } from './eva-export-zip';
import type { DataAccessExt } from '../../data/rest-client';
import { mergeEvidenceReviewDecision, persistEvidenceReview, releaseEvidenceMutation, tryAcquireEvidenceMutation } from './evidence-review';

import type { Dispatch, SetStateAction } from 'react';

interface EvidenceWorkflowArgs {
  dispatchToast: ReturnType<typeof useToastController>['dispatchToast'];
  imgState: Evidence[];
  setImgState: Dispatch<SetStateAction<Evidence[]>>;
  liveCase: Case;
  setC: Dispatch<SetStateAction<Case>>;
  noteDraft: string;
  setNoteDraft: Dispatch<SetStateAction<string>>;
  toast: (title: string) => void;
}

export function useEvidenceWorkflow({ dispatchToast, imgState, setImgState, liveCase, setC, noteDraft, setNoteDraft, toast }: EvidenceWorkflowArgs) {
  type EvidenceMutationKind = 'review' | 'reflection';
  const [evidenceMutations, setEvidenceMutations] = useState<
    Readonly<Record<string, EvidenceMutationKind>>
  >({});
  const evidenceMutationRef = useRef<Set<string>>(new Set());
  const [evidenceSaveErrors, setEvidenceSaveErrors] = useState<Readonly<Record<string, string>>>({});

  const beginEvidenceMutation = (id: string, kind: EvidenceMutationKind): boolean => {
    if (!tryAcquireEvidenceMutation(evidenceMutationRef.current, id)) return false;
    setEvidenceMutations((prev) => ({ ...prev, [id]: kind }));
    return true;
  };
  const finishEvidenceMutation = (id: string): void => {
    releaseEvidenceMutation(evidenceMutationRef.current, id);
    setEvidenceMutations((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const saveEvidenceReview = async (
    id: string,
    input: Parameters<DataAccessExt['updateEvidenceReview']>[1],
  ) => {
    if (!beginEvidenceMutation(id, 'review')) return;
    setEvidenceSaveErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const outcome = await persistEvidenceReview(id, input, data.updateEvidenceReview);
    if (outcome.updated) {
      setImgState((prev) =>
        prev.map((e) =>
          e.id === id ? mergeEvidenceReviewDecision(e, outcome.updated!) : e,
        ),
      );
    } else {
      setEvidenceSaveErrors((prev) => ({
        ...prev,
        [id]: outcome.error ?? 'Couldn’t save this photo. Try again.',
      }));
    }
    finishEvidenceMutation(id);
  };

  const imageById = (id: string): Evidence | undefined => imgState.find((e) => e.id === id);
  const onRole = (id: string, role: ImageRole) => {
    const image = imageById(id);
    void saveEvidenceReview(id, {
      imageRole: role,
      acceptedForEva: role !== 'unknown' && !image?.personReflection,
    });
  };
  const onRegistrationVisible = (id: string, visible: boolean) =>
    void saveEvidenceReview(id, { registrationVisible: visible });
  const onAcceptedForEva = (id: string, accepted: boolean) =>
    void saveEvidenceReview(id, { acceptedForEva: accepted });
  const onExclude = (id: string, excluded: boolean) => {
    const image = imageById(id);
    void saveEvidenceReview(id, {
      excluded,
      acceptedForEva: excluded ? false : image?.imageRole !== 'unknown',
      ...(excluded
        ? {
            exclusionReason: image?.personReflection
              ? 'Person reflection visible'
              : 'Excluded by reviewer',
          }
        : {}),
    });
  };

  /* TKT-123: dismiss the reflection warning — persists via the seam (PATCH), so
     the dismissal survives a reload. The card's flag flips only after the server
     confirms; a failure surfaces as a toast, never a fake dismissal. */
  const onDismissReflection = async (id: string) => {
    if (!beginEvidenceMutation(id, 'reflection')) return;
    try {
      const updated = await (data as DataAccessExt).setReflectionDismissed(id, true);
      setImgState((prev) =>
        prev.map((e) => (e.id === id ? { ...e, reflectionDismissed: updated.reflectionDismissed ?? true } : e)),
      );
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t dismiss the warning — try again</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      finishEvidenceMutation(id);
    }
  };

  const addNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    const note: Note = {
      id: `note-${Date.now()}`,
      author: 'J. Mercer',
      timestamp: new Date().toLocaleString('en-GB'),
      text,
    };
    setC((prev) => (prev ? { ...prev, notes: [note, ...prev.notes] } : prev));
    setNoteDraft('');
    toast('Note added');
  };

  const acceptedImages = imgState.filter((e) => e.acceptedForEva && !e.excluded);

  /* "Export for EVA" (TKT-126): ONE .zip holding the canonical 12-field EVA JSON
     (snake_case, byte-identical to the submit flow) PLUS every included photo,
     named `NNN-<file>` in the EVA photo order — 2 previews first (overview with
     the registration, then the main-damage closeup), then ALL accepted photos in
     sequence INCLUDING those two again; excluded images never ship. The order is
     the on-screen photo orderer's (the reviewer's drag order is captured below),
     so the list and the zip can never disagree. Bytes come through the
     authenticated seam; fflate packs client-side (bundled — no CDN, CSP-safe).
     The separate JSON-only download is REPLACED — the JSON travels in the zip. */
  const [evaOrderKeys, setEvaOrderKeys] = useState<string[] | null>(null);
  // B4: the saved drag order is keyed by accepted-image identity + role (the entry
  // keys encode the two preview slots + each photo's id). If a reviewer drags the
  // order and THEN changes a role to Overview/Damage-closeup or (un)excludes a photo,
  // orderEntriesByKeys would append the newly-seeded preview-* entry AFTER the stale
  // order — landing EVA's required previews LAST in the zip. Reset the saved order
  // when that identity/role signature changes so the export falls back to the
  // correctly-seeded (previews-first) EVA order.
  const orderSig = useMemo(
    () => buildEvaImageOrder(acceptedImages).map((e) => e.key).join('|'),
    [acceptedImages],
  );
  useEffect(() => {
    setEvaOrderKeys(null);
  }, [orderSig]);
  const [exportingEva, setExportingEva] = useState(false);
  const onExportForEva = async () => {
    if (exportingEva) return;
    setExportingEva(true);
    try {
      const baseName = evaExportBaseName(liveCase.casePo || liveCase.id);
      const json = buildEvaJson({ evaFields: liveCase.evaFields });
      const ordered = orderEntriesByKeys(buildEvaImageOrder(acceptedImages), evaOrderKeys);
      const specs = buildEvaZipImageSpecs(ordered);

      // Fetch each image's bytes ONCE (the two preview slots reuse the same bytes).
      const bytesById = new Map<string, Uint8Array>();
      const missing: string[] = [];
      for (const spec of specs) {
        if (bytesById.has(spec.evidenceId) || missing.includes(spec.fileName)) continue;
        const blob = await (data as DataAccessExt).evidenceContentBlob(spec.evidenceId);
        if (!blob) {
          missing.push(spec.fileName);
          continue;
        }
        bytesById.set(spec.evidenceId, new Uint8Array(await blob.arrayBuffer()));
      }
      if (missing.length > 0) {
        // EVA needs the complete photo set — never ship a silently-partial zip.
        dispatchToast(
          <Toast>
            <ToastTitle>Couldn’t export — {missing.length} photo{missing.length === 1 ? '' : 's'} unavailable</ToastTitle>
            <ToastBody>{missing.slice(0, 3).join(', ')}{missing.length > 3 ? '…' : ''} — try again, or open the archive copy.</ToastBody>
          </Toast>,
          { intent: 'error' },
        );
        return;
      }

      const zipInput: Record<string, Uint8Array> = {
        [`${baseName}.json`]: new TextEncoder().encode(json),
      };
      for (const spec of specs) zipInput[spec.name] = bytesById.get(spec.evidenceId)!;
      // level 0 (store): the photos are already compressed; the JSON is tiny.
      const zipped = zipSync(zipInput, { level: 0 });

      const url = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${baseName}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Exported for EVA — one zip with the EVA file and the photos in order');

      /* TKT-094 Phase B: the export IS the EVA handoff, so record it — the server
         flips ready_for_eva → eva_submitted (guarded idempotent: a second export
         is a no-op) and writes submitted_at, which feeds the dashboard throughput
         tiles. Own try/catch: the download above already succeeded, so a failure
         here must say "exported, but not recorded" — never "couldn't export". */
      try {
        const { updated } = await (data as DataAccessExt).markEvaSubmitted(liveCase.id);
        if (updated) {
          const fresh = await data.caseById(liveCase.id);
          if (fresh) setC(fresh);
          toast('Case marked EVA Submitted');
        }
      } catch {
        dispatchToast(
          <Toast>
            <ToastTitle>Exported, but the case couldn’t be marked EVA Submitted</ToastTitle>
            <ToastBody>The zip downloaded fine. Refresh and export again to record it.</ToastBody>
          </Toast>,
          { intent: 'warning' },
        );
      }
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t export — try again</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setExportingEva(false);
    }
  };
  /* TKT-095 (thin slice): the manual "Mark report delivered" bridge — visible only
     on an eva_submitted case. Server-guarded eva_submitted → done (idempotent), so
     a double-click can never double-record. */
  const [markingDone, setMarkingDone] = useState(false);
  const onMarkReportDelivered = async () => {
    if (markingDone) return;
    setMarkingDone(true);
    try {
      const { updated } = await (data as DataAccessExt).markCaseDone(liveCase.id);
      if (updated) {
        const fresh = await data.caseById(liveCase.id);
        if (fresh) setC(fresh);
        toast('Report delivered — case marked Done');
      } else {
        // Benign: someone (or a detector) already recorded the delivery.
        const fresh = await data.caseById(liveCase.id);
        if (fresh) setC(fresh);
        toast('Already recorded — this case is Done');
      }
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t record the delivery — try again</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setMarkingDone(false);
    }
  };
  return { evidenceMutations, evidenceSaveErrors, onRole, onRegistrationVisible, onAcceptedForEva, onExclude, onDismissReflection, addNote, acceptedImages, evaOrderKeys, setEvaOrderKeys, exportingEva, onExportForEva, markingDone, onMarkReportDelivered };
}
