import { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Field,
  Option,
  Radio,
  RadioGroup,
  Spinner,
  Text,
  Textarea,
  Toast,
  ToastBody,
  ToastTitle,
  makeStyles,
  tokens,
  useToastController,
} from '@fluentui/react-components';
import { Copy, ClipboardCheck } from 'lucide-react';
import type { Case, Chaser, ChaserChannel, CopyFileRequestTransport, CaseType } from '../data';
import { caseTypeOf } from '../data';
import { GLOBAL_TOASTER_ID } from './toaster';

const OVERVIEW_PHOTO_REQUEST = 'Overview photo request';
const EXISTING_OVERVIEW_REQUEST_KEY = 'existing_overview_photo_request';

export function overviewChaserForPanel(chasers: Chaser[]): Chaser | undefined {
  return chasers.find(
    (chaser) =>
      chaser.templateUsed === OVERVIEW_PHOTO_REQUEST &&
      (chaser.status === 'drafted' || chaser.status === 'sent' || chaser.status === 'overdue'),
  );
}

export function overviewChaserStatusText(chaser: Chaser): string {
  if (chaser.status === 'drafted') return 'Drafted overview photo request — ready to copy and send.';
  if (chaser.status === 'sent') {
    return `Overview photo request sent${chaser.sentAt ? ` on ${chaser.sentAt}` : ''}.`;
  }
  return 'Overview photo request is overdue — copy it to follow up.';
}

/* Chaser composer — minimalistic, adapted from the Job Sheet chaser (review
   caseview #7). Channel = Email | WhatsApp, a template seeds an editable draft,
   then Copy or Log-as-chased (which drops an auto-note on the case). It never
   sends: the send itself is a flow / user action, so there is no "send" button
   to contradict that, and no ADR reference leaks into the UI (review #10). A
   case's held/open state is derived from what it is missing, so there is no
   manual "Mark held" (review #9). */

interface ChaserTemplate {
  key: string;
  label: string;
  channels: ChaserChannel[];
  /** Which case types this chaser is relevant to — gated on what the case is
   *  MISSING, so an instructions-only case is never offered "Instruction request"
   *  and an images-only case is never offered "Image request". */
  applicableTo: (caseType: CaseType) => boolean;
  requiresUploadLink: boolean;
  body: (c: Case) => string;
}

/** Chasing IMAGES — relevant only when the case lacks images. */
const NEEDS_IMAGES = (ct: CaseType): boolean => ct === 'instructions_only' || ct === 'pending';
/** Chasing the INSTRUCTION — relevant only when the case lacks an instruction. */
const NEEDS_INSTRUCTION = (ct: CaseType): boolean => ct === 'images_only' || ct === 'pending';

const TEMPLATES: ChaserTemplate[] = [
  {
    key: 'image_request',
    label: 'Image request',
    channels: ['email', 'whatsapp'],
    applicableTo: NEEDS_IMAGES,
    requiresUploadLink: true,
    body: (c) =>
      `Hi,\n\nWe're missing photographs for vehicle ${c.vrm} (${c.vehicleModel}). ` +
      `Please could you send:\n• A vehicle overview showing the full registration\n• A main-damage closeup\n• Any additional damage photos\n\n` +
      `Many thanks,\nCollision Engineers`,
  },
  {
    key: 'instruction_request',
    label: 'Instruction request',
    channels: ['email'],
    applicableTo: NEEDS_INSTRUCTION,
    requiresUploadLink: false,
    body: (c) =>
      `Hi,\n\nWe have received images for ${c.vrm} but no instruction. ` +
      `Please could you forward the instruction so we can proceed.\n\nMany thanks,\nCollision Engineers`,
  },
];

const UPLOAD_LINK_HEADING = 'Upload your photos here:';

/** Add or replace the one upload-link block. Repeated copies never accumulate
 * stale links, while handler edits elsewhere in the draft are preserved. */
export function messageWithUploadLink(body: string, url: string): string {
  const withoutExisting = body.replace(
    /\n*Upload your photos here:\s*\nhttps:\/\/[^\s]+\s*$/i,
    '',
  ).trimEnd();
  return `${withoutExisting}\n\n${UPLOAD_LINK_HEADING}\n${url}`;
}

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', alignItems: 'center' },
  empty: { color: tokens.colorNeutralForeground3, padding: `${tokens.spacingVerticalS} 0` },
});

