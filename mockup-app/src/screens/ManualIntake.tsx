import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Caption1,
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
import { ArrowLeft, FileUp, Send, Sparkles, Upload } from 'lucide-react';
import {
  ProvenanceBadge,
  SectionHeading,
  VrmPlate,
  GLOBAL_TOASTER_ID,
} from '../components';
import {
  EVA_FIELD_ORDER,
  parseDocument,
  fileToBase64,
  getDataAccess,
  type CaseStatus,
  type EvaFieldKey,
  type EvaFields,
  type MileageUnit,
  type ParserIssue,
  type VatStatus,
} from '../data';

/* ============================================================
   ManualIntake — the zero-inbox demo path.

   Pick an instruction document -> base64-encode in the browser -> POST to the
   live parser (FUNCTION-direct fetch, via the data seam's parseDocument) ->
   render the returned 12 EVA fields with their confidence/source ProvenanceBadge
   (the SAME badge the live review screen uses) -> let the user confirm/edit ->
   create a real Case via the generated CasesService (through the seam's
   createCase) -> navigate to it in the existing CaseDetail screen.

   Visual language matches the existing Fluent v9 screens: SectionHeading lockup,
   red-hairline cluster heads, the field-row + provenance-meta grid.
   ============================================================ */

const useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  backRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },

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
  },
  dropIcon: { color: 'var(--ce-red)' },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  fileName: {
    fontFamily: 'var(--ce-font-mono)',
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
  },
  hint: { color: tokens.colorNeutralForeground3 },

  /* Identity lockup once parsed */
  identityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalL,
    flexWrap: 'wrap',
    marginBottom: tokens.spacingVerticalM,
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
  creatingBar: { marginTop: tokens.spacingVerticalM },
});

/* Field clusters — same grouping as CaseDetail's review grid. */
const FIELD_CLUSTERS: { heading: string; keys: EvaFieldKey[] }[] = [
  { heading: 'Provider & claimant', keys: ['workProvider', 'claimantName', 'claimantTelephone', 'claimantEmail'] },
  { heading: 'Vehicle', keys: ['vehicleModel', 'mileage', 'mileageUnit', 'vatStatus'] },
  { heading: 'Incident', keys: ['accidentCircumstances', 'inspectionAddress'] },
  { heading: 'Dates', keys: ['dateOfLoss', 'dateOfInstruction'] },
];

const LABEL_FOR: Record<EvaFieldKey, { label: string; required: boolean }> = Object.fromEntries(
  EVA_FIELD_ORDER.map((d) => [d.key, { label: d.label, required: d.required }]),
) as Record<EvaFieldKey, { label: string; required: boolean }>;

const VAT_OPTIONS: VatStatus[] = ['', 'Yes', 'No'];
const MILEAGE_UNIT_OPTIONS: MileageUnit[] = ['', 'Miles', 'Km'];

/* Accepted document types (the parser supports .pdf/.docx/.doc/.eml/.msg). */
const ACCEPT = '.pdf,.docx,.doc,.eml,.msg';

