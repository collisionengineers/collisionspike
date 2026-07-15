import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { zipSync } from 'fflate';
import {
  Badge,
  Button,
  Caption1,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  Dropdown,
  Field,
  Input,
  Link,
  Menu,
  MenuItem,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
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
  type SelectTabData,
  type SelectTabEvent,
} from '@fluentui/react-components';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Archive,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  FileText,
  FolderClosed,
  GitMerge,
  ImageOff,
  Mail,
  Lightbulb,
  MapPin,
  MoreHorizontal,
  Pencil,
  Search,
  Send,
  Trash2,
  Upload,
  Pause,
  Play,
  X,
} from 'lucide-react';
import {
  ChaserPanel,
  GuidedPhotoRequestPanel,
  EvaFieldRow,
  FIELD_CLUSTERS,
  LABEL_FOR,
  ImageOrderList,
  Panel,
  PipelineStrip,
  ProvenanceBadge,
  SectionHeading,
  StatusBadge,
  VrmPlate,
  ErrorState,
  CaseDetailSkeleton,
  ThumbGridSkeleton,
  computeReadiness,
  useSeverityChipStyles,
  type ChecklistItem,
  type GuidedPhotoLink,
} from '../components';
import {
  data,
  EVA_FIELD_ORDER,
  dueInfo,
  getSharedLink,
  statusToStage,
  suggestLocations,
  buildSuggestLocationRequest,
  checkVrm,
  useBoxGates,
  useCaseQuery,
  useCaseUpdate,
  useImages,
  useLogChase,
  useInspectionAddressSuggestions,
  useLocationAssistGate,
  useDeleteCaseImageGate,
  activeCopyFileRequestTransport,
  activeGetSharedLinkTransport,
  activeLocationAssistTransport,
  getDataAccess,
  imageDeletionPendingOf,
  serverMessageOf,
  type Case,
  type CaseStatus,
  type EvaFieldKey,
  type Evidence,
  type ImageRole,
  type Note,
  type PipelineStageKey,
  type SuggestedAddress,
} from '../data';
import {
  canSubmitCaseToEva,
  resolveInspectionDecision,
  allowedCaseTypes,
  buildEvaJson,
  CASE_PO_SHAPE_RE,
  derivedMarkerCasePo,
  INTAKE_CHANNEL_LABELS,
  sourceReadinessRecoverySnapshot,
  isValidEvaMileage,
  normalizeCasePo,
  type CaseWorkType,
} from '@cs/domain';
import { buildEvaImageOrder } from '../components/ImageOrderList';
import {
  buildEvaZipImageSpecs,
  evaExportBaseName,
  orderEntriesByKeys,
} from './eva-export-zip';
import { GLOBAL_TOASTER_ID } from '../components';
import { LinkedEmailsPanel } from '../components/LinkedEmailsPanel';
import { ManualSourceArchiveRecovery } from '../components/ManualSourceArchiveRecovery';
import {
  InspectionChoiceControl,
  inspectionChoiceForCase,
  type InspectionChoice,
} from '../components/InspectionChoice';
import { ImageDeleteDialog } from '../components/ImageDeleteDialog';
// Gated AI "Assistant" surface (TKT-015). Self-contained: renders NOTHING unless
// AI_ASSIST_ENABLED (checks the gate via its own hook), so this is an honest-off mount.
import { AiAssistPanel } from '../components/AiAssistPanel';
// DataAccessExt: the SPA-side seam with the work-todo-spike additive methods
// (removeCase). The base DataAccess in '@cs/domain' stays the frozen server contract.
import type { DataAccessExt } from '../data/rest-client';
import {
  guidedCaptureReviewWarning,
  mergeEvidenceReviewDecision,
  persistEvidenceReview,
  releaseEvidenceMutation,
  tryAcquireEvidenceMutation,
} from './evidence-review';
import {
  buildExplicitCaseSave,
  canCheckVehicleDetails,
  initialInspectionDraft,
  inspectionAddressDraftSnapshot,
  restoreInspectionAddressDraft,
  restorePersistedImageBasedChoice,
  startInspectionAddressDraft,
  persistedSessionSnapshot,
  shouldBlockCaseNavigation,
  validateCaseEdit,
  type CaseEditInspectionDraft,
  type InspectionAddressDraftSnapshot,
} from './case-edit-session';
import {
  caseDetailSearchForTab,
  caseDetailTabFromSearch,
  type CaseDetailTab,
} from './case-detail-tab';

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
  /* VRM VIEW row: the plate + a pencil edit affordance that's de-emphasised until
     the operator hovers the plate or keyboard-focuses the button (issue #12). */
  vrmViewRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    '& .ce-vrm-edit-affordance': { opacity: 0, transition: 'opacity 100ms ease-out' },
    '&:hover .ce-vrm-edit-affordance': { opacity: 1 },
    '&:focus-within .ce-vrm-edit-affordance': { opacity: 1 },
    // Touch / no-hover devices can't hover to reveal — keep the affordance visible.
    '@media (hover: none)': { '& .ce-vrm-edit-affordance': { opacity: 1 } },
  },
  /* VRM EDIT row: the Field-wrapped input + Save/Cancel, replacing the plate in place. */
  vrmEditRow: {
    display: 'inline-flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  vrmInput: {
    minWidth: '170px',
    // Echo the plate's condensed mono so the field reads as "the registration".
    '& input': {
      fontFamily: 'var(--ce-font-mono)',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    },
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
  /* TKT-057 — the derived audit reference (marker + Case/PO) in the title tags:
     mono, quiet outline — a reference, not a severity. */
  derivedIdBadge: {
    fontFamily: 'var(--ce-font-mono)',
    letterSpacing: '0.04em',
  },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', alignItems: 'center' },
  saveBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: '3px solid var(--ce-charcoal)',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  saveBarMessage: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
    flexGrow: 1,
  },
  saveBarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: tokens.spacingHorizontalXL,
    alignItems: 'start',
    '@media (max-width: 960px)': { gridTemplateColumns: '1fr' },
  },

  main: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, minWidth: 0 },
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
    // Charcoal group underline (reforge 2026-07-01: a field-cluster head is
    // structure, not severity).
    borderBottom: `2px solid var(--ce-charcoal)`,
    width: 'fit-content',
  },
  clusterBody: { paddingTop: tokens.spacingVerticalM },

  /* Evidence tab — guidance is an INFO callout (slate rail), not an alarm. */
  guidanceBanner: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: `3px solid var(--ce-info-accent)`,
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
    overflow: 'hidden',
  },
  /* Real inline preview (TKT-048): fill the thumb, crop to fit. */
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  thumbMeta: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, padding: tokens.spacingVerticalS },
  thumbName: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, wordBreak: 'break-all' },
  thumbRowBetween: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: tokens.spacingHorizontalS },
  thumbActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  /* TKT-123 — dismissible person-reflection warning on a flagged photo. Amber
     warning triad (never colour-only: the triangle carries the shape cue). */
  reflectionWarning: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    border: '1px solid var(--ce-warning-line)',
    backgroundColor: 'var(--ce-warning-tint)',
    color: 'var(--ce-warning-text)',
  },
  reflectionWarningText: {
    flexGrow: 1,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
  },

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
  /* Search-the-corpus input above the suggestion shortlist (TKT-062). */
  addrSearch: {
    width: '100%',
    marginBottom: tokens.spacingVerticalXS,
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
  iconBad: { color: 'var(--ce-red)', flexShrink: 0, marginTop: '1px' },
  readyText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  readyLabel: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  readyDetail: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  /* the deep-link button styled as a left-aligned link with a chevron affordance.
     Stays in the red family (it fixes a true blocker) but as --ce-critical-ink
     (9.17:1 on white); hover darkens to ink. */
  fixLink: {
    appearance: 'none',
    background: 'none',
    border: 0,
    padding: 0,
    margin: 0,
    textAlign: 'left',
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: 'var(--ce-critical-ink)',
    cursor: 'pointer',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    ':hover': { color: 'var(--ce-ink)' },
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

  /* Remove-case confirmation dialog */
  removeBody: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  removeFacts: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    columnGap: tokens.spacingHorizontalM,
    rowGap: '2px',
    fontSize: tokens.fontSizeBase200,
  },
});

