import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Caption1,
  OverlayDrawer,
  Skeleton,
  SkeletonItem,
  Toast,
  ToastBody,
  ToastTitle,
  makeStyles,
  mergeClasses,
  tokens,
  useToastController,
} from '@fluentui/react-components';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  X,
} from 'lucide-react';
import type { Case } from '@cs/domain';
import { data, dueInfo, useCaseQuery, useLogChase } from '../data';
import { computeReadiness } from './readiness';
import { VrmPlate } from './VrmPlate';
import { StatusBadge } from './StatusBadge';
import { useTableTypography } from './tableStyles';
import { ErrorState } from './AsyncStates';
import { GLOBAL_TOASTER_ID } from './toaster';

/* ============================================================
   CasePeekDrawer — the ?peek=<caseId> quick-peek drawer
   (reforge M-F, spec VISUAL §6 + IA §3).

   NON-MODAL OverlayDrawer, position end, ~440px: header (VRM plate +
   Case/PO + StatusBadge + ‹Prev/Next› + close) → core fields (2-col
   label/value pairs, full-bleed dividers) → FAILING readiness items only
   + "n of m checks pass" → blockers callout → sticky footer where the
   primary "Open case" is the drawer's ONLY red action.

   Keyboard: focus moves to the drawer heading on open (not trapped —
   non-modal); ←/→ page Prev/Next while focus is inside; Esc closes and
   restores focus to the launching row ([data-case-row], nearest
   neighbour if the row is gone). The Esc listener runs in the CAPTURE
   phase and preventDefault()s so the BulkActionBar's clear-selection
   Esc (which skips defaultPrevented events) stays inert while the
   drawer is open — peek > selection priority (spec IA §4).

   The parent screen owns the route param (open = PUSH, close/page =
   REPLACE via screens/peek.ts) and the Prev/Next snapshot.

   KNOWN (logged, accepted): the capture-phase Esc closes the drawer even
   when a Fluent popup INSIDE it is open (compound state — capture runs
   before the popup's own Esc); and Prev/Next buttons that become disabled
   at a snapshot boundary drop focus to the drawer body. Both benign;
   revisit if peek grows menus.
   ============================================================ */

const useStyles = makeStyles({
  drawer: {
    width: '440px',
    minWidth: '400px',
    maxWidth: '480px',
    borderRadius: 0,
    borderLeft: `1px solid ${tokens.colorNeutralStroke1}`,
    // 160ms entrance — fade + 8px slide; neutralised by the global
    // reduced-motion gate in theme.css.
    animationName: {
      from: { opacity: 0, transform: 'translateX(8px)' },
      to: { opacity: 1, transform: 'translateX(0)' },
    },
    animationDuration: '160ms',
    animationTimingFunction: 'ease-out',
  },
  root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },

  /* Header — white, no red chrome (the StatusBadge carries its own semantics). */
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: '16px 20px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: '1px solid #e6e4e1',
    flexShrink: 0,
  },
  headerRow: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, minWidth: 0 },
  headerSpacer: { flexGrow: 1 },
  vehicleHeading: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--ce-ink)',
    lineHeight: 1.15,
    margin: 0,
    outline: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  /* Body — scrollable; 2-col field pairs with full-bleed hairline dividers. */
  body: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px' },
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    columnGap: tokens.spacingHorizontalM,
    alignItems: 'baseline',
    padding: '8px 20px',
    margin: '0 -20px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  fieldValueStack: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },

  section: { marginTop: tokens.spacingVerticalL, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  sectionHead: {
    fontFamily: 'var(--ce-font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: tokens.colorNeutralForeground2,
    margin: 0,
  },
  checksLine: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  iconOk: { color: '#16833b', flexShrink: 0 },
  iconBad: { color: 'var(--ce-red)', flexShrink: 0, marginTop: '1px' },
  readyRow: { display: 'flex', alignItems: 'flex-start', gap: tokens.spacingHorizontalS },
  readyText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  readyLabel: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  readyDetail: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },

  /* Blockers callout — duplicates/conflicts read WARNING post-reforge. */
  callout: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: '2px',
    border: '1px solid var(--ce-warning-line)',
    backgroundColor: 'var(--ce-warning-tint)',
    color: 'var(--ce-warning-ink)',
    fontSize: tokens.fontSizeBase300,
  },
  calloutIcon: { color: 'var(--ce-warning-text)', flexShrink: 0, marginTop: '2px' },

  /* Footer — sticky, quiet ground; "Open case" is the drawer's only red. */
  footer: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    padding: '12px 20px',
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: 'var(--ce-bg-2)',
    flexShrink: 0,
  },

  mutedText: { color: tokens.colorNeutralForeground3 },
  skeletonStack: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

