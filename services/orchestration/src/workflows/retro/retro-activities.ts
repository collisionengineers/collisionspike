/** Durable activities for retroactive Case reconstruction. */
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import {
  CASE_PO_SHAPE_RE,
  matchPrincipalByCasePo,
  normalizeCasePo,
  selectBoxInstructionCandidate,
  type BoxFolderEntry,
  type InboundCategory,
  type RetroKeys,
  type RetroReconstructionSource,
} from '@cs/domain';
import { dataApi, type ParserEvaFields } from '../../adapters/data-api.js';
import {
  findMessageByInternetMessageId,
  getMessageIdentity,
  kqlPhrase,
  searchMessages,
} from '../../adapters/graph.js';
import { intakeMailboxes } from '../../platform/subscriptions.js';
import { box, callExplodeEml, type ExplodedEml } from '../../adapters/functions-client.js';
import { uploadEvidenceBytes } from '../../platform/blob.js';
import {
  buildMinimalAnchorEnvelope,
  buildRetroEnvelopeFromDoc,
  buildRetroEnvelopeFromEml,
  classifyArchiveFile,
  pickCaseFolder,
  rankOutlookOriginals,
  refSearchVariants,
  type LandedAttachment,
  type OutlookSearchCandidate,
  type RetroSearchHit,
} from './retro-envelope.js';
import { hashPayload, type InboundEnvelope } from '../intake/fetchMessage.js';

/* ============================================================
   Activities (gate read INSIDE each — the parse/enrich convention)
   ============================================================ */

df.app.activity('retroFindTrigger', {
  handler: async (
    input: { internetMessageId: string; mailbox: string },
    ctx,
  ): Promise<{ skipped?: string; found?: boolean; messageId?: string; resource?: string }> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    const hit = await findMessageByInternetMessageId(input.mailbox, input.internetMessageId);
    if (!hit) {
      ctx.log(JSON.stringify({ evt: 'retroFindTrigger', found: false, mailbox: input.mailbox }));
      return { found: false };
    }
    return {
      found: true,
      messageId: hit.id,
      resource: `users/${input.mailbox}/messages/${hit.id}`,
    };
  },
});

df.app.activity('retroResolveExisting', {
  handler: async (
    input: {
      trigger: unknown;
      keys: RetroKeys;
      providerId?: string;
      triggerCategory?: InboundCategory;
    },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    const result = await dataApi.retroResolveExisting({
      trigger: input.trigger,
      keys: input.keys,
      providerId: input.providerId,
      triggerCategory: input.triggerCategory,
    });
    ctx.log(JSON.stringify({ evt: 'retroResolveExisting', outcome: result.outcome, caseId: result.caseId }));
    return result;
  },
});

/** TKT-219 — per (mailbox × variant) total-result bound for the retro `$search` sweep.
 *  500 = two 250-result pages: deep enough to reach OLD originals behind recurring refs
 *  (the documented `$search` ceiling is 1,000, sent-date-sorted) while keeping a junk-ish
 *  key's worst case at two sequential Graph calls. Truncation is logged, never silent. */
const RETRO_SEARCH_TOTAL_LIMIT = 500;

/** The archive roots the Box rung may search — RETRO_BOX_ARCHIVE_ROOT_IDS (orch side;
 *  the box-webhook Function enforces the same ids via its own BOX_READONLY_ROOT_IDS). */
