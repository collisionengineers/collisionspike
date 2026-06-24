import { useRef, useState } from 'react';
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
  Spinner,
  Switch,
  Tab,
  TabList,
  Text,
  Textarea,
  Toast,
  ToastBody,
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
  ArrowUpRight,
  Archive,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  GitMerge,
  ImageOff,
  Mail,
  Lightbulb,
  MapPin,
  Search,
  Send,
  Upload,
  Pause,
  Play,
  X,
} from 'lucide-react';
import {
  ChaserPanel,
  ImageOrderList,
  PipelineStrip,
  ProvenanceBadge,
  SectionHeading,
  StatusBadge,
  VrmPlate,
  ErrorState,
  CaseDetailSkeleton,
  ThumbGridSkeleton,
  computeReadiness,
  type ChecklistItem,
} from '../components';
import {
  data,
  EVA_FIELD_ORDER,
  dueInfo,
  getSharedLink,
  statusToStage,
  suggestLocations,
  buildSuggestLocationRequest,
  useBoxGates,
  useCaseQuery,
  useImages,
  useInspectionAddressSuggestions,
  useLocationAssistGate,
  activeCopyFileRequestTransport,
  activeGetSharedLinkTransport,
  activeLocationAssistTransport,
  type Case,
  type CaseStatus,
  type EvaFieldKey,
  type Evidence,
  type ImageRole,
  type MileageUnit,
  type Note,
  type PipelineStageKey,
  type SuggestedAddress,
  type VatStatus,
} from '../data';
import { resolveInspectionDecision } from '../domain/address-policy';
import { GLOBAL_TOASTER_ID } from '../components';
import { buildEvaJson } from '../contracts/eva-export';

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
  /* Back-arrow lockup inside the "Dashboard" link (icon + label, baseline). */
  backLink: { display: 'inline-flex', alignItems: 'center', gap: '4px' },
  /* Inline icon + text lockup (e.g. the evidence-tab "No images yet" bar). */
  inlineIconText: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  /* "Nothing outstanding" ready row in the readiness sidebar. */
  readyDone: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalXS,
  },
  /* Tight caption spacing nudges (kept off inline style props). */
  hintNudgeTop: { marginTop: '2px' },
  hintNudgeBottom: { marginBottom: tokens.spacingVerticalXS },
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

  /* Documents list (source email + instructions + non-image artifacts) */
  docList: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  docRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalS + ' ' + tokens.spacingHorizontalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  docName: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flexGrow: 1 },
  docFile: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1, wordBreak: 'break-all' },

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

  /* Suggested locations panel (corpus suggestions — ALWAYS a suggestion). */
  suggestHead: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
  },
  suggestList: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  /* "Suggest location" action row — heading + button, spaced apart. */
  assistActionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  /* Muted "no location could be suggested" line. */
  assistNoResult: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
  },
  suggestRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalS + ' ' + tokens.spacingHorizontalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: '3px solid #e3a008', // amber rail — unverified suggestion
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  suggestBody: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flexGrow: 1 },
  suggestAddr: {
    fontFamily: 'var(--ce-font-mono)',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'pre-line',
  },
  suggestMeta: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap' },
  /* "Suggested" tint badge — distinct from the confirmed brand badge. */
  suggestBadge: {
    backgroundColor: '#fef3c7',
    color: '#7a4f01',
    border: '1px solid #e3c062',
  },

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

/* The 12 EVA fields, grouped into legible clusters (order within a cluster
   preserves the contract order). The union of keys equals EVA_FIELD_ORDER. */
