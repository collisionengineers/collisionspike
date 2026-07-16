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
import { Panel } from '../../shared/ui/Panel';
import { useSeverityChipStyles } from '../../shared/ui/severityStyles';
import { GLOBAL_TOASTER_ID } from '../../shared/ui/toaster';
import {
  useAiAssistGate,
  useAiSuggestions,
  useGenerateAiSuggestions,
  useReviewAiSuggestion,
  type AiSuggestion,
  type AiSuggestionReviewDecision,
} from '../../data';

/* ============================================================
   AiAssistPanel — the GATED "Assistant" surface on the case page (TKT-015).

   HONEST-OFF: renders NOTHING unless AI_ASSIST_ENABLED (read via useAiAssistGate,
   the same gate-hook pattern as the Box gates). When on, it lists the case's AI
   suggestions (pending first) with Accept / Reject, and a "Generate suggestions"
   action. Generate outcomes are EXPLAINED, never silent (TKT-127): a zero result
   carries a reason ('disabled' / 'no_input' / 'empty' / 'error') and each gets its
   own plain-language toast.

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

/** Plain-language label per suggestion kind (no engineering terms). Covers the earlier kinds and
 *  the TKT-015 case-assessment + TKT-016 image-analysis kinds, so a live suggestion never renders a
 *  raw enum name (AGENTS.md user-facing-language rule). */
export const TYPE_LABEL: Record<string, string> = {
  image_role: 'Photo role',
  registration: 'Registration',
  inspection_address: 'Inspection address',
  triage_category: 'Email category',
  // Case/damage-assessment producer kinds (TKT-015/127 — the generic Generate path).
  damage_area: 'Damaged area',
  damage_severity: 'Damage severity',
  accident_summary: 'What happened',
  // TKT-016 staged image-analysis observations (re-incorporated from PR46 on the stack merge).
  vehicle_present: 'Vehicle check',
  same_vehicle: 'Same vehicle',
  background_text: 'Background detail',
  location_hint: 'Location clue',
  address_suggestion: 'Inspection address',
};

/** Join a small list of readable strings for a summary, capped so a long payload can't flood a row. */
function joinCapped(parts: unknown[], max = 4): string {
  const clean = parts.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean);
  const shown = clean.slice(0, max).join(', ');
  return clean.length > max ? `${shown}…` : shown;
}

/** A short, human summary of a suggestion's proposed value (defensive over `unknown`). Every kind
 *  the app can mint has an explicit branch here — the JSON.stringify fallback is a last resort for a
 *  truly unknown shape, never the normal path for a known kind. */
