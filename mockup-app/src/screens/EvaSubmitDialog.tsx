import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Radio,
  RadioGroup,
  Text,
  Toast,
  ToastBody,
  ToastTitle,
  makeStyles,
  tokens,
  useToastController,
} from '@fluentui/react-components';
import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  FolderClosed,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { buildEvaJson, type NextCasePoResult } from '@cs/domain';
import {
  data,
  suggestCasePo,
  useCaseQuery,
  type Case,
} from '../data';
import {
  GLOBAL_TOASTER_ID,
  ReadinessChecklist,
  VrmPlate,
  computeReadiness,
  statusLabel,
} from '../components';
import { Spinner } from '@fluentui/react-components';
import type { DataAccessExt } from '../data/rest-client';

/* EVA submit Dialog — opened at /case/:caseId/submit as a route overlay over
   CaseDetail. Controlled Dialog; Cancel / dismiss navigates back. Readiness
   gates the Submit button.

   The Case/PO is the HERO: when readiness is green the 13-tick wall collapses to
   a single reassurance line and the dialog leads with the Case/PO composer —
   locked Principal + YY segments, only the 3-digit sequence is editable — with
   the EVA (lowercase) + Box folder (UPPERCASE) forms rendered live below.

   MOCK ONLY — Submit and Export fire toasts, never a real network call. */

const useStyles = makeStyles({
  surface: { maxWidth: '680px', width: '680px' },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxHeight: '70vh',
    overflowY: 'auto',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  sectionLabel: {
    fontFamily: 'var(--ce-font-display)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontSize: tokens.fontSizeBase200,
    color: 'var(--ce-muted)',
  },

  /* Collapsed green-readiness reassurance line. */
  readyLine: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorPaletteGreenForeground1,
    fontSize: tokens.fontSizeBase300,
  },
  readyText: { color: tokens.colorNeutralForeground1 },
  readyGroups: {
    fontFamily: 'var(--ce-font-mono)',
    color: tokens.colorNeutralForeground2,
  },

  /* Case/PO hero card — charcoal top rule (reforge 2026-07-01 fork #2: the
     primary CTA carries the red; the hero rule is structure, not severity). */
  hero: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderTop: `2px solid var(--ce-charcoal)`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  heroHeading: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  heroHint: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  /* The locked Principal + YY + editable seq composer. */
  composer: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    fontFamily: 'var(--ce-font-mono)',
  },
  segLocked: {
    fontFamily: 'var(--ce-font-mono)',
    fontSize: '28px',
    lineHeight: '1',
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: tokens.colorNeutralForeground2,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground4,
    borderRadius: tokens.borderRadiusSmall,
  },
  seqInput: {
    width: '110px',
    // ≥44px touch target for the one editable Case/PO segment.
    minHeight: '44px',
    '& input': {
      fontFamily: 'var(--ce-font-mono)',
      fontSize: '28px',
      lineHeight: '1',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textAlign: 'center',
      height: '40px',
    },
  },
  segNote: {
    marginLeft: tokens.spacingHorizontalS,
    fontFamily: 'var(--ce-font-base)',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },

  /* Live-derived EVA / Box forms. */
  derivedGrid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalS,
    alignItems: 'center',
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  derivedLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  derivedValue: {
    fontFamily: 'var(--ce-font-mono)',
    fontSize: tokens.fontSizeBase400,
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
  },
  derivedPlaceholder: {
    fontFamily: 'var(--ce-font-mono)',
    fontSize: tokens.fontSizeBase400,
    color: tokens.colorNeutralForeground4,
    fontStyle: 'italic',
  },

  pathNote: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  titleLockup: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  /* Dialog action buttons — ≥44px touch height. */
  dialogBtn: { minHeight: '44px' },
});

/** Distinct groups present in the readiness checklist, ordered for the line. */
function readyGroupSummary(c: Case): string {
  const readiness = computeReadiness(c);
  const order: Array<{ key: 'fields' | 'images' | 'address'; label: string }> = [
    { key: 'fields', label: 'fields' },
    { key: 'images', label: 'images' },
    { key: 'address', label: 'address' },
  ];
  const present = order.filter((g) =>
    readiness.items.some((i) => i.group === g.key),
  );
  return present.map((g) => g.label).join(' · ');
}

function splitExistingCasePo(casePo: string | undefined): {
  principal: string;
  yy: string;
  seq: string;
  evaLower: string;
  boxUpper: string;
} | undefined {
  const boxUpper = (casePo ?? '').trim().toUpperCase();
  if (!boxUpper) return undefined;
  if (boxUpper.length <= 5) {
    return { principal: boxUpper, yy: '', seq: '', evaLower: boxUpper.toLowerCase(), boxUpper };
  }
  const yy = boxUpper.slice(-5, -3);
  const seq = boxUpper.slice(-3);
  if (!/^\d{2}$/.test(yy) || !/^\d{3}$/.test(seq)) {
    return { principal: boxUpper, yy: '', seq: '', evaLower: boxUpper.toLowerCase(), boxUpper };
  }
  return {
    principal: boxUpper.slice(0, -5),
    yy,
    seq,
    evaLower: boxUpper.toLowerCase(),
    boxUpper,
  };
}

