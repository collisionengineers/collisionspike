import { useEffect, useState } from 'react';
import { Badge, Button, Caption1, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, MessageBarTitle, Spinner, Text, Toast, ToastBody, ToastTitle, Tooltip, useToastController } from '@fluentui/react-components';
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { GLOBAL_TOASTER_ID } from '../../shared/ui';
import { useIsSuperuser } from '../../shared/ui/useIsSuperuser';
import { getDataAccess, type Provider } from '../../data';
import type { ProviderApiKey } from '@cs/domain';
import { useStyles } from './admin.styles';

function fmtKeyDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

export function ProviderAccess({ provider }: { provider: Provider }) {
  const styles = useStyles();
  const isSuperuser = useIsSuperuser();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const [keys, setKeys] = useState<ProviderApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [minting, setMinting] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const refresh = async () => {
    const api = getDataAccess();
    if (!api.listProviderApiKeys) return;
    setLoading(true);
    try {
      setKeys(await api.listProviderApiKeys(provider.id));
    } catch {
      /* a failed read leaves the (possibly stale) list; the mint/revoke toasts carry errors */
    } finally {
      setLoading(false);
    }
  };

  // Only authorised management users may load or change provider access codes.
  useEffect(() => {
    if (isSuperuser) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id, isSuperuser]);

  const openMint = () => {
    setLabel('');
    setPlaintext(null);
    setDialogOpen(true);
  };

  const mint = async () => {
    const api = getDataAccess();
    if (!api.createProviderApiKey || !label.trim()) return;
    setMinting(true);
    try {
      const res = await api.createProviderApiKey(provider.id, { label: label.trim() });
      setPlaintext(res.plaintextKey); // shown ONCE — the dialog stays open on this reveal
      void refresh();
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t create the access code</ToastTitle>
          <ToastBody>Ask a manager to check your access, then try again.</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setMinting(false);
    }
  };

  const copyPlaintext = async () => {
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      dispatchToast(
        <Toast>
          <ToastTitle>Access code copied</ToastTitle>
        </Toast>,
        { intent: 'success' },
      );
    } catch {
      /* clipboard may be blocked — the value is still visible for a manual copy */
    }
  };

  const revoke = async (keyId: string) => {
    const api = getDataAccess();
    if (!api.revokeProviderApiKey) return;
    setRevoking(keyId);
    try {
      await api.revokeProviderApiKey(provider.id, keyId);
      dispatchToast(
        <Toast>
          <ToastTitle>Access revoked</ToastTitle>
        </Toast>,
        { intent: 'success' },
      );
      void refresh();
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t revoke this access</ToastTitle>
          <ToastBody>Ask a manager to check your access, then try again.</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setRevoking(null);
    }
  };

  return (
    <Field
      label="Direct intake access"
      hint="An access code lets this provider's own system lodge cases directly instead of sending email. The code is shown once."
    >
      <div className={styles.keySection}>
        {!isSuperuser ? (
          <Caption1 className={styles.fieldHint}>
            <KeyRound size={13} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }} />
            Management access is required to manage direct intake.
          </Caption1>
        ) : (
          <>
            {loading && keys.length === 0 ? (
              <Caption1 className={styles.fieldHint}>Loading access…</Caption1>
            ) : keys.length === 0 ? (
              <Caption1 className={styles.fieldHint}>No direct intake access yet.</Caption1>
            ) : (
              <div className={styles.keyList}>
                {keys.map((k) => (
                  <div key={k.id} className={styles.keyRow}>
                    <Text weight="semibold">{k.label || 'Unnamed access'}</Text>
                    <span className={styles.keyPrefixMono}>{k.keyPrefix}…</span>
                    {k.revokedAt ? (
                      <Badge appearance="tint" color="danger" shape="rounded" size="small">
                        Revoked
                      </Badge>
                    ) : (
                      <Badge appearance="filled" color="success" shape="rounded" size="small">
                        Active
                      </Badge>
                    )}
                    <span className={styles.keyRowSpacer} />
                    <Caption1 className={styles.keyMeta}>
                      created {fmtKeyDate(k.createdAt)} · last used {fmtKeyDate(k.lastUsedAt)}
                    </Caption1>
                    {!k.revokedAt && (
                      <Tooltip content="Revoke this access" relationship="label">
                        <Button
                          appearance="subtle"
                          size="small"
                          icon={revoking === k.id ? <Spinner size="tiny" /> : <Trash2 size={14} />}
                          disabled={revoking === k.id}
                          onClick={() => void revoke(k.id)}
                          aria-label={`Revoke ${k.label || 'access'}`}
                        />
                      </Tooltip>
                    )}
                  </div>
                ))}
              </div>
            )}
            <Button appearance="secondary" icon={<Plus size={16} />} onClick={openMint}>
              Create access code
            </Button>
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(_, d) => setDialogOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {plaintext ? 'Copy your new access code now' : 'Create an access code'}
            </DialogTitle>
            <DialogContent>
              {plaintext ? (
                <div className={styles.keySection}>
                  <MessageBar intent="warning">
                    <MessageBarBody>
                      <MessageBarTitle>This is the only time the code is shown</MessageBarTitle>
                      Copy it now and store it securely. It cannot be retrieved again — if it’s
                      lost, revoke it and generate a new one.
                    </MessageBarBody>
                  </MessageBar>
                  <div className={styles.plaintextValue}>{plaintext}</div>
                  <Button appearance="primary" icon={<Copy size={16} />} onClick={() => void copyPlaintext()}>
                      Copy access code
                  </Button>
                </div>
              ) : (
                <Field label="Name" hint="A name staff will recognise, such as ‘Main provider system’.">
                  <Input
                    value={label}
                    onChange={(_, d) => setLabel(d.value)}
                    placeholder="Main provider system"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && label.trim() && !minting) {
                        e.preventDefault();
                        void mint();
                      }
                    }}
                  />
                </Field>
              )}
            </DialogContent>
            <DialogActions>
              {plaintext ? (
                <Button appearance="primary" onClick={() => setDialogOpen(false)}>
                  Done
                </Button>
              ) : (
                <>
                  <Button appearance="secondary" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    appearance="primary"
                    icon={minting ? <Spinner size="tiny" /> : <KeyRound size={16} />}
                    disabled={!label.trim() || minting}
                    onClick={() => void mint()}
                  >
                    {minting ? 'Creating…' : 'Create'}
                  </Button>
                </>
              )}
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </Field>
  );
}
