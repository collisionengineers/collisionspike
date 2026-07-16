import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toast, ToastTitle, useToastController } from '@fluentui/react-components';
import { GLOBAL_TOASTER_ID } from '../../shared/ui';
import { EVA_FIELD_ORDER, caseTypeOf, parseDocument, fileToBase64, getDataAccess, useHoldNewCasesDefault, normaliseAddress, type CaseStatus, type CaseType, type EvaField, type EvaFieldKey, type EvaFields, type MileageUnit, type ParserIssue, type VatStatus } from '../../data';
import { makeRestParserTransport } from '../../data/parser-rest-transport';
import type { DataAccessExt, EvidenceUploadRole } from '../../data/rest-client';
import type { CreateCaseInput, NextCasePoResult } from '@cs/domain';
import { acquireApiToken } from '../../auth/msalConfig';
import { createIdentityFields, manualVehicleModel, manualVehicleLookupMessage, mergeManualVehicleLookup, type ManualIntakeMode } from './manual-intake-create';
import { manualIntakeEvidenceNotice } from '../../shared/evidence/evidence-upload-result';
import { manualIntakeUploadOutcome, type ManualIntakeUploadOutcome } from './manual-intake-upload';
import { appendManualIntakeFiles, isImageFile, manualIntakeBatchRejection, nextManualInstruction, partitionManualIntakeFiles } from './manual-intake-files';
import { clearManualIntakeOperationIdentity, loadManualIntakeOperationIdentity, rotateManualIntakeOperationIdentity, saveManualIntakeOperationIdentity } from './manual-intake-operation-identity';

// Authenticated parser transport. The data service returns the same ParserResponse.
const parserApiCall = async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
  const base = (import.meta.env.VITE_API_BASE_URL as string).replace(/\/$/, '');
  const token = await acquireApiToken();
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return (await res.json()) as T;
};
const restParserTransport = makeRestParserTransport(parserApiCall);

/* ============================================================
   ManualIntake — the "New case" / manual-intake screen.

   Two entry paths, then one shared review form:

     A. Document intake — pick (or drag in) an instruction document, base64-encode
        it in the browser, send it to the live parser
        via the data seam's parseDocument), and pre-fill the 12 EVA fields with
        their parser provenance. Additional JPG, PNG, WebP and PDF files are
        persisted through the same evidence path before completion is reported.

     B. Fully-manual entry — skip the parser entirely and key every field by hand
        (empty EvaFields seeded with staff provenance).

   The review form lets staff confirm/edit the EVA fields + the separate identity
   fields (VRM / Work provider / Principal / Case/PO / Claim No / Insured name),
   enrich the vehicle (DVLA/DVSA) and normalise the inspection address (postcodes.io),
   then create a real Case via the seam's createCase and navigate to it.

   Visual language matches the existing Fluent v9 screens: SectionHeading lockup,
   red-hairline cluster heads, the field-row + provenance-meta grid.
   ============================================================ */

/* ============================================================
   ManualIntake — the "New case" / manual-intake screen.

   Two entry paths, then one shared review form:

     A. Document intake — pick (or drag in) an instruction document, base64-encode
        it in the browser, send it to the live parser
        via the data seam's parseDocument), and pre-fill the 12 EVA fields with
        their parser provenance. Additional JPG, PNG, WebP and PDF files are
        persisted through the same evidence path before completion is reported.

     B. Fully-manual entry — skip the parser entirely and key every field by hand
        (empty EvaFields seeded with staff provenance).

   The review form lets staff confirm/edit the EVA fields + the separate identity
   fields (VRM / Work provider / Principal / Case/PO / Claim No / Insured name),
   enrich the vehicle (DVLA/DVSA) and normalise the inspection address (postcodes.io),
   then create a real Case via the seam's createCase and navigate to it.

   Visual language matches the existing Fluent v9 screens: SectionHeading lockup,
   red-hairline cluster heads, the field-row + provenance-meta grid.
   ============================================================ */
import { useStyles } from './manual-intake.styles';
const MANUAL_CLUSTER_KEYS: EvaFieldKey[][] = [
  ['claimantName', 'claimantTelephone', 'claimantEmail'], // Provider & claimant
  ['mileageUnit', 'vatStatus'], // Vehicle
  ['accidentCircumstances'], // Incident
  ['dateOfLoss', 'dateOfInstruction'], // Dates
];

