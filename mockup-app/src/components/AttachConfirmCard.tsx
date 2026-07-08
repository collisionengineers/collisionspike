/**
 * AttachConfirmCard — the human-confirm gate for adding attached files to a case (TKT-068).
 *
 * The assistant MODEL never uploads (TKT-060 read-only invariant). The handler attaches
 * photos/PDFs in the drawer; the model resolves the target case conversationally; then THIS
 * card:
 *   1. resolves the target case INDEPENDENTLY against the server (openVrmTwins by
 *      registration — never trusting the model's view of state), showing server truth,
 *   2. names the target case + file count, and
 *   3. only on an explicit human confirm calls the staff-authorised upload route
 *      (getDataAccess().uploadEvidence) — the bytes come from the human's file picker.
 *
 * Mirrors ConfirmActionCard's shape (TKT-111): re-fetch, render, confirm.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Caption1,
  Body1,
  Spinner,
  Input,
  Radio,
  RadioGroup,
  Field,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Check, X, AlertTriangle, Search } from 'lucide-react';
import { getDataAccess, statusToQueue, type Case } from '../data';
import { fileCountLabel } from './attach-validate';

const useStyles = makeStyles({
  card: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    padding: tokens.spacingHorizontalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  head: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  files: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, margin: 0, padding: 0, listStyle: 'none' },
  fileRow: { color: tokens.colorNeutralForeground2, wordBreak: 'break-word' },
  find: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'flex-end' },
  findInput: { flex: '1 1 auto' },
  matchLabel: { display: 'flex', flexDirection: 'column' },
  matchSub: { color: tokens.colorNeutralForeground3 },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalXS, flexWrap: 'wrap' },
  warn: { color: tokens.colorStatusWarningForeground1, display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  ok: { color: tokens.colorStatusSuccessForeground1, display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  key: { color: tokens.colorNeutralForeground3 },
});

type Phase = 'need-ref' | 'searching' | 'matches' | 'none' | 'submitting' | 'done' | 'error';

/** Handler-facing queue word for a case (never a raw status enum — AGENTS.md UI-language rule). */
function queueLabel(c: Case): string {
  if (c.onHold) return 'Held';
  const q = statusToQueue(c.status);
  return q === 'not-ready' ? 'Not ready' : q === 'review' ? 'Review' : q === 'held' ? 'Held' : 'Closed';
}

/** How the target case is named to the handler: its Case/PO, else its registration. */
function caseLabel(c: Case): string {
  return c.casePo || c.vrm || 'this case';
}

