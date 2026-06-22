import { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Field,
  Option,
  Radio,
  RadioGroup,
  Spinner,
  Textarea,
  Toast,
  ToastBody,
  ToastTitle,
  makeStyles,
  tokens,
  useToastController,
} from '@fluentui/react-components';
import { Copy, ClipboardCheck, Link2 } from 'lucide-react';
import type { Case, ChaserChannel, CopyFileRequestTransport } from '../data';
import { GLOBAL_TOASTER_ID } from './toaster';

/** The template key for the Box (Archive) image upload-link action. */
const COPY_FILE_REQUEST_KEY = 'copy_file_request';

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
  body: (c: Case) => string;
}

const TEMPLATES: ChaserTemplate[] = [
  {
    key: 'image_request',
    label: 'Image request',
    channels: ['email', 'whatsapp'],
    body: (c) =>
      `Hi,\n\nWe're missing photographs for vehicle ${c.vrm} (${c.vehicleModel}). ` +
      `Please could you send:\n• A vehicle overview showing the full registration\n• A main-damage closeup\n• Any additional damage photos\n\n` +
      `Many thanks,\nCollision Engineers`,
  },
  {
    key: 'instruction_request',
    label: 'Instruction request',
    channels: ['email'],
    body: (c) =>
      `Hi,\n\nWe have received images for ${c.vrm} but no instruction. ` +
      `Please could you forward the instruction so we can proceed.\n\nMany thanks,\nCollision Engineers`,
  },
  {
    key: 'mileage_chase',
    label: 'Mileage / details chase',
    channels: ['email', 'whatsapp'],
    body: (c) =>
      `Hi,\n\nTo complete the assessment for ${c.vrm} we still need the current mileage. ` +
      `Could you confirm at your earliest convenience?\n\nThanks,\nCollision Engineers`,
  },
  {
    // The image upload-link action. Its body is the covering message; the live
    // upload link is appended only after it is fetched (so the draft never shows a
    // placeholder/fake link). Shown only when the upload-link feature is on.
    key: COPY_FILE_REQUEST_KEY,
    label: 'Image upload link',
    channels: ['email', 'whatsapp'],
    body: (c) =>
      `Hi,\n\nPlease upload the photographs for vehicle ${c.vrm} (${c.vehicleModel}) ` +
      `using the secure link below — no account needed. We need:\n` +
      `• A vehicle overview showing the full registration\n• A main-damage closeup\n• Any additional damage photos\n\n` +
      `Many thanks,\nCollision Engineers`,
  },
];

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', alignItems: 'center' },
});

export interface ChaserPanelProps {
  case: Case;
  /** Called when the user logs the draft as a chase (the screen adds the note). */
  onLogChased?: (draft: { channel: ChaserChannel; templateLabel: string }) => void;
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
  // The upload-link template is gated; everything else is always offered.
  const visibleTemplates = useMemo(
    () => TEMPLATES.filter((t) => t.key !== COPY_FILE_REQUEST_KEY || fileRequestEnabled),
    [fileRequestEnabled],
  );
  const available = useMemo(
    () => visibleTemplates.filter((t) => t.channels.includes(channel)),
    [visibleTemplates, channel],
  );
  const [templateKey, setTemplateKey] = useState<string>(TEMPLATES[0].key);
  const activeTemplate = available.find((t) => t.key === templateKey) ?? available[0];
  const [body, setBody] = useState<string>(activeTemplate.body(c));
  const [linkLoading, setLinkLoading] = useState(false);
  const isUploadLinkTemplate = activeTemplate.key === COPY_FILE_REQUEST_KEY;

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
    const fallback = visibleTemplates.find((t) => t.channels.includes(next))!;
    const chosen = stillValid ?? fallback;
    setTemplateKey(chosen.key);
    setBody(chosen.body(c));
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      dispatchToast(
        <Toast>
          <ToastTitle>Chaser copied to clipboard</ToastTitle>
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
    }
  };

  const onLog = () => {
    onLogChased?.({ channel, templateLabel: activeTemplate.label });
  };

  /* Fetch the per-case upload link and copy [message + link] to the clipboard.
     Honest states only: a not_connected / folder_not_ready / gated_off / error
     result toasts the reason and copies NOTHING — never a fabricated link. */
  const onGetUploadLink = async () => {
    if (linkLoading) return;
    setLinkLoading(true);
    try {
      const result = await (onRequestUploadLink
        ? onRequestUploadLink(c.id)
        : Promise.resolve({ status: 'not_connected' as const, message: 'Image upload link isn’t available yet.' }));
      if (result.status === 'ok' && result.data?.fileRequestUrl) {
        const text = `${body}\n\nUpload your photos here:\n${result.data.fileRequestUrl}`;
        // Put the full message + link into the visible textarea BEFORE attempting
        // the clipboard write, so on a clipboard failure the "select the text
        // manually" guidance has something to select — the link is never lost.
        setBody(text);
        try {
          await navigator.clipboard.writeText(text);
          dispatchToast(
            <Toast>
              <ToastTitle>Upload link copied to clipboard</ToastTitle>
              <ToastBody>Paste it into your {channel === 'whatsapp' ? 'WhatsApp' : 'email'} to the provider.</ToastBody>
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
        }
        return;
      }
      // folder_not_ready has a specific friendly line; everything else uses the
      // transport's message (or a generic fallback). Never copies a link.
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
    } finally {
      setLinkLoading(false);
    }
  };

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

      <div className={styles.actions}>
        {isUploadLinkTemplate ? (
          <Button
            appearance="primary"
            icon={linkLoading ? <Spinner size="tiny" /> : <Link2 size={16} />}
            onClick={onGetUploadLink}
            disabled={linkLoading}
          >
            {linkLoading ? 'Getting link…' : 'Get upload link & copy'}
          </Button>
        ) : (
          <Button appearance="primary" icon={<Copy size={16} />} onClick={onCopy}>
            Copy to clipboard
          </Button>
        )}
        <Button appearance="secondary" icon={<ClipboardCheck size={16} />} onClick={onLog}>
          Log as chased
        </Button>
      </div>
    </div>
  );
}