function archiveRootIds(): string[] {
  return gates
    .retroBoxArchiveRootIds()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

df.app.activity('retroBoxLocate', {
  handler: async (
    input: { keys: RetroKeys; providerPrincipal?: string },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    if (!gates.boxApi()) return { skipped: 'box_gate_off' };
    const rootIds = archiveRootIds();
    if (rootIds.length === 0) return { skipped: 'no_archive_roots' };

    // Key ladder, strongest first. The Case/PO (when quoted) is a FOLDER-NAME search;
    // the external ref + VRM + claimant name (TKT-219 — operator directive: the primary
    // retro search keys are the external ref, VRM and claimant; a Case/PO is only ever
    // opportunistic) are CONTENT searches (they live INSIDE the archived instruction
    // files, not in any name).
    // EXACT-PHRASE quoting (TKT-219 follow-up): Box's unquoted search fuzzy-matches term
    // prefixes — 'WF69NDX' matched every WF-prefixed plate in the archive (47 folders of
    // noise, measured live 2026-07-16). A double-quoted query is Box's exact-match form;
    // the two reserved characters are stripped first (the kqlPhrase discipline).
    const exactPhrase = (v: string): string => `"${v.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim()}"`;
    const refHits: RetroSearchHit[] = [];
    const weakHits: RetroSearchHit[] = [];
    if (input.keys.casePo) {
      const r = await box.searchContent({ query: exactPhrase(input.keys.casePo), rootIds, type: 'folder' });
      refHits.push(...r.entries);
    }
    if (input.keys.externalRef) {
      const r = await box.searchContent({ query: exactPhrase(input.keys.externalRef), rootIds });
      refHits.push(...r.entries);
    }
    // Skip the noisy weak-key sweeps (VRM / claimant) when the reference tier is decisive.
    let needWeak = Boolean(input.keys.vrm || input.keys.claimant);
    if (needWeak && refHits.length > 0 && pickCaseFolder(refHits, []).folder) needWeak = false;
    if (needWeak && input.keys.vrm) {
      const r = await box.searchContent({ query: exactPhrase(input.keys.vrm), rootIds });
      weakHits.push(...r.entries);
    }
    if (needWeak && input.keys.claimant) {
      const r = await box.searchContent({ query: exactPhrase(input.keys.claimant), rootIds });
      weakHits.push(...r.entries);
    }

    const pick = pickCaseFolder(refHits, weakHits);
    if (!pick.folder) {
      ctx.log(JSON.stringify({ evt: 'retroBoxLocate', found: false, candidates: pick.candidateCount }));
      return { found: false, reason: pick.candidateCount > 1 ? 'ambiguous_folders' : 'no_hits', candidateCount: pick.candidateCount };
    }

    // The folder name must BE a Case/PO (a hit in a non-case subtree is not a case).
    const discoveredPo = normalizeCasePo(pick.folder.name);
    if (!CASE_PO_SHAPE_RE.test(discoveredPo)) {
      ctx.log(JSON.stringify({ evt: 'retroBoxLocate', found: false, reason: 'folder_not_po_shaped', name: pick.folder.name }));
      return { found: false, reason: 'folder_not_po_shaped', candidateCount: pick.candidateCount };
    }

    const principals = await dataApi.principals();
    const match = matchPrincipalByCasePo(
      discoveredPo,
      principals.map((p) => p.principalCode),
    );

    // A weak-key-only pick (VRM and/or claimant — TKT-219) additionally requires the
    // folder's principal to agree with the sender-matched provider — never link across
    // providers on a registration or a person's name alone (ADR-0010 applied to the
    // archive).
    const weakKeysOnly = !input.keys.casePo && !input.keys.externalRef;
    if (weakKeysOnly) {
      const sender = (input.providerPrincipal ?? '').trim().toUpperCase();
      if (!match || !sender || match.principal !== sender) {
        ctx.log(JSON.stringify({ evt: 'retroBoxLocate', found: false, reason: 'weak_key_uncorroborated' }));
        return { found: false, reason: 'weak_key_uncorroborated', candidateCount: pick.candidateCount };
      }
    }

    ctx.log(JSON.stringify({
      evt: 'retroBoxLocate', found: true, folderId: pick.folder.id, discoveredPo,
      principal: match?.principal ?? '', marker: match?.marker ?? '', basis: pick.basis,
    }));
    return {
      found: true,
      folder: pick.folder,
      discoveredPo,
      principalCode: match?.principal ?? '',
      marker: match?.marker ?? '',
      basis: pick.basis,
      candidateCount: pick.candidateCount,
    };
  },
});

df.app.activity('retroBoxFetchInstruction', {
  handler: async (
    input: { folderId: string; folderName: string; discoveredPo: string; triggerReceivedAt?: string },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    if (!gates.boxApi()) return { skipped: 'box_gate_off' };

    const listing = await box.listFolderItems(input.folderId);
    const entries: BoxFolderEntry[] = (listing.entries ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      size: e.size,
      createdAt: e.created_at,
    }));
    const files = entries.filter((e) => (e.type ?? 'file') === 'file');
    const subfolderCount = entries.length - files.length;
    const fallbackReceivedAt = input.triggerReceivedAt ?? new Date().toISOString();

    let envelope: InboundEnvelope | undefined;
    let instructionSource: RetroReconstructionSource = 'minimal';
    const consumed = new Set<string>();

    // Preference ladder: the archived original .eml → a parseable instruction document
    // → minimal anchor. Each arm degrades on failure instead of sinking the rung.
    const candidate = selectBoxInstructionCandidate(entries);
    if (candidate?.kind === 'eml') {
      try {
        const dl = await box.downloadFile(candidate.entry.id);
        const rawBytes = Buffer.from(dl.contentBase64, 'base64');
        const prefix = `retro-box-${candidate.entry.id}`;
        const emlName = dl.filename || candidate.entry.name || 'original.eml';
        const emlUp = await uploadEvidenceBytes(prefix, emlName, rawBytes, 'message/rfc822');
        const rawEmlRef: LandedAttachment = {
          filename: emlName,
          contentType: 'message/rfc822',
          blobPath: emlUp.blobPath,
          size: emlUp.size,
          sha256: emlUp.sha256,
        };
        let exploded: ExplodedEml | undefined;
        try {
          exploded = await callExplodeEml({ documentBase64: dl.contentBase64, filename: emlName });
        } catch (e) {
          ctx.warn(`[retroBoxFetchInstruction] explode-eml failed (degrading to raw .eml): ${String(e)}`);
        }
        if (exploded) {
          const landed: LandedAttachment[] = [];
          for (const a of exploded.attachments) {
            const bytes = Buffer.from(a.content_base64, 'base64');
            const up = await uploadEvidenceBytes(prefix, a.filename, bytes, a.content_type);
            landed.push({ filename: a.filename, contentType: a.content_type, blobPath: up.blobPath, size: up.size, sha256: up.sha256 });
          }
          envelope = buildRetroEnvelopeFromEml(exploded, landed, rawEmlRef, {
            boxFileId: candidate.entry.id,
            discoveredPo: input.discoveredPo,
            fallbackReceivedAt,
          });
        } else {
          // Explode unavailable — the parser ENGINE reads .eml itself; hand it the raw file.
          envelope = buildRetroEnvelopeFromDoc(rawEmlRef, {
            boxFileId: candidate.entry.id,
            discoveredPo: input.discoveredPo,
            fallbackReceivedAt,
            folderName: input.folderName,
          });
        }
        instructionSource = 'box_eml';
        consumed.add(candidate.entry.id);
      } catch (e) {
        ctx.warn(`[retroBoxFetchInstruction] .eml download failed (trying document arm): ${String(e)}`);
      }
    }
    if (!envelope) {
      const docCandidate = selectBoxInstructionCandidate(
        entries.filter((e) => !/\.(eml|msg)$/i.test(e.name)),
      );
      if (docCandidate?.kind === 'doc') {
        try {
          const dl = await box.downloadFile(docCandidate.entry.id);
          const bytes = Buffer.from(dl.contentBase64, 'base64');
          const prefix = `retro-box-${docCandidate.entry.id}`;
          const docName = dl.filename || docCandidate.entry.name;
          const up = await uploadEvidenceBytes(prefix, docName, bytes, 'application/octet-stream');
          envelope = buildRetroEnvelopeFromDoc(
            { filename: docName, contentType: 'application/octet-stream', blobPath: up.blobPath, size: up.size, sha256: up.sha256 },
            {
              boxFileId: docCandidate.entry.id,
              discoveredPo: input.discoveredPo,
              fallbackReceivedAt,
              folderName: input.folderName,
            },
          );
          instructionSource = 'box_doc';
          consumed.add(docCandidate.entry.id);
        } catch (e) {
          ctx.warn(`[retroBoxFetchInstruction] document download failed (minimal anchor): ${String(e)}`);
        }
      }
    }
    if (!envelope) {
      envelope = buildMinimalAnchorEnvelope(
        { receivedAt: input.triggerReceivedAt },
        input.discoveredPo,
        input.folderId,
      );
      instructionSource = 'minimal';
    }

    // Every other archive file registers as byte-less Box evidence (id + link — the
    // one-way mirror stays one-way; nothing is copied out except the instruction).
    const otherFiles = files
      .filter((f) => !consumed.has(f.id))
      .map((f) => ({ boxFileId: f.id, filename: f.name, size: f.size }));

    ctx.log(JSON.stringify({
      evt: 'retroBoxFetchInstruction', folderId: input.folderId, source: instructionSource,
      attachments: envelope.attachments.length, otherFiles: otherFiles.length, subfolderCount,
    }));
    return { envelope, instructionSource, otherFiles, subfolderCount };
  },
});

