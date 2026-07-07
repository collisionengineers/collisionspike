/**
 * ConfirmActionCard — the human-confirm gate for an assistant-proposed write (TKT-111).
 *
 * The model NEVER performs a write. It emits a ProposedAction; this card:
 *   1. independently RE-FETCHES the target case (never trusting the model's view of state),
 *   2. renders the STRUCTURED route + params the SPA will POST (never model prose), and
 *   3. only on an explicit human confirm POSTs to the existing staff-authorized route, carrying
 *      the re-fetched version as If-Match so a concurrent edit 409s instead of clobbering.
 *
 * Dark until ASSISTANT_WRITE_TIER_ENABLED flips — the drawer only receives proposals then.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Caption1,
  Body1,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Check, X, AlertTriangle } from 'lucide-react';
import { getDataAccess } from '../data';
import type { ProposedAction } from '../data';

const useStyles = makeStyles({
  card: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, padding: tokens.spacingHorizontalM, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, backgroundColor: tokens.colorNeutralBackground2 },
  head: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  changes: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, margin: 0, padding: 0, listStyle: 'none' },
  changeRow: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'baseline' },
  key: { color: tokens.colorNeutralForeground3, minWidth: '96px' },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalXS },
  warn: { color: tokens.colorStatusWarningForeground1, display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  ok: { color: tokens.colorStatusSuccessForeground1 },
});

type Phase = 'loading' | 'ready' | 'submitting' | 'done' | 'stale' | 'error' | 'gone';

function firstString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function ConfirmActionCard({ action, onDone }: { action: ProposedAction; onDone?: () => void }) {
  const styles = useStyles();
  const [phase, setPhase] = useState<Phase>('loading');
  const [etag, setEtag] = useState<string | undefined>(undefined);
  const [currentSummary, setCurrentSummary] = useState<string>('');

  const caseId = typeof action.params.caseId === 'string' ? action.params.caseId : undefined;

  // Independently re-fetch the target so the human confirms against SERVER truth, not the model's.
  const refetch = useCallback(async () => {
    setPhase('loading');
    if (!caseId) {
      setPhase('ready'); // non-case target (e.g. inbound) — no case re-fetch; still human-confirmed
      return;
    }
    const { case: c, etag: tag } = await getDataAccess().caseWithVersion(caseId);
    if (!c) {
      setPhase('gone');
      return;
    }
    setEtag(tag);
    setCurrentSummary(
      [c.casePo ?? c.vrm, c.onHold ? 'currently Held' : 'not on hold', c.provider].filter(Boolean).join(' · '),
    );
    setPhase('ready');
  }, [caseId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const confirm = useCallback(async () => {
    setPhase('submitting');
    const res = await getDataAccess().executeProposal(action, etag);
    if (res.ok) {
      setPhase('done');
      onDone?.();
    } else if (res.status === 409) {
      setPhase('stale');
    } else {
      setPhase('error');
    }
  }, [action, etag, onDone]);

  const changes = Object.entries(action.body);

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <Body1><strong>{action.title}</strong></Body1>
      </div>

      {phase === 'loading' && <Spinner size="tiny" label="Checking the latest…" labelPosition="after" />}

      {phase === 'gone' && <Caption1 className={styles.warn}><AlertTriangle size={14} /> That case no longer exists.</Caption1>}

      {phase !== 'loading' && phase !== 'gone' && (
        <>
          {currentSummary && <Caption1 className={styles.key}>Now: {currentSummary}</Caption1>}
          <ul className={styles.changes}>
            {changes.map(([k, v]) => (
              <li key={k} className={styles.changeRow}>
                <Caption1 className={styles.key}>{k}</Caption1>
                <Caption1>→ {firstString(v)}</Caption1>
              </li>
            ))}
          </ul>
          <Caption1 className={styles.key}>{action.method} /{action.path}</Caption1>
        </>
      )}

      {phase === 'stale' && (
        <Caption1 className={styles.warn}>
          <AlertTriangle size={14} /> This case changed since I drafted this. Review the latest and try again.
        </Caption1>
      )}
      {phase === 'error' && <Caption1 className={styles.warn}><AlertTriangle size={14} /> That didn’t go through. Please try in the app.</Caption1>}
      {phase === 'done' && <Caption1 className={styles.ok}><Check size={14} /> Done.</Caption1>}

      {(phase === 'ready' || phase === 'error') && (
        <div className={styles.actions}>
          <Button appearance="primary" size="small" icon={<Check size={14} />} onClick={() => void confirm()}>
            Confirm
          </Button>
          <Button appearance="subtle" size="small" icon={<X size={14} />} onClick={() => onDone?.()}>
            Dismiss
          </Button>
        </div>
      )}
      {phase === 'stale' && (
        <div className={styles.actions}>
          <Button appearance="secondary" size="small" onClick={() => void refetch()}>
            Review latest
          </Button>
          <Button appearance="subtle" size="small" onClick={() => onDone?.()}>
            Dismiss
          </Button>
        </div>
      )}
      {phase === 'submitting' && <Spinner size="tiny" label="Applying…" labelPosition="after" />}
    </div>
  );
}
