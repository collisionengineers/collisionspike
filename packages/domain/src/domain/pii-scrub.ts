/* ============================================================
   Collision Engineers — PII pre-scrub helper (gated AI paths).

   A small, conservative, UK-context PII redactor the **gated** AI paths reuse
   BEFORE handing free text to an external AI service:
     - Phase-8 LLM email classifier   (EMAIL_AI_ENABLED — Phase-9 G5 sign-off)
     - Phase-4a vision / geocode assist (location-assist text fed to a model)

   It is a PRE-SCRUB, not an anonymiser of the system of record: it lowers the
   blast-radius of a model call by replacing obvious personal data with typed
   placeholders ([EMAIL], [PHONE], …). It is deliberately CONSERVATIVE — it
   favours precision (don't corrupt the text the model must reason over) over
   recall (it will miss free-standing names and unanchored addresses; those need
   NLP and are out of scope — see the limitations note below).

   DOMAIN NOTE — VRMs are NOT scrubbed by default. A vehicle registration is the
   core domain key of this workflow (Case/PO, EVA, image rules all hinge on it),
   i.e. vehicle-IDENTITY, not claimant PII. Only opt in (`redactVrm:true`) when
   the downstream context treats the registration as a person's identifier.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No React, no I/O, no live calls. The
   returned `redactions` summary carries COUNTS ONLY (never the matched values),
   so it is safe to log for telemetry without re-leaking the PII it removed.
   ============================================================ */

/** The categories of personal data this helper detects. */
export type PiiKind =
  | 'email'
  | 'phone'
  | 'postcode'
  | 'address'
  | 'nino'
  | 'name'
  | 'vrm';

/** Per-kind redaction count (values are NEVER retained — safe to log). */
export interface PiiRedaction {
  kind: PiiKind;
  count: number;
}

export interface ScrubResult {
  /** The input with detected PII replaced by typed placeholders. */
  text: string;
  /** One entry per kind that matched at least once (count > 0). */
  redactions: PiiRedaction[];
  /** Total number of substitutions made across all kinds. */
  totalRedactions: number;
}

export interface ScrubOptions {
  /**
   * Redact UK vehicle registrations. DEFAULT false — a VRM is vehicle-identity
   * (the domain key), not claimant PII. Enable only where the registration is
   * being used as a person's identifier.
   */
  redactVrm?: boolean;
  /**
   * Redact title-anchored names (Mr/Mrs/Ms/Miss/Dr/Prof + Name). DEFAULT true.
   * Free-standing names are NOT attempted (needs NLP) — see limitations.
   */
  redactNames?: boolean;
  /** Override the default placeholder string for one or more kinds. */
  placeholders?: Partial<Record<PiiKind, string>>;
}

/** Default typed placeholders. Bracketed + upper-case so a model can still see
 *  that "a person / a number / a place" was present without the value. */
export const DEFAULT_PLACEHOLDERS: Record<PiiKind, string> = {
  email: '[EMAIL]',
  phone: '[PHONE]',
  postcode: '[POSTCODE]',
  address: '[ADDRESS]',
  nino: '[NINO]',
  name: '[NAME]',
  vrm: '[VRM]',
};

/* ----------  Detection patterns (UK-context, high-precision)  ---------- */
//
// Each is `g`-flagged so a single pass counts + replaces all occurrences. The
// `(?<![\w])` / `(?![\w])` boundaries keep matches from biting into adjacent
// identifiers (Case/PO codes, longer digit runs, etc.).

// Email — standard local@domain.tld.
const EMAIL_RE = /(?<![\w])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![\w])/g;

