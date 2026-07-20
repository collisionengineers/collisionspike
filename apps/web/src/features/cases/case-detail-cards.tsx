import { useEffect, useState } from 'react';
import { Badge, Button, Caption1, Dropdown, Field, Link, Option, Spinner, Switch, Tooltip, mergeClasses } from '@fluentui/react-components';
import { AlertTriangle, ArrowUpRight, Check, MapPin, Trash2 } from 'lucide-react';
import { getDataAccess, type Evidence, type ImageRole, type SuggestedAddress } from '../../data';
import { useStyles } from './case-detail.styles';

const ROLE_OPTIONS: { value: ImageRole; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'damage_closeup', label: 'Damage closeup' },
  { value: 'additional', label: 'Additional' },
  { value: 'unknown', label: 'Unclassified' },
];

interface EvidenceCardProps {
  ev: Evidence;
  onRole: (id: string, role: ImageRole) => void;
  onRegistrationVisible: (id: string, visible: boolean) => void;
  onAcceptedForEva: (id: string, accepted: boolean) => void;
  onExclude: (id: string, excluded: boolean) => void;
  /** TKT-123: dismiss the person-reflection warning (persists via the seam). */
  onDismissReflection: (id: string) => void;
  /** True while this card's dismissal is being saved. */
  dismissingReflection?: boolean;
  /** True while a role/registration/EVA-use/include decision is being saved. */
  saving?: boolean;
  /** Plain-language failure for this card's last save attempt. */
  saveError?: string;
  /** TKT-160: present only when DELETE_CASE_IMAGE_ENABLED is on — omitting it hides the control. */
  onDelete?: (ev: Evidence) => void;
}

