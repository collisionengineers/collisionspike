
import { useMemo } from 'react';
import { Badge, Button, Link, Menu, MenuDivider, MenuItem, MenuList, MenuPopover, MenuTrigger, Popover, PopoverSurface, PopoverTrigger, Spinner, Tooltip, createTableColumn, mergeClasses, type TableColumnDefinition, type TableColumnSizingOptions } from '@fluentui/react-components';
import { AlertCircle, AlertTriangle, Ban, Briefcase, CheckCircle2, CircleHelp, Eye, FileText, Folder, Link2, Mail, MailCheck, MailQuestion, MoreHorizontal, Hourglass, Paperclip, PencilLine, Receipt, RotateCcw, Tags, XCircle } from 'lucide-react';
import { VrmPlate, useSeverityChipStyles, severityClassName, type ChipSeverity } from '../../shared/ui';
import { formatReceivedCompact } from '../../shared/ui/date-format';
import { whyClassifiedReasons } from './why-classified';
import { CATEGORY_LABEL, SUBTYPE_LABEL } from './inbox-email-type';
import { attentionDetailText, inboxStatus, inboxStatusText } from './inbox-status';
import { suggestedAction } from './inbox-suggested-action';
import type { InboundCategory, InboundEmail, TriageState } from '@cs/domain';

const isHandledState = (state: TriageState): boolean => state === 'actioned' || state === 'dismissed';

/** Per-category icon INSIDE the neutral outline e-mail-type badge (020726 E2 —
 *  icon shape is the discriminator; D3 keeps colour out of the tags). */
const CATEGORY_ICON: Record<InboundCategory, typeof Briefcase> = {
  receiving_work: Briefcase,
  query: MailQuestion,
  website_enquiry: Mail,
  case_update: RotateCcw,
  // Taxonomy v3 (TKT-084) — directions held for a later instruction.
  pre_instruction: Hourglass,
  cancellation: Ban,
  billing: Receipt,
  non_actionable: MailCheck,
  other: CircleHelp,
};

/** True when staff have overridden the classifier (chosen value ≠ suggested value). */
function isOverridden(e: InboundEmail): boolean {
  return (
    (e.suggestedCategory !== undefined && e.suggestedCategory !== e.category) ||
    (e.suggestedSubtype !== undefined && e.suggestedSubtype !== e.subtype)
  );
}

