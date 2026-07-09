/* ============================================================
   Collision Engineers — Case-type taxonomy + Case/PO markers (DOMAIN LOGIC, ADR-0021).

   A case's TYPE is orthogonal to its status. Beyond `standard`, three types exist,
   each carried on the Case/PO as a marker prefix (EVA-side principal codes are the
   lowercase forms — a.pch / ap.qdos / d.pch):

     audit            -> `A.`   a second, independent CE inspection auditing a
                                THIRD-PARTY engineer's original report, vehicle
                                repairable (ADR-0014; e.g. A.PCH261339)
     audit_total_loss -> `AP.`  the same audit work where the vehicle is a total
                                loss (PAV outcome; e.g. AP.QDOS261530). NEVER
                                decided at intake — the real QDOS letters are
                                identical for repairable vs total-loss, so this is
                                a REVIEW-TIME refinement of `audit`.
     diminution       -> `D.`   a Diminution in Value engagement (e.g. D.PCH26190).
                                Review-first until detection is grounded on a real
                                inbound instruction (no D. mint from content alone).

   NUMBERING (operator decisions, 2026-07-03):
     * A STANDALONE marker intake (the PCH pattern — the letter commissions ONLY the
       audit) mints from the MARKER'S OWN per-(marker,principal,year) sequence,
       independent of the standard sequence (evidence: D.PCH26190 seq ~190 vs
       A.PCH261339 seq ~1339).
     * A DUAL "report + audit report" letter (the QDOS template — one letter, both
       deliverables) mints ONE case from the provider's NORMAL sequence with
       case-type `audit`; the audit deliverable's A./AP. ID is DERIVED from that
       same number at review (observed corpus: QDOS261608 / A.QDOS261608).
     * Markers are limited to the PCH + QDOS allowlist below for now. Any other
       provider always mints standard; fired signals surface for review instead.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No I/O, no env, no live calls.
   ============================================================ */

/** The case-type taxonomy (mirrors choice_case_type / case-type.json). Named
 *  CaseWorkType ("the work TYPE", per the choiceset description) because the
 *  model barrel already exports a differently-scoped `CaseType` (queues.ts —
 *  the instructions/images evidence-COMPOSITION of a case). */
export type CaseWorkType = 'standard' | 'audit' | 'audit_total_loss' | 'diminution';

/** Case/PO marker prefix per case-type ('' = unmarked standard number). */
export const CASE_PO_MARKER: Readonly<Record<CaseWorkType, '' | 'A.' | 'AP.' | 'D.'>> = {
  standard: '',
  audit: 'A.',
  audit_total_loss: 'AP.',
  diminution: 'D.',
};

/**
 * Which non-standard case types each principal is KNOWN to send (the marker
 * allowlist). Deliberately a domain constant for the spike (one tested seam, no
 * DDL); the migration path when a third provider needs markers is a
 * `work_provider.case_type_markers` corpus column — see ADR-0021.
 */
export const MARKERED_PRINCIPALS: Readonly<Record<string, readonly CaseWorkType[]>> = {
  PCH: ['audit', 'diminution'],
  QDOS: ['audit', 'audit_total_loss', 'diminution'],
};

/** The case types `principalCode` may carry (empty for non-allowlisted providers). */
export function allowedCaseTypes(principalCode: string | null | undefined): readonly CaseWorkType[] {
  const code = (principalCode ?? '').trim().toUpperCase();
  return MARKERED_PRINCIPALS[code] ?? [];
}

/** Inputs to the intake case-type decision (all optional — absent signals = standard). */
export interface CaseTypeSignals {
  /** The parser envelope's `case_type` field ({value, dual, signals}) when present. */
  parserCaseType?: { value?: string | null; dual?: boolean; signals?: readonly string[] } | null;
  /** The legacy parser `audit` envelope ({value, signals}) — corroboration/fallback. */
  parserAudit?: { value?: boolean; signals?: readonly string[] } | null;
  /** The email classifier's subtype (e.g. 'existing_provider_audit') — corroboration only. */
  classifierSubtype?: string | null;
}

