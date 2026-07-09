/**
 * api/src/lib/generate-inputs.ts — TKT-132: assemble the WIDENED generate-suggestions input.
 *
 * Before TKT-132 the generate route (`POST /api/cases/{id}/ai-suggestions/generate`) built its
 * prompt from accident circumstances + claimant address only — empty on most intake cases, so
 * generate honestly returned 'no_input' for most of the live corpus (D1 batch 2026-07-09: prompt
 * tokens constant 381 across cases). This module widens the assembly to every REAL input the DB
 * holds for a case, as clearly-labelled sections:
 *
 *   1. accident circumstances        case_.eva_accident_circumstances       (pre-existing class)
 *   2. claimant address              case_.eva_claimant_address             (pre-existing class)
 *   3. instruction email text        linked inbound_email subject + body_preview  (NEW — the
 *      "parsed instruction text" source: there is no separate parse-output text column; the
 *      html-stripped body_preview of the case-linked inbound email IS the instruction text)
 *   4. case overview facts           case_po / eva_work_provider / ov_claim_type /
 *                                    ov_insurer_name / ov_repairer_name / eva_date_of_loss /
 *                                    eva_date_of_instruction                (NEW)
 *   5. vehicle                       eva_vehicle_model / eva_mileage(+unit) (NEW; VRM stays on
 *                                    the caller's own prompt line, unchanged)
 *   6. photo analysis                aggregate facts from the evidence image stamps —
 *                                    image_role / registration_visible / excluded /
 *                                    person_reflection counts               (NEW; counts only,
 *                                    never image content)
 *
 * PII: every free-text value goes through @cs/domain scrubPii BEFORE assembly, with
 * `redactVrm: false` — the VRM is the domain key the model must see (same rationale as the
 * pre-TKT-132 route). Structured facts are scrubbed too (cheap belt-and-braces).
 *
 * SIZE: each section body is capped at SECTION_CHAR_CAP and the assembled whole at
 * TOTAL_INPUT_CHAR_CAP; truncation keeps the HEAD and marks the cut with TRUNCATION_MARKER.
 *
 * HONESTY: `hasInput` is true only when at least one section rendered — a case with nothing but
 * a VRM still takes the route's 'no_input' fast path (no model call, no cost).
 *
 * PURE + DETERMINISTIC — no I/O, no env. The route does the DB reads and hands rows in.
 */

import { scrubPii } from '@cs/domain';

/** Per-section body cap (chars, post-scrub). */
export const SECTION_CHAR_CAP = 2000;
/** Cap on the whole assembled user-prompt body (chars). */
export const TOTAL_INPUT_CHAR_CAP = 6000;
/** Head-truncation marker appended where a cap cut text. */
export const TRUNCATION_MARKER = '…';

/** The widened case_ columns the route SELECTs (snake_case, as node-postgres returns them). */
export interface GenerateCaseRow {
  vrm?: unknown;
  case_po?: unknown;
  eva_accident_circumstances?: unknown;
  eva_claimant_address?: unknown;
  eva_work_provider?: unknown;
  eva_vehicle_model?: unknown;
  eva_date_of_loss?: unknown;
  eva_date_of_instruction?: unknown;
  eva_mileage?: unknown;
  eva_mileage_unit?: unknown;
  ov_claim_type?: unknown;
  ov_insurer_name?: unknown;
  ov_repairer_name?: unknown;
}

/** One case-linked inbound email (the instruction-text source). */
export interface InstructionEmailInput {
  subject?: string | null;
  bodyPreview?: string | null;
}

/** One image-evidence stamp row (decoded role name; the TKT-064 classifier's outputs). */
export interface ImageFactInput {
  role?: string | null; // 'overview' | 'damage_closeup' | ... | 'unknown'
  registrationVisible?: boolean | null;
  excluded?: boolean;
  personReflection?: boolean;
}

export interface GenerateExtras {
  instructionEmails?: InstructionEmailInput[];
  images?: ImageFactInput[];
}

export interface GenerateInputs {
  /** The assembled, scrubbed, capped user-prompt body ('' when hasInput is false). */
  text: string;
  /** False when NONE of the widened inputs is present → the route's honest 'no_input'. */
  hasInput: boolean;
  /** Names of the sections that rendered — value-free, safe for telemetry. */
  sections: string[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Scrub a free-text value (VRM kept — domain key; same option as the pre-TKT-132 route). */
const scrubbed = (v: unknown): string => {
  const s = str(v);
  return s ? scrubPii(s, { redactVrm: false }).text.trim() : '';
};

/** Head-truncate to `max` chars, marking the cut with TRUNCATION_MARKER. */
export function capText(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - TRUNCATION_MARKER.length)) + TRUNCATION_MARKER;
}

