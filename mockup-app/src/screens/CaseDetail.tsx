import { useMemo, useRef, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Caption1,
  Checkbox,
  Divider,
  Dropdown,
  Field,
  Input,
  Link,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  Switch,
  Tab,
  TabList,
  Text,
  Textarea,
  Toast,
  ToastTitle,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
  useToastController,
  type InputOnChangeData,
  type SelectTabData,
  type SelectTabEvent,
} from '@fluentui/react-components';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  FileJson,
  ImageOff,
  Send,
  Upload,
  X,
} from 'lucide-react';
import {
  ChaserPanel,
  ImageOrderList,
  JsonView,
  PipelineStrip,
  ProvenanceBadge,
  SectionHeading,
  StatusBadge,
  VrmPlate,
  computeReadiness,
  type ChecklistItem,
} from '../components';
import {
  EVA_FIELD_ORDER,
  caseById,
  dueInfo,
  imagesForCase,
  type ActionReason,
  type Case,
  type CaseStatus,
  type EvaFieldKey,
  type Evidence,
  type ImageRole,
  type MileageUnit,
  type Note,
  type PipelineStageKey,
  type VatStatus,
} from '../mock';
import { GLOBAL_TOASTER_ID } from '../components';

/* ============================================================
   CaseDetail — the core review screen.
   Header (back / title / status / actions) + a count-only "blocked"
   MessageBar, then a 2fr/1fr grid: MAIN tabs [Fields|Evidence|Address|
   Notes|Chasers] and a SIDEBAR with the ONE canonical readiness list
   (each ✗ row deep-links to the owning tab + field) and a greyed
   read-only "Case facts" panel.

   MOCK ONLY — edits live in local React state; nothing persists.
   ============================================================ */

const useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL },
  backRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  titleTags: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    marginTop: '4px',
  },
  /* Title lockup: VRM plate beside the Futura Case/PO · provider line. */
  titleLockup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  titleText: { lineHeight: 1.1 },
  spine: { marginTop: tokens.spacingVerticalS },
  /* Legible age/due metadata chip (severity ramp, not 30%-grey). */
  metaChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    padding: '2px 8px',
    borderRadius: '2px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    color: tokens.colorNeutralForeground2,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  metaPastDue: {
    color: '#ffffff',
    backgroundColor: 'var(--ce-red-dark)',
    border: '1px solid var(--ce-red-dark)',
  },
  metaSoon: {
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', alignItems: 'center' },

  grid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: tokens.spacingHorizontalXL,
    alignItems: 'start',
    '@media (max-width: 960px)': { gridTemplateColumns: '1fr' },
  },

  main: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0 },
  panel: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    padding: tokens.spacingVerticalL,
  },
  tabBody: { paddingTop: tokens.spacingVerticalM },

  /* Fields tab — clustered groups */
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

  /* Evidence tab */
  guidanceBanner: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `3px solid var(--ce-red)`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    padding: tokens.spacingVerticalS + ' ' + tokens.spacingHorizontalM,
  },
  thumbGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  thumbCard: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  thumbCardExcluded: { opacity: 0.55 },
  thumb: {
    height: '96px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontFamily: 'var(--ce-font-display)',
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  thumbMeta: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, padding: tokens.spacingVerticalS },
  thumbName: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, wordBreak: 'break-all' },
  thumbRowBetween: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacingHorizontalS },

  /* Address tab */
  addrLines: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    fontFamily: 'var(--ce-font-mono)',
    fontSize: tokens.fontSizeBase300,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  stack: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  hint: { color: tokens.colorNeutralForeground3 },

  /* Notes tab */
  noteList: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, marginTop: tokens.spacingVerticalM },
  note: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalS + ' ' + tokens.spacingHorizontalM,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  noteMeta: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'baseline' },
  noteAuthor: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  noteTime: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },

  /* Sidebar */
  sidebar: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL, position: 'sticky', top: tokens.spacingVerticalM },

  /* Canonical readiness list (deep-linking ✗ rows) */
  readyList: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, marginTop: tokens.spacingVerticalS },
  readyRow: { display: 'flex', alignItems: 'flex-start', gap: tokens.spacingHorizontalS, padding: '2px 0' },
  iconOk: { color: '#16833b', flexShrink: 0, marginTop: '1px' },
  iconBad: { color: '#db0816', flexShrink: 0, marginTop: '1px' },
  readyText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  readyLabel: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  readyDetail: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  /* the deep-link button styled as a left-aligned link with a chevron affordance */
  fixLink: {
    appearance: 'none',
    background: 'none',
    border: 0,
    padding: 0,
    margin: 0,
    textAlign: 'left',
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: 'var(--ce-red)',
    cursor: 'pointer',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    ':hover': { color: 'var(--ce-red-dark)' },
    ':focus-visible': {
      outline: 'none',
      boxShadow: '0 0 0 3px rgba(219, 8, 22, 0.55)',
      borderRadius: '2px',
    },
  },

  factsPanel: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    padding: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  factRow: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: tokens.spacingHorizontalS, fontSize: tokens.fontSizeBase200 },
  factKey: { color: tokens.colorNeutralForeground3 },
  factVal: { color: tokens.colorNeutralForeground2 },
});

