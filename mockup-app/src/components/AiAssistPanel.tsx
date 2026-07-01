import { useState } from 'react';
import {
  Badge,
  Button,
  Caption1,
  Divider,
  MessageBar,
  MessageBarBody,
  Spinner,
  Text,
  Toast,
  ToastBody,
  ToastTitle,
  Tooltip,
  makeStyles,
  tokens,
  useToastController,
} from '@fluentui/react-components';
import { Check, Sparkles, X } from 'lucide-react';
import { Panel } from './Panel';
import { useSeverityChipStyles } from './severityStyles';
import { GLOBAL_TOASTER_ID } from './toaster';
import {
  useAiAssistGate,
  useAiSuggestions,
  useGenerateAiSuggestions,
  useReviewAiSuggestion,
  type AiSuggestion,
  type AiSuggestionReviewDecision,
} from '../data';

/* ============================================================
   AiAssistPanel — the GATED "Assistant" surface on the case page (TKT-015).

   HONEST-OFF: renders NOTHING unless AI_ASSIST_ENABLED (read via useAiAssistGate,
   the same gate-hook pattern as the Box gates). When on, it lists the case's AI
   suggestions (pending first) with Accept / Reject, and a "Generate suggestions"
   action that is an honest no-op while no model is deployed (gate.modelConfigured
   is false → the server returns { generated: 0, reason: 'disabled' }).

   OBSERVATION-FIRST: nothing here mutates a case directly. Accept routes through
   the Data API, which promotes the value FILL-IF-EMPTY; reject just records the
   decision. All copy is plain + domain-oriented (no model/provider mechanics).
   ============================================================ */

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  head: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
  },
  headRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  hint: { color: tokens.colorNeutralForeground3 },
  list: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: tokens.spacingVerticalS + ' ' + tokens.spacingHorizontalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    // Amber rail — an unreviewed AI suggestion, mirroring the address-suggestion rows.
    borderLeft: '3px solid #e3a008',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  rowReviewed: { borderLeftColor: tokens.colorNeutralStroke2, opacity: 0.75 },
  rowTop: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap' },
  value: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1, wordBreak: 'break-word' },
  meta: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap' },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, marginTop: '2px' },
});

/** Plain-language label per suggestion kind (no engineering terms). */
const TYPE_LABEL: Record<string, string> = {
  image_role: 'Photo role',
  registration: 'Registration',
  inspection_address: 'Inspection address',
  triage_category: 'Email category',
};

/** A short, human summary of a suggestion's proposed value (defensive over `unknown`). */
function summariseValue(s: AiSuggestion): string {
  const v = s.suggestedValue as Record<string, unknown> | null;
  if (v && typeof v === 'object') {
    if (s.suggestionType === 'image_role' && typeof v.role === 'string') return `Role: ${v.role}`;
    if (s.suggestionType === 'registration' && typeof v.visible === 'boolean') {
      return v.visible ? 'Registration is visible' : 'Registration not visible';
    }
    if (s.suggestionType === 'inspection_address' && Array.isArray(v.lines)) {
      return (v.lines as unknown[]).filter(Boolean).join(', ');
    }
    if (s.suggestionType === 'triage_category' && typeof v.category === 'string') {
      return `Category: ${v.category}`;
    }
  }
  try {
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return '(suggestion)';
  }
}

const REVIEWED_LABEL: Record<string, string> = {
  accepted: 'Accepted',
  rejected: 'Rejected',
  superseded: 'Superseded',
};

export interface AiAssistPanelProps {
  /** The case whose AI suggestions to show. */
  caseId: string;
  /** Called after an accepted suggestion is promoted into the case record. */
  onPromoted?: () => void;
}

