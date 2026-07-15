import { useState } from 'react';
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
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  Text,
  Toast,
  ToastBody,
  ToastTitle,
  makeStyles,
  tokens,
  useToastController,
} from '@fluentui/react-components';
import { Ban, Camera, RefreshCw } from 'lucide-react';
import {
  serverMessageOf,
  useCaptureSessionMutations,
  useCaptureSessions,
  type CaptureSessionStaffSummary,
} from '../data';
import { GLOBAL_TOASTER_ID } from './toaster';

const SHOT_PLANS = [
  { id: 'essential-v1', label: 'Essential photos' },
  { id: 'standard-exterior-v1', label: 'Full exterior set' },
] as const;

const EXPIRY_OPTIONS = [
  { hours: 24, label: '1 day' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
] as const;

type PendingAction =
  | { kind: 'replace'; session: CaptureSessionStaffSummary }
  | { kind: 'cancel'; session: CaptureSessionStaffSummary };

export interface GuidedPhotoLink {
  sessionId: string;
  captureUrl: string;
  shotPlanLabel: string;
  expiresAt: string;
}

export interface GuidedPhotoRequestPanelProps {
  caseId: string;
  disabled?: boolean;
  onLinkReady(link: GuidedPhotoLink): void;
  onLinkCancelled?(sessionId: string): void;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  intro: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  form: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 1fr) minmax(140px, 220px) auto',
    gap: tokens.spacingHorizontalM,
    alignItems: 'end',
    '@media (max-width: 720px)': {
      gridTemplateColumns: '1fr',
      alignItems: 'stretch',
    },
  },
  sessions: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  sessionRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: tokens.spacingHorizontalM,
    alignItems: 'center',
    padding: tokens.spacingVerticalS,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusSmall,
    '@media (max-width: 620px)': {
      gridTemplateColumns: '1fr',
    },
  },
  sessionMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  sessionTitle: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  muted: { color: tokens.colorNeutralForeground3 },
});

function statusLabel(status: CaptureSessionStaffSummary['status']): string {
  switch (status) {
    case 'open':
      return 'Ready';
    case 'complete':
      return 'Completed';
    case 'expired':
      return 'Expired';
    case 'revoked':
      return 'Cancelled';
    case 'locked':
      return 'Needs attention';
  }
}

function statusColour(
  status: CaptureSessionStaffSummary['status'],
): 'success' | 'informative' | 'warning' | 'danger' | 'subtle' {
  switch (status) {
    case 'open':
      return 'informative';
    case 'complete':
      return 'success';
    case 'expired':
    case 'revoked':
      return 'subtle';
    case 'locked':
      return 'warning';
  }
}

function displayDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

