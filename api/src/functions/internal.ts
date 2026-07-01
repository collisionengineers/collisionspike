/**
 * api/src/functions/internal.ts — orchestration-facing internal routes.
 *
 * The /api/internal/* routes called by orchestration/src/lib/data-api.ts AND by
 * the retained box-webhook Python Function (the box/case-by-folder lookup + the
 * box-aware evidence persist — see functions/box-webhook/data_api_client.py).
 * Auth: service-level Bearer token (a client-credentials MSI token for the API
 * audience), validated against the tenant JWKS (same jwtVerify as user routes)
 * but no CollisionSpike.* app role required — the orchestration / box-webhook MSI
 * token carries the API audience but is not a user token with assigned app roles.
 * Plan 21 §21.3 pattern: the distinct /api/internal/* prefix leaves the
 * DataAccess freeze (R3) untouched.
 *
 * Routes (plan 21 §21.3 + orchestration/src/lib/data-api.ts + box-webhook surface):
 *  GET  /api/internal/provider-match-records         → ProviderMatchRecord[]
 *  GET  /api/internal/dedup-context                  → DedupContext
 *  POST /api/internal/cases/resolve                  → { outcome, caseId }
 *  POST /api/internal/cases/{id}/evidence            → { persisted: number }
 *  GET  /api/internal/cases/{id}/archive-evidence    → blob-backed evidence rows for archive mirroring
 *  POST /api/internal/cases/{id}/archive-evidence/stamp → stamp archive file id/link
 *  POST /api/internal/cases/{id}/status-evaluate     → { value: string }
 *  POST /api/internal/audit                          → 204
 *  GET  /api/internal/principals                     → [{ principalCode }]
 *  GET  /api/internal/disposition/due                → [{ caseId }]
 *  POST /api/internal/disposition/{id}               → 204
 *  GET  /api/internal/box/case-by-folder/{folderId}  → { caseId: string | null }
 *  GET  /api/internal/box/purge-candidates           → [{ caseId, blobPath }]
 *  POST /api/internal/box/mark-purged                → 204
 *  GET  /api/internal/cases/{id}/box-folder          → { boxFolderId, boxFolderUrl, casePo }
 *  POST /api/internal/cases/{id}/box-folder          → { applied, boxFolderId } (first-wins stamp)
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import {
  EVA_FIELD_ORDER,
  TERMINAL_STATUSES,
  casePoSequenceRegex,
  casePoYear,
  formatCasePo,
  statusForReviewCase,
  type CaseStatus,
  type EvidenceDescriptor,
  type ImageRole,
  type InboundCategory,
  type InboundSubtype,
  type StatusEvaluationInput,
} from '@cs/domain';
import {
  actionReasonCodec,
  automationModeCodec,
  caseStatusCodec,
  evidenceKindCodec,
  imageRoleCodec,
  intakeChannelKindCodec,
  sourceTypeCodec,
  statusToInt,
} from '@cs/domain/codecs';
import { authenticate, toErrorResponse } from '../lib/auth.js';
import { query, tx } from '../lib/db.js';
import { AUDIT_ACTION, writeAudit } from '../lib/audit.js';
import { combineMakeModel } from '../lib/enrichment-map.js';
import { selectParserEvaCandidates, type ParserEvaFields } from '../lib/parser-eva-fields.js';
import {
  CASE_SELECT,
  EVA_COLUMN_BY_KEY,
  INBOUND_CATEGORY_TO_INT,
  INBOUND_SUBTYPE_TO_INT,
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
  // authenticate() throws HttpError(401) for a missing/invalid/expired token and
  // rethrows anything UNEXPECTED (e.g. a transient JWKS fetch failure). toErrorResponse
  // maps the former to 401 and the latter to 500 — same discrimination as withRole, so a
  // transient server-side fault is reported as 500 (server fault), not a misleading 401.
  try {
    await authenticate(req);
  } catch (e) {
    return toErrorResponse(e, ctx);
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

/**
 * Fill-if-empty persist of parser-extracted instruction fields onto a case (cross-cutting
 * parser-field persistence). ADVISORY: never clobbers a staff/intake value (mirrors the
 * enrichment fill-if-empty pattern below).
 *  - case_ref            ← parserRef            (only when the case has no case_ref yet)
 *  - eva_mileage (+unit)  ← parserMileage/Unit   (only when the case has no mileage yet)
 *  - the parser-owned EVA columns (vehicle_model, claimant_name/telephone/email, date_of_loss,
 *    date_of_instruction, accident_circumstances, vat_status) ← parserEva — each fill-if-empty
 *    and CONSTRAINT-GUARDED (selectParserEvaCandidates drops a bad date / non-Yes-No VAT so a
 *    malformed parser value can never break the intake UPDATE). This closes the "email-minted
 *    case shows only its registration + Case/PO" gap: the parser extracts all 12 EVA fields but
 *    intake historically forwarded only ref/mileage, leaving the rest NULL.
 *    (work_provider is owned by provider-match, inspection_address by the corpus picker /
 *    ADR-0013 — both intentionally excluded from the document auto-fill.)
 *  Each field actually filled this run gets a field_level_provenance row (pdf_extraction /
 *  "From instructions"). A no-op when every input is absent, so callers can pass them
 *  unconditionally (the orchestration caseResolve activity only populates what the parser found).
 */