type TabName = 'fields' | 'evidence' | 'address' | 'notes' | 'chasers';

/* The 13 EVA fields, grouped into legible clusters (order within a cluster
   preserves the contract order). The union of keys equals EVA_FIELD_ORDER. */
const FIELD_CLUSTERS: { heading: string; keys: EvaFieldKey[] }[] = [
  { heading: 'Provider & claimant', keys: ['workProvider', 'claimantName', 'claimantTelephone', 'claimantEmail'] },
  { heading: 'Vehicle', keys: ['vehicleModel', 'mileage', 'mileageUnit', 'vatStatus'] },
  { heading: 'Incident', keys: ['accidentCircumstances', 'inspectionAddress'] },
  { heading: 'Dates', keys: ['dateOfLoss', 'dateOfInstruction'] },
  { heading: 'Allocation', keys: ['engineerAllocation'] },
];

const LABEL_FOR: Record<EvaFieldKey, { label: string; required: boolean }> = Object.fromEntries(
  EVA_FIELD_ORDER.map((d) => [d.key, { label: d.label, required: d.required }]),
) as Record<EvaFieldKey, { label: string; required: boolean }>;

const ROLE_OPTIONS: { value: ImageRole; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'damage_closeup', label: 'Damage closeup' },
  { value: 'additional', label: 'Additional' },
  { value: 'unknown', label: 'Unclassified' },
];

const VAT_OPTIONS: VatStatus[] = ['', 'Yes', 'No'];
const MILEAGE_UNIT_OPTIONS: MileageUnit[] = ['', 'Miles', 'Km'];

const POLICY_LABEL: Record<Case['inspectionDecision'], string> = {
  confirmed_physical: 'Physical inspection (confirmed)',
  manual: 'Manual override',
  image_based: 'Image Based Assessment',
  unknown: 'Undecided',
};

/* Map this case's status onto the pipeline-spine stage it should light.
   Mirrors the foundation's statusToStage (not exported); status + reason only. */
function caseStageKey(status: CaseStatus, reason?: ActionReason): PipelineStageKey {
  switch (status) {
    case 'new_email':
      return 'new';
    case 'ingested':
    case 'linked_to_instruction':
      return 'parsing';
    case 'needs_review':
      return reason === 'conflict' || reason === 'needs_review' ? 'review' : 'chasing';
    case 'missing_images':
    case 'missing_required_fields':
    case 'duplicate_risk':
    case 'error':
      return 'chasing';
    case 'ready_for_eva':
      return 'ready';
    case 'eva_submitted':
      return 'submitted';
    case 'box_synced':
      return 'box';
    default:
      return 'parsing';
  }
}

