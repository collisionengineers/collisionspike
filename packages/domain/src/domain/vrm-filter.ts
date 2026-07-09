/* ============================================================
   Collision Engineers — UK VRM extraction (DOMAIN LOGIC, M1).

   Canonical registration-mark sniff shared by the orchestration intake
   (fetchMessage A0) and mirrored by the parser's Python sniff. Replaces the
   un-guarded orch regex that emitted postcode outward codes (B8/LS8/G3/BD8)
   and junk tokens (BOX2/AT8/LH3) as the case `candidateVrm`.

   THE RULESET (mirror of the Python canonical ruleset):
     ACCEPT (strict, unconditional — real DVLA mark shapes):
       - current  [A-Z]{2}\d{2}\s?[A-Z]{3}     e.g. MX17PNL / MX17 PNL / AP70WAA
       - prefix   [A-Z]\d{1,3}\s?[A-Z]{3}      e.g. A123 BCD
       - suffix   [A-Z]{3}\s?\d{1,3}[A-Z]      e.g. ABC 123D
     ACCEPT (loose, dateless [A-Z]{1,3}\s?\d{1,4}) ONLY WHEN a context anchor
       (reg / registration / vrm / vehicle / plate) sits WITHIN ~40 CHARS of the
       candidate (TKT-071: the anchor test used to be document-wide, so any
       "vehicle" anywhere in a letter of instruction licensed every loose token
       in it — the live HD4110 job-ref false positive). Dateless personalised
       marks (e.g. "A1") are indistinguishable from junk without one.
       TIGHTER STILL (TKT-071): when the candidate's letter head is a UK postcode
       AREA (HD, LS, G, …) the anchor must IMMEDIATELY precede the candidate
       ("reg HD4110" accepted; "FW: HD4110 - LETTER OF INSTRUCTION" rejected even
       with "vehicle" nearby) — the postcode-area+digits shape is exactly what
       provider job refs and postcode fragments look like.
     EXCLUDE:
       - UK postcodes — a candidate immediately followed by an inward code
         (\d[A-Z]{2}) is an outward code (B8 1AA, LS8 3RT), never a VRM.
       - UK postcode OUTWARD codes on their own — a loose candidate shaped like an
         area+district (1-2 known-area letters + 1-2 digits, e.g. B8 / LS8 / G3 /
         BD8) is the first half of a postcode, never a mark, even with NO inward
         code following. "A1" survives because there is no "A" postcode area.
       - VAT / TEL / REF / invoice numbers — a candidate immediately preceded by
         one of those labels is a reference, not a mark.
       - Common English FUNCTION WORDS as the loose alpha head (TKT-100: the QDOS
         footer's "Offices 1 and 2, 1A King Street" surfaced AND2 as a live case
         VRM) — "and 2" / "the 4" is prose, never a plate.
       - MONTH / DAY-OF-WEEK words (TKT-085: a live case logged registration
         "OCTOBER") — a date word is never a mark. Every accepting shape here
         requires digits, so this is defence-in-depth kept in lockstep with the
         Python engine's vrm_candidate_is_bad.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No I/O, no live calls.
   ============================================================ */

import { canonicalizeVrm } from './vrm-canon';

/** Strict DVLA mark shapes — accepted unconditionally (a real mark, not junk). */
const STRICT =
  /\b(?:[A-Z]{2}[0-9]{2}\s?[A-Z]{3}|[A-Z][0-9]{1,3}\s?[A-Z]{3}|[A-Z]{3}\s?[0-9]{1,3}[A-Z])\b/g;

/** Loose dateless shape — only trusted next to a context anchor. */
const LOOSE = /\b[A-Z]{1,3}\s?[0-9]{1,4}\b/g;

/** Context anchor words that license the loose shape. */
const ANCHOR = /\b(?:registration|reg|vrm|vehicle|plate|number\s?plate)\b/i;

/** How far either side of a loose candidate an anchor word may sit (TKT-071 —
 *  proximity anchoring; mirrors the Python sniff's _VRM_CONTEXT_WINDOW intent). */
const ANCHOR_WINDOW = 40;

/** TIGHT anchor (TKT-071): for a postcode-area-headed loose candidate the anchor must
 *  IMMEDIATELY precede it — this many chars of lookbehind ("registration:  HD4110"). */