async function applyParserFields(
  caseId: string,
  parserRef?: string,
  parserMileage?: string,
  parserMileageUnit?: string,
  parserEva?: ParserEvaFields,
): Promise<void> {
  const ref = (parserRef ?? '').trim();
  const mileage = parserMileage != null ? String(parserMileage).replace(/[^\d]/g, '') : '';
  const unitRaw = (parserMileageUnit ?? '').trim();
  const unit = unitRaw === 'Miles' || unitRaw === 'Km' ? unitRaw : '';
  const evaCandidates = selectParserEvaCandidates(parserEva);
  if (!ref && !mileage && evaCandidates.length === 0) return; // backward-compatible no-op

  // Read every column we might fill so each write is strictly fill-if-empty.
  const readCols = ['case_ref', 'eva_mileage', ...evaCandidates.map((c) => c.column)];
  const cur = await query<Row>(`SELECT ${readCols.join(', ')} FROM case_ WHERE id = $1`, [caseId]);
  if (!cur[0]) return;
  const isEmpty = (v: unknown): boolean => !String(v ?? '').trim();

  const sets: string[] = [];
  const vals: unknown[] = [];
  let mileageFilled = false;
  // The (camelCase) fields actually filled this run → one provenance row each.
  const provenance: Array<{ field: string; value: string }> = [];

  if (ref && isEmpty(cur[0].case_ref)) {
    sets.push(`case_ref = $${sets.length + 1}`);
    vals.push(ref.slice(0, 200));
  }
  if (mileage && isEmpty(cur[0].eva_mileage)) {
    sets.push(`eva_mileage = $${sets.length + 1}`);
    vals.push(mileage.slice(0, 20));
    mileageFilled = true;
    if (unit) {
      sets.push(`eva_mileage_unit = $${sets.length + 1}`);
      vals.push(unit);
    }
  }
  for (const cand of evaCandidates) {
    if (isEmpty(cur[0][cand.column])) {
      sets.push(`${cand.column} = $${sets.length + 1}`);
      vals.push(cand.value);
      provenance.push({ field: cand.provenanceField, value: cand.value });
    }
  }

  if (sets.length === 0) return; // every candidate already populated — respect existing values

  vals.push(caseId);
  await query(
    `UPDATE case_ SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`,
    vals,
  );

  // Provenance (mirror the manual-create field_level_provenance shape): pdf_extraction source /
  // "From instructions" label. Supplementary — must never block intake. Written only for fields
  // actually filled this run, so an idempotent replay (column already set) writes no duplicate.
  if (mileageFilled) provenance.unshift({ field: 'mileage', value: mileage.slice(0, 20) });
  const sourceTypeCode = sourceTypeCodec.toInt('pdf_extraction') ?? 100000000;
  for (const p of provenance) {
    await query(
      `INSERT INTO field_level_provenance
         (name, case_id, field_name, value, source_type_code, source_label)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`${caseId}:${p.field}`, caseId, p.field, p.value, sourceTypeCode, 'From instructions'],
    ).catch(() => { /* provenance is supplementary */ });
  }
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
  body?: string;
  bodyPreview?: string;
  attachments: Array<{ filename: string; contentType: string; blobPath: string; size: number }>;
}

/** Triage classification carried from the orchestration classifyInbound activity (ADR-0015). */
interface InboundClassificationDto {
  category: string;
  subtype: string;
  confidence: number;
  signals: string[];
  bodyVrm: string;
  bodyCaseref: string;
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
        'SELECT id, principal_code, known_email_domains, known_email_addresses, active, provider_automation_mode_code FROM work_provider ORDER BY display_name',
      );
      const records = rows.map((r) => ({
        workProviderId: r.id as string,
        principalCode: r.principal_code as string,
        knownEmailDomains: parseDomains(r.known_email_domains),
        knownEmailAddresses: parseDomains(r.known_email_addresses),
        active: Boolean(r.active),
        // Lets the orchestrator branch on the matched provider's automation mode
        // (work-todo-spike: automation-mode). Default review_auto (the live default).
        providerAutomationMode:
          automationModeCodec.toName(r.provider_automation_mode_code) ?? 'review_auto',
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

      // No provider matched (unknown sender, e.g. a non-provider gmail address):
      // there is nothing to dedup on the provider axis, and work_provider_id is a
      // uuid column so binding '' raises `invalid input syntax for type uuid`.
      // Return an empty context — the UNIQUE(source_message_id) insert backstop in
      // cases/resolve still guards a genuine repeat of the same message.
      if (!workProviderId) {
        return {
          status: 200,
          jsonBody: { openProviderCases: [], seenMessageIds: [], seenPayloadHashes: [] },
        };
      }

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
        /** Parser-confirmed VRM from the instruction PDF — preferred over the email-body
         *  sniff (inbound.candidateVrm) when present; both are postcode/junk-filtered. */
        parserVrm?: string;
        /** Parser-extracted instruction fields, persisted FILL-IF-EMPTY (cross-cutting
         *  parser-field persistence). Absent → no-op (backward-compatible). */
        parserRef?: string;
        parserMileage?: string;
        parserMileageUnit?: 'Miles' | 'Km' | '';
        /** Parser-owned EVA fields (claimant, dates, vehicle, circumstances, VAT) — persisted
         *  fill-if-empty + constraint-guarded. Absent → no-op (backward-compatible). */
        parserEva?: ParserEvaFields;
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
      // #7 — prefer the parser-extracted PDF VRM over the email-body sniff. Both have
      // already run through the canonical postcode/junk filter (extractVrm / Python sniff).
      const vrm = ((body.parserVrm || inbound.candidateVrm) ?? '').trim();

      // The matched provider's automation mode — the SEAM the orchestration worker reads to
      // branch intake (work-todo-spike: automation-mode). No provider (new/unknown client) =>
      // 'manual' (the safest default: do not auto-proceed). A matched provider with an
      // unreadable mode defaults to 'review_auto' (the live default).
      let providerAutomationMode: 'manual' | 'review_auto' | 'full_auto' = 'manual';
      if (workProviderId) {
        const wpMode = await query<Row>(
          'SELECT provider_automation_mode_code FROM work_provider WHERE id = $1',
          [workProviderId],
        );
        providerAutomationMode =
          automationModeCodec.toName(wpMode[0]?.provider_automation_mode_code) ?? 'review_auto';
      }

      // Attach: link inbound_email to the existing target case; no new case_.
      if (decision.resolution === 'attach' && decision.targetCaseId) {
        await upsertInboundEmail(inbound, workProviderId, decision.targetCaseId, undefined, body.parserVrm);
        // Fill-if-empty parser fields onto the EXISTING case (it may lack a ref/mileage the
        // parser found on this email); never clobbers a value already there.
        await applyParserFields(decision.targetCaseId, body.parserRef, body.parserMileage, body.parserMileageUnit, body.parserEva);
        await writeAudit({
          action: AUDIT_ACTION.case_attached,
          caseId: decision.targetCaseId,
          summary: `Email ${inbound.internetMessageId} attached to existing case`,
          after: { messageId: inbound.internetMessageId, resolution: 'attach' },
        });
        return {
          status: 200,
          jsonBody: { outcome: 'attached', caseId: decision.targetCaseId, providerAutomationMode },
        };
      }

      // Create: new case_ for create / new_due_to_reference / propose_attach.
      // The UNIQUE(source_message_id) constraint backstops concurrent/replayed
      // intake — a duplicate will throw PG error 23505, which the catch below
      // returns as 409 (→ ConflictError → already_ingested in the client).
      const rawStatus = decision.statusEffect as CaseStatus;
      const statusCode = caseStatusCodec.toInt(rawStatus) ?? statusToInt('new_email');
      const caseRef = (inbound.candidateRef ?? '').trim();
      const subject = (inbound.subject ?? '').trim();
      const name = ([vrm || null, subject || null].filter(Boolean).join(' · ') || 'Email intake').slice(0, 100);
      const emailKindCode = intakeChannelKindCodec.toInt('email') ?? null;

      // The create + (for a known provider) the Case/PO mint run in ONE transaction so the
      // advisory lock that serialises the per-(principal,year) sequence spans both the
      // MAX+1 probe and the INSERT — no duplicate POs under concurrency (#11). A new client
      // with no matched provider mints NO PO and is routed to Held for operator setup.
      let created: { caseId: string; casePo: string | null; newClient: boolean; principalCode: string };
      try {
        created = await tx(async (q) => {
          // Resolve the provider's principal code (the PO prefix + the known/new-client test).
          let principalCode = '';
          if (workProviderId) {
            const wp = await q<Row>('SELECT principal_code FROM work_provider WHERE id = $1', [workProviderId]);
            principalCode = String(wp[0]?.principal_code ?? '').trim();
          }
          const newClient = !workProviderId || !principalCode;

          // Known provider → mint Case/PO = principal + YY + 3-digit per-(principal,year) seq.
          let casePo: string | null = null;
          if (!newClient) {
            const principal = principalCode.toUpperCase();
            const yy = casePoYear();
            const prefix = `${principal}${yy}`; // e.g. "CCPY26"
            // Serialise concurrent mints for this (principal, year); released at COMMIT/ROLLBACK.
            await q('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`casepo:${prefix}`]);
            // The sequence is the digits AFTER the principal+year prefix — strip the prefix by
            // length ($3) so the contiguous year digits are NOT swept into the number (a trailing
            // [0-9]{3,}$ regex would read "CCPY26050" as 26050, not 050). The ~ filter guarantees
            // everything after the prefix is digits, so the cast is safe. Probe on upper(case_po)
            // (prefix + regex are already upper-cased) so a manual lowercase row like 'ccpy26050'
            // is counted — matching the case-insensitive uq_case_case_po index (#82).
            const seqRows = await q<{ next_seq: string | number }>(
              `SELECT COALESCE(MAX(SUBSTRING(upper(case_po) FROM length($3) + 1)::int), 0) + 1 AS next_seq
                 FROM case_
                WHERE upper(case_po) LIKE $1 AND upper(case_po) ~ $2`,
              [`${prefix}%`, casePoSequenceRegex(principal, yy), prefix],
            );
            casePo = formatCasePo(principal, yy, Number(seqRows[0]?.next_seq ?? 1));
          }

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
          if (casePo) { cols.push('case_po'); vals.push(casePo); }
          // New client → Held: park on the operator safety net with a structured reason
          // (ADR-0010; never silent). on_hold routes to the Held queue; needs_review is the
          // actionReason the SPA surfaces; a note (written after commit) carries the specifics.
          if (newClient) {
            cols.push('on_hold'); vals.push(true);
            cols.push('action_reason_code'); vals.push(actionReasonCodec.toInt('needs_review') ?? null);
          }

          const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
          const rows = await q<Row>(
            `INSERT INTO case_ (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
            vals,
          );
          const caseId = rows[0]?.id as string;
          if (!caseId) throw new Error('case insert returned no id');
          return { caseId, casePo, newClient, principalCode };
        });
      } catch (e: unknown) {
        if (isUniqueViolation(e)) {
          const constraint = uniqueConstraintName(e);
          // case_po collision is near-impossible (advisory lock serialises auto-mints); a
          // source_message_id collision is the expected replay backstop → already_ingested.
          if (constraint === 'uq_case_case_po') {
            ctx.error(`[cases/resolve] case_po unique collision (${constraint})`);
            return { status: 500, jsonBody: { error: 'case_po_collision' } };
          }
          return { status: 409, jsonBody: { error: 'conflict', detail: 'source_message_id already exists' } };
        }
        throw e;
      }

      const newCaseId = created.caseId;
      // Stamp the triage row + upgrade its body_vrm to the best VRM (fixes the "reg on the
      // inbox but blank on the case" split for parser-derived marks).
      await upsertInboundEmail(inbound, workProviderId, newCaseId, undefined, body.parserVrm);
      // Fill-if-empty parser fields onto the new case (case_ref takes the inbound candidateRef
      // first, so parserRef only fills when that was blank; mileage gets provenance).
      await applyParserFields(newCaseId, body.parserRef, body.parserMileage, body.parserMileageUnit, body.parserEva);

      const auditAction =
        AUDIT_ACTION[decision.auditAction as keyof typeof AUDIT_ACTION] ??
        AUDIT_ACTION.case_created;
      await writeAudit({
        action: auditAction,
        caseId: newCaseId,
        summary: `Case ${decision.resolution}: ${name}`,
        after: { resolution: decision.resolution, status: rawStatus, vrm, casePo: created.casePo },
      });

      if (created.newClient) {
        const domain = senderDomain(inbound.senderAddress ?? '');
        // Best-effort note (human-readable new-client tag) — must not block intake.
        await query(
          `INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())`,
          [
            'New client',
            newCaseId,
            'Email intake (auto)',
            `New client — no work provider matched for sender${domain ? ` @${domain}` : ''}. ` +
              `No Case/PO minted; set up the work provider and confirm before EVA.`,
          ],
        ).catch(() => { /* note is supplementary */ });
        await writeAudit({
          action: AUDIT_ACTION.inbound_routed,
          caseId: newCaseId,
          severity: 'warning',
          summary: 'New client routed to Held (no work provider matched)',
          after: { newClient: true, onHold: true, senderDomain: domain },
        });
      }

      return {
        status: 200,
        jsonBody: { outcome: 'created', caseId: newCaseId, casePo: created.casePo, providerAutomationMode },
      };
    }),
});

