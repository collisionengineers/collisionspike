/* ============================================================
   Collision Engineers — Retroactive case reconstruction (DOMAIN LOGIC, ADR-0022).

   The live intake only mints Cases from `receiving_work` mail as it arrives. An
   inbound `billing` / `case_update` / `cancellation` / `query` about a case the
   system has never seen (it predates go-live, or was missed) therefore cannot
   link — it sits in the triage inbox with no Case. This module owns the PURE
   decisions of the gated retro fallback that fixes that:

     decideRetro          — is this unmatched inbound eligible to trigger the
                            reconstruction ladder, and with which search keys?
     decideRetroStatus    — where does a reconstructed Case land (per-case:
                            terminal `eva_submitted` only for a fully-sourced
                            billing trigger; everything else Held for review)?
     matchPrincipalByCasePo — validate a DISCOVERED Box-archive folder name as a
                            CE Case/PO and resolve its principal + marker.
     selectBoxInstructionCandidate — pick the original-instruction file out of
                            an archive folder listing.

   KEY MODEL (operator decision, 2026-07-04): trigger emails do NOT cite the
   internal Case/PO — they cite the provider's claim/external reference
   (`body_jobref`), possibly a claimant name (NOT a v1 key — no extraction
   exists), and a registration (`body_vrm`). A CE-shaped `body_caseref` (usually
   quoted from our own thread) is an opportunistic strongest key. The Case/PO is
   DISCOVERED from the matched archive folder's name, never taken from the email
   and never minted by the retro path.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No I/O, no env, no live calls — the
   caller (orchestration) reads gates and passes checkpointed values in.
   ============================================================ */

import type { InboundCategory } from '../dto/index.js';
import type { CaseStatus } from '../contracts/case-status';
import { CASE_PO_MARKER, type CaseWorkType } from './case-type';

/** Categories that may trigger the retro fallback. A domain CONSTANT (not an
 *  app-setting) so the set can never drift outside the `InboundCategory` union:
 *  `non_actionable` is deliberately excluded (case-summary digests cite MANY
 *  refs — reconstructing from a digest is wrong) and so is `other` (genuinely
 *  unidentified mail has no trustworthy key). `receiving_work` never reaches the
 *  retro seam at all — the primary intake path owns it. */
export const RETRO_TRIGGER_CATEGORIES: readonly InboundCategory[] = [
  'billing',
  'case_update',
  'cancellation',
  'query',
];

/**
 * TKT-119: the ONE `non_actionable` subtype that may also trigger the ladder — an
 * ACKNOWLEDGEMENT ("Thanks, received — our ref PHA 5007") cites exactly one matter, so
 * its keys are trustworthy, and the operator expects it to LOCATE (link or reconstruct
 * from the recovered original) — never to mint a case from the ack itself (the create
 * seam persists the reconstructed ORIGINAL instruction, and an Outlook-only
 * reconstruction still lands Held with no Case/PO). `case_summary` digests remain
 * excluded — they cite MANY refs, so reconstruction from one is wrong by construction.
 */
export const RETRO_TRIGGER_ACK_SUBTYPE = 'acknowledgement';

/**
 * Anchored full-match mirror of the Python extractor `CASEREF_RE`
 * (services/functions/parser/cedocumentmapper_v2/rules/email_classifier.py — the vendored
 * engine is the authority; this mirror must track it):
 *
 *     \b(?:(?:AP|A|D)\.\s?)?(?:[A-Z]{2}\d{2}\d{3}|[A-Z]{3,5}\d{2}\d{3,4})\b(?!\.\d)
 *
 * Differences are deliberate: anchors (^…$) replace the word boundaries AND the
 * trailing `(?!\.\d)` solicitor-ref guard ("RTA135983.001" cannot full-match an
 * anchored pattern), because this regex VALIDATES whole tokens — the classifier
 * already did the in-text extraction. The two arms mirror the real corpus: a
 * 2-letter principal always carries a 3-digit sequence ("MP26071"); a 3–5-letter
 * principal carries 3 OR 4 ("CCPY26050", "QDOS261253", "A.PCH261269").
 */
export const CASE_PO_SHAPE_RE =
  /^(?:(?:AP|A|D)\.\s?)?(?:[A-Z]{2}\d{2}\d{3}|[A-Z]{3,5}\d{2}\d{3,4})$/i;

