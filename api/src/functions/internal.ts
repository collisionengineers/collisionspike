/**
 * api/src/functions/internal.ts — orchestration-facing internal routes.
 *
 * All 11 /api/internal/* routes called by orchestration/src/lib/data-api.ts.
 * Auth: service-level Bearer token (orchestration MSI), validated against the
 * tenant JWKS (same jwtVerify as user routes) but no CollisionSpike.* app role
 * required — the orchestration's MSI token carries the API audience but is not
 * a user token with assigned app roles. Plan 21 §21.3 pattern: the distinct
 * /api/internal/* prefix leaves the DataAccess freeze (R3) untouched.
 *
 * Routes (plan 21 §21.3 + orchestration/src/lib/data-api.ts surface):
 *  GET  /api/internal/provider-match-records       → ProviderMatchRecord[]
 *  GET  /api/internal/dedup-context                → DedupContext
 *  POST /api/internal/cases/resolve                → { outcome, caseId }
 *  POST /api/internal/cases/{id}/evidence          → { persisted: number }
 *  POST /api/internal/cases/{id}/status-evaluate   → { value: string }
 *  POST /api/internal/audit                        → 204
 *  GET  /api/internal/principals                   → [{ principalCode }]
 *  GET  /api/internal/disposition/due              → [{ caseId }]
 *  POST /api/internal/disposition/{id}             → 204
 *  GET  /api/internal/box/purge-candidates         → [{ caseId, blobPath }]
 *  POST /api/internal/box/mark-purged              → 204
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import {
  EVA_FIELD_ORDER,
  TERMINAL_STATUSES,
  statusForReviewCase,
  type CaseStatus,
  type EvidenceDescriptor,
  type StatusEvaluationInput,
} from '@cs/domain';
import {
  caseStatusCodec,
  evidenceKindCodec,
  intakeChannelKindCodec,
  statusToInt,
} from '@cs/domain/codecs';
import { authenticate } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { AUDIT_ACTION, writeAudit } from '../lib/audit.js';
import {
  CASE_SELECT,
  EVA_COLUMN_BY_KEY,
  rowToCase,
  rowToEvidence,
  type Row,
} from '../lib/mappers.js';

/* ============================================================
   Service auth — validate the JWT (sig + iss + aud + exp) without
   requiring a CollisionSpike.* app role. The orchestration MSI presents
   a client-credentials token for the API audience, not a user-delegated
   token with app roles assigned.
   ============================================================ */

async function withServiceAuth(
  req: HttpRequest,
  ctx: InvocationContext,
  fn: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>,
): Promise<HttpResponseInit> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return { status: 401, jsonBody: { error: 'Missing bearer token' } };
  try {
    await authenticate(req);
  } catch {
    return { status: 401, jsonBody: { error: 'Invalid or expired token' } };
  }
  try {
    return await fn(req, ctx);
  } catch (e) {
    ctx.error(e);
    return { status: 500, jsonBody: { error: 'internal' } };
  }
}

/* ============================================================
   Module-level helpers
   ============================================================ */

/** Integer codes for the three terminal CaseStatuses — used in SQL NOT IN filters. */
const TERMINAL_INT_CODES: number[] = TERMINAL_STATUSES
  .map((s) => caseStatusCodec.toInt(s))
  .filter((v): v is number => v != null);

/** Audit action name -> integer code (reverse of AUDIT_ACTION). */
const AUDIT_ACTION_BY_NAME: Readonly<Record<string, number>> = Object.fromEntries(
  Object.entries(AUDIT_ACTION).map(([name, code]) => [name, code as number]),
);

/** Sniff the domain after '@' in a sender address (lower-case). Returns '' on failure. */
function senderDomain(address: string): string {
  const at = address.lastIndexOf('@');
  if (at < 0 || at === address.length - 1) return '';
  return address.slice(at + 1).toLowerCase().trim();
}

/**
 * Recompute a case's status via @cs/domain statusForReviewCase and persist when it
 * changes. Returns the resulting CaseStatus name. Safe to call in any activity that
 * may change the case state.
 */
