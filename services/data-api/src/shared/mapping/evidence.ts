/** evidence — cohesive Data API module. */

import { type ActivityEvent, type Evidence, type EvidenceKind, type Provider, type SuggestedAddress } from '@cs/domain';
import { auditActionCodec, auditActionToActivityKind, automationModeCodec, evidenceKindCodec, imageRoleCodec, inspectionPolicyCodec } from '@cs/domain/codecs';
import { auditActionLabel, boxUploadLabel, humanActorName, plainDetail } from '../last-activity.js';
import { pad, type Row, toIso } from './cases.js';

export function rowToEvidence(rec: Row): Evidence {
  return {
    id: rec.id ?? '',
    fileName: rec.file_name ?? '',
    kind: (evidenceKindCodec.toName(rec.kind_code) ?? 'other') as EvidenceKind,
    imageRole: imageRoleCodec.toName(rec.image_role_code) ?? 'unknown',
    registrationVisible: rec.registration_visible ?? false,
    acceptedForEva: rec.accepted_for_eva ?? false,
    ...(rec.excluded != null ? { excluded: rec.excluded } : {}),
    ...(rec.exclusion_reason ? { exclusionReason: rec.exclusion_reason } : {}),
    ...(rec.excluded === true && rec.exclusion_decision_source === 'classifier'
      ? { reviewRequired: true }
      : {}),
    ...(rec.excluded === true && rec.exclusion_decision_source === 'staff'
      ? { excludedByStaff: true }
      : {}),
    // Vision reflection flag + its reviewer dismissal (TKT-123). Columns land via
    // the 2026-07-09 evidence-reflection delta; conditional spreads tolerate a
    // pre-delta row/query shape.
    ...(rec.person_reflection === true ? { personReflection: true } : {}),
    ...(rec.reflection_dismissed === true ? { reflectionDismissed: true } : {}),
    sourceLabel: rec.source_label ?? '',
    ...(rec.box_file_id ? { boxFileId: rec.box_file_id } : {}),
    ...(rec.box_file_url ? { boxFileUrl: rec.box_file_url } : {}),
  };
}

export function isAcceptedImageRow(rec: Row): boolean {
  return evidenceKindCodec.toName(rec.kind_code) === 'image' && rec.excluded !== true;
}

function parseDomains(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr.map((d) => String(d).trim()).filter(Boolean);
    } catch {
      /* fall through to newline parse */
    }
  }
  return trimmed
    .split(/[\r\n,]+/)
    .map((d) => d.trim())
    .filter(Boolean);
}

export function rowToProvider(rec: Row): Provider {
  return {
    id: rec.id ?? '',
    displayName: rec.display_name ?? '',
    principalCode: rec.principal_code ?? '',
    defaultMailbox: rec.default_mailbox ?? '',
    knownEmailDomains: parseDomains(rec.known_email_domains),
    inspectionLocationPolicy:
      inspectionPolicyCodec.toName(rec.inspection_location_policy_code) ?? 'prefer_address',
    providerAutomationMode:
      automationModeCodec.toName(rec.provider_automation_mode_code) ?? 'review_auto',
    active: rec.active ?? false,
  };
}

export function isSuggestedAddressRow(rec: Row): boolean {
  return (rec.source_label ?? '').trim().toLowerCase().startsWith('suggested');
}

function noteToken(note: string | undefined, key: string): string | undefined {
  if (!note) return undefined;
  const m = note.match(new RegExp(`${key}=([^\\s|]+)`));
  return m ? m[1] : undefined;
}

export function rowToSuggestedAddress(rec: Row): SuggestedAddress {
  const lines = [
    rec.address_line1,
    rec.address_line2,
    rec.address_line3,
    rec.address_line4,
    rec.address_line5,
    rec.address_line6,
  ]
    .map((l) => (l ?? '').trim())
    .filter((l) => l.length > 0);
  const label = (rec.source_label ?? '').trim();
  const colon = label.indexOf(':');
  const confidenceBand = colon >= 0 ? label.slice(colon + 1).trim() : undefined;
  const note: string | undefined = rec.source_note ?? undefined;
  const humanEvidence = note
    ? note
        .replace(/\b(?:provider|loc|status)=\S*/gi, '')
        .replace(/\bsource=/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,])/g, '$1')
        .replace(/\.{2,}/g, '.')
        .trim()
    : '';
  const lastSeen = toIso(rec.last_seen_on).slice(0, 10);
  const providerCode = rec.provider_code ? String(rec.provider_code).trim() : undefined;
  return {
    id: rec.id ?? '',
    lines,
    postcode: (rec.postcode ?? '').trim(),
    ...(providerCode ? { providerCode } : {}),
    ...(noteToken(note, 'loc') ? { locValue: noteToken(note, 'loc') } : {}),
    ...(humanEvidence ? { evidenceNote: humanEvidence } : {}),
    ...(confidenceBand ? { confidenceBand } : {}),
    ...(rec.suggestion_frequency != null ? { frequency: Number(rec.suggestion_frequency) } : {}),
    ...(lastSeen ? { lastSeen } : {}),
    ...(rec.suggestion_rank != null ? { rank: Number(rec.suggestion_rank) } : {}),
  };
}

