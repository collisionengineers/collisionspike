/**
 * ConfirmActionCard — explicit staff confirmation for assistant-proposed writes.
 *
 * Existing targets are independently re-read immediately before the card becomes
 * confirmable. The card renders a capability-specific before/after comparison over
 * that fresh snapshot and carries its version in If-Match. It never trusts model prose
 * or exposes a raw route/body as the review surface.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Caption1,
  Body1,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Check, X, AlertTriangle, ArrowRight } from 'lucide-react';
import { getDataAccess } from '../data';
import type { Case, InboundEmail, ProposedAction, ProposalExecutionResult } from '../data';

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
  changes: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  changeRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(88px, 0.75fr) minmax(0, 1fr) auto minmax(0, 1fr)',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  key: { color: tokens.colorNeutralForeground3 },
  before: { color: tokens.colorNeutralForeground3, overflowWrap: 'anywhere' },
  after: { color: tokens.colorNeutralForeground1, overflowWrap: 'anywhere' },
  arrow: { color: tokens.colorNeutralForeground3, flexShrink: 0 },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalXS,
  },
  warn: {
    color: tokens.colorStatusWarningForeground1,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  ok: {
    color: tokens.colorStatusSuccessForeground1,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
});

export type ConfirmPhase =
  | 'loading'
  | 'ready'
  | 'submitting'
  | 'done'
  | 'stale'
  | 'error'
  | 'gone';

export type ConfirmationTarget =
  | { kind: 'case'; id: string }
  | { kind: 'inbound'; id: string }
  | { kind: 'none' }
  | { kind: 'unsupported' };

export type ConfirmationSnapshot =
  | { kind: 'case'; value: Case }
  | { kind: 'inbound'; value: InboundEmail }
  | { kind: 'none' };

export interface ConfirmationRow {
  label: string;
  before: string;
  after: string;
}

const CASE_CAPABILITIES = new Set([
  'set_on_hold',
  'edit_case_fields',
  'save_inspection_decision',
  'log_chase',
]);
const INBOUND_CAPABILITIES = new Set(['set_triage_state', 'reclassify_inbound']);

const EVA_LABELS: Record<string, string> = {
  workProvider: 'Work provider',
  vehicleModel: 'Vehicle model',
  claimantName: 'Claimant name',
  claimantTelephone: 'Claimant telephone',
  claimantEmail: 'Claimant email',
  dateOfLoss: 'Date of incident',
  dateOfInstruction: 'Date of instruction',
  accidentCircumstances: 'Accident circumstances',
  inspectionAddress: 'Inspection address',
  vatStatus: 'VAT status',
  mileage: 'Mileage',
  mileageUnit: 'Mileage unit',
};

function proposalValue(action: ProposedAction, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(action.params, key)) return action.params[key];
  return action.body[key];
}

function text(value: unknown, empty = 'Not set'): string {
  if (value === null || value === undefined) return empty;
  const result = String(value).trim();
  return result || empty;
}

function friendlyToken(value: unknown, empty = 'Not set'): string {
  const raw = text(value, empty);
  if (raw === empty) return raw;
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^./, (first) => first.toUpperCase());
}

function caseType(value: unknown): string {
  const raw = text(value);
  const labels: Record<string, string> = {
    standard: 'Standard',
    audit: 'Audit',
    audit_total_loss: 'Total-loss audit',
    diminution: 'Diminution',
  };
  return labels[raw] ?? friendlyToken(raw);
}

function inspectionMethod(value: unknown): string {
  const labels: Record<string, string> = {
    confirmed_physical: 'Physical address',
    manual: 'Physical address',
    address: 'Physical address',
    image_based: 'Image-based assessment',
    unknown: 'Not decided',
  };
  const raw = text(value, 'unknown');
  return labels[raw] ?? friendlyToken(raw);
}

function triageState(value: unknown): string {
  const labels: Record<string, string> = {
    new: 'New',
    routed: 'Routed',
    actioned: 'Actioned',
    dismissed: 'Dismissed',
  };
  const raw = text(value);
  return labels[raw] ?? friendlyToken(raw);
}

function chaseChannel(value: unknown): string {
  return text(value).toLowerCase() === 'whatsapp' ? 'WhatsApp' : 'Email';
}

/** Determine which independently versioned row a capability must review. */
export function targetForProposal(action: ProposedAction): ConfirmationTarget {
  if (action.capability === 'create_case') return { kind: 'none' };
  if (CASE_CAPABILITIES.has(action.capability)) {
    const id = proposalValue(action, 'caseId');
    return typeof id === 'string' && id.trim()
      ? { kind: 'case', id: id.trim() }
      : { kind: 'unsupported' };
  }
  if (INBOUND_CAPABILITIES.has(action.capability)) {
    const id = proposalValue(action, 'inboundId');
    return typeof id === 'string' && id.trim()
      ? { kind: 'inbound', id: id.trim() }
      : { kind: 'unsupported' };
  }
  return { kind: 'unsupported' };
}

