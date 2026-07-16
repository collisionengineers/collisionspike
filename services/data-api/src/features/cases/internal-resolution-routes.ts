/** internal-resolution-routes — cohesive Data API module. */

import { app } from '@azure/functions';
import { allowedCaseTypes, markerForMint, type CaseStatus, type CaseWorkType } from '@cs/domain';
import { actionReasonCodec, automationModeCodec, caseStatusCodec, caseTypeCodec, intakeChannelKindCodec, statusToInt } from '@cs/domain/codecs';
import { gates } from '../settings/gates.js';
import { query, tx } from '../../platform/db/client.js';
import { mintCasePo } from './case-po.js';
import { AUDIT_ACTION, writeAudit } from '../../shared/audit.js';
import { type ParserEvaFields } from '../inbound/parser-eva-fields.js';
import { type Row } from '../../shared/mapping/index.js';
import { acquireTriageLocks } from '../inbound/triage-locks.js';
import { clampVarchar, vrmOrEmpty } from '../../shared/validation/varchar.js';
import { upsertInboundEmail } from '../inbound/persistence.js';
import { isUniqueViolation, uniqueConstraintName } from '../inbound/internal/unique-violation.js';
import { buildHeldReason } from './held-reason.js';
import { exactCaseForSourceMessage, type InboundEnvelope } from '../inbound/internal/inbound-identity.js';
import { applyParserFields } from '../inbound/internal/parser-fields.js';
import { markOutstandingChasersResponded, mintBlockedByCategory, type ProviderResolutionSource, senderDomain, withServiceAuth } from '../inbound/internal/service-support.js';

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
         *  parser-field persistence). Omitted fields are not changed. */
        parserRef?: string;
        parserMileage?: string;
        parserMileageUnit?: 'Miles' | 'Km' | '';
        /** Parser-owned EVA fields (claimant, dates, vehicle, circumstances, VAT) — persisted
         *  fill-if-empty + constraint-guarded. Omitted fields are not changed. */
        parserEva?: ParserEvaFields;
        /** rules-engine-v2 Phase 3 (ADR-0011) — set when the SENDER matched an Image-Source
         *  intermediary (orchestration providerMatch activity) rather than a direct work
         *  provider. Forwarded to applyParserFields so a content-detected provider found
         *  among the intermediary's N:N candidates is recorded as CORROBORATED, not a bare
         *  guess. Omitted when the sender matched a direct provider or nothing at all. */
        intermediaryImageSourceId?: string;
        intermediaryCandidateProviderIds?: string[];
        /** ADR-0021 — the orchestrator's intake case-type decision (decideCaseType over the
         *  parser case_type envelope + classifier subtype). APPLIED (case_type_code + marker
         *  mint) only behind AUDIT_CASES_ENABLED; with the gate off, fired signals are
         *  recorded as an observe-only audit_event (shadow rollout). Omitted means standard. */
        caseType?: string;
        caseTypeDual?: boolean;
        caseTypeSignals?: string[];
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
      const intermediary = body.intermediaryImageSourceId
        ? {
            imageSourceId: body.intermediaryImageSourceId,
            candidateProviderIds: body.intermediaryCandidateProviderIds ?? [],
          }
        : null;
      // #7 — prefer the parser-extracted PDF VRM over the email-body sniff. Both have
      // already run through the canonical postcode/junk filter (extractVrm / Python sniff).
      // TKT-073: an over-length "VRM" is a junk sniff, not data — drop it (same as no VRM)
      // instead of failing the case_ INSERT with pg 22001 (the live 2026-07-02/03 outages).
      const vrmGuard = vrmOrEmpty(body.parserVrm || inbound.candidateVrm);
      if (vrmGuard.dropped) {
        ctx.warn(
          `[cases/resolve] over-length VRM candidate dropped (junk sniff > varchar(16)) for ${inbound.internetMessageId}`,
        );
      }
      const vrm = vrmGuard.value;

      // Case-type decision (ADR-0021). Resolve it before the attach/create split so
      // provider recovery on either path uses the same marker decision.
      const caseType: CaseWorkType = caseTypeCodec.toInt(body.caseType as CaseWorkType) != null
        ? (body.caseType as CaseWorkType)
        : 'standard';
      const caseTypeDual = body.caseTypeDual === true;
      const caseTypeSignals = Array.isArray(body.caseTypeSignals) ? body.caseTypeSignals : [];
      const auditGateOn = gates.auditCases();

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

      const persistExistingCase = async (targetCaseId: string, exactReplay: boolean) => {
        await upsertInboundEmail(inbound, workProviderId, targetCaseId, undefined, body.parserVrm);
        // Fill-if-empty parser fields onto the EXISTING case. On an exact replay this is
        // the load-bearing response-loss repair: the first attempt may have committed the
        // case row before parser fields/provider recovery/downstream work completed.
        const parserFieldsResult = await applyParserFields(
          targetCaseId,
          body.parserRef,
          body.parserMileage,
          body.parserMileageUnit,
          body.parserEva,
          workProviderId,
          intermediary,
          {
            caseType: auditGateOn ? caseType : 'standard',
            caseTypeDual,
            allowCasePoMint: true,
          },
        );
        if (parserFieldsResult.resolvedProviderId && parserFieldsResult.resolvedProviderId !== workProviderId) {
          await upsertInboundEmail(
            inbound,
            parserFieldsResult.resolvedProviderId,
            targetCaseId,
            undefined,
            body.parserVrm,
          );
        }
        providerAutomationMode =
          parserFieldsResult.providerRecovery?.providerAutomationMode ?? providerAutomationMode;
        const attachedIdentity = await query<Row>(
          'SELECT case_po FROM case_ WHERE id = $1',
          [targetCaseId],
        );
        const effectiveCasePo =
          parserFieldsResult.casePo ?? (String(attachedIdentity[0]?.case_po ?? '').trim() || null);
        await writeAudit({
          action: AUDIT_ACTION.case_attached,
          caseId: targetCaseId,
          summary: exactReplay
            ? `Email ${inbound.internetMessageId} replayed against its existing case`
            : `Email ${inbound.internetMessageId} attached to existing case`,
          after: {
            messageId: inbound.internetMessageId,
            resolution: exactReplay ? 'replay' : 'attach',
            casePo: effectiveCasePo,
            providerRecovery: parserFieldsResult.providerRecovery?.outcome ?? 'not_needed',
          },
        });
        // A true reply/attachment satisfies a chaser. A transport replay of the same
        // source message never does: it is recovery, not new correspondence.
        if (!exactReplay) {
          await markOutstandingChasersResponded(targetCaseId, 'dedup attach');
        }
        return {
          status: 200,
          jsonBody: {
            outcome: exactReplay ? 'replayed' : 'attached',
            caseId: targetCaseId,
            casePo: effectiveCasePo,
            providerAutomationMode,
            providerRecovery: parserFieldsResult.providerRecovery?.outcome ?? 'not_needed',
          },
        };
      };

      // Attach/replay: link inbound_email to the existing target case; no new case_.
      // Exact replay reapplies retained parser fields but deliberately skips reply-only
      // side effects such as satisfying a newer outstanding chaser.
      if (
        (decision.resolution === 'attach' || decision.resolution === 'replay') &&
        decision.targetCaseId
      ) {
        return persistExistingCase(decision.targetCaseId, decision.resolution === 'replay');
      }

      // TKT-119 belt-and-braces: an acknowledgement / query / non_actionable (or any other
      // non-minting-category) email may NEVER create a case from THIS seam either — the
      // orchestration categoryMintsCase guard (TKT-081) is re-asserted here against the
      // message's OWN triage row, so no future caller/path can mint from an ack.
      const blockedCategory = await mintBlockedByCategory(inbound.internetMessageId);
      if (blockedCategory) {
        await writeAudit({
          action: AUDIT_ACTION.inbound_routed,
          severity: 'warning',
          summary: `Create refused — '${blockedCategory}' emails never open a case (kept in the inbox for review)`,
          after: { messageId: inbound.internetMessageId, category: blockedCategory, seam: 'cases/resolve' },
        });
        ctx.log(JSON.stringify({ evt: 'caseResolvePersist', outcome: 'refused_category', category: blockedCategory }));
        return { status: 200, jsonBody: { outcome: 'refused_category', category: blockedCategory } };
      }

      // Create: new case_ for create / new_due_to_reference / propose_attach.
      // The UNIQUE(source_message_id) constraint backstops concurrent/replayed
      // intake — a duplicate will throw PG error 23505, which the catch below
      // returns as 409 (→ ConflictError → already_ingested in the client).
      const rawStatus = decision.statusEffect as CaseStatus;
      const statusCode = caseStatusCodec.toInt(rawStatus) ?? statusToInt('new_email');
      // TKT-073: case_.case_ref is varchar(100) — clamp (with a warn trace) instead of
      // failing the INSERT with pg 22001 (the live 2026-06-30/07-01 outages).
      const caseRefGuard = clampVarchar(inbound.candidateRef, 100);
      if (caseRefGuard.clamped) {
        ctx.warn(
          `[cases/resolve] candidateRef clamped to 100 chars (was ${caseRefGuard.originalLength}) for ${inbound.internetMessageId}`,
        );
      }
      const caseRef = caseRefGuard.value;
      const subject = (inbound.subject ?? '').trim();
      const name = ([vrm || null, subject || null].filter(Boolean).join(' · ') || 'Email intake').slice(0, 100);
      const emailKindCode = intakeChannelKindCodec.toInt('email') ?? null;

      // The create + (for a known provider) the Case/PO mint run in ONE transaction so the
      // advisory lock that serialises the per-(marker,principal,year) sequence spans both the
      // MAX+1 probe and the INSERT — no duplicate POs under concurrency (#11). A new client
      // with no matched provider mints NO PO and is routed to Held for operator setup.
      let created: {
        caseId: string;
        casePo: string | null;
        newClient: boolean;
        principalCode: string;
        mintedMarker: '' | 'A.' | 'AP.' | 'D.';
      };
      try {
        created = await tx(async (q) => {
          // rules-engine-v2 Phase 2 (ADR-0019 "mint race"): serialise this mint against a
          // concurrent /api/internal/triage/context read or /api/internal/inbound/link-reply
          // for the SAME ref/VRM — same key derivation as those two call sites
          // (services/data-api/src/features/inbound/triage-locks.ts), so a reader that starts after this transaction
          // commits (or rolls back) always sees its result. No job-ref is available on this
          // payload (cases/resolve carries candidateRef/candidateVrm only), so only the
          // ref/vrm locks are taken here.
          await acquireTriageLocks(q, { caseref: caseRef, vrm });

          // Resolve the provider's principal code (the PO prefix + the known/new-client test).
          let principalCode = '';
          if (workProviderId) {
            const wp = await q<Row>('SELECT principal_code FROM work_provider WHERE id = $1', [workProviderId]);
            principalCode = String(wp[0]?.principal_code ?? '').trim();
          }
          const newClient = !workProviderId || !principalCode;

          // Known provider → mint Case/PO = [marker] + principal + YY + 3-digit sequence.
          // Shared advisory-locked mint (services/data-api/src/features/cases/case-po.ts) — identical logic to the
          // manual-intake and provider-API paths; the lock lives on this transaction's `q`.
          // The MARKER (ADR-0021) applies only when AUDIT_CASES_ENABLED: a STANDALONE
          // audit for an allowlisted principal mints from the marker's own sequence
          // (A.PCH26001…); a DUAL report+audit letter (QDOS) keeps the standard sequence
          // (its audit ID is derived at review); everything else mints exactly as today.
          const mintedMarker = auditGateOn && !newClient
            ? markerForMint(caseType, principalCode, caseTypeDual)
            : '';
          let casePo: string | null = null;
          if (!newClient) {
            casePo = await mintCasePo(q, principalCode, undefined, mintedMarker);
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
          // TKT-128 (follow-up): the subject-sniffed reference also seeds the "Imported
          // details" overview fact, so a subject-only ref (no parsable document) still
          // populates the panel's Claim no. — fill-at-create; applyParserFields keeps its
          // own fill-if-empty for the parser's ref.
          if (caseRef) { cols.push('ov_claim_number'); vals.push(caseRef.slice(0, 100)); }
          if (casePo) { cols.push('case_po'); vals.push(casePo); }
          // case_type_code (ADR-0014/ADR-0021) — written only behind the gate (the live
          // choice_case_type rows for the new types land via the operator's DDL delta;
          // writing earlier would risk an FK violation). standard stays NULL (=standard).
          if (auditGateOn && caseType !== 'standard') {
            cols.push('case_type_code');
            vals.push(caseTypeCodec.toInt(caseType) ?? null);
          }
          // New client → Held: park on the operator safety net with a structured reason
          // (ADR-0010; never silent). on_hold routes to the Held queue; needs_review is the
          // actionReason the SPA surfaces; a note (written after commit) carries the specifics.
          if (newClient) {
            cols.push('on_hold'); vals.push(true);
            cols.push('on_hold_reason'); vals.push('provider_unresolved');
            cols.push('action_reason_code'); vals.push(actionReasonCodec.toInt('needs_review') ?? null);
          }

          const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
          const rows = await q<Row>(
            `INSERT INTO case_ (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
            vals,
          );
          const caseId = rows[0]?.id as string;
          if (!caseId) throw new Error('case insert returned no id');
          return { caseId, casePo, newClient, principalCode, mintedMarker };
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
          const replay = await exactCaseForSourceMessage(query, inbound.internetMessageId);
          if (replay) {
            ctx.log(JSON.stringify({
              evt: 'caseResolvePersist',
              outcome: replay.replayAllowed ? 'replay_recovered' : 'terminal_duplicate_dropped',
              caseId: replay.caseId,
              sourceMessageExact: true,
            }));
            if (replay.replayAllowed) return persistExistingCase(replay.caseId, true);
            return {
              status: 200,
              jsonBody: {
                outcome: 'already_ingested',
                caseId: replay.caseId,
                casePo: replay.casePo,
                providerAutomationMode: replay.providerAutomationMode,
              },
            };
          }
          // Never guess by VRM/reference after a uniqueness error. If the exact source
          // row is absent, preserve the conflict so the caller retries/investigates.
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
      const parserFieldsResult = await applyParserFields(
        newCaseId,
        body.parserRef,
        body.parserMileage,
        body.parserMileageUnit,
        body.parserEva,
        workProviderId,
        intermediary,
        {
          caseType: auditGateOn ? caseType : 'standard',
          caseTypeDual,
          allowCasePoMint: true,
        },
      );
      if (parserFieldsResult.resolvedProviderId && parserFieldsResult.resolvedProviderId !== workProviderId) {
        await upsertInboundEmail(
          inbound,
          parserFieldsResult.resolvedProviderId,
          newCaseId,
          undefined,
          body.parserVrm,
        );
      }
      const providerCompletion = parserFieldsResult.providerRecovery;
      const effectiveCasePo = parserFieldsResult.casePo ?? created.casePo;
      const effectivePrincipalCode = providerCompletion?.principalCode ?? created.principalCode;
      const effectiveMarker = providerCompletion?.casePoMarker ?? created.mintedMarker;
      const effectiveNewClient = created.newClient && providerCompletion?.holdCleared !== true;
      providerAutomationMode = providerCompletion?.providerAutomationMode ?? providerAutomationMode;

      const auditAction =
        AUDIT_ACTION[decision.auditAction as keyof typeof AUDIT_ACTION] ??
        AUDIT_ACTION.case_created;
      await writeAudit({
        action: auditAction,
        caseId: newCaseId,
        summary: `Case ${decision.resolution}: ${name}`,
        after: {
          resolution: decision.resolution,
          status: rawStatus,
          vrm,
          casePo: effectiveCasePo,
          providerRecovery: providerCompletion?.outcome ?? 'not_needed',
        },
      });

      // Case-type decision trail (ADR-0021 — every decision is Action-Logged, ADR-0014).
      // Three shapes: (a) gate ON + applied → info record of what was set/minted;
      // (b) gate OFF but signals fired → OBSERVE-ONLY record (the shadow-rollout evidence
      // the operator reviews before flipping AUDIT_CASES_ENABLED); (c) gate ON but the
      // provider is not allowlisted for the detected type → warning + best-effort review
      // note (mint stayed standard by design — PCH/QDOS-only for now).
      if (caseType !== 'standard') {
        const allowlisted = allowedCaseTypes(effectivePrincipalCode).includes(caseType);
        if (!auditGateOn) {
          await writeAudit({
            action: AUDIT_ACTION.case_created,
            caseId: newCaseId,
            summary: `Case-type '${caseType}' detected (observe-only — AUDIT_CASES_ENABLED off; minted standard)`,
            after: { caseType, dual: caseTypeDual, signals: caseTypeSignals, applied: false },
          });
        } else if (!allowlisted && !effectiveNewClient) {
          await writeAudit({
            action: AUDIT_ACTION.case_created,
            caseId: newCaseId,
            severity: 'warning',
            summary: `Case-type '${caseType}' detected for non-allowlisted provider ${effectivePrincipalCode} — minted standard; review case type`,
            after: { caseType, dual: caseTypeDual, signals: caseTypeSignals, applied: false },
          });
          await query(
            `INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())`,
            [
              'Case-type review',
              newCaseId,
              'Email intake (auto)',
              `${caseType === 'diminution' ? 'Diminution' : 'Audit'} signals detected (${caseTypeSignals.join('; ') || 'see audit log'}) ` +
                `but ${effectivePrincipalCode || 'this provider'} is not in the case-type marker allowlist — ` +
                `case minted as standard. Confirm the case type.`,
            ],
          ).catch(() => { /* note is supplementary */ });
        } else {
          await writeAudit({
            action: AUDIT_ACTION.case_created,
            caseId: newCaseId,
            summary:
              `Case-type '${caseType}' applied` +
              (effectiveMarker
                ? ` — minted ${effectiveCasePo} from the ${effectiveMarker} sequence`
                : caseTypeDual
                  ? ` — dual report+audit letter, standard number kept (audit ID derived at review)`
                  : ''),
            after: {
              caseType,
              dual: caseTypeDual,
              signals: caseTypeSignals,
              applied: true,
              marker: effectiveMarker,
              casePo: effectiveCasePo,
            },
          });
        }
      }

      if (effectiveNewClient) {
        const domain = senderDomain(inbound.senderAddress ?? '');
        // TKT-021 reopen fix: a sender the provider-match step identified as a KNOWN
        // INTERMEDIARY must not be branded "New client" — its Held reason names the
        // intermediary + candidates explicitly (buildHeldReason above). The wire payload
        // carries ids only, so the display names are looked up here; best-effort — a
        // lookup failure degrades to name-less wording and must not block intake.
        let heldIntermediary: {
          name: string;
          candidateNames: string[];
          resolvedProviderName: string;
          resolutionSource: ProviderResolutionSource;
        } | null = null;
        if (intermediary) {
          heldIntermediary = {
            name: '',
            candidateNames: [],
            resolvedProviderName: '',
            resolutionSource: parserFieldsResult.providerResolutionSource,
          };
          try {
            const src = await query<Row>(
              'SELECT name FROM image_source WHERE id = $1',
              [intermediary.imageSourceId],
            );
            heldIntermediary.name = String(src[0]?.name ?? '').trim();
            if (intermediary.candidateProviderIds.length > 0) {
              const wps = await query<Row>(
                'SELECT display_name FROM work_provider WHERE id = ANY($1::uuid[]) ORDER BY display_name',
                [intermediary.candidateProviderIds],
              );
              heldIntermediary.candidateNames = wps
                .map((r) => String(r.display_name ?? '').trim())
                .filter(Boolean);
            }
            if (parserFieldsResult.resolvedProviderId) {
              const resolved = await query<Row>(
                'SELECT display_name FROM work_provider WHERE id = $1',
                [parserFieldsResult.resolvedProviderId],
              );
              heldIntermediary.resolvedProviderName = String(
                resolved[0]?.display_name ?? '',
              ).trim();
            }
          } catch { /* names are cosmetic — the Held note still lands without them */ }
        }
        const reason = buildHeldReason({ senderDomain: domain, intermediary: heldIntermediary });
        // Best-effort note (human-readable Held reason) — must not block intake.
        await query(
          `INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())`,
          [reason.noteName, newCaseId, 'Email intake (auto)', reason.noteText],
        ).catch(() => { /* note is supplementary */ });
        await writeAudit({
          action: AUDIT_ACTION.inbound_routed,
          caseId: newCaseId,
          severity: 'warning',
          summary: reason.auditSummary,
          after: intermediary
            ? {
                intermediary: true,
                onHold: true,
                senderDomain: domain,
                imageSourceId: intermediary.imageSourceId,
                candidateProviderIds: intermediary.candidateProviderIds,
                ...(heldIntermediary?.resolvedProviderName
                  ? { resolvedProvider: heldIntermediary.resolvedProviderName }
                  : {}),
                providerResolutionSource:
                  heldIntermediary?.resolutionSource ?? 'none',
              }
            : { newClient: true, onHold: true, senderDomain: domain },
        });
      }

      return {
        status: 200,
        jsonBody: {
          outcome: 'created',
          caseId: newCaseId,
          casePo: effectiveCasePo,
          providerAutomationMode,
          providerRecovery: providerCompletion?.outcome ?? 'not_needed',
        },
      };
    }),
});