/* Resolve a readiness ChecklistItem to the tab that owns it and, for a field
   item, the EvaFieldKey to focus. Keeps the deep-link the ONE blocker UI. */
function checklistTarget(item: ChecklistItem, c: Case): { tab: TabName; fieldKey?: EvaFieldKey } {
  if (item.group === 'images') return { tab: 'evidence' };
  if (item.group === 'address') return { tab: 'address' };
  if (item.group === 'conflicts') {
    const conflict = EVA_FIELD_ORDER.find((d) => c.evaFields[d.key].reviewState === 'conflict');
    return { tab: 'fields', fieldKey: conflict?.key };
  }
  // fields group — id is `field-<key>`.
  const key = item.id.startsWith('field-') ? (item.id.slice('field-'.length) as EvaFieldKey) : undefined;
  return { tab: 'fields', fieldKey: key };
}

/* ---------- A single EVA field row ---------- */
interface FieldRowProps {
  fieldKey: EvaFieldKey;
  label: string;
  required: boolean;
  c: Case;
  onTextChange: (key: EvaFieldKey, value: string) => void;
  registerRef: (key: EvaFieldKey, el: HTMLElement | null) => void;
}

function FieldRow({ fieldKey, label, required, c, onTextChange, registerRef }: FieldRowProps) {
  const styles = useStyles();
  const field = c.evaFields[fieldKey];
  const empty = field.value.trim().length === 0;
  const validation =
    required && empty
      ? ({ validationState: 'error' as const, validationMessage: `${label} is required for EVA` })
      : {};

  const change = (_: unknown, data: InputOnChangeData) => onTextChange(fieldKey, data.value);
  const setRef = (el: HTMLElement | null) => registerRef(fieldKey, el);

  let control: React.ReactNode;
  if (fieldKey === 'accidentCircumstances') {
    control = (
      <Textarea
        ref={setRef as (el: HTMLTextAreaElement | null) => void}
        value={field.value}
        onChange={(_, d) => onTextChange(fieldKey, d.value)}
        resize="vertical"
        rows={3}
      />
    );
  } else if (fieldKey === 'inspectionAddress') {
    control = (
      <Textarea
        ref={setRef as (el: HTMLTextAreaElement | null) => void}
        value={field.value}
        onChange={(_, d) => onTextChange(fieldKey, d.value)}
        resize="vertical"
        rows={6}
      />
    );
  } else if (fieldKey === 'vatStatus') {
    control = (
      <Dropdown
        ref={setRef as (el: HTMLButtonElement | null) => void}
        value={field.value || '—'}
        selectedOptions={[field.value]}
        onOptionSelect={(_, d) => onTextChange(fieldKey, d.optionValue ?? '')}
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
        ref={setRef as (el: HTMLButtonElement | null) => void}
        value={field.value || '—'}
        selectedOptions={[field.value]}
        onOptionSelect={(_, d) => onTextChange(fieldKey, d.optionValue ?? '')}
      >
        {MILEAGE_UNIT_OPTIONS.map((o) => (
          <Option key={o || 'blank'} value={o} text={o || '—'}>
            {o || '—'}
          </Option>
        ))}
      </Dropdown>
    );
  } else {
    control = <Input ref={setRef as (el: HTMLInputElement | null) => void} value={field.value} onChange={change} />;
  }

  return (
    <div className={styles.fieldRow} id={`field-${fieldKey}`}>
      <Field label={required ? `${label} *` : label} {...validation}>
        {control}
      </Field>
      <div className={styles.fieldMeta}>
        <ProvenanceBadge provenance={field.provenance} reviewState={field.reviewState} />
      </div>
    </div>
  );
}

/* ---------- Evidence card ---------- */
interface EvidenceCardProps {
  ev: Evidence;
  onRole: (id: string, role: ImageRole) => void;
  onExclude: (id: string, excluded: boolean) => void;
}

