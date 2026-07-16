import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Trash2 } from 'lucide-react';

const useStyles = makeStyles({
  body: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

export interface ImageDeleteDialogProps {
  open: boolean;
  fileName?: string;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Presentational confirmation only. Store mutation belongs exclusively to the
 * caller's onConfirm; dismiss/cancel can therefore never invoke deletion. */
export function ImageDeleteDialog({
  open,
  fileName,
  busy,
  error,
  onCancel,
  onConfirm,
}: ImageDeleteDialogProps) {
  const styles = useStyles();
  return (
    <Dialog
      open={open}
      modalType="modal"
      onOpenChange={(_, detail) => {
        if (!detail.open && !busy) onCancel();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Delete image?</DialogTitle>
          <DialogContent className={styles.body}>
            <Text weight="semibold">{fileName}</Text>
            <Text>
              Delete this image from the case and its Archive folder? The source email or
              document will stay. This cannot be undone.
            </Text>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>
                  <MessageBarTitle>Image not deleted</MessageBarTitle>
                  {error}
                </MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              icon={busy ? <Spinner size="tiny" /> : <Trash2 size={16} />}
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? 'Deleting…' : error ? 'Try again' : 'Delete image'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