/* The EVA field clusters, label/required lookup, and the editable field row are
   shared with ManualIntake (src/components/EvaFields.tsx) so they cannot drift. */

const ROLE_OPTIONS: { value: ImageRole; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'damage_closeup', label: 'Damage closeup' },
  { value: 'additional', label: 'Additional' },
  { value: 'unknown', label: 'Unclassified' },
];

const POLICY_LABEL: Record<Case['inspectionDecision'], string> = {
  confirmed_physical: 'Physical inspection (confirmed)',
  manual: 'Manual override',
  image_based: 'Image Based Assessment',
  unknown: 'Undecided',
};

/* Plain-English case work-type labels (ADR-0021 / TKT-057). The AP. refinement is
   a REVIEW-time decision — the QDOS instruction letters are identical whether the
   audit resolves repairable or total-loss, so a reviewer sets it here. */
const CASE_WORK_TYPE_LABELS: Record<CaseWorkType, string> = {
  standard: 'Standard case',
  audit: 'Audit review',
  audit_total_loss: 'Total-loss audit review',
  diminution: 'Diminution review',
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
function checklistTarget(item: ChecklistItem, c: Case): { tab: CaseDetailTab; fieldKey?: EvaFieldKey } {
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
interface EvidenceCardProps {
  ev: Evidence;
  onRole: (id: string, role: ImageRole) => void;
  onRegistrationVisible: (id: string, visible: boolean) => void;
  onAcceptedForEva: (id: string, accepted: boolean) => void;
  onExclude: (id: string, excluded: boolean) => void;
  /** TKT-123: dismiss the person-reflection warning (persists via the seam). */
  onDismissReflection: (id: string) => void;
  /** True while this card's dismissal is being saved. */
  dismissingReflection?: boolean;
  /** True while a role/registration/EVA-use/include decision is being saved. */
  saving?: boolean;
  /** Plain-language failure for this card's last save attempt. */
  saveError?: string;
  /** Open the explicit, filename-bearing deletion confirmation. */
  onDelete: (evidence: Evidence) => void;
  /** True while this image's cross-store deletion is running. */
  deleting?: boolean;
  /** Case-field drafts must be saved/discarded before a deletion refreshes truth. */
  deleteDisabled?: boolean;
  /** TKT-160 feature gate (DELETE_CASE_IMAGE_ENABLED). Ships DARK: when false the
   *  destructive Delete-image control is hidden entirely. */
  deleteEnabled?: boolean;
}

function EvidenceCard({
  ev,
  onRole,
  onRegistrationVisible,
  onAcceptedForEva,
  onExclude,
  onDismissReflection,
  dismissingReflection,
  saving,
  saveError,
  onDelete,
  deleting,
  deleteDisabled,
  deleteEnabled,
}: EvidenceCardProps) {
  const styles = useStyles();
  const captureReviewWarning = guidedCaptureReviewWarning(ev);
  const decisionsDisabled = saving || deleting || ev.deletionPending;
  // Real inline preview (TKT-048): fetch the bytes WITH the bearer -> blob: URL for <img>
  // (an <img src> can't carry the token, and CSP allows blob:). Falls back to the coloured
  // placeholder while loading, or if there is no inline content (Box-only / bytes gone).
  const [imgUrl, setImgUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    let url: string | undefined;
    void getDataAccess()
      .evidenceContentUrl(ev.id)
      .then((u) => {
        if (!live) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        url = u;
        setImgUrl(u);
      });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [ev.id]);
  return (
    <div className={mergeClasses(styles.thumbCard, ev.excluded && styles.thumbCardExcluded)}>
      <div className={styles.thumb} style={{ backgroundColor: ev.thumbColor ?? '#5a5a64' }}>
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={ev.fileName}
            className={styles.thumbImg}
            loading="lazy"
            onError={() => setImgUrl(undefined)}
          />
        ) : ev.excluded ? (
          'Excluded'
        ) : ev.imageRole === 'overview' ? (
          'OVERVIEW'
        ) : (
          ''
        )}
      </div>
      <div className={styles.thumbMeta}>
        <span className={styles.thumbName}>{ev.fileName}</span>
        <Field label="Role" size="small">
          <Dropdown
            size="small"
            disabled={decisionsDisabled}
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
        {captureReviewWarning && (
          <div className={styles.reflectionWarning} role="status">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden />
            <span className={styles.reflectionWarningText}>{captureReviewWarning}</span>
          </div>
        )}
        {ev.reviewRequired && !ev.personReflection && (
          <div className={styles.reflectionWarning} role="status">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden />
            <span className={styles.reflectionWarningText}>
              Check this photo. It was left out because it may not show the vehicle.
            </span>
          </div>
        )}
        {/* TKT-123: the classifier's reflection observation renders as a
            DISMISSIBLE plain-English warning — advisory only; excluding the
            photo stays the reviewer's decision via the switch below. */}
        {ev.personReflection && !ev.reflectionDismissed && (
          <div className={styles.reflectionWarning} role="status">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden />
            <span className={styles.reflectionWarningText}>
              A person’s reflection may be visible.
            </span>
            <Button
              appearance="subtle"
              size="small"
              disabled={decisionsDisabled}
              onClick={() => onDismissReflection(ev.id)}
            >
              {dismissingReflection ? 'Dismissing…' : 'Dismiss'}
            </Button>
          </div>
        )}
        <Switch
          checked={ev.registrationVisible}
          disabled={decisionsDisabled}
          label="Registration visible"
          onChange={(_, d) => onRegistrationVisible(ev.id, d.checked)}
        />
        <Switch
          checked={ev.acceptedForEva}
          disabled={decisionsDisabled || !!ev.excluded}
          label="Use for EVA"
          onChange={(_, d) => onAcceptedForEva(ev.id, d.checked)}
        />
        <Switch
          checked={!!ev.excluded}
          disabled={decisionsDisabled}
          label="Exclude"
          onChange={(_, d) => onExclude(ev.id, d.checked)}
        />
        {saving && <Spinner size="tiny" label="Saving…" labelPosition="after" />}
        {deleting && <Spinner size="tiny" label="Deleting…" labelPosition="after" />}
        {ev.deletionPending && !deleting && (
          <Caption1 className={styles.reflectionWarningText} role="status">
            Deletion is unfinished. Select Finish deleting to retry.
          </Caption1>
        )}
        {saveError && (
          <Caption1 className={styles.reflectionWarningText} role="alert">
            {saveError}
          </Caption1>
        )}
        <div className={styles.thumbActions}>
          {ev.boxFileUrl ? (
            // `inline` = rest-state underline: with links demoted to ink, a
            // text-adjacent link needs the underline to read as a link at rest.
            <Link inline href={ev.boxFileUrl} target="_blank" rel="noopener noreferrer">
              <span className={styles.inlineIconText}>Open in Archive <ArrowUpRight size={12} /></span>
            </Link>
          ) : <span />}
          {/* TKT-160 ships DARK: the destructive Delete-image control appears only when the
              DELETE_CASE_IMAGE_ENABLED gate is on (server-authoritative). A placeholder keeps the
              thumbActions row's space-between layout while hidden. */}
          {deleteEnabled ? (
            <Button
              appearance="subtle"
              size="small"
              icon={<Trash2 size={14} />}
              aria-label={`${ev.deletionPending ? 'Finish deleting' : 'Delete image'} ${ev.fileName}`}
              title={deleteDisabled && !ev.deletionPending ? 'Save or discard the case changes first.' : undefined}
              disabled={saving || deleting || (deleteDisabled && !ev.deletionPending)}
              onClick={() => onDelete(ev)}
            >
              {ev.deletionPending ? 'Finish deleting' : 'Delete image'}
            </Button>
          ) : <span />}
        </div>
      </div>
    </div>
  );
}