/** The gated AI "Assistant" panel for a case (TKT-015). Renders nothing when the gate is off. */
export function AiAssistPanel({ caseId, onPromoted }: AiAssistPanelProps) {
  const styles = useStyles();
  const chips = useSeverityChipStyles();
  const { dispatchToast } = useToastController(GLOBAL_TOASTER_ID);
  const { data: gate } = useAiAssistGate();
  const suggestionsQuery = useAiSuggestions(caseId);
  const { review, saving } = useReviewAiSuggestion();
  const { generate, generating } = useGenerateAiSuggestions();
  // Track which row is mid-review so only its buttons spin.
  const [reviewingId, setReviewingId] = useState<string | undefined>(undefined);

  // HONEST-OFF: the panel does not exist unless the gate is on. undefined/loading reads as off.
  if (!gate?.enabled) return null;

  const suggestions = suggestionsQuery.data ?? [];
  const modelConfigured = gate.modelConfigured;

  const onReview = async (s: AiSuggestion, decision: AiSuggestionReviewDecision) => {
    setReviewingId(s.id);
    try {
      const result = await review(s.id, { decision });
      suggestionsQuery.refetch();
      if (result.promoted) onPromoted?.();
      dispatchToast(
        <Toast>
          <ToastTitle>{decision === 'accepted' ? 'Suggestion accepted' : 'Suggestion dismissed'}</ToastTitle>
          {result.promoted && <ToastBody>Applied to the case where the field was empty.</ToastBody>}
        </Toast>,
        { intent: 'success' },
      );
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t save your decision — try again</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    } finally {
      setReviewingId(undefined);
    }
  };

  const onGenerate = async () => {
    try {
      const result = await generate(caseId);
      suggestionsQuery.refetch();
      if (result.generated > 0) {
        dispatchToast(
          <Toast>
            <ToastTitle>
              {result.generated} suggestion{result.generated === 1 ? '' : 's'} added
            </ToastTitle>
          </Toast>,
          { intent: 'success' },
        );
      } else {
        dispatchToast(
          <Toast>
            <ToastTitle>No suggestions to add yet</ToastTitle>
            <ToastBody>The assistant isn’t switched on for live use yet.</ToastBody>
          </Toast>,
          { intent: 'info' },
        );
      }
    } catch {
      dispatchToast(
        <Toast>
          <ToastTitle>Couldn’t generate suggestions — try again</ToastTitle>
        </Toast>,
        { intent: 'error' },
      );
    }
  };

  return (
    <Panel>
      <div className={styles.root}>
        <div className={styles.headRow}>
          <span className={styles.head}>
            <Sparkles size={15} strokeWidth={2} aria-hidden />
            <Text className="ce-section-heading">Assistant</Text>
          </span>
          <Tooltip
            content={
              modelConfigured
                ? 'Ask the assistant to review this case'
                : 'The assistant isn’t switched on for live use yet'
            }
            relationship="label"
          >
            <Button
              appearance="secondary"
              size="small"
              icon={generating ? <Spinner size="tiny" /> : <Sparkles size={14} />}
              onClick={() => void onGenerate()}
              disabled={generating || !modelConfigured}
            >
              {generating ? 'Working…' : 'Generate suggestions'}
            </Button>
          </Tooltip>
        </div>

        <Caption1 className={styles.hint}>
          Suggestions only — review each one before it applies. Nothing changes the case on its own.
        </Caption1>

        {!modelConfigured && (
          <MessageBar intent="info">
            <MessageBarBody>
              The assistant is available but no model is connected yet, so it can’t generate new
              suggestions.
            </MessageBarBody>
          </MessageBar>
        )}

        {suggestionsQuery.loading && suggestionsQuery.data === undefined ? (
          <Spinner size="tiny" label="Loading suggestions…" labelPosition="after" />
        ) : suggestions.length === 0 ? (
          <Caption1 className={styles.hint}>No suggestions for this case yet.</Caption1>
        ) : (
          <>
            <Divider />
            <div className={styles.list} role="list">
              {suggestions.map((s) => {
                const pending = s.reviewState === 'pending';
                const busy = reviewingId === s.id && saving;
                return (
                  <div
                    key={s.id}
                    className={pending ? styles.row : `${styles.row} ${styles.rowReviewed}`}
                    role="listitem"
                  >
                    <div className={styles.rowTop}>
                      {/* Slate info-tint callout tag — a suggestion type is
                          metadata, not brand/severity (pigment ruling). */}
                      <Badge appearance="tint" className={chips.chipInfoTint} size="small" shape="rounded">
                        {TYPE_LABEL[s.suggestionType] ?? s.suggestionType}
                      </Badge>
                      {typeof s.confidence === 'number' && (
                        <Caption1 className={styles.hint}>{Math.round(s.confidence * 100)}% sure</Caption1>
                      )}
                      {!pending && (
                        <Badge appearance="outline" size="small" shape="rounded">
                          {REVIEWED_LABEL[s.reviewState] ?? s.reviewState}
                        </Badge>
                      )}
                    </div>
                    <span className={styles.value}>{summariseValue(s)}</span>
                    {s.rationale && <Caption1 className={styles.hint}>{s.rationale}</Caption1>}
                    {pending && (
                      <div className={styles.actions}>
                        <Button
                          appearance="primary"
                          size="small"
                          icon={busy ? <Spinner size="tiny" /> : <Check size={14} />}
                          disabled={busy}
                          onClick={() => void onReview(s, 'accepted')}
                        >
                          Accept
                        </Button>
                        <Button
                          appearance="secondary"
                          size="small"
                          icon={<X size={14} />}
                          disabled={busy}
                          onClick={() => void onReview(s, 'rejected')}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

export default AiAssistPanel;