function caseSnapshot(snapshot: ConfirmationSnapshot): Case | undefined {
  return snapshot.kind === 'case' ? snapshot.value : undefined;
}

function inboundSnapshot(snapshot: ConfirmationSnapshot): InboundEmail | undefined {
  return snapshot.kind === 'inbound' ? snapshot.value : undefined;
}

/** Build only staff-recognisable, capability-specific comparisons. No raw request keys,
 *  transport method, route, or model prose reaches the card. */
export function buildConfirmationRows(
  action: ProposedAction,
  snapshot: ConfirmationSnapshot,
): ConfirmationRow[] {
  const currentCase = caseSnapshot(snapshot);
  const currentInbound = inboundSnapshot(snapshot);

  switch (action.capability) {
    case 'set_on_hold': {
      if (!currentCase) return [];
      return [
        {
          label: 'Case state',
          before: currentCase.onHold ? 'Held' : 'Active',
          after: proposalValue(action, 'onHold') === true ? 'Held' : 'Active',
        },
      ];
    }

    case 'edit_case_fields': {
      if (!currentCase) return [];
      const rows: ConfirmationRow[] = [];
      const vrm = proposalValue(action, 'vrm');
      if (vrm !== undefined) {
        rows.push({ label: 'Registration', before: text(currentCase.vrm), after: text(vrm) });
      }
      const proposedCaseType = proposalValue(action, 'caseType');
      if (proposedCaseType !== undefined) {
        rows.push({
          label: 'Case type',
          before: caseType(currentCase.caseType ?? 'standard'),
          after: caseType(proposedCaseType),
        });
      }
      const proposedFields = proposalValue(action, 'evaFields');
      if (proposedFields && typeof proposedFields === 'object' && !Array.isArray(proposedFields)) {
        for (const [key, value] of Object.entries(proposedFields as Record<string, unknown>)) {
          const label = EVA_LABELS[key];
          if (!label) continue;
          const existing = currentCase.evaFields[key as keyof Case['evaFields']];
          rows.push({ label, before: text(existing?.value), after: text(value) });
        }
      }
      return rows;
    }

    case 'save_inspection_decision': {
      if (!currentCase) return [];
      const mode = proposalValue(action, 'decisionMode');
      const lines = proposalValue(action, 'addressLines');
      const address = Array.isArray(lines)
        ? lines.map((line) => text(line, '')).filter(Boolean)
        : [];
      const postcode = text(proposalValue(action, 'postcode'), '');
      if (postcode) address.push(postcode);
      const afterDetails =
        text(mode, 'unknown') === 'image_based'
          ? text(proposalValue(action, 'sourceNote'), 'Reason not supplied')
          : address.join(', ') || text(proposalValue(action, 'sourceNote'));
      return [
        {
          label: 'Inspection method',
          before: inspectionMethod(currentCase.inspectionDecision),
          after: inspectionMethod(mode),
        },
        {
          label: 'Decision details',
          before: text(currentCase.evaFields.inspectionAddress.value),
          after: afterDetails,
        },
      ];
    }

    case 'log_chase': {
      if (!currentCase) return [];
      const latest = currentCase.chasers[currentCase.chasers.length - 1];
      const proposed = `${chaseChannel(proposalValue(action, 'channel'))} · ${text(
        proposalValue(action, 'templateLabel'),
      )}`;
      const rows: ConfirmationRow[] = [
        {
          label: 'Latest chase',
          before: latest
            ? `${chaseChannel(latest.channel)} · ${text(latest.templateUsed)}`
            : 'No chase recorded',
          after: proposed,
        },
      ];
      const note = proposalValue(action, 'note');
      if (typeof note === 'string' && note.trim()) {
        rows.push({ label: 'New note', before: 'No new note', after: note.trim() });
      }
      return rows;
    }

    case 'set_triage_state': {
      if (!currentInbound) return [];
      return [
        {
          label: 'Email state',
          before: triageState(currentInbound.triageState),
          after: triageState(proposalValue(action, 'state')),
        },
      ];
    }

    case 'reclassify_inbound': {
      if (!currentInbound) return [];
      const rows: ConfirmationRow[] = [
        {
          label: 'Email type',
          before: friendlyToken(currentInbound.category),
          after: friendlyToken(proposalValue(action, 'category')),
        },
      ];
      const subtype = proposalValue(action, 'subtype');
      if (subtype !== undefined) {
        rows.push({
          label: 'Email detail',
          before: friendlyToken(currentInbound.subtype),
          after: friendlyToken(subtype),
        });
      }
      return rows;
    }

    case 'create_case': {
      if (snapshot.kind !== 'none') return [];
      const rows: ConfirmationRow[] = [
        {
          label: 'Registration',
          before: 'No case',
          after: text(proposalValue(action, 'vrm')),
        },
      ];
      const provider = proposalValue(action, 'providerCode');
      if (provider !== undefined) {
        rows.push({ label: 'Work provider', before: 'No case', after: text(provider) });
      }
      const claimant = proposalValue(action, 'claimantName');
      if (claimant !== undefined) {
        rows.push({ label: 'Claimant', before: 'No case', after: text(claimant) });
      }
      return rows;
    }

    default:
      return [];
  }
}