const TIGHT_ANCHOR_WINDOW = 16;
const TIGHT_ANCHOR = /(?:reg(?:istration)?|vrm|vehicle|plate)\s*(?:no|number|mark)?\s*[:.\-#]?\s*$/i;

/** Month / day-of-week words (TKT-085 — the live "OCTOBER" registration): a date word is
 *  never a mark. Defence-in-depth (every accepting shape requires digits), kept in
 *  lockstep with the Python engine's _VRM_MONTH_DAY_WORDS. */
const MONTH_DAY_WORDS = new Set([
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST',
  'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
  'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'SEPT', 'OCT', 'NOV', 'DEC',
]);

/** Common English FUNCTION words the loose alpha head can spell out of running prose
 *  (TKT-100 — the QDOS "Offices 1 and 2, 1A King Street" AND2 false positive).
 *  Deliberately restricted to function words nobody buys as a plate head — real
 *  dateless heads like "VAN"/"JET"/"SAM" are NOT listed. Mirrors the Python engine's
 *  _VRM_LOOSE_ALPHA_STOPWORDS. */
const LOOSE_ALPHA_STOPWORDS = new Set([
  'AND', 'THE', 'FOR', 'NOT', 'BUT', 'ARE', 'WAS', 'OUR', 'YOU', 'ALL',
  'ANY', 'HAS', 'HAD', 'PER', 'VIA',
]);

/** Reference-number labels (VAT/TEL/REF …) that EXCLUDE a candidate — whether the label
 *  PRECEDES the candidate ("ref AB12") or IS the candidate's own letter prefix ("VAT 123"). */
const EXCLUDE_WORDS = new Set([
  'VAT', 'TEL', 'REF', 'REFERENCE', 'INVOICE', 'INV', 'PHONE', 'FAX', 'FAO', 'PO', 'ORDER', 'ACCOUNT', 'ACC',
]);
const EXCLUDE_LABEL = new RegExp(`\\b(?:${[...EXCLUDE_WORDS].join('|')})[:.#\\-\\s]*$`);

/** True when `cand` at `idx` is immediately followed by a postcode inward code. */
function isPostcodeOutward(upper: string, idx: number, cand: string): boolean {
  const after = upper.slice(idx + cand.length);
  return /^\s?[0-9][A-Z]{2}\b/.test(after);
}

/** The 124 current UK postcode AREA prefixes (the alphabetic head of a postcode).
 *  A loose candidate shaped like an outward code whose letters are a real area is the
 *  FIRST HALF OF A POSTCODE (B8 = Birmingham, LS8 = Leeds, G3/G7 = Glasgow, BD8 =
 *  Bradford), never a registration mark — so it is rejected even with no inward code
 *  following. "A1" / "K9" survive: there is no "A" or "K" single-letter postcode area. */
const POSTCODE_AREAS = new Set([
  'AB', 'AL', 'B', 'BA', 'BB', 'BD', 'BH', 'BL', 'BN', 'BR', 'BS', 'BT', 'CA', 'CB', 'CF', 'CH',
  'CM', 'CO', 'CR', 'CT', 'CV', 'CW', 'DA', 'DD', 'DE', 'DG', 'DH', 'DL', 'DN', 'DT', 'DY', 'E',
  'EC', 'EH', 'EN', 'EX', 'FK', 'FY', 'G', 'GL', 'GU', 'GY', 'HA', 'HD', 'HG', 'HP', 'HR', 'HS',
  'HU', 'HX', 'IG', 'IM', 'IP', 'IV', 'JE', 'KA', 'KT', 'KW', 'KY', 'L', 'LA', 'LD', 'LE', 'LL',
  'LN', 'LS', 'LU', 'M', 'ME', 'MK', 'ML', 'N', 'NE', 'NG', 'NN', 'NP', 'NR', 'NW', 'OL', 'OX',
  'PA', 'PE', 'PH', 'PL', 'PO', 'PR', 'RG', 'RH', 'RM', 'S', 'SA', 'SE', 'SG', 'SK', 'SL', 'SM',
  'SN', 'SO', 'SP', 'SR', 'SS', 'ST', 'SW', 'SY', 'TA', 'TD', 'TF', 'TN', 'TQ', 'TR', 'TS', 'TW',
  'UB', 'W', 'WA', 'WC', 'WD', 'WF', 'WN', 'WR', 'WS', 'WV', 'YO', 'ZE',
]);

/** True when `compact` (a space-stripped, upper-cased loose candidate) is itself a UK
 *  postcode OUTWARD code — 1-2 known-area letters + 1-2 district digits (e.g. B8 / LS8 /
 *  G3 / BD8). Mirrors the parser's `vrm_candidate_is_bad` intent (reject the first half
 *  of a postcode) while sparing genuinely-anchored dateless plates whose letters are NOT
 *  a postcode area (A1, K9). */
function isPostcodeOutwardCode(compact: string): boolean {
  const m = /^([A-Z]{1,2})[0-9]{1,2}$/.exec(compact);
  return m !== null && POSTCODE_AREAS.has(m[1]);
}

/** True when the loose candidate's LETTER HEAD is a UK postcode area — whatever the
 *  digit count (HD4110: 4 digits, so not an outward code, but still exactly the shape
 *  of a provider job ref / postcode fragment). Such a candidate needs the TIGHT
 *  (immediately-preceding) anchor, not just a nearby one (TKT-071). */
function isPostcodeAreaHead(compact: string): boolean {
  const m = /^([A-Z]{1,3})[0-9]/.exec(compact);
  return m !== null && POSTCODE_AREAS.has(m[1]);
}

/** True when a VAT/TEL/REF-style label immediately precedes the candidate at `idx`. */
function precededByExcludeLabel(upper: string, idx: number): boolean {
  const before = upper.slice(Math.max(0, idx - 16), idx);
  return EXCLUDE_LABEL.test(before);
}

/**
 * Extract the first plausible UK VRM from free text (subject + body), applying the
 * canonical ruleset above. Returns the normalised mark (uppercase, no spaces) or ''.
 */
export function extractVrm(text: string | null | undefined): string {
  if (!text) return '';
  const upper = text.toUpperCase();

  // 1) STRICT shapes win — scanned first, accepted unconditionally (skip the rare
  //    case where a strict match is itself a postcode outward+inward run).
  for (const m of upper.matchAll(STRICT)) {
    const cand = m[0];
    if (isPostcodeOutward(upper, m.index ?? 0, cand)) continue;
    return canonicalizeVrm(cand);
  }

  // 2) LOOSE dateless shape — ONLY with a NEARBY context anchor (TKT-071: proximity,
  //    not document-wide), never a postcode, never a VAT/TEL/REF reference, never a
  //    prose function-word head (TKT-100), never a month/day word (TKT-085).
  for (const m of upper.matchAll(LOOSE)) {
    const cand = m[0];
    const idx = m.index ?? 0;
    const compact = cand.replace(/\s+/g, '');
    if (MONTH_DAY_WORDS.has(compact)) continue;
    if (isPostcodeOutward(upper, idx, cand)) continue;
    // Reject a bare postcode OUTWARD code (area + district, e.g. B8 / LS8 / G3 / BD8) —
    // the first half of a postcode, never a mark — even when no inward code follows.
    // A real anchored dateless plate whose letters are not a postcode area (A1) survives.
    if (isPostcodeOutwardCode(compact)) continue;
    // Reject when the candidate's own letter prefix is a reference label (VAT 123, PO 99)
    // or a common English function word spelled out of running prose (AND 2 — TKT-100).
    const alpha = cand.match(/^[A-Z]+/)?.[0] ?? '';
    if (EXCLUDE_WORDS.has(alpha)) continue;
    if (LOOSE_ALPHA_STOPWORDS.has(alpha)) continue;
    if (precededByExcludeLabel(upper, idx)) continue;
    // TKT-071 anchoring. A postcode-area-headed candidate (HD4110 — the exact shape of
    // a provider job ref / postcode fragment) needs the anchor IMMEDIATELY before it;
    // any other loose candidate needs an anchor word within the ±40-char window.
    if (isPostcodeAreaHead(compact)) {
      const before = upper.slice(Math.max(0, idx - TIGHT_ANCHOR_WINDOW), idx);
      if (!TIGHT_ANCHOR.test(before)) continue;
    } else {
      const windowText = upper.slice(Math.max(0, idx - ANCHOR_WINDOW), idx + cand.length + ANCHOR_WINDOW);
      if (!ANCHOR.test(windowText)) continue;
    }
    return canonicalizeVrm(cand);
  }

  return '';
}