export function EvidenceCard({
  ev,
  onRole,
  onRegistrationVisible,
  onAcceptedForEva,
  onExclude,
  onDismissReflection,
  dismissingReflection,
  saving,
  saveError,
  onDelete,
}: EvidenceCardProps) {
  const styles = useStyles();
  // Real inline preview (TKT-048): fetch the bytes WITH the bearer -> blob: URL for <img>
  // (an <img src> can't carry the token, and CSP allows blob:). Falls back to the coloured
  // placeholder while loading, or if there is no inline content (Box-only / bytes gone).
  const [imgUrl, setImgUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    let url: string | undefined;
    void getDataAccess()
      .evidenceContentUrl(ev.id)
      .then((u) => {
        if (!live) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        url = u;
        setImgUrl(u);
      });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [ev.id]);
  return (
    <div className={mergeClasses(styles.thumbCard, ev.excluded && styles.thumbCardExcluded)}>
      <div className={styles.thumb} style={{ backgroundColor: ev.thumbColor ?? '#5a5a64' }}>
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={ev.fileName}
            className={styles.thumbImg}
            loading="lazy"
            onError={() => setImgUrl(undefined)}
          />
        ) : ev.excluded ? (
          'Excluded'
        ) : ev.imageRole === 'overview' ? (
          'OVERVIEW'
        ) : (
          ''
        )}
      </div>
      <div className={styles.thumbMeta}>
        <span className={styles.thumbName}>{ev.fileName}</span>
        <Field label="Role" size="small">
          <Dropdown
            size="small"
            disabled={saving}
            value={ROLE_OPTIONS.find((r) => r.value === ev.imageRole)?.label ?? 'Unclassified'}
            selectedOptions={[ev.imageRole]}
            onOptionSelect={(_, d) => d.optionValue && onRole(ev.id, d.optionValue as ImageRole)}
          >
            {ROLE_OPTIONS.map((r) => (
              <Option key={r.value} value={r.value} text={r.label}>
                {r.label}
              </Option>
            ))}
          </Dropdown>
        </Field>
        {ev.reviewRequired && !ev.personReflection && (
          <div className={styles.reflectionWarning} role="status">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden />
            <span className={styles.reflectionWarningText}>
              Check this photo. It was left out because it may not show the vehicle.
            </span>
          </div>
        )}
        {/* TKT-123: the classifier's reflection observation renders as a
            DISMISSIBLE plain-English warning — advisory only; excluding the
            photo stays the reviewer's decision via the switch below. */}
        {ev.personReflection && !ev.reflectionDismissed && (
          <div className={styles.reflectionWarning} role="status">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden />
            <span className={styles.reflectionWarningText}>
              A person’s reflection may be visible.
            </span>
            <Button
              appearance="subtle"
              size="small"
              disabled={saving}
              onClick={() => onDismissReflection(ev.id)}
            >
              {dismissingReflection ? 'Dismissing…' : 'Dismiss'}
            </Button>
          </div>
        )}
        <Switch
          checked={ev.registrationVisible}
          disabled={saving}
          label="Registration visible"
          onChange={(_, d) => onRegistrationVisible(ev.id, d.checked)}
        />
        <Switch
          checked={ev.acceptedForEva}
          disabled={saving || !!ev.excluded}
          label="Use for EVA"
          onChange={(_, d) => onAcceptedForEva(ev.id, d.checked)}
        />
        <Switch
          checked={!!ev.excluded}
          disabled={saving}
          label="Exclude"
          onChange={(_, d) => onExclude(ev.id, d.checked)}
        />
        {saving && <Spinner size="tiny" label="Saving…" labelPosition="after" />}
        {saveError && (
          <Caption1 className={styles.reflectionWarningText} role="alert">
            {saveError}
          </Caption1>
        )}
        {ev.boxFileUrl && (
          // `inline` = rest-state underline: with links demoted to ink, a
          // text-adjacent link needs the underline to read as a link at rest.
          <Link inline href={ev.boxFileUrl} target="_blank" rel="noopener noreferrer">
            <span className={styles.inlineIconText}>Open in Archive <ArrowUpRight size={12} /></span>
          </Link>
        )}
        {onDelete && (
          <Button
            appearance="subtle"
            size="small"
            icon={<Trash2 size={14} />}
            disabled={saving}
            onClick={() => onDelete(ev)}
          >
            Delete image
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------- A single SUGGESTED inspection-location row ----------
   Renders the candidate as monospace address lines + a DISTINCT "Suggested" tint
   badge + an evidence Tooltip, with a [Use this address] action. The action is
   the caller's (it copies into the manual draft + sets decision=manual). Nothing
   here writes a Case or sets the EVA field directly. */
/** How many corpus suggestions to show before a "Show N more" toggle (TKT-079). Assist
 *  candidates are always shown in full (they are the reviewer-invoked result). */
export const SUGGEST_VISIBLE = 4;

interface SuggestedLocationRowProps {
  suggestion: SuggestedAddress;
  onUse: () => void;
}

/** Human-friendly rendering of a raw confidence band (avoids leaking the enum). */
function friendlyBand(band?: string): string | undefined {
  if (!band) return undefined;
  const b = band.toLowerCase();
  // Phase-4a live assist: the candidate came from the case's photos + map lookup.
  if (b === 'assist' || b.includes('assist')) return 'Suggested from the photos';
  if (b.includes('eva_export') || b.includes('eva export')) return 'From EVA inspection history';
  if (b.includes('multiple')) return 'One of several possible addresses';
  if (b.includes('jobsheet')) return 'From job-sheet guidance';
  if (b.includes('repairer')) return 'Matched to a local repairer';
  if (b.startsWith('resolved')) return 'Resolved from records';
  if (b.startsWith('candidate')) return 'Candidate match';
  return undefined; // unknown band — omit rather than show a raw code
}

/** A muted "seen N times · last <date>" hint from the offline ranking metadata
 *  (ADR-0016 helper #2). Recency-only or frequency-only rows render the part they
 *  have; rows with neither render nothing. PRESENTATION ONLY — never auto-selects.
 *  lastSeen arrives as YYYY-MM-DD; surface it as DD/MM/YYYY for display parity. */
function frequencyHint(suggestion: SuggestedAddress): string | undefined {
  const parts: string[] = [];
  if (typeof suggestion.frequency === 'number' && suggestion.frequency > 0) {
    parts.push(`seen ${suggestion.frequency} ${suggestion.frequency === 1 ? 'time' : 'times'}`);
  }
  const seen = (suggestion.lastSeen ?? '').trim();
  const m = seen.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) parts.push(`last ${m[3]}/${m[2]}/${m[1]}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** A muted "~N miles away" proximity hint (TKT-076/079) from the case's accident/claimant
 *  postcode. PRESENTATION/ORDERING ONLY — never auto-selects (ADR-0016 #2b). */
function distanceHint(suggestion: SuggestedAddress): string | undefined {
  const d = suggestion.distanceMiles;
  if (typeof d !== 'number' || !isFinite(d) || d < 0) return undefined;
  if (d < 1) return 'under a mile away';
  return `~${Math.round(d)} ${Math.round(d) === 1 ? 'mile' : 'miles'} away`;
}

export function SuggestedLocationRow({ suggestion, onUse }: SuggestedLocationRowProps) {
  const styles = useStyles();
  const lines = [...suggestion.lines, suggestion.postcode].filter(Boolean);
  const band = friendlyBand(suggestion.confidenceBand);
  const seenHint = frequencyHint(suggestion);
  const distHint = distanceHint(suggestion);
  const tip = [band, distHint, seenHint, suggestion.evidenceNote, 'Suggested — low confidence; verify before use.']
    .filter(Boolean)
    .join('\n');
  return (
    <div className={styles.suggestRow} role="listitem">
      <div className={styles.suggestBody}>
        <span className={styles.suggestAddr}>{lines.join('\n')}</span>
        <span className={styles.suggestMeta}>
          <Tooltip content={tip} relationship="description" withArrow>
            <Badge appearance="tint" shape="rounded" size="small" className={styles.suggestBadge}>
              <MapPin size={11} strokeWidth={2.25} aria-hidden /> Suggested
            </Badge>
          </Tooltip>
          {distHint && <Caption1 className={styles.hint}>{distHint}</Caption1>}
          {/* TKT-076/079 — a scope-FALLBACK row is a common location served because this
              provider has no saved sites yet; its stored provider code belongs to some
              OTHER provider and rendering it would mislead ("Provider FW" on a QDOS case).
              Say what it really is instead. */}
          {suggestion.scopeFallback ? (
            <Caption1 className={styles.hint}>Common location — not specific to this provider</Caption1>
          ) : (
            suggestion.providerCode && (
              <Caption1 className={styles.hint}>Provider {suggestion.providerCode}</Caption1>
            )
          )}
          {seenHint && <Caption1 className={styles.hint}>{seenHint}</Caption1>}
        </span>
      </div>
      <Button appearance="secondary" size="small" icon={<Check size={14} />} onClick={onUse}>
        Use this address
      </Button>
    </div>
  );
}

/* ============================================================
   Outer screen — fetches the Case + its images through the data seam and
   renders loading / error / not-found states, then mounts the editing view
   (keyed by case id so its local working-copy state seeds cleanly per case).
   ============================================================ */
