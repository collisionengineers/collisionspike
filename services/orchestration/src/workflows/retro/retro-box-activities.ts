/** Durable activities for the retro Box-archive rung (locate + fetch the archived
 *  instruction). Gate read INSIDE each activity — the parse/enrich convention. */
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import {
  CASE_PO_SHAPE_RE,
  matchPrincipalByCasePo,
  normalizeCasePo,
  selectBoxInstructionCandidate,
  type BoxFolderEntry,
  type RetroKeys,
  type RetroReconstructionSource,
} from '@cs/domain';
import { dataApi } from '../../adapters/data-api.js';
import { box, callExplodeEml, type ExplodedEml } from '../../adapters/functions-client.js';
import { uploadEvidenceBytes } from '../../platform/blob.js';
import {
  buildMinimalAnchorEnvelope,
  buildRetroEnvelopeFromDoc,
  buildRetroEnvelopeFromEml,
  pickCaseFolder,
  type LandedAttachment,
  type RetroSearchHit,
} from './retro-envelope.js';
import type { InboundEnvelope } from '../intake/fetchMessage.js';

/** The archive roots the Box rung may search — RETRO_BOX_ARCHIVE_ROOT_IDS (orch side;
 *  the box-webhook Function enforces the same ids via its own BOX_READONLY_ROOT_IDS). */
function archiveRootIds(): string[] {
  return gates
    .retroBoxArchiveRootIds()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** TKT-230 (item 6) — rung-1 writability probe. The rung-1 linked lane historically skipped
 *  boxArchiveEvidence because a retro-linked case's folder MAY sit under the read-only
 *  archive roots — but many rung-1 cases have folders created by live intake under the
 *  WRITABLE pinned root, and their fresh evidence never mirrored. This activity reads the
 *  gates INSIDE the activity (the parse/enrich convention) and answers "may boxArchiveEvidence
 *  upload into this case's folder?" so the orchestrator branches only on the checkpointed
 *  result. Gating mirrors boxArchiveEvidence's own gate pair (boxApi + boxFolderAtIntake).
 *  Fail-closed: any read failure answers NOT writable — never upload blind. */
df.app.activity('retroCaseFolderWritable', {
  handler: async (
    input: { caseId: string },
    ctx,
  ): Promise<{ writable: boolean; reason?: string }> => {
    if (!gates.retroCase()) return { writable: false, reason: 'gate_off' };
    if (!gates.boxApi() || !gates.boxFolderAtIntake()) {
      return { writable: false, reason: 'box_gated_off' };
    }
    let folderId: string | null = null;
    try {
      folderId = (await dataApi.getCaseBoxFolder(input.caseId)).boxFolderId;
    } catch {
      return { writable: false, reason: 'folder_unreadable' };
    }
    if (!folderId) return { writable: false, reason: 'no_folder' };
    const roRoots = archiveRootIds();
    if (roRoots.length === 0) return { writable: true };
    try {
      // The facade GET returns path_collection (functions-client.ts box.getFolder): the
      // folder is read-only when it IS an RO root or has one among its ancestors.
      const info = await box.getFolder(folderId);
      const ancestors = (info.path_collection?.entries ?? [])
        .map((e) => e.id)
        .filter((id): id is string => Boolean(id));
      const underRo = roRoots.some((r) => r === folderId || ancestors.includes(r));
      ctx.log(JSON.stringify({
        evt: 'retroCaseFolderWritable', caseId: input.caseId, folderId, writable: !underRo,
      }));
      return { writable: !underRo, ...(underRo ? { reason: 'readonly_archive_root' } : {}) };
    } catch {
      return { writable: false, reason: 'folder_unreadable' }; // fail-closed
    }
  },
});

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
      // buildMinimalAnchorEnvelope now REQUIRES receivedAt (deterministic — it also runs
      // inside the orchestrator); this activity supplies its own wall-clock fallback.
      envelope = buildMinimalAnchorEnvelope(
        { receivedAt: fallbackReceivedAt },
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
