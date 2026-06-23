import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  Caption1,
  Checkbox,
  Divider,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  ProgressBar,
  Spinner,
  Text,
  Textarea,
  Toast,
  ToastTitle,
  makeStyles,
  mergeClasses,
  tokens,
  useToastController,
  type InputOnChangeData,
} from '@fluentui/react-components';
import {
  Car,
  FileText,
  Image as ImageIcon,
  MapPin,
  PencilLine,
  Send,
  Upload,
  X,
} from 'lucide-react';
import {
  ProvenanceBadge,
  SectionHeading,
  VrmPlate,
  GLOBAL_TOASTER_ID,
} from '../components';
import {
  EVA_FIELD_ORDER,
  CASE_TYPE_LABELS,
  caseTypeOf,
  parseDocument,
  fileToBase64,
  getDataAccess,
  useHoldNewCasesDefault,
  enrichVehicle,
  normaliseAddress,
  type CaseStatus,
  type CaseType,
  type EvaField,
  type EvaFieldKey,
  type EvaFields,
  type MileageUnit,
  type ParserIssue,
  type VatStatus,
} from '../data';
import { connectorParserTransport } from '../data/parser-connector-transport';

/* ============================================================
   ManualIntake — the "New case" / manual-intake screen.

   Two entry paths, then one shared review form:

     A. Document intake — pick (or drag in) an instruction document, base64-encode
        it in the browser, POST it to the live parser (CSP-safe connector transport
        via the data seam's parseDocument), and pre-fill the 12 EVA fields with
        their parser provenance. Additional files (vehicle images, .eml/.msg) ride
        along as evidence to link on create.

     B. Fully-manual entry — skip the parser entirely and key every field by hand
        (empty EvaFields seeded with staff provenance).

   The review form lets staff confirm/edit the EVA fields + the separate identity
   fields (VRM / Work provider / Principal / Case/PO / Claim No / Insured name),
   enrich the vehicle (DVLA/DVSA) and normalise the inspection address (postcodes.io),
   then create a real Case via the seam's createCase and navigate to it.

   Visual language matches the existing Fluent v9 screens: SectionHeading lockup,
   red-hairline cluster heads, the field-row + provenance-meta grid.
   ============================================================ */

const useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },

  panel: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    padding: tokens.spacingVerticalL,
  },

  /* Dropzone-style picker */
  dropzone: {
    border: `2px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    padding: tokens.spacingVerticalXXL,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    textAlign: 'center',
    transition: 'border-color 120ms ease, background-color 120ms ease',
  },
  dropzoneActive: {
    border: `2px dashed var(--ce-red)`,
    backgroundColor: tokens.colorNeutralBackground1Selected,
  },
  dropIcon: { color: 'var(--ce-red)' },
  pickActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  hint: { color: tokens.colorNeutralForeground3 },

  /* Chosen-files list (the instruction doc + any extra evidence) */
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    width: '100%',
    maxWidth: '560px',
    marginTop: tokens.spacingVerticalS,
  },
  fileChip: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '2px',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  fileName: {
    fontFamily: 'var(--ce-font-mono)',
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    flexGrow: 1,
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileTag: { flexShrink: 0 },

  /* Identity lockup once parsed */
  identityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
    marginBottom: tokens.spacingVerticalM,
  },
  caseTypeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalM,
  },

  /* A two-up row for paired fields (Work provider + Principal, Make + Model). */
  pairRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalM,
  },

  /* Field clusters (mirrors CaseDetail) */
  cluster: { display: 'flex', flexDirection: 'column' },
  clusterHead: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground2,
    paddingBottom: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalM,
    borderBottom: `2px solid var(--ce-red)`,
    width: 'fit-content',
  },
  clusterBody: { paddingTop: tokens.spacingVerticalM },
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: tokens.spacingHorizontalM,
    alignItems: 'start',
    paddingBottom: tokens.spacingVerticalM,
  },
  fieldMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalXS,
    paddingTop: '26px',
  },
  /* A field with an inline action button to its right (enrich / normalise). */
  fieldWithAction: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalS,
  },
  fieldGrow: { flexGrow: 1 },
  inlineNote: {
    color: tokens.colorNeutralForeground3,
    display: 'block',
    marginTop: tokens.spacingVerticalXS,
  },

  /* Parse-in-flight progress (under the dropzone) */
  parseProgress: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalM,
  },
  parseProgressLabel: { color: tokens.colorNeutralForeground3, textAlign: 'center' },

  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    marginTop: tokens.spacingVerticalM,
  },
  footerActions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  checkboxStack: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  creatingBar: { marginTop: tokens.spacingVerticalM },
  /* MessageBar spacing nudges (kept off inline style props for theming parity). */
  barBelow: { marginBottom: tokens.spacingVerticalM },
  barAbove: { marginTop: tokens.spacingVerticalM },
});

/* EVA field clusters — same grouping as CaseDetail's review grid. Identity and
   the bespoke (Make/lookup, address-normalise) controls render outside this map;
   the rest of the 12-field contract is iterated here with labels from
   EVA_FIELD_ORDER so a contract relabel (e.g. "Date of Incident") flows through. */
const FIELD_CLUSTERS: { heading: string; keys: EvaFieldKey[] }[] = [
  { heading: 'Provider & claimant', keys: ['claimantName', 'claimantTelephone', 'claimantEmail'] },
  { heading: 'Vehicle', keys: ['mileageUnit', 'vatStatus'] },
  { heading: 'Incident', keys: ['accidentCircumstances'] },
  { heading: 'Dates', keys: ['dateOfLoss', 'dateOfInstruction'] },
];

/* The EVA-required keys per the contract descriptor (single source of truth). */
const CONTRACT_REQUIRED: ReadonlySet<EvaFieldKey> = new Set(
  EVA_FIELD_ORDER.filter((d) => d.required).map((d) => d.key),
);

const LABEL_FOR: Record<EvaFieldKey, { label: string; required: boolean }> = Object.fromEntries(
  EVA_FIELD_ORDER.map((d) => [d.key, { label: d.label, required: d.required }]),
) as Record<EvaFieldKey, { label: string; required: boolean }>;

const VAT_OPTIONS: VatStatus[] = ['', 'Yes', 'No'];
const MILEAGE_UNIT_OPTIONS: MileageUnit[] = ['', 'Miles', 'Km'];

/* Inspection Type is a constant for manual intake — always a desktop / image-based
   "Vehicle Damage Inspection". Recorded, never configured (review #15). */

/* The instruction-document parser supports these; images ride along as evidence. */
const INSTRUCTION_EXT = ['.pdf', '.docx', '.doc', '.eml', '.msg'];
/* The dropzone accepts the instruction doc PLUS extra evidence (images, .eml/.msg). */
const ACCEPT = 'image/*,.pdf,.docx,.doc,.eml,.msg';

function isInstructionFile(f: File): boolean {
  const n = f.name.toLowerCase();
  return INSTRUCTION_EXT.some((ext) => n.endsWith(ext));
}
function isImageFile(f: File): boolean {
  return f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|gif|tiff?)$/i.test(f.name);
}

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

/* ---------- A single editable EVA field row (value + provenance) ---------- */
interface FieldRowProps {
  fieldKey: EvaFieldKey;
  label: string;
  required: boolean;
  fields: EvaFields;
  onChange: (key: EvaFieldKey, value: string) => void;
}

function FieldRow({ fieldKey, label, required, fields, onChange }: FieldRowProps) {
  const styles = useStyles();
  const field = fields[fieldKey];
  const empty = field.value.trim().length === 0;
  const validation =
    required && empty
      ? ({ validationState: 'error' as const, validationMessage: 'Required' })
      : {};
  const change = (_: unknown, data: InputOnChangeData) => onChange(fieldKey, data.value);

  let control: React.ReactNode;
  if (fieldKey === 'accidentCircumstances') {
    control = (
      <Textarea value={field.value} onChange={(_, d) => onChange(fieldKey, d.value)} resize="vertical" rows={3} />
    );
  } else if (fieldKey === 'vatStatus') {
    control = (
      <Dropdown
        value={field.value || '—'}
        selectedOptions={[field.value]}
        onOptionSelect={(_, d) => onChange(fieldKey, d.optionValue ?? '')}
      >
        {VAT_OPTIONS.map((o) => (
          <Option key={o || 'blank'} value={o} text={o || '—'}>
            {o || '—'}
          </Option>
        ))}
      </Dropdown>
    );
  } else if (fieldKey === 'mileageUnit') {
    control = (
      <Dropdown
        value={field.value || '—'}
        selectedOptions={[field.value]}
        onOptionSelect={(_, d) => onChange(fieldKey, d.optionValue ?? '')}
      >
        {MILEAGE_UNIT_OPTIONS.map((o) => (
          <Option key={o || 'blank'} value={o} text={o || '—'}>
            {o || '—'}
          </Option>
        ))}
      </Dropdown>
    );
  } else {
    control = <Input value={field.value} onChange={change} />;
  }

  return (
    <div className={styles.fieldRow}>
      {/* Fluent's `required` renders the asterisk AND exposes the required
          semantic to assistive tech (the hand-appended " *" did neither). */}
      <Field label={label} required={required} {...validation}>
        {control}
      </Field>
      <div className={styles.fieldMeta}>
        <ProvenanceBadge provenance={field.provenance} reviewState={field.reviewState} />
      </div>
    </div>
  );
}

type Phase = 'pick' | 'parsing' | 'review' | 'creating';

export function ManualIntake() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /* Identity of the instruction file already auto-parsed (name:size), so adding
     images afterwards (or a failed parse) does not re-fire the auto-read. */
  const autoParsedRef = useRef<string | null>(null);
  const gateAppliedRef = useRef(false);
  const holdGate = useHoldNewCasesDefault();

  const [phase, setPhase] = useState<Phase>('pick');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);

  const [fields, setFields] = useState<EvaFields | undefined>();
  /* Whether the case carries parsed/keyed instructions — drives the case-type badge. */
  const [hasInstructions, setHasInstructions] = useState(false);

  /* Identity fields — SEPARATE and correctly labelled (review #7). */
  const [vrm, setVrm] = useState('');
  const [provider, setProvider] = useState(''); // Work provider display name
  const [providerCode, setProviderCode] = useState(''); // 4-char Principal code
  const [casePo, setCasePo] = useState(''); // our internal reference
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
  /* Image-based intake: locks the inspection address to the "Image Based
     Assessment" literal + the image_based decision, with an optional reason. */
  const [inspectionDecision, setInspectionDecision] = useState<'unknown' | 'image_based'>('unknown');
  const [imageBasedReason, setImageBasedReason] = useState('');
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

  /* The first instruction-type file is the parse target; the rest are evidence. */
  const instructionFile = useMemo(() => files.find(isInstructionFile), [files]);
  const hasImages = useMemo(() => files.some(isImageFile), [files]);

  /* Derived, non-configurable case type (review #5). */
  const caseType: CaseType = useMemo(
    () => caseTypeOf({ status }, { hasImages, hasInstructions }),
    [status, hasImages, hasInstructions],
  );

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError(undefined);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const next = [...prev];
      for (const f of Array.from(list)) {
        const key = `${f.name}:${f.size}`;
        if (!seen.has(key)) {
          seen.add(key);
          next.push(f);
        }
      }
      return next;
    });
  };

  const removeFile = (index: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== index));

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
        connectorParserTransport,
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
      setIssues(result.issues); // warnings, if any
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('pick');
    }
  };

  /* Fully-manual entry (review #17): straight to the review form, empty fields. */
  const startManual = () => {
    setError(undefined);
    setIssues([]);
    setFields(emptyEvaFields());
    setHasInstructions(true); // the user is keying instructions by hand
    setInspectionDecision('unknown');
    setPhase('review');
  };

  /* Image-based entry: an images-only case with the locked "Image Based
     Assessment" inspection decision (no instruction document, no physical
     location). The reviewer adds an optional reason. */
  const startImageBased = () => {
    setError(undefined);
    setIssues([]);
    const f = emptyEvaFields();
    f.inspectionAddress = {
      ...f.inspectionAddress,
      value: 'Image Based Assessment',
      reviewState: 'reviewed',
    };
    setFields(f);
    setHasInstructions(false);
    setInspectionDecision('image_based');
    setImageBasedReason('');
    setPhase('review');
  };

  /* Auto-read the instruction document on drop/pick — no "Read document" button.
     The ref (keyed on the file's identity) stops a re-parse when extra images are
     added later, or when a failed parse returns to 'pick'. */
  useEffect(() => {
    if (phase !== 'pick') return;
    if (!instructionFile) {
      autoParsedRef.current = null;
      return;
    }
    const key = `${instructionFile.name}:${instructionFile.size}`;
    if (autoParsedRef.current === key) return;
    autoParsedRef.current = key;
    void runParse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructionFile, phase]);

  /* Seed the per-case hold from the admin "hold by default" gate, once, when it
     first resolves; a later manual toggle then sticks. */
  useEffect(() => {
    if (!gateAppliedRef.current && holdGate.data !== undefined) {
      gateAppliedRef.current = true;
      setOnHold(holdGate.data);
    }
  }, [holdGate.data]);

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
    setError(undefined);
    setInfo(undefined);
    setEnriching(true);
    try {
      const res = await enrichVehicle(vrm);
      if (res.status === 'ok' && res.data) {
        const d = res.data;
        if (d.make) setMake(d.make);
        if (d.model) onFieldChange('vehicleModel', d.model);
        if (d.mileage) onFieldChange('mileage', d.mileage);
        if (d.mileageUnit) onFieldChange('mileageUnit', d.mileageUnit);
        toast('Vehicle details filled in');
      } else {
        // not_connected / error — show the returned message, never fabricate.
        setInfo(res.message ?? 'Vehicle lookup isn’t available yet.');
      }
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
    if (!vrm.trim()) missing.push('Vehicle Registration');
    if (!providerCode.trim()) missing.push('Principal');
    if (!casePo.trim()) missing.push('Case/PO');
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
  }, [fields, vrm, provider, providerCode, casePo, insuredName, providerReference, inspectOn]);

  const canCreate = phase === 'review' && missingRequired.length === 0;

  const createCase = async () => {
    if (!fields) return;
    // Mirror the keyed identity into the EVA payload fields that carry them so
    // the created Case's EVA fields are self-consistent (Work Provider = provider).
    const evaForCreate: EvaFields = {
      ...fields,
      workProvider: provider.trim()
        ? { ...fields.workProvider, value: provider.trim(), reviewState: 'reviewed' }
        : fields.workProvider,
    };
    setPhase('creating');
    setError(undefined);
    try {
      const evidenceCount = files.filter((f) => f !== instructionFile).length;
      const { id } = await getDataAccess().createCase({
        evaFields: evaForCreate,
        vrm: vrm.trim(),
        ...(provider.trim() ? { provider: provider.trim() } : {}),
        ...(providerCode.trim() ? { providerCode: providerCode.trim() } : {}),
        ...(casePo.trim() ? { casePo: casePo.trim() } : {}),
        ...(insuredName.trim() ? { insuredName: insuredName.trim() } : {}),
        ...(providerReference.trim() ? { providerReference: providerReference.trim() } : {}),
        status,
        sourceLabel: instructionFile
          ? `Manual intake — ${instructionFile.name}`
          : 'Manual intake (keyed by hand)',
        ...(inspectionDecision === 'image_based' ? { inspectionDecision: 'image_based' as const } : {}),
        ...(inspectionDecision === 'image_based' && imageBasedReason.trim()
          ? { inspectionDecisionReason: imageBasedReason.trim() }
          : {}),
        ...(onHold ? { onHold: true } : {}),
        writeProvenance,
      });
      if (evidenceCount > 0) {
        // Persisting the evidence bytes is the operator-gated storage step; the
        // case link is the point. Surface that the files travel with the case.
        toast(`Case created — ${evidenceCount} evidence file(s) linked`);
      } else {
        toast('Case created');
      }
      navigate(`/case/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('review');
      toast('Could not create the case', 'error');
    }
  };

  const resetToPick = () => {
    setPhase('pick');
    setFiles([]);
    setFields(undefined);
    setHasInstructions(false);
    setVrm('');
    setProvider('');
    setProviderCode('');
    setCasePo('');
    setProviderReference('');
    setInsuredName('');
    setMake('');
    setInspectOn(todayDdMmYyyy());
    setStatus('ingested');
    setIssues([]);
    setError(undefined);
    setInfo(undefined);
    autoParsedRef.current = null;
    setInspectionDecision('unknown');
    setImageBasedReason('');
    setOnHold(holdGate.data ?? false);
  };

  const warnings = useMemo(() => issues.filter((i) => i.severity !== 'error'), [issues]);

  return (
    <div className={mergeClasses('ce-enter', styles.page)}>
      <SectionHeading eyebrow="Intake" heading="New case" subtitle="Read the details from an instruction document, or type a case in by hand." />

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Something went wrong</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      )}

      {info && (
        <MessageBar intent="info" onClick={() => setInfo(undefined)}>
          <MessageBarBody>{info}</MessageBarBody>
        </MessageBar>
      )}

      {/* ----- STEP 1: pick + parse ----- */}
      {(phase === 'pick' || phase === 'parsing') && (
        <div className={styles.panel}>
          <div
            className={mergeClasses(styles.dropzone, dragging && styles.dropzoneActive)}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <Upload size={36} className={styles.dropIcon} strokeWidth={1.5} aria-hidden />
            <Text weight="semibold">Drag files here — we’ll read an instruction document automatically</Text>
            <Caption1 className={styles.hint}>
              Drop a PDF, Word (.docx/.doc) or email (.eml/.msg) and it’s read automatically — no button
              needed. Add vehicle images alongside to attach them as evidence, or choose “Image based”
              for an images-only case.
            </Caption1>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = ''; // allow re-picking the same file
              }}
            />
            <div className={styles.pickActions}>
              <Button
                appearance="secondary"
                icon={<Upload size={16} />}
                onClick={() => fileInputRef.current?.click()}
                disabled={phase === 'parsing'}
              >
                {files.length > 0 ? 'Add files' : 'Choose file'}
              </Button>
              <Button
                appearance="transparent"
                icon={<PencilLine size={16} />}
                onClick={startManual}
                disabled={phase === 'parsing'}
              >
                Enter manually (no document)
              </Button>
              <Button
                appearance="transparent"
                icon={<ImageIcon size={16} />}
                onClick={startImageBased}
                disabled={phase === 'parsing'}
              >
                Image based (images only)
              </Button>
            </div>

            {/* Chosen files — the instruction doc is parsed; the rest ride along. */}
            {files.length > 0 && (
              <div className={styles.fileList}>
                {files.map((f, i) => {
                  const isDoc = f === instructionFile;
                  const isImg = isImageFile(f);
                  return (
                    <div key={`${f.name}-${f.size}-${i}`} className={styles.fileChip}>
                      {isImg ? <ImageIcon size={14} aria-hidden /> : <FileText size={14} aria-hidden />}
                      <span className={styles.fileName} title={f.name}>
                        {f.name}
                      </span>
                      <Badge
                        className={styles.fileTag}
                        size="small"
                        appearance="tint"
                        color={isDoc ? 'danger' : 'informative'}
                      >
                        {isDoc ? 'Instruction' : isImg ? 'Image' : 'Evidence'}
                      </Badge>
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={<X size={14} />}
                        aria-label={`Remove ${f.name}`}
                        onClick={() => removeFile(i)}
                        disabled={phase === 'parsing'}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            {files.length > 0 && !instructionFile && (
              <Caption1 className={styles.hint}>
                Add a PDF, Word, or email instruction document to read from, or enter the case manually.
              </Caption1>
            )}
          </div>

          {/* Parse is a multi-second Function call → indeterminate bar + copy. */}
          {phase === 'parsing' && (
            <div className={styles.parseProgress} role="status" aria-live="polite">
              <ProgressBar aria-label="Reading document" thickness="medium" />
              <Caption1 className={styles.parseProgressLabel}>
                Reading the document — this can take a few seconds for scanned PDFs.
              </Caption1>
            </div>
          )}
        </div>
      )}

      {/* ----- STEP 2: review + create ----- */}
      {(phase === 'review' || phase === 'creating') && fields && (
        <div className={styles.panel}>
          {warnings.length > 0 && (
            <MessageBar intent="warning" className={styles.barBelow}>
              <MessageBarBody>
                <MessageBarTitle>Check these details</MessageBarTitle>
                {warnings.map((w) => w.message).join(' · ')}
              </MessageBarBody>
            </MessageBar>
          )}

          {/* Case identity */}
          <span className={styles.clusterHead}>Case identity</span>
          <div className={styles.clusterBody}>
            {/* Derived, non-configurable case type (review #5). */}
            <div className={styles.caseTypeRow}>
              <Text size={200} className={styles.hint}>
                Case type
              </Text>
              <Badge appearance="outline" color="brand">
                {CASE_TYPE_LABELS[caseType]}
              </Badge>
            </div>

            <div className={styles.identityRow}>{vrm.trim() && <VrmPlate vrm={vrm} size="large" />}</div>

            {/* VRM — a REQUIRED EVA field (review #7), with the DVLA/DVSA lookup. */}
            <div className={styles.fieldRow}>
              <div className={styles.fieldWithAction}>
                <Field
                  className={styles.fieldGrow}
                  label="Vehicle Registration (VRM)"
                  required
                  hint="The vehicle's number plate."
                  {...(!vrm.trim()
                    ? { validationState: 'error' as const, validationMessage: 'Required' }
                    : {})}
                >
                  <Input value={vrm} onChange={(_, d) => setVrm(d.value)} />
                </Field>
                <Button
                  icon={enriching ? <Spinner size="tiny" /> : <Car size={16} />}
                  onClick={lookUpVehicle}
                  disabled={enriching || !vrm.trim()}
                >
                  Look up vehicle details
                </Button>
              </div>
              <div />
            </div>

            {/* Work provider + Principal — BOTH, separate (review #7). */}
            <div className={styles.pairRow}>
              <Field label="Work provider" required hint="Provider display name, e.g. “Knightsbridge Solicitors”." {...(!provider.trim() ? { validationState: 'error' as const, validationMessage: 'Required' } : {})}>
                <Input value={provider} onChange={(_, d) => setProvider(d.value)} />
              </Field>
              <Field label="Principal" required hint="4-char principal code, e.g. KBS." {...(!providerCode.trim() ? { validationState: 'error' as const, validationMessage: 'Required' } : {})}>
                <Input value={providerCode} maxLength={8} onChange={(_, d) => setProviderCode(d.value.toUpperCase())} />
              </Field>
            </div>

            {/* Case/PO — our internal reference (separate from the provider's). */}
            <div className={styles.fieldRow}>
              <Field
                label="Case/PO"
                required
                hint="Our internal reference for the case."
                {...(!casePo.trim() ? { validationState: 'error' as const, validationMessage: 'Required' } : {})}
              >
                <Input value={casePo} onChange={(_, d) => setCasePo(d.value)} />
              </Field>
              <div />
            </div>

            {/* Provider's reference / Claim No — the provider's own case number. */}
            <div className={styles.fieldRow}>
              <Field
                label="Provider's reference / Claim No"
                required
                hint="The work provider's own case / claim number — not our Case/PO."
                {...(!providerReference.trim() ? { validationState: 'error' as const, validationMessage: 'Required' } : {})}
              >
                <Input value={providerReference} onChange={(_, d) => setProviderReference(d.value)} />
              </Field>
              <div />
            </div>

            {/* Insured name. */}
            <div className={styles.fieldRow}>
              <Field
                label="Insured Name"
                required
                {...(!insuredName.trim() ? { validationState: 'error' as const, validationMessage: 'Required' } : {})}
              >
                <Input value={insuredName} onChange={(_, d) => setInsuredName(d.value)} />
              </Field>
              <div />
            </div>

            {/* Intake status (review #7: renamed from "Initial status"). */}
            <div className={styles.fieldRow}>
              <Field label="Intake status">
                <Dropdown
                  value={status === 'ingested' ? 'Ingested' : 'New email'}
                  selectedOptions={[status]}
                  onOptionSelect={(_, d) => d.optionValue && setStatus(d.optionValue as CaseStatus)}
                >
                  <Option value="ingested" text="Ingested">
                    Ingested
                  </Option>
                  <Option value="new_email" text="New email">
                    New email
                  </Option>
                </Dropdown>
              </Field>
              <div />
            </div>
          </div>

          {/* Provider & claimant + Vehicle (make/model lookup lives here) */}
          <span className={styles.clusterHead}>Provider &amp; claimant</span>
          <div className={styles.clusterBody}>
            {FIELD_CLUSTERS[0].keys.map((key) => (
              <FieldRow key={key} fieldKey={key} label={LABEL_FOR[key].label} required={LABEL_FOR[key].required} fields={fields} onChange={onFieldChange} />
            ))}
          </div>

          <span className={styles.clusterHead}>Vehicle</span>
          <div className={styles.clusterBody}>
            {/* Make (informational/enrichable) + Model side by side (review #11). */}
            <div className={styles.pairRow}>
              <Field label="Make" hint="Filled by the vehicle lookup.">
                <Input value={make} onChange={(_, d) => setMake(d.value)} />
              </Field>
              <Field label={LABEL_FOR.vehicleModel.label} required={LABEL_FOR.vehicleModel.required} {...(LABEL_FOR.vehicleModel.required && !fields.vehicleModel.value.trim() ? { validationState: 'error' as const, validationMessage: 'Required' } : {})}>
                <Input value={fields.vehicleModel.value} onChange={(_, d) => onFieldChange('vehicleModel', d.value)} />
              </Field>
            </div>
            {/* Mileage — fillable by the same DVLA/DVSA lookup (review #12). */}
            <div className={styles.fieldRow}>
              <Field label={LABEL_FOR.mileage.label}>
                <Input value={fields.mileage.value} onChange={(_, d) => onFieldChange('mileage', d.value)} />
              </Field>
              <div className={styles.fieldMeta}>
                <ProvenanceBadge provenance={fields.mileage.provenance} reviewState={fields.mileage.reviewState} />
              </div>
            </div>
            {FIELD_CLUSTERS[1].keys.map((key) => (
              <FieldRow key={key} fieldKey={key} label={LABEL_FOR[key].label} required={LABEL_FOR[key].required} fields={fields} onChange={onFieldChange} />
            ))}
            {/* VAT is manual — DVLA/DVSA do not return it (review #16). The VAT
                control is rendered by the FieldRow above (vatStatus); add the note. */}
            <Caption1 className={styles.inlineNote}>
              Enter the VAT status manually.
            </Caption1>
          </div>

          {/* Incident (accident circumstances + inspection address with normalise) */}
          <span className={styles.clusterHead}>Incident</span>
          <div className={styles.clusterBody}>
            {FIELD_CLUSTERS[2].keys.map((key) => (
              <FieldRow key={key} fieldKey={key} label={LABEL_FOR[key].label} required={LABEL_FOR[key].required} fields={fields} onChange={onFieldChange} />
            ))}
            {/* Inspection address — for an image-based case it is the locked
                "Image Based Assessment" literal + a reason; otherwise the editable
                address with the postcodes.io normalise (review #10). */}
            {inspectionDecision === 'image_based' ? (
              <>
                <div className={styles.fieldRow}>
                  <Field label={LABEL_FOR.inspectionAddress.label}>
                    <MessageBar intent="info">
                      <MessageBarBody>
                        <MessageBarTitle>Image Based Assessment</MessageBarTitle>
                        No physical inspection location — this case is assessed from images.
                      </MessageBarBody>
                    </MessageBar>
                  </Field>
                  <div className={styles.fieldMeta}>
                    <ProvenanceBadge provenance={fields.inspectionAddress.provenance} reviewState={fields.inspectionAddress.reviewState} />
                  </div>
                </div>
                <div className={styles.fieldRow}>
                  <Field
                    label="Reason for image-based assessment"
                    hint="Why is there no physical inspection location? Recorded as a case note."
                  >
                    <Textarea
                      value={imageBasedReason}
                      onChange={(_, d) => setImageBasedReason(d.value)}
                      resize="vertical"
                      rows={2}
                    />
                  </Field>
                  <div />
                </div>
              </>
            ) : (
              <>
                <div className={styles.fieldRow}>
                  <div className={styles.fieldWithAction}>
                    <Field
                      className={styles.fieldGrow}
                      label={LABEL_FOR.inspectionAddress.label}
                      required
                      {...(!fields.inspectionAddress.value.trim()
                        ? { validationState: 'error' as const, validationMessage: 'Required' }
                        : {})}
                    >
                      <Textarea
                        value={fields.inspectionAddress.value}
                        onChange={(_, d) => onFieldChange('inspectionAddress', d.value)}
                        resize="vertical"
                        rows={6}
                      />
                    </Field>
                    <Button
                      icon={normalising ? <Spinner size="tiny" /> : <MapPin size={16} />}
                      onClick={normaliseInspectionAddress}
                      disabled={normalising || !fields.inspectionAddress.value.trim()}
                    >
                      Standardise address
                    </Button>
                  </div>
                  <div className={styles.fieldMeta}>
                    <ProvenanceBadge provenance={fields.inspectionAddress.provenance} reviewState={fields.inspectionAddress.reviewState} />
                  </div>
                </div>
                <Caption1 className={styles.inlineNote}>
                  Tidy the address into a standard format.
                </Caption1>
              </>
            )}
          </div>

          {/* Dates + Inspection */}
          <span className={styles.clusterHead}>Dates &amp; inspection</span>
          <div className={styles.clusterBody}>
            {FIELD_CLUSTERS[3].keys.map((key) => (
              <FieldRow key={key} fieldKey={key} label={LABEL_FOR[key].label} required={LABEL_FOR[key].required} fields={fields} onChange={onFieldChange} />
            ))}
            {/* Inspect on (inspection date) — required, defaults to today (review #15). */}
            <div className={styles.fieldRow}>
              <Field
                label="Inspect on (inspection date)"
                required
                hint="Defaults to today if the instructions carry no date. Format DD/MM/YYYY."
                {...(!inspectOn.trim() ? { validationState: 'error' as const, validationMessage: 'Required' } : {})}
              >
                <Input value={inspectOn} onChange={(_, d) => setInspectOn(d.value)} />
              </Field>
              <div />
            </div>
            <Caption1 className={styles.inlineNote}>
              Inspection type: Vehicle damage inspection.
            </Caption1>
          </div>

          {missingRequired.length > 0 && (
            <MessageBar intent="warning" className={styles.barAbove}>
              <MessageBarBody>
                <MessageBarTitle>Required before creating</MessageBarTitle>
                {missingRequired.join(' · ')}
              </MessageBarBody>
            </MessageBar>
          )}

          <Divider />

          {phase === 'creating' && (
            <ProgressBar className={styles.creatingBar} aria-label="Creating case" thickness="medium" />
          )}

          <div className={styles.footer}>
            <div className={styles.checkboxStack}>
              <Checkbox
                checked={writeProvenance}
                onChange={(_, d) => setWriteProvenance(d.checked === true)}
                label="Record where each field came from"
              />
              <Checkbox
                checked={onHold}
                onChange={(_, d) => setOnHold(d.checked === true)}
                label="Put this case on hold"
              />
            </div>
            <div className={styles.footerActions}>
              <Button appearance="secondary" onClick={resetToPick} disabled={phase === 'creating'}>
                Start over
              </Button>
              <Button
                appearance="primary"
                icon={phase === 'creating' ? <Spinner size="tiny" /> : <Send size={16} />}
                onClick={createCase}
                disabled={phase === 'creating' || !canCreate}
              >
                {phase === 'creating' ? 'Creating…' : 'Create case'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManualIntake;