export interface ChaserPanelProps {
  case: Case;
  /** Called when the user logs the draft as a chase (the screen adds the note). */
  onLogChased?: (draft: { channel: ChaserChannel; templateLabel: string }) => void | Promise<void>;
  /**
   * Whether the image upload-link action may show. Drive it with BOTH the gate
   * AND a configured template (`fileRequestEnabled && fileRequestTemplateConfigured`)
   * so the button never appears without somewhere to copy from.
   */
  fileRequestEnabled?: boolean;
  /**
   * Live transport that fetches the per-case upload link. Injected (the live
   * connector op in the app; a fake in tests). When absent, the action degrades to
   * an honest "not available yet" — it never fabricates a link.
   */
  onRequestUploadLink?: CopyFileRequestTransport;
}

/** Channel-aware chaser composer. Drafts only — never sends. */
export function ChaserPanel({
  case: c,
  onLogChased,
  fileRequestEnabled = false,
  onRequestUploadLink,
}: ChaserPanelProps) {
  const styles = useStyles();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const [channel, setChannel] = useState<ChaserChannel>('email');
  // What the case currently holds, so chasers are gated by what it is MISSING.
  const caseType = useMemo(
    () =>
      caseTypeOf(c, {
        hasImages: c.evidence.some((e) => e.kind === 'image'),
        hasInstructions: c.evidence.some((e) => e.kind === 'instruction'),
      }),
    [c],
  );
  const existingOverviewChaser = useMemo(() => overviewChaserForPanel(c.chasers), [c.chasers]);
  const existingOverviewTemplate = useMemo<ChaserTemplate | undefined>(
    () => existingOverviewChaser
      ? {
          key: EXISTING_OVERVIEW_REQUEST_KEY,
          label: OVERVIEW_PHOTO_REQUEST,
          channels: [existingOverviewChaser.channel],
          applicableTo: () => true,
          requiresUploadLink: true,
          body: (caseRow) =>
            `Hi,\n\nPlease could you send a photo of the whole vehicle ${caseRow.vrm} ` +
            `showing the registration plate clearly.\n\nMany thanks,\nCollision Engineers`,
        }
      : undefined,
    [existingOverviewChaser],
  );
  // Image requests stay visible when link provisioning is unavailable, but their
  // actions are disabled with an honest explanation below. They must never fall
  // back to a linkless message that looks complete.
  const visibleTemplates = useMemo(
    () =>
      [
        ...(existingOverviewTemplate ? [existingOverviewTemplate] : []),
        ...TEMPLATES.filter((t) => t.applicableTo(caseType)),
      ],
    [existingOverviewTemplate, caseType],
  );
  const available = useMemo(
    () => visibleTemplates.filter((t) => t.channels.includes(channel)),
    [visibleTemplates, channel],
  );
  const [templateKey, setTemplateKey] = useState<string>(visibleTemplates[0]?.key ?? '');
  const activeTemplate = available.find((t) => t.key === templateKey) ?? available[0];
  const [body, setBody] = useState<string>(activeTemplate ? activeTemplate.body(c) : '');
  const [linkLoading, setLinkLoading] = useState(false);
  const needsUploadLink = activeTemplate?.requiresUploadLink === true;

  const applyTemplate = (key: string) => {
    setTemplateKey(key);
    const t = visibleTemplates.find((x) => x.key === key);
    if (t) setBody(t.body(c));
  };

  const onChannelChange = (next: ChaserChannel) => {
    setChannel(next);
    const stillValid = visibleTemplates.find(
      (t) => t.key === templateKey && t.channels.includes(next),
    );
    const chosen = stillValid ?? visibleTemplates.find((t) => t.channels.includes(next));
    setTemplateKey(chosen?.key ?? '');
    setBody(chosen ? chosen.body(c) : '');
  };

  const prepareUploadMessage = async (): Promise<string | undefined> => {
    if (!fileRequestEnabled) {
      dispatchToast(
        <Toast>
          <ToastTitle>No upload link yet</ToastTitle>
          <ToastBody>An upload link is required before this image request can be copied or logged.</ToastBody>
        </Toast>,
        { intent: 'warning' },
      );
      return undefined;
    }
    const result = await (onRequestUploadLink
      ? onRequestUploadLink(c.id)
      : Promise.resolve({ status: 'not_connected' as const, message: 'Image upload link isn’t available yet.' }));
    if (result.status === 'ok' && result.data?.fileRequestUrl) {
      const text = messageWithUploadLink(body, result.data.fileRequestUrl);
      // Keep the complete message visible even when clipboard permission fails.
      setBody(text);
      return text;
    }
    const fallback =
      result.status === 'folder_not_ready'
        ? 'The case archive folder isn’t ready yet — try again shortly.'
        : result.message ?? 'Image upload link isn’t available yet.';
    dispatchToast(
      <Toast>
        <ToastTitle>No upload link yet</ToastTitle>
        <ToastBody>{fallback}</ToastBody>
      </Toast>,
      { intent: 'warning' },
    );
    return undefined;
  };

  const onCopy = async () => {
    if (linkLoading) return;
    setLinkLoading(true);
    try {
      const text = needsUploadLink ? await prepareUploadMessage() : body;
      if (!text) return;
      await navigator.clipboard.writeText(text);
      dispatchToast(
        <Toast>
          <ToastTitle>Chaser copied to clipboard</ToastTitle>
          {needsUploadLink ? (
            <ToastBody>Paste it into your {channel === 'whatsapp' ? 'WhatsApp' : 'email'} to the provider.</ToastBody>
          ) : null}
        </Toast>,
        { intent: 'success' },
      );
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t copy — select the text manually</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setLinkLoading(false);
    }
  };

  const onLog = async () => {
    if (linkLoading) return;
    setLinkLoading(true);
    try {
      if (needsUploadLink && !await prepareUploadMessage()) return;
      await onLogChased?.({ channel, templateLabel: activeTemplate.label });
    } finally {
      setLinkLoading(false);
    }
  };

  // After case-type gating, a complete case (both / merged) yields no applicable
  // template — show a calm empty state rather than an orphaned, crash-prone form.
  if (visibleTemplates.length === 0) {
    return (
      <div className={styles.root}>
        <Text className={styles.empty}>
          Nothing to chase — this case already has its instruction and images.
        </Text>
      </div>
    );
  }

  // A template applies to this case but not to the SELECTED channel (e.g. an
  // images-only case offers only the email-only Instruction request and WhatsApp
  // is selected) — activeTemplate is undefined here, so offer the channel switch
  // rather than deref it (which would crash the render).
  if (!activeTemplate) {
    return (
      <div className={styles.root}>
        <Field label="Channel">
          <RadioGroup
            layout="horizontal"
            value={channel}
            onChange={(_, d) => onChannelChange(d.value as ChaserChannel)}
          >
            <Radio value="email" label="Email" />
            <Radio value="whatsapp" label="WhatsApp" />
          </RadioGroup>
        </Field>
        <Text className={styles.empty}>
          No chaser template for {channel === 'whatsapp' ? 'WhatsApp' : 'Email'} on this case — switch channel.
        </Text>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {existingOverviewChaser && activeTemplate.key === EXISTING_OVERVIEW_REQUEST_KEY ? (
        <Text>{overviewChaserStatusText(existingOverviewChaser)}</Text>
      ) : null}
      <Field label="Channel">
        <RadioGroup
          layout="horizontal"
          value={channel}
          onChange={(_, d) => onChannelChange(d.value as ChaserChannel)}
        >
          <Radio value="email" label="Email" />
          <Radio value="whatsapp" label="WhatsApp" />
        </RadioGroup>
      </Field>

      <Field label="Template">
        <Dropdown
          value={activeTemplate.label}
          selectedOptions={[templateKey]}
          onOptionSelect={(_, d) => d.optionValue && applyTemplate(d.optionValue)}
        >
          {available.map((t) => (
            <Option key={t.key} value={t.key}>
              {t.label}
            </Option>
          ))}
        </Dropdown>
      </Field>

      <Field label="Draft">
        <Textarea value={body} onChange={(_, d) => setBody(d.value)} resize="vertical" rows={8} />
      </Field>

      {needsUploadLink && !fileRequestEnabled ? (
        <Text className={styles.empty}>
          An upload link is required before this image request can be copied or logged.
        </Text>
      ) : null}

      <div className={styles.actions}>
        <Button
          appearance="primary"
          icon={linkLoading ? <Spinner size="tiny" /> : <Copy size={16} />}
          onClick={onCopy}
          disabled={linkLoading || !activeTemplate || (needsUploadLink && !fileRequestEnabled)}
        >
          {linkLoading ? 'Preparing…' : 'Copy to clipboard'}
        </Button>
        <Button
          appearance="secondary"
          icon={<ClipboardCheck size={16} />}
          onClick={onLog}
          disabled={linkLoading || !activeTemplate || (needsUploadLink && !fileRequestEnabled)}
        >
          Log as chased
        </Button>
      </div>
    </div>
  );
}