export function sortSuggestions(
  list: SuggestedAddress[],
  opts?: { byDistance?: boolean },
): SuggestedAddress[] {
  const byDistance = opts?.byDistance ?? false;
  return list
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      if (byDistance) {
        const da = a.s.distanceMiles ?? Number.POSITIVE_INFINITY;
        const db = b.s.distanceMiles ?? Number.POSITIVE_INFINITY;
        if (da !== db) return da - db;
      }
      const ra = a.s.rank;
      const rb = b.s.rank;
      if (ra != null && rb != null && ra !== rb) return ra - rb;
      if (ra != null && rb == null) return -1;
      if (ra == null && rb != null) return 1;
      const fa = a.s.frequency ?? 0;
      const fb = b.s.frequency ?? 0;
      if (fa !== fb) return fb - fa;
      const la = a.s.lastSeen ?? '';
      const lb = b.s.lastSeen ?? '';
      if (la !== lb) return lb < la ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.s);
}

export function principalFromCasePo(casePo: string | null | undefined): string {
  return (
    (casePo ?? '')
      .trim()
      .replace(/^(?:AP|A|D)\./i, '')
      .match(/^[A-Za-z]+/)?.[0]
      ?.toUpperCase() ?? ''
  );
}

export function scopeSuggestions(
  all: SuggestedAddress[],
  providerCode: string,
): { list: SuggestedAddress[]; usingFallback: boolean } {
  const scoped = providerCode
    ? all.filter((s) => (s.providerCode ?? '').toUpperCase() === providerCode.toUpperCase())
    : [];
  return scoped.length > 0
    ? { list: scoped, usingFallback: false }
    : { list: all, usingFallback: true };
}

function formatOccurredAt(v: Date | string | undefined): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return typeof v === 'string' ? v : '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** TKT-226 — the audit `after` payload as an object, when (and only when) the row
 *  carries the object form. Legacy rows hold a JSON string scalar or free text →
 *  undefined (the label seam then falls back to the summary filename). */
function afterPayloadObject(raw: unknown): Record<string, unknown> | undefined {
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* legacy free-text after — not an object payload */
  }
  return undefined;
}

export function rowToActivityEvent(rec: Row): ActivityEvent {
  const action = auditActionCodec.toName(
    rec.action_code == null ? undefined : Number(rec.action_code),
  );
  // TKT-134 — the PRIMARY line is ALWAYS the plain-English label from the ONE
  // last-activity map (never the raw summary/enum/payload — the old
  // `rec.name ?? rec.after ?? action` fallback leaked "box_upload_received: …"
  // and raw JSON onto the Action-logs page). Specifics stay on a secondary
  // `detail` line ONLY when the summary is human-safe (plainDetail); otherwise
  // the raw text moves behind the expandable `technical` affordance.
  const rawSummary = typeof rec.name === 'string' ? rec.name : '';
  const detail = plainDetail(rawSummary);
  const technicalParts = [action ?? null, detail ? null : rawSummary || null].filter(
    (s): s is string => Boolean(s && s.trim()),
  );
  const technical = technicalParts.join(' — ');
  // TKT-226 — a Box upload's line is derived from what actually arrived (the
  // `after` object payload, or the legacy summary filename), so the Action log
  // tells the same truth as the queue chip.
  const after = action === 'box_upload_received' ? afterPayloadObject(rec.after) : undefined;
  const description =
    action === 'box_upload_received'
      ? boxUploadLabel({
          evidenceClass: typeof after?.evidenceClass === 'string' ? after.evidenceClass : null,
          origin: typeof after?.origin === 'string' ? after.origin : null,
          summary: rawSummary,
        })
      : auditActionLabel(rec.action_code == null ? undefined : Number(rec.action_code));
  return {
    id: rec.id ?? '',
    caseId: rec.case_id ?? '',
    vrm: '',
    kind: auditActionToActivityKind(action),
    // GUID/system actors never render (humanActorName) — degrade to 'System'.
    actor: humanActorName(rec.actor) ?? 'System',
    timestamp: formatOccurredAt(rec.occurred_at),
    description,
    ...(detail ? { detail } : {}),
    ...(technical ? { technical } : {}),
  };
}