/** Normalise a Case/PO-shaped token for storage/matching: trim, upper-case, and
 *  collapse the tolerated space after a marker dot ("a. pch261269" -> "A.PCH261269").
 *  Purely lexical — does NOT validate; pair with {@link CASE_PO_SHAPE_RE}. */
export function normalizeCasePo(raw: string | null | undefined): string {
  return (raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/^((?:AP|A|D)\.)\s+/, '$1');
}

/* ----------  Trigger eligibility (the intake-orchestrator seam)  ---------- */

/** The reconstruction search keys, strongest first: an opportunistic CE Case/PO
 *  (quoted thread), the provider's external/claim reference, the registration. */
export interface RetroKeys {
  casePo?: string;
  externalRef?: string;
  vrm?: string;
}

/** Checkpointed values from the intake orchestrator — classification fields come
 *  from the Stage-A classifier row; candidate* from the fetched envelope. */
export interface RetroTriggerInput {
  category: InboundCategory;
  /** Stage-A subtype — TKT-119: `non_actionable` is eligible ONLY when the subtype is
   *  {@link RETRO_TRIGGER_ACK_SUBTYPE} (an acknowledgement cites one matter; a
   *  case_summary digest cites many). Optional: absent behaves exactly as before. */
  subtype?: string | null;
  bodyCaseref?: string | null;
  bodyJobref?: string | null;
  bodyVrm?: string | null;
  candidateRef?: string | null;
  candidateVrm?: string | null;
  isReply: boolean;
  /** Present only when the reply lane ran linkReply first. */
  linkReplyOutcome?: 'linked' | 'ambiguous' | 'no_match' | string;
}

export interface RetroTriggerDecision {
  attempt: boolean;
  keys: RetroKeys;
  /** Why (not) — for the orchestrator log / failure audit, never user-facing. */
  reasons: string[];
}

/**
 * Decide whether an unmatched non-receiving_work inbound may trigger the retro
 * reconstruction ladder. Rules, in order:
 *   1. category ∈ {@link RETRO_TRIGGER_CATEGORIES};
 *   2. at least one usable key — a CE-shaped ref -> `keys.casePo`; a job/claim
 *      ref -> `keys.externalRef`; a registration -> `keys.vrm`. Name-only /
 *      key-less mail never attempts (stays in triage exactly as today);
 *   3. when the reply lane RAN (`linkReplyOutcome` present), only `no_match` may
 *      proceed. `ambiguous` (>1 OPEN case already matches) must NOT fire retro —
 *      the case demonstrably exists (twice); creating another would turn a
 *      duplicate problem into a triplicate one. `linked` obviously never reaches
 *      here. A reply WITHOUT an outcome (the manual drain lever, where the reply
 *      lane never ran) proceeds — the any-status resolve-existing rung provides
 *      the same link-first/ambiguity protection.
 */