/* ============================================================
   3b — POST /api/internal/inbound-email
   Called by: orchestration classifyInbound activity (ADR-0015). Records the
   classified triage row for EVERY email (one per arrival) with NO case yet —
   query/other stop here; receiving_work has caseResolve stamp case_id onto the
   SAME row afterwards (idempotent COALESCE upsert on source_message_id).
   ============================================================ */
app.http('internalInboundEmail', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/inbound-email',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json()) as {
        inbound: InboundEnvelope;
        providerId?: string;
        classification: InboundClassificationDto;
      };
      const inboundEmailId = await upsertInboundEmail(
        body.inbound,
        body.providerId ?? null,
        null,
        body.classification,
      );
      return { status: 200, jsonBody: { inboundEmailId } };
    }),
});

/**
 * Upsert the inbound_email triage row (one per arrival; ADR-0015). When `classification`
 * is provided the triage columns (category/subtype/confidence/signals/body_*) are written.
 * The COALESCE upsert makes the two writers order-robust: a later case_id-only stamp
 * (caseResolve) preserves an earlier classification, and a later classification preserves
 * an earlier case_id. Returns the row id, or null on a (swallowed) failure.
 */
async function upsertInboundEmail(
  inbound: InboundEnvelope,
  workProviderId: string | null,
  caseId: string | null,
  classification?: InboundClassificationDto,
  parserVrm?: string,
  /** When set (e.g. 'routed' for a linked reply), stamps triage_state on INSERT and ON
   *  CONFLICT; when omitted, INSERT defaults to 'new' and an existing state is preserved. */
  triageState?: string,
): Promise<string | null> {
  const subject = (inbound.subject ?? '').trim();
  const name = `Email: ${subject || inbound.internetMessageId}`;
  const categoryCode = classification
    ? INBOUND_CATEGORY_TO_INT[classification.category as InboundCategory] ?? null
    : null;
  const subtypeCode = classification
    ? INBOUND_SUBTYPE_TO_INT[classification.subtype as InboundSubtype] ?? null
    : null;
  // Prefer the parser-confirmed PDF VRM for the inbox triage row too (so it shows the same
  // mark the case persists), then the classifier body sniff, then the email-subject sniff.
  const bodyVrm = ((parserVrm || classification?.bodyVrm || inbound.candidateVrm) ?? '').trim() || null;
  const bodyCaseref = (classification?.bodyCaseref || inbound.candidateRef || '') || null;
  const bodyPreview = (inbound.bodyPreview ?? '') || null;
  const confidence = classification ? classification.confidence : null;
  const signals = classification ? JSON.stringify(classification.signals ?? []) : null;
  try {
    const rows = await query<{ id: string }>(
      `INSERT INTO inbound_email
         (name, source_message_id, subject, from_address, sender_domain,
          source_mailbox, received_on, has_attachments, category_code, subtype_code,
          confidence, classifier_mode, signals, triage_state, body_vrm, body_caseref,
          body_preview, case_id, work_provider_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'deterministic',$12,COALESCE($18, 'new'),$13,$14,$15,$16,$17)
       ON CONFLICT (source_message_id) DO UPDATE SET
         case_id          = COALESCE(EXCLUDED.case_id, inbound_email.case_id),
         category_code    = CASE
                              WHEN inbound_email.classifier_mode = 'human'
                                THEN inbound_email.category_code
                              ELSE COALESCE(EXCLUDED.category_code, inbound_email.category_code)
                            END,
         subtype_code     = CASE
                              WHEN inbound_email.classifier_mode = 'human'
                                THEN inbound_email.subtype_code
                              ELSE COALESCE(EXCLUDED.subtype_code, inbound_email.subtype_code)
                            END,
         confidence       = CASE
                              WHEN inbound_email.classifier_mode = 'human'
                                THEN inbound_email.confidence
                              ELSE COALESCE(EXCLUDED.confidence, inbound_email.confidence)
                            END,
         signals          = CASE
                              WHEN inbound_email.classifier_mode = 'human'
                                THEN inbound_email.signals
                              ELSE COALESCE(EXCLUDED.signals, inbound_email.signals)
                            END,
         body_vrm         = COALESCE(EXCLUDED.body_vrm, inbound_email.body_vrm),
         body_caseref     = COALESCE(EXCLUDED.body_caseref, inbound_email.body_caseref),
         body_preview     = COALESCE(EXCLUDED.body_preview, inbound_email.body_preview),
         work_provider_id = COALESCE(EXCLUDED.work_provider_id, inbound_email.work_provider_id),
         -- Re-ingest / link MUST NOT reset a staff-set durable handled state (work-todo-spike
         -- email-management d): once a person actioned/dismissed a row, an automated replay
         -- (classify / caseResolve / link-reply 'routed') leaves it handled.
         triage_state     = CASE
                              WHEN inbound_email.triage_state IN ('actioned','dismissed')
                                THEN inbound_email.triage_state
                              ELSE COALESCE($18, inbound_email.triage_state)
                            END,
         updated_at       = now()
       RETURNING id`,
      [
        name,
        inbound.internetMessageId ?? null,
        subject || null,
        inbound.senderAddress ?? null,
        senderDomain(inbound.senderAddress ?? ''),
        inbound.sourceMailbox ?? null,
        inbound.receivedAt ?? null,
        (inbound.attachments?.length ?? 0) > 0,
        categoryCode,
        subtypeCode,
        confidence,
        signals,
        bodyVrm,
        bodyCaseref,
        bodyPreview,
        caseId,
        workProviderId,
        triageState ?? null,
      ],
    );
    const inboundEmailId = rows[0]?.id ?? null;
    // Stamp the classifier SUGGESTION distinctly (fill-if-null) so a later staff override is
    // visible (work-todo-spike: suggested-tags). Guarded: the suggested_* columns may be
    // absent on a not-yet-migrated DB — a failure here must not block intake.
    if (inboundEmailId && classification && (categoryCode != null || subtypeCode != null)) {
      await query(
        `UPDATE inbound_email
            SET suggested_category_code = COALESCE(suggested_category_code, $2),
                suggested_subtype_code  = COALESCE(suggested_subtype_code, $3)
          WHERE id = $1`,
        [inboundEmailId, categoryCode, subtypeCode],
      ).catch(() => { /* suggested_* columns absent pre-migration — best-effort */ });
    }
    return inboundEmailId;
  } catch {
    // inbound_email is triage provenance; failure must not block primary intake.
    return null;
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

/** The name of the violated UNIQUE constraint on a 23505 (pg `error.constraint`), if present. */
function uniqueConstraintName(e: unknown): string | undefined {
  if (e != null && typeof e === 'object' && 'constraint' in e) {
    const c = (e as { constraint: unknown }).constraint;
    return typeof c === 'string' ? c : undefined;
  }
  return undefined;
}

/* ============================================================
   POST /api/internal/cases/{id}/enrichment
   Called by: orchestration enrich activity (#1) AFTER a 200 from the enrichment
   Function (DVSA MOT + DVLA fallback). Persists the ADVISORY result onto the case's
   EVA columns — FILL-IF-EMPTY only (never clobbers a staff/parser value; enrichment
   is advisory per ADR-0006). There is no separate `make` column: make+model fold into
   the single EVA field #2 (eva_vehicle_model). Mileage + unit move as a pair (the MOT
   estimate is normalised to Miles). Returns { applied: [...] } — the fields it filled.
   ============================================================ */
app.http('internalCasesEnrichment', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/enrichment',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const body = (await req.json()) as {
        vehicle_model?: string;
        make?: string;
        current_mileage?: number | string;
        mileage_unit?: string;
        warnings?: string[];
      };

      const cur = await query<Row>(
        'SELECT eva_vehicle_model, eva_mileage, eva_mileage_unit FROM case_ WHERE id = $1',
        [caseId],
      );
      if (!cur[0]) return { status: 404, jsonBody: { error: 'case not found' } };

      const vehicleModel = combineMakeModel(
        String(body.make ?? '').trim(),
        String(body.vehicle_model ?? '').trim(),
      );
      const mileage = body.current_mileage != null ? String(body.current_mileage).replace(/[^\d]/g, '') : '';
      const mileageUnitRaw = String(body.mileage_unit ?? '').trim();
      const mileageUnit = mileageUnitRaw === 'Miles' || mileageUnitRaw === 'Km' ? mileageUnitRaw : '';

      const applied: string[] = [];
      const sets: string[] = [];
      const vals: unknown[] = [];
      const isEmpty = (v: unknown): boolean => !String(v ?? '').trim();

      if (vehicleModel && isEmpty(cur[0].eva_vehicle_model)) {
        sets.push(`eva_vehicle_model = $${sets.length + 1}`);
        vals.push(vehicleModel.slice(0, 200));
        applied.push('vehicleModel');
      }
      // Mileage + unit are a pair: only fill when the case has no mileage yet (the parsed
      // document is authoritative — the Function already skips the estimate when the doc had it).
      if (mileage && isEmpty(cur[0].eva_mileage)) {
        sets.push(`eva_mileage = $${sets.length + 1}`);
        vals.push(mileage.slice(0, 20));
        applied.push('mileage');
        if (mileageUnit) {
          sets.push(`eva_mileage_unit = $${sets.length + 1}`);
          vals.push(mileageUnit);
          applied.push('mileageUnit');
        }
      }

      if (sets.length > 0) {
        vals.push(caseId);
        await query(
          `UPDATE case_ SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`,
          vals,
        );
        // The orchestrator runs statusEvaluate BEFORE enrich, so a readiness-required field
        // filled here (e.g. mileage/model) would otherwise leave the status stale (e.g. stuck
        // in needs_review though now ready). Recompute now that the new fields are persisted —
        // ONLY when fields were actually applied; recomputeStatus persists only on a change (#680).
        await recomputeStatus(caseId);
      }

      await writeAudit({
        action: AUDIT_ACTION.enrichment_called,
        caseId,
        summary: `Enrichment persisted: ${applied.length ? applied.join(', ') : 'no new fields'}`,
        after: { applied, warnings: body.warnings ?? [] },
      });
      ctx.log(JSON.stringify({ evt: 'internalCasesEnrichment', caseId, applied }));

      return { status: 200, jsonBody: { applied } };
    }),
});