const FIELD_CLUSTERS: { heading: string; keys: EvaFieldKey[] }[] = [
  { heading: 'Provider & claimant', keys: ['workProvider', 'claimantName', 'claimantTelephone', 'claimantEmail'] },
  { heading: 'Vehicle', keys: ['vehicleModel', 'mileage', 'mileageUnit', 'vatStatus'] },
  { heading: 'Incident', keys: ['accidentCircumstances', 'inspectionAddress'] },
  { heading: 'Dates', keys: ['dateOfLoss', 'dateOfInstruction'] },
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

/** Friendly label per evidence kind for the Documents list. */
const EVIDENCE_KIND_LABEL: Record<string, string> = {
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
      ? ({ validationState: 'error' as const, validationMessage: 'Required' })
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
      {/* Fluent's `required` renders the asterisk AND exposes the required
          semantic to assistive tech (the hand-appended " *" did neither). */}
      <Field label={label} required={required} {...validation}>
        {control}
      </Field>
      <div className={styles.fieldMeta}>
        <ProvenanceBadge provenance={field.provenance} reviewState={field.reviewState} fieldKey={fieldKey} />
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
            content={ev.registrationVisible ? 'Registration is visible' : 'Registration not visible'}
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
        {ev.boxFileUrl && (
          <Link href={ev.boxFileUrl} target="_blank" rel="noopener noreferrer">
            <span className={styles.inlineIconText}>Open in Archive <ArrowUpRight size={12} /></span>
          </Link>
        )}
      </div>
    </div>
  );
}

/* ---------- A single SUGGESTED inspection-location row ----------
   Renders the candidate as monospace address lines + a DISTINCT "Suggested" tint
   badge + an evidence Tooltip, with a [Use this address] action. The action is
   the caller's (it copies into the manual draft + sets decision=manual). Nothing
   here writes a Case or sets the EVA field directly. */
interface SuggestedLocationRowProps {
  suggestion: SuggestedAddress;
  onUse: () => void;
}

/** Human-friendly rendering of a raw confidence band (avoids leaking the enum). */
function friendlyBand(band?: string): string | undefined {
  if (!band) return undefined;
  const b = band.toLowerCase();
  // Phase-4a live assist: the candidate came from the case's photos + map lookup.
  if (b === 'assist' || b.includes('assist')) return 'Suggested from the photos';
  if (b.includes('eva_export') || b.includes('eva export')) return 'From EVA inspection history';
  if (b.includes('multiple')) return 'One of several possible addresses';
  if (b.includes('jobsheet')) return 'From job-sheet guidance';
  if (b.includes('repairer')) return 'Matched to a local repairer';
  if (b.startsWith('resolved')) return 'Resolved from records';
  if (b.startsWith('candidate')) return 'Candidate match';
  return undefined; // unknown band — omit rather than show a raw code
}

/** A muted "seen N times · last <date>" hint from the offline ranking metadata
 *  (ADR-0016 helper #2). Recency-only or frequency-only rows render the part they
 *  have; rows with neither render nothing. PRESENTATION ONLY — never auto-selects.
 *  lastSeen arrives as YYYY-MM-DD; surface it as DD/MM/YYYY for display parity. */