export interface CaseTypeDecision {
  caseType: CaseWorkType;
  /** True when the instruction was the DUAL report+audit template (QDOS pattern). */
  dual: boolean;
  /** The signals behind the decision, for the audit_event / Action Log. */
  signals: readonly string[];
}

/**
 * Decide a new case's type from the intake signals. The parser's document-text
 * decision is PRIMARY (ADR-0014: content-based, high-precision); the classifier
 * subtype is corroboration/fallback only (it reads the email body, which for the
 * real audit corpus often carries no audit wording). `audit_total_loss` is never
 * produced here — it is a review-time refinement (ADR-0021).
 */
export function decideCaseType(signals: CaseTypeSignals): CaseTypeDecision {
  const parserValue = (signals.parserCaseType?.value ?? '').toString().trim();
  const parserSignals = [
    ...(signals.parserCaseType?.signals ?? signals.parserAudit?.signals ?? []),
  ];
  if (parserValue === 'audit' || parserValue === 'audit_total_loss' || parserValue === 'diminution') {
    return {
      caseType: parserValue,
      dual: signals.parserCaseType?.dual === true,
      signals: parserSignals,
    };
  }
  // Legacy envelope shape (a not-yet-redeployed parser): audit boolean only.
  if (signals.parserAudit?.value === true) {
    return { caseType: 'audit', dual: false, signals: parserSignals };
  }
  // Classifier-only corroboration: the email body/subject signalled an audit even though
  // the parsed document did not (e.g. images-only audit follow-up). Still an audit.
  if ((signals.classifierSubtype ?? '') === 'existing_provider_audit') {
    return { caseType: 'audit', dual: false, signals: ['classifier:existing_provider_audit'] };
  }
  return { caseType: 'standard', dual: false, signals: [] };
}

/**
 * The Case/PO marker to MINT for a new case, applying the numbering decisions above:
 * returns '' (mint the provider's normal sequence) unless the case type is markered,
 * the principal is allowlisted for it, AND the instruction was standalone (a DUAL
 * letter keeps the standard number — its audit ID is derived later). Diminution is
 * additionally review-first: its detection is not yet grounded on a real inbound
 * instruction, so no `D.` number is minted from content alone (ADR-0021).
 */
export function markerForMint(
  caseType: CaseWorkType,
  principalCode: string | null | undefined,
  dual: boolean,
): '' | 'A.' | 'AP.' | 'D.' {
  if (caseType === 'standard') return '';
  if (dual) return '';
  if (caseType === 'diminution') return ''; // review-first until grounded
  if (!allowedCaseTypes(principalCode).includes(caseType)) return '';
  return CASE_PO_MARKER[caseType];
}

/** Leading case-type marker prefix on a Case/PO ("A." / "AP." / "D."), if any. */
const LEADING_MARKER_RE = /^(AP|A|D)\./i;

/**
 * The DERIVED marker ID for a case at review time (ADR-0021 / TKT-057): the
 * QDOS dual pattern mints ONE standard number (e.g. PCH26010) and the audit
 * deliverable's ID is DERIVED from it — marker + the same number (AP.PCH26010).
 *
 * Returns:
 *   - the Case/PO UNCHANGED when it already carries a marker (a standalone
 *     A./D. mint IS the marker ID — never double-prefixed);
 *   - marker + Case/PO for a markered case type on an unmarked number;
 *   - undefined when there is no Case/PO yet, or the type carries no marker
 *     ('standard'; markers themselves come from CASE_PO_MARKER).
 *
 * PURE + presentation-only: it never renames the stored case_po — the derived
 * ID is what staff write on the EVA-side audit submission.
 */
export function derivedMarkerCasePo(
  caseType: CaseWorkType | undefined,
  casePo: string | null | undefined,
): string | undefined {
  const po = (casePo ?? '').trim().toUpperCase();
  if (!po) return undefined;
  if (LEADING_MARKER_RE.test(po)) return po; // already a marker ID (standalone mint)
  const marker = CASE_PO_MARKER[caseType ?? 'standard'];
  if (!marker) return undefined;
  return `${marker}${po}`;
}