/* ---------- A single SUGGESTED inspection-location row ----------
   Renders the candidate as monospace address lines + a DISTINCT "Suggested" tint
   badge + an evidence Tooltip, with a [Use this address] action. The action is
   the caller's (it copies into the manual draft + sets decision=manual). Nothing
   here writes a Case or sets the EVA field directly. */
/** How many corpus suggestions to show before a "Show N more" toggle (TKT-079). Assist
 *  candidates are always shown in full (they are the reviewer-invoked result). */
const SUGGEST_VISIBLE = 4;

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

/** A muted "~N miles away" proximity hint (TKT-076/079) from the case's accident/claimant
 *  postcode. PRESENTATION/ORDERING ONLY — never auto-selects (ADR-0016 #2b). */
function distanceHint(suggestion: SuggestedAddress): string | undefined {
  const d = suggestion.distanceMiles;
  if (typeof d !== 'number' || !isFinite(d) || d < 0) return undefined;
  if (d < 1) return 'under a mile away';
  return `~${Math.round(d)} ${Math.round(d) === 1 ? 'mile' : 'miles'} away`;
}

function SuggestedLocationRow({ suggestion, onUse }: SuggestedLocationRowProps) {
  const styles = useStyles();
  const lines = [...suggestion.lines, suggestion.postcode].filter(Boolean);
  const band = friendlyBand(suggestion.confidenceBand);
  const seenHint = frequencyHint(suggestion);
  const distHint = distanceHint(suggestion);
  const tip = [band, distHint, seenHint, suggestion.evidenceNote, 'Suggested — low confidence; verify before use.']
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
          {distHint && <Caption1 className={styles.hint}>{distHint}</Caption1>}
          {/* TKT-076/079 — a scope-FALLBACK row is a common location served because this
              provider has no saved sites yet; its stored provider code belongs to some
              OTHER provider and rendering it would mislead ("Provider FW" on a QDOS case).
              Say what it really is instead. */}
          {suggestion.scopeFallback ? (
            <Caption1 className={styles.hint}>Common location — not specific to this provider</Caption1>
          ) : (
            suggestion.providerCode && (
              <Caption1 className={styles.hint}>Provider {suggestion.providerCode}</Caption1>
            )
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
        <Link inline as="button" onClick={() => navigate('/')}>
          Back to dashboard
        </Link>
        <Outlet />
      </div>
    );
  }

  return (
      <CaseDetailView
        key={`${caseQuery.data.id}:${caseQuery.data.version ?? 'unversioned'}`}
        caseData={caseQuery.data}
        images={imagesQuery.data ?? []}
        imagesLoading={imagesQuery.loading && imagesQuery.data === undefined}
        onRefreshImages={imagesQuery.refetch}
      />
    );
}

interface CaseDetailViewProps {
  caseData: Case;
  images: Evidence[];
  /** True while the image set is still being fetched (evidence tab shows a skeleton). */
  imagesLoading: boolean;
  onRefreshImages: () => void;
}

/* The editing workspace. Receives the loaded Case + images; case-field and
   inspection edits stay in a local draft until the explicit Save succeeds. */