export function summariseValue(s: AiSuggestion): string {
  const v = s.suggestedValue as Record<string, unknown> | null;
  if (v && typeof v === 'object') {
    if (s.suggestionType === 'image_role' && typeof v.role === 'string') return `Role: ${v.role}`;
    if (s.suggestionType === 'registration') {
      const detected = typeof v.detectedVrm === 'string' ? v.detectedVrm.trim() : '';
      if (detected) {
        return v.matchesCaseVrm === true
          ? `Registration reads ${detected} — matches this case`
          : `Registration reads ${detected}`;
      }
      if (v.visibility === 'visible_unreadable') return 'A registration plate is present but not readable';
      if (typeof v.visible === 'boolean') return v.visible ? 'Registration is visible' : 'Registration not visible';
    }
    if (s.suggestionType === 'inspection_address' && Array.isArray(v.lines)) {
      return (v.lines as unknown[]).filter(Boolean).join(', ');
    }
    if (s.suggestionType === 'triage_category' && typeof v.category === 'string') {
      return `Category: ${v.category}`;
    }
    // Case/damage-assessment shapes ({ area } / { severity } / { summary }) — rendered as
    // plain text, never raw JSON (TKT-127: the panel must read handler-plain).
    if (s.suggestionType === 'damage_area' && typeof v.area === 'string') return v.area;
    if (s.suggestionType === 'damage_severity' && typeof v.severity === 'string') {
      const sev = v.severity;
      return `Damage looks ${sev === 'unknown' ? 'hard to judge from the notes' : sev}`;
    }
    if (s.suggestionType === 'accident_summary' && typeof v.summary === 'string') return v.summary;
    // ---- TKT-016 image-analysis kinds (re-incorporated from PR46 on the stack merge) ----
    if (s.suggestionType === 'vehicle_present') {
      const present = v.present === true;
      const descriptor = typeof v.descriptor === 'string' ? v.descriptor.trim() : '';
      const base = present
        ? descriptor
          ? `Shows a vehicle — ${descriptor}`
          : 'This photo shows a vehicle'
        : 'This photo does not show a vehicle';
      return v.personReflection === true ? `${base} · a person’s reflection is visible` : base;
    }
    if (s.suggestionType === 'same_vehicle') {
      return v.sameVehicle === true
        ? 'The photos appear to show the same vehicle'
        : 'The photos may show more than one vehicle — please check';
    }
    if (s.suggestionType === 'background_text' && Array.isArray(v.items)) {
      const texts = (v.items as unknown[]).map((i) =>
        i && typeof (i as { text?: unknown }).text === 'string' ? (i as { text: string }).text : '',
      );
      const summary = joinCapped(texts);
      return summary ? `Readable background: ${summary}` : 'Readable background detail found';
    }
    if (s.suggestionType === 'location_hint' && Array.isArray(v.hints)) {
      const details = (v.hints as unknown[]).map((h) =>
        h && typeof (h as { detail?: unknown }).detail === 'string' ? (h as { detail: string }).detail : '',
      );
      const summary = joinCapped(details);
      return summary ? `Possible location clues: ${summary}` : 'Possible location clues found';
    }
    if (s.suggestionType === 'address_suggestion') {
      const best = v.best as { label?: unknown; lines?: unknown; postcode?: unknown } | undefined;
      if (best && typeof best === 'object') {
        if (typeof best.label === 'string' && best.label.trim()) return best.label.trim();
        if (Array.isArray(best.lines)) {
          const line = joinCapped(best.lines);
          if (line) return line;
        }
        if (typeof best.postcode === 'string' && best.postcode.trim()) return best.postcode.trim();
      }
      return 'A likely inspection address from the photos and provider history';
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
  /** Prevent suggestion writes while the case page has an unsaved edit session. */
  disabled?: boolean;
}

/** The gated AI "Assistant" panel for a case (TKT-015). Renders nothing when the gate is off. */
export function AiAssistPanel({ caseId, onPromoted, disabled = false }: AiAssistPanelProps) {
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
      } else if (result.reason === 'error') {
        // The server ran but the generation failed — a real fault, never a quiet nothing (TKT-127).
        dispatchToast(
          <Toast>
            <ToastTitle>Couldn’t generate suggestions — try again</ToastTitle>
            <ToastBody>Something went wrong while reviewing the case.</ToastBody>
          </Toast>,
          { intent: 'error' },
        );
      } else if (result.reason === 'no_input') {
        dispatchToast(
          <Toast>
            <ToastTitle>Nothing for the assistant to read yet</ToastTitle>
            <ToastBody>
              Add the accident circumstances to the case first — the assistant works from the
              written details.
            </ToastBody>
          </Toast>,
          { intent: 'info' },
        );
      } else if (result.reason === 'disabled') {
        dispatchToast(
          <Toast>
            <ToastTitle>No suggestions added</ToastTitle>
            <ToastBody>The assistant isn’t switched on for live use yet.</ToastBody>
          </Toast>,
          { intent: 'info' },
        );
      } else {
        // reason 'empty' (or a zero with no reason): the assistant looked and had nothing to add.
        dispatchToast(
          <Toast>
            <ToastTitle>Nothing to suggest</ToastTitle>
            <ToastBody>The assistant reviewed the case and found nothing new to add.</ToastBody>
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
              disabled={disabled || generating || !modelConfigured}
            >
              {generating ? 'Working…' : 'Generate suggestions'}
            </Button>
          </Tooltip>
        </div>

        <Caption1 className={styles.hint}>
          {disabled
            ? 'Save or discard the case changes before reviewing suggestions.'
            : 'Suggestions only — review each one before it applies. Nothing changes the case on its own.'}
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
                          disabled={disabled || busy}
                          onClick={() => void onReview(s, 'accepted')}
                        >
                          Accept
                        </Button>
                        <Button
                          appearance="secondary"
                          size="small"
                          icon={<X size={14} />}
                          disabled={disabled || busy}
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