/* ============================================================
   POST /api/internal/inbound/link-reply
   Called by: orchestration linkReply activity (#3). When the classifier flagged an
   inbound as a REPLY about existing work (is_reply, typically query_existing_work), this
   resolves it against OPEN (non-terminal) cases — Case-ref (provider ref / case_po) FIRST,
   then VRM — and links the triage row to the one matching case rather than minting a new
   one. ADR-0010: >1 candidate (or ambiguous) → NEVER auto-link; the triage row is left
   unrouted + duplicate_flagged for a human (the reply's "Held" — there is no new case).
   Returns { outcome: 'linked' | 'ambiguous' | 'no_match', caseId?, candidateCount }.
   ============================================================ */
app.http('internalInboundLinkReply', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/inbound/link-reply',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const body = (await req.json()) as {
        inbound: InboundEnvelope;
        providerId?: string;
        ref?: string;
        vrm?: string;
      };
      const { inbound } = body;
      const workProviderId = body.providerId ?? null;
      const ref = (body.ref ?? '').trim();
      const vrm = (body.vrm ?? '').trim();

      // Resolve candidate OPEN cases — Case-ref first (case_ref OR case_po), then VRM.
      // Cross-provider is allowed here ON PURPOSE: a reply can arrive from the claimant/
      // repairer on a different domain than the instructing provider, so we match on the
      // case identifiers, not the sender's provider.
      let candidates: Row[] = [];
      if (ref) {
        candidates = await query<Row>(
          `SELECT id, case_ref, case_po, vrm FROM case_
            WHERE (case_ref = $1 OR case_po = $1)
              AND status_code NOT IN (${TERMINAL_INT_CODES.join(',')})
            ORDER BY created_at`,
          [ref],
        );
      }
      if (candidates.length === 0 && vrm) {
        candidates = await query<Row>(
          `SELECT id, case_ref, case_po, vrm FROM case_
            WHERE vrm = $1
              AND status_code NOT IN (${TERMINAL_INT_CODES.join(',')})
            ORDER BY created_at`,
          [vrm],
        );
      }

      // Stamp the triage row with the matched case only on an UNAMBIGUOUS single hit, and mark
      // it 'routed' so a successfully-linked reply no longer counts as untriaged in
      // /api/inbound/counts (#753). Ambiguous / no-match leave it defaulting to 'new'.
      const linkCaseId = candidates.length === 1 ? (candidates[0].id as string) : null;
      await upsertInboundEmail(
        inbound,
        workProviderId,
        linkCaseId,
        undefined,
        undefined,
        linkCaseId ? 'routed' : undefined,
      );

      if (linkCaseId) {
        await writeAudit({
          action: AUDIT_ACTION.inbound_routed,
          caseId: linkCaseId,
          summary: `Reply linked to existing case (${ref ? `ref ${ref}` : `vrm ${vrm}`})`,
          after: { matchedBy: ref ? 'caseref' : 'vrm', messageId: inbound.internetMessageId },
        });
        ctx.log(JSON.stringify({ evt: 'linkReply', outcome: 'linked', caseId: linkCaseId }));
        return { status: 200, jsonBody: { outcome: 'linked', caseId: linkCaseId, candidateCount: 1 } };
      }

      if (candidates.length > 1) {
        // ADR-0010: never auto-link an ambiguous reply. Flag for a human; the triage row
        // stays unrouted (its own "Held"). No new case is minted for a reply.
        await writeAudit({
          action: AUDIT_ACTION.duplicate_flagged,
          severity: 'warning',
          summary: `Reply matched ${candidates.length} open cases (${ref ? `ref ${ref}` : `vrm ${vrm}`}); held for manual linking`,
          after: { candidateCount: candidates.length, candidateIds: candidates.map((c) => c.id) },
        });
        ctx.log(JSON.stringify({ evt: 'linkReply', outcome: 'ambiguous', count: candidates.length }));
        return { status: 200, jsonBody: { outcome: 'ambiguous', candidateCount: candidates.length } };
      }

      ctx.log(JSON.stringify({ evt: 'linkReply', outcome: 'no_match' }));
      return { status: 200, jsonBody: { outcome: 'no_match', candidateCount: 0 } };
    }),
});