export function AttachConfirmCard({
  files,
  suggestedVrm,
  onDone,
}: {
  files: File[];
  suggestedVrm?: string;
  onDone: () => void;
}) {
  const styles = useStyles();
  const [reg, setReg] = useState(suggestedVrm ?? '');
  const [phase, setPhase] = useState<Phase>(suggestedVrm ? 'searching' : 'need-ref');
  const [matches, setMatches] = useState<Case[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [feedback, setFeedback] = useState<string>('');

  const selected = matches.find((m) => m.id === selectedId);

  // Resolve the target case INDEPENDENTLY against the server (open cases sharing this
  // registration) — server truth, never the model's word. openVrmTwins is ungated.
  const search = useCallback(async (registration: string) => {
    const q = registration.trim();
    if (!q) {
      setPhase('need-ref');
      return;
    }
    setPhase('searching');
    setFeedback('');
    setSelectedId(undefined);
    try {
      const found = await getDataAccess().openVrmTwins(q);
      setMatches(found);
      if (found.length === 0) {
        setPhase('none');
      } else {
        if (found.length === 1) setSelectedId(found[0].id);
        setPhase('matches');
      }
    } catch {
      setMatches([]);
      setPhase('none');
      setFeedback("I couldn't look that up right now. Check the registration and try again.");
    }
  }, []);

  // Auto-resolve once when the conversation handed us a registration to pre-fill.
  useEffect(() => {
    if (suggestedVrm) void search(suggestedVrm);
    // Only on first mount for the pre-filled registration; later searches are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = useCallback(async () => {
    if (!selected) return;
    setPhase('submitting');
    const res = await getDataAccess().uploadEvidence(selected.id, files);
    const addedN = res.added.length;
    const rejected = res.rejected;
    if (addedN > 0) {
      let msg = `${fileCountLabel(addedN)} added to ${caseLabel(selected)}.`;
      if (rejected.length) {
        msg += ` ${fileCountLabel(rejected.length)} couldn't be added: ${rejected
          .map((r) => `${r.fileName} — ${r.reason}`)
          .join('; ')}`;
      }
      setFeedback(msg);
      setPhase('done');
    } else if (rejected.length) {
      // Server turned everything away — surface its plain-language reasons.
      setFeedback(
        `Those files couldn't be added: ${rejected.map((r) => `${r.fileName} — ${r.reason}`).join('; ')}`,
      );
      setPhase('error');
    } else {
      setFeedback(
        "I couldn't add those files right now. You can also add them from the case's Evidence tab.",
      );
      setPhase('error');
    }
  }, [selected, files]);

  const busy = phase === 'searching' || phase === 'submitting';

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <Body1>
          <strong>Add {fileCountLabel(files.length)} to a case</strong>
        </Body1>
      </div>

      <ul className={styles.files}>
        {files.map((f, i) => (
          <li key={i} className={styles.fileRow}>
            <Caption1>{f.name}</Caption1>
          </li>
        ))}
      </ul>

      {phase !== 'done' && (
        <div className={styles.find}>
          <Field label="Vehicle registration" className={styles.findInput}>
            <Input
              value={reg}
              onChange={(_e, d) => setReg(d.value)}
              placeholder="e.g. YT13 UTV"
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void search(reg);
                }
              }}
              aria-label="Vehicle registration of the case to add files to"
            />
          </Field>
          <Button
            appearance="secondary"
            icon={<Search size={16} />}
            onClick={() => void search(reg)}
            disabled={busy || !reg.trim()}
          >
            Find case
          </Button>
        </div>
      )}

      {phase === 'searching' && <Spinner size="tiny" label="Finding the case…" labelPosition="after" />}

      {phase === 'none' && (
        <Caption1 className={styles.warn}>
          <AlertTriangle size={14} />
          {feedback || 'I couldn’t find an open case for that registration. Check it and try again.'}
        </Caption1>
      )}

      {phase === 'matches' && matches.length === 1 && selected && (
        <Caption1>
          Adding to <strong>{caseLabel(selected)}</strong>
          {selected.vrm ? ` · ${selected.vrm}` : ''}
          {selected.provider ? ` · ${selected.provider}` : ''} · {queueLabel(selected)}
        </Caption1>
      )}

      {phase === 'matches' && matches.length > 1 && (
        <Field label="More than one open case shares that registration — pick one:">
          <RadioGroup value={selectedId ?? ''} onChange={(_e, d) => setSelectedId(d.value)}>
            {matches.map((m) => (
              <Radio
                key={m.id}
                value={m.id}
                label={
                  <span className={styles.matchLabel}>
                    <span>{caseLabel(m)}</span>
                    <Caption1 className={styles.matchSub}>
                      {[m.vrm, m.provider, queueLabel(m)].filter(Boolean).join(' · ')}
                    </Caption1>
                  </span>
                }
              />
            ))}
          </RadioGroup>
        </Field>
      )}

      {phase === 'submitting' && <Spinner size="tiny" label="Adding the files…" labelPosition="after" />}

      {phase === 'error' && (
        <Caption1 className={styles.warn}>
          <AlertTriangle size={14} /> {feedback}
        </Caption1>
      )}

      {phase === 'done' && (
        <Caption1 className={styles.ok}>
          <Check size={14} /> {feedback}
        </Caption1>
      )}

      <div className={styles.actions}>
        {(phase === 'matches' || phase === 'error') && (
          <Button
            appearance="primary"
            size="small"
            icon={<Check size={14} />}
            onClick={() => void confirm()}
            disabled={!selected}
          >
            Add {fileCountLabel(files.length)}
            {selected ? ` to ${caseLabel(selected)}` : ''}
          </Button>
        )}
        {phase === 'done' ? (
          <Button appearance="primary" size="small" onClick={() => onDone()}>
            Done
          </Button>
        ) : (
          <Button appearance="subtle" size="small" icon={<X size={14} />} onClick={() => onDone()}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
