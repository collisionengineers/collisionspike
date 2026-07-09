import { Badge, type BadgeProps } from '@fluentui/react-components';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  FileWarning,
  FolderClosed,
  ImageOff,
  Link2,
  Send,
  Archive,
  type LucideIcon,
} from 'lucide-react';
import type { CaseStatus } from '@cs/domain';
import { severityClassName, useSeverityChipStyles, type ChipSeverity } from './severityStyles';

/* ============================================================
   StatusBadge — severity ramp, never colour-only.

   Colours come from the shared severity chip recipes (severityStyles.ts),
   keyed on the semantic triads in theme.css (reforge 2026-07-01).

   Severities, each ALWAYS paired with a Lucide icon:
     - blocker   → critical: --ce-critical-ink fill + white text at
                   semibold to clear AA on the badge fill.
     - attention → warning: amber fill, amber-ink text.
     - info      → neutral charcoal outline, no fill (fork #1: grids stay
                   quiet — slate is for callouts only).
     - done      → success tint idiom: --ce-success-tint fill, --ce-success-ink
                   text + icon, 1px --ce-success-line border (terminal,
                   windowed states).
     - muted     → low-key grey outline (the terminal 'removed' soft-delete — a
                   case that is out of the workflow, never an action item).
   ============================================================ */

type Severity = 'blocker' | 'attention' | 'info' | 'done' | 'muted';

interface StatusStyle {
  label: string;
  severity: Severity;
  icon: LucideIcon;
}

const STATUS_STYLES: Record<CaseStatus, StatusStyle> = {
  new_email: { label: 'New email', severity: 'info', icon: Circle },
  ingested: { label: 'Logged', severity: 'info', icon: Clock },
  needs_review: { label: 'Needs review', severity: 'attention', icon: AlertTriangle },
  missing_required_fields: { label: 'Missing fields', severity: 'blocker', icon: FileWarning },
  missing_images: { label: 'Missing images', severity: 'blocker', icon: ImageOff },
  duplicate_risk: { label: 'Duplicate risk', severity: 'blocker', icon: Copy },
  linked_to_instruction: { label: 'Linked to instruction', severity: 'info', icon: Link2 },
  ready_for_eva: { label: 'Ready for EVA', severity: 'done', icon: CheckCircle2 },
  eva_submitted: { label: 'EVA submitted', severity: 'done', icon: Send },
  box_synced: { label: 'Archived', severity: 'done', icon: Archive },
  error: { label: 'Error', severity: 'blocker', icon: AlertOctagon },
  // Terminal CLOSE (TKT-010 re-scope 2026-07-08): the case left the work queues;
  // nothing is deleted — details kept for the record. The stored status name
  // stays 'removed'; the person-facing word is "Closed". A muted chip — out of
  // the workflow, never a work item, never red/amber.
  removed: { label: 'Closed', severity: 'muted', icon: FolderClosed },
};

/* StatusBadge severity → shared chip-recipe severity (severityStyles.ts). */
const SEVERITY_CHIP: Record<Severity, ChipSeverity> = {
  blocker: 'critical',
  attention: 'warning',
  info: 'info',
  done: 'success',
  muted: 'muted',
};

export interface StatusBadgeProps {
  status: CaseStatus;
  /** Badge size (default 'medium'). */
  size?: BadgeProps['size'];
}

/** Renders a Case status as an icon + label severity Badge (never colour-only). */
export function StatusBadge({ status, size = 'medium' }: StatusBadgeProps) {
  const chips = useSeverityChipStyles();
  const s = STATUS_STYLES[status];
  const Icon = s.icon;
  const iconSize = size === 'small' ? 12 : 14;

  return (
    <Badge
      className={chips[severityClassName(SEVERITY_CHIP[s.severity])]}
      appearance="filled"
      size={size}
      shape="rounded"
      icon={<Icon size={iconSize} strokeWidth={2} />}
    >
      {s.label}
    </Badge>
  );
}

/** Exposed for callers that want the label string without rendering. */
export function statusLabel(status: CaseStatus): string {
  return STATUS_STYLES[status].label;
}

/** Severity of a status — for callers wanting to colour rows/icons consistently. */
export function statusSeverity(status: CaseStatus): Severity {
  return STATUS_STYLES[status].severity;
}