import { useStyles } from './inbox.styles';
function formatReceived(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* Non-link status chips — the shared severity recipes (never colour-only).
   'new' is warning amber (needs sorting, not a blocker — D4); Handled success;
   Dismissed muted; routed-without-case falls back to a neutral info chip. */
const STATUS_CHIP: Record<
  'new' | 'handled' | 'dismissed' | 'linked-unresolved' | 'attention',
  { severity: ChipSeverity; Icon: typeof AlertCircle }
> = {
  new: { severity: 'warning', Icon: AlertCircle },
  handled: { severity: 'success', Icon: CheckCircle2 },
  dismissed: { severity: 'muted', Icon: XCircle },
  'linked-unresolved': { severity: 'info', Icon: Link2 },
  // TKT-119c/034 — a pipeline outcome that needs a person ("Unable to locate" /
  // "No matching case"): critical so it reads as louder than plain "New".
  attention: { severity: 'critical', Icon: AlertCircle },
};

/** Status cell (TKT-054 / 020726 E4): case-linked rows render the Case/PO link
 *  ("Case created / Linked to case · CCPY26050 →" → the case); the rest keep
 *  icon+text chips. */
function StatusCell({ e, onOpenCase }: { e: InboundEmail; onOpenCase: (caseId: string) => void }) {
  const styles = useStyles();
  const chips = useSeverityChipStyles();
  const m = inboxStatus(e);
  if (m.kind === 'case-created' || m.kind === 'linked') {
    return (
      <Link
        as="button"
        className={styles.statusLink}
        title={`Open case${m.casePo ? ` ${m.casePo}` : ''}`}
        onClick={() => onOpenCase(m.caseId)}
      >
        {inboxStatusText(m)} <span aria-hidden="true">→</span>
        <span className="ce-sr-only"> — open case</span>
      </Link>
    );
  }
  const { severity, Icon } = STATUS_CHIP[m.kind];
  const badge = (
    <Badge
      className={chips[severityClassName(severity)]}
      appearance="filled"
      size="small"
      shape="rounded"
      icon={<Icon size={12} strokeWidth={2} />}
      // TKT-119c/034 — the fuller plain-English line on hover for the attention states.
      {...(m.kind === 'attention' ? { title: attentionDetailText(m.reason) } : {})}
    >
      {inboxStatusText(m)}
    </Badge>
  );
  // TKT-093 — a not-yet-linked email with a PENDING attach suggestion shows a "may belong
  // to · <Case/PO>" hint here so the suggestion is visible from the LIST, not only inside
  // the opened email. Opening the row reveals the Attach / Not-a-match card as today.
  if (!e.caseId && e.linkSuggestionCasePo) {
    return (
      <span className={styles.statusCellStack}>
        {badge}
        <span
          className={styles.linkSuggestionHint}
          title={`Suggested: this email may belong to open case ${e.linkSuggestionCasePo} — open it to attach or dismiss`}
        >
          may belong to · {e.linkSuggestionCasePo}
        </span>
      </span>
    );
  }
  return badge;
}


export function useInboxColumns(args: Record<string, any>) {
  const { styles, tt, hoveredRowId, selectedEmail, moveEnabled, navigate, openPeek, selectEmail, setPointerRow, setReclassifyRow, setTriage, fileToOutlook } = args;
  const columnSizing: TableColumnSizingOptions = useMemo(
    () => ({
      from: { minWidth: 110, idealWidth: 140, defaultWidth: 140 },
      subject: { minWidth: 190, idealWidth: 320, defaultWidth: 320 },
      emailType: { minWidth: 128, idealWidth: 150, defaultWidth: 150 },
      vrm: { minWidth: 86, idealWidth: 92, defaultWidth: 92 },
      ref: { minWidth: 86, idealWidth: 100, defaultWidth: 100 },
      received: { minWidth: 74, idealWidth: 90, defaultWidth: 90 },
      suggested: { minWidth: 112, idealWidth: 140, defaultWidth: 140 },
      state: { minWidth: 120, idealWidth: 156, defaultWidth: 156 },
      actions: { minWidth: 100, idealWidth: 116, defaultWidth: 116, padding: 0 },
    }),
    [],
  );

  const columns: TableColumnDefinition<InboundEmail>[] = useMemo(
    () => [
      createTableColumn<InboundEmail>({
        columnId: 'from',
        renderHeaderCell: () => 'From',
        // ONE secondary line; the domain is demoted to the tooltip (IA §2).
        renderCell: (e) => (
          <Tooltip
            content={
              e.senderDomain ? `${e.fromAddress || '—'} · ${e.senderDomain}` : e.fromAddress || '—'
            }
            relationship="description"
          >
            <span className={mergeClasses(tt.cellSecondary, styles.fromLine)}>
              {e.fromAddress || '—'}
            </span>
          </Tooltip>
        ),
      }),
      createTableColumn<InboundEmail>({
        columnId: 'subject',
        renderHeaderCell: () => 'Subject',
        renderCell: (e) => (
          <span className={styles.subjCell}>
            <span className={styles.subjLine}>
              {e.hasAttachments && (
                <Tooltip content="Has attachments" relationship="label">
                  <span className={styles.clip}>
                    <Paperclip size={13} aria-hidden />
                  </span>
                </Tooltip>
              )}
              {/* A linked email's subject opens its Case; an unlinked one opens the
                  stored email body — every subject is a clickable affordance. */}
              <Link
                as="button"
                className={mergeClasses(
                  tt.cellPrimary,
                  styles.subjLink,
                  selectedEmail?.id === e.id && styles.subjLinkSelected,
                )}
                title={`View email · ${e.subject}`}
                onClick={() => selectEmail(e)}
              >
                {e.subject || '(no subject)'}
              </Link>
            </span>
            {e.bodyPreview && (
              <Popover
                openOnHover
                withArrow
                positioning={{ position: 'after', align: 'center', offset: 8 }}
              >
                <PopoverTrigger>
                  <span
                    className={mergeClasses(tt.cellSecondary, styles.preview)}
                    tabIndex={0}
                    aria-label="Preview email text"
                  >
                    {e.bodyPreview}
                  </span>
                </PopoverTrigger>
                <PopoverSurface
                  className={styles.snippetPreviewSurface}
                  aria-label="Email text preview"
                  tabIndex={0}
                >
                  {e.bodyPreview}
                </PopoverSurface>
              </Popover>
            )}
          </span>
        ),
      }),
      createTableColumn<InboundEmail>({
        columnId: 'emailType',
        renderHeaderCell: () => 'E-mail type',
        // TKT-054 / 020726 E2+E3: neutral charcoal outline badge (D3) with a
        // per-category icon as the at-a-glance discriminator; second line only
        // ever the Overridden chip. NO strength/confidence UI (supersedes D16);
        // the why-reasons stay in the tooltip.
        renderCell: (e) => {
          const overridden = isOverridden(e);
          const suggestedText = e.suggestedSubtype
            ? SUBTYPE_LABEL[e.suggestedSubtype]
            : e.suggestedCategory
              ? CATEGORY_LABEL[e.suggestedCategory]
              : CATEGORY_LABEL[e.category];
          // "Why this label?" (rules-engine-v2 Phase 5) — up to 4 plain-English
          // reasons derived from the row's raw signal tokens; [] when there is
          // nothing to explain.
          const whyReasons = whyClassifiedReasons(e.signals);
          const TypeIcon = CATEGORY_ICON[e.category];
          const cell = (
            <div className={styles.classStack}>
              {/* Neutral outline (fork #1 "quiet grids") — the outline Badge
                  default color="brand" renders red, which reads as severity. */}
              <Badge
                appearance="outline"
                color="informative"
                shape="rounded"
                size="small"
                className={styles.subtypeBadge}
                icon={<TypeIcon size={11} strokeWidth={2} aria-hidden />}
              >
                {SUBTYPE_LABEL[e.subtype]}
              </Badge>
              {/* The tooltip hangs on a non-focusable div — mirror its content
                  as real hidden text so SRs get it too (gatekeeper). */}
              {whyReasons.length > 0 && (
                <span className="ce-sr-only">{`${whyReasons.join('. ')}.`}</span>
              )}
              {overridden && (
                <Badge
                  appearance="tint"
                  shape="rounded"
                  size="small"
                  className={styles.overrideChip}
                  icon={<PencilLine size={11} strokeWidth={2} />}
                >
                  Overridden
                  <span className="ce-sr-only">{` (Suggested when it arrived: ${suggestedText})`}</span>
                </Badge>
              )}
            </div>
          );
          return whyReasons.length > 0 ? (
            <Tooltip
              content={
                <div className={styles.whyTooltip}>
                  <ul className={styles.whyList}>
                    {whyReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              }
              relationship="description"
            >
              {cell}
            </Tooltip>
          ) : (
            cell
          );
        },
      }),
      createTableColumn<InboundEmail>({
        columnId: 'vrm',
        renderHeaderCell: () => 'VRM',
        renderCell: (e) =>
          e.bodyVrm ? (
            <VrmPlate vrm={e.bodyVrm} size="small" />
          ) : (
            <span className={mergeClasses(tt.cellMono, styles.muted)}>—</span>
          ),
      }),
      createTableColumn<InboundEmail>({
        columnId: 'ref',
        renderHeaderCell: () => 'Ref',
        // The email's OWN reference (body case-ref, else provider job-ref).
        // The linked case's Case/PO deliberately does NOT render here — it lives
        // in the Status link (020726 E4/E5, no duplication).
        renderCell: (e) => {
          const ref = e.bodyCaseref || e.bodyJobref;
          return ref ? (
            <span className={tt.cellMono}>{ref}</span>
          ) : (
            <span className={mergeClasses(tt.cellMono, styles.muted)}>—</span>
          );
        },
      }),
      createTableColumn<InboundEmail>({
        columnId: 'received',
        renderHeaderCell: () => 'Received',
        // Compact in the cell (spec IA §6); the FULL DD/MM/YYYY HH:mm form is
        // an sr-only text sibling (gatekeeper ruling: no aria-label on a
        // generic span — ARIA naming-prohibited role; real hidden DOM text is
        // what every SR reads). aria-hidden on the compact form kills the
        // duplicate; the tooltip is visual-only.
        renderCell: (e) => {
          const full = formatReceived(e.receivedOn);
          return (
            <Tooltip content={full} relationship="inaccessible">
              <span className={tt.cellSecondary}>
                <span aria-hidden="true">{formatReceivedCompact(e.receivedOn)}</span>
                <span className="ce-sr-only">{full}</span>
              </span>
            </Tooltip>
          );
        },
      }),
      createTableColumn<InboundEmail>({
        columnId: 'suggested',
        renderHeaderCell: () => 'Suggested action',
        // 020726 E6: with the gate ON the button REALLY files the message in the
        // shared mailbox (queued server-side); gate OFF renders the same
        // suggestion as display-only text. queued/moved/failed reflect the row's
        // recorded lifecycle; failed offers a retry while actionable.
        renderCell: (e) => {
          const model = suggestedAction(e, moveEnabled);
          if ((model.kind === 'suggest' || model.kind === 'failed') && model.actionable) {
            return (
              <Button
                appearance="transparent"
                size="small"
                className={mergeClasses(
                  styles.suggestedBtn,
                  model.kind === 'failed' && styles.suggestedFailed,
                )}
                icon={
                  model.kind === 'failed' ? (
                    <AlertTriangle size={13} strokeWidth={2.25} aria-hidden />
                  ) : (
                    <Folder size={13} aria-hidden />
                  )
                }
                title={model.label}
                aria-label={`${model.label} — files this email in the shared mailbox`}
                onClick={() => void fileToOutlook(e)}
              >
                {model.label}
              </Button>
            );
          }
          return (
            <span
              className={mergeClasses(
                tt.cellSecondary,
                styles.suggestedText,
                model.kind === 'failed' && styles.suggestedFailed,
              )}
              title={model.label}
            >
              {model.kind === 'queued' ? (
                <Spinner size="extra-tiny" aria-hidden />
              ) : model.kind === 'moved' ? (
                <CheckCircle2 size={13} strokeWidth={2} aria-hidden />
              ) : model.kind === 'failed' ? (
                <AlertTriangle size={13} strokeWidth={2.25} aria-hidden />
              ) : (
                <Folder size={13} aria-hidden />
              )}
              {model.label}
            </span>
          );
        },
      }),
      createTableColumn<InboundEmail>({
        columnId: 'state',
        renderHeaderCell: () => 'Status',
        renderCell: (e) => <StatusCell e={e} onOpenCase={(id) => navigate(`/case/${id}`)} />,
      }),
      createTableColumn<InboundEmail>({
        columnId: 'actions',
        renderHeaderCell: () => <span className="ce-sr-only">Actions</span>,
        renderCell: (e) => {
          const showQuick = hoveredRowId === e.id || selectedEmail?.id === e.id;
          return (
            <span className={styles.actionsCell}>
              {showQuick && (
                <span className={styles.quickActions}>
                  {e.caseId && (
                    <Tooltip content="Peek case" relationship="label">
                      <Button
                        appearance="subtle"
                        size="small"
                        className={styles.quickActionBtn}
                        icon={<Eye size={16} />}
                        aria-label={`Preview case for “${e.subject || e.fromAddress}”`}
                        data-row-id={e.id}
                        onClick={() => openPeek(e.caseId!)}
                      />
                    </Tooltip>
                  )}
                  {/* "Mark actioned" lives in the overflow menu only — keeping the hover
                      cluster at ≤2 quick actions + the "…" trigger means it always fits the
                      actions column (the "…" was being clipped when a 4th button overflowed
                      a narrowed pane). */}
                  {e.triageState !== 'dismissed' && (
                    <Tooltip content="Dismiss" relationship="label">
                      <Button
                        appearance="subtle"
                        size="small"
                        className={styles.quickActionBtn}
                        icon={<XCircle size={16} />}
                        aria-label={`Dismiss “${e.subject || e.fromAddress}”`}
                        data-row-id={e.id}
                        onClick={() => void setTriage(e, 'dismissed')}
                      />
                    </Tooltip>
                  )}
                </span>
              )}
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button
                    appearance="subtle"
                    size="small"
                    className={styles.quickActionBtn}
                    icon={<MoreHorizontal size={16} />}
                    aria-label={`Actions for “${e.subject || e.fromAddress}”`}
                    data-row-id={e.id}
                  />
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {e.caseId && (
                      <MenuItem icon={<Briefcase size={16} />} onClick={() => navigate(`/case/${e.caseId}`)}>
                        View case
                      </MenuItem>
                    )}
                    {e.caseId && (
                      <MenuItem icon={<Eye size={16} />} onClick={() => openPeek(e.caseId!)}>
                        Peek case
                      </MenuItem>
                    )}
                    <MenuItem icon={<FileText size={16} />} onClick={() => selectEmail(e)}>
                      View email preview
                    </MenuItem>
                    {!e.caseId && (
                      <MenuItem icon={<Mail size={16} />} onClick={() => setPointerRow(e)}>
                        Open in mailbox…
                      </MenuItem>
                    )}
                    <MenuDivider />
                    <MenuItem icon={<Tags size={16} />} onClick={() => setReclassifyRow(e)}>
                      Change e-mail type…
                    </MenuItem>
                    <MenuDivider />
                    {e.triageState !== 'actioned' && (
                      <MenuItem icon={<CheckCircle2 size={16} />} onClick={() => void setTriage(e, 'actioned')}>
                        Mark as actioned
                      </MenuItem>
                    )}
                    {e.triageState !== 'dismissed' && (
                      <MenuItem icon={<XCircle size={16} />} onClick={() => void setTriage(e, 'dismissed')}>
                        Dismiss
                      </MenuItem>
                    )}
                    {isHandledState(e.triageState) && (
                      <MenuItem icon={<RotateCcw size={16} />} onClick={() => void setTriage(e, 'new')}>
                        Reopen
                      </MenuItem>
                    )}
                  </MenuList>
                </MenuPopover>
              </Menu>
            </span>
          );
        },
      }),
    ],
    // styles/navigate/setTriage/fileToOutlook are stable across renders for the
    // grid's purpose; moveEnabled re-renders the suggested-action column when the
    // gate read lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [styles, selectedEmail?.id, hoveredRowId, moveEnabled],
  );
  return { columnSizing, columns };
}
