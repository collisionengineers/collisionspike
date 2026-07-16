import type { ReactNode } from 'react';
import {
  Spinner,
  Text,
  Caption1,
  Button,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AlertOctagon, Inbox, RefreshCw } from 'lucide-react';

/* ============================================================
   AsyncStates — the shared loading / empty / error presentations
   the four screens render around the data-seam fetch hooks
   (useDashboard / useQueueQuery / useCaseQuery / useImages /
   useProviders). One brand-consistent set so every fetch boundary
   looks the same.

   - LoadingState  : centred Fluent Spinner + a quiet label.
   - EmptyState    : dashed panel with an Inbox glyph + copy (mirrors
                     the existing Dashboard/CaseList empty look).
   - ErrorState    : MessageBar-toned panel with a Retry button wired
                     to the hook's `refetch`.
   - QueryBoundary : convenience switch over a QueryState<T>.

   Brand: the only red is `var(--ce-red)` (via the error accent);
   never the print brand red.
   ============================================================ */

const useStyles = makeStyles({
  centre: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
    textAlign: 'center',
  },
  loadingLabel: { color: tokens.colorNeutralForeground3 },

  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
    color: tokens.colorNeutralForeground3,
    textAlign: 'center',
    borderRadius: '2px',
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
  },
  emptyAction: { marginTop: tokens.spacingVerticalS },

  error: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalL}`,
    textAlign: 'center',
    borderRadius: '2px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: '3px solid var(--ce-red)',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  errorIcon: { color: 'var(--ce-red)' },
  errorTitle: { color: 'var(--ce-ink)', fontWeight: tokens.fontWeightSemibold },
  errorDetail: { color: tokens.colorNeutralForeground3, maxWidth: '52ch' },
});

/** Centred spinner shown while a seam fetch is in flight. */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const styles = useStyles();
  return (
    <div className={styles.centre} role="status" aria-live="polite">
      <Spinner size="medium" label={label} labelPosition="below" />
    </div>
  );
}

/** Dashed empty panel — no rows came back (not an error). `action` is the ONE
 *  priority-ordered quick action per empty state (spec IA §5) — pass a Fluent
 *  Button/Link (they inherit the CE focus ring); never more than one. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <div className={styles.empty}>
      {icon ?? <Inbox size={32} strokeWidth={1.5} aria-hidden />}
      <Text>{title}</Text>
      {hint && <Caption1>{hint}</Caption1>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

/** Error panel with a Retry affordance wired to the hook's refetch. */
export function ErrorState({
  error,
  onRetry,
  title = 'Couldn’t load this data',
}: {
  error?: Error;
  onRetry?: () => void;
  title?: string;
}) {
  const styles = useStyles();
  return (
    <div className={styles.error} role="alert">
      <AlertOctagon size={28} strokeWidth={1.75} className={styles.errorIcon} aria-hidden />
      <Text className={styles.errorTitle}>{title}</Text>
      {error?.message && <Caption1 className={styles.errorDetail}>{error.message}</Caption1>}
      {onRetry && (
        <Button appearance="secondary" icon={<RefreshCw size={16} />} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/** The shape every seam query hook returns (mirrors data/hooks QueryState). */
export interface QueryLike<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  refetch: () => void;
}

export interface QueryBoundaryProps<T> {
  /** The hook result to switch over. */
  query: QueryLike<T>;
  /** Render the loaded data. */
  children: (data: T) => ReactNode;
  /** Optional custom loading node. */
  loading?: ReactNode;
  /** Optional custom error node. */
  error?: ReactNode;
  /** Treat this loaded value as "empty" and render `empty` instead of children. */
  isEmpty?: (data: T) => boolean;
  /** Optional empty node (when `isEmpty` returns true). */
  empty?: ReactNode;
  loadingLabel?: string;
}

/**
 * Convenience switch over a QueryState<T>: spinner while loading, error panel
 * (with retry) on failure, optional empty node, else the loaded children. The
 * A synchronous source can render immediately; an asynchronous source shows the
 * spinner while its request is in progress.
 */
export function QueryBoundary<T>({
  query,
  children,
  loading,
  error,
  isEmpty,
  empty,
  loadingLabel,
}: QueryBoundaryProps<T>) {
  if (query.loading && query.data === undefined) {
    return <>{loading ?? <LoadingState label={loadingLabel} />}</>;
  }
  if (query.error && query.data === undefined) {
    return <>{error ?? <ErrorState error={query.error} onRetry={query.refetch} />}</>;
  }
  const value = query.data as T;
  if (isEmpty && empty !== undefined && isEmpty(value)) {
    return <>{empty}</>;
  }
  return <>{children(value)}</>;
}