// UK National Insurance number — 2 prefix letters, 6 digits, 1 suffix letter
// (A–D). Tolerant of internal spacing. Excludes the letters NINOs never use.
const NINO_RE =
  /(?<![\w])[ABCEGHJ-PRSTW-Z][ABCEGHJ-NPRSTW-Z][\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?[A-D](?![\w])/gi;

// UK street-address line — house number + 1–4 capitalised words + a street-type
// suffix. High precision; anchored on the suffix so it won't grab prose.
const ADDRESS_RE =
  /(?<![\w])\d{1,4}[A-Za-z]?[\s,]+(?:[A-Z][A-Za-z'-]+[\s,]+){1,4}(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Drive|Dr|Close|Cl|Way|Court|Ct|Crescent|Cres|Place|Pl|Terrace|Gardens|Grove|Grv|Walk|Row|Hill|Park)\b\.?/g;

// UK postcode — e.g. "M1 4WB", "SW1A 1AA", "GIR 0AA".
const POSTCODE_RE =
  /(?<![\w])(?:[A-Z]{1,2}\d[A-Z\d]?|GIR)[\s-]?\d[A-Z]{2}(?![\w])/gi;

// UK phone — leading +44 or 0, then 9–10 further digits with loose separators
// (spaces, hyphens, parens). Requires the country/trunk prefix so it won't grab
// VRMs (letters) or short reference numbers.
const PHONE_RE =
  /(?<![\w])(?:\+44[\s-]?\(?0?\)?|\(?0)(?:[\s\-()]{0,2}\d){9,10}(?![\w])/g;

// Title-anchored name — Mr/Mrs/Ms/Miss/Dr/Prof + 1–3 capitalised words or
// single-letter initials (e.g. "Dr A Patel", "Mr John Smith").
const NAME_RE =
  /(?<![\w])(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+[A-Z](?:[A-Za-z'-]+|\.)?(?:\s+[A-Z](?:[A-Za-z'-]+|\.)?){0,2}/g;

// UK vehicle registration — current (AA00 AAA), prefix (A000 AAA) and suffix (AAA 000A)
// formats, so the opt-in scrub matches the same plate shapes the live intake sniffer does
// (the orchestration UK_VRM_RE). Opt-in only. A single canonical matcher shared with
// orchestration would beat this parallel copy — see Known limitations / docs follow-up.
const VRM_RE =
  /(?<![\w])(?:[A-Z]{2}\d{2}[\s-]?[A-Z]{3}|[A-Z]\d{1,3}[\s-]?[A-Z]{3}|[A-Z]{3}[\s-]?\d{1,3}[A-Z])(?![\w])/gi;

/* ----------  Known limitations (the precision/recall note referenced above)  ----------
 * Pattern matching cannot resolve genuine ambiguity; these tradeoffs are accepted:
 *   - PHONE over-match: a bare-0 numeric run of UK-phone length (e.g. a 10–11 digit
 *     claim/policy reference like "0123456789") is structurally identical to a UK
 *     landline/mobile and IS redacted to [PHONE]. Erring toward redaction is the safe
 *     default for a PII pre-scrub, but it can clip a non-phone reference.
 *   - NAME over-match: the title-anchored rule (Mr/Mrs/Ms/Miss/Dr/Prof + Capitalised
 *     word) also fires on title+common-noun/brand collisions ("Dr Martens", "Ms Excel").
 *     Excluding those reliably needs NER, which is out of scope.
 *   - Free-standing names and unanchored addresses are NOT detected (need NLP).
 * A caller that cannot tolerate over-redaction should treat the scrub as advisory.
 */

/* ----------  Engine  ---------- */

/**
 * One ordered detection rule. Order matters: emails are removed before phones
 * (an email's digits must not be read as a number), structured ids (NINO,
 * address, postcode) before the looser phone rule, and the opt-in VRM last.
 */
interface Rule {
  kind: PiiKind;
  re: RegExp;
  enabled: (opts: Required<Pick<ScrubOptions, 'redactVrm' | 'redactNames'>>) => boolean;
}

const RULES: Rule[] = [
  { kind: 'email', re: EMAIL_RE, enabled: () => true },
  { kind: 'nino', re: NINO_RE, enabled: () => true },
  { kind: 'address', re: ADDRESS_RE, enabled: () => true },
  { kind: 'postcode', re: POSTCODE_RE, enabled: () => true },
  { kind: 'phone', re: PHONE_RE, enabled: () => true },
  { kind: 'name', re: NAME_RE, enabled: (o) => o.redactNames },
  { kind: 'vrm', re: VRM_RE, enabled: (o) => o.redactVrm },
];

/**
 * Redact obvious UK-context PII from free text, returning the scrubbed text plus
 * a value-free summary of what was removed.
 */
export function scrubPii(input: string, opts: ScrubOptions = {}): ScrubResult {
  const cfg = {
    redactVrm: opts.redactVrm ?? false,
    redactNames: opts.redactNames ?? true,
  };
  const placeholderFor = (kind: PiiKind): string =>
    opts.placeholders?.[kind] ?? DEFAULT_PLACEHOLDERS[kind];

  if (typeof input !== 'string' || input.length === 0) {
    // Coerce ANY non-string (number, object, null, undefined) to '' — never return a
    // non-string `text`: a downstream `.toLowerCase()` or AI call would break, and an
    // un-stringified value could bypass scrubbing entirely. An empty string returns as-is.
    return { text: typeof input === 'string' ? input : '', redactions: [], totalRedactions: 0 };
  }

  let text = input;
  const redactions: PiiRedaction[] = [];

  for (const rule of RULES) {
    if (!rule.enabled(cfg)) continue;
    let count = 0;
    const placeholder = placeholderFor(rule.kind);
    // Reset lastIndex defensively (module-level RegExp objects are reused).
    rule.re.lastIndex = 0;
    text = text.replace(rule.re, () => {
      count += 1;
      return placeholder;
    });
    if (count > 0) redactions.push({ kind: rule.kind, count });
  }

  const totalRedactions = redactions.reduce((sum, r) => sum + r.count, 0);
  return { text, redactions, totalRedactions };
}

/** Convenience wrapper returning only the scrubbed text. */
export function scrubPiiText(input: string, opts: ScrubOptions = {}): string {
  return scrubPii(input, opts).text;
}

/** True if any PII was detected (without exposing the values). */
export function containsPii(input: string, opts: ScrubOptions = {}): boolean {
  return scrubPii(input, opts).totalRedactions > 0;
}
