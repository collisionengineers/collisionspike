/** * reconstruction (ADR-0022 R2/R3).
 *
 * The reconstruction rungs recover an ORIGINAL instruction from the Box archive
 * (an exploded `.eml`, or a bare instruction document) or from Outlook, and must
 * hand the downstream chain an envelope shaped EXACTLY like a live arrival
 * (fetchMessage's InboundEnvelope) — same hash function, same VRM sniff, same
 * attachment shape — so parse/create/link behave identically to normal intake.
 *
 * PURE + framework-free: blob landing happens in the calling activity; these
 * builders take the landed refs and return the envelope. Unit-tested without the
 * Durable harness.
 */

import { cleanEmailBodyForPreview, domainOf, extractVrm, type RetroKeys } from '@cs/domain';
import type { InboundEnvelope } from '../intake/fetchMessage.js';
import { hashPayload } from '../intake/fetchMessage.js';
import type { ExplodedEml } from '../../adapters/functions-client.js';

/** A blob-landed attachment ref (uploadEvidenceBytes output + identity). TKT-220 (G6):
 *  carries the landing sha256 so the TKT-133 (case_id, sha256) email/Box-mirror dedup can
 *  match Box-rung retro evidence exactly like live-fetched attachments. */
export interface LandedAttachment {
  filename: string;
  contentType: string;
  blobPath: string;
  size: number;
  sha256?: string;
}

