import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
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
import { GitBranchPlus, Link2, ShieldQuestion, SplitSquareHorizontal } from 'lucide-react';
import {
  data,
  useCaseQuery,
  type Case,
} from '../data';
import { GLOBAL_TOASTER_ID, StatusBadge, VrmPlate, statusLabel } from '../components';
import {
  resolveCase,
  type DedupResolution,
  type OpenProviderCase,
} from '../domain/dedup';

/* ============================================================
   DedupDecisionDialog — Surface B / ADR-0010 attach-vs-new.

   Opened at /case/:caseId/dedup as a route overlay over CaseDetail (same
   pattern as EvaSubmitDialog). For a duplicate_risk / caseLinkState=pending
   case it lists the OPEN same-VRM candidate case(s) (via the seam's
   openVrmTwins) and offers, per candidate:
     - Accept link  → would flip this case to linked_to_instruction (mock).
     - Treat as new → keeps the cases separate (mock).

   The explanation is derived from domain/dedup `resolveCase` — the EXACT
   ADR-0010 ladder — so the copy and the flow's branch tokens share one
   vocabulary. ADR-0010's two inviolable rules are surfaced verbatim:
   never auto-merge on VRM+time; never link across providers.

   MOCK ONLY — both actions log intent (toast + console) and never mutate a
   backend. No EVA/Box/SharePoint contact.
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
  rules: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  candidate: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeft: '3px solid var(--ce-red)',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  candHead: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
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
  explain: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  resolutionChip: { fontFamily: 'var(--ce-font-mono)' },
});

/** A reference to disambiguate by — policy ref first, then claim number. */
function refOf(c: Pick<Case, 'overviewFacts'>): string {
  return c.overviewFacts.policyReference ?? c.overviewFacts.claimNumber ?? '';
}

/** Human copy for each ADR-0010 ladder outcome. */
const RESOLUTION_COPY: Record<DedupResolution, { label: string; detail: string }> = {
  drop: {
    label: 'Exact repeat',
    detail: 'This arrival is an exact repeat (same message / payload). Normally dropped.',
  },
  attach: {
    label: 'Reference matches',
    detail: 'The claim reference matches this open case — safe to attach.',
  },
  new_due_to_reference: {
    label: 'Reference differs',
    detail:
      'Same VRM but a DIFFERENT claim reference — these are distinct claims. Keep separate; the VRM collision is flagged, never merged.',
  },
  propose_attach: {
    label: 'Bare VRM match',
    detail:
      'Same VRM and no disambiguating reference — only a proposal for you to confirm. Never auto-merged.',
  },
  create: {
    label: 'No match',
    detail: 'No open same-provider case matches — treat as a new case.',
  },
};