export function decideRetro(input: RetroTriggerInput): RetroTriggerDecision {
  const reasons: string[] = [];
  const keys: RetroKeys = {};

  // TKT-119: a non_actionable ACKNOWLEDGEMENT is eligible (locate-and-link /
  // reconstruct-the-original — the ack itself never mints); every other
  // non_actionable subtype (case_summary digests etc.) stays excluded.
  const ackEligible =
    input.category === 'non_actionable' &&
    (input.subtype ?? '').trim() === RETRO_TRIGGER_ACK_SUBTYPE;
  if (!RETRO_TRIGGER_CATEGORIES.includes(input.category) && !ackEligible) {
    return { attempt: false, keys, reasons: [`category_not_eligible:${input.category}`] };
  }
  if (ackEligible) reasons.push('ack_subtype_eligible');

  // Key extraction. bodyCaseref is already the CASEREF_RE extraction (shaped by
  // construction) but is re-asserted here rather than trusted (dedup.ts's
  // "never trust the caller alone" discipline). candidateRef (subject sniff) may
  // be any shape: CE-shaped -> casePo; otherwise it still counts as an external
  // reference rather than being dropped.
  const refCandidates = [input.bodyCaseref, input.candidateRef];
  for (const raw of refCandidates) {
    const token = normalizeCasePo(raw);
    if (!token) continue;
    if (!keys.casePo && CASE_PO_SHAPE_RE.test(token)) {
      keys.casePo = token;
      reasons.push('key:case_po');
    } else if (!keys.externalRef) {
      keys.externalRef = token;
      reasons.push('key:external_ref_from_subject');
    }
  }
  const jobref = (input.bodyJobref ?? '').trim().toUpperCase();
  if (jobref && !keys.externalRef) {
    keys.externalRef = jobref;
    reasons.push('key:external_ref');
  }
  const vrm = ((input.bodyVrm || input.candidateVrm) ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (vrm) {
    keys.vrm = vrm;
    reasons.push('key:vrm');
  }

  if (!keys.casePo && !keys.externalRef && !keys.vrm) {
    return { attempt: false, keys, reasons: [...reasons, 'no_usable_key'] };
  }

  if (input.isReply && input.linkReplyOutcome !== undefined && input.linkReplyOutcome !== 'no_match') {
    return {
      attempt: false,
      keys,
      reasons: [...reasons, `reply_outcome_not_no_match:${input.linkReplyOutcome}`],
    };
  }

  return { attempt: true, keys, reasons };
}

/* ----------  Landing status for a reconstructed Case  ---------- */

/** How much of the original case the ladder recovered. `box_eml` / `box_doc` /
 *  `outlook` = a real original-instruction source was fetched + attached;
 *  `minimal` = only an anchor (folder name / trigger email) — no source material. */
export type RetroReconstructionSource = 'box_eml' | 'box_doc' | 'outlook' | 'minimal';

export interface RetroStatusInput {
  triggerCategory: InboundCategory;
  reconstruction: RetroReconstructionSource;
  /** The discovered Case/PO's principal resolved to a known work provider. */
  principalResolved: boolean;
  /** A Case/PO was discovered at all (Box folder name). Outlook-only = false. */
  casePoKnown: boolean;
}

export interface RetroStatusDecision {
  status: Extract<CaseStatus, 'eva_submitted' | 'needs_review'>;
  onHold: boolean;
  actionReason?: 'needs_review';
  /** Decision signals for the audit_event / Action Log. */
  signals: string[];
}

/**
 * Where a reconstructed Case lands — per-case and conservative (operator
 * decision, 2026-07-04: "it depends on the case", with the existing terminal
 * `eva_submitted` reused as the completed status for historically-submitted
 * work):
 *   - no verified identity (principal unresolved OR no discovered Case/PO) ->
 *     Held `needs_review`, ALWAYS — a terminal case without a verified PO/
 *     provider would be wrong, and the PO namespace is never guessed into;
 *   - `billing` trigger + a real recovered source -> `eva_submitted` (an
 *     invoice/fee request implies the report was already delivered; the status
 *     guard's terminal lock keeps recomputes off it);
 *   - everything else (case_update / query / cancellation triggers, or a
 *     `minimal` anchor) -> Held `needs_review` for staff to place. A
 *     billing-triggered minimal anchor is deliberately held, never terminal —
 *     locking a data-empty case behind the terminal lock would strand it.
 */
export function decideRetroStatus(input: RetroStatusInput): RetroStatusDecision {
  if (!input.principalResolved || !input.casePoKnown) {
    return {
      status: 'needs_review',
      onHold: true,
      actionReason: 'needs_review',
      signals: [
        input.casePoKnown ? 'retro_principal_unresolved' : 'retro_case_po_unknown',
        `retro_source:${input.reconstruction}`,
      ],
    };
  }
  if (input.triggerCategory === 'billing' && input.reconstruction !== 'minimal') {
    return {
      status: 'eva_submitted',
      onHold: false,
      signals: ['retro_billing_implies_submitted', `retro_source:${input.reconstruction}`],
    };
  }
  return {
    status: 'needs_review',
    onHold: true,
    actionReason: 'needs_review',
    signals: [`retro_trigger:${input.triggerCategory}`, `retro_source:${input.reconstruction}`],
  };
}

/* ----------  Discovered-folder-name -> principal/marker/case-type  ---------- */

export interface CasePoParts {
  marker: '' | 'A.' | 'AP.' | 'D.';
  /** The token with the marker stripped (e.g. "PCH261269"). */
  body: string;
}

/** Split a normalised Case/PO token into marker + body. Longest marker first —
 *  "AP." must never be half-read as "A." (mirrors the Python alternation order). */
export function parseCasePoMarker(po: string): CasePoParts {
  const token = normalizeCasePo(po);
  for (const marker of ['AP.', 'A.', 'D.'] as const) {
    if (token.startsWith(marker)) return { marker, body: token.slice(marker.length) };
  }
  return { marker: '', body: token };
}

export interface PrincipalMatch {
  /** The matched principal code, as supplied (upper-cased). */
  principal: string;
  marker: '' | 'A.' | 'AP.' | 'D.';
}

/**
 * Resolve a DISCOVERED Case/PO (a Box-archive folder name) against the known
 * work-provider principal codes: strip the marker, then longest-prefix match the
 * body against the supplied codes, requiring the remainder to be the year +
 * sequence digits (`\d{5,6}` = yy + 3–4-digit seq). Longest-prefix matters — a
 * principal "CC" must never swallow "CCPY26050"'s CCPY. Returns null when the
 * name is not a known-principal Case/PO (a hit in a non-case subtree, a foreign
 * firm's shaped token, an unknown/new provider) — callers treat that as
 * unverified identity, never as a licence to guess.
 */
export function matchPrincipalByCasePo(
  po: string,
  principals: readonly string[],
): PrincipalMatch | null {
  const { marker, body } = parseCasePoMarker(po);
  if (!body) return null;
  let best: string | null = null;
  for (const raw of principals) {
    const code = (raw ?? '').trim().toUpperCase();
    if (!code || !body.startsWith(code)) continue;
    if (!/^\d{5,6}$/.test(body.slice(code.length))) continue;
    if (!best || code.length > best.length) best = code;
  }
  return best ? { principal: best, marker } : null;
}

/** The case type a Case/PO marker denotes (inverse of {@link CASE_PO_MARKER}). */
export function markerToCaseType(marker: string): CaseWorkType {
  const token = (marker ?? '').trim().toUpperCase();
  const entry = (Object.entries(CASE_PO_MARKER) as [CaseWorkType, string][]).find(
    ([, m]) => m === token,
  );
  return entry ? entry[0] : 'standard';
}

/* ----------  Archive-folder instruction pick  ---------- */

/** One entry from a Box folder listing (the facade's list-folder fields). */
export interface BoxFolderEntry {
  id: string;
  name: string;
  /** Box item type — 'file' | 'folder' | 'web_link'. Missing = treated as file. */
  type?: string;
  size?: number;
  /** ISO timestamp (Box `created_at`). */
  createdAt?: string;
}

export interface InstructionCandidate {
  entry: BoxFolderEntry;
  kind: 'eml' | 'doc';
}

const EML_EXT_RE = /\.(eml|msg)$/i;
/** Parseable instruction-document extensions (mirrors the parse activity's set). */
const DOC_EXT_RE = /\.(pdf|docx?|rtf)$/i;
/** Existing-work artefacts that must never be picked as "the instruction" — the
 *  engineer's report, the invoice/fee note (the bill is what TRIGGERED retro). */
const NON_INSTRUCTION_NAME_RE = /report|invoice|fee/i;
const INSTRUCTION_NAME_RE = /instruction|new\s?case|message/i;

function byOldestThenName(a: BoxFolderEntry, b: BoxFolderEntry): number {
  const at = a.createdAt ?? '9999';
  const bt = b.createdAt ?? '9999';
  if (at !== bt) return at < bt ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/**
 * Pick the original-instruction file from an archive case folder's listing.
 * Preference ladder:
 *   1. `.eml`/`.msg` — the archived original email itself; OLDEST first (the
 *      instruction predates every reply in the folder), names that advertise
 *      the instruction outrank within the same timestamp;
 *   2. else a parseable document (pdf/doc/docx/rtf), EXCLUDING report/invoice/
 *      fee-named files (existing-work artefacts), preferring names containing
 *      "instruction", else oldest;
 *   3. else null — the caller degrades to the minimal-anchor rung.
 * Subfolders are ignored (v1) — the caller logs their count.
 */
export function selectBoxInstructionCandidate(
  entries: readonly BoxFolderEntry[],
): InstructionCandidate | null {
  const files = entries.filter((e) => (e.type ?? 'file') === 'file');

  const emls = files.filter((e) => EML_EXT_RE.test(e.name)).sort(byOldestThenName);
  if (emls.length > 0) {
    const advertised = emls.filter((e) => INSTRUCTION_NAME_RE.test(e.name));
    return { entry: (advertised[0] ?? emls[0]) as BoxFolderEntry, kind: 'eml' };
  }

  const docs = files
    .filter((e) => DOC_EXT_RE.test(e.name) && !NON_INSTRUCTION_NAME_RE.test(e.name))
    .sort(byOldestThenName);
  if (docs.length > 0) {
    const advertised = docs.filter((e) => INSTRUCTION_NAME_RE.test(e.name));
    return { entry: (advertised[0] ?? docs[0]) as BoxFolderEntry, kind: 'doc' };
  }

  return null;
}