export function GuidedPhotoRequestPanel({
  caseId,
  disabled = false,
  onLinkReady,
  onLinkCancelled,
}: GuidedPhotoRequestPanelProps) {
  const styles = useStyles();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);
  const sessionsQuery = useCaptureSessions(caseId);
  const { createRequest, replaceLink, cancelLink, saving } = useCaptureSessionMutations();
  const [shotPlanId, setShotPlanId] = useState('essential-v1');
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [pendingAction, setPendingAction] = useState<PendingAction | undefined>();

  const toastError = (title: string, error: unknown) => {
    dispatchToast(
      <Toast>
        <ToastTitle>{title}</ToastTitle>
        <ToastBody>{serverMessageOf(error) ?? 'Please try again.'}</ToastBody>
      </Toast>,
      { intent: 'error' },
    );
  };

  const announceLink = (
    result: Awaited<ReturnType<typeof createRequest>>,
  ) => {
    onLinkReady({
      sessionId: result.session.sessionId,
      captureUrl: result.captureUrl,
      shotPlanLabel: result.session.shotPlanLabel,
      expiresAt: result.session.expiresAt,
    });
    sessionsQuery.refetch();
    dispatchToast(
      <Toast>
        <ToastTitle>Photo request ready</ToastTitle>
        <ToastBody>The new link is in the editable draft below.</ToastBody>
      </Toast>,
      { intent: 'success' },
    );
  };

  const create = async () => {
    try {
      announceLink(await createRequest(caseId, { shotPlanId, expiresInHours }));
    } catch (error) {
      toastError('Couldn’t create the photo request', error);
    }
  };

  const confirmAction = async () => {
    const action = pendingAction;
    if (!action) return;
    try {
      if (action.kind === 'replace') {
        announceLink(await replaceLink(action.session.sessionId));
      } else {
        await cancelLink(action.session.sessionId);
        // The one-time URL may still be sitting in the editable chaser draft.
        // Remove it only when this is the session that supplied that draft, so a
        // cancelled older request cannot clear a newer replacement.
        onLinkCancelled?.(action.session.sessionId);
        sessionsQuery.refetch();
        dispatchToast(
          <Toast>
            <ToastTitle>Photo link cancelled</ToastTitle>
          </Toast>,
          { intent: 'success' },
        );
      }
      setPendingAction(undefined);
    } catch (error) {
      toastError(
        action.kind === 'replace'
          ? 'Couldn’t replace the photo link'
          : 'Couldn’t cancel the photo link',
        error,
      );
    }
  };

  return (
    <section className={styles.root} aria-labelledby="guided-photo-request-title">
      <div className={styles.intro}>
        <Text id="guided-photo-request-title" weight="semibold" size={400}>
          Request guided photos
        </Text>
        <Caption1 className={styles.muted}>
          Create a secure link to copy into a message. It is not sent automatically.
        </Caption1>
      </div>

      <div className={styles.form}>
        <Field label="Photo set">
          <Dropdown
            value={SHOT_PLANS.find((plan) => plan.id === shotPlanId)?.label}
            selectedOptions={[shotPlanId]}
            onOptionSelect={(_, data) => data.optionValue && setShotPlanId(data.optionValue)}
            disabled={disabled || saving}
          >
            {SHOT_PLANS.map((plan) => (
              <Option key={plan.id} value={plan.id}>
                {plan.label}
              </Option>
            ))}
          </Dropdown>
        </Field>
        <Field label="Link expires">
          <Dropdown
            value={EXPIRY_OPTIONS.find((option) => option.hours === expiresInHours)?.label}
            selectedOptions={[String(expiresInHours)]}
            onOptionSelect={(_, data) => {
              const hours = Number(data.optionValue);
              if (hours === 24 || hours === 72 || hours === 168) setExpiresInHours(hours);
            }}
            disabled={disabled || saving}
          >
            {EXPIRY_OPTIONS.map((option) => (
              <Option key={option.hours} value={String(option.hours)}>
                {option.label}
              </Option>
            ))}
          </Dropdown>
        </Field>
        <Button
          appearance="primary"
          icon={saving ? <Spinner size="tiny" /> : <Camera size={16} />}
          disabled={disabled || saving}
          onClick={() => void create()}
        >
          {saving ? 'Creating…' : 'Create request'}
        </Button>
      </div>

      {disabled && (
        <MessageBar intent="info">
          <MessageBarBody>This case is closed, so a new photo link cannot be created.</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.sessions} aria-label="Previous guided photo requests">
        {sessionsQuery.loading && sessionsQuery.data === undefined ? (
          <Spinner size="small" label="Loading photo requests" />
        ) : sessionsQuery.error ? (
          <MessageBar intent="error">
            <MessageBarBody>
              Couldn’t load previous photo requests.{' '}
              <Button appearance="transparent" size="small" onClick={sessionsQuery.refetch}>
                Try again
              </Button>
            </MessageBarBody>
          </MessageBar>
        ) : (sessionsQuery.data ?? []).length === 0 ? (
          <Caption1 className={styles.muted}>No guided photo requests yet.</Caption1>
        ) : (
          (sessionsQuery.data ?? []).map((session) => (
            <div className={styles.sessionRow} key={session.sessionId}>
              <div className={styles.sessionMain}>
                <div className={styles.sessionTitle}>
                  <Text weight="semibold">{session.shotPlanLabel}</Text>
                  <Badge appearance="tint" color={statusColour(session.status)}>
                    {statusLabel(session.status)}
                  </Badge>
                </div>
                <Caption1 className={styles.muted}>
                  {session.requiredCompleted} of {session.requiredTotal} required photos received
                  {' · '}
                  {session.status === 'open'
                    ? `Expires ${displayDate(session.expiresAt)}`
                    : `Created ${displayDate(session.createdAt)}`}
                </Caption1>
              </div>
              {session.status === 'open' && !disabled && (
                <div className={styles.actions}>
                  <Button
                    appearance="secondary"
                    size="small"
                    icon={<RefreshCw size={14} />}
                    disabled={saving}
                    onClick={() => setPendingAction({ kind: 'replace', session })}
                  >
                    Replace link
                  </Button>
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<Ban size={14} />}
                    disabled={saving}
                    onClick={() => setPendingAction({ kind: 'cancel', session })}
                  >
                    Cancel link
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Dialog
        open={pendingAction !== undefined}
        onOpenChange={(_, data) => !data.open && !saving && setPendingAction(undefined)}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {pendingAction?.kind === 'replace' ? 'Replace this photo link?' : 'Cancel this photo link?'}
            </DialogTitle>
            <DialogContent>
              {pendingAction?.kind === 'replace'
                ? 'The old link will stop working. A new link will be added to the draft.'
                : 'The link will stop working immediately. Photos already submitted will stay on the case.'}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" disabled={saving} onClick={() => setPendingAction(undefined)}>
                Keep current link
              </Button>
              <Button appearance="primary" disabled={saving} onClick={() => void confirmAction()}>
                {saving
                  ? 'Saving…'
                  : pendingAction?.kind === 'replace'
                    ? 'Replace link'
                    : 'Cancel link'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </section>
  );
}