function frequencyHint(suggestion: SuggestedAddress): string | undefined {
  const parts: string[] = [];
  if (typeof suggestion.frequency === 'number' && suggestion.frequency > 0) {
    parts.push(`seen ${suggestion.frequency} ${suggestion.frequency === 1 ? 'time' : 'times'}`);
  }
  const seen = (suggestion.lastSeen ?? '').trim();
  const m = seen.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) parts.push(`last ${m[3]}/${m[2]}/${m[1]}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function SuggestedLocationRow({ suggestion, onUse }: SuggestedLocationRowProps) {
  const styles = useStyles();
  const lines = [...suggestion.lines, suggestion.postcode].filter(Boolean);
  const band = friendlyBand(suggestion.confidenceBand);
  const seenHint = frequencyHint(suggestion);
  const tip = [band, seenHint, suggestion.evidenceNote, 'Suggested — low confidence; verify before use.']
    .filter(Boolean)
    .join('\n');
  return (
    <div className={styles.suggestRow} role="listitem">
      <div className={styles.suggestBody}>
        <span className={styles.suggestAddr}>{lines.join('\n')}</span>
        <span className={styles.suggestMeta}>
          <Tooltip content={tip} relationship="description" withArrow>
            <Badge appearance="tint" shape="rounded" size="small" className={styles.suggestBadge}>
              <MapPin size={11} strokeWidth={2.25} aria-hidden /> Suggested
            </Badge>
          </Tooltip>
          {suggestion.providerCode && (
            <Caption1 className={styles.hint}>Provider {suggestion.providerCode}</Caption1>
          )}
          {seenHint && <Caption1 className={styles.hint}>{seenHint}</Caption1>}
        </span>
      </div>
      <Button appearance="secondary" size="small" icon={<Check size={14} />} onClick={onUse}>
        Use this address
      </Button>
    </div>
  );
}

/* ============================================================
   Outer screen — fetches the Case + its images through the data seam and
   renders loading / error / not-found states, then mounts the editing view
   (keyed by case id so its local working-copy state seeds cleanly per case).
   ============================================================ */
export function CaseDetail() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { caseId } = useParams<{ caseId: string }>();

  const caseQuery = useCaseQuery(caseId);
  const imagesQuery = useImages(caseId);

  // First-load (no case yet) — content-shaped skeleton; hard failure — error panel.
  if (caseQuery.loading && caseQuery.data === undefined) {
    return (
      <div className={mergeClasses('ce-enter', styles.page)}>
        <CaseDetailSkeleton />
        {/* Keep the nested submit dialog mountable during load. */}
        <Outlet />
      </div>
    );
  }
  if (caseQuery.error && caseQuery.data === undefined) {
    return (
      <div className={styles.page}>
        <ErrorState
          error={caseQuery.error}
          onRetry={caseQuery.refetch}
          title="Couldn’t load this case"
        />
        <Outlet />
      </div>
    );
  }
  if (!caseQuery.data) {
    return (
      <div className={styles.page}>
        <SectionHeading eyebrow="Case" heading="Case not found" />
        <Link as="button" onClick={() => navigate('/')}>
          Back to dashboard
        </Link>
        <Outlet />
      </div>
    );
  }

  return (
    <CaseDetailView
      key={caseQuery.data.id}
      caseData={caseQuery.data}
      images={imagesQuery.data ?? []}
      imagesLoading={imagesQuery.loading && imagesQuery.data === undefined}
    />
  );
}

interface CaseDetailViewProps {
  caseData: Case;
  images: Evidence[];
  /** True while the image set is still being fetched (evidence tab shows a skeleton). */
  imagesLoading: boolean;
}

/* The editing workspace. Receives the loaded Case + images; all edits live in
   local React state (mock only — never persisted). Visually identical to the
   pre-seam screen once data has loaded. */
function CaseDetailView({ caseData, images, imagesLoading }: CaseDetailViewProps) {
  const styles = useStyles();
  const navigate = useNavigate();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  // Local working copy so mock edits feel live (never persisted).
  const [c, setC] = useState<Case>(caseData);
  const [tab, setTab] = useState<TabName>('fields');
  const [noteDraft, setNoteDraft] = useState('');
  const [overrideAddr, setOverrideAddr] = useState(caseData.inspectionDecision === 'image_based');
  const [overrideReason, setOverrideReason] = useState('');
  // The inspection decision mode — staff picking a suggested location sets it to
  // 'manual' (an explicit human action). Seeded from the loaded case.
  const [decisionMode, setDecisionMode] = useState<Case['inspectionDecision']>(
    caseData.inspectionDecision,
  );

  // Low-confidence inspection-address SUGGESTIONS for this case (corpus). Always
  // surfaced strictly as suggestions; picking one copies it into the manual draft
  // and sets the decision to manual — it NEVER auto-confirms or sets image_based.
  const suggestionsQuery = useInspectionAddressSuggestions(caseData.id);
  const suggestions = suggestionsQuery.data ?? [];

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
  const [assistRunning, setAssistRunning] = useState(false);
  const [assistCandidates, setAssistCandidates] = useState<SuggestedAddress[]>([]);
  // null = not run yet; true/false = the last run's "no confident location" result.
  const [assistNoResult, setAssistNoResult] = useState<boolean | null>(null);
  // Plain-language provenance of a CONFIRMED suggestion, captured for a FUTURE
  // save path (NOT yet wired — this review screen holds local working-copy state
  // only and writes nothing). When the InspectionAddress upsert is built it will
  // carry sourceLabel -> cr1bd_sourcelabel + sourceNote -> cr1bd_sourcenote. Set
  // only when the reviewer picks a live-assist candidate; cleared for corpus picks.
  // Today only sourceNote is consumed (rendered as the caption below the draft).
  const [confirmedProvenance, setConfirmedProvenance] = useState<
    { sourceLabel: string; sourceNote: string } | undefined
  >(undefined);

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

  // Mirror image edits into the working copy's evidence so readiness recomputes.
  const [imgState, setImgState] = useState<Evidence[]>(images);

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

  /* Pick a SUGGESTED location (corpus OR live-assist): copy its lines into the
     manual inspection-address draft (marking the field reviewed) and set the
     decision to MANUAL. This is the ONLY place a suggestion touches the case, and
     only on an explicit click — it never auto-confirms, never writes image_based,
     and never fires on load.

     The decision is routed through resolveInspectionDecision (ADR-0013 confirmation
     path): a 'use_physical_address' choice with a real address resolves to
     decisionMode='manual'. We CAPTURE the plain-language provenance into local
     working-copy state for a future save path (sourceLabel 'suggested:assist' when
     the origin is the live assist). This screen does not write anything yet; when
     the InspectionAddress upsert is wired it will record WHERE the confirmed manual
     decision came from (cr1bd_sourcelabel/-sourcenote) — it does NOT make the row
     an unconfirmed suggestion. */
  const useSuggestion = (s: SuggestedAddress) => {
    const lines = [...s.lines, s.postcode].map((l) => (l ?? '').trim()).filter(Boolean);
    const draft = lines.join('\n');
    // Validate the confirmation through the policy resolver. A confirmed physical
    // address is always a manual human decision here (prefer_address default).
    const decision = resolveInspectionDecision('prefer_address', lines.length > 0, {
      choice: 'use_physical_address',
    });
    // Defensive: only apply when the resolver returns a non-image-based manual
    // decision (it will, for a non-empty address). NOTHING auto-applies otherwise.
    if (decision.imageBased || decision.needsReviewerDecision) return;
    onTextChange('inspectionAddress', draft);
    setDecisionMode(decision.decisionMode ?? 'manual');
    setOverrideAddr(false); // a real address supersedes any image-based override
    // Capture the confirmed decision's provenance into local state for a future
    // save path (not yet wired). Live-assist picks carry 'suggested:assist' + a
    // plain "Suggested from the photos" note.
    if (s.source === 'assist') {
      const note = s.evidenceNote
        ? `Suggested from the photos — ${s.evidenceNote.split('\n')[0]}`
        : 'Suggested from the photos';
      setConfirmedProvenance({ sourceLabel: 'suggested:assist', sourceNote: note });
    } else {
      setConfirmedProvenance(undefined);
    }
    setTab('address');
    toast('Suggested location copied to the address — review before submit');
  };

  /* Run the live location-assist (Phase 4a). Builds the request from data ALREADY
     loaded on this screen (the non-excluded photos -> photo_refs; the accident-
     circumstances + claimant-address text -> text_clues), calls the injected
     transport, and stores the returned candidates in this working copy. It does
     NOT write the case, does NOT set the EVA address, and does NOT auto-select —
     each candidate is rendered as a suggestion the reviewer must confirm. */
  const onSuggestLocation = async () => {
    if (assistRunning || !locationAssistEnabled) return;
    setAssistRunning(true);
    try {
      // The claimant-address clue (cr1bd_evaclaimantaddress) is a Case-identity
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
        // Claimant address is a Case-identity clue (cr1bd_evaclaimantaddress) the
        // adapter carries onto the domain Case. Passed best-effort; omitted when
        // empty so the request still builds (the Function tolerates a clue-less run).
        ...(claimantAddressClue ? { claimantAddress: claimantAddressClue } : {}),
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

  /* Download the canonical 12-field EVA JSON (snake_case, byte-identical to the
     submit flow). The Fields-tab preview was removed; this is the replacement,
     offered next to "Submit to EVA" and disabled while the case is blocked. */
  const onDownloadEvaJson = () => {
    try {
      const text = buildEvaJson({ evaFields: liveCase.evaFields });
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EVA-${liveCase.casePo || liveCase.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('EVA JSON downloaded');
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t download — try again</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    }
  };

  const acceptedImages = imgState.filter((e) => e.acceptedForEva && !e.excluded);
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

  return (
    <div className={mergeClasses('ce-enter', styles.page)}>
      <div>
        <div className={styles.backRow}>
          <Link as="button" onClick={() => navigate('/')}>
            <span className={styles.backLink}>
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
              {c.status === 'duplicate_risk' && (
                <Button
                  appearance="secondary"
                  icon={<Copy size={16} />}
                  onClick={() => navigate(`/case/${c.id}/dedup`)}
                >
                  Resolve duplicate
                </Button>
              )}
              <Button appearance="secondary" icon={<Upload size={16} />} onClick={() => navigate('/evidence')}>
                Add evidence
              </Button>
              <Button
                appearance="secondary"
                icon={<GitMerge size={16} />}
                onClick={() => navigate(`/case/${c.id}/merge`)}
              >
                Merge…
              </Button>
              <Button
                appearance="secondary"
                icon={c.onHold ? <Play size={16} /> : <Pause size={16} />}
                onClick={async () => {
                  const next = !c.onHold;
                  try {
                    await data.setOnHold(c.id, next);
                    setC({ ...c, onHold: next });
                    toast(next ? 'Put on hold — moved to Held' : 'Released from hold');
                  } catch {
                    dispatchToast(
                      <Toast>
                        <ToastTitle>Couldn’t update hold — try again</ToastTitle>
                      </Toast>,
                      { intent: 'error' },
                    );
                  }
                }}
              >
                {c.onHold ? 'Release' : 'Hold'}
              </Button>
              <Tooltip
                content={blocked ? `Can't download EVA JSON yet — ${blockerCount} item(s) outstanding` : 'Download the 12-field EVA JSON file'}
                relationship="label"
              >
                <Button
                  appearance="secondary"
                  icon={<Download size={16} />}
                  disabled={blocked}
                  onClick={onDownloadEvaJson}
                >
                  Download JSON
                </Button>
              </Tooltip>
              <Tooltip
                content={blocked ? `Can't submit to EVA yet — ${blockerCount} item(s) outstanding` : 'Submit this case to EVA'}
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
          {c.onHold && (
            <Badge appearance="filled" color="warning" shape="rounded">
              On hold
            </Badge>
          )}
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
            <MessageBarTitle>Can't submit to EVA yet — {blockerCount} item{blockerCount === 1 ? '' : 's'}</MessageBarTitle>
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
                </div>
              )}

              {tab === 'evidence' && (
                <div className={styles.stack}>
                  {/* Case archive (Box) — folder deep link at the top. Prefers the
                      stored folder shared-link (works with no live connector, e.g.
                      the free-account demo); falls back to the connector "Open in
                      Archive" when only the master gate is on. NO iframe/embed. */}
                  {(c.boxFolderUrl || archiveEnabled) && (
                    <div className={styles.thumbRowBetween}>
                      <Caption1 className={styles.hint}>
                        <span className={styles.inlineIconText}>
                          <Archive size={14} /> Case archive — the email, instructions and photos are mirrored here.
                        </span>
                      </Caption1>
                      {c.boxFolderUrl ? (
                        <Link href={c.boxFolderUrl} target="_blank" rel="noopener noreferrer">
                          <span className={styles.inlineIconText}>
                            Open case archive <ArrowUpRight size={14} />
                          </span>
                        </Link>
                      ) : (
                        <Button
                          appearance="secondary"
                          icon={openingArchive ? <Spinner size="tiny" /> : <ArrowUpRight size={16} />}
                          onClick={onOpenInArchive}
                          disabled={openingArchive}
                        >
                          {openingArchive ? 'Opening…' : 'Open in Archive'}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Documents — the source email + instruction(s) + any other
                      non-image artifacts captured for the case. Each links to its
                      Box copy when archived (honest "Not archived" otherwise). */}
                  {documents.length > 0 && (
                    <div className={styles.stack}>
                      <Text className="ce-section-heading">Documents</Text>
                      <div className={styles.docList}>
                        {documents.map((d) => (
                          <div className={styles.docRow} key={d.id}>
                            {d.kind === 'email' ? <Mail size={18} aria-hidden /> : <FileText size={18} aria-hidden />}
                            <span className={styles.docName}>
                              <span className={styles.docFile}>{d.fileName}</span>
                              <Caption1 className={styles.hint}>{EVIDENCE_KIND_LABEL[d.kind] ?? 'Document'}</Caption1>
                            </span>
                            {d.boxFileUrl ? (
                              <Link href={d.boxFileUrl} target="_blank" rel="noopener noreferrer">
                                <span className={styles.inlineIconText}>
                                  Open in Archive <ArrowUpRight size={14} />
                                </span>
                              </Link>
                            ) : (
                              <Caption1 className={styles.hint}>Not archived</Caption1>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Photos */}
                  <Text className="ce-section-heading">Photos</Text>
                  {imagesLoading && imgState.length === 0 ? (
                    // Images still loading — show a thumb skeleton, not a false
                    // "No images" (a slow fetch must not read as empty).
                    <ThumbGridSkeleton count={4} />
                  ) : imgState.length === 0 ? (
                    // ONE no-image message (review caseview #11: the tab used to
                    // carry three). The sidebar readiness owns the blocking signal.
                    <MessageBar intent="warning">
                      <MessageBarBody>
                        <span className={styles.inlineIconText}>
                          <ImageOff size={16} /> No images yet — use a chaser to request photos.
                        </span>
                      </MessageBarBody>
                    </MessageBar>
                  ) : (
                    <>
                      <div className={styles.thumbGrid}>
                        {imgState.map((ev) => (
                          <EvidenceCard key={ev.id} ev={ev} onRole={onRole} onExclude={onExclude} />
                        ))}
                      </div>

                      <Divider />

                      <div className={styles.guidanceBanner}>
                        <Text size={200}>
                          <strong>EVA photo order:</strong> 2 previews first — overview (full
                          registration visible), then the main-damage closeup — then all accepted
                          photos in sequence, including those two again.
                        </Text>
                      </div>

                      {acceptedImages.length > 0 && <ImageOrderList images={acceptedImages} />}
                    </>
                  )}
                </div>
              )}

              {tab === 'address' && (
                <div className={styles.stack}>
                  <Caption1 className={styles.hint}>Inspection address</Caption1>
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
                      Decision: {POLICY_LABEL[decisionMode]}
                    </Badge>
                    <ProvenanceBadge
                      provenance={c.evaFields.inspectionAddress.provenance}
                      reviewState={c.evaFields.inspectionAddress.reviewState}
                    />
                  </div>

                  {/* Plain-language provenance of a CONFIRMED live-assist pick
                      (no engineering terms). Only sourceNote is shown here; the
                      sourceLabel is held for a future save path (not yet wired). */}
                  {confirmedProvenance && (
                    <Caption1 className={styles.hint}>{confirmedProvenance.sourceNote}</Caption1>
                  )}

                  {/* Suggested locations — low-confidence corpus candidates +
                      live-assist candidates. Shown strictly as suggestions; "Use
                      this address" copies one into the draft above and sets the
                      decision to manual. Never auto-applied. The "Suggest location"
                      action (gated) proposes candidates from the case's photos +
                      text clues; it shows when the corpus has any candidates OR the
                      assist is switched on (so the reviewer can always invoke it). */}
                  {(suggestions.length > 0 ||
                    locationAssistEnabled ||
                    assistCandidates.length > 0 ||
                    assistNoResult !== null) && (
                    <>
                      <Divider />
                      <div className={styles.assistActionRow}>
                        <span className={styles.suggestHead}>
                          <Lightbulb size={15} strokeWidth={2} aria-hidden />
                          <Text size={200} weight="semibold">
                            Suggested locations
                          </Text>
                          <Caption1 className={styles.hint}>
                            Low confidence — verify before use.
                          </Caption1>
                        </span>
                        {/* Plain label — no engineering terms. Hidden unless the
                            assist is switched on (gate + Maps + API base). */}
                        {locationAssistEnabled && (
                          <Button
                            appearance="secondary"
                            size="small"
                            icon={assistRunning ? <Spinner size="tiny" /> : <Search size={14} />}
                            onClick={onSuggestLocation}
                            disabled={assistRunning}
                          >
                            {assistRunning ? 'Looking…' : 'Suggest location'}
                          </Button>
                        )}
                      </div>

                      {/* Live-assist candidates render through the SAME row as the
                          corpus suggestions (identical "Suggested" badge, evidence
                          tooltip, "Use this address"). Confidence drives ordering
                          only — nothing is preselected. */}
                      {(suggestions.length > 0 || assistCandidates.length > 0) && (
                        <div className={styles.suggestList} role="list">
                          {assistCandidates.map((s) => (
                            <SuggestedLocationRow
                              key={s.id}
                              suggestion={s}
                              onUse={() => useSuggestion(s)}
                            />
                          ))}
                          {suggestions.map((s) => (
                            <SuggestedLocationRow
                              key={s.id}
                              suggestion={s}
                              onUse={() => useSuggestion(s)}
                            />
                          ))}
                        </div>
                      )}

                      {/* Muted line when the last assist run found nothing. */}
                      {assistNoResult === true && (
                        <Caption1 className={styles.assistNoResult}>
                          No location could be suggested from the photos.
                        </Caption1>
                      )}
                    </>
                  )}

                  <Divider />

                  <Checkbox
                    checked={overrideAddr}
                    label="Override to Image Based Assessment"
                    onChange={(_, d) => setOverrideAddr(!!d.checked)}
                  />
                  {overrideAddr && (
                    <Field label="Override reason" required>
                      <Textarea
                        value={overrideReason}
                        onChange={(_, d) => setOverrideReason(d.value)}
                        resize="vertical"
                        rows={3}
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

              {tab === 'chasers' && (
                <ChaserPanel
                  case={c}
                  fileRequestEnabled={uploadLinkEnabled}
                  onRequestUploadLink={activeCopyFileRequestTransport}
                  onLogChased={({ channel, templateLabel }) => {
                    const note: Note = {
                      id: `note-${Date.now()}`,
                      author: 'J. Mercer',
                      timestamp: new Date().toLocaleString('en-GB'),
                      text: `Chased via ${channel === 'whatsapp' ? 'WhatsApp' : 'email'} — ${templateLabel}.`,
                    };
                    setC((prev) => (prev ? { ...prev, notes: [note, ...prev.notes] } : prev));
                    toast('Logged as chased — note added');
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* ---------------- SIDEBAR ---------------- */}
        <div className={styles.sidebar}>
          {/* ONE canonical readiness presentation: each ✗ row deep-links to fix. */}
          <div className={styles.panel}>
            <Text className="ce-section-heading">Readiness</Text>
            <Caption1 className={mergeClasses(styles.hint, styles.hintNudgeTop)} block>
              {blocked
                ? `${blockerCount} item${blockerCount === 1 ? '' : 's'} to resolve before EVA — select one to fix.`
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
                <span className={styles.readyDone}>
                  <CheckCircle2 size={16} color="var(--ce-success)" />
                  <Text size={300}>Nothing outstanding — ready for EVA.</Text>
                </span>
              )}
            </div>
          </div>

          <div className={styles.factsPanel}>
            <Text className="ce-section-heading">Imported details</Text>
            <Caption1 className={mergeClasses(styles.hint, styles.hintNudgeBottom)} block>
              From the instruction document or email.
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