/**
 * Assemble the widened generate input from the case row + extras. Pure; every free-text value is
 * scrubbed, every section capped, the whole capped again.
 */
export function buildGenerateInputs(
  caseRow: GenerateCaseRow,
  extras: GenerateExtras = {},
): GenerateInputs {
  const sections: Array<{ name: string; text: string }> = [];
  const section = (name: string, label: string, body: string): void => {
    if (body) sections.push({ name, text: `${label}\n${capText(body, SECTION_CHAR_CAP)}` });
  };

  // 1 — accident circumstances (pre-existing input class).
  section('circumstances', 'Accident circumstances:', scrubbed(caseRow.eva_accident_circumstances));

  // 2 — claimant address (pre-existing input class; a geolocation clue, heavily scrubbed).
  section('claimant_address', 'Claimant address (personal details removed):', scrubbed(caseRow.eva_claimant_address));

  // 3 — instruction email text (NEW): subject + html-stripped body preview of the case-linked
  //     inbound email(s) — the closest thing the DB holds to "the parsed instruction text".
  const emailBits: string[] = [];
  for (const e of extras.instructionEmails ?? []) {
    const subject = scrubbed(e.subject);
    const body = scrubbed(e.bodyPreview);
    if (!subject && !body) continue;
    emailBits.push([subject ? `Subject: ${subject}` : '', body].filter(Boolean).join('\n'));
  }
  section('instruction_email', 'Instruction email text (personal details removed):', emailBits.join('\n---\n'));

  // 4 — case overview facts (NEW): short structured values; personal-name ov_* columns
  //     (insured/claimant/third-party) and claim/policy references are DELIBERATELY excluded —
  //     they add DPIA surface without helping a damage assessment.
  const facts: string[] = [];
  const fact = (label: string, v: unknown): void => {
    const s = scrubbed(v);
    if (s) facts.push(`- ${label}: ${s}`);
  };
  fact('Case reference', caseRow.case_po);
  fact('Work provider', caseRow.eva_work_provider);
  fact('Claim type', caseRow.ov_claim_type);
  fact('Insurer', caseRow.ov_insurer_name);
  fact('Repairer', caseRow.ov_repairer_name);
  fact('Date of loss', caseRow.eva_date_of_loss);
  fact('Date of instruction', caseRow.eva_date_of_instruction);
  section('overview', 'Case overview facts:', facts.join('\n'));

  // 5 — vehicle data (NEW). The VRM itself stays on the caller's dedicated prompt line.
  const veh: string[] = [];
  const model = scrubbed(caseRow.eva_vehicle_model);
  if (model) veh.push(`- Model: ${model}`);
  const mileage = str(caseRow.eva_mileage);
  if (mileage) {
    const unit = str(caseRow.eva_mileage_unit);
    veh.push(`- Mileage: ${mileage}${unit ? ` ${unit}` : ''}`);
  }
  section('vehicle', 'Vehicle:', veh.join('\n'));

  // 6 — photo analysis (NEW): aggregate facts from the evidence image stamps (counts only —
  //     never image bytes/content; the live TKT-064 classifier + human review own the stamps).
  const images = extras.images ?? [];
  if (images.length > 0) {
    const overviews = images.filter((i) => i.role === 'overview');
    const overviewReg = overviews.filter((i) => i.registrationVisible === true).length;
    const closeups = images.filter((i) => i.role === 'damage_closeup').length;
    const excluded = images.filter((i) => i.excluded === true).length;
    const reflections = images.filter((i) => i.personReflection === true).length;
    const plural = (n: number): string => (n === 1 ? '' : 's');
    const parts = [
      `${images.length} photo${plural(images.length)} on file`,
      `${overviews.length} overview${plural(overviews.length)}${overviewReg > 0 ? ` (${overviewReg} with visible registration)` : ''}`,
      `${closeups} damage close-up${plural(closeups)}`,
    ];
    if (excluded > 0) parts.push(`${excluded} excluded`);
    if (reflections > 0) parts.push(`${reflections} flagged for a person's reflection`);
    section('images', 'Photo analysis:', `${parts.join('; ')}.`);
  }

  let text = sections.map((s) => s.text).join('\n\n');
  if (text.length > TOTAL_INPUT_CHAR_CAP) text = capText(text, TOTAL_INPUT_CHAR_CAP);
  return { text, hasInput: sections.length > 0, sections: sections.map((s) => s.name) };
}