/** First RFC-ish address inside a header value ('' when none). */
export function firstAddress(header: string | null | undefined): string {
  const m = (header ?? '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : '';
}

export interface RetroEnvelopeMeta {
  /** The Box file id of the downloaded `.eml` (synthetic-id + blob-path seed). */
  boxFileId: string;
  /** The discovered Case/PO (archive folder name) — carried as candidateRef. */
  discoveredPo: string;
  /** Fallback receivedAt when the `.eml` carries no parseable Date (a NULL-ish
   *  received_on would otherwise break the triage-row upsert's timestamp cast). */
  fallbackReceivedAt: string;
}

/**
 * Envelope for a Box-archive `.eml` reconstruction. Synthetic `messageId`
 * `retro-box-<fileId>` (doubles as the deterministic blob-path prefix the caller
 * landed under); `internetMessageId` = the eml's own Message-ID when present, else
 * the deterministic `retro:box:<fileId>` (idempotency under replay + the
 * UNIQUE(source_message_id) get-or-create backstop). The payload hash uses the
 * SHARED hashPayload so a later LIVE arrival of the same email dedups against it.
 */
export function buildRetroEnvelopeFromEml(
  exploded: ExplodedEml,
  landed: LandedAttachment[],
  rawEml: LandedAttachment | undefined,
  meta: RetroEnvelopeMeta,
): InboundEnvelope {
  const subject = (exploded.subject ?? '').trim();
  const senderAddress = firstAddress(exploded.from);
  const body = (exploded.body_text ?? '').slice(0, 20_000);
  // TKT-070: same readable-preview recipe as the live fetchMessage path (preview only —
  // the full `body` still feeds the VRM sniff below and the parser unchanged).
  const bodyPreview = cleanEmailBodyForPreview(body).slice(0, 3_500);
  return {
    messageId: `retro-box-${meta.boxFileId}`,
    internetMessageId: (exploded.message_id ?? '').trim() || `retro:box:${meta.boxFileId}`,
    conversationId: '',
    subject,
    senderAddress,
    receivedAt: (exploded.date_iso ?? '').trim() || meta.fallbackReceivedAt,
    sourceMailbox: firstAddress(exploded.to) || 'box-archive',
    payloadHash: hashPayload(subject, senderAddress, landed),
    candidateVrm: extractVrm(`${subject}\n${body}`),
    candidateRef: meta.discoveredPo,
    body,
    bodyPreview,
    inReplyTo: (exploded.in_reply_to ?? '').trim(),
    references: (exploded.references ?? '').trim(),
    attachments: landed,
    ...(rawEml ? { rawEml } : {}),
  };
}

/**
 * Envelope for a Box-archive DOCUMENT-ONLY reconstruction (no `.eml` in the
 * folder — the instruction PDF/DOC is the sole recovered source). No body, no
 * headers; the landed doc is the single attachment and the parse activity does
 * the rest.
 */
export function buildRetroEnvelopeFromDoc(
  doc: LandedAttachment,
  meta: RetroEnvelopeMeta & { folderName: string },
): InboundEnvelope {
  const subject = `Retro reconstruction: ${meta.folderName} — ${doc.filename}`;
  return {
    messageId: `retro-box-${meta.boxFileId}`,
    internetMessageId: `retro:box:${meta.boxFileId}`,
    conversationId: '',
    subject,
    senderAddress: '',
    receivedAt: meta.fallbackReceivedAt,
    sourceMailbox: 'box-archive',
    payloadHash: hashPayload(subject, '', [doc]),
    candidateVrm: '',
    candidateRef: meta.discoveredPo,
    body: '',
    bodyPreview: '',
    inReplyTo: '',
    references: '',
    attachments: [doc],
  };
}

/**
 * Envelope for the MINIMAL-ANCHOR rung: the archive folder exists (the case is
 * real, the PO is its name) but nothing parseable was recovered. Deterministic
 * synthetic identity keyed on the FOLDER so replays and duplicate triggers
 * converge on one anchor.
 *
 * DETERMINISTIC ON PURPOSE — `receivedAt` is REQUIRED (no `new Date()` fallback):
 * this builder now also runs inside the ORCHESTRATOR body (the fetch-faulted
 * minimal-anchor arm), where wall-clock reads break Durable replay. Callers fall
 * back themselves: activities may use `new Date()`, the orchestrator must use the
 * checkpointed trigger `receivedAt` or `ctx.df.currentUtcDateTime`.
 */
export function buildMinimalAnchorEnvelope(
  trigger: { receivedAt: string },
  discoveredPo: string,
  folderId: string,
): InboundEnvelope {
  const subject = `Retro anchor: ${discoveredPo}`;
  return {
    messageId: `retro-box-folder-${folderId}`,
    internetMessageId: `retro:box:folder:${folderId}`,
    conversationId: '',
    subject,
    senderAddress: '',
    receivedAt: trigger.receivedAt,
    sourceMailbox: 'box-archive',
    payloadHash: hashPayload(subject, '', []),
    candidateVrm: '',
    candidateRef: discoveredPo,
    body: '',
    bodyPreview: '',
    inReplyTo: '',
    references: '',
    attachments: [],
  };
}

/* ----------  Related-parse contradiction (TKT-225)  ---------- */

/** Case-insensitive whitespace-stripped token normalisation (the retro-case
 *  corroboration rule — same recipe as its `normToken`). */
function normKeyToken(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * The demotion rule applied to a RELATED email's parse (TKT-225 — shared with the
 * Outlook-original arm's corroboration): a single disagreement is not a contradiction
 * (chasers routinely quote only one key, and parses are imperfect), but when the case
 * keys carry a reference AND a VRM, the parse produced BOTH, and BOTH disagree, the
 * parsed material describes a different matter — its fields must not touch the case
 * (evidence still persists; the email is already subject-corroborated and row-linked).
 * `candidateVrm` is the envelope's own sniff, used only when the parser found no VRM.
 * Absent keys or absent parses never contradict. Pure — unit-tested without Durable.
 */
export function relatedParseContradictsKeys(
  keys: RetroKeys,
  parserRef: string,
  parserVrm: string,
  candidateVrm: string,
): boolean {
  const refContradicts = Boolean(
    keys.externalRef &&
      parserRef &&
      normKeyToken(parserRef) !== normKeyToken(keys.externalRef),
  );
  const effectiveVrm = parserVrm || candidateVrm;
  const vrmContradicts = Boolean(
    keys.vrm && effectiveVrm && normKeyToken(effectiveVrm) !== normKeyToken(keys.vrm),
  );
  return refContradicts && vrmContradicts;
}

/* ----------  Provider corroboration for weak-key searches (PR-review fix, 3×P1)  ---------- */

/**
 * The checkpointed TRIGGER identity the orchestrator threads into the Outlook search
 * activities so weak-key candidates can be provider-corroborated. All three facts are
 * checkpointed activity results (trigger envelope / providerMatch) — never live reads.
 * Optional everywhere: an unknown trigger identity fails weak-key candidates CLOSED.
 */
export interface RetroTriggerIdentity {
  senderAddress?: string;
  providerId?: string;
  /** The sender's Image-Source intermediary candidates (TKT-021) — count as the
   *  trigger's provider ids for intersection purposes. */
  intermediaryCandidateProviderIds?: string[];
}

/**
 * PURE predicate: does a search candidate's sender identity agree with the trigger's?
 * A weak retro key (VRM / claimant name) is not distinctive enough to link across
 * providers (ADR-0010 applied to the mailbox exactly as retroBoxLocate applies it to
 * the archive), so the candidate must CORROBORATE:
 *   - 'agreed'      — the two provider-id sets intersect (id-level corroboration;
 *                     intermediary candidate sets count on either side);
 *   - 'same_domain' — the candidate sender's domain equals the trigger sender's
 *                     domain (case-insensitive; the same-org fallback when the corpus
 *                     resolves neither side);
 *   - 'mismatch'    — BOTH sides resolve to non-empty, disjoint provider-id sets —
 *                     a POSITIVE disagreement;
 *   - 'unknown'     — everything else (either side unresolvable).
 * Callers decide per key strength: weak keys require 'agreed'/'same_domain';
 * external_ref drops only a positive 'mismatch'; case_po is exempt.
 */
export function senderProviderAgrees(args: {
  candidateFrom: string;
  candidateProviderIds: readonly string[];
  triggerFrom: string;
  triggerProviderIds: readonly string[];
}): 'agreed' | 'same_domain' | 'mismatch' | 'unknown' {
  const candidateIds = new Set(args.candidateProviderIds.map((v) => v.trim()).filter(Boolean));
  const triggerIds = args.triggerProviderIds.map((v) => v.trim()).filter(Boolean);
  if (triggerIds.some((id) => candidateIds.has(id))) return 'agreed';
  const candidateDomain = domainOf(args.candidateFrom);
  const triggerDomain = domainOf(args.triggerFrom);
  if (candidateDomain && triggerDomain && candidateDomain === triggerDomain) {
    return 'same_domain';
  }
  if (candidateIds.size > 0 && triggerIds.length > 0) return 'mismatch';
  return 'unknown';
}

/* ----------  Outlook $search key variants (TKT-139)  ---------- */

/**
 * The `$search` phrase VARIANTS for one retro key (TKT-139). Graph `$search`
 * tokenizes on whitespace, so a ref searched as one token (`PHA5007`) does NOT
 * match messages carrying the spaced form (`PHA 5007`) and vice versa — the
 * TKT-119 Deleted-Items feasibility memo measured exactly this miss. The retro
 * rung therefore issues EVERY variant and unions the results:
 *   1. the key as given (trimmed, whitespace collapsed);
 *   2. the COMPACT form (all whitespace removed);
 *   3. the SPACED form (a space at every alpha<->digit boundary of the compact
 *      form — 'PHA5007' -> 'PHA 5007', 'YT13UTV' -> 'YT 13 UTV').
 * Deduplicated, order-stable, never empty for a non-blank key. Pure —
 * unit-tested without Graph.
 */
export function refSearchVariants(key: string): string[] {
  const given = String(key ?? '').replace(/\s+/g, ' ').trim();
  if (!given) return [];
  const compact = given.replace(/\s+/g, '');
  const spaced = compact
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2');
  const out: string[] = [];
  for (const v of [given, compact, spaced]) {
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/* ----------  Outlook original-instruction pick (R3)  ---------- */

export interface OutlookSearchCandidate {
  id: string;
  subject: string;
  receivedDateTime: string;
  /** Sender SMTP address, lowercased ('' when Graph omitted it). */
  from: string;
  hasAttachments: boolean;
  /** Which intake mailbox the hit came from (needed to build the fetch resource). */
  mailbox: string;
}

const REPLY_PREFIX_RE = /^\s*(re|fw|fwd)\s*:/i;

/**
 * Pick the ORIGINAL instruction out of mailbox `$search` hits:
 *   1. drop messages FROM our own intake mailboxes ($search spans Sent Items —
 *      our replies/chasers must never be "the original") and sender-less hits;
 *   2. prefer messages WITH attachments (instructions carry documents);
 *   3. prefer non-`RE:`/`FW:` subjects (the original predates the thread);
 *   4. earliest receivedDateTime wins; id tiebreak for determinism.
 * Null when nothing survives.
 */
export function selectOutlookOriginal(
  candidates: readonly OutlookSearchCandidate[],
  opts: { intakeMailboxes: readonly string[] },
): OutlookSearchCandidate | null {
  return rankOutlookOriginals(candidates, opts)[0] ?? null;
}

/**
 * TKT-219 follow-up (candidate fallback): the FULL ranked external-candidate list behind
 * {@link selectOutlookOriginal}. The orchestrator may try the next-ranked candidate when a
 * pick is refused as a case anchor (blocked-family classification) or fails corroboration —
 * a noisy first hit must not sink a matter whose real original ranks second.
 */
export function rankOutlookOriginals(
  candidates: readonly OutlookSearchCandidate[],
  opts: { intakeMailboxes: readonly string[] },
): OutlookSearchCandidate[] {
  const own = new Set(opts.intakeMailboxes.map((m) => m.trim().toLowerCase()).filter(Boolean));
  const external = candidates.filter((c) => c.from && !own.has(c.from));
  return [...external].sort((a, b) => {
    const aAtt = a.hasAttachments ? 0 : 1;
    const bAtt = b.hasAttachments ? 0 : 1;
    if (aAtt !== bAtt) return aAtt - bAtt;
    const aRe = REPLY_PREFIX_RE.test(a.subject) ? 1 : 0;
    const bRe = REPLY_PREFIX_RE.test(b.subject) ? 1 : 0;
    if (aRe !== bRe) return aRe - bRe;
    const at = a.receivedDateTime || '9999';
    const bt = b.receivedDateTime || '9999';
    if (at !== bt) return at < bt ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

/** Evidence class for a byte-less archive-file registration (link-only rows).
 *  Deliberately NEVER 'instruction' — the actual instruction is blob-landed and
 *  classified by classifyPersist; loose archive files must not inflate the
 *  status machine's instruction count. */
export function classifyArchiveFile(filename: string): 'image' | 'email' | 'other' {
  if (/\.(jpe?g|png|gif|bmp|webp|heic|tiff?)$/i.test(filename)) return 'image';
  if (/\.(eml|msg)$/i.test(filename)) return 'email';
  return 'other';
}

/* ----------  Case-folder consolidation over search hits  ---------- */

export interface RetroSearchHit {
  id: string;
  name: string;
  type: string;
  caseFolder: { id: string; name: string } | null;
}

export interface CaseFolderPick {
  folder: { id: string; name: string } | null;
  /** 'unanimous' | 'ref_tier' — how the pick was justified (telemetry). */
  basis?: string;
  /** Distinct candidate folders seen (>1 without a decisive tier = ambiguous). */
  candidateCount: number;
}

/**
 * Consolidate content-search hits into ONE case folder — or refuse.
 *
 * `refHits` are hits from the reference-keyed searches (casePo/externalRef —
 * distinctive keys); `vrmHits` from the registration search (weak key: one
 * vehicle can appear in several claims). Rules:
 *   1. Reference-keyed hits outrank VRM hits: if ref hits name exactly ONE
 *      folder, that wins (basis 'ref_tier') even when VRM hits add others.
 *   2. Otherwise ALL hits together must be unanimous (basis 'unanimous').
 *   3. ≥2 distinct folders with no decisive ref tier → NO pick (never guess
 *      between case folders — the ADR-0010 discipline applied to the archive).
 *   Hits with no resolvable case folder are ignored.
 */
export function pickCaseFolder(
  refHits: readonly RetroSearchHit[],
  vrmHits: readonly RetroSearchHit[],
): CaseFolderPick {
  const foldersOf = (hits: readonly RetroSearchHit[]): Map<string, { id: string; name: string }> => {
    const map = new Map<string, { id: string; name: string }>();
    for (const h of hits) {
      if (h.caseFolder?.id) map.set(h.caseFolder.id, h.caseFolder);
    }
    return map;
  };
  const refFolders = foldersOf(refHits);
  const allFolders = foldersOf([...refHits, ...vrmHits]);

  if (refFolders.size === 1) {
    const folder = [...refFolders.values()][0];
    return { folder, basis: 'ref_tier', candidateCount: allFolders.size };
  }
  if (refFolders.size === 0 && allFolders.size === 1) {
    const folder = [...allFolders.values()][0];
    return { folder, basis: 'unanimous', candidateCount: 1 };
  }
  return { folder: null, candidateCount: allFolders.size };
}