export function DedupDecisionDialog() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { caseId } = useParams<{ caseId: string }>();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);

  const { data: c, loading } = useCaseQuery(caseId);
  const close = () => navigate(caseId ? `/case/${caseId}` : '/');

  const [twins, setTwins] = useState<Case[] | undefined>();
  useEffect(() => {
    let cancelled = false;
    if (!c) return;
    void data.openVrmTwins(c.vrm, c.id).then((t) => {
      if (!cancelled) setTwins(t);
    });
    return () => {
      cancelled = true;
    };
  }, [c]);

  const logIntent = (kind: 'attach' | 'new', target?: Case) => {
    // MOCK: no backend write. Record intent for the audit trail story only.
    // eslint-disable-next-line no-console
    console.info('[dedup] decision (mock, not persisted)', {
      caseId: c?.id,
      decision: kind,
      targetCaseId: target?.id,
    });
    dispatchToast(
      <Toast>
        <ToastTitle>
          {kind === 'attach' ? 'Link accepted (mock)' : 'Kept as a new case (mock)'}
        </ToastTitle>
        <ToastBody>
          {kind === 'attach'
            ? `${c?.vrm} would be linked to ${target?.casePo ?? target?.id} → linked_to_instruction.`
            : `${c?.vrm} stays separate from the candidate(s).`}{' '}
          No record was changed.
        </ToastBody>
      </Toast>,
      { intent: 'success' },
    );
    close();
  };

  if (loading && !c) {
    return (
      <Dialog open modalType="modal" onOpenChange={(_, d) => !d.open && close()}>
        <DialogSurface className={styles.surface}>
          <DialogBody>
            <DialogTitle>Resolve duplicate</DialogTitle>
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
            <DialogTitle>Resolve duplicate</DialogTitle>
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

  const thisRef = refOf(c);

  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>
            <span className={styles.titleLockup}>
              <span>Resolve duplicate</span>
              <VrmPlate vrm={c.vrm} size="medium" />
            </span>
          </DialogTitle>
          <DialogContent className={styles.body}>
            <MessageBar intent="warning" icon={<ShieldQuestion size={20} />}>
              <MessageBarBody>
                <MessageBarTitle>Held for human disambiguation</MessageBarTitle>
                ADR-0010: a shared VRM is never auto-merged, and cases are never linked across
                different work providers. Confirm a link only when the references agree.
              </MessageBarBody>
            </MessageBar>

            <div>
              <span className={styles.sectionLabel}>This case</span>
              <div className={styles.candMeta} style={{ marginTop: 6 }}>
                <span className={styles.metaKey}>Provider</span>
                <span className={styles.metaVal}>
                  {c.provider} ({c.providerCode})
                </span>
                <span className={styles.metaKey}>Reference</span>
                <span className={styles.metaVal}>{thisRef || '— none parsed —'}</span>
                <span className={styles.metaKey}>Status</span>
                <span className={styles.metaVal}>{statusLabel(c.status)}</span>
              </div>
            </div>

            <Divider />

            <span className={styles.sectionLabel}>
              Candidate open case{(twins?.length ?? 0) === 1 ? '' : 's'} for this VRM
            </span>

            {twins === undefined ? (
              <Spinner size="tiny" label="Finding open cases for this VRM…" labelPosition="after" />
            ) : twins.length === 0 ? (
              <MessageBar intent="info">
                <MessageBarBody>
                  No other open case shares this VRM. Nothing to link to — treat as a new case.
                </MessageBarBody>
              </MessageBar>
            ) : (
              twins.map((twin) => {
                const twinRef = refOf(twin);
                // Run the EXACT ADR-0010 ladder for the explanation token.
                const candidate: OpenProviderCase = {
                  caseId: twin.id,
                  caseRef: twinRef,
                  status: twin.status,
                  workProviderId: twin.providerCode,
                };
                const outcome = resolveCase({
                  messageId: `ui:${c.id}`,
                  payloadHash: `ui:${c.id}`,
                  candidateVrm: c.vrm,
                  candidateRef: thisRef,
                  workProviderId: c.providerCode,
                  openProviderCases: [candidate],
                  seenMessageIds: [],
                  seenPayloadHashes: [],
                });
                const copy = RESOLUTION_COPY[outcome.resolution];
                // Accept-link is only the safe path when the references actually agree.
                const linkSafe = outcome.resolution === 'attach';
                return (
                  <div className={styles.candidate} key={twin.id}>
                    <div className={styles.candHead}>
                      <VrmPlate vrm={twin.vrm} size="small" />
                      <StatusBadge status={twin.status} size="small" />
                      <Badge
                        appearance="tint"
                        color={linkSafe ? 'success' : 'warning'}
                        shape="rounded"
                        size="small"
                        className={styles.resolutionChip}
                      >
                        {copy.label}
                      </Badge>
                    </div>

                    <div className={styles.candMeta}>
                      <span className={styles.metaKey}>Case</span>
                      <span className={styles.metaVal}>{twin.casePo ?? twin.id}</span>
                      <span className={styles.metaKey}>Provider</span>
                      <span className={styles.metaVal}>
                        {twin.provider} ({twin.providerCode})
                      </span>
                      <span className={styles.metaKey}>Reference</span>
                      <span className={styles.metaVal}>{twinRef || '— none parsed —'}</span>
                    </div>

                    <Text className={styles.explain}>{copy.detail}</Text>

                    <div className={styles.candActions}>
                      <Button
                        appearance="primary"
                        icon={<Link2 size={16} />}
                        onClick={() => logIntent('attach', twin)}
                        title={
                          linkSafe
                            ? 'Link this case to the candidate'
                            : 'References do not agree — linking requires a deliberate confirmation'
                        }
                      >
                        Accept link
                      </Button>
                      <Button
                        appearance="secondary"
                        icon={<SplitSquareHorizontal size={16} />}
                        onClick={() => logIntent('new', twin)}
                      >
                        Treat as new
                      </Button>
                    </div>
                  </div>
                );
              })
            )}

            <Caption1 className={mergeClasses(styles.rules)}>
              <GitBranchPlus
                size={12}
                strokeWidth={2}
                aria-hidden
                style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}
              />
              Decisions here are mock only — nothing is written and no email or case is merged.
            </Caption1>
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

export default DedupDecisionDialog;