df.app.activity('retroCreatePersist', {
  handler: async (
    input: {
      original: InboundEnvelope;
      trigger: unknown;
      keys: RetroKeys;
      casePo?: string;
      vrm?: string;
      statusName: 'eva_submitted' | 'needs_review';
      onHold: boolean;
      actionReason?: 'needs_review';
      reconstructionSource: RetroReconstructionSource;
      providerId?: string;
      /** TKT-219 — the trigger sender's Image-Source intermediary match (TKT-021). */
      intermediary?: { imageSourceId: string; candidateProviderIds: string[] };
      parserVrm?: string;
      parserRef?: string;
      parserMileage?: string;
      parserMileageUnit?: string;
      parserEva?: ParserEvaFields;
      caseType?: string;
      caseTypeSignals?: string[];
      boxFolder?: { id: string; url?: string };
      triggerCategory?: InboundCategory;
      otherFiles?: Array<{ boxFileId: string; filename: string; size?: number }>;
    },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    const result = await dataApi.retroCreate({
      original: input.original,
      trigger: input.trigger,
      keys: input.keys,
      casePo: input.casePo,
      vrm: input.vrm,
      statusName: input.statusName,
      onHold: input.onHold,
      actionReason: input.actionReason,
      reconstructionSource: input.reconstructionSource,
      providerId: input.providerId,
      intermediary: input.intermediary,
      parserVrm: input.parserVrm,
      parserRef: input.parserRef,
      parserMileage: input.parserMileage,
      parserMileageUnit: input.parserMileageUnit,
      parserEva: input.parserEva,
      caseType: input.caseType as 'standard' | 'audit' | 'audit_total_loss' | 'diminution' | undefined,
      caseTypeSignals: input.caseTypeSignals,
      boxFolder: input.boxFolder,
      triggerCategory: input.triggerCategory,
    });

    // Register the archive folder's OTHER files as byte-less Box evidence (link-only;
    // acceptedForEva=false so a retro backfill never pollutes the EVA image rules).
    // Best-effort: an evidence hiccup never unwinds the created/linked case.
    const caseId = result.caseId;
    if (caseId && (result.outcome === 'created' || result.outcome === 'already_exists_linked')) {
      const rows = (input.otherFiles ?? []).map((f) => ({
        filename: f.filename,
        boxFileId: f.boxFileId,
        boxFileUrl: `https://app.box.com/file/${encodeURIComponent(f.boxFileId)}`,
        size: f.size,
        evidenceClass: classifyArchiveFile(f.filename),
        acceptedForEva: false,
        sourceLabel: 'retro_box_archive',
      }));
      if (rows.length > 0) {
        try {
          const persisted = await dataApi.registerBoxEvidence(caseId, rows);
          ctx.log(JSON.stringify({ evt: 'retroCreatePersist', evidenceRows: persisted.persisted }));
        } catch (e) {
          ctx.warn(`[retroCreatePersist] archive evidence registration failed (best-effort): ${String(e)}`);
        }
      }
    }

    ctx.log(JSON.stringify({ evt: 'retroCreatePersist', outcome: result.outcome, caseId: result.caseId, casePo: result.casePo }));
    return result;
  },
});

