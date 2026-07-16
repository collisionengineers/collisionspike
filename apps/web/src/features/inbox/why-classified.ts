/* ============================================================
   why-classified — PURE mapping from the sorting engine's raw signal tokens
   (rules-engine-v2 Phase 5) to short, HANDLER-LANGUAGE "why this label"
   reasons. No React — Inbox.tsx renders whatever `whyClassifiedReasons`
   returns, verbatim, in the classification cell's tooltip and the email
   preview panel.

   AGENTS.md hard rule — no engineering/process/meta language ever renders:
   "signals" / "rule" / "classifier" / "gated" (and a raw token like
   "work_keywords:please inspect") must NEVER reach the screen. This module is
   the ONE place that peels a raw token into plain English; anything this
   module does not recognise is DROPPED — never shown verbatim, never
   half-translated. See docs/reviews/010726/decisions.md D14/D16.

   Token vocabulary covered — both read the same way to a handler, so both
   map to the same phrase:
     - the vendored engine's current signal format
       (services/functions/parser/cedocumentmapper_v2/rules/email_classifier.py, e.g.
       `work_keywords:please inspect`, `provider_match_state:one`,
       `rule:instruction_doc_existing_provider`), and
     - a couple of alternate/shorthand spellings already present in the app's
       demo fixtures (`attachment:instruction`, `provider:one`).

   Every "quoted phrase" shown is one of the engine's own small, pre-vetted
   keyword tuples (e.g. "please inspect", "provide the invoice") — plain
   English the engine matched in the email, never arbitrary free text — so
   quoting it back is always safe.
   ============================================================ */

/** Cap: only the most decision-relevant reasons are worth a handler's time —
 *  more than a handful reads as noise, not an explanation. */
const MAX_REASONS = 4;

/** Attachment kinds that read as "instruction paperwork" (mirrors the
 *  engine's own `_INSTRUCTION_KINDS`). */
const INSTRUCTION_ATTACHMENT_KINDS = new Set(['instruction', 'instruction_doc', 'claim_form']);

/** The value after a token's FIRST colon, trimmed; "" when there is none. */
function valueOf(token: string): string {
  const i = token.indexOf(':');
  return i === -1 ? '' : token.slice(i + 1).trim();
}

/** The first comma-separated entry of a colon value — the tooltip/list shows
 *  ONE matched phrase, not the whole list ("the matched phrase", singular);
 *  undefined when the value is blank. */
function firstPhrase(value: string): string | undefined {
  const first = value.split(',')[0]?.trim();
  return first ? first : undefined;
}

/** `base`, with the matched phrase appended in curly quotes when present —
 *  it is one of the engine's own vetted keyword phrases, so it is always
 *  safe (and useful) to show back to the person who wrote the email. */
function withPhrase(base: string, phrase: string | undefined): string {
  return phrase ? `${base} (“${phrase}”)` : base;
}

/** True for an `attachment_kinds:...` token whose comma-joined kinds include
 *  at least one instruction-shaped kind. */
function hasInstructionAttachmentKind(token: string): boolean {
  if (!token.startsWith('attachment_kinds:')) return false;
  return valueOf(token)
    .split(',')
    .map((kind) => kind.trim())
    .some((kind) => INSTRUCTION_ATTACHMENT_KINDS.has(kind));
}

interface WhyMatcher {
  /** True when `token` belongs to this reason category. */
  test(token: string): boolean;
  /** The reason text for a token this matcher accepted. Only ever called
   *  after `test` passed, so it always returns a real, non-empty string. */
  reason(token: string): string;
}

/**
 * PRIORITY ORDER (highest first) — the most decision-relevant reasons win the
 * MAX_REASONS cap. Category-defining signals (what decided the label) rank
 * above corroborating evidence, which ranks above reference values, which
 * ranks above meta signals (reply/auto-reply/summary) and the weakest,
 * most-generic signal (a recognised sender) last.
 */
const MATCHERS: readonly WhyMatcher[] = [
  {
    test: (t) => t.startsWith('cancellation_keywords:') || t.startsWith('cancellation_phrases:'),
    reason: (t) => withPhrase('Says the claim or booking is cancelled', firstPhrase(valueOf(t))),
  },
  {
    test: (t) => t.startsWith('work_keywords:'),
    reason: (t) => withPhrase('Mentions instruction wording', firstPhrase(valueOf(t))),
  },
  {
    test: (t) => t.startsWith('query_keywords:'),
    reason: (t) => withPhrase('Asks about existing work', firstPhrase(valueOf(t))),
  },
  {
    test: (t) => t.startsWith('billing_keywords:') || t.startsWith('billing_phrases:'),
    reason: (t) => withPhrase('Asks about an invoice or fee', firstPhrase(valueOf(t))),
  },
  {
    test: (t) => t.startsWith('chase_keywords:') || t.startsWith('chase_phrases:'),
    reason: (t) => withPhrase('Chases something already underway', firstPhrase(valueOf(t))),
  },
  {
    test: (t) => t === 'report_attachment',
    reason: () => 'Has a report attached',
  },
  {
    test: (t) => t === 'attachment:instruction' || hasInstructionAttachmentKind(t),
    reason: () => 'Has instruction paperwork attached',
  },
  {
    test: (t) => t.startsWith('body_caseref:') && valueOf(t).length > 0,
    reason: (t) => `Quotes case reference ${valueOf(t)}`,
  },
  {
    test: (t) => t.startsWith('body_jobref:') && valueOf(t).length > 0,
    reason: (t) => `Quotes reference ${valueOf(t)}`,
  },
  {
    test: (t) => t.startsWith('body_vrm:') && valueOf(t).length > 0,
    reason: (t) => `Mentions vehicle ${valueOf(t)}`,
  },
  {
    test: (t) => t === 'reply' || t === 'is_reply',
    reason: () => 'Part of an ongoing email conversation',
  },
  {
    test: (t) => t === 'auto_reply' || t.startsWith('auto_reply:'),
    reason: () => 'Looks like an automatic reply',
  },
  {
    test: (t) => t.startsWith('summary_markers:'),
    reason: () => 'Reads like a summary of several cases',
  },
  {
    test: (t) =>
      t === 'provider:one' || t === 'provider:matched' || t.startsWith('provider_match_state:one'),
    reason: () => 'From a company we recognise',
  },
  // Everything else — `rule:*`, `cancellation_negated` (an internal negation
  // guard), `provider:none`/`provider_match_state:none` (nothing positive to
  // say), `digest_multiple_refs:*`, `uncorroborated_*`, `informal_keywords:*`,
  // and any token this module does not recognise — has NO matcher, so it is
  // DROPPED by construction: `whyClassifiedReasons` below only ever emits
  // text a matcher explicitly produced.
];

/**
 * Up to {@link MAX_REASONS} short, plain-English reasons explaining why an
 * inbound email was sorted the way it was — derived from its raw signal
 * tokens, walked in the PRIORITY ORDER above (one reason per category; the
 * first matching token wins that category). Unrecognised tokens are silently
 * dropped. `signals` may be absent/empty (older rows, or a row with nothing
 * to explain) — always returns `[]` rather than throwing.
 */
export function whyClassifiedReasons(signals: readonly string[] | null | undefined): string[] {
  if (!signals || signals.length === 0) return [];
  const reasons: string[] = [];
  for (const matcher of MATCHERS) {
    if (reasons.length >= MAX_REASONS) break;
    const token = signals.find((t) => matcher.test(t));
    if (token === undefined) continue;
    const reason = matcher.reason(token);
    if (reason && !reasons.includes(reason)) reasons.push(reason);
  }
  return reasons;
}
