import { Badge, makeStyles, mergeClasses, tokens, type BadgeProps } from '@fluentui/react-components';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  FileWarning,
  ImageOff,
  Link2,
  Send,
  Archive,
  type LucideIcon,
} from 'lucide-react';
import type { CaseStatus } from '../mock';

/* ============================================================
   StatusBadge — severity ramp, never colour-only.

   Three severities, each ALWAYS paired with a Lucide icon:
     - blocker   → CE red (#db0816). White-on-red text uses #8f1422 (--ce-red-dark)
                   at semibold to clear AA on the badge fill.
     - attention → amber, charcoal text.
     - info      → charcoal outline (no fill).
     - done      → success green (terminal, windowed states).
   ============================================================ */

type Severity = 'blocker' | 'attention' | 'info' | 'done';

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
};

const useStyles = makeStyles({
  base: { fontWeight: tokens.fontWeightSemibold },
  // Blocker: solid CE-red-dark fill (#8f1422) + white text → AA-safe.
  blocker: {
    backgroundColor: 'var(--ce-red-dark)',
    color: '#ffffff',
    border: '1px solid var(--ce-red-dark)',
  },
  // Attention: amber fill, charcoal text.
  attention: {
    backgroundColor: '#f5c244',
    color: '#3a2e08',
    border: '1px solid #e0a92a',
  },
  // Info: charcoal outline, no fill.
  info: {
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
});

const SEVERITY_CLASS: Record<Severity, keyof ReturnType<typeof useStyles> | undefined> = {
  blocker: 'blocker',
  attention: 'attention',
  info: 'info',
  done: undefined, // uses Fluent success color
};

export interface StatusBadgeProps {
  status: CaseStatus;
  /** Badge size (default 'medium'). */
  size?: BadgeProps['size'];
}

/** Renders a Case status as an icon + label severity Badge (never colour-only). */
export function StatusBadge({ status, size = 'medium' }: StatusBadgeProps) {
  const styles = useStyles();
  const s = STATUS_STYLES[status];
  const Icon = s.icon;
  const iconSize = size === 'small' ? 12 : 14;
  const cls = SEVERITY_CLASS[s.severity];

  if (s.severity === 'done') {
    return (
      <Badge
        className={styles.base}
        appearance="filled"
        color="success"
        size={size}
        shape="rounded"
        icon={<Icon size={iconSize} strokeWidth={2} />}
      >
        {s.label}
      </Badge>
    );
  }

  return (
    <Badge
      className={mergeClasses(styles.base, cls && styles[cls])}
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
export function statusSeverity(status: CaseStatus): 'blocker' | 'attention' | 'info' | 'done' {
  return STATUS_STYLES[status].severity;
}