function EvidenceCard({ ev, onRole, onExclude }: EvidenceCardProps) {
  const styles = useStyles();
  return (
    <div className={mergeClasses(styles.thumbCard, ev.excluded && styles.thumbCardExcluded)}>
      <div className={styles.thumb} style={{ backgroundColor: ev.thumbColor ?? '#5a5a64' }}>
        {ev.excluded ? 'EXCLUDED' : ev.imageRole === 'overview' ? 'OVERVIEW' : ''}
      </div>
      <div className={styles.thumbMeta}>
        <span className={styles.thumbName}>{ev.fileName}</span>
        <Field label="Role" size="small">
          <Dropdown
            size="small"
            value={ROLE_OPTIONS.find((r) => r.value === ev.imageRole)?.label ?? 'Unclassified'}
            selectedOptions={[ev.imageRole]}
            onOptionSelect={(_, d) => d.optionValue && onRole(ev.id, d.optionValue as ImageRole)}
          >
            {ROLE_OPTIONS.map((r) => (
              <Option key={r.value} value={r.value} text={r.label}>
                {r.label}
              </Option>
            ))}
          </Dropdown>
        </Field>
        <div className={styles.thumbRowBetween}>
          <Tooltip
            content={ev.registrationVisible ? 'Registration is visible (OCR matched VRM)' : 'Registration not detected'}
            relationship="label"
          >
            <Badge
              appearance={ev.registrationVisible ? 'filled' : 'outline'}
              color={ev.registrationVisible ? 'success' : 'subtle'}
              size="small"
              shape="rounded"
            >
              {ev.registrationVisible ? 'Reg ✓' : 'No reg'}
            </Badge>
          </Tooltip>
        </div>
        <Switch
          checked={!!ev.excluded}
          label="Exclude (person reflection)"
          onChange={(_, d) => onExclude(ev.id, d.checked)}
        />
      </div>
    </div>
  );
}