/** Pure transition used by the card and focused tests. */
export function phaseForExecution(result: ProposalExecutionResult): ConfirmPhase {
  if (result.ok) return 'done';
  if (result.status === 409 || result.status === 428) return 'stale';
  return 'error';
}

export function ConfirmActionCard({ action, onDone }: { action: ProposedAction; onDone?: () => void }) {
  const styles = useStyles();
  const [phase, setPhase] = useState<ConfirmPhase>('loading');
  const [version, setVersion] = useState<string | undefined>();
  const [snapshot, setSnapshot] = useState<ConfirmationSnapshot | undefined>();
  const [message, setMessage] = useState('');
  const [errorStage, setErrorStage] = useState<'load' | 'submit'>('load');
  const requestSequence = useRef(0);
  const target = useMemo(() => targetForProposal(action), [action]);

  const refetch = useCallback(async () => {
    const request = ++requestSequence.current;
    setPhase('loading');
    setMessage('');
    setVersion(undefined);
    setSnapshot(undefined);
    setErrorStage('load');

    if (target.kind === 'unsupported') {
      setMessage('This change cannot be checked here. Dismiss it and make the change from the case or inbox.');
      setPhase('error');
      return;
    }

    if (target.kind === 'none') {
      const next: ConfirmationSnapshot = { kind: 'none' };
      if (buildConfirmationRows(action, next).length === 0) {
        setMessage('This change cannot be checked. Dismiss it and try again.');
        setPhase('error');
        return;
      }
      setSnapshot(next);
      setPhase('ready');
      return;
    }

    try {
      const result =
        target.kind === 'case'
          ? await getDataAccess().caseWithVersion(target.id)
          : await getDataAccess().inboundWithVersion(target.id);
      if (request !== requestSequence.current) return;
      if (result.state === 'unavailable') {
        setMessage(result.error);
        setPhase(result.reason === 'not_found' ? 'gone' : 'error');
        return;
      }
      const next: ConfirmationSnapshot =
        target.kind === 'case'
          ? { kind: 'case', value: result.value as Case }
          : { kind: 'inbound', value: result.value as InboundEmail };
      if (buildConfirmationRows(action, next).length === 0) {
        setMessage('This change cannot be checked. Dismiss it and try again.');
        setPhase('error');
        return;
      }
      setSnapshot(next);
      setVersion(result.version);
      setPhase('ready');
    } catch {
      if (request !== requestSequence.current) return;
      setMessage('The latest information could not be loaded.');
      setPhase('error');
    }
  }, [action, target]);

  useEffect(() => {
    void refetch();
    return () => {
      requestSequence.current += 1;
    };
  }, [refetch]);

  const confirm = useCallback(async () => {
    if (target.kind !== 'none' && !version) {
      setMessage('Review the latest information before confirming this change.');
      setPhase('stale');
      return;
    }
    setPhase('submitting');
    setMessage('');
    setErrorStage('submit');
    let result: ProposalExecutionResult;
    try {
      result = await getDataAccess().executeProposal(action, version);
    } catch {
      result = {
        ok: false,
        status: 0,
        error: 'We could not confirm whether that change was saved. Review the latest information and try again.',
      };
    }
    const next = phaseForExecution(result);
    setPhase(next);
    if (next === 'done') {
      onDone?.();
    } else {
      setMessage(
        result.error ??
          (next === 'stale'
            ? 'This information changed before the update was confirmed.'
            : 'That change was not saved. Please try again.'),
      );
    }
  }, [action, onDone, target.kind, version]);

  const rows = snapshot ? buildConfirmationRows(action, snapshot) : [];
  const canReviewLatest = target.kind === 'case' || target.kind === 'inbound';

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <Body1><strong>{action.title}</strong></Body1>
      </div>

      {phase === 'loading' && <Spinner size="tiny" label="Checking the latest…" labelPosition="after" />}

      {phase === 'gone' && (
        <Caption1 className={styles.warn}>
          <AlertTriangle size={14} /> {message || 'That item could not be found.'}
        </Caption1>
      )}

      {phase !== 'loading' && phase !== 'gone' && rows.length > 0 && (
        <ul className={styles.changes} aria-label="Proposed changes">
          {rows.map((row) => (
            <li key={`${row.label}:${row.after}`} className={styles.changeRow}>
              <Caption1 className={styles.key}>{row.label}</Caption1>
              <Caption1 className={styles.before}>{row.before}</Caption1>
              <ArrowRight className={styles.arrow} size={14} aria-hidden="true" />
              <Caption1 className={styles.after}><strong>{row.after}</strong></Caption1>
            </li>
          ))}
        </ul>
      )}

      {(phase === 'stale' || phase === 'error') && (
        <Caption1 className={styles.warn}>
          <AlertTriangle size={14} /> {message}
        </Caption1>
      )}
      {phase === 'done' && <Caption1 className={styles.ok}><Check size={14} /> Done.</Caption1>}

      {phase === 'ready' && (
        <div className={styles.actions}>
          <Button appearance="primary" size="small" icon={<Check size={14} />} onClick={() => void confirm()}>
            Confirm
          </Button>
          <Button appearance="subtle" size="small" icon={<X size={14} />} onClick={() => onDone?.()}>
            Dismiss
          </Button>
        </div>
      )}

      {phase === 'error' && (
        <div className={styles.actions}>
          {errorStage === 'load' || !canReviewLatest ? (
            <Button appearance="secondary" size="small" onClick={() => void refetch()}>
              Retry
            </Button>
          ) : (
            <Button appearance="secondary" size="small" onClick={() => void refetch()}>
              Review latest
            </Button>
          )}
          <Button appearance="subtle" size="small" onClick={() => onDone?.()}>
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

      {phase === 'gone' && (
        <div className={styles.actions}>
          <Button appearance="subtle" size="small" onClick={() => onDone?.()}>
            Dismiss
          </Button>
        </div>
      )}

      {phase === 'submitting' && <Spinner size="tiny" label="Applying…" labelPosition="after" />}
    </div>
  );
}