df.app.activity('retroOutlookLocate', {
  handler: async (input: { keys: RetroKeys }, ctx): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    if (!gates.retroOutlookSearch()) return { skipped: 'outlook_gate_off' };
    const mailboxes = intakeMailboxes().map((m) => m.mailbox);
    if (mailboxes.length === 0) return { skipped: 'no_intake_mailboxes' };

    // Key ladder, strongest-first; a decisive earlier key skips the noisier later
    // sweeps. Each mailbox searched independently — one failing mailbox (throttle,
    // RBAC cache) must not sink the rung. TKT-219: claimant is the weakest rung.
    const ladder: Array<{ key: string; matchedKey: string }> = [];
    if (input.keys.externalRef) ladder.push({ key: input.keys.externalRef, matchedKey: 'external_ref' });
    if (input.keys.casePo) ladder.push({ key: input.keys.casePo, matchedKey: 'case_po' });
    if (input.keys.vrm) ladder.push({ key: input.keys.vrm, matchedKey: 'vrm' });
    if (input.keys.claimant) ladder.push({ key: input.keys.claimant, matchedKey: 'claimant' });

    for (const rung of ladder) {
      // TKT-139 — Graph $search tokenization: a compact ref (PHA5007) does not match
      // the spaced form (PHA 5007) and vice versa. Issue EVERY variant (compact +
      // spaced at the alpha/digit boundaries) per mailbox and UNION the hits,
      // deduped by (mailbox, message id), before the single ranked pick. A claimant
      // NAME is already a natural phrase — compact/spaced ref variants would be
      // nonsense, so it searches as given only.
      const variants = rung.matchedKey === 'claimant' ? [rung.key] : refSearchVariants(rung.key);
      const candidates: OutlookSearchCandidate[] = [];
      const seen = new Set<string>();
      for (const mailbox of mailboxes) {
        for (const variant of variants) {
          try {
            // TKT-219: the retro original is by definition OLD mail and `$search`
            // results are SENT-date-sorted — sweep deep (bounded; pages sequential
            // inside searchMessages) instead of one 25-newest page, and surface a
            // truncated sweep instead of silently missing older matches.
            const hits = await searchMessages(
              mailbox,
              kqlPhrase(variant),
              RETRO_SEARCH_TOTAL_LIMIT,
              (message) => ctx.warn(`[retroOutlookLocate] ${message}`),
            );
            for (const h of hits) {
              const k = `${mailbox}\u0000${h.id}`;
              if (seen.has(k)) continue;
              seen.add(k);
              candidates.push({ ...h, mailbox });
            }
          } catch (e) {
            ctx.warn(
              `[retroOutlookLocate] $search failed on ${mailbox} (variant ${JSON.stringify(variant)}; continuing): ${String(e)}`,
            );
          }
        }
      }
      const ranked = rankOutlookOriginals(candidates, { intakeMailboxes: mailboxes });
      const pick = ranked[0];
      if (pick) {
        ctx.log(JSON.stringify({
          evt: 'retroOutlookLocate', found: true, mailbox: pick.mailbox,
          matchedKey: rung.matchedKey, candidates: candidates.length,
        }));
        return {
          found: true,
          messageId: pick.id,
          mailbox: pick.mailbox,
          resource: `users/${pick.mailbox}/messages/${pick.id}`,
          matchedKey: rung.matchedKey,
          // TKT-219 follow-up — the ranked SHORTLIST so the orchestrator can fall back to
          // the next candidate when a pick is refused (blocked-family) or uncorroborated.
          candidates: ranked.slice(0, 3).map((c) => ({
            messageId: c.id,
            mailbox: c.mailbox,
            resource: `users/${c.mailbox}/messages/${c.id}`,
          })),
        };
      }
    }
    ctx.log(JSON.stringify({ evt: 'retroOutlookLocate', found: false }));
    return { found: false };
  },
});