/* ============================================================ */
export function CaseDetail() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { caseId } = useParams<{ caseId: string }>();
  const seed = caseId ? caseById(caseId) : undefined;
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  // Local working copy so mock edits feel live (never persisted).
  const [c, setC] = useState<Case | undefined>(seed);
  const [tab, setTab] = useState<TabName>('fields');
  const [noteDraft, setNoteDraft] = useState('');
  const [overrideAddr, setOverrideAddr] = useState(seed?.inspectionDecision === 'image_based');
  const [overrideReason, setOverrideReason] = useState('');

  // Focus targets for field deep-links (keyed by EvaFieldKey).
  const fieldRefs = useRef<Partial<Record<EvaFieldKey, HTMLElement | null>>>({});
  const registerRef = (key: EvaFieldKey, el: HTMLElement | null) => {
    fieldRefs.current[key] = el;
  };

  const images = useMemo(() => (caseId ? imagesForCase(caseId) : []), [caseId]);
  // Mirror image edits into the working copy's evidence so readiness recomputes.
  const [imgState, setImgState] = useState<Evidence[]>(images);

  if (!c) {
    return (
      <div className={styles.page}>
        <SectionHeading eyebrow="Case" heading="Case not found" />
        <Link as="button" onClick={() => navigate('/')}>
          Back to dashboard
        </Link>
      </div>
    );
  }

  // Readiness is derived from the working copy (with current image edits folded in).
  const liveCase: Case = {
    ...c,
    evidence: [
      ...imgState,
      ...c.evidence.filter((e) => e.kind !== 'image'),
    ],
  };
  const readiness = computeReadiness(liveCase);
  const blocked = !readiness.ready;
  const blockerCount = readiness.missing.length;

  const toast = (title: string) =>
    dispatchToast(
      <Toast>
        <ToastTitle>{title}</ToastTitle>
      </Toast>,
      { intent: 'success' },
    );

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
  };

  const onRole = (id: string, role: ImageRole) =>
    setImgState((prev) => prev.map((e) => (e.id === id ? { ...e, imageRole: role } : e)));

  const onExclude = (id: string, excluded: boolean) =>
    setImgState((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, excluded, exclusionReason: excluded ? 'Person reflection visible' : undefined }
          : e,
      ),
    );

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

  const evaJson = useMemo(() => {
    const payload: Record<string, string> = {};
    for (const d of EVA_FIELD_ORDER) payload[d.label] = liveCase.evaFields[d.key].value;
    return payload;
  }, [liveCase]);

  const acceptedImages = imgState.filter((e) => e.acceptedForEva && !e.excluded);
  const notesNewestFirst = c.notes; // already inserted newest-first

  /* --- header subtitle --- */
  const subtitle = [c.vehicleModel, c.vehicleYear ? `(${c.vehicleYear})` : undefined]
    .filter(Boolean)
    .join(' ');

  // VRM now renders as a plate; the Futura title carries Case/PO · provider.
  const titleText = [c.casePo, c.provider].filter(Boolean).join('  ·  ');
  const stageKey = caseStageKey(c.status, c.actionReason);
  const due = dueInfo(c); // ONE shared due/aging parser for the header chip.

  return (
    <div className={styles.page}>
      <div>
        <div className={styles.backRow}>
          <Link as="button" onClick={() => navigate('/')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ArrowLeft size={14} /> Dashboard
            </span>
          </Link>
        </div>

        <SectionHeading
          eyebrow={`Case · ${c.providerCode}`}
          heading={
            <span className={styles.titleLockup}>
              <VrmPlate vrm={c.vrm} size="large" />
              <span className={mergeClasses('ce-display', styles.titleText)}>{titleText}</span>
            </span>
          }
          subtitle={subtitle || undefined}
          actions={
            <div className={styles.actions}>
              <Button appearance="secondary" icon={<Upload size={16} />} onClick={() => toast('Upload evidence (mock — no file system)')}>
                Upload evidence
              </Button>
              <Button appearance="secondary" icon={<FileJson size={16} />} onClick={() => { setTab('fields'); toast('EVA JSON ready — see the JSON block below the fields'); }}>
                Export JSON (gated fallback)
              </Button>
              <Tooltip
                content={blocked ? `EVA submit blocked — ${blockerCount} item(s) outstanding` : 'Open the EVA submit dialog'}
                relationship="label"
              >
                <Button
                  appearance="primary"
                  icon={<Send size={16} />}
                  disabled={blocked}
                  onClick={() => navigate(`/case/${c.id}/submit`)}
                >
                  Submit to EVA
                </Button>
              </Tooltip>
            </div>
          }
        />

        <div className={styles.titleTags}>
          <StatusBadge status={c.status} />
          <Badge appearance="outline" color="informative" shape="rounded">
            {c.channel.kind === 'whatsapp' ? 'WhatsApp' : 'Email'} · {c.channel.mode}
          </Badge>
          <span className={styles.metaChip}>
            <Clock size={13} strokeWidth={2} /> {c.ageDays}d old
          </span>
          {c.dateDue && (
            <span
              className={mergeClasses(
                styles.metaChip,
                due.tone === 'pastdue' ? styles.metaPastDue : due.tone === 'soon' ? styles.metaSoon : undefined,
              )}
            >
              {due.tone === 'pastdue' ? <AlertTriangle size={13} strokeWidth={2} /> : <CalendarClock size={13} strokeWidth={2} />}
              {due.dueText}
            </span>
          )}
        </div>

        {/* Slim pipeline progress spine — this case's stage, marked "you are here". */}
        <div className={styles.spine}>
          <PipelineStrip variant="spine" active={stageKey} />
        </div>
      </div>

      {blocked && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>EVA submit blocked — {blockerCount} item{blockerCount === 1 ? '' : 's'}</MessageBarTitle>
            Use the readiness list — each outstanding item links to the field to fix.
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.grid}>
        {/* ---------------- MAIN ---------------- */}
        <div className={styles.main}>
          <div className={styles.panel}>
            <TabList
              selectedValue={tab}
              onTabSelect={(_: SelectTabEvent, d: SelectTabData) => setTab(d.value as TabName)}
            >
              <Tab value="fields">Fields</Tab>
              <Tab value="evidence">Evidence</Tab>
              <Tab value="address">Address</Tab>
              <Tab value="notes">Notes</Tab>
              <Tab value="chasers">Chasers</Tab>
            </TabList>

            <div className={styles.tabBody}>
              {tab === 'fields' && (
                <div>
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
                            c={c}
                            onTextChange={onTextChange}
                            registerRef={registerRef}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <Divider />
                  <div style={{ marginTop: tokens.spacingVerticalM }}>
                    <Caption1 className={styles.hint}>
                      EVA JSON preview (the 13-field contract, in order)
                    </Caption1>
                    <div style={{ marginTop: 8 }}>
                      <JsonView data={evaJson} label="EVA JSON" />
                    </div>
                  </div>
                </div>
              )}

              {tab === 'evidence' && (
                <div className={styles.stack}>
                  {imgState.length === 0 ? (
                    <MessageBar intent="warning">
                      <MessageBarBody>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <ImageOff size={16} /> No images on this case yet — use a chaser to request photos.
                        </span>
                      </MessageBarBody>
                    </MessageBar>
                  ) : (
                    <div className={styles.thumbGrid}>
                      {imgState.map((ev) => (
                        <EvidenceCard key={ev.id} ev={ev} onRole={onRole} onExclude={onExclude} />
                      ))}
                    </div>
                  )}

                  <Divider />

                  <div className={styles.guidanceBanner}>
                    <Text size={200}>
                      <strong>EVA photo order:</strong> upload 2 previews first — vehicle overview
                      (full registration visible), then the main-damage closeup — then all accepted
                      photos in sequence, including those two again.
                    </Text>
                  </div>

                  {acceptedImages.length > 0 ? (
                    <ImageOrderList images={acceptedImages} />
                  ) : (
                    <Caption1 className={styles.hint}>
                      No accepted images to order yet.
                    </Caption1>
                  )}
                </div>
              )}

              {tab === 'address' && (
                <div className={styles.stack}>
                  <Caption1 className={styles.hint}>Inspection address (EVA field 9)</Caption1>
                  <div className={styles.addrLines}>
                    {c.evaFields.inspectionAddress.value === 'Image Based Assessment' ? (
                      <span>Image Based Assessment</span>
                    ) : (
                      c.evaFields.inspectionAddress.value.split('\n').map((line, i) => (
                        <span key={i}>{line || ' '}</span>
                      ))
                    )}
                  </div>

                  <div className={styles.thumbRowBetween}>
                    <Badge appearance="tint" color="brand" shape="rounded">
                      Decision: {POLICY_LABEL[c.inspectionDecision]}
                    </Badge>
                    <ProvenanceBadge
                      provenance={c.evaFields.inspectionAddress.provenance}
                      reviewState={c.evaFields.inspectionAddress.reviewState}
                    />
                  </div>

                  <Divider />

                  <Checkbox
                    checked={overrideAddr}
                    label="Override to Image Based Assessment (record an explicit reason — never silent)"
                    onChange={(_, d) => setOverrideAddr(!!d.checked)}
                  />
                  {overrideAddr && (
                    <Field
                      label="Override reason"
                      required
                      validationState={overrideReason.trim() ? 'none' : 'warning'}
                      validationMessage={
                        overrideReason.trim()
                          ? undefined
                          : 'Give a reason — image-based assessment must be justified.'
                      }
                    >
                      <Textarea
                        value={overrideReason}
                        onChange={(_, d) => setOverrideReason(d.value)}
                        resize="vertical"
                        rows={3}
                        placeholder="e.g. Vehicle is a total loss held at a salvage yard; physical inspection not viable."
                      />
                    </Field>
                  )}
                </div>
              )}

              {tab === 'notes' && (
                <div className={styles.stack}>
                  <Field label="Add a note">
                    <Textarea
                      value={noteDraft}
                      onChange={(_, d) => setNoteDraft(d.value)}
                      resize="vertical"
                      rows={3}
                      placeholder="Record a review decision, a chase outcome, anything the team should see."
                    />
                  </Field>
                  <div>
                    <Button appearance="primary" onClick={addNote} disabled={!noteDraft.trim()}>
                      Add note
                    </Button>
                  </div>

                  <div className={styles.noteList}>
                    {notesNewestFirst.length === 0 ? (
                      <Caption1 className={styles.hint}>No notes yet.</Caption1>
                    ) : (
                      notesNewestFirst.map((n) => (
                        <div key={n.id} className={styles.note}>
                          <div className={styles.noteMeta}>
                            <span className={styles.noteAuthor}>{n.author}</span>
                            <span className={styles.noteTime}>{n.timestamp}</span>
                          </div>
                          <Text size={300}>{n.text}</Text>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {tab === 'chasers' && <ChaserPanel case={c} onLogDrafted={() => toast('Chaser logged as drafted')} />}
            </div>
          </div>
        </div>

        {/* ---------------- SIDEBAR ---------------- */}
        <div className={styles.sidebar}>
          {/* ONE canonical readiness presentation: each ✗ row deep-links to fix. */}
          <div className={styles.panel}>
            <Text className="ce-section-heading">Readiness</Text>
            <Caption1 className={styles.hint} block style={{ marginTop: 2 }}>
              {blocked
                ? `${blockerCount} item${blockerCount === 1 ? '' : 's'} block EVA submit — select one to fix.`
                : 'Every check passes — ready for EVA.'}
            </Caption1>
            <div className={styles.readyList} role="list">
              {readiness.items.map((item) => (
                <div className={styles.readyRow} key={item.id} role="listitem">
                  {item.ok ? (
                    <Check size={16} className={styles.iconOk} aria-label="Pass" />
                  ) : (
                    <X size={16} className={styles.iconBad} aria-label="Fail" />
                  )}
                  <span className={styles.readyText}>
                    {item.ok ? (
                      <Text className={styles.readyLabel}>{item.label}</Text>
                    ) : (
                      <button
                        type="button"
                        className={styles.fixLink}
                        onClick={() => goToBlocker(item)}
                      >
                        {item.label}
                      </button>
                    )}
                    {!item.ok && item.detail && <Text className={styles.readyDetail}>{item.detail}</Text>}
                  </span>
                </div>
              ))}
              {!blocked && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <CheckCircle2 size={16} color="var(--ce-success)" />
                  <Text size={300}>Nothing outstanding — ready for EVA.</Text>
                </span>
              )}
            </div>
          </div>

          <div className={styles.factsPanel}>
            <Text className="ce-section-heading">Case facts (read-only)</Text>
            <Caption1 className={styles.hint} block style={{ marginBottom: 4 }}>
              Imported context — does NOT drive readiness.
            </Caption1>
            {(
              [
                ['Insured', c.overviewFacts.insuredName],
                ['Claimant', c.overviewFacts.claimantName],
                ['Third party', c.overviewFacts.thirdPartyName],
                ['Claim no.', c.overviewFacts.claimNumber],
                ['Policy ref', c.overviewFacts.policyReference],
                ['Incident', c.overviewFacts.incidentDate],
                ['Claim type', c.overviewFacts.claimType],
                ['Insurer', c.overviewFacts.insurerName],
                ['Repairer', c.overviewFacts.repairerName],
              ] as const
            )
              .filter(([, v]) => !!v)
              .map(([k, v]) => (
                <div className={styles.factRow} key={k}>
                  <span className={styles.factKey}>{k}</span>
                  <span className={styles.factVal}>{v}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Nested /case/:id/submit dialog overlay. */}
      <Outlet />
    </div>
  );
}

export default CaseDetail;
