import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Caption1,
  MessageBar,
  MessageBarBody,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Mail, Paperclip } from 'lucide-react';
import { useInbox, type InboundCategory, type InboundEmail } from '../../data';
import { OutlookMessageAction } from './OutlookMessageAction';

/* ============================================================
   LinkedEmailsPanel — the inbound emails linked to a case (work-todo-spike:
   ui-changes/clickable-case-and-email, case side).

   Accordion list: click a subject to expand the saved preview inline (no modal).
   ============================================================ */

const CATEGORY_LABEL: Record<InboundCategory, string> = {
  receiving_work: 'New work',
  query: 'Query',
  website_enquiry: 'Website enquiry',
  case_update: 'Case update',
  pre_instruction: 'Pre-instruction',
  cancellation: 'Cancellation',
  billing: 'Billing',
  non_actionable: 'No action',
  other: 'Other',
};

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  accordion: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  acItem: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  subjectLink: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    textAlign: 'left',
    // Quiet hover — ink + underline, never red (reforge 2026-07-01).
    ':hover': {
      color: 'var(--ce-ink)',
      textDecoration: 'underline',
      textUnderlineOffset: '2px',
    },
  },
  sub: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  hint: { color: tokens.colorNeutralForeground3 },
  preview: {
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '240px',
    overflowY: 'auto',
    padding: tokens.spacingVerticalM,
    borderRadius: '2px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    lineHeight: 1.6,
    ':focus-visible': {
      outline: '2px solid var(--ce-red)',
      outlineOffset: '2px',
    },
  },
  panelBody: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  dialogMeta: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: tokens.spacingHorizontalM,
    rowGap: '2px',
    fontSize: tokens.fontSizeBase200,
  },
  metaKey: { color: tokens.colorNeutralForeground3 },
  metaVal: { color: tokens.colorNeutralForeground2 },
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

/** Linked inbound emails for a case — accordion inline previews. */
export function LinkedEmailsPanel({ caseId, emails }: LinkedEmailsPanelProps) {
  const styles = useStyles();
  // Case-scoped slice: the server filters by case_id AND keeps retro reconstruction
  // anchor rows, which the un-scoped triage list deliberately hides (TKT-233).
  const inbox = useInbox({ view: 'all', caseId });
  const usePayload = emails !== undefined;
  const linked = useMemo(
    () => (usePayload ? emails! : (inbox.data ?? []).filter((e) => e.caseId === caseId)),
    [usePayload, emails, inbox.data, caseId],
  );

  const [openItems, setOpenItems] = useState<string[]>([]);

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

  return (
    <div className={styles.root}>
      <Caption1 className={styles.hint}>
        Emails received for this case. Open one to read the saved preview.
      </Caption1>
      <Accordion
        collapsible
        multiple
        className={styles.accordion}
        openItems={openItems}
        onToggle={(_e, data) => setOpenItems(data.openItems as string[])}
      >
        {linked.map((e) => {
          return (
            <AccordionItem value={e.id} key={e.id} className={styles.acItem}>
              <AccordionHeader expandIconPosition="end" icon={<Mail size={18} />}>
                <span className={styles.subjectLink}>{e.subject || '(no subject)'}</span>
              </AccordionHeader>
              <AccordionPanel>
                <div className={styles.panelBody}>
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

                  <div className={styles.dialogMeta}>
                    <span className={styles.metaKey}>Mailbox</span>
                    <span className={styles.metaVal}>{e.sourceMailbox}</span>
                    {e.receivedOn && (
                      <>
                        <span className={styles.metaKey}>Received</span>
                        <span className={styles.metaVal}>{e.receivedOn}</span>
                      </>
                    )}
                  </div>

                  <div
                    className={styles.preview}
                    tabIndex={0}
                    role="region"
                    aria-label="Email body preview"
                  >
                    {e.bodyPreview?.trim()
                      ? e.bodyPreview
                      : 'No message body was stored for this email.'}
                  </div>

                  <Caption1 className={styles.hint}>
                    This saved preview stays available here.
                  </Caption1>

                  <OutlookMessageAction email={e} />
                </div>
              </AccordionPanel>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

export default LinkedEmailsPanel;