export interface CasePeekDrawerProps {
  /** The peeked case id — null renders nothing (drawer closed). */
  caseId: string | null;
  /** Neighbours in the launch surface's snapshot (null disables the button). */
  prevId: string | null;
  nextId: string | null;
  /** Page to another case (the screen REPLACEs the peek param). */
  onPeek: (id: string) => void;
  /** Close (the screen REPLACEs the param away). Focus restore happens here. */
  onClose: () => void;
  /** Open the full case (the canonical /case/:id — replaces the peek). */
  onOpenCase: (id: string) => void;
}

/** Focus the launching row, or its nearest surviving neighbour. */
function restoreRowFocus(ids: (string | null)[]): void {
  for (const id of ids) {
    if (!id) continue;
    const el = document.querySelector<HTMLElement>(`[data-case-row="${CSS.escape(id)}"]`);
    if (el) {
      el.focus();
      return;
    }
  }
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <div className={styles.fieldRow}>
      <span className="ce-field-label">{label}</span>
      <span className={mergeClasses('ce-field-value', styles.fieldValueStack)}>{children}</span>
    </div>
  );
}

/** The quick-peek case drawer. Renders only while `caseId` is set. */
export function CasePeekDrawer({
  caseId,
  prevId,
  nextId,
  onPeek,
  onClose,
  onOpenCase,
}: CasePeekDrawerProps) {
  const styles = useStyles();
  const tt = useTableTypography();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);
  const open = caseId !== null;

  const caseQuery = useCaseQuery(caseId ?? undefined);
  const c = caseQuery.data;
  const { logChase, saving: chasing } = useLogChase();
  const [holding, setHolding] = useState(false);

  // Blockers: live open-twin count for the duplicate callout.
  const [twinCount, setTwinCount] = useState<number | null>(null);
  useEffect(() => {
    setTwinCount(null);
    if (!c?.vrm?.trim()) return;
    let cancelled = false;
    void data.openVrmTwins(c.vrm, c.id).then(
      (twins) => {
        if (!cancelled) setTwinCount(twins.length);
      },
      () => undefined, // no callout on a failed read — never invent a blocker
    );
    return () => {
      cancelled = true;
    };
  }, [c?.id, c?.vrm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus → drawer heading on OPEN only (paging keeps focus where it is).
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      requestAnimationFrame(() => (headingRef.current ?? rootRef.current)?.focus());
    }
    wasOpen.current = open;
  }, [open, c?.id]);

  // Close + restore focus to the launching row (nearest neighbour if gone).
  const closingIds = useRef<(string | null)[]>([]);
  closingIds.current = [caseId, nextId, prevId];
  const handleClose = () => {
    const ids = [...closingIds.current];
    onClose();
    requestAnimationFrame(() => restoreRowFocus(ids));
  };

  // Esc closes — CAPTURE phase + preventDefault so the BulkActionBar's
  // clear-selection Esc (bubble phase, skips defaultPrevented) stays inert.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // ←/→ page prev/next while focus is inside the drawer.
  const onDrawerKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowLeft' && prevId) {
      e.preventDefault();
      onPeek(prevId);
    }
    if (e.key === 'ArrowRight' && nextId) {
      e.preventDefault();
      onPeek(nextId);
    }
  };

  const toggleHold = async (kase: Case) => {
    const next = !kase.onHold;
    setHolding(true);
    try {
      await data.setOnHold(kase.id, next);
      dispatchToast(
        <Toast>
          <ToastTitle>{next ? 'Put on hold — moved to Held' : 'Released from hold'}</ToastTitle>
        </Toast>,
        { intent: 'success' },
      );
      caseQuery.refetch();
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t update hold — try again</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setHolding(false);
    }
  };

  const logChaseAction = async (kase: Case) => {
    try {
      await logChase(kase.id, { channel: 'email', templateLabel: 'Weekly chase' });
      dispatchToast(
        <Toast>
          <ToastTitle>Chase logged</ToastTitle>
        </Toast>,
        { intent: 'success' },
      );
    } catch (err: unknown) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t log the chase — try again</ToastTitle>
          <ToastBody>{err instanceof Error ? err.message : 'Please try again.'}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    }
  };

  const readiness = c ? computeReadiness(c) : undefined;
  const failing = readiness?.items.filter((i) => !i.ok) ?? [];
  const passing = (readiness?.items.length ?? 0) - failing.length;
  const due = c ? dueInfo(c) : undefined;
  const hasConflict = c?.actionReason === 'conflict';
  const hasDuplicate = (twinCount ?? 0) > 0;

  return (
    <OverlayDrawer
      open={open}
      position="end"
      modalType="non-modal"
      className={styles.drawer}
      onOpenChange={(_e, d) => {
        if (!d.open) handleClose();
      }}
      aria-label="Case preview"
    >
      <div
        className={styles.root}
        ref={rootRef}
        tabIndex={-1}
        onKeyDown={onDrawerKeyDown}
      >
        {/* ---------- header ---------- */}
        <div className={styles.header}>
          <div className={styles.headerRow}>
            {c && <VrmPlate vrm={c.vrm} size="small" />}
            {c &&
              (c.casePo ? (
                <span className={tt.cellMono}>{c.casePo}</span>
              ) : (
                <Caption1 className={styles.mutedText}>Not yet assigned</Caption1>
              ))}
            <span className={styles.headerSpacer} aria-hidden />
            {c && <StatusBadge status={c.status} size="small" />}
            <Button
              appearance="subtle"
              size="small"
              icon={<ChevronLeft size={16} />}
              disabled={!prevId}
              onClick={() => prevId && onPeek(prevId)}
              aria-label="Previous case"
            />
            <Button
              appearance="subtle"
              size="small"
              icon={<ChevronRight size={16} />}
              disabled={!nextId}
              onClick={() => nextId && onPeek(nextId)}
              aria-label="Next case"
            />
            <Button
              appearance="subtle"
              size="small"
              icon={<X size={16} />}
              onClick={handleClose}
              aria-label="Close preview"
            />
          </div>
          <div className={styles.headerRow}>
            <h2 className={styles.vehicleHeading} tabIndex={-1} ref={headingRef}>
              {c ? c.vehicleModel || 'Vehicle TBC' : 'Case preview'}
            </h2>
            {c && <span className={tt.cellSecondary}>{c.provider}</span>}
          </div>
        </div>

        {/* ---------- body ---------- */}
        <div className={styles.body}>
          {caseQuery.loading && !c ? (
            <Skeleton aria-label="Loading case preview">
              <div className={styles.skeletonStack}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <SkeletonItem key={i} style={{ height: '20px' }} />
                ))}
              </div>
            </Skeleton>
          ) : caseQuery.error && !c ? (
            <ErrorState
              error={caseQuery.error}
              onRetry={caseQuery.refetch}
              title="Couldn’t load this case"
            />
          ) : !c ? (
            <ErrorState title="This case isn’t available any more" onRetry={caseQuery.refetch} />
          ) : (
            <>
              <FieldRow label="Claimant">{c.evaFields.claimantName.value || '—'}</FieldRow>
              <FieldRow label="Vehicle">{c.vehicleModel || 'Vehicle TBC'}</FieldRow>
              <FieldRow label="Provider">
                <span>{c.provider}</span>
                {c.providerCode && <Caption1 className={styles.mutedText}>{c.providerCode}</Caption1>}
              </FieldRow>
              <FieldRow label="Received">
                {/* Compact in peek meta (IA §6). createdAt is DATE-ONLY
                    (DD/MM/YYYY contract) — formatReceivedCompact's time-
                    bearing branches would fabricate "00:00", so the compact
                    form is the §6 date idiom DD/MM/YY; the full date is
                    sr-only text. */}
                <span aria-hidden="true">
                  {c.createdAt?.length === 10
                    ? `${c.createdAt.slice(0, 6)}${c.createdAt.slice(8)}`
                    : c.createdAt || '—'}
                  {' · '}
                  {c.ageDays === 0 ? 'today' : `${c.ageDays}d ago`}
                </span>
                <span className="ce-sr-only">
                  {c.createdAt || '—'},{' '}
                  {c.ageDays === 0 ? 'today' : `${c.ageDays} day${c.ageDays === 1 ? '' : 's'} ago`}
                </span>
              </FieldRow>
              <FieldRow label="Due">{due?.dueText ?? 'No due date'}</FieldRow>
              <FieldRow label="Channel">
                <span>
                  {c.channel.kind === 'whatsapp' ? 'WhatsApp' : 'Email'}
                  {c.channel.mode === 'manual' ? ' (manual)' : ''}
                </span>
                {/* The seam sometimes carries an internal mailbox ID here, not
                    an address — internal ids never render (CONTEXT.md). Show
                    the line only when it reads as an address; the channel word
                    alone is fine otherwise. */}
                {c.channel.sourceMailbox?.includes('@') && (
                  <Caption1 className={styles.mutedText}>{c.channel.sourceMailbox}</Caption1>
                )}
              </FieldRow>

              {/* Readiness — FAILING items only + the honest pass count. */}
              <div className={styles.section}>
                <h3 className={styles.sectionHead}>Readiness</h3>
                <span className={styles.checksLine}>
                  {failing.length === 0 ? (
                    <Check size={14} strokeWidth={2.5} className={styles.iconOk} aria-hidden />
                  ) : (
                    <AlertTriangle size={14} strokeWidth={2.25} className={styles.iconBad} aria-hidden />
                  )}
                  <Caption1>
                    {passing} of {readiness?.items.length ?? 0} checks pass
                  </Caption1>
                </span>
                {/* The ✗ icons are aria-hidden — say it in text so SRs know
                    the listed items are the FAILURES, not a summary. */}
                {failing.length > 0 && <span className="ce-sr-only">Failing: </span>}
                {failing.map((item) => (
                  <div className={styles.readyRow} key={item.id}>
                    <X size={14} strokeWidth={2.5} className={styles.iconBad} aria-hidden />
                    <span className={styles.readyText}>
                      <span className={styles.readyLabel}>{item.label}</span>
                      {item.detail && <span className={styles.readyDetail}>{item.detail}</span>}
                    </span>
                  </div>
                ))}
              </div>

              {/* Blockers callout — duplicate (live twin count) / conflict. */}
              {(hasDuplicate || hasConflict) && (
                <div className={styles.section}>
                  <div className={styles.callout} role="note">
                    <AlertTriangle size={16} strokeWidth={2.25} className={styles.calloutIcon} aria-hidden />
                    <span>
                      {hasDuplicate &&
                        `Possible duplicate — ${twinCount} open for this VRM. `}
                      {hasConflict && 'Resolve claimant-name conflict before submit.'}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ---------- footer ---------- */}
        <div className={styles.footer}>
          <Button
            appearance="primary"
            disabled={!c}
            onClick={() => c && onOpenCase(c.id)}
          >
            Open case
          </Button>
          {c && (
            <Button
              appearance="subtle"
              icon={c.onHold ? <Play size={16} /> : <Pause size={16} />}
              disabled={holding}
              onClick={() => void toggleHold(c)}
            >
              {c.onHold ? 'Release' : 'Hold'}
            </Button>
          )}
          {c && (
            <Button appearance="subtle" disabled={chasing} onClick={() => void logChaseAction(c)}>
              Log chase
            </Button>
          )}
        </div>
      </div>
    </OverlayDrawer>
  );
}

export default CasePeekDrawer;