function CaseDetailView({ caseData, images, imagesLoading, onRefreshImages }: CaseDetailViewProps) {
  const styles = useStyles();
  const chips = useSeverityChipStyles();
  const { logChase } = useLogChase();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const tab = caseDetailTabFromSearch(searchParams);
  const setTab = (next: CaseDetailTab) => {
    // Tab selection belongs to this case page. Replace the query state so Back
    // leaves the case instead of walking through every tab the handler opened.
    setSearchParams(caseDetailSearchForTab(searchParams, next), { replace: true });
  };
  const [guidedPhotoLink, setGuidedPhotoLink] = useState<GuidedPhotoLink | undefined>();
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
  // Destructive image-deletion gate (TKT-160). Ships DARK — undefined/loading reads as OFF,
  // so the Delete-image control stays hidden until DELETE_CASE_IMAGE_ENABLED is flipped live.
  const { data: deleteImageGate } = useDeleteCaseImageGate();
  const deleteImageEnabled = deleteImageGate?.enabled ?? false;
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
  // legacy row (.eml/PDF marked image-adjacent) must never reach the photo grid or
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
  const navigationBlocker = useBlocker(({ currentLocation, nextLocation }) =>
    shouldBlockCaseNavigation(
      hasUnsavedChanges,
      currentLocation.pathname,
      nextLocation.pathname,
    ),
  );

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
     WHERE the confirmed manual decision came from (cr1bd_sourcelabel/-sourcenote)
     WITHOUT becoming a new unconfirmed suggestion (the suggestions query + the Admin
     split + isSuggestedAddressRecord all key on the 'suggested' prefix). */
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

  // TKT-089: role/registration/EVA-use/include changes are durable server mutations.
  // The working copy changes only after the server confirms; failures keep the prior row.
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

  // TKT-160: deleting an image is a deliberate, separately confirmed action.
  // The card remains visible until the server confirms every required copy is
  // gone. A partial failure marks it for an honest, user-driven retry.
  const [deleteCandidate, setDeleteCandidate] = useState<Evidence | undefined>(undefined);
  const [deletingImageId, setDeletingImageId] = useState<string | undefined>(undefined);
  const [deleteImageError, setDeleteImageError] = useState<string | undefined>(undefined);

  const openImageDeletion = (evidence: Evidence) => {
    setDeleteImageError(undefined);
    setDeleteCandidate(evidence);
  };

  const closeImageDeletion = () => {
    if (deletingImageId) return;
    setDeleteImageError(undefined);
    setDeleteCandidate(undefined);
  };

  const confirmImageDeletion = async () => {
    if (!deleteCandidate || deletingImageId) return;
    const target = deleteCandidate;
    setDeletingImageId(target.id);
    setDeleteImageError(undefined);
    try {
      await (data as DataAccessExt).deleteCaseImage(c.id, target.id);
      const withoutTarget = (items: Evidence[]) => items.filter((item) => item.id !== target.id);
      setImgState(withoutTarget);
      setC((current) => ({ ...current, evidence: withoutTarget(current.evidence) }));
      setPersistedCase((current) => ({ ...current, evidence: withoutTarget(current.evidence) }));
      onRefreshImages();
      setDeleteCandidate(undefined);
      toast(`Image deleted: ${target.fileName}`);

      // An already-started deletion may be retried while unrelated case-field
      // edits remain unsaved. Never replace those drafts with a refreshed case.
      if (!hasUnsavedChanges) {
        try {
          const updated = await data.caseById(c.id);
          if (updated) adoptPersistedCase(updated);
        } catch {
          // The image list/readiness is already correct locally. A later case refresh
          // will pick up the server-confirmed status if this secondary read fails.
        }
      }
    } catch (error) {
      const message = serverMessageOf(error) ?? 'The image could not be deleted. It is still on the case; try again.';
      setDeleteImageError(message);
      // A scope/ownership/preflight refusal happens before durable intent and is
      // not presented as an unfinished deletion. Only server-confirmed partial
      // work (or an already-pending card) gets the Finish deleting state.
      const serverPending = imageDeletionPendingOf(error);
      const pending = serverPending ?? !!target.deletionPending;
      if (pending || serverPending === false) {
        const withPendingTruth = (items: Evidence[]) => items.map((item) => (
          item.id === target.id
            ? { ...item, deletionPending: pending || undefined }
            : item
        ));
        setDeleteCandidate((current) => current
          ? { ...current, deletionPending: pending || undefined }
          : current);
        setImgState(withPendingTruth);
        setC((current) => ({ ...current, evidence: withPendingTruth(current.evidence) }));
        setPersistedCase((current) => ({
          ...current,
          evidence: withPendingTruth(current.evidence),
        }));
        if (serverPending === false) onRefreshImages();
      }
    } finally {
      setDeletingImageId(undefined);
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

  // TKT-002 (display-only): images are present but NONE (non-excluded) shows a
  // readable registration — the case can't be EVA-ready until a vehicle overview
  // with the full plate arrives. Derived from the per-image registrationVisible
  // flag the OCR (plate_ocr) sets at intake.
  const noViewableRegistration =
    imgState.some((e) => !e.excluded) && !imgState.some((e) => !e.excluded && e.registrationVisible);
  // Non-image artifacts (source email, instruction PDFs, …) for the Documents list.
  const documents = c.evidence.filter((e) => e.kind !== 'image' && e.kind !== 'video');
  const notesNewestFirst = c.notes; // already inserted newest-first
  const photoRequestsDisabled =
    c.mergedInto !== undefined ||
    c.status === 'eva_submitted' ||
    c.status === 'box_synced' ||
    c.status === 'done' ||
    c.status === 'removed';

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
              {editingVrm ? (
                <span className={styles.vrmEditRow} role="group" aria-label="Edit registration">
                  <Field
                    validationState={
                      vrmCheck.status === 'malformed'
                        ? 'warning'
                        : vrmCheck.status === 'empty'
                          ? 'error'
                          : 'none'
                    }
                    validationMessage={
                      vrmCheck.status === 'malformed'
                        ? 'Doesn’t look like a UK registration — save anyway if this is correct.'
                        : vrmCheck.status === 'empty'
                          ? 'Registration can’t be empty.'
                          : undefined
                    }
                  >
                    <Input
                      ref={vrmInputRef}
                      className={styles.vrmInput}
                      aria-label="Vehicle registration"
                      value={vrmDraft}
                      maxLength={16}
                      onChange={(_, d) => setVrmDraft(d.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void saveVrm();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEditVrm();
                        }
                      }}
                    />
                  </Field>
                  <Button
                    appearance="primary"
                    icon={savingVrm ? <Spinner size="tiny" /> : <Check size={16} />}
                    disabled={savingVrm || hasUnsavedChanges || vrmCheck.status === 'empty'}
                    onClick={() => void saveVrm()}
                  >
                    Save
                  </Button>
                  <Button
                    appearance="subtle"
                    icon={<X size={16} />}
                    disabled={savingVrm}
                    onClick={cancelEditVrm}
                  >
                    Cancel
                  </Button>
                </span>
              ) : (
                <span className={styles.vrmViewRow}>
                  <VrmPlate vrm={c.vrm} size="large" />
                  <Tooltip content="Edit registration" relationship="label">
                    <Button
                      ref={vrmEditBtnRef}
                      className="ce-vrm-edit-affordance"
                      appearance="subtle"
                      size="small"
                      icon={<Pencil size={14} />}
                      onClick={beginEditVrm}
                      disabled={hasUnsavedChanges}
                    />
                  </Tooltip>
                </span>
              )}
              {editingPo ? (
                <span className={styles.vrmEditRow}>
                  <Field
                    validationState={poDraft && !poShapeOk ? 'error' : 'none'}
                    validationMessage={
                      poDraft && !poShapeOk
                        ? 'Not a Case/PO shape (e.g. CCPY26050 or A.PCH261269).'
                        : undefined
                    }
                  >
                    <Input
                      aria-label="Case/PO"
                      value={poDraft}
                      maxLength={16}
                      placeholder="e.g. CCPY26050"
                      onChange={(_, d) => setPoDraft(d.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void savePo();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEditPo();
                        }
                      }}
                    />
                  </Field>
                  <Button
                    appearance="primary"
                    icon={savingPo ? <Spinner size="tiny" /> : <Check size={16} />}
                    disabled={savingPo || hasUnsavedChanges || !poShapeOk}
                    onClick={() => void savePo()}
                  >
                    Save
                  </Button>
                  <Button appearance="subtle" icon={<X size={16} />} disabled={savingPo} onClick={cancelEditPo}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <span className={styles.vrmViewRow}>
                  {/* TKT-118: a pre-mint case is identified by its REGISTRATION (the
                      plate to the left) — say so, rather than a bare "no number". */}
                  <span className={mergeClasses('ce-display', styles.titleText)}>
                    {titleText || 'No Case/PO yet — identified by registration'}
                  </span>
                  <Tooltip
                    content={c.casePo ? 'Correct the Case/PO' : 'Set the Case/PO (assigned at EVA-add)'}
                    relationship="label"
                  >
                    <Button
                      className="ce-vrm-edit-affordance"
                      appearance="subtle"
                      size="small"
                      icon={<Pencil size={14} />}
                      aria-label={c.casePo ? 'Correct the Case/PO' : 'Set the Case/PO'}
                      onClick={beginEditPo}
                      disabled={hasUnsavedChanges}
                    />
                  </Tooltip>
                </span>
              )}
            </span>
          }
          subtitle={subtitle || undefined}
          actions={
            <div className={styles.actions}>
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
                disabled={hasUnsavedChanges}
              >
                {c.onHold ? 'Release' : 'Hold'}
              </Button>
              <Tooltip
                content={
                  hasUnsavedChanges
                    ? 'Save or discard changes before exporting'
                    : blocked
                    ? `Can't export yet — ${blockerCount} item(s) outstanding`
                    : 'Download one zip — the EVA file plus every included photo, in upload order'
                }
                relationship="label"
              >
                <Button
                  appearance="secondary"
                  icon={exportingEva ? <Spinner size="tiny" /> : <Download size={16} />}
                  disabled={blocked || isRemoved || exportingEva || hasUnsavedChanges}
                  onClick={() => void onExportForEva()}
                >
                  {exportingEva ? 'Exporting…' : 'Export for EVA'}
                </Button>
              </Tooltip>
              <Tooltip
                content={
                  hasUnsavedChanges
                    ? 'Save or discard changes before submitting'
                    : blocked
                      ? `Can't submit to EVA yet — ${blockerCount} item(s) outstanding`
                      : 'Submit this case to EVA'
                }
                relationship="label"
              >
                <Button
                  appearance="primary"
                  icon={<Send size={16} />}
                  disabled={blocked || isRemoved || hasUnsavedChanges}
                  onClick={() => navigate(`/case/${c.id}/submit`)}
                >
                  Submit to EVA
                </Button>
              </Tooltip>
              {/* TKT-095 thin slice: the delivery bridge — only an EVA-submitted case
                  can be marked delivered (Done). Primary action at this stage of the
                  lifecycle; the auto-detectors (Box report PDF, sent email) record it
                  without the click when they fire first. */}
              {c.status === 'eva_submitted' && (
                <Tooltip
                  content="Record that the report went back to the work provider"
                  relationship="label"
                >
                  <Button
                    appearance="primary"
                    icon={markingDone ? <Spinner size="tiny" /> : <CheckCircle2 size={16} />}
                    disabled={markingDone || hasUnsavedChanges}
                    onClick={() => void onMarkReportDelivered()}
                  >
                    {markingDone ? 'Recording…' : 'Mark report delivered'}
                  </Button>
                </Tooltip>
              )}
              {/* Close case (TKT-010) — all staff; tucked in the overflow menu so
                  it never crowds (or sits beside) the primary actions. */}
              {!isRemoved && (
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <Tooltip content="More actions" relationship="label">
                      <Button
                        appearance="subtle"
                        icon={<MoreHorizontal size={16} />}
                        aria-label="More actions"
                        disabled={hasUnsavedChanges}
                      />
                    </Tooltip>
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      <MenuItem icon={<FolderClosed size={16} />} onClick={openRemove}>
                        Close case…
                      </MenuItem>
                    </MenuList>
                  </MenuPopover>
                </Menu>
              )}
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
            {INTAKE_CHANNEL_LABELS[c.channel.kind] ?? 'Email'} · {c.channel.mode}
          </Badge>
          {/* Case-type control (TKT-057): the review-time refinement — notably
              audit → total-loss audit once the inspection outcome is known. */}
          {showCaseTypeControl && (
            <>
              <Menu
                checkedValues={{ caseType: [currentCaseType] }}
                onCheckedValueChange={(_e, d) => {
                  const next = d.checkedItems?.[0] as CaseWorkType | undefined;
                  if (next) void setCaseType(next);
                }}
              >
                <MenuTrigger disableButtonEnhancement>
                  <Tooltip
                    content="The kind of work this case is — a reviewer can refine it (e.g. an audit found to be a total loss)"
                    relationship="description"
                  >
                    <Button
                      appearance="outline"
                      size="small"
                      icon={<ChevronDown size={14} />}
                      iconPosition="after"
                      aria-label={`Case type: ${CASE_WORK_TYPE_LABELS[currentCaseType]}`}
                    >
                      {CASE_WORK_TYPE_LABELS[currentCaseType]}
                    </Button>
                  </Tooltip>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {caseTypeOptions.map((t) => (
                      <MenuItemRadio key={t} name="caseType" value={t}>
                        {CASE_WORK_TYPE_LABELS[t]}
                      </MenuItemRadio>
                    ))}
                  </MenuList>
                </MenuPopover>
              </Menu>
              {derivedAuditId && derivedAuditId !== (c.casePo ?? '').toUpperCase() && (
                <Tooltip
                  content="The audit reference — use this number on the EVA-side audit submission"
                  relationship="description"
                >
                  <Badge appearance="outline" shape="rounded" className={styles.derivedIdBadge}>
                    {derivedAuditId}
                  </Badge>
                </Tooltip>
              )}
            </>
          )}
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

      {isRemoved && (
        <MessageBar intent="info">
          <MessageBarBody>
            <MessageBarTitle>This case is closed</MessageBarTitle>
            It has left the work queues. Nothing was deleted — every detail is kept for the record.
          </MessageBarBody>
        </MessageBar>
      )}

      {vehicleWarning && !isRemoved && (
        <MessageBar intent="warning">
          <MessageBarBody>
            <MessageBarTitle>Vehicle details need attention</MessageBarTitle>
            {vehicleWarning}{' '}
            <Button
              appearance="transparent"
              size="small"
              disabled={!canCheckVehicleDetails(hasUnsavedChanges, checkingVehicle, c.vrm)}
              icon={checkingVehicle ? <Spinner size="tiny" /> : undefined}
              onClick={() => void checkVehicleAgain()}
            >
              {checkingVehicle ? 'Checking…' : 'Check again'}
            </Button>
          </MessageBarBody>
        </MessageBar>
      )}

      {blocked && !isRemoved && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Can't submit to EVA yet — {blockerCount} item{blockerCount === 1 ? '' : 's'}</MessageBarTitle>
            {liveCase.onHold
              ? readiness.missing.length > 0
                ? 'Release the hold and resolve the outstanding readiness items before submitting to EVA.'
                : 'Release the hold before submitting to EVA.'
              : workflowBlocked
                ? 'Finish the outstanding case decision so it can move to Review before submitting to EVA.'
              : 'Use the readiness list — each outstanding item links to the field to fix.'}
          </MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.saveBar} aria-live="polite">
        <div className={styles.saveBarMessage} role="status">
          <Text weight="semibold">
            {savingEdits
              ? 'Saving changes…'
              : saveError
                ? 'Changes not saved'
                : hasUnsavedChanges
                  ? 'Unsaved changes'
                  : 'No unsaved changes'}
          </Text>
          <Caption1 className={styles.hint}>
            {saveError ??
              (!caseVersion && hasUnsavedChanges
                ? 'Reload this case before saving your changes.'
                : invalidFieldCount > 0
                  ? `${invalidFieldCount} field${invalidFieldCount === 1 ? '' : 's'} need attention before saving.`
                  : hasUnsavedChanges
                    ? 'Review the changes, then save or discard them.'
                    : 'Edits only take effect after you save them.')}
          </Caption1>
        </div>
        <div className={styles.saveBarActions}>
          {saveConflict && (
            <Button
              appearance="secondary"
              disabled={savingEdits}
              onClick={() => void reloadLatestForReconcile()}
            >
              Reload latest
            </Button>
          )}
          {editValidation.length > 0 && (
            <Button appearance="subtle" onClick={focusFirstEditIssue}>
              Review fields
            </Button>
          )}
          <Button
            appearance="secondary"
            disabled={!hasUnsavedChanges || savingEdits}
            onClick={() => setDiscardOpen(true)}
          >
            Discard changes
          </Button>
          <Button
            appearance="primary"
            icon={savingEdits ? <Spinner size="tiny" /> : <Check size={16} />}
            disabled={!canSaveEdits}
            onClick={() => void saveCaseEdits()}
          >
            {savingEdits ? 'Saving…' : saveError && !saveConflict ? 'Try again' : 'Save changes'}
          </Button>
        </div>
      </div>

      <div className={styles.grid}>
        {/* ---------------- MAIN ---------------- */}
        <div className={styles.main}>
          <Panel>
            <TabList
              selectedValue={tab}
              onTabSelect={(_: SelectTabEvent, d: SelectTabData) => setTab(d.value as CaseDetailTab)}
            >
              <Tab value="fields">Fields</Tab>
              <Tab value="evidence">Evidence</Tab>
              <Tab value="address">Address</Tab>
              <Tab value="notes">Notes</Tab>
              <Tab value="chasers">Chasers</Tab>
              <Tab value="emails">Emails</Tab>
            </TabList>

            <div className={styles.tabBody}>
              {tab === 'fields' && (
                <div>
                  {FIELD_CLUSTERS.map((cluster) => (
                    <div className={styles.cluster} key={cluster.heading}>
                      <span className={styles.clusterHead}>{cluster.heading}</span>
                      <div className={styles.clusterBody}>
                        {cluster.keys.map((key) => (
                          <EvaFieldRow
                            key={key}
                            fieldKey={key}
                            label={LABEL_FOR[key].label}
                            required={LABEL_FOR[key].required}
                            field={c.evaFields[key]}
                            onChange={onTextChange}
                            validationMessage={validationByField.get(key)}
                            rowId={`field-${key}`}
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
                  <Caption1 className={styles.hint}>
                    Photo choices save as you make them. Use Save changes for case fields and the inspection choice.
                  </Caption1>
                  <ManualSourceArchiveRecovery
                    caseValue={c}
                    onRecovered={(fresh) => {
                      const snapshot = sourceReadinessRecoverySnapshot(
                        c,
                        persistedCase,
                        fresh,
                        caseVersion,
                      );
                      setC(snapshot.draft);
                      setPersistedCase(snapshot.persisted);
                      setCaseVersion(snapshot.version);
                    }}
                  />
                  <div>
                    <Button
                      appearance="primary"
                      icon={<Camera size={16} />}
                      disabled={photoRequestsDisabled}
                      onClick={() => setTab('chasers')}
                    >
                      Request guided photos
                    </Button>
                  </div>
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
                        <Link inline href={c.boxFolderUrl} target="_blank" rel="noopener noreferrer">
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
                              <Link inline href={d.boxFileUrl} target="_blank" rel="noopener noreferrer">
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
                      {/* TKT-002 (display-only): images present but none show a readable
                          registration — one concise inline warning, distinct from the
                          "No images yet" state above. */}
                      {noViewableRegistration && (
                        <MessageBar intent="warning">
                          <MessageBarBody>
                            <span className={styles.inlineIconText}>
                              <AlertTriangle size={16} /> No photo shows a readable registration yet — a vehicle overview with the full number plate is still needed.
                            </span>
                          </MessageBarBody>
                        </MessageBar>
                      )}
                      <div className={styles.thumbGrid}>
                        {imgState.map((ev) => (
                          <EvidenceCard
                            key={ev.id}
                            ev={ev}
                            onRole={onRole}
                            onRegistrationVisible={onRegistrationVisible}
                            onAcceptedForEva={onAcceptedForEva}
                            onExclude={onExclude}
                            onDismissReflection={(id) => void onDismissReflection(id)}
                            dismissingReflection={evidenceMutations[ev.id] === 'reflection'}
                            saving={evidenceMutations[ev.id] != null}
                            saveError={evidenceSaveErrors[ev.id]}
                            onDelete={openImageDeletion}
                            deleting={deletingImageId === ev.id}
                            deleteDisabled={hasUnsavedChanges}
                            deleteEnabled={deleteImageEnabled}
                          />
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

                      {/* The reviewer's drag order feeds the EVA-export zip (TKT-126). */}
                      {acceptedImages.length > 0 && (
                        <ImageOrderList images={acceptedImages} onOrderChange={setEvaOrderKeys} />
                      )}
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
                    {/* Slate info-tint callout tag — a decision label is
                        metadata, not brand/severity (pigment ruling). */}
                    <Badge appearance="tint" className={chips.chipInfoTint} shape="rounded">
                      Decision: {POLICY_LABEL[decisionMode]}
                    </Badge>
                    <ProvenanceBadge
                      variant="full"
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
                  <InspectionChoiceControl
                    choice={overrideAddr ? 'image_based' : 'address'}
                    onChoiceChange={chooseInspection}
                    reason={overrideReason}
                    onReasonChange={changeImageBasedReason}
                    requireReason={
                      inspectionDraft.decisionMode === 'image_based' && inspectionDraft.touched
                    }
                  >
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
                                onClick={() => onSuggestLocation(false)}
                                disabled={assistRunning}
                              >
                                {assistRunning ? 'Looking…' : 'Suggest location'}
                              </Button>
                            )}
                            {/* Deeper AI vision-reasoning escalation (TKT-078) — hidden unless the
                                escalation gate is on (ships DARK, so not shown live today). */}
                            {assistAiEnabled && (
                              <Button
                                appearance="subtle"
                                size="small"
                                icon={<Lightbulb size={14} />}
                                onClick={() => onSuggestLocation(true)}
                                disabled={assistRunning}
                              >
                                Try a deeper photo-based suggestion
                              </Button>
                            )}
                          </div>
                        </>
                      )}

                      {/* Search the full corpus — the list otherwise shows only the ranked
                          provider shortlist (TKT-062). Typing ≥2 chars queries all ~2,200. */}
                      <Input
                        size="small"
                        value={addrSearch}
                        onChange={(_e, d) => setAddrSearch(d.value)}
                        contentBefore={<Search size={14} />}
                        placeholder="Search all locations…"
                        aria-label="Search all inspection locations"
                        className={styles.addrSearch}
                      />
                      {addrSearching && (
                        <Caption1 className={styles.assistNoResult}>
                          {suggestions.length === 0
                            ? `No locations match “${addrSearch.trim()}”.`
                            : `${suggestions.length} match${suggestions.length === 1 ? '' : 'es'} — showing the closest.`}
                        </Caption1>
                      )}

                      {/* TKT-076/079 — the shortlist is the labelled COMMON fallback
                          (no sites saved for this provider yet), never an unlabelled
                          global list. Banner + per-row wording together close the
                          scopeFallback gap both verifiers failed. */}
                      {!addrSearching && suggestions.some((s) => s.scopeFallback) && (
                        <Caption1 className={styles.assistNoResult}>
                          Showing common locations — none saved for this provider yet.
                        </Caption1>
                      )}

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
                          {(showAllSuggestions || addrSearching
                            ? suggestions
                            : suggestions.slice(0, SUGGEST_VISIBLE)
                          ).map((s) => (
                            <SuggestedLocationRow
                              key={s.id}
                              suggestion={s}
                              onUse={() => useSuggestion(s)}
                            />
                          ))}
                        </div>
                      )}

                      {/* Show-more toggle for the capped corpus shortlist (TKT-079). Hidden while
                          searching the full corpus (that list is already the search result). */}
                      {!addrSearching && suggestions.length > SUGGEST_VISIBLE && (
                        <Button
                          appearance="transparent"
                          size="small"
                          onClick={() => setShowAllSuggestions((v) => !v)}
                        >
                          {showAllSuggestions
                            ? 'Show fewer'
                            : `Show ${suggestions.length - SUGGEST_VISIBLE} more`}
                        </Button>
                      )}

                      {/* Muted line when the last assist run found nothing. */}
                      {assistNoResult === true && (
                        <Caption1 className={styles.assistNoResult}>
                          No location could be suggested from the photos.
                        </Caption1>
                      )}
                  </InspectionChoiceControl>
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
                <div className={styles.stack}>
                  <GuidedPhotoRequestPanel
                    caseId={c.id}
                    disabled={photoRequestsDisabled}
                    onLinkReady={setGuidedPhotoLink}
                    onLinkCancelled={(sessionId) => {
                      setGuidedPhotoLink((current) =>
                        current?.sessionId === sessionId ? undefined : current,
                      );
                    }}
                  />
                  <Divider />
                  <ChaserPanel
                    case={liveCase}
                    guidedPhotoLink={guidedPhotoLink}
                    fileRequestEnabled={uploadLinkEnabled}
                    onRequestUploadLink={activeCopyFileRequestTransport}
                    onLogChased={({ channel, templateLabel }) => {
                    // Optimistic note (the visible artifact) rolled back if the
                    // POST fails; the durable chaser row PERSISTS through the
                    // seam (M-E2) and reconciles into c.chasers on response.
                    const note: Note = {
                      id: `note-${Date.now()}`,
                      author: 'J. Mercer',
                      timestamp: new Date().toLocaleString('en-GB'),
                      text: `Chased via ${channel === 'whatsapp' ? 'WhatsApp' : 'email'} — ${templateLabel}.`,
                    };
                    setC((prev) => (prev ? { ...prev, notes: [note, ...prev.notes] } : prev));
                    return logChase(c.id, { channel, templateLabel })
                      .then((chaser) => {
                        setC((prev) =>
                          prev ? { ...prev, chasers: [chaser, ...prev.chasers] } : prev,
                        );
                        toast('Chase logged');
                      })
                      .catch((err: unknown) => {
                        // Roll the optimistic note back — never a fake success.
                        setC((prev) =>
                          prev
                            ? { ...prev, notes: prev.notes.filter((n) => n.id !== note.id) }
                            : prev,
                        );
                        dispatchToast(
                          <Toast>
                            <ToastTitle>Couldn’t log the chase — try again</ToastTitle>
                            <ToastBody>
                              {err instanceof Error ? err.message : 'Please try again.'}
                            </ToastBody>
                          </Toast>,
                          { intent: 'error' },
                        );
                      });
                    }}
                  />
                </div>
              )}

              {/* Emails linked to this case (TKT-009). Mounted only when the tab
                  is open so the inbound feed isn't fetched on every case view. */}
              {tab === 'emails' && <LinkedEmailsPanel caseId={c.id} />}
            </div>
          </Panel>
        </div>

        {/* ---------------- SIDEBAR ---------------- */}
        <div className={styles.sidebar}>
          {/* ONE canonical readiness presentation: each ✗ row deep-links to fix. */}
          <Panel>
            <Text className="ce-section-heading">Readiness</Text>
            <Caption1 className={mergeClasses(styles.hint, styles.hintNudgeTop)} block>
              {blocked
                ? liveCase.onHold
                  ? readiness.missing.length > 0
                    ? `Release the hold and resolve ${readiness.missing.length} readiness item${readiness.missing.length === 1 ? '' : 's'} before EVA.`
                    : 'Release the hold before EVA.'
                  : workflowBlocked
                    ? 'Finish the outstanding case decision so it can move to Review before EVA.'
                  : `${blockerCount} item${blockerCount === 1 ? '' : 's'} to resolve before EVA — select one to fix.`
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
          </Panel>

          {/* TKT-128: never render blank — a case with no imported facts says so
              in plain English. (The parsed EVA fields live on the Fields tab; this
              panel is the ov_* overview facts only.) */}
          {(() => {
            const facts = (
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
            ).filter(([, v]) => !!v);
            return (
              <Panel className={styles.factsPanel}>
                <Text className="ce-section-heading">Imported details</Text>
                <Caption1 className={mergeClasses(styles.hint, styles.hintNudgeBottom)} block>
                  From the instruction document or email.
                </Caption1>
                {facts.length === 0 ? (
                  <Caption1 className={styles.hint} block>
                    Nothing was imported from the instruction document or email yet.
                  </Caption1>
                ) : (
                  facts.map(([k, v]) => (
                    <div className={styles.factRow} key={k}>
                      <span className={styles.factKey}>{k}</span>
                      <span className={styles.factVal}>{v}</span>
                    </div>
                  ))
                )}
              </Panel>
            );
          })()}

          {/* Gated AI "Assistant" (TKT-015) — renders NOTHING unless AI_ASSIST_ENABLED.
              Observation-first: suggestions with Accept/Reject; nothing mutates the case
              on its own (the API promotes an accepted value FILL-IF-EMPTY). */}
          <AiAssistPanel
            caseId={c.id}
            disabled={hasUnsavedChanges}
            onPromoted={() => void refreshAfterAiPromotion()}
          />
        </div>
      </div>

      <ImageDeleteDialog
        open={deleteCandidate !== undefined}
        fileName={deleteCandidate?.fileName}
        busy={deletingImageId !== undefined}
        error={deleteImageError}
        onCancel={closeImageDeletion}
        onConfirm={() => void confirmImageDeletion()}
      />

      <Dialog
        open={discardOpen}
        modalType="modal"
        onOpenChange={(_, detail) => {
          if (!detail.open && !savingEdits) setDiscardOpen(false);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogContent>
              The case will return to the last saved values.
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDiscardOpen(false)}>
                Keep editing
              </Button>
              <Button appearance="primary" onClick={restorePersistedDraft}>
                Discard changes
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={navigationBlocker.state === 'blocked'}
        modalType="modal"
        onOpenChange={(_, detail) => {
          if (!detail.open && navigationBlocker.state === 'blocked') navigationBlocker.reset();
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogContent>
              This case has unsaved changes. Stay to save them, or leave and discard them.
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                onClick={() => {
                  if (navigationBlocker.state === 'blocked') navigationBlocker.reset();
                }}
              >
                Stay on case
              </Button>
              <Button
                appearance="primary"
                onClick={() => {
                  if (navigationBlocker.state === 'blocked') navigationBlocker.proceed();
                }}
              >
                Leave without saving
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Close-case confirmation (TKT-010) — all staff. Typed confirm (kept as
          deliberate friction) + the archive ACK; the server sets the terminal
          soft state, keeps every detail, and never auto-deletes the Box folder. */}
      <Dialog
        open={removeOpen}
        modalType="modal"
        onOpenChange={(_, d) => {
          if (!d.open && !removing) setRemoveOpen(false);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Close case</DialogTitle>
            <DialogContent className={styles.removeBody}>
              <MessageBar intent="info" icon={<FolderClosed size={20} />}>
                <MessageBarBody>
                  <MessageBarTitle>Close case — it will leave the work queues</MessageBarTitle>
                  Nothing is deleted. Every detail stays on the record, and the case no longer
                  appears as work to do.
                </MessageBarBody>
              </MessageBar>

              <div className={styles.removeFacts}>
                <span className={styles.factKey}>Case</span>
                <span className={styles.factVal}>{c.casePo || c.id}</span>
                <span className={styles.factKey}>Registration</span>
                <span className={styles.factVal}>{c.vrm}</span>
                <span className={styles.factKey}>Provider</span>
                <span className={styles.factVal}>{c.provider}</span>
                {c.evaFields.claimantName.value && (
                  <>
                    <span className={styles.factKey}>Claimant</span>
                    <span className={styles.factVal}>{c.evaFields.claimantName.value}</span>
                  </>
                )}
              </div>

              <Field label={`Type ${removeMatch} to confirm`} required>
                <Input
                  value={removeConfirmText}
                  onChange={(_, d) => setRemoveConfirmText(d.value)}
                  placeholder={removeMatch}
                  aria-label="Type the case reference to confirm closing"
                />
              </Field>

              <Checkbox
                checked={removeAckBox}
                onChange={(_, d) => setRemoveAckBox(d.checked === true)}
                label="I’ve handled the archive folder separately"
              />
              <Caption1 className={styles.hint}>
                The archive folder is never removed automatically. Handle it separately.
              </Caption1>

              <Field label="Reason (optional)">
                <Textarea
                  value={removeReason}
                  onChange={(_, d) => setRemoveReason(d.value)}
                  resize="vertical"
                  rows={2}
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setRemoveOpen(false)} disabled={removing}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                icon={removing ? <Spinner size="tiny" /> : <FolderClosed size={16} />}
                disabled={!removeConfirmed || removing}
                onClick={() => void doRemove()}
              >
                {removing ? 'Closing…' : 'Close case'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Nested /case/:id/submit dialog overlay. */}
      <Outlet />
    </div>
  );
}

export default CaseDetail;
