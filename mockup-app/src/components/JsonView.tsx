import {
  Button,
  makeStyles,
  tokens,
  useToastController,
  Toast,
  ToastTitle,
} from '@fluentui/react-components';
import { Download } from 'lucide-react';
import { GLOBAL_TOASTER_ID } from './toaster';

/* Read-only monospace JSON viewer with a Download button (saves a .json file). */

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
  downloadBtn: { position: 'absolute', top: tokens.spacingVerticalS, right: tokens.spacingHorizontalS },
});

export interface JsonViewProps {
  /** Object to render (will be JSON.stringified) OR a pre-formatted string. */
  data: unknown;
  /** Optional aria-label / download-toast noun. Default "JSON". */
  label?: string;
  /** Optional download filename. Defaults to a slugified `label` + ".json". */
  filename?: string;
}

function slugFilename(label: string): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'data';
  return `${base}.json`;
}

/** Read-only JSON block + Download-as-file (no clipboard). */
export function JsonView({ data, label = 'JSON', filename }: JsonViewProps) {
  const styles = useStyles();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const name = filename ?? slugFilename(label);

  const onDownload = () => {
    try {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      dispatchToast(
        <Toast>
          <ToastTitle>{label} downloaded ({name})</ToastTitle>
        </Toast>,
        { intent: 'success' },
      );
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t download — try again</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    }
  };

  return (
    <div className={styles.root}>
      <Button
        className={styles.downloadBtn}
        size="small"
        appearance="secondary"
        icon={<Download size={14} />}
        onClick={onDownload}
      >
        Download
      </Button>
      <pre className={styles.pre} aria-label={label}>
        {text}
      </pre>
    </div>
  );
}
