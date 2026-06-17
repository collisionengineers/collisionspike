import {
  Button,
  makeStyles,
  tokens,
  useToastController,
  Toast,
  ToastTitle,
} from '@fluentui/react-components';
import { Copy } from 'lucide-react';
import { GLOBAL_TOASTER_ID } from './toaster';

/* Read-only monospace JSON viewer with a Copy button (clipboard + toast). */

const useStyles = makeStyles({
  root: { position: 'relative' },
  pre: {
    margin: 0,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
    fontSize: tokens.fontSizeBase200,
    lineHeight: 1.5,
    color: tokens.colorNeutralForeground1,
    overflowX: 'auto',
    whiteSpace: 'pre',
    maxHeight: '460px',
  },
  copyBtn: { position: 'absolute', top: tokens.spacingVerticalS, right: tokens.spacingHorizontalS },
});

export interface JsonViewProps {
  /** Object to render (will be JSON.stringified) OR a pre-formatted string. */
  data: unknown;
  /** Optional aria-label / copy-toast noun. Default "JSON". */
  label?: string;
}

/** Read-only JSON block + Copy-to-clipboard with a confirmation toast. */
export function JsonView({ data, label = 'JSON' }: JsonViewProps) {
  const styles = useStyles();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      dispatchToast(
        <Toast>
          <ToastTitle>{label} copied to clipboard</ToastTitle>
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

  return (
    <div className={styles.root}>
      <Button
        className={styles.copyBtn}
        size="small"
        appearance="secondary"
        icon={<Copy size={14} />}
        onClick={onCopy}
      >
        Copy
      </Button>
      <pre className={styles.pre} aria-label={label}>
        {text}
      </pre>
    </div>
  );
}