/**
 * Update image metadata on an ALREADY-persisted evidence row (the seam that lets the
 * image-extraction worker enrich an attachment that intake created without it). Only the
 * fields the caller actually supplied are written (so an intake row's defaults are never
 * clobbered). excluded + exclusion_reason move together (the schema CHECK requires a reason
 * when excluded). Best-effort: a failure is logged + swallowed so one bad row never sinks the
 * batch. Returns the number of rows updated. `whereClause` keys on $1..$N from `whereVals`.
 */
async function applyEvidenceMetadata(
  ctx: InvocationContext,
  whereClause: string,
  whereVals: unknown[],
  row: {
    imageRole?: string;
    imageRoleCode?: number;
    registrationVisible?: boolean;
    acceptedForEva?: boolean;
    excluded?: boolean;
    exclusionReason?: string;
    sha256?: string;
    sequenceIndex?: number;
  },
  computed: {
    imageRoleCode: number;
    registrationVisible: boolean | null;
    excluded: boolean;
    exclusionReason: string | null;
    sha256: string | null;
    sequenceIndex: number | null;
  },
): Promise<number> {
  const sets: string[] = [];
  const vals: unknown[] = [...whereVals];
  const push = (col: string, v: unknown): void => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };

  if (row.imageRoleCode != null || row.imageRole != null) push('image_role_code', computed.imageRoleCode);
  if (typeof row.registrationVisible === 'boolean') push('registration_visible', computed.registrationVisible);
  if (typeof row.acceptedForEva === 'boolean') push('accepted_for_eva', row.acceptedForEva);
  if (row.excluded != null) {
    push('excluded', computed.excluded);
    push('exclusion_reason', computed.exclusionReason); // CHECK-safe: non-empty when excluded
  } else if (typeof row.exclusionReason === 'string' && row.exclusionReason.trim()) {
    push('exclusion_reason', row.exclusionReason.trim());
  }
  if (row.sha256 != null) push('sha256', computed.sha256);
  if (row.sequenceIndex != null) push('sequence_index', computed.sequenceIndex);

  if (sets.length === 0) return 0;
  try {
    const res = await query<{ id: string }>(
      `UPDATE evidence SET ${sets.join(', ')}, updated_at = now() WHERE ${whereClause} RETURNING id`,
      vals,
    );
    return res.length;
  } catch (e) {
    ctx.error(e);
    return 0;
  }
}

