
import { Outlet } from 'react-router-dom';
import { Button, Caption1, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, MessageBarTitle, Spinner, Textarea } from '@fluentui/react-components';
import { FolderClosed } from 'lucide-react';
import { ImageDeleteDialog } from '../../shared/ui/ImageDeleteDialog';
import type { useCaseDetailController } from './case-detail.controller';

type CaseDetailViewModel = ReturnType<typeof useCaseDetailController>;

export function CaseDetailDialogs(props: CaseDetailViewModel) {
  const { c, cancelDeleteImage, confirmDeleteImage, deleteImageError, deleteImageTarget, deletingImage, discardOpen, doRemove, navigationBlocker, removeAckBox, removeConfirmText, removeConfirmed, removeMatch, removeOpen, removeReason, removing, restorePersistedDraft, savingEdits, setDiscardOpen, setRemoveAckBox, setRemoveConfirmText, setRemoveOpen, setRemoveReason, styles } = props;
  return (
    <>
      <Dialog
        open={discardOpen}
        modalType="modal"
        onOpenChange={(_, detail) => {
          if (!detail.open && !savingEdits) setDiscardOpen(false);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogContent>
              The case will return to the last saved values.
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDiscardOpen(false)}>
                Keep editing
              </Button>
              <Button appearance="primary" onClick={restorePersistedDraft}>
                Discard changes
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog
        open={navigationBlocker.state === 'blocked'}
        modalType="modal"
        onOpenChange={(_, detail) => {
          if (!detail.open && navigationBlocker.state === 'blocked') navigationBlocker.reset();
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogContent>
              This case has unsaved changes. Stay to save them, or leave and discard them.
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                onClick={() => {
                  if (navigationBlocker.state === 'blocked') navigationBlocker.reset();
                }}
              >
                Stay on case
              </Button>
              <Button
                appearance="primary"
                onClick={() => {
                  if (navigationBlocker.state === 'blocked') navigationBlocker.proceed();
                }}
              >
                Leave without saving
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Close-case confirmation (TKT-010) — all staff. Typed confirm (kept as
          deliberate friction) + the archive ACK; the server sets the terminal
          soft state, keeps every detail, and never auto-deletes the Box folder. */}
      <Dialog
        open={removeOpen}
        modalType="modal"
        onOpenChange={(_, d) => {
          if (!d.open && !removing) setRemoveOpen(false);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Close case</DialogTitle>
            <DialogContent className={styles.removeBody}>
              <MessageBar intent="info" icon={<FolderClosed size={20} />}>
                <MessageBarBody>
                  <MessageBarTitle>Close case — it will leave the work queues</MessageBarTitle>
                  Nothing is deleted. Every detail stays on the record, and the case no longer
                  appears as work to do.
                </MessageBarBody>
              </MessageBar>

              <div className={styles.removeFacts}>
                <span className={styles.factKey}>Case</span>
                <span className={styles.factVal}>{c.casePo || c.id}</span>
                <span className={styles.factKey}>Registration</span>
                <span className={styles.factVal}>{c.vrm}</span>
                <span className={styles.factKey}>Provider</span>
                <span className={styles.factVal}>{c.provider}</span>
                {c.evaFields.claimantName.value && (
                  <>
                    <span className={styles.factKey}>Claimant</span>
                    <span className={styles.factVal}>{c.evaFields.claimantName.value}</span>
                  </>
                )}
              </div>

              <Field label={`Type ${removeMatch} to confirm`} required>
                <Input
                  value={removeConfirmText}
                  onChange={(_, d) => setRemoveConfirmText(d.value)}
                  placeholder={removeMatch}
                  aria-label="Type the case reference to confirm closing"
                />
              </Field>

              <Checkbox
                checked={removeAckBox}
                onChange={(_, d) => setRemoveAckBox(d.checked === true)}
                label="I’ve handled the archive folder separately"
              />
              <Caption1 className={styles.hint}>
                The archive folder is never removed automatically. Handle it separately.
              </Caption1>

              <Field label="Reason (optional)">
                <Textarea
                  value={removeReason}
                  onChange={(_, d) => setRemoveReason(d.value)}
                  resize="vertical"
                  rows={2}
                />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setRemoveOpen(false)} disabled={removing}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                icon={removing ? <Spinner size="tiny" /> : <FolderClosed size={16} />}
                disabled={!removeConfirmed || removing}
                onClick={() => void doRemove()}
              >
                {removing ? 'Closing…' : 'Close case'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Delete case image (TKT-160) — presentational confirmation only; the
          mutation belongs solely to onConfirm, so dismiss/cancel never deletes. */}
      <ImageDeleteDialog
        open={deleteImageTarget !== undefined}
        fileName={deleteImageTarget?.fileName}
        busy={deletingImage}
        error={deleteImageError}
        onCancel={cancelDeleteImage}
        onConfirm={() => void confirmDeleteImage()}
      />

      {/* Nested /case/:id/submit dialog overlay. */}
      <Outlet />
    </>
  );
}
