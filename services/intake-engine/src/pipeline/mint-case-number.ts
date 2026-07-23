/* ============================================================
   intake-engine — Stage 3: Case/PO number ALLOCATION CONTRACT.

   This package has NO DB access — nothing here talks to a live sequence counter.
   `mintCaseNumber` defines the CONTRACT a real allocator (elsewhere, with DB access)
   must honour: which counter a given principal+year+emailType shares, and which
   literal prefix marks the resulting case number. `formatCaseNumber` is the pure
   string formatter for a sequence number the real allocator hands back.

   TWO DELIBERATE, CONFIRMED BEHAVIORAL DECISIONS — both are real deviations from a
   "typical" per-marker-scoped counter design; do not "fix" either without
   re-confirming, they are not oversights:

     1. SHARED COUNTER. `sequenceScopeKey` is `${principalCode}${year}` — it does NOT
        fold the emailType/marker/prefix into the key. Standard ('1a'), audit
        ('1b_audit_repairable' / '1b_audit_total_loss'), and inspection+audit ('1c')
        cases for the SAME principal+year all share ONE counter. A more typical design
        would scope the counter per marker too (e.g. "QDOS26" and "a.QDOS26" as two
        separate counters) — that is explicitly NOT what happens here.

     2. LOWERCASE PREFIXES. Prefixes are the literal strings 'a.' and 'ap.'
        (lower-case) — not 'A.'/'AP.' — even though the principal-code segment of the
        formatted case number is upper-case. This is also a deliberate, confirmed
        choice, not an inconsistency to "correct".

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No DB, no I/O.
   ============================================================ */

export type EmailTypeForCaseNumber =
  | '1a_standard'
  | '1b_audit_repairable'
  | '1b_audit_total_loss'
  | '1c_inspection_and_audit';

export type CasePrefix = '' | 'a.' | 'ap.';

export interface MintCaseNumberInput {
  principalCode: string;
  /** Whatever year token the caller has already resolved (e.g. "26" for 2026). This
   * package does no calendar/timezone logic — the caller supplies the token as-is. */
  year: string;
  emailType: EmailTypeForCaseNumber;
}

export interface MintCaseNumberResult {
  /** Shared counter key — see "SHARED COUNTER" above. Identical for every emailType
   * at a given principal+year; only `prefix` differs. */
  sequenceScopeKey: string;
  prefix: CasePrefix;
}

/** '1a_standard' carries no marker prefix. '1b_audit_repairable' carries 'a.' (audit,
 * repairable) and '1b_audit_total_loss' carries 'ap.' (audit, total loss) — these are
 * the two distinct audit-verdict prefixes, per spec. '1c_inspection_and_audit' ALSO
 * carries no prefix: the repairable/total-loss verdict for a self-audited report
 * isn't known until the engineer completes it, so a 1c case follows the standard
 * (unmarked) Case/PO process — the audit deliverable's own folder is a manual,
 * out-of-system step the engineer takes after the fact. Do not "even out" this
 * mapping to give 1c a prefix; that would contradict the spec. */
const PREFIX_BY_EMAIL_TYPE: Record<EmailTypeForCaseNumber, CasePrefix> = {
  '1a_standard': '',
  '1b_audit_repairable': 'a.',
  '1b_audit_total_loss': 'ap.',
  '1c_inspection_and_audit': '',
};

export function mintCaseNumber(input: MintCaseNumberInput): MintCaseNumberResult {
  return {
    sequenceScopeKey: `${input.principalCode}${input.year}`,
    prefix: PREFIX_BY_EMAIL_TYPE[input.emailType],
  };
}

/**
 * Pure formatter: principalCode + year + zero-padded (3-digit) sequence + prefix ->
 * the case-number string, e.g. formatCaseNumber('QDOS', '26', 1, '') -> 'QDOS26001',
 * formatCaseNumber('QDOS', '26', 1, 'a.') -> 'a.QDOS26001',
 * formatCaseNumber('QDOS', '26', 1, 'ap.') -> 'ap.QDOS26001'.
 */
export function formatCaseNumber(principalCode: string, year: string, sequence: number, prefix: CasePrefix): string {
  const padded = String(sequence).padStart(3, '0');
  return `${prefix}${principalCode}${year}${padded}`;
}
