
import { useEffect, useState } from 'react';
import { Badge, Button, Caption1, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, Radio, RadioGroup, Spinner, Text, Textarea, Toast, ToastBody, ToastTitle, useToastController } from '@fluentui/react-components';
import { Briefcase, CheckCircle2, Copy, Folder, Link2, Tags, Unlink, X, XCircle } from 'lucide-react';
import { OutlookMessageAction } from '../../shared/ui';
import { appliedEmailType, caseLinkHeadline, cancellationHeadline, pendingRefGateSuggestion, pendingTriageCategorySuggestion, refGateValue, triageCategoryHeadline, triageCategoryLabel, CASE_LINK_SUGGESTION_TYPE, CANCELLATION_SUGGESTION_TYPE } from './inbox-suggestions';
import { whyClassifiedReasons } from './why-classified';
import { CATEGORY_LABEL, SUBTYPE_LABEL } from './inbox-email-type';
import { attentionDetailText } from './inbox-status';
import { suggestedFolder } from './inbox-suggested-action';
import { data, useInboundSuggestions, useReviewAiSuggestion, useDetachInbound } from '../../data';
import type { AiSuggestion, InboundCategory, InboundEmail, InboundSubtype, TriageState } from '@cs/domain';
import { useStyles } from './inbox.styles';

const RECLASSIFY_TAGS = ['Inspection', 'New client work', 'Audit', 'Diminution', 'Query'] as const;
type ReclassifyTag = (typeof RECLASSIFY_TAGS)[number];

/** Best-effort current tag from the chosen subtype (prefills the override radio). */
function subtypeToTag(subtype: InboundSubtype): ReclassifyTag | undefined {
  switch (subtype) {
    case 'existing_provider_audit':
      return 'Audit';
    case 'existing_provider_diminution':
      return 'Diminution';
    case 'query_existing_work':
    case 'query_new_enquiry':
      return 'Query';
    case 'existing_provider_instruction':
      return 'Inspection';
    case 'new_client_work':
      return 'New client work';
    default:
      return undefined;
  }
}