/* ============================================================
   4 — POST /api/internal/cases/{id}/evidence
   Called by: orchestration classifyPersist activity (plan 22 §B §A3) AND the
   box-webhook Function (FILE.UPLOADED → one Box evidence row).
   Body: { rows: Array<EvidenceDescriptor-ish row> } where each row is either:
     - an EMAIL/ORCHESTRATION row: { ...descriptor, blobPath, size } — bytes live
       in Blob, deduped idempotently on (case_id, storage_path);
     - a BOX row: { filename, evidenceClass, sourceMessageId:'box:file:<id>',
       boxFileId, boxFileUrl?, acceptedForEva?, sourceLabel? } — storage_path
       stays BLANK (the bytes are mirrored to Blob later, not here), deduped
       idempotently on (case_id, source_message_id) which is the durable
       box:file:<id> tag (box_file_id is a correlation/UI mirror, not the key).
   The two dedup keys never collide: an email row has no sourceMessageId/boxFileId
   and a Box row has no blobPath. Re-running either is idempotent (NOT EXISTS
   guard), so an at-least-once retry updates nothing rather than duplicating.
   ============================================================ */
app.http('internalCasesEvidence', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/evidence',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      const body = (await req.json()) as {
        rows: Array<
          Partial<EvidenceDescriptor> & {
            filename: string;
            blobPath?: string;
            size?: number;
            sourceMessageId?: string;
            boxFileId?: string;
            boxFileUrl?: string;
            sourceLabel?: string;
            acceptedForEva?: boolean;
            // Image metadata — the SEAM the image-extraction worker writes (work-todo-spike:
            // pdf-image-extraction). Accept either the imageRole NAME or imageRoleCode int.
            imageRole?: string;
            imageRoleCode?: number;
            registrationVisible?: boolean;
            excluded?: boolean;
            exclusionReason?: string;
            sha256?: string;
            sequenceIndex?: number;
          }
        >;
      };

      let persisted = 0;
      let updated = 0;
      for (const row of body.rows ?? []) {
        const kindCode =
          evidenceKindCodec.toInt(
            (row.evidenceClass as 'image' | 'instruction' | 'email' | 'other') ?? 'other',
          ) ?? null;

        // ---- image metadata (defaults match the schema: image_role_code NOT NULL DEFAULT
        // unknown(100000003); excluded NOT NULL DEFAULT false; exclusion_reason required when
        // excluded). Computed once; used for both INSERT and the existing-row UPDATE. ----
        const imageRoleCode =
          (typeof row.imageRoleCode === 'number' ? row.imageRoleCode : undefined) ??
          imageRoleCodec.toInt(row.imageRole as ImageRole | undefined) ??
          100000003;
        const registrationVisible =
          typeof row.registrationVisible === 'boolean' ? row.registrationVisible : null;
        const excluded = row.excluded === true;
        const exclusionReason = excluded
          ? (row.exclusionReason ?? '').trim() || 'Excluded' // schema CHECK: required when excluded
          : (row.exclusionReason ?? '').trim() || null;
        const sha256 = (row.sha256 ?? '').trim() || null;
        const sequenceIndex = Number.isInteger(row.sequenceIndex)
          ? (row.sequenceIndex as number)
          : null;
        // Did the caller actually supply any image metadata (vs an intake row that has none)?
        const hasMetadata =
          row.imageRoleCode != null ||
          row.imageRole != null ||
          typeof row.registrationVisible === 'boolean' ||
          row.excluded != null ||
          row.exclusionReason != null ||
          row.sha256 != null ||
          row.sequenceIndex != null;

        const sourceMessageId = (row.sourceMessageId ?? '').trim() || null;
        const boxFileId = (row.boxFileId ?? '').trim() || null;
        const isBoxRow = sourceMessageId != null || boxFileId != null;

        let inserted = false;
        if (isBoxRow) {
          // Box upload: storage_path stays NULL (bytes mirror to Blob later); dedup
          // on the durable box:file:<id> tag in source_message_id (fall back to
          // box_file_id only if the tag is absent).
          const dedupCol = sourceMessageId != null ? 'source_message_id' : 'box_file_id';
          const dedupVal = sourceMessageId ?? boxFileId;
          const result = await query<{ id: string }>(
            `INSERT INTO evidence
               (file_name, case_id, kind_code, content_type, size_bytes,
                source_message_id, box_file_id, box_file_url, accepted_for_eva, source_label,
                image_role_code, registration_visible, excluded, exclusion_reason, sha256, sequence_index)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
             WHERE NOT EXISTS (
               SELECT 1 FROM evidence WHERE case_id = $2 AND ${dedupCol} = $17
             )
             RETURNING id`,
            [
              row.filename,
              caseId,
              kindCode,
              row.contentType || null,
              row.size ?? null,
              sourceMessageId,
              boxFileId,
              (row.boxFileUrl ?? '').trim() || null,
              row.acceptedForEva ?? true,
              (row.sourceLabel ?? '').trim() || 'box_upload',
              imageRoleCode,
              registrationVisible,
              excluded,
              exclusionReason,
              sha256,
              sequenceIndex,
              dedupVal,
            ],
          );
          inserted = result.length > 0;
          // Existing Box row + new metadata (e.g. OCR ran after the upload) -> update in place.
          if (!inserted && hasMetadata) {
            updated += await applyEvidenceMetadata(
              ctx,
              `case_id = $1 AND ${dedupCol} = $2`,
              [caseId, dedupVal],
              row,
              { imageRoleCode, registrationVisible, excluded, exclusionReason, sha256, sequenceIndex },
            );
          }
        } else {
          // Email/orchestration: idempotent on (case_id, storage_path).
          const acceptedForEva = row.acceptedForEva ?? true;
          const result = await query<{ id: string }>(
            `INSERT INTO evidence
               (file_name, case_id, kind_code, content_type, size_bytes, storage_path, source_label,
                accepted_for_eva,
                image_role_code, registration_visible, excluded, exclusion_reason, sha256, sequence_index)
             SELECT $1, $2, $3, $4, $5, $6::text, 'auto-intake', $7, $8, $9, $10, $11, $12, $13
             WHERE NOT EXISTS (
               SELECT 1 FROM evidence WHERE case_id = $2 AND storage_path = $6::text
             )
             RETURNING id`,
            [
              row.filename,
              caseId,
              kindCode,
              row.contentType || null,
              row.size ?? null,
              row.blobPath ?? null,
              acceptedForEva,
              imageRoleCode,
              registrationVisible,
              excluded,
              exclusionReason,
              sha256,
              sequenceIndex,
            ],
          );
          inserted = result.length > 0;
          // Existing intake row + new image metadata -> update it in place (the seam that
          // lets the image-extraction worker enrich an already-persisted attachment).
          if (!inserted && hasMetadata && row.blobPath) {
            updated += await applyEvidenceMetadata(
              ctx,
              'case_id = $1 AND storage_path = $2::text',
              [caseId, row.blobPath],
              row,
              { imageRoleCode, registrationVisible, excluded, exclusionReason, sha256, sequenceIndex },
            );
          }
        }
        if (inserted) persisted++;
      }

      return { status: 200, jsonBody: { persisted, updated } };
    }),
});

