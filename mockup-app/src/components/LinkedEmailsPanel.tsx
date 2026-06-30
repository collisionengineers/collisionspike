import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Link,
  MessageBar,
  MessageBarBody,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowUpRight, Mail, Paperclip } from 'lucide-react';
import { useInbox, type InboundCategory, type InboundEmail } from '../data';

/* ============================================================
   LinkedEmailsPanel — the inbound emails linked to a case (work-todo-spike:
   ui-changes/clickable-case-and-email, case side).

   Self-contained: it reads the existing inbound-triage feed (useInbox, no new
   API) and shows the rows whose `caseId` matches this case. Each row opens a
   "View email preview" dialog rendering the stored email body, with an "Open in
   Outlook" link when the row carries a web link. Mounted lazily by CaseDetail
   (only when the Emails tab is open) so the feed isn't fetched on every case view.
   ============================================================ */

const CATEGORY_LABEL: Record<InboundCategory, string> = {
  receiving_work: 'New work',
  query: 'Query',
  other: 'Other',
};

/** The stored mailbox web link, when the row carries one (the DTO may not yet —
 *  read it defensively so the Outlook affordance lights up the moment it does). */
function webLinkOf(email: InboundEmail): string | undefined {
  const link = (email as { webLink?: string }).webLink;
  return typeof link === 'string' && link.length > 0 ? link : undefined;
}

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingVerticalS + ' ' + tokens.spacingHorizontalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  rowMeta: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flexGrow: 1 },
  subject: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1, fontWeight: tokens.fontWeightSemibold },
  sub: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  hint: { color: tokens.colorNeutralForeground3 },
  preview: { color: tokens.colorNeutralForeground2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  dialogMeta: { display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: tokens.spacingHorizontalM, rowGap: '2px', fontSize: tokens.fontSizeBase200 },
  metaKey: { color: tokens.colorNeutralForeground3 },
  metaVal: { color: tokens.colorNeutralForeground2 },
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, maxHeight: '60vh', overflowY: 'auto' },
  inlineIconText: { display: 'inline-flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
});

export interface LinkedEmailsPanelProps {
  /** The case whose linked inbound emails to show. */
  caseId: string;
  /**
   * Optional pre-loaded linked emails from the case-detail payload. When present
   * these are used directly; otherwise the inbound feed is filtered by `caseId`.
   */
  emails?: InboundEmail[];
}

/** Linked inbound emails for a case + a "View email preview" dialog. */
export function LinkedEmailsPanel({ caseId, emails }: LinkedEmailsPanelProps) {
  const styles = useStyles();
  // Fall back to the inbound feed only when the case payload didn't carry emails.
  const inbox = useInbox({ view: 'all' });
  const usePayload = emails !== undefined;
  const linked = useMemo(
    () => (usePayload ? emails! : (inbox.data ?? []).filter((e) => e.caseId === caseId)),
    [usePayload, emails, inbox.data, caseId],
  );

  const [open, setOpen] = useState<InboundEmail | null>(null);

  if (!usePayload && inbox.loading && inbox.data === undefined) {
    return <Spinner size="tiny" label="Loading linked emails…" labelPosition="after" />;
  }
  if (!usePayload && inbox.error && inbox.data === undefined) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>Couldn’t load linked emails — try again.</MessageBarBody>
      </MessageBar>
    );
  }
  if (linked.length === 0) {
    return (
      <Caption1 className={styles.hint}>
        No emails are linked to this case yet.
      </Caption1>
    );
  }

  const openWebLink = open ? webLinkOf(open) : undefined;

  return (
    <div className={styles.root}>
      <Caption1 className={styles.hint}>
        Emails received for this case. Open one to read the saved preview.
      </Caption1>
      <div className={styles.list} role="list">
        {linked.map((e) => (
          <div className={styles.row} key={e.id} role="listitem">
            <Mail size={18} aria-hidden />
            <span className={styles.rowMeta}>
              <span className={styles.subject}>{e.subject || '(no subject)'}</span>
              <span className={styles.sub}>
                <Caption1 className={styles.hint}>{e.fromAddress}</Caption1>
                {e.receivedOn && <Caption1 className={styles.hint}>· {e.receivedOn}</Caption1>}
                <Badge appearance="tint" color="informative" size="small" shape="rounded">
                  {CATEGORY_LABEL[e.category]}
                </Badge>
                {e.hasAttachments && (
                  <Caption1 className={styles.hint}>
                    <span className={styles.inlineIconText}>
                      <Paperclip size={12} aria-hidden /> attachment
                    </span>
                  </Caption1>
                )}
              </span>
            </span>
            <Button appearance="secondary" size="small" onClick={() => setOpen(e)}>
              View email preview
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={open !== null} modalType="modal" onOpenChange={(_, d) => !d.open && setOpen(null)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{open?.subject || 'Email'}</DialogTitle>
            <DialogContent className={styles.body}>
              {open && (
                <>
                  <div className={styles.dialogMeta}>
                    <span className={styles.metaKey}>From</span>
                    <span className={styles.metaVal}>{open.fromAddress}</span>
                    {open.receivedOn && (
                      <>
                        <span className={styles.metaKey}>Received</span>
                        <span className={styles.metaVal}>{open.receivedOn}</span>
                      </>
                    )}
                    <span className={styles.metaKey}>Mailbox</span>
                    <span className={styles.metaVal}>{open.sourceMailbox}</span>
                  </div>
                  <Text className={styles.preview}>
                    {open.bodyPreview?.trim()
                      ? open.bodyPreview
                      : 'No message body was stored for this email.'}
                  </Text>
                  <Caption1 className={styles.hint}>
                    This is the saved preview. Use the mailbox reference if you need the original message.
                  </Caption1>
                </>
              )}
            </DialogContent>
            <DialogActions>
              {openWebLink && (
                <Link href={openWebLink} target="_blank" rel="noopener noreferrer">
                  <span className={styles.inlineIconText}>
                    Open in Outlook <ArrowUpRight size={14} />
                  </span>
                </Link>
              )}
              <Button appearance="secondary" onClick={() => setOpen(null)}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

export default LinkedEmailsPanel;