/** True when staff have overridden the classifier (chosen value ≠ suggested value). */
function isOverridden(e: InboundEmail): boolean {
  return (
    (e.suggestedCategory !== undefined && e.suggestedCategory !== e.category) ||
    (e.suggestedSubtype !== undefined && e.suggestedSubtype !== e.subtype)
  );
}

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
export function EmailPreviewPanel({
  row,
  onClose,
  onOpenCase,
  onCopyReference,
  onTriage,
  onReclassify,
  onCaseLinkChanged,
  onEmailTypeChanged,
  dispatchToast,
}: {
  row: InboundEmail;
  onClose: () => void;
  onOpenCase: (caseId: string) => void;
  onCopyReference: (row: InboundEmail) => void;
  onTriage: (next: TriageState) => void;
  onReclassify: () => void;
  /** A suggestion accept just linked this email, or a detach just unlinked it —
   *  lets the sidebar (and the grid, via the parent's own refresh) show the new
   *  caseId without waiting on a full refetch. */
  onCaseLinkChanged: (emailId: string, caseId: string | undefined) => void;
  /** An accepted type suggestion (TKT-137) may have relabelled this email — patch
   *  the sidebar's row in place when the server applied the pair (`applied` set),
   *  and refresh the grid either way so the E-mail type cell agrees. */
  onEmailTypeChanged: (
    emailId: string,
    applied: { category: InboundCategory; subtype: InboundSubtype } | undefined,
  ) => void;
  dispatchToast: ReturnType<typeof useToastController>['dispatchToast'];
}) {
  const styles = useStyles();
  const fromInitial = (row.fromAddress?.[0] ?? '?').toUpperCase();
  const overridden = isOverridden(row);
  const suggestedText = row.suggestedSubtype
    ? SUBTYPE_LABEL[row.suggestedSubtype]
    : row.suggestedCategory
      ? CATEGORY_LABEL[row.suggestedCategory]
      : CATEGORY_LABEL[row.category];
  // "Why this label?" (rules-engine-v2 Phase 5) — same mapping as the grid
  // cell's tooltip, rendered here as a compact caption list instead.
  const whyReasons = whyClassifiedReasons(row.signals);

  /* ----- Suggested-match banner (rules-engine-v2 Phase 2 ref-gate) -----
     Pending case_link / cancellation suggestions for THIS email — suggest-first;
     staff accept/reject (review 010726 D14/D15/D16). Honest-empty on a failed read
     (safe()-wrapped): the banner just doesn't render. Reset when the previewed
     email changes so a stale spinner/dialog never carries over to the next row. */
  const suggestionsQuery = useInboundSuggestions(row.id);
  const suggestions: AiSuggestion[] = suggestionsQuery.data ?? [];
  const caseLinkSuggestion = pendingRefGateSuggestion(suggestions, CASE_LINK_SUGGESTION_TYPE);
  const cancellationSuggestion = pendingRefGateSuggestion(suggestions, CANCELLATION_SUGGESTION_TYPE);
  const caseLinkTargetId = caseLinkSuggestion && refGateValue(caseLinkSuggestion).targetCaseId;
  const cancellationTargetId = cancellationSuggestion && refGateValue(cancellationSuggestion).targetCaseId;
  // AI email-identification verdict (TKT-137) — a pending triage_category suggestion
  // proposes a TYPE for this email. UNCASED rows only (the ticket's target): a linked
  // row's type is anchored to its case and staff relabel it via Reclassify instead.
  const triageCategorySuggestion = !row.caseId ? pendingTriageCategorySuggestion(suggestions) : undefined;
  const { review, saving: reviewSaving } = useReviewAiSuggestion();
  const [reviewingId, setReviewingId] = useState<string | undefined>(undefined);
  const { detach, detaching } = useDetachInbound();
  const [detachConfirmOpen, setDetachConfirmOpen] = useState(false);

  useEffect(() => {
    setReviewingId(undefined);
    setDetachConfirmOpen(false);
  }, [row.id]);

  const onAcceptCaseLink = async () => {
    if (!caseLinkSuggestion || !caseLinkTargetId) return;
    setReviewingId(caseLinkSuggestion.id);
    try {
      await review(caseLinkSuggestion.id, { decision: 'accepted' });
      suggestionsQuery.refetch();
      onCaseLinkChanged(row.id, caseLinkTargetId);
      const { casePo } = refGateValue(caseLinkSuggestion);
      dispatchToast(
        <Toast>
          <ToastTitle>{casePo ? `Attached to ${casePo}` : 'Attached to the case'}</ToastTitle>
          <ToastBody>{row.subject}</ToastBody>
        </Toast>,
        { intent: 'success' },
      );
    } catch (err) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t attach this email. Please try again.</ToastTitle>
          <ToastBody>{err instanceof Error ? err.message : 'Please try again.'}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setReviewingId(undefined);
    }
  };

  const onRejectCaseLink = async () => {
    if (!caseLinkSuggestion) return;
    setReviewingId(caseLinkSuggestion.id);
    try {
      await review(caseLinkSuggestion.id, { decision: 'rejected' });
      suggestionsQuery.refetch();
      dispatchToast(
        <Toast>
          <ToastTitle>Marked “Not a match”</ToastTitle>
        </Toast>,
        { intent: 'success' },
      );
    } catch (err) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t save that. Please try again.</ToastTitle>
          <ToastBody>{err instanceof Error ? err.message : 'Please try again.'}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setReviewingId(undefined);
    }
  };

  /* ----- AI-suggested e-mail type (TKT-137) — accept applies via the audited
     review seam (promoteAcceptedSuggestion's triage_category branch); ignore
     dismisses. Suggest-only: nothing changes until a person clicks. ----- */
  const onAcceptTriageCategory = async () => {
    if (!triageCategorySuggestion) return;
    const s = triageCategorySuggestion;
    setReviewingId(s.id);
    try {
      const result = await review(s.id, { decision: 'accepted' });
      suggestionsQuery.refetch();
      // Patch the sidebar's row + refresh the grid — but only claim the new type
      // when the server actually applied it (it never overwrites a decision a
      // person already made by hand; `promoted` reports which happened).
      onEmailTypeChanged(row.id, result.promoted ? appliedEmailType(s) : undefined);
      if (result.promoted) {
        dispatchToast(
          <Toast>
            <ToastTitle>Filed as “{triageCategoryLabel(s) ?? 'the suggested type'}”</ToastTitle>
            <ToastBody>{row.subject}</ToastBody>
          </Toast>,
          { intent: 'success' },
        );
      } else {
        dispatchToast(
          <Toast>
            <ToastTitle>Suggestion recorded</ToastTitle>
            <ToastBody>This email keeps its current type — a choice made by a person stays.</ToastBody>
          </Toast>,
          { intent: 'info' },
        );
      }
    } catch (err) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t save that. Please try again.</ToastTitle>
          <ToastBody>{err instanceof Error ? err.message : 'Please try again.'}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setReviewingId(undefined);
    }
  };

  const onIgnoreTriageCategory = async () => {
    if (!triageCategorySuggestion) return;
    setReviewingId(triageCategorySuggestion.id);
    try {
      await review(triageCategorySuggestion.id, { decision: 'rejected' });
      suggestionsQuery.refetch();
      dispatchToast(
        <Toast>
          <ToastTitle>Suggestion set aside</ToastTitle>
        </Toast>,
        { intent: 'info' },
      );
    } catch (err) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t save that. Please try again.</ToastTitle>
          <ToastBody>{err instanceof Error ? err.message : 'Please try again.'}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setReviewingId(undefined);
    }
  };

  /* ----- Detach (unlink) — preview panel only, never the grid row ----- */
  const doDetach = async () => {
    try {
      await detach(row.id);
      setDetachConfirmOpen(false);
      onCaseLinkChanged(row.id, undefined);
      dispatchToast(
        <Toast>
          <ToastTitle>Unlinked from the case</ToastTitle>
          <ToastBody>{row.subject}</ToastBody>
        </Toast>,
        { intent: 'success' },
      );
    } catch (err) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t unlink this email. Please try again.</ToastTitle>
          <ToastBody>{err instanceof Error ? err.message : 'Please try again.'}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    }
  };

  return (
    <aside className={styles.previewSidebar} aria-label="Email preview">
      <div className={styles.previewHeader}>
        <span className={styles.previewTitle}>{row.subject || '(no subject)'}</span>
        <Button
          appearance="subtle"
          size="small"
          className={styles.quickActionBtn}
          icon={<X size={16} />}
          aria-label="Close email preview"
          onClick={onClose}
        />
      </div>

      <div className={styles.previewBody}>
        <div className={styles.fromRow}>
          <span className={styles.avatarCircle} aria-hidden>
            {fromInitial}
          </span>
          <div>
            <Text weight="semibold">{row.fromAddress || '—'}</Text>
            {row.senderDomain && <Caption1 className={styles.muted}>{row.senderDomain}</Caption1>}
            <Caption1 className={styles.muted}>
              Received {formatReceived(row.receivedOn)} · {row.sourceMailbox}
            </Caption1>
          </div>
        </div>

        {/* TKT-119c/034 — the terminal attention states get a visible home in the
            preview too (the grid chip carries the short label; this is the fuller
            plain-English line). Suppressed once the email is linked to a case. */}
        {!row.caseId && row.attentionReason && (
          <MessageBar intent="error">
            <MessageBarBody>
              <MessageBarTitle>
                {row.attentionReason === 'unable_to_locate' ? 'Unable to locate' : 'No matching case'}
              </MessageBarTitle>
              {attentionDetailText(row.attentionReason)}
            </MessageBarBody>
          </MessageBar>
        )}

        {/* Suggested-match banners — amber attention idiom (D4: amber, never red),
            passive until acted on. At most one of each ever shows (both are keyed
            off the FIRST pending suggestion of their type). */}
        {caseLinkSuggestion && caseLinkTargetId && (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>{caseLinkHeadline(caseLinkSuggestion)}</MessageBarTitle>
              {caseLinkSuggestion.rationale}
            </MessageBarBody>
            <MessageBarActions>
              <Button
                appearance="primary"
                size="small"
                icon={
                  reviewingId === caseLinkSuggestion.id && reviewSaving ? (
                    <Spinner size="tiny" />
                  ) : (
                    <Link2 size={14} />
                  )
                }
                disabled={reviewingId === caseLinkSuggestion.id && reviewSaving}
                onClick={() => void onAcceptCaseLink()}
              >
                Attach to case
              </Button>
              <Button
                appearance="secondary"
                size="small"
                icon={<X size={14} />}
                disabled={reviewingId === caseLinkSuggestion.id && reviewSaving}
                onClick={() => void onRejectCaseLink()}
              >
                Not a match
              </Button>
            </MessageBarActions>
          </MessageBar>
        )}

        {cancellationSuggestion && cancellationTargetId && (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>{cancellationHeadline(cancellationSuggestion)}</MessageBarTitle>
              {cancellationSuggestion.rationale}
            </MessageBarBody>
            <MessageBarActions>
              <Button
                appearance="primary"
                size="small"
                icon={<Briefcase size={14} />}
                onClick={() => onOpenCase(cancellationTargetId)}
              >
                Open case
              </Button>
            </MessageBarActions>
          </MessageBar>
        )}

        {/* AI email-identification verdict (TKT-137) — info, not warning: a
            suggestion, nothing is wrong with the row. Plain handler English
            only; suggest-only until a person clicks. */}
        {triageCategorySuggestion && (
          <MessageBar intent="info">
            <MessageBarBody>
              <MessageBarTitle>{triageCategoryHeadline(triageCategorySuggestion)}</MessageBarTitle>
              {triageCategorySuggestion.rationale}
            </MessageBarBody>
            <MessageBarActions>
              <Button
                appearance="primary"
                size="small"
                icon={
                  reviewingId === triageCategorySuggestion.id && reviewSaving ? (
                    <Spinner size="tiny" />
                  ) : (
                    <CheckCircle2 size={14} />
                  )
                }
                disabled={reviewingId === triageCategorySuggestion.id && reviewSaving}
                onClick={() => void onAcceptTriageCategory()}
              >
                Accept
              </Button>
              <Button
                appearance="secondary"
                size="small"
                icon={<X size={14} />}
                disabled={reviewingId === triageCategorySuggestion.id && reviewSaving}
                onClick={() => void onIgnoreTriageCategory()}
              >
                Ignore
              </Button>
            </MessageBarActions>
          </MessageBar>
        )}

        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>E-mail type</span>
          <span className={styles.metaValue}>
            {CATEGORY_LABEL[row.category]} · {SUBTYPE_LABEL[row.subtype]}
          </span>
        </div>

        {whyReasons.length > 0 && (
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Why this label</span>
            <ul className={styles.whyList}>
              {whyReasons.map((reason) => (
                <li key={reason}>
                  <Caption1 className={styles.metaValue}>{reason}</Caption1>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Suggested folder</span>
          <span className={styles.folderLine}>
            <Folder size={12} aria-hidden />
            <span className={styles.folderName}>{suggestedFolder(row)}</span>
          </span>
        </div>

        {overridden && (
          <Caption1 className={styles.muted}>Suggested when it arrived: {suggestedText}</Caption1>
        )}

        <div className={styles.metaRow}>
          <span className={styles.metaLabel}>Preview</span>
          <div
            className={styles.emailBody}
            tabIndex={0}
            role="region"
            aria-label="Email body preview"
          >
            {row.bodyPreview?.trim()
              ? row.bodyPreview
              : 'No message text was captured for this email.'}
          </div>
        </div>

        <Caption1 className={styles.dialogNote}>
          This saved preview stays available here.
        </Caption1>
      </div>

      <div className={styles.previewActions}>
        <OutlookMessageAction email={row} />
        {row.caseId ? (
          <Button appearance="primary" icon={<Briefcase size={16} />} onClick={() => onOpenCase(row.caseId!)}>
            View case
          </Button>
        ) : (
          <Button appearance="secondary" icon={<Copy size={16} />} onClick={() => onCopyReference(row)}>
            Copy reference
          </Button>
        )}
        {row.triageState !== 'actioned' && (
          <Button appearance="secondary" icon={<CheckCircle2 size={16} />} onClick={() => onTriage('actioned')}>
            Mark actioned
          </Button>
        )}
        {row.triageState !== 'dismissed' && (
          <Button appearance="secondary" icon={<XCircle size={16} />} onClick={() => onTriage('dismissed')}>
            Dismiss
          </Button>
        )}
        <Button appearance="secondary" icon={<Tags size={16} />} onClick={onReclassify}>
          Change e-mail type
        </Button>
        {/* Quiet secondary action — linked rows only; kept out of the DataGrid row
            entirely (preview panel only). Deliberately de-emphasised (subtle +
            small) next to the other preview actions above. */}
        {row.caseId && (
          <Button
            appearance="subtle"
            size="small"
            icon={<Unlink size={14} />}
            onClick={() => setDetachConfirmOpen(true)}
          >
            Unlink from case…
          </Button>
        )}
      </div>

      <Dialog
        open={detachConfirmOpen}
        onOpenChange={(_e, d) => {
          if (!d.open && !detaching) setDetachConfirmOpen(false);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Unlink from case</DialogTitle>
            <DialogContent>
              <div className={styles.dialogGrid}>
                <MessageBar intent="warning">
                  <MessageBarBody>
                    <MessageBarTitle>The archive copy isn’t removed</MessageBarTitle>
                    Unlinking removes the connection between this email and the case. Any copy
                    already filed in the case’s archive folder stays there — you’ll need to tidy it
                    up by hand.
                  </MessageBarBody>
                </MessageBar>
              </div>
            </DialogContent>
            <DialogActions>
              <Button
                appearance="primary"
                icon={detaching ? <Spinner size="tiny" /> : <Unlink size={16} />}
                disabled={detaching}
                onClick={() => void doDetach()}
              >
                {detaching ? 'Unlinking…' : 'Unlink from case'}
              </Button>
              <Button appearance="secondary" onClick={() => setDetachConfirmOpen(false)} disabled={detaching}>
                Cancel
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </aside>
  );
}

/* ----------  Reclassify / override (suggested tags)  ---------- */

export function ReclassifyDialog({
  row,
  onClose,
  onDone,
  dispatchToast,
}: {
  row: InboundEmail | null;
  onClose: () => void;
  onDone: () => void;
  dispatchToast: ReturnType<typeof useToastController>['dispatchToast'];
}) {
  const styles = useStyles();
  const [tag, setTag] = useState<ReclassifyTag | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // Seed the form from the row each time the dialog target changes.
  useEffect(() => {
    setTag(row ? subtypeToTag(row.subtype) : undefined);
    setReason('');
  }, [row]);

  const suggestedLabel = row
    ? row.suggestedSubtype
      ? SUBTYPE_LABEL[row.suggestedSubtype]
      : SUBTYPE_LABEL[row.subtype]
    : '';

  const submit = async () => {
    if (!row || !tag) return;
    setSaving(true);
    try {
      await data.reclassifyInbound(row.id, { tag, reason: reason.trim() || undefined });
      dispatchToast(
        <Toast>
          <ToastTitle>E-mail type updated to “{tag}”</ToastTitle>
          <ToastBody>{row.subject}</ToastBody>
        </Toast>,
        { intent: 'success' },
      );
      onDone();
    } catch (err) {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t change the classification. Please try again.</ToastTitle>
          <ToastBody>{err instanceof Error ? err.message : 'Please try again.'}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={row !== null} onOpenChange={(_e, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Change e-mail type</DialogTitle>
          <DialogContent>
            <div className={styles.dialogGrid}>
              <span className={styles.suggestLine}>
                <Text className={styles.dialogNote}>Suggested when it arrived:</Text>
                <Badge appearance="outline" color="informative" shape="rounded" size="small">
                  {suggestedLabel || '—'}
                </Badge>
              </span>
              <Field label="Change to">
                <RadioGroup value={tag ?? ''} onChange={(_e, d) => setTag(d.value as ReclassifyTag)}>
                  {RECLASSIFY_TAGS.map((t) => (
                    <Radio key={t} value={t} label={t} />
                  ))}
                </RadioGroup>
              </Field>
              <Field label="Reason (optional)" hint="Recorded to help sort similar email correctly in future.">
                <Textarea
                  value={reason}
                  onChange={(_e, d) => setReason(d.value)}
                  resize="vertical"
                  placeholder="Why is this the right type?"
                />
              </Field>
              <Text className={styles.dialogNote}>
                This updates the tag in the app only — it does not move the email between mailbox
                folders.
              </Text>
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              appearance="primary"
              icon={saving ? <Spinner size="tiny" /> : <Tags size={16} />}
              disabled={!tag || saving}
              onClick={() => void submit()}
            >
              {saving ? 'Saving…' : 'Save classification'}
            </Button>
            <Button appearance="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