/* ============================================================
   5 — GET /api/internal/cases/{id}/archive-evidence
   Called by: orchestration boxArchiveEvidence activity.
   Returns persisted blob-backed evidence rows only, so archive mirroring follows
   the Data API's evidence truth instead of a stale in-memory intake envelope.
   ============================================================ */
app.http('internalCasesArchiveEvidence', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/archive-evidence',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      if (!caseId) return { status: 400, jsonBody: { error: 'caseId required' } };

      const rows = await query<{
        id: string;
        filename: string;
        contentType: string | null;
        blobPath: string;
      }>(
        `SELECT
           id,
           file_name AS filename,
           content_type AS "contentType",
           storage_path AS "blobPath"
         FROM evidence
         WHERE case_id = $1
           AND storage_path IS NOT NULL
           AND box_file_id IS NULL
         ORDER BY created_at ASC, file_name ASC`,
        [caseId],
      );

      return { status: 200, jsonBody: { rows } };
    }),
});

/* ============================================================
   5b — POST /api/internal/cases/{id}/archive-evidence/stamp
   Called by: orchestration boxArchiveEvidence activity after a successful
   archive upload. Stamps the evidence row with the archive file id/link so
   purge eligibility and evidence UI state are driven from stored metadata.
   ============================================================ */
app.http('internalCasesArchiveEvidenceStamp', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/archive-evidence/stamp',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = req.params.id;
      if (!caseId) return { status: 400, jsonBody: { error: 'caseId required' } };
      const body = (await req.json()) as {
        evidenceId?: unknown;
        blobPath?: unknown;
        boxFileId?: unknown;
        boxFileUrl?: unknown;
      };
      const evidenceId = typeof body.evidenceId === 'string' ? body.evidenceId.trim() : '';
      const blobPath = typeof body.blobPath === 'string' ? body.blobPath.trim() : '';
      const boxFileId = typeof body.boxFileId === 'string' ? body.boxFileId.trim() : '';
      const boxFileUrl = typeof body.boxFileUrl === 'string' ? body.boxFileUrl.trim() : '';
      if (!evidenceId || !blobPath || !boxFileId) {
        return { status: 400, jsonBody: { error: 'evidenceId, blobPath and boxFileId required' } };
      }

      const updated = await query<{ id: string }>(
        `UPDATE evidence
            SET box_file_id = $4,
                box_file_url = COALESCE($5, box_file_url),
                updated_at = now()
          WHERE case_id = $1
            AND id = $2
            AND storage_path = $3
          RETURNING id`,
        [caseId, evidenceId, blobPath, boxFileId, boxFileUrl || null],
      );
      return { status: 200, jsonBody: { updated: updated.length > 0 } };
    }),
});

