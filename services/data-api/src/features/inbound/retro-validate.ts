/**
 * services/data-api/src/features/inbound/retro-validate.ts — pure validators for the retro reconstruction routes
 * (ADR-0022 / TKT-058; the /api/internal/retro/* surface in internal-retro.ts).
 *
 * Mirrors the provider-intake-validate.ts pattern: a bad wire value is rejected with a
 * machine-readable code (HTTP 400) BEFORE any DB write — never a 500 on a constraint
 * violation, and never a silently-degraded write. Kept pure (no I/O) so it is
 * unit-testable and the routes stay thin.
 *
 * The DEFENCE-IN-DEPTH status rule (an unverified identity may never land terminal)
 * is NOT here — it is a semantic re-assertion the route applies after principal
 * resolution (it needs the DB); this module only guards shapes and enums.
 */

import { CASE_PO_SHAPE_RE, normalizeCasePo } from '@cs/domain';

/** The landing statuses a retro create may request — the ONLY two decideRetroStatus
 *  produces. Everything else (incl. other terminals like box_synced/removed) is a 400:
 *  the retro path must never be a generic write-any-status backdoor. */
export const RETRO_ALLOWED_STATUSES = ['eva_submitted', 'needs_review'] as const;
export type RetroAllowedStatus = (typeof RETRO_ALLOWED_STATUSES)[number];

export const RETRO_RECONSTRUCTION_SOURCES = ['box_eml', 'box_doc', 'outlook', 'minimal'] as const;
export type RetroReconstructionSourceDto = (typeof RETRO_RECONSTRUCTION_SOURCES)[number];

/** The reconstruction search keys as they arrive on the wire (domain RetroKeys).
 *  TKT-219: `claimant` is a SEARCH key for the Box/Outlook rungs only — the
 *  resolve-existing case probes never link on a person's name. */
export interface RetroKeysDto {
  casePo?: string;
  externalRef?: string;
  vrm?: string;
  claimant?: string;
}

export interface NormalisedRetroKeys {
  casePo?: string;
  externalRef?: string;
  vrm?: string;
  claimant?: string;
}

export type RetroValidationErrorCode =
  | 'invalid_body'
  | 'missing_trigger'
  | 'missing_original'
  | 'missing_keys'
  | 'missing_case_id'
  | 'missing_source_message_id'
  | 'invalid_case_po'
  | 'invalid_status'
  | 'invalid_reconstruction_source'
  | 'invalid_action_reason';

export interface RetroValidationError {
  ok: false;
  code: RetroValidationErrorCode;
  message: string;
}

/** Minimal envelope presence check — the routes receive the orchestration's
 *  InboundEnvelope; only the identity field is load-bearing for validation. */
function hasEnvelopeIdentity(v: unknown): boolean {
  return (
    v != null &&
    typeof v === 'object' &&
    typeof (v as { internetMessageId?: unknown }).internetMessageId === 'string' &&
    ((v as { internetMessageId: string }).internetMessageId ?? '').trim().length > 0
  );
}

/** Normalize the wire keys: casePo via the shared normalizer + shape guard (a
 *  present-but-misshapen casePo is an ERROR, never silently reclassified);
 *  externalRef/vrm upper-trimmed (vrm also space-stripped). Blank keys drop out. */
