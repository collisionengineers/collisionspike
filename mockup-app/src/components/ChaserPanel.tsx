import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Caption1,
  Dropdown,
  Field,
  MessageBar,
  MessageBarBody,
  Option,
  Radio,
  RadioGroup,
  Textarea,
  Toast,
  ToastBody,
  ToastTitle,
  makeStyles,
  tokens,
  useToastController,
} from '@fluentui/react-components';
import { Copy, Send, ClipboardCheck, PauseCircle } from 'lucide-react';
import type { Case, ChaserChannel } from '../data';
import { outstandingText } from '../data';
import { GLOBAL_TOASTER_ID } from './toaster';

/* Chaser composer. Channel = Email | WhatsApp. Template Dropdown seeds an
   editable draft Textarea. Copy-to-clipboard (+toast) and Log-as-drafted.
   NEVER auto-sends — Email send is a disabled "later" affordance (ADR-0003).
   An explicit "held, awaiting X" affordance records that the case is parked
   pending the outstanding item; the handoff to actually send is flow/user-owned. */

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
];

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', alignItems: 'center' },
  caption: { color: tokens.colorNeutralForeground3 },
  heldBar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  heldText: { color: tokens.colorNeutralForeground2 },
});

/** What this case is waiting on, in active-voice — reused for the "held" banner. */
function awaitingText(c: Case): string {
  switch (c.actionReason) {
    case 'missing_images':
      return 'awaiting images from the garage';
    case 'missing_instructions':
      return 'awaiting instructions from the provider';
    case 'conflict':
      return 'awaiting claimant-name confirmation';
    case 'needs_review':
      return 'awaiting review of parsed details';
    case 'duplicate':
      return 'awaiting duplicate resolution';
    default:
      return 'awaiting outstanding information';
  }
}

export interface ChaserPanelProps {
  case: Case;
  /** Called when the user logs the draft as a Chaser (mock — no persistence). */
  onLogDrafted?: (draft: { channel: ChaserChannel; template: string; body: string }) => void;
}

/** Channel-aware chaser composer. Drafts only — never sends. */
export function ChaserPanel({ case: c, onLogDrafted }: ChaserPanelProps) {
  const styles = useStyles();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const [channel, setChannel] = useState<ChaserChannel>('email');
  const [held, setHeld] = useState(false);
  const available = useMemo(
    () => TEMPLATES.filter((t) => t.channels.includes(channel)),
    [channel],
  );
  const [templateKey, setTemplateKey] = useState<string>(TEMPLATES[0].key);
  const activeTemplate = available.find((t) => t.key === templateKey) ?? available[0];
  const [body, setBody] = useState<string>(activeTemplate.body(c));

  const applyTemplate = (key: string) => {
    setTemplateKey(key);
    const t = TEMPLATES.find((x) => x.key === key);
    if (t) setBody(t.body(c));
  };

  const onChannelChange = (next: ChaserChannel) => {
    setChannel(next);
    const stillValid = TEMPLATES.find((t) => t.key === templateKey && t.channels.includes(next));
    const fallback = TEMPLATES.find((t) => t.channels.includes(next))!;
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
    onLogDrafted?.({ channel, template: templateKey, body });
    dispatchToast(
      <Toast>
        <ToastTitle>Chaser logged as drafted</ToastTitle>
      </Toast>,
      { intent: 'success' },
    );
  };

  const onToggleHeld = () => {
    const next = !held;
    setHeld(next);
    dispatchToast(
      <Toast>
        <ToastTitle>{next ? 'Case marked held' : 'Hold cleared'}</ToastTitle>
        <ToastBody>
          {next
            ? `Held — ${awaitingText(c)}. Mock only; no record changed and nothing was sent.`
            : 'The hold flag was cleared (mock).'}
        </ToastBody>
      </Toast>,
      { intent: 'success' },
    );
  };

  return (
    <div className={styles.root}>
      {/* Explicit "held, awaiting X" affordance — a partial case parked pending
          the outstanding item. The chaser only DRAFTS; sending is flow/user-owned. */}
      <MessageBar intent={held ? 'warning' : 'info'}>
        <MessageBarBody>
          <span className={styles.heldBar}>
            <Badge
              appearance={held ? 'filled' : 'outline'}
              color={held ? 'warning' : 'informative'}
              shape="rounded"
              size="small"
            >
              {held ? 'Held' : 'Open'}
            </Badge>
            <span className={styles.heldText}>
              {held ? `Held — ${awaitingText(c)}.` : outstandingText(c)}
            </span>
          </span>
        </MessageBarBody>
      </MessageBar>

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
        <Textarea
          value={body}
          onChange={(_, d) => setBody(d.value)}
          resize="vertical"
          rows={8}
        />
      </Field>

      <div className={styles.actions}>
        <Button appearance="primary" icon={<Copy size={16} />} onClick={onCopy}>
          Copy to clipboard
        </Button>
        <Button appearance="secondary" icon={<ClipboardCheck size={16} />} onClick={onLog}>
          Log as drafted
        </Button>
        <Button
          appearance="secondary"
          icon={<PauseCircle size={16} />}
          onClick={onToggleHeld}
        >
          {held ? 'Release hold' : 'Mark held, awaiting reply'}
        </Button>
        {channel === 'email' && (
          <Button appearance="secondary" icon={<Send size={16} />} disabled>
            Send via Outlook (later)
          </Button>
        )}
      </div>

      <Caption1 className={styles.caption}>
        This tool never auto-sends (ADR-0003) — it drafts only. Copy the text or log it as drafted;
        the actual send is a flow / user action.
      </Caption1>
    </div>
  );
}