/* ---------- A single editable EVA field row (parsed value + provenance) ---------- */
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
      ? ({ validationState: 'warning' as const, validationMessage: `${label} is required for EVA` })
      : {};
  const change = (_: unknown, data: InputOnChangeData) => onChange(fieldKey, data.value);

  let control: React.ReactNode;
  if (fieldKey === 'accidentCircumstances' || fieldKey === 'inspectionAddress') {
    control = (
      <Textarea
        value={field.value}
        onChange={(_, d) => onChange(fieldKey, d.value)}
        resize="vertical"
        rows={fieldKey === 'inspectionAddress' ? 6 : 3}
      />
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
      <Field label={required ? `${label} *` : label} {...validation}>
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

  const [phase, setPhase] = useState<Phase>('pick');
  const [file, setFile] = useState<File | undefined>();
  const [fields, setFields] = useState<EvaFields | undefined>();
  const [vrm, setVrm] = useState('');
  const [casePo, setCasePo] = useState('');
  const [status, setStatus] = useState<CaseStatus>('ingested');
  const [writeProvenance, setWriteProvenance] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [issues, setIssues] = useState<ParserIssue[]>([]);

  const toast = (title: string, intent: 'success' | 'error' = 'success') =>
    dispatchToast(
      <Toast>
        <ToastTitle>{title}</ToastTitle>
      </Toast>,
      { intent },
    );

  const onPick = (f: File | undefined) => {
    setFile(f);
    setError(undefined);
  };

  const runParse = async () => {
    if (!file) return;
    setError(undefined);
    setIssues([]);
    setPhase('parsing');
    try {
      const base64 = await fileToBase64(file);
      const result = await parseDocument({ document: base64, filename: file.name });
      const errs = result.issues.filter((i) => i.severity === 'error');
      if (errs.length > 0 || !result.evaFields) {
        setIssues(result.issues);
        setError(errs.map((e) => e.message).join(' · ') || 'The parser could not extract this document.');
        setPhase('pick');
        return;
      }
      setFields(result.evaFields);
      setVrm(result.vrm);
      setCasePo(result.reference);
      setIssues(result.issues); // warnings, if any
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('pick');
    }
  };

  const onFieldChange = (key: EvaFieldKey, value: string) => {
    setFields((prev) => {
      if (!prev) return prev;
      const f = prev[key];
      // A staff edit marks the field reviewed (parity with CaseDetail).
      return { ...prev, [key]: { ...f, value, reviewState: 'reviewed' } } as EvaFields;
    });
  };

  const createCase = async () => {
    if (!fields) return;
    setPhase('creating');
    setError(undefined);
    try {
      const { id } = await getDataAccess().createCase({
        evaFields: fields,
        vrm: vrm.trim(),
        ...(casePo.trim() ? { casePo: casePo.trim() } : {}),
        status,
        sourceLabel: file ? `Manual intake — ${file.name}` : 'Manual intake (Code App)',
        writeProvenance,
      });
      toast('Case created');
      navigate(`/case/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('review');
      toast('Could not create the case', 'error');
    }
  };

  const resetToPick = () => {
    setPhase('pick');
    setFields(undefined);
    setVrm('');
    setCasePo('');
    setIssues([]);
    setError(undefined);
  };

  const warnings = useMemo(() => issues.filter((i) => i.severity !== 'error'), [issues]);

  return (
    <div className={mergeClasses('ce-enter', styles.page)}>
      <div>
        <div className={styles.backRow}>
          <Button
            appearance="transparent"
            icon={<ArrowLeft size={14} />}
            onClick={() => navigate('/')}
          >
            Dashboard
          </Button>
        </div>
        <SectionHeading
          eyebrow="Intake"
          heading="Manual intake"
          subtitle="Upload an instruction document, run it through the live parser, review the extracted fields, then create a case — no inbox required."
        />
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Parse / create failed</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      )}

      {/* ----- STEP 1: pick + parse ----- */}
      {(phase === 'pick' || phase === 'parsing') && (
        <div className={styles.panel}>
          <div className={styles.dropzone}>
            <FileUp size={36} className={styles.dropIcon} strokeWidth={1.5} />
            <Text weight="semibold">Choose an instruction document</Text>
            <Caption1 className={styles.hint}>
              Supported: PDF, Word (.docx/.doc), email (.eml/.msg). The document is base64-encoded in
              your browser and sent to the live parser.
            </Caption1>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              style={{ display: 'none' }}
              onChange={(e) => onPick(e.target.files?.[0])}
            />
            <div className={styles.fileRow}>
              <Button
                appearance="secondary"
                icon={<Upload size={16} />}
                onClick={() => fileInputRef.current?.click()}
                disabled={phase === 'parsing'}
              >
                Choose file
              </Button>
              {file && <span className={styles.fileName}>{file.name}</span>}
            </div>
            <Button
              appearance="primary"
              icon={phase === 'parsing' ? <Spinner size="tiny" /> : <Sparkles size={16} />}
              onClick={runParse}
              disabled={!file || phase === 'parsing'}
            >
              {phase === 'parsing' ? 'Parsing…' : 'Parse document'}
            </Button>
          </div>

          {/* Parse is a multi-second Azure-Function call → indeterminate bar +
              expectation-setting copy while it runs. */}
          {phase === 'parsing' && (
            <div className={styles.parseProgress} role="status" aria-live="polite">
              <ProgressBar aria-label="Parsing document" thickness="medium" />
              <Caption1 className={styles.parseProgressLabel}>
                Parsing document — this can take a few seconds for scanned PDFs.
              </Caption1>
            </div>
          )}
        </div>
      )}

      {/* ----- STEP 2: review + create ----- */}
      {(phase === 'review' || phase === 'creating') && fields && (
        <div className={styles.panel}>
          {warnings.length > 0 && (
            <MessageBar intent="warning" style={{ marginBottom: tokens.spacingVerticalM }}>
              <MessageBarBody>
                <MessageBarTitle>Parser warnings</MessageBarTitle>
                {warnings.map((w) => w.message).join(' · ')}
              </MessageBarBody>
            </MessageBar>
          )}

          {/* Case identity */}
          <span className={styles.clusterHead}>Case identity</span>
          <div className={styles.clusterBody}>
            <div className={styles.identityRow}>
              {vrm.trim() && <VrmPlate vrm={vrm} size="large" />}
            </div>
            <div className={styles.fieldRow}>
              <Field label="VRM" hint="Vehicle registration — Case identity, not an EVA payload field.">
                <Input value={vrm} onChange={(_, d) => setVrm(d.value)} />
              </Field>
              <div />
            </div>
            <div className={styles.fieldRow}>
              <Field label="Provider reference / Case-PO" hint="Provider's case number / our Case-PO.">
                <Input value={casePo} onChange={(_, d) => setCasePo(d.value)} />
              </Field>
              <div />
            </div>
            <div className={styles.fieldRow}>
              <Field label="Initial status">
                <Dropdown
                  value={status === 'ingested' ? 'Ingested' : 'New email'}
                  selectedOptions={[status]}
                  onOptionSelect={(_, d) => d.optionValue && setStatus(d.optionValue as CaseStatus)}
                >
                  <Option value="ingested" text="Ingested">Ingested</Option>
                  <Option value="new_email" text="New email">New email</Option>
                </Dropdown>
              </Field>
              <div />
            </div>
          </div>

          {/* EVA fields */}
          {FIELD_CLUSTERS.map((cluster) => (
            <div className={styles.cluster} key={cluster.heading}>
              <span className={styles.clusterHead}>{cluster.heading}</span>
              <div className={styles.clusterBody}>
                {cluster.keys.map((key) => (
                  <FieldRow
                    key={key}
                    fieldKey={key}
                    label={LABEL_FOR[key].label}
                    required={LABEL_FOR[key].required}
                    fields={fields}
                    onChange={onFieldChange}
                  />
                ))}
              </div>
            </div>
          ))}

          <Divider />

          {phase === 'creating' && (
            <ProgressBar className={styles.creatingBar} aria-label="Creating case" thickness="medium" />
          )}

          <div className={styles.footer}>
            <Field>
              <Dropdown
                value={writeProvenance ? 'Write field provenance rows' : 'Skip provenance rows'}
                selectedOptions={[writeProvenance ? 'yes' : 'no']}
                onOptionSelect={(_, d) => setWriteProvenance(d.optionValue === 'yes')}
              >
                <Option value="yes" text="Write field provenance rows">Write field provenance rows</Option>
                <Option value="no" text="Skip provenance rows">Skip provenance rows</Option>
              </Dropdown>
            </Field>
            <div className={styles.footerActions}>
              <Button appearance="secondary" onClick={resetToPick} disabled={phase === 'creating'}>
                Start over
              </Button>
              <Button
                appearance="primary"
                icon={phase === 'creating' ? <Spinner size="tiny" /> : <Send size={16} />}
                onClick={createCase}
                disabled={phase === 'creating' || !vrm.trim()}
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