async function recomputeStatus(caseId: string): Promise<CaseStatus> {
  const rows = await query<Row>(`${CASE_SELECT} WHERE c.id = $1`, [caseId]);
  const rec = rows[0];
  if (!rec) return 'error';

  const evidenceRows = await query<Row>('SELECT * FROM evidence WHERE case_id = $1', [caseId]);
  const evidence = evidenceRows.map(rowToEvidence);
  const full = rowToCase(rec, { evidence });

  const input: StatusEvaluationInput = {
    status: full.status,
    evaFields: full.evaFields,
    evidence: full.evidence,
    instructionCount: full.evidence.filter((e) => e.kind === 'instruction').length,
    hasIdentity:
      full.vrm.trim().length > 0 ||
      full.providerCode.trim().length > 0 ||
      full.evaFields.claimantName.value.trim().length > 0,
  };
  const next = statusForReviewCase(input);

  if (next !== full.status) {
    await query('UPDATE case_ SET status_code = $2, updated_at = now() WHERE id = $1', [
      caseId,
      statusToInt(next),
    ]);
    await writeAudit({
      action: AUDIT_ACTION.status_changed,
      caseId,
      summary: `Status ${full.status} -> ${next} (internal recompute)`,
      before: { status: full.status },
      after: { status: next },
    });
  }
  return next;
}

/* ============================================================
   The InboundEnvelope shape received in resolvePersist.
   Mirrors orchestration/src/functions/activities/fetchMessage.ts InboundEnvelope.
   ============================================================ */
interface InboundEnvelope {
  messageId: string;
  internetMessageId: string;
  subject: string;
  senderAddress: string;
  receivedAt: string;
  sourceMailbox: string;
  payloadHash: string;
  candidateVrm: string;
  candidateRef: string;
  attachments: Array<{ filename: string; contentType: string; blobPath: string; size: number }>;
}

/* ============================================================
   1 — GET /api/internal/provider-match-records
   Called by: orchestration providerMatch activity (plan 22 §B §A1).
   Returns: ProviderMatchRecord[] — the minimum corpus the shared
   matchProviderByDomain needs (id, principalCode, knownEmailDomains, active).
   ============================================================ */
app.http('internalProviderMatchRecords', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/provider-match-records',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const rows = await query<Row>(
        'SELECT id, principal_code, known_email_domains, active FROM work_provider ORDER BY display_name',
      );
      const records = rows.map((r) => ({
        workProviderId: r.id as string,
        principalCode: r.principal_code as string,
        knownEmailDomains: parseDomains(r.known_email_domains),
        active: Boolean(r.active),
      }));
      return { status: 200, jsonBody: records };
    }),
});

function parseDomains(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const s = raw.trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((d) => String(d).trim()).filter(Boolean);
    } catch { /* fall through */ }
  }
  return s.split(/[\r\n,]+/).map((d) => d.trim()).filter(Boolean);
}

/* ============================================================
   2 — GET /api/internal/dedup-context
   Called by: orchestration caseResolve activity (plan 22 §B §A2).
   Returns: { openProviderCases, seenMessageIds, seenPayloadHashes }
   so resolveCase (domain) can run the ADR-0010 ladder client-side.

   Scoped to workProviderId + vrm (VRM may be '' when none sniffed yet;
   omitting VRM filter returns all open cases for the provider).
   seenMessageIds + seenPayloadHashes are also provider-scoped for
   efficiency; the domain re-asserts the cross-provider guard regardless.
   ============================================================ */
app.http('internalDedupContext', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/dedup-context',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const workProviderId = req.query.get('workProviderId') ?? '';
      const vrm = req.query.get('vrm') ?? '';

      // Open same-provider cases (non-terminal) for the provider + VRM.
      // VRM = '' skips the VRM filter so resolveCase sees all provider cases.
      const caseRows = vrm
        ? await query<Row>(
            `SELECT id, case_ref, status_code, work_provider_id
               FROM case_
              WHERE work_provider_id = $1
                AND (vrm = $2 OR vrm IS NULL OR vrm = '')
                AND status_code NOT IN (${TERMINAL_INT_CODES.join(',')})
              ORDER BY created_at`,
            [workProviderId, vrm],
          )
        : await query<Row>(
            `SELECT id, case_ref, status_code, work_provider_id
               FROM case_
              WHERE work_provider_id = $1
                AND status_code NOT IN (${TERMINAL_INT_CODES.join(',')})
              ORDER BY created_at`,
            [workProviderId],
          );

      const openProviderCases = caseRows.map((r) => ({
        caseId: r.id as string,
        caseRef: (r.case_ref as string | null) ?? undefined,
        status: (caseStatusCodec.toName(r.status_code as number) ?? 'error') as CaseStatus,
        workProviderId: (r.work_provider_id as string | null) ?? undefined,
      }));

      // Seen message IDs for rung-1 repeat guard — provider-scoped from
      // case_ (the primary dedup key store).
      const msgRows = await query<Row>(
        `SELECT source_message_id FROM case_
          WHERE work_provider_id = $1 AND source_message_id IS NOT NULL`,
        [workProviderId],
      );
      const seenMessageIds = msgRows.map((r) => r.source_message_id as string);

      // Seen payload hashes — provider-scoped from case_.
      const hashRows = await query<Row>(
        `SELECT payload_hash FROM case_
          WHERE work_provider_id = $1 AND payload_hash IS NOT NULL`,
        [workProviderId],
      );
      const seenPayloadHashes = hashRows.map((r) => r.payload_hash as string);

      return {
        status: 200,
        jsonBody: { openProviderCases, seenMessageIds, seenPayloadHashes },
      };
    }),
});