export function normalizeRetroKeys(
  keys: RetroKeysDto | null | undefined,
): NormalisedRetroKeys | RetroValidationError {
  const out: NormalisedRetroKeys = {};
  const rawPo = (keys?.casePo ?? '').trim();
  if (rawPo) {
    const po = normalizeCasePo(rawPo);
    if (!CASE_PO_SHAPE_RE.test(po)) {
      return {
        ok: false,
        code: 'invalid_case_po',
        message: `keys.casePo '${rawPo}' is not Case/PO-shaped`,
      };
    }
    out.casePo = po;
  }
  const ref = (keys?.externalRef ?? '').trim().toUpperCase();
  if (ref) out.externalRef = ref;
  const vrm = (keys?.vrm ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (vrm) out.vrm = vrm;
  const claimant = (keys?.claimant ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (claimant) out.claimant = claimant;
  return out;
}

/* ----------  resolve-existing  ---------- */

export interface NormalisedRetroResolveExisting {
  keys: NormalisedRetroKeys;
}

export function validateRetroResolveExisting(
  body: unknown,
): { ok: true; value: NormalisedRetroResolveExisting } | RetroValidationError {
  if (body == null || typeof body !== 'object') {
    return { ok: false, code: 'invalid_body', message: 'body must be a JSON object' };
  }
  const b = body as { trigger?: unknown; keys?: RetroKeysDto };
  if (!hasEnvelopeIdentity(b.trigger)) {
    return { ok: false, code: 'missing_trigger', message: 'trigger envelope (internetMessageId) required' };
  }
  const keys = normalizeRetroKeys(b.keys);
  if ('ok' in keys) return keys;
  if (!keys.casePo && !keys.externalRef && !keys.vrm && !keys.claimant) {
    return {
      ok: false,
      code: 'missing_keys',
      message: 'at least one of keys.casePo/externalRef/vrm/claimant required',
    };
  }
  return { ok: true, value: { keys } };
}

/* ----------  create  ---------- */

export interface NormalisedRetroCreate {
  keys: NormalisedRetroKeys;
  /** The DISCOVERED Case/PO (Box archive folder name), normalized — absent for an
   *  Outlook-only reconstruction (the route then never touches the PO namespace). */
  casePo?: string;
  status: RetroAllowedStatus;
  onHold: boolean;
  actionReason?: 'needs_review';
  reconstructionSource: RetroReconstructionSourceDto;
}

export function validateRetroCreate(
  body: unknown,
): { ok: true; value: NormalisedRetroCreate } | RetroValidationError {
  if (body == null || typeof body !== 'object') {
    return { ok: false, code: 'invalid_body', message: 'body must be a JSON object' };
  }
  const b = body as {
    original?: unknown;
    trigger?: unknown;
    keys?: RetroKeysDto;
    casePo?: string;
    statusName?: string;
    onHold?: unknown;
    actionReason?: string;
    reconstructionSource?: string;
  };
  if (!hasEnvelopeIdentity(b.original)) {
    return { ok: false, code: 'missing_original', message: 'original envelope (internetMessageId) required' };
  }
  if (!hasEnvelopeIdentity(b.trigger)) {
    return { ok: false, code: 'missing_trigger', message: 'trigger envelope (internetMessageId) required' };
  }
  const keys = normalizeRetroKeys(b.keys);
  if ('ok' in keys) return keys;

  let casePo: string | undefined;
  const rawPo = (b.casePo ?? '').trim();
  if (rawPo) {
    const po = normalizeCasePo(rawPo);
    if (!CASE_PO_SHAPE_RE.test(po)) {
      return { ok: false, code: 'invalid_case_po', message: `casePo '${rawPo}' is not Case/PO-shaped` };
    }
    casePo = po;
  }

  const status = (b.statusName ?? '').trim() as RetroAllowedStatus;
  if (!RETRO_ALLOWED_STATUSES.includes(status)) {
    return {
      ok: false,
      code: 'invalid_status',
      message: `statusName must be one of ${RETRO_ALLOWED_STATUSES.join('/')}`,
    };
  }

  const source = (b.reconstructionSource ?? '').trim() as RetroReconstructionSourceDto;
  if (!RETRO_RECONSTRUCTION_SOURCES.includes(source)) {
    return {
      ok: false,
      code: 'invalid_reconstruction_source',
      message: `reconstructionSource must be one of ${RETRO_RECONSTRUCTION_SOURCES.join('/')}`,
    };
  }

  const actionReasonRaw = (b.actionReason ?? '').trim();
  if (actionReasonRaw && actionReasonRaw !== 'needs_review') {
    return { ok: false, code: 'invalid_action_reason', message: "actionReason must be 'needs_review' when present" };
  }

  return {
    ok: true,
    value: {
      keys,
      ...(casePo ? { casePo } : {}),
      status,
      onHold: b.onHold === true,
      ...(actionReasonRaw ? { actionReason: 'needs_review' as const } : {}),
      reconstructionSource: source,
    },
  };
}

/* ----------  backfill-fields (TKT-225)  ---------- */

export interface NormalisedRetroBackfillFields {
  caseId: string;
  /** The related email's Internet-Message-Id — every provenance row's source_reference. */
  sourceInternetMessageId: string;
}

export function validateRetroBackfillFields(
  body: unknown,
): { ok: true; value: NormalisedRetroBackfillFields } | RetroValidationError {
  if (body == null || typeof body !== 'object') {
    return { ok: false, code: 'invalid_body', message: 'body must be a JSON object' };
  }
  const b = body as { caseId?: unknown; sourceInternetMessageId?: unknown };
  const caseId = typeof b.caseId === 'string' ? b.caseId.trim() : '';
  if (!caseId) {
    return { ok: false, code: 'missing_case_id', message: 'caseId required' };
  }
  const sourceInternetMessageId =
    typeof b.sourceInternetMessageId === 'string' ? b.sourceInternetMessageId.trim() : '';
  if (!sourceInternetMessageId) {
    return {
      ok: false,
      code: 'missing_source_message_id',
      message: 'sourceInternetMessageId required',
    };
  }
  // field_level_provenance.source_reference is varchar(400) (the applyParserFields cap).
  return { ok: true, value: { caseId, sourceInternetMessageId: sourceInternetMessageId.slice(0, 400) } };
}