/** TKT-222 bounds: per-(mailbox × variant) search top for the related sweep, and the
 *  per-case link cap (truncation is logged — no silent caps). */
const RELATED_SEARCH_TOP = 50;
const RELATED_LINK_CAP = 25;
/** TKT-225 — per-case cap on the rows offered to the related-INGEST child (matches
 *  RELATED_LINK_CAP; truncation logged, never silent). */
const RELATED_INGEST_CAP = 25;

/** TKT-225 — one ingest-eligible related row as the child orchestrator consumes it. */
interface RelatedIngestRow {
  internetMessageId: string;
  /** Graph message id. */
  messageId: string;
  /** users/<mailbox>/messages/<id> — the fetchMessage resource form. */
  resource: string;
  mailbox: string;
  receivedAt: string;
}

df.app.activity('retroLinkRelated', {
  handler: async (
    input: { caseId: string; keys: RetroKeys; excludeInternetMessageIds?: string[] },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    if (!gates.retroOutlookSearch()) return { skipped: 'outlook_gate_off' };
    const mailboxes = intakeMailboxes().map((m) => m.mailbox);
    if (mailboxes.length === 0) return { skipped: 'no_intake_mailboxes' };
    const keyList = [
      input.keys.casePo,
      input.keys.externalRef,
      input.keys.vrm,
      input.keys.claimant,
    ].filter((k): k is string => Boolean(k));
    if (keyList.length === 0) return { skipped: 'no_keys' };

    const norm = (v: string): string => v.trim().toUpperCase().replace(/\s+/g, '');
    const exclude = new Set((input.excludeInternetMessageIds ?? []).map((v) => v.trim()));

    // Sweep every key across every mailbox; own-mailbox senders are INCLUDED on purpose —
    // our filed replies and chasers belong to the case too (ADR-0022, TKT-222 directive).
    const seen = new Set<string>();
    const candidates: Array<{ mailbox: string; id: string; subject: string }> = [];
    for (const key of keyList) {
      const variants = key === input.keys.claimant ? [key] : refSearchVariants(key);
      for (const mailbox of mailboxes) {
        for (const variant of variants) {
          try {
            const hits = await searchMessages(mailbox, kqlPhrase(variant), RELATED_SEARCH_TOP);
            for (const h of hits) {
              const k = `${mailbox}\u0000${h.id}`;
              if (seen.has(k)) continue;
              seen.add(k);
              // Conservative v1 corroboration: the SUBJECT must carry one of the case keys
              // ($search relevance alone is not a licence to link).
              const subjectNorm = norm(h.subject);
              if (keyList.some((candidateKey) => subjectNorm.includes(norm(candidateKey)))) {
                candidates.push({ mailbox, id: h.id, subject: h.subject });
              }
            }
          } catch (e) {
            ctx.warn(
              `[retroLinkRelated] $search failed on ${mailbox} (variant ${JSON.stringify(variant)}; continuing): ${String(e)}`,
            );
          }
        }
      }
    }

    if (candidates.length > RELATED_LINK_CAP) {
      ctx.warn(
        `[retroLinkRelated] ${candidates.length} corroborated candidates capped at ${RELATED_LINK_CAP} for case ${input.caseId} — re-run to pick up the remainder`,
      );
    }
    const rows: InboundEnvelope[] = [];
    // TKT-225 — retain the (mailbox, Graph-id, receivedAt) behind each posted row so the
    // route's linkedIds/alreadyLinkedIds can be mapped back into ingest-eligible rows.
    const byInternetMessageId = new Map<string, { messageId: string; mailbox: string; receivedAt: string }>();
    for (const c of candidates.slice(0, RELATED_LINK_CAP)) {
      const identity = await getMessageIdentity(c.mailbox, c.id);
      if (!identity || exclude.has(identity.internetMessageId.trim())) continue;
      byInternetMessageId.set(identity.internetMessageId.trim(), {
        messageId: c.id,
        mailbox: c.mailbox,
        receivedAt: identity.receivedDateTime,
      });
      rows.push({
        messageId: c.id,
        internetMessageId: identity.internetMessageId,
        conversationId: '',
        subject: identity.subject,
        senderAddress: identity.from,
        receivedAt: identity.receivedDateTime,
        sourceMailbox: c.mailbox,
        payloadHash: hashPayload(identity.subject, identity.from, []),
        candidateVrm: '',
        candidateRef: '',
        body: '',
        bodyPreview: '',
        inReplyTo: '',
        references: '',
        attachments: [],
      } as InboundEnvelope);
    }
    if (rows.length === 0) {
      ctx.log(JSON.stringify({ evt: 'retroLinkRelated', caseId: input.caseId, linked: 0, scanned: candidates.length }));
      return { linked: 0, scanned: candidates.length };
    }
    const persisted = await dataApi.retroLinkRelated({ caseId: input.caseId, rows });
    ctx.log(JSON.stringify({
      evt: 'retroLinkRelated', caseId: input.caseId,
      linked: persisted.linked, skippedRows: persisted.skipped, scanned: candidates.length,
    }));
    const result: {
      linked: number;
      skippedRows: number;
      scanned: number;
      ingestRows?: RelatedIngestRow[];
    } = { linked: persisted.linked, skippedRows: persisted.skipped, scanned: candidates.length };
    // TKT-225 — the checkpointed gate decision: `ingestRows` is present ONLY when the
    // ingest gate is on (the orchestrator branches purely on this activity result).
    // Newly linked rows AND rows already linked to THIS case are eligible — the latter
    // heals the TKT-222 v1 pile (row-links without evidence) on a force re-run; rows
    // linked to a DIFFERENT case were never returned by the route (NEVER RE-POINT).
    if (!gates.retroRelatedIngest()) {
      ctx.log(JSON.stringify({ evt: 'retroLinkRelated', caseId: input.caseId, ingest: 'gate_off' }));
      return result;
    }
    // Dedupe: a cross-mailbox twin (same Internet-Message-Id landing in two intake
    // mailboxes) can appear in linkedIds via one copy and alreadyLinkedIds via the other.
    const eligible = [...new Set([...(persisted.linkedIds ?? []), ...(persisted.alreadyLinkedIds ?? [])])];
    const ingestRows = eligible
      .map((imid): RelatedIngestRow | undefined => {
        const hit = byInternetMessageId.get(imid);
        return hit
          ? {
              internetMessageId: imid,
              messageId: hit.messageId,
              resource: `users/${hit.mailbox}/messages/${hit.messageId}`,
              mailbox: hit.mailbox,
              receivedAt: hit.receivedAt,
            }
          : undefined;
      })
      .filter((r): r is RelatedIngestRow => Boolean(r))
      // Oldest first: the earliest correspondence fills gaps first (fill-if-empty means
      // first-writer-wins); id tiebreak for determinism.
      .sort((a, b) =>
        a.receivedAt !== b.receivedAt
          ? (a.receivedAt < b.receivedAt ? -1 : 1)
          : a.internetMessageId.localeCompare(b.internetMessageId),
      );
    if (ingestRows.length > RELATED_INGEST_CAP) {
      ctx.warn(
        `[retroLinkRelated] ${ingestRows.length} ingest-eligible rows capped at ${RELATED_INGEST_CAP} for case ${input.caseId} — re-run to pick up the remainder`,
      );
    }
    result.ingestRows = ingestRows.slice(0, RELATED_INGEST_CAP);
    return result;
  },
});