/* ============================================================
   6 — POST /api/internal/cases/{id}/status-evaluate
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
   — GET /api/internal/box/case-by-folder/{folderId}
   Called by: the box-webhook Function (FILE.UPLOADED → resolve the case).
   Box folder id → case_.box_folder_id → the Case id. Returns { caseId: null }
   (200) when the folder resolves to no case — never guesses; the webhook then
   routes the upload to triage/Held.
   ============================================================ */
app.http('internalBoxCaseByFolder', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/box/case-by-folder/{folderId}',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const folderId = (req.params.folderId ?? '').trim();
      if (!folderId) return { status: 200, jsonBody: { caseId: null } };
      const rows = await query<Row>(
        'SELECT id FROM case_ WHERE box_folder_id = $1 LIMIT 1',
        [folderId],
      );
      const caseId = rows.length > 0 ? (rows[0].id as string) : null;
      return { status: 200, jsonBody: { caseId } };
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

/* ============================================================
   12 — GET /api/internal/cases/{id}/box-folder
   Called by: orchestration boxFolderCreate activity (intake wiring + manual
   starter — ADR-0012). Reads the case's current Box folder linkage so the
   activity SKIPS creating a second folder for a case that already has one
   (idempotency). Returns case_po too, so the caller can confirm the folder
   name. { boxFolderId: null } (200) when the case has no folder yet (or the
   case id is unknown) — never guesses.
   ============================================================ */
app.http('internalCaseBoxFolderGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/box-folder',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = (req.params.id ?? '').trim();
      if (!caseId) return { status: 200, jsonBody: { boxFolderId: null, boxFolderUrl: null, casePo: null } };
      const rows = await query<Row>(
        'SELECT box_folder_id, box_folder_url, case_po FROM case_ WHERE id = $1',
        [caseId],
      );
      const r = rows[0];
      return {
        status: 200,
        jsonBody: {
          boxFolderId: (r?.box_folder_id as string) ?? null,
          boxFolderUrl: (r?.box_folder_url as string) ?? null,
          casePo: (r?.case_po as string) ?? null,
        },
      };
    }),
});

/* ============================================================
   13 — POST /api/internal/cases/{id}/box-folder
   Called by: orchestration boxFolderCreate activity AFTER it mints the Box
   folder. FIRST-WINS idempotent stamp of box_folder_id/box_folder_url onto the
   case via a conditional UPDATE (... WHERE box_folder_id IS NULL), so a replay /
   concurrent create never relinks. Writes the box_folder_created audit ONLY when
   it actually stamps (applied:true) — no double-audit on a re-run. Returns the
   effective box_folder_id either way.
   ============================================================ */
app.http('internalCaseBoxFolderStamp', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'internal/cases/{id}/box-folder',
  handler: (req, ctx) =>
    withServiceAuth(req, ctx, async () => {
      const caseId = (req.params.id ?? '').trim();
      const body = (await req.json()) as { boxFolderId?: string; boxFolderUrl?: string };
      const boxFolderId = (body.boxFolderId ?? '').trim();
      const boxFolderUrl = (body.boxFolderUrl ?? '').trim() || null;
      if (!caseId || !boxFolderId) {
        return { status: 400, jsonBody: { error: 'caseId and boxFolderId required' } };
      }
      // Conditional UPDATE → only the first stamp wins; a second matches no row.
      const stamped = await query<Row>(
        `UPDATE case_
            SET box_folder_id = $2, box_folder_url = $3, updated_at = now()
          WHERE id = $1 AND box_folder_id IS NULL
        RETURNING box_folder_id`,
        [caseId, boxFolderId, boxFolderUrl],
      );
      if (stamped.length > 0) {
        await writeAudit({
          action: AUDIT_ACTION.box_folder_created,
          caseId,
          summary: `Archive folder ${boxFolderId} linked to case`,
          after: { boxFolderId, boxFolderUrl },
        });
        return { status: 200, jsonBody: { applied: true, boxFolderId } };
      }
      // Already linked (or unknown case) — return the current value, no audit.
      const cur = await query<Row>('SELECT box_folder_id FROM case_ WHERE id = $1', [caseId]);
      return {
        status: 200,
        jsonBody: { applied: false, boxFolderId: (cur[0]?.box_folder_id as string) ?? null },
      };
    }),
});