/* The EVA-required keys per the contract descriptor (single source of truth). */
const CONTRACT_REQUIRED: ReadonlySet<EvaFieldKey> = new Set(
  EVA_FIELD_ORDER.filter((d) => d.required).map((d) => d.key),
);

/* Inspection Type is a constant for manual intake — always a desktop / image-based
   "Vehicle Damage Inspection". Recorded, never configured (review #15). */

/* Today as DD/MM/YYYY — the "Inspect on" default when the document carries none. */
function todayDdMmYyyy(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/* Build an empty 12-field EvaFields for the fully-manual path — every key staff-
   sourced, blank, and already "reviewed" (the user is keying them deliberately). */
function emptyEvaFields(): EvaFields {
  const mk = (): EvaField => ({
    value: '',
    provenance: { sourceType: 'staff', sourceLabel: 'Manual entry' },
    reviewState: 'reviewed',
  });
  const out = {} as Record<EvaFieldKey, EvaField>;
  for (const d of EVA_FIELD_ORDER) out[d.key] = mk();
  const fields = out as unknown as EvaFields;
  fields.vatStatus = { ...out.vatStatus, value: '' as VatStatus };
  fields.mileageUnit = { ...out.mileageUnit, value: '' as MileageUnit };
  return fields;
}

type Phase = 'pick' | 'parsing' | 'review' | 'creating';

/* Which entry path the review form is serving (TKT-024):
   - 'document' / 'manual' — instruction-led: the full field set.
   - 'images'  — images WITHOUT instructions (TKT-118: "Images received — awaiting
     instructions", NOT "image based assessment" — a different concept). The
     instruction-only fields are absent; required = Received from / Received on /
     Vehicle details / Location; no provider → no Case/PO is minted (identity is
     the VRM until instructions arrive). */
type IntakeMode = ManualIntakeMode;

interface PendingManualUpload {
  caseId: string;
  requiresInstruction: boolean;
  outcome?: ManualIntakeUploadOutcome;
}

export function useManualIntake() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /* Exact browser File object already auto-parsed. Metadata is not an identity:
     two distinct files may legitimately share a name and size. */
  const autoParsedRef = useRef<File | null>(null);
  const gateAppliedRef = useRef(false);
  const [initialOperationIdentity] = useState(loadManualIntakeOperationIdentity);
  const caseCreateKeyRef = useRef(initialOperationIdentity.caseCreateKey);
  const evidenceUploadKeyRef = useRef(initialOperationIdentity.evidenceUploadKey);
  const holdGate = useHoldNewCasesDefault();

  const [phase, setPhase] = useState<Phase>('pick');
  const [mode, setMode] = useState<IntakeMode>('document');
  const [files, setFiles] = useState<File[]>([]);
  const [instructionFile, setInstructionFile] = useState<File | undefined>();
  const [pendingManualUpload, setPendingManualUpload] = useState<PendingManualUpload | undefined>();
  const [dragging, setDragging] = useState(false);

  const [fields, setFields] = useState<EvaFields | undefined>();
  /* Whether the case carries parsed/keyed instructions — drives the case-type badge. */
  const [hasInstructions, setHasInstructions] = useState(false);
  /* Image-only intake (TKT-024): who sent the images + when (required; today default). */
  const [receivedFrom, setReceivedFrom] = useState('');
  const [receivedOn, setReceivedOn] = useState(todayDdMmYyyy());

  /* Identity fields — SEPARATE and correctly labelled (review #7). */
  const [vrm, setVrm] = useState('');
  const [provider, setProvider] = useState(''); // Work provider display name
  const [providerCode, setProviderCode] = useState(''); // Principal code (2–5 chars observed)
  // Live Case/PO allocator preview for the entered Principal (TKT-004).
  const [casePoPreview, setCasePoPreview] = useState<NextCasePoResult | undefined>();
  const [providerReference, setProviderReference] = useState(''); // provider's Claim No
  const [insuredName, setInsuredName] = useState('');
  const [status, setStatus] = useState<CaseStatus>('ingested');

  /* Vehicle make is informational/enrichable (no separate EVA payload key — EVA
     carries Vehicle Model only). Carried alongside Model for the lookup. */
  const [make, setMake] = useState('');
  /* Inspect on (inspection date) — required by process; default to today. */
  const [inspectOn, setInspectOn] = useState(todayDdMmYyyy());

  const [enriching, setEnriching] = useState(false);
  const [normalising, setNormalising] = useState(false);
  const [writeProvenance, setWriteProvenance] = useState(true);
  /* Park the new case in Held on create (seeded from the admin gate; overridable). */
  const [onHold, setOnHold] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();
  const [issues, setIssues] = useState<ParserIssue[]>([]);

  const toast = (title: string, intent: 'success' | 'error' = 'success') =>
    dispatchToast(
      <Toast>
        <ToastTitle>{title}</ToastTitle>
      </Toast>,
      { intent },
    );

  const rotateEvidenceUploadKey = () => {
    evidenceUploadKeyRef.current = crypto.randomUUID();
    saveManualIntakeOperationIdentity({
      caseCreateKey: caseCreateKeyRef.current,
      evidenceUploadKey: evidenceUploadKeyRef.current,
    });
  };

  const filePartition = useMemo(() => partitionManualIntakeFiles(files), [files]);
  const unsupportedFiles = filePartition.rejected;
  const batchRejection = useMemo(() => manualIntakeBatchRejection(files), [files]);
  const hasImages = useMemo(
    () => filePartition.accepted.some(isImageFile),
    [filePartition.accepted],
  );

  /* Derived, non-configurable case type (review #5). */
  const caseType: CaseType = useMemo(
    () => caseTypeOf({ status }, { hasImages, hasInstructions }),
    [status, hasImages, hasInstructions],
  );

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError(undefined);
    rotateEvidenceUploadKey();
    const incoming = Array.from(list);
    setFiles((prev) => appendManualIntakeFiles(prev, incoming));
    // Once a case exists, adding another PDF must not silently change its role.
    setInstructionFile((current) =>
      nextManualInstruction(current, incoming, !pendingManualUpload));
  };

  const removeFile = (index: number) => {
    setError(undefined);
    rotateEvidenceUploadKey();
    setPendingManualUpload((pending) =>
      pending?.outcome
        ? {
            ...pending,
            outcome: {
              ...pending.outcome,
              message: 'The case has been created. Add the selected files to finish it.',
              items: pending.outcome.items
                .filter((item) => item.fileIndex !== index)
                .map((item) => ({
                  ...item,
                  fileIndex: item.fileIndex > index ? item.fileIndex - 1 : item.fileIndex,
                })),
            },
          }
        : pending,
    );
    setFiles((prev) => {
      const removed = prev[index];
      if (removed === instructionFile) setInstructionFile(undefined);
      return prev.filter((_, i) => i !== index);
    });
  };

  const chooseInstruction = (file: File) => {
    setError(undefined);
    rotateEvidenceUploadKey();
    setInstructionFile(file);
  };

  /* ---- Drag-and-drop (review #1) ---- */
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (phase !== 'parsing') setDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (phase === 'parsing') return;
    addFiles(e.dataTransfer.files);
  };

  const runParse = async () => {
    if (!instructionFile) return;
    setError(undefined);
    setIssues([]);
    setPhase('parsing');
    try {
      const base64 = await fileToBase64(instructionFile);
      const result = await parseDocument(
        { document: base64, filename: instructionFile.name },
        restParserTransport,
      );
      const errs = result.issues.filter((i) => i.severity === 'error');
      if (errs.length > 0 || !result.evaFields) {
        setIssues(result.issues);
        setError(errs.map((e) => e.message).join(' · ') || 'We could not read the details from this document.');
        setPhase('pick');
        return;
      }
      setFields(result.evaFields);
      if (result.vrm) setVrm(result.vrm);
      // Seed the single Work-provider input from the parsed value (the prominent
      // input is the one source of truth for Work Provider — review fix).
      if (result.evaFields.workProvider?.value) setProvider(result.evaFields.workProvider.value);
      setHasInstructions(true);
      setMode('document');
      setIssues(result.issues); // warnings, if any
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('pick');
    }
  };

  /* Fully-manual entry (review #17): straight to the review form, empty fields. */
  const startManual = () => {
    if (unsupportedFiles.length > 0 || batchRejection) {
      setError(batchRejection ?? 'Remove the files marked Not supported before continuing.');
      return;
    }
    setError(undefined);
    setIssues([]);
    setFields(emptyEvaFields());
    setHasInstructions(true); // the user is keying instructions by hand
    setMode('manual');
    setPhase('review');
  };

  /* Images-only entry (TKT-024, re-modelled): a case created from photos with NO
     instructions yet. This was previously (incorrectly) conflated with "Image
     Based Assessment" — a different concept (an inspection method). The
     instruction-only fields don't exist yet, so the form drops them; the
     inspection Location stays a REQUIRED field, and no reason is asked for. */
  const startImagesOnly = () => {
    if (unsupportedFiles.length > 0 || batchRejection) {
      setError(batchRejection ?? 'Remove the files marked Not supported before continuing.');
      return;
    }
    setError(undefined);
    setIssues([]);
    setFields(emptyEvaFields());
    setHasInstructions(false);
    setProvider('');
    setProviderCode('');
    setProviderReference('');
    setInsuredName('');
    setReceivedFrom('');
    setReceivedOn(todayDdMmYyyy());
    setMode('images');
    setPhase('review');
  };

  /* Auto-read the instruction document on drop/pick — no "Read document" button.
     The ref (keyed on the file's identity) stops a re-parse when extra images are
     added later, or when a failed parse returns to 'pick'. */
  useEffect(() => {
    if (phase !== 'pick') return;
    if (unsupportedFiles.length > 0 || batchRejection) return;
    if (!instructionFile) {
      autoParsedRef.current = null;
      return;
    }
    if (autoParsedRef.current === instructionFile) return;
    autoParsedRef.current = instructionFile;
    void runParse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructionFile, phase, unsupportedFiles.length, batchRejection]);

  /* Seed the per-case hold from the admin "hold by default" gate, once, when it
     first resolves; a later manual toggle then sticks. */
  useEffect(() => {
    if (!gateAppliedRef.current && holdGate.data !== undefined) {
      gateAppliedRef.current = true;
      setOnHold(holdGate.data);
    }
  }, [holdGate.data]);

  /* Preview the next Case/PO for the entered Principal (TKT-004) — DB history is
     authoritative, falling back to the Box folder scan. Debounced; previews only
     (the durable claim happens server-side at create). */
  useEffect(() => {
    const code = providerCode.trim();
    if (code.length < 2) {
      setCasePoPreview(undefined);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void (getDataAccess() as DataAccessExt)
        .nextCasePo(code)
        .then((r) => {
          if (!cancelled) setCasePoPreview(r);
        })
        .catch(() => {
          if (!cancelled) setCasePoPreview(undefined);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [providerCode]);

  const onFieldChange = (key: EvaFieldKey, value: string) => {
    setFields((prev) => {
      if (!prev) return prev;
      const f = prev[key];
      // A staff edit marks the field reviewed (parity with CaseDetail).
      return { ...prev, [key]: { ...f, value, reviewState: 'reviewed' } } as EvaFields;
    });
  };

  /* ---- Vehicle lookup (DVLA/DVSA) — fills Make/Model/Mileage (review #11, #12) ---- */
  const lookUpVehicle = async () => {
    if (!fields) return;
    setError(undefined);
    setInfo(undefined);
    setEnriching(true);
    try {
      const d = await getDataAccess().lookupVehicle({ registration: vrm });
      if (d.lookup.status === 'found') {
        const merged = mergeManualVehicleLookup(
          {
            make,
            vehicleModel: fields.vehicleModel.value,
            mileage: fields.mileage.value,
            mileageUnit: fields.mileageUnit.value,
          },
          {
            make: d.make,
            vehicleModel: d.vehicle_model,
            currentMileage: d.current_mileage,
            mileageUnit: d.mileage_unit,
          },
        );
        if (merged.make !== make) setMake(merged.make);
        if (merged.vehicleModel !== fields.vehicleModel.value) {
          onFieldChange('vehicleModel', merged.vehicleModel);
        }
        if (merged.mileage !== fields.mileage.value) {
          onFieldChange('mileage', merged.mileage);
        }
        if (merged.mileageUnit !== fields.mileageUnit.value) {
          onFieldChange('mileageUnit', merged.mileageUnit);
        }
        toast(
          merged.make !== make ||
          merged.vehicleModel !== fields.vehicleModel.value ||
          merged.mileage !== fields.mileage.value ||
          merged.mileageUnit !== fields.mileageUnit.value
            ? 'Vehicle details filled in'
            : 'Vehicle details checked',
        );
      } else {
        setInfo(manualVehicleLookupMessage(d.lookup.status));
      }
    } catch {
      setInfo('Vehicle details are temporarily unavailable. Try again.');
    } finally {
      setEnriching(false);
    }
  };

  /* ---- Normalise the inspection address (postcodes.io now, Azure Maps later) (review #10) ---- */
  const normaliseInspectionAddress = async () => {
    if (!fields) return;
    setError(undefined);
    setInfo(undefined);
    setNormalising(true);
    try {
      const res = await normaliseAddress(fields.inspectionAddress.value);
      if (res.status === 'ok' && res.data) {
        onFieldChange('inspectionAddress', res.data.lines);
        toast('Inspection address standardised');
      } else {
        setInfo(res.message ?? 'Address standardisation isn’t available yet.');
      }
    } finally {
      setNormalising(false);
    }
  };

  /* ---- Form validation (review #15) ---- */
  const missingRequired = useMemo(() => {
    if (!fields) return [];
    const missing: string[] = [];
    if (mode === 'images') {
      // Image-only intake (TKT-024): required = Received from / Received on /
      // Vehicle details / Location (+ the VRM — the case's identity until
      // instructions arrive, TKT-118). Everything else is optional.
      if (!vrm.trim()) missing.push('Registration');
      if (!receivedFrom.trim()) missing.push('Received from');
      if (!receivedOn.trim()) missing.push('Received on');
      if (!fields.vehicleModel.value.trim()) missing.push('Vehicle model');
      if (!fields.inspectionAddress.value.trim()) missing.push('Location');
      // B1: an images-only case exists BECAUSE photos arrived — require at least one,
      // and the create handler now uploads them (previously they were silently dropped).
      if (!hasImages) missing.push('At least one photo');
      return missing;
    }
    if (!vrm.trim()) missing.push('Vehicle Registration');
    if (!providerCode.trim()) missing.push('Principal');
    if (!insuredName.trim()) missing.push('Insured Name');
    if (!providerReference.trim()) missing.push('Claim No');
    if (!inspectOn.trim()) missing.push('Inspect on');
    // Work Provider is captured by the prominent `provider` input above, not the
    // EVA field row — validate that, and skip workProvider in the loop below.
    if (!provider.trim()) missing.push('Work provider');
    // Contract-required EVA fields (Incident Date, Inspection Address, Vehicle
    // Model, Claimant Name, Accident Circumstances, …).
    for (const d of EVA_FIELD_ORDER) {
      if (d.key === 'workProvider') continue;
      if (CONTRACT_REQUIRED.has(d.key) && !fields[d.key].value.trim()) missing.push(d.label);
    }
    return missing;
  }, [fields, mode, vrm, provider, providerCode, insuredName, providerReference, inspectOn, receivedFrom, receivedOn, hasImages]);

  const canCreate = phase === 'review' && missingRequired.length === 0;

  const createCase = async () => {
    if (!fields) return;
    // Mirror the keyed identity into the EVA payload fields that carry them so
    // the created Case's EVA fields are self-consistent (Work Provider = provider).
    const evaForCreate: EvaFields = {
      ...fields,
      vehicleModel: {
        ...fields.vehicleModel,
        value: manualVehicleModel(make, fields.vehicleModel.value),
      },
      workProvider: mode !== 'images' && provider.trim()
        ? { ...fields.workProvider, value: provider.trim(), reviewState: 'reviewed' }
        : fields.workProvider,
    };
    setPhase('creating');
    setError(undefined);
    try {
      const isImagesOnly = mode === 'images';
      const uploadFiles = isImagesOnly
        ? filePartition.accepted.filter((f) => f !== instructionFile)
        : filePartition.accepted;
      const uploadRoles: EvidenceUploadRole[] = uploadFiles.map((file) =>
        file === instructionFile ? 'instruction' : 'extra',
      );
      const instructionIndex = instructionFile ? uploadFiles.indexOf(instructionFile) : -1;
      const createInput: CreateCaseInput = {
        evaFields: evaForCreate,
        vrm: vrm.trim(),
        // Image-only intake (TKT-024/TKT-118): NO provider is sent — the provider
        // is unknown until instructions arrive, so no Case/PO can be minted (the
        // server only mints under a supplied principal). Identity is the VRM.
        ...createIdentityFields(mode, { provider, providerCode, providerReference, insuredName }),
        // Intake status is automatic for image-only cases (the server recomputes
        // from the field/evidence state) — the form no longer offers a picker.
        status: isImagesOnly ? 'ingested' : status,
        sourceLabel: isImagesOnly
          ? `Images received — from ${receivedFrom.trim()}`
          : instructionFile
            ? 'Manual intake (instruction document)'
            : 'Manual intake (keyed by hand)',
        ...(isImagesOnly
          ? { receivedFrom: receivedFrom.trim(), receivedOn: receivedOn.trim() }
          : {}),
        ...(onHold ? { onHold: true } : {}),
        writeProvenance,
      };
      const { id } = await getDataAccess().createCase(
        createInput,
        isImagesOnly
          ? undefined
          : {
              idempotencyKey: caseCreateKeyRef.current,
              ...(uploadFiles.length > 0
                ? { evidenceUploadKey: evidenceUploadKeyRef.current }
                : {}),
              expectedEvidenceCount: uploadFiles.length,
              ...(instructionIndex >= 0 ? { instructionEvidenceIndex: instructionIndex } : {}),
            },
      );
      if (pendingManualUpload && pendingManualUpload.caseId !== id) {
        throw new Error('The existing case could not be safely resumed.');
      }
      // B1: an images-only case's photos must actually be PERSISTED — createCase
      // records only metadata. Upload the selected files through the evidence seam
      // and AWAIT it, so a failed upload surfaces and we never claim photos were
      // attached when they weren't. The case already exists, so we navigate to it
      // either way (its evidence tab lets the operator retry the attach).
      if (isImagesOnly && uploadFiles.length > 0) {
        const result = await getDataAccess().uploadEvidence(id, uploadFiles, {
          source: 'manual_intake',
          idempotencyKey: evidenceUploadKeyRef.current,
          fileRoles: uploadRoles,
        });
        const notice = manualIntakeEvidenceNotice(result, uploadFiles.length);
        toast(notice.message, notice.intent);
        clearManualIntakeOperationIdentity();
        navigate(`/case/${id}`);
        return;
      }
      if (uploadFiles.length > 0) {
        const result = await getDataAccess().uploadEvidence(id, uploadFiles, {
          source: 'manual_intake',
          idempotencyKey: evidenceUploadKeyRef.current,
          fileRoles: uploadRoles,
          manualIntakeOperation: true,
          ...(instructionIndex >= 0
            ? { manualIntakeInstructionIndex: instructionIndex }
            : {}),
        });
        const outcome = manualIntakeUploadOutcome(
          result,
          uploadFiles,
          instructionIndex,
        );
        if (!outcome.complete) {
          setPendingManualUpload({
            caseId: id,
            requiresInstruction: mode === 'document',
            outcome,
          });
          setPhase('review');
          toast('Case created — some files still need attention', 'error');
          return;
        }
        toast(outcome.message);
        clearManualIntakeOperationIdentity();
        navigate(`/case/${id}`);
        return;
      } else {
        toast('Case created');
      }
      clearManualIntakeOperationIdentity();
      navigate(`/case/${id}`);
    } catch (e) {
      setError('The case could not be finished. Check the details and files, then try again.');
      setPhase('review');
      toast(pendingManualUpload ? 'The files were not added' : 'Could not create the case', 'error');
    }
  };

  const resetToPick = () => {
    setPhase('pick');
    setMode('document');
    setFiles([]);
    setInstructionFile(undefined);
    setFields(undefined);
    setHasInstructions(false);
    setVrm('');
    setProvider('');
    setProviderCode('');
    setProviderReference('');
    setInsuredName('');
    setMake('');
    setInspectOn(todayDdMmYyyy());
    setReceivedFrom('');
    setReceivedOn(todayDdMmYyyy());
    setStatus('ingested');
    setIssues([]);
    setError(undefined);
    setInfo(undefined);
    autoParsedRef.current = null;
    const identity = rotateManualIntakeOperationIdentity();
    caseCreateKeyRef.current = identity.caseCreateKey;
    evidenceUploadKeyRef.current = identity.evidenceUploadKey;
    setPendingManualUpload(undefined);
    setOnHold(holdGate.data ?? false);
  };

  const warnings = useMemo(() => issues.filter((i) => i.severity !== 'error'), [issues]);

  return { addFiles, batchRejection, canCreate, casePoPreview, caseType, chooseInstruction, createCase, dragging, enriching, error, fields, fileInputRef, files, info, inspectOn, instructionFile, insuredName, lookUpVehicle, make, missingRequired, mode, normaliseInspectionAddress, normalising, onDragLeave, onDragOver, onDrop, onFieldChange, onHold, pendingManualUpload, phase, provider, providerCode, providerReference, receivedFrom, receivedOn, removeFile, resetToPick, setInfo, setInspectOn, setInsuredName, setMake, setOnHold, setProvider, setProviderCode, setProviderReference, setReceivedFrom, setReceivedOn, setStatus, setVrm, setWriteProvenance, startImagesOnly, startManual, status, styles, unsupportedFiles, vrm, warnings, writeProvenance, MANUAL_CLUSTER_KEYS };
}