df.app.activity('retroBackfillFields', {
  handler: async (
    input: {
      caseId: string;
      sourceInternetMessageId: string;
      parserVrm?: string;
      parserRef?: string;
      parserMileage?: string;
      parserMileageUnit?: string;
      parserEva?: ParserEvaFields;
    },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    if (!gates.retroRelatedIngest()) return { skipped: 'ingest_gate_off' };
    const result = await dataApi.retroBackfillFields(input);
    ctx.log(JSON.stringify({
      evt: 'retroBackfillFields', caseId: input.caseId,
      outcome: result.outcome, vrmFilled: result.vrmFilled ?? false,
    }));
    return result;
  },
});

df.app.activity('retroRecordFailure', {
  handler: async (
    input: {
      trigger: unknown;
      keys: RetroKeys;
      triggerCategory?: InboundCategory;
      rungsTried: string[];
      ambiguousFolders?: number;
      /** TKT-219 follow-up — located candidates the create seam refused (blocked-family
       *  classification): staff must see a candidate EXISTS and what blocks it. */
      refusedOriginals?: Array<{ internetMessageId: string; category: string }>;
    },
    ctx,
  ): Promise<unknown> => {
    if (!gates.retroCase()) return { skipped: 'gate_off' };
    const env = input.trigger as { internetMessageId?: string; subject?: string };
    const refused = input.refusedOriginals ?? [];
    await dataApi.recordAudit({
      action: 'retro_reconstruction_failed',
      severity: 'warning',
      summary:
        `Retro: no case found or reconstructable for ${input.triggerCategory ?? 'update'} email (${
          input.keys.casePo ?? input.keys.externalRef ?? input.keys.vrm ?? 'no key'
        })` +
        (refused.length > 0
          ? ` — a possible original WAS found but its classification ('${refused[0].category}') blocks it; review and reclassify that email, then re-run`
          : ''),
      after: {
        keys: input.keys,
        rungsTried: input.rungsTried,
        ...(input.ambiguousFolders ? { ambiguousFolders: input.ambiguousFolders } : {}),
        ...(refused.length > 0 ? { refusedOriginals: refused } : {}),
        messageId: env.internetMessageId,
        subject: env.subject,
      },
    });
    // TKT-119c — give the failure a VISIBLE home: stamp the trigger email's triage row
    // so staff see "Unable to locate" on the inbox row instead of a silent nothing.
    // Best-effort (schema-tolerant server-side) — the audit above is the durable record.
    if (env.internetMessageId) {
      try {
        await dataApi.markInboundAttention({
          sourceMessageId: env.internetMessageId,
          reason: 'unable_to_locate',
        });
      } catch (e) {
        ctx.warn(`[retroRecordFailure] attention stamp failed (best-effort): ${String(e)}`);
      }
    }
    ctx.log(JSON.stringify({ evt: 'retroRecordFailure', keys: input.keys, rungsTried: input.rungsTried }));
    return { recorded: true };
  },
});
