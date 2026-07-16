import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Divider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
  Toast,
  ToastBody,
  ToastTitle,
  makeStyles,
  mergeClasses,
  tokens,
  useToastController,
} from '@fluentui/react-components';
import { GitMerge, ShieldQuestion } from 'lucide-react';
import { data, useCaseQuery, type Case } from '../../data';
import { GLOBAL_TOASTER_ID, StatusBadge, VrmPlate, statusLabel } from '../../shared/ui';

/* ============================================================
   MergeCaseDialog — staff manual merge (#4).

   Opened at /case/:caseId/merge as a route overlay over CaseDetail (same pattern
   as EvaSubmitDialog). Lets staff fold THIS case (e.g. an images-only case)
   into another OPEN, same-provider case (e.g. the instructions case) when
   auto-matching did NOT link them — the common "images arrived separately from
   the instructions" scenario.

   The chosen target is the SURVIVOR (keeps its Case/PO). This case's evidence is
   reparented onto it and this case becomes 'merged' (linked_to_instruction). The
   write is data.mergeCases — real against the Data API / Postgres; the empty
   default source rejects until the live REST source is injected, so the dialog
   surfaces a clear error if used offline.

   ADR-0010 guardrail honoured: same provider only (the candidate list + the
   data-layer both enforce it); cases are never merged across providers.
   ============================================================ */

const useStyles = makeStyles({
  surface: { maxWidth: '640px', width: '640px' },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxHeight: '70vh',
    overflowY: 'auto',
  },
  titleLockup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  sectionLabel: {
    fontFamily: 'var(--ce-font-display)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontSize: tokens.fontSizeBase200,
    color: 'var(--ce-muted)',
  },
  // Warning rail — a merge candidate is a duplicate to RESOLVE, not a blocker
  // (duplicates read warning post-reforge). --ce-warning-text, not -line: the
  // line amber fails the 3:1 non-text graphics floor on white.
  candidate: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: '3px solid var(--ce-warning-text)',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  candHead: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  candMeta: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: tokens.spacingHorizontalM,
    rowGap: '2px',
    fontSize: tokens.fontSizeBase200,
  },
  metaKey: { color: tokens.colorNeutralForeground3 },
  metaVal: { color: tokens.colorNeutralForeground2, fontFamily: 'var(--ce-font-mono)' },
  candActions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', marginTop: '2px' },
  rules: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
});

export function MergeCaseDialog() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { caseId } = useParams<{ caseId: string }>();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const { data: c, loading } = useCaseQuery(caseId);
  const close = () => navigate(caseId ? `/case/${caseId}` : '/');

  const [candidates, setCandidates] = useState<Case[] | undefined>();
  const [busyId, setBusyId] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    if (!c) return;
    void data
      .mergeCandidates(c.id)
      .then((list) => {
        if (!cancelled) setCandidates(list);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [c]);

  const doMerge = async (target: Case) => {
    if (!c) return;
    setBusyId(target.id);
    try {
      const res = await data.mergeCases(c.id, target.id);
      dispatchToast(
        <Toast>
          <ToastTitle>Cases merged</ToastTitle>
          <ToastBody>
            {`${c.casePo ?? c.vrm} merged into ${target.casePo ?? target.id}`}
            {res.movedEvidence > 0 ? ` — ${res.movedEvidence} item(s) of evidence moved.` : '.'}
          </ToastBody>
        </Toast>,
        { intent: 'success' },
      );
      navigate(`/case/${target.id}`);
    } catch (err) {
      setBusyId(undefined);
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t merge</ToastTitle>
          <ToastBody>{err instanceof Error ? err.message : 'Try again.'}</ToastBody>
        </Toast>,
        { intent: 'error' },
      );
    }
  };

  if (loading && !c) {
    return (
      <Dialog open modalType="modal" onOpenChange={(_, d) => !d.open && close()}>
        <DialogSurface className={styles.surface}>
          <DialogBody>
            <DialogTitle>Merge case</DialogTitle>
            <DialogContent>
              <Spinner size="medium" label="Loading case…" labelPosition="below" />
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={close}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    );
  }

  if (!c) {
    return (
      <Dialog open modalType="modal" onOpenChange={(_, d) => !d.open && close()}>
        <DialogSurface className={styles.surface}>
          <DialogBody>
            <DialogTitle>Merge case</DialogTitle>
            <DialogContent>Case not found.</DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={close}>
                Close
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    );
  }

  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>
            <span className={styles.titleLockup}>
              <span>Merge case</span>
              <VrmPlate vrm={c.vrm} size="medium" />
            </span>
          </DialogTitle>
          <DialogContent className={styles.body}>
            <MessageBar intent="warning" icon={<ShieldQuestion size={20} />}>
              <MessageBarBody>
                <MessageBarTitle>Pick the case to merge into</MessageBarTitle>
                The case you choose is kept (it keeps its Case/PO). This case’s evidence moves onto
                it and this case is marked merged. Cases with the same provider, or without a provider
                yet, are offered. Two cases with different providers are never merged.
              </MessageBarBody>
            </MessageBar>

            <div>
              <span className={styles.sectionLabel}>This case</span>
              <div className={styles.candMeta} style={{ marginTop: 6 }}>
                <span className={styles.metaKey}>Case</span>
                <span className={styles.metaVal}>{c.casePo ?? c.id}</span>
                <span className={styles.metaKey}>Provider</span>
                <span className={styles.metaVal}>
                  {c.provider} ({c.providerCode})
                </span>
                <span className={styles.metaKey}>Status</span>
                <span className={styles.metaVal}>{statusLabel(c.status)}</span>
              </div>
            </div>

            <Divider />

            <span className={styles.sectionLabel}>Merge into…</span>

            {candidates === undefined ? (
              <Spinner size="tiny" label="Finding open cases…" labelPosition="after" />
            ) : candidates.length === 0 ? (
              <MessageBar intent="info">
                <MessageBarBody>
                  No other eligible open case to merge into. Cases already merged or with a different
                  provider are not shown.
                </MessageBarBody>
              </MessageBar>
            ) : (
              candidates.map((tw) => (
                <div className={styles.candidate} key={tw.id}>
                  <div className={styles.candHead}>
                    <VrmPlate vrm={tw.vrm} size="small" />
                    <StatusBadge status={tw.status} size="small" />
                  </div>
                  <div className={styles.candMeta}>
                    <span className={styles.metaKey}>Case</span>
                    <span className={styles.metaVal}>{tw.casePo ?? tw.id}</span>
                    <span className={styles.metaKey}>Provider</span>
                    <span className={styles.metaVal}>
                      {tw.provider} ({tw.providerCode})
                    </span>
                    <span className={styles.metaKey}>Status</span>
                    <span className={styles.metaVal}>{statusLabel(tw.status)}</span>
                  </div>
                  <div className={styles.candActions}>
                    <Button
                      appearance="primary"
                      icon={<GitMerge size={16} />}
                      disabled={busyId !== undefined}
                      onClick={() => void doMerge(tw)}
                    >
                      {busyId === tw.id ? 'Merging…' : 'Merge into this case'}
                    </Button>
                  </div>
                </div>
              ))
            )}

            <Caption1 className={mergeClasses(styles.rules)}>
              <Text>
                The merge moves this case’s evidence onto the case you pick and marks this one merged.
                It can’t be undone from here — choose the surviving case carefully.
              </Text>
            </Caption1>
          </DialogContent>

          <DialogActions>
            <Button appearance="secondary" onClick={close}>
              Cancel
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export default MergeCaseDialog;