export function EvaSubmitDialog() {
  const styles = useStyles();
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const { data: c, loading } = useCaseQuery(caseId);
  const close = () => navigate(caseId ? `/case/${caseId}` : '/');

  const suggestion = useMemo(() => (c ? suggestCasePo(c) : undefined), [c]);
  const existingCasePo = useMemo(() => splitExistingCasePo(c?.casePo), [c?.casePo]);

  // Live Case/PO allocator PREVIEW (TKT-004) — the REAL next sequence from DB
  // history (or the Box folder scan fallback), replacing the local 001 default.
  const [nextPo, setNextPo] = useState<NextCasePoResult | undefined>();
  useEffect(() => {
    if (existingCasePo) return;
    const principal = c?.providerCode;
    if (!principal) return;
    let cancelled = false;
    void (data as DataAccessExt)
      .nextCasePo(principal)
      .then((r) => {
        if (!cancelled) setNextPo(r);
      })
      .catch(() => {
        /* fall back to the local suggestion */
      });
    return () => {
      cancelled = true;
    };
  }, [c?.providerCode, existingCasePo]);

  // Only the 3-digit sequence is user-editable; Principal + YY are locked
  // segments derived from the case. Seeded with the previewed next sequence (the
  // live allocator when available, else the local suggestion) until the operator
  // edits it.
  const [seq, setSeq] = useState<string>('');
  const [seqEdited, setSeqEdited] = useState(false);
  useEffect(() => {
    if (seqEdited) return;
    const seed = existingCasePo?.seq ?? nextPo?.seq ?? suggestion?.seq;
    if (seed) setSeq(seed);
  }, [existingCasePo, nextPo, suggestion, seqEdited]);

  const readiness = useMemo(() => (c ? computeReadiness(c) : undefined), [c]);

  // While the case loads, show a spinner in the dialog shell.
  if (loading && !c) {
    return (
      <Dialog open modalType="modal" onOpenChange={(_, d) => !d.open && close()}>
        <DialogSurface className={styles.surface}>
          <DialogBody>
            <DialogTitle>Submit to EVA</DialogTitle>
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

  if (!c || !readiness || !suggestion) {
    return (
      <Dialog open modalType="modal" onOpenChange={(_, d) => !d.open && close()}>
        <DialogSurface className={styles.surface}>
          <DialogBody>
            <DialogTitle>Submit to EVA</DialogTitle>
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

  const ready = readiness.ready;
  const blockedCount = readiness.missing.length;

  // Compose the live Case/PO from locked segments + the edited sequence. Existing
  // case references are authoritative; otherwise prefer the allocator preview.
  const principal = existingCasePo?.principal ?? nextPo?.principal ?? suggestion.principal;
  const yy = existingCasePo?.yy ?? nextPo?.yy ?? suggestion.yy;
  const seqClean = seq.replace(/\D/g, '').slice(0, 3);
  const core = `${principal}${yy}${seqClean}`;
  const complete = existingCasePo ? true : seqClean.length === 3;
  const evaCode = existingCasePo?.evaLower ?? (complete ? core.toLowerCase() : '');
  const boxCode = existingCasePo?.boxUpper ?? (complete ? core.toUpperCase() : '');

  const onSeqChange = (value: string) => {
    if (existingCasePo) return;
    setSeqEdited(true);
    setSeq(value.replace(/\D/g, '').slice(0, 3));
  };

  /* TKT-094 Phase B: the export IS the EVA handoff — record it server-side
     (ready_for_eva → eva_submitted, guarded idempotent + writes submitted_at).
     Own try/catch so a recording failure never masks a successful download. */
  const recordEvaSubmitted = async () => {
    try {
      const { updated } = await (data as DataAccessExt).markEvaSubmitted(c.id);
      if (updated) {
        dispatchToast(
          <Toast>
            <ToastTitle>Case marked EVA Submitted</ToastTitle>
          </Toast>,
          { intent: 'success' },
        );
      }
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Exported, but the case couldn’t be marked EVA Submitted</ToastTitle>
          <ToastBody>The file downloaded fine. Refresh and export again to record it.</ToastBody>
        </Toast>,
        { intent: 'warning' },
      );
    }
  };

  const onDownloadJson = async () => {
    try {
      const text = buildEvaJson({ evaFields: c.evaFields });
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EVA-${boxCode || c.casePo || c.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      dispatchToast(
        <Toast>
          <ToastTitle>Case exported for EVA</ToastTitle>
          <ToastBody>Submission for {c.vrm} saved as a file.</ToastBody>
        </Toast>,
        { intent: 'success' },
      );
      await recordEvaSubmitted();
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t download — try again</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    }
  };

  const onSubmit = async () => {
    // MOCK: no real Sentry call is ever made in M1 — but the handoff IS recorded
    // (TKT-094): the case leaves Review and the throughput tiles count it.
    await recordEvaSubmitted();
    dispatchToast(
      <Toast>
        <ToastTitle>Submitted to EVA</ToastTitle>
        <ToastBody>
          {c.vrm} — {evaCode || 'no Case/PO'}. Archive folder {boxCode || '—'}.
        </ToastBody>
      </Toast>,
      { intent: 'success' },
    );
    close();
  };

  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>
            <span className={styles.titleLockup}>
              <span>Submit to EVA</span>
              <VrmPlate vrm={c.vrm} size="medium" />
            </span>
          </DialogTitle>
          <DialogContent className={styles.body}>
            {/* Readiness — collapse to a single reassurance line when green. */}
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Readiness</span>
              {ready ? (
                <span className={styles.readyLine}>
                  <CheckCircle2 size={18} aria-hidden />
                  <span className={styles.readyText}>
                    Ready
                  </span>
                  <span className={styles.readyGroups}>
                    — {readyGroupSummary(c)}
                  </span>
                </span>
              ) : (
                <>
                  <MessageBar intent="error" icon={<ShieldAlert size={20} />}>
                    <MessageBarBody>
                      <MessageBarTitle>
                        {blockedCount} item{blockedCount === 1 ? '' : 's'} blocking
                        submission
                      </MessageBarTitle>
                      Resolve the items below before submitting to EVA.
                    </MessageBarBody>
                  </MessageBar>
                  <ReadinessChecklist case={c} />
                </>
              )}
            </div>

            {/* Case / PO — the hero of the dialog. */}
            <div className={styles.hero}>
              <div className={styles.heroHeading}>
                <span className={styles.sectionLabel}>Case / PO</span>
                <span className={styles.heroHint}>
                  Status: {statusLabel(c.status)}
                </span>
              </div>

              <div className={styles.composer}>
                <span className={styles.segLocked} title="Principal code (locked)">
                  {principal}
                </span>
                <span className={styles.segLocked} title="2-digit year (locked)">
                  {yy}
                </span>
                <Field>
                  <Input
                    className={styles.seqInput}
                    value={seq}
                    onChange={(_, d) => onSeqChange(d.value)}
                      inputMode="numeric"
                      maxLength={3}
                      placeholder="000"
                      aria-label="Provider case sequence (3 digits)"
                      readOnly={!!existingCasePo}
                      disabled={!!existingCasePo}
                    />
                  </Field>
                  <span className={styles.segNote}>
                    {existingCasePo ? 'Existing case reference' : '3-digit provider sequence'}
                  </span>
                </div>

                {/* Where the previewed next number came from (TKT-004). */}
                {existingCasePo ? (
                  <Text className={styles.heroHint}>
                    This case already has a Case/PO. EVA export uses that reference.
                  </Text>
                ) : nextPo && (
                  <Text className={styles.heroHint}>
                    Suggested next for {principal}: {nextPo.boxUpper} —{' '}
                    {nextPo.source === 'box'
                      ? 'next after the latest archive folder'
                      : 'next in our records'}
                    .
                  </Text>
                )}

              <div className={styles.derivedGrid}>
                <span className={styles.derivedLabel}>
                  <ArrowUpRight size={14} /> EVA code
                </span>
                {evaCode ? (
                  <span className={styles.derivedValue}>{evaCode}</span>
                ) : (
                  <span className={styles.derivedPlaceholder}>
                    enter 3-digit sequence
                  </span>
                )}

                <span className={styles.derivedLabel}>
                  <FolderClosed size={14} /> Archive folder
                </span>
                {boxCode ? (
                  <span className={styles.derivedValue}>{boxCode}</span>
                ) : (
                  <span className={styles.derivedPlaceholder}>
                    enter 3-digit sequence
                  </span>
                )}
              </div>
            </div>

            {/* Export path */}
            <div className={styles.section}>
              <Field label="How to submit">
                <RadioGroup defaultValue="json">
                  <Radio value="json" label="Export a file to drag into EVA" />
                  <Radio value="api" label="Submit directly" disabled />
                </RadioGroup>
              </Field>
              <Text className={styles.pathNote}>
                Direct submission isn't available yet — export the file to drag into EVA.
              </Text>
            </div>
          </DialogContent>

          <DialogActions>
            <Button className={styles.dialogBtn} appearance="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              className={styles.dialogBtn}
              appearance="secondary"
              icon={<Download size={16} />}
              onClick={() => void onDownloadJson()}
              disabled={!ready}
              title={!ready ? `${blockedCount} readiness item(s) still blocking` : 'Save the case as an EVA file to drag into EVA'}
            >
              Export for EVA
            </Button>
            <Button
              className={styles.dialogBtn}
              appearance="primary"
              icon={<Send size={16} />}
              disabled={!ready || !complete}
              title={
                !ready
                  ? `${blockedCount} readiness item(s) still blocking`
                  : !complete
                    ? 'Enter the 3-digit Case/PO sequence'
                    : 'Submit to EVA'
              }
              onClick={() => void onSubmit()}
            >
              Submit to EVA
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export default EvaSubmitDialog;