/* ============================================================
   3 — POST /api/internal/cases/resolve
   Called by: orchestration caseResolve activity (plan 22 §B §A2).

   The ADR-0010 DECISION runs in the activity (shared resolveCase domain
   function). This endpoint owns the PERSIST step: creates a new case_ (for
   create/new_due_to_reference/propose_attach resolutions) or links the
   inbound_email to an existing case (for attach). Also writes the inbound_email
   row for Phase-8 triage provenance in all non-drop paths.

   409 Conflict → UNIQUE(source_message_id) backstop fired (already ingested);
   the data-api client maps 409 to ConflictError → already_ingested return.
   ============================================================ */
app.http('internalCasesResolve', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/resolve',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json()) as {
        inbound: InboundEnvelope;
        providerId?: string;
        matchState?: string;
        decision: {
          resolution: string;
          targetCaseId?: string;
          setDuplicateRisk: boolean;
          caseLinkState?: 'none' | 'pending';
          statusEffect: string;
          auditAction: string;
        };
      };

      const { inbound, providerId, decision } = body;
      const workProviderId = providerId ?? null;

      // Attach: link inbound_email to the existing target case; no new case_.
      if (decision.resolution === 'attach' && decision.targetCaseId) {
        await upsertInboundEmail(inbound, workProviderId, decision.targetCaseId);
        await writeAudit({
          action: AUDIT_ACTION.case_attached,
          caseId: decision.targetCaseId,
          summary: `Email ${inbound.internetMessageId} attached to existing case`,
          after: { messageId: inbound.internetMessageId, resolution: 'attach' },
        });
        return { status: 200, jsonBody: { outcome: 'attached', caseId: decision.targetCaseId } };
      }

      // Create: new case_ for create / new_due_to_reference / propose_attach.
      // The UNIQUE(source_message_id) constraint backstops concurrent/replayed
      // intake — a duplicate will throw PG error 23505, which the catch below
      // returns as 409 (→ ConflictError → already_ingested in the client).
      const rawStatus = decision.statusEffect as CaseStatus;
      const statusCode = caseStatusCodec.toInt(rawStatus) ?? statusToInt('new_email');
      const vrm = (inbound.candidateVrm ?? '').trim();
      const caseRef = (inbound.candidateRef ?? '').trim();
      const subject = (inbound.subject ?? '').trim();
      const name = [vrm || null, subject || null].filter(Boolean).join(' · ') || 'Email intake';

      const emailKindCode = intakeChannelKindCodec.toInt('email') ?? null;

      let newCaseId: string;
      try {
        const cols = [
          'name', 'vrm', 'status_code',
          'intake_channel_kind_code', 'intake_channel_manual', 'source_mailbox',
          'source_message_id', 'payload_hash', 'work_provider_id',
        ];
        const vals: unknown[] = [
          name, vrm || null, statusCode,
          emailKindCode, false, inbound.sourceMailbox ?? null,
          inbound.internetMessageId ?? null,
          inbound.payloadHash ?? null,
          workProviderId,
        ];
        if (caseRef) { cols.push('case_ref'); vals.push(caseRef); }

        const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
        const rows = await query<Row>(
          `INSERT INTO case_ (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
          vals,
        );
        newCaseId = rows[0]?.id as string;
        if (!newCaseId) return { status: 500, jsonBody: { error: 'case insert returned no id' } };
      } catch (e: unknown) {
        // PG unique violation on source_message_id → already ingested backstop.
        if (isUniqueViolation(e)) {
          return { status: 409, jsonBody: { error: 'conflict', detail: 'source_message_id already exists' } };
        }
        throw e;
      }

      await upsertInboundEmail(inbound, workProviderId, newCaseId);

      const auditAction =
        AUDIT_ACTION[decision.auditAction as keyof typeof AUDIT_ACTION] ??
        AUDIT_ACTION.case_created;
      await writeAudit({
        action: auditAction,
        caseId: newCaseId,
        summary: `Case ${decision.resolution}: ${name}`,
        after: { resolution: decision.resolution, status: rawStatus, vrm },
      });

      return { status: 200, jsonBody: { outcome: 'created', caseId: newCaseId } };
    }),
});

/** Upsert an inbound_email row for Phase-8 triage provenance (one row per arrival). */
async function upsertInboundEmail(
  inbound: InboundEnvelope,
  workProviderId: string | null,
  caseId: string,
): Promise<void> {
  const subject = (inbound.subject ?? '').trim();
  const name = `Email: ${subject || inbound.internetMessageId}`;
  try {
    await query(
      `INSERT INTO inbound_email
         (name, source_message_id, subject, from_address, sender_domain,
          source_mailbox, received_on, has_attachments, triage_state,
          classifier_mode, body_vrm, case_id, work_provider_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new','deterministic',$9,$10,$11)
       ON CONFLICT (source_message_id)
       DO UPDATE SET case_id = EXCLUDED.case_id, updated_at = now()`,
      [
        name,
        inbound.internetMessageId ?? null,
        subject || null,
        inbound.senderAddress ?? null,
        senderDomain(inbound.senderAddress ?? ''),
        inbound.sourceMailbox ?? null,
        inbound.receivedAt ?? null,
        (inbound.attachments?.length ?? 0) > 0,
        (inbound.candidateVrm ?? '') || null,
        caseId,
        workProviderId,
      ],
    );
  } catch {
    // inbound_email is triage provenance; failure must not block primary intake.
  }
}

/** True when the error is a PostgreSQL UNIQUE violation (code 23505). */
function isUniqueViolation(e: unknown): boolean {
  return (
    e != null &&
    typeof e === 'object' &&
    'code' in e &&
    (e as { code: unknown }).code === '23505'
  );
}

/* ============================================================
   4 — POST /api/internal/cases/{id}/evidence
   Called by: orchestration classifyPersist activity (plan 22 §B §A3).
   Body: { rows: Array<EvidenceDescriptor & { blobPath: string; size: number }> }
   Idempotent upsert by (case_id, storage_path): re-running the activity after
   a partial failure updates updated_at rather than duplicating rows.
   ============================================================ */
app.http('internalCasesEvidence', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/evidence',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const body = (await req.json()) as {
        rows: Array<EvidenceDescriptor & { blobPath: string; size: number }>;
      };

      let persisted = 0;
      for (const row of body.rows ?? []) {
        const kindCode = evidenceKindCodec.toInt(row.evidenceClass as 'image' | 'instruction' | 'email' | 'other') ?? null;
        // Conditional insert: skip if a row with this (case_id, storage_path) already exists.
        const result = await query<{ id: string }>(
          `INSERT INTO evidence
             (file_name, case_id, kind_code, content_type, size_bytes, storage_path, source_label)
           SELECT $1, $2, $3, $4, $5, $6, 'auto-intake'
           WHERE NOT EXISTS (
             SELECT 1 FROM evidence WHERE case_id = $2 AND storage_path = $6
           )
           RETURNING id`,
          [row.filename, caseId, kindCode, row.contentType || null, row.size ?? null, row.blobPath ?? null],
        );
        if (result.length > 0) persisted++;
      }

      return { status: 200, jsonBody: { persisted } };
    }),
});

/* ============================================================
   5 — POST /api/internal/cases/{id}/status-evaluate
   Called by: orchestration statusEvaluate activity (plan 22 §B §A5).
   Recomputes EVA-readiness + status machine and persists when changed.
   ============================================================ */
app.http('internalCasesStatusEvaluate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/status-evaluate',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const value = await recomputeStatus(caseId);
      return { status: 200, jsonBody: { value } };
    }),
});

/* ============================================================
   6 — POST /api/internal/audit
   Called by: orchestration activities (providerMatch, classifyPersist,
   caseResolve, dispositionOne) after every significant event.
   Body: { action: string (name), caseId?, summary, severity?, before?, after? }
   The action is the NAME string (e.g. 'provider_matched'), looked up to an
   integer code via AUDIT_ACTION. Unknown names → info audit with the raw name.
   Always returns 204 — a failure must not block the calling activity.
   ============================================================ */
app.http('internalAudit', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/audit',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json()) as {
        action: string;
        caseId?: string;
        summary: string;
        severity?: 'info' | 'warning' | 'error';
        before?: unknown;
        after?: unknown;
      };

      const code = AUDIT_ACTION_BY_NAME[body.action] as number | undefined;
      await writeAudit({
        action: (code ?? AUDIT_ACTION.graph_message_ingested) as (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION],
        caseId: body.caseId,
        summary: body.summary,
        severity: body.severity ?? 'info',
        before: body.before,
        after: body.after,
      });

      return { status: 204 };
    }),
});

/* ============================================================
   7 — GET /api/internal/principals
   Called by: orchestration jobsheet-import fan-out (plan 22 §C).
   Returns: [{ principalCode }] for each active work provider — one
   fan-out branch per principal code.
   ============================================================ */
app.http('internalPrincipals', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/principals',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const rows = await query<Row>(
        'SELECT principal_code FROM work_provider WHERE active = true ORDER BY principal_code',
      );
      return {
        status: 200,
        jsonBody: rows.map((r) => ({ principalCode: r.principal_code as string })),
      };
    }),
});

/* ============================================================
   8 — GET /api/internal/disposition/due
   Called by: orchestration dispositionList activity (plan 22 §C case-disposition).
   Returns: [{ caseId }] for cases whose retention clock has expired and that are
   not under legal hold (ADR-0017, gated-off by CASE_DISPOSITION_ENABLED — the
   gate is checked in the calling activity, not here).
   ============================================================ */
app.http('internalDispositionDue', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/disposition/due',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const rows = await query<Row>(
        `SELECT id FROM case_
          WHERE retention_expires_at IS NOT NULL
            AND retention_expires_at < now()
            AND legal_hold IS NOT TRUE
          ORDER BY retention_expires_at
          LIMIT 500`,
      );
      return {
        status: 200,
        jsonBody: rows.map((r) => ({ caseId: r.id as string })),
      };
    }),
});

/* ============================================================
   9 — POST /api/internal/disposition/{id}
   Called by: orchestration dispositionOne activity (plan 22 §C).
   Anonymises the case: clears all PII fields and marks the case closed.
   Evidence rows are CASCADE-deleted via the FK when on-delete=cascade
   (or left — retention decision left to the operator per ADR-0017).
   Does NOT delete the case_ row here; a hard DELETE requires the DB
   admin role (RLS) and is an operator-gated step (docs/gated.md).
   ============================================================ */
app.http('internalDispositionCase', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/disposition/{id}',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;

      // Clear PII: all 12 EVA fields + overview fields + VRM.
      const evaCols = EVA_FIELD_ORDER.map((d) => `${EVA_COLUMN_BY_KEY[d.key]} = ''`).join(', ');
      await query(
        `UPDATE case_
            SET ${evaCols},
                vrm = '', case_ref = '', name = '[disposed]',
                ov_insured_name = NULL, ov_claimant_name = NULL,
                ov_third_party_name = NULL, ov_claim_number = NULL,
                ov_policy_reference = NULL, ov_incident_date = NULL,
                ov_insurer_name = NULL, ov_repairer_name = NULL,
                closed_at = now(), updated_at = now()
          WHERE id = $1`,
        [caseId],
      );

      await writeAudit({
        action: AUDIT_ACTION.case_disposed,
        caseId,
        summary: 'Retention disposition: PII fields cleared',
        severity: 'warning',
      });

      return { status: 204 };
    }),
});

/* ============================================================
   10 — GET /api/internal/box/purge-candidates
   Called by: orchestration boxPurgeList activity (plan 22 §C box-blob-purge).
   Returns: evidence rows where the bytes have been confirmed in Box
   (box_file_id IS NOT NULL) but the Azure Blob bytes have not yet been
   purged (storage_path IS NOT NULL). After purge the blob path is cleared
   by /api/internal/box/mark-purged.
   ============================================================ */
app.http('internalBoxPurgeCandidates', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/box/purge-candidates',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const rows = await query<Row>(
        `SELECT case_id, storage_path
           FROM evidence
          WHERE box_file_id IS NOT NULL
            AND storage_path IS NOT NULL
          ORDER BY created_at
          LIMIT 1000`,
      );
      return {
        status: 200,
        jsonBody: rows.map((r) => ({
          caseId: r.case_id as string,
          blobPath: r.storage_path as string,
        })),
      };
    }),
});

/* ============================================================
   11 — POST /api/internal/box/mark-purged
   Called by: orchestration boxPurgeOne activity after deleteEvidenceBytes succeeds.
   Clears storage_path on the matched evidence row so the row no longer appears
   in /api/internal/box/purge-candidates. Idempotent: clearing an already-null
   storage_path is a no-op.
   ============================================================ */
app.http('internalBoxMarkPurged', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/box/mark-purged',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json()) as { caseId: string; blobPath: string };
      await query(
        `UPDATE evidence
            SET storage_path = NULL, updated_at = now()
          WHERE case_id = $1 AND storage_path = $2`,
        [body.caseId, body.blobPath],
      );
      return { status: 204 };
    }),
});
