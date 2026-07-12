/**
 * Best-effort field supplements when the instruction attachment parse omits content
 * that is present in the email body (e.g. QDOS triage letters with table-layout .doc
 * files on FC1 where LibreOffice is unavailable).
 */

const ACCIDENT_START_RE = /accident circumstances\s*:?/i;
const ACCIDENT_END_RES = [
  /\bdamage description\s*:?/i,
  /\bdriveable\s*:?/i,
  /\byours faithfully\b/i,
];

const CLAIMANT_LABEL_RE =
  /^(?:claimant(?:['’]s)?(?:\s+name)?|name\s+of\s+(?:the\s+)?claimant|client\s+name|our\s+client)\s*(?::|-)\s*(.*)$/i;
const CLAIMANT_PROSE_RE =
  /^(?:our\s+client|the\s+claimant|claimant)\s+(?:is|was|named)\s+(.+)$/i;
const SIGN_OFF_RE =
  /^(?:kind(?:est)?\s+regards|best\s+regards|warm\s+regards|regards|best\s+wishes|all\s+the\s+best|many\s+thanks|thanks|yours\s+(?:faithfully|sincerely))\b(?<remainder>.*)$/i;
const MOBILE_SIGNATURE_RE = /^sent\s+from\s+my(?:\s+[\p{L}\p{N}'’._-]+){1,4}[.!]*$/iu;
const THREAD_BOUNDARY_RE =
  /^(?:[-_]{3,}(?:\s*(?:original|forwarded)\s+message\s*[-_]*)?|begin\s+forwarded\s+message|on\s+.+\s+wrote\s*:|(?:from|sent|to|subject)\s*:\s*\S)/i;
const CLAIMANT_THREAD_BOUNDARY = '\u0000';
const NAME_TOKEN_RE = /^\p{L}+(?:['’\-]\p{L}+)*$/u;
const CLAIMANT_TITLES = new Set(['mr', 'mrs', 'miss', 'ms', 'mx', 'dr', 'prof']);
const CLAIMANT_PLACEHOLDERS = new Set([
  'tbc',
  'tba',
  'n a',
  'na',
  'none',
  'unknown',
  'not known',
  'not provided',
  'to follow',
  'to be advised',
  'to be confirmed',
]);
const CLAIMANT_REJECT_WORDS = new Set([
  'insured',
  'policyholder',
  'handler',
  'solicitor',
  'engineer',
  'engineers',
  'assessor',
  'assessors',
  'repairer',
  'repairers',
  'garage',
  'bodyshop',
  'third',
  'party',
  'claims',
  'team',
  'legal',
  'insurance',
  'services',
  'solutions',
  'associates',
  'limited',
  'ltd',
  'llp',
  'plc',
  'company',
  'group',
  'management',
  'administrator',
  'advisor',
  'manager',
]);
const CLAIMANT_NAME_STOPS = new Set([
  'and',
  'accident',
  'available',
  'car',
  'case',
  'claim',
  'claimant',
  'client',
  'contact',
  'department',
  'dob',
  'for',
  'from',
  'has',
  'have',
  'in',
  'is',
  'name',
  'named',
  'need',
  'needs',
  'on',
  'of',
  'our',
  'please',
  'ref',
  'reference',
  'reg',
  'regarding',
  'registration',
  'require',
  'requires',
  'requested',
  'requesting',
  'the',
  'to',
  'vehicle',
  'vrm',
  'was',
  'who',
  'whose',
]);
const SIGN_OFF_REMAINDER_STOPS = new Set([
  'for',
  'the',
  'our',
  'your',
  'client',
  'claimant',
  'instruction',
  'message',
  'email',
  'help',
  'assistance',
  'attached',
  'update',
  'to',
  'and',
  'but',
  'if',
  'please',
  'report',
  'vehicle',
  'claim',
  'case',
]);

export interface ClaimantBodySupplement {
  status: 'absent' | 'matched' | 'conflict';
  value: string;
  candidates: string[];
}

function isStandaloneSignoff(line: string): boolean {
  if (MOBILE_SIGNATURE_RE.test(line)) return true;
  const match = SIGN_OFF_RE.exec(line);
  if (!match) return false;
  const remainder = (match.groups?.remainder ?? '').replace(/^[,!.:;\s–—-]+/, '').trim();
  if (!remainder) return true;
  const tokens = remainder.match(/\p{L}[\p{L}'’.\-]*/gu) ?? [];
  return (
    tokens.length >= 1 &&
    tokens.length <= 4 &&
    !tokens.some((token) => SIGN_OFF_REMAINDER_STOPS.has(token.toLowerCase().replace(/\.$/, '')))
  );
}

function claimantEvidenceLines(body: string): string[] {
  const lines = (body ?? '').replace(/\r\n?/g, '\n').split('\n');
  let inSignature = false;
  let inQuotedBlock = false;
  return lines.map((rawLine) => {
    const rawTrimmed = rawLine.trim();
    const quoted = /^>+/.test(rawTrimmed);
    if (quoted && !inQuotedBlock) inSignature = false;
    if (!quoted && inQuotedBlock) inSignature = false;
    inQuotedBlock = quoted;
    const line = rawTrimmed.replace(/^>+\s*/, '');
    if (THREAD_BOUNDARY_RE.test(line)) {
      inSignature = false;
      return CLAIMANT_THREAD_BOUNDARY;
    }
    if (isStandaloneSignoff(line)) {
      inSignature = true;
      return '';
    }
    return inSignature ? '' : line;
  });
}

function claimantCandidate(raw: string, allowSingleName: boolean): string {
  const trimmed = raw
    .trim()
    .replace(/^[|:–—\-\s]+/, '')
    .replace(/^["“”']+|["“”']+$/g, '')
    .trim();
  if (!trimmed || trimmed.includes('@') || /\d/.test(trimmed)) return '';

  const placeholderKey = trimmed
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
  if (CLAIMANT_PLACEHOLDERS.has(placeholderKey)) return '';
  const rawTokens = trimmed.split(/\s+/);
  const accepted: string[] = [];
  for (const rawToken of rawTokens) {
    const token = rawToken.replace(/^[,;:()[\]{}]+|[,;:()[\]{}.!?]+$/g, '');
    if (!token) continue;
    const lower = token.toLowerCase().replace(/\.$/, '');
    if (CLAIMANT_NAME_STOPS.has(lower)) break;
    if (accepted.length === 0 && CLAIMANT_TITLES.has(lower)) {
      accepted.push(token);
      continue;
    }
    if (!NAME_TOKEN_RE.test(token)) return '';
    accepted.push(token);
    if (accepted.length > 6) return '';
  }

  const nameTokens = accepted.filter(
    (token) => !CLAIMANT_TITLES.has(token.toLowerCase().replace(/\.$/, '')),
  );
  if (nameTokens.length === 0 || (!allowSingleName && nameTokens.length < 2)) return '';
  if (nameTokens.some((token) => CLAIMANT_REJECT_WORDS.has(token.toLowerCase()))) return '';
  return accepted.join(' ');
}

function uniqueClaimants(values: readonly string[]): string[] {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const key = value.normalize('NFKC').toLowerCase().replace(/[^\p{L}]+/gu, ' ').trim();
    if (key && !byKey.has(key)) byKey.set(key, value);
  }
  return [...byKey.values()];
}

function claimantResult(values: readonly string[]): ClaimantBodySupplement {
  const candidates = uniqueClaimants(values);
  if (candidates.length === 1) {
    return { status: 'matched', value: candidates[0], candidates };
  }
  if (candidates.length > 1) {
    return { status: 'conflict', value: '', candidates };
  }
  return { status: 'absent', value: '', candidates: [] };
}

/**
 * Recover a claimant explicitly stated in the e-mail body when the instruction
 * document left the field empty. Explicit claimant/client labels outrank the
 * weaker domain-qualified prose form. Signature ranges are excluded, while a
 * quoted original message after a thread boundary remains eligible. Conflicting
 * defensible candidates return `conflict` and no value; callers must not guess.
 */
export function supplementClaimantNameFromBody(body: string): ClaimantBodySupplement {
  const lines = claimantEvidenceLines(body);
  const labelled: string[] = [];
  const prose: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    const label = CLAIMANT_LABEL_RE.exec(line);
    if (label) {
      const inline = claimantCandidate(label[1], true);
      if (inline) {
        labelled.push(inline);
      } else if (!label[1].trim()) {
        let next = '';
        for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
          if (lines[nextIndex] === CLAIMANT_THREAD_BOUNDARY) break;
          if (lines[nextIndex].trim()) {
            next = lines[nextIndex];
            break;
          }
        }
        const continued = claimantCandidate(next, true);
        if (continued) labelled.push(continued);
      }
      continue;
    }

    const proseMatch = CLAIMANT_PROSE_RE.exec(line);
    if (proseMatch) {
      const candidate = claimantCandidate(proseMatch[1], false);
      if (candidate) prose.push(candidate);
    }
  }

  return claimantResult(labelled.length ? labelled : prose);
}

/**
 * Extract accident circumstances narrative from plain email body text when the
 * parser left the field empty but the body carries an "Accident Circumstances" block.
 */
export function supplementAccidentCircumstancesFromBody(body: string): string {
  const text = (body ?? '').replace(/\r\n/g, '\n').trim();
  if (!text || !ACCIDENT_START_RE.test(text)) {
    return '';
  }

  const startMatch = ACCIDENT_START_RE.exec(text);
  if (!startMatch) {
    return '';
  }

  let remainder = text.slice(startMatch.index + startMatch[0].length).trim();
  remainder = remainder.replace(/^[|:\s]+/, '');

  let endIdx = remainder.length;
  for (const endRe of ACCIDENT_END_RES) {
    const match = endRe.exec(remainder);
    if (match && match.index < endIdx) {
      endIdx = match.index;
    }
  }

  const value = remainder
    .slice(0, endIdx)
    .replace(/\s+/g, ' ')
    .trim();

  return value.length > 10 ? value : '';
}
