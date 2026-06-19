import { useMemo, useState } from 'react';
import {
  Button,
  Dropdown,
  Field,
  Option,
  Radio,
  RadioGroup,
  Textarea,
  Toast,
  ToastTitle,
  makeStyles,
  tokens,
  useToastController,
} from '@fluentui/react-components';
import { Copy, ClipboardCheck } from 'lucide-react';
import type { Case, ChaserChannel } from '../data';
import { GLOBAL_TOASTER_ID } from './toaster';

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
];

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', alignItems: 'center' },
});

export interface ChaserPanelProps {
  case: Case;
  /** Called when the user logs the draft as a chase (the screen adds the note). */
  onLogChased?: (draft: { channel: ChaserChannel; templateLabel: string }) => void;
}

/** Channel-aware chaser composer. Drafts only — never sends. */
export function ChaserPanel({ case: c, onLogChased }: ChaserPanelProps) {
  const styles = useStyles();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const [channel, setChannel] = useState<ChaserChannel>('email');
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
    onLogChased?.({ channel, templateLabel: activeTemplate.label });
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
        <Button appearance="primary" icon={<Copy size={16} />} onClick={onCopy}>
          Copy to clipboard
        </Button>
        <Button appearance="secondary" icon={<ClipboardCheck size={16} />} onClick={onLog}>
          Log as chased
        </Button>
      </div>
    </div>
  );
}
