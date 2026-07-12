import { describe, it, expect } from 'vitest';
import {
  statusForReviewCase,
  missingRequiredFieldKeys,
  hasOpenReviewIssues,
  type ReviewableField,
  type FieldReviewState,
  type StatusEvaluationInput,
} from './case-status';
import {
  evaluateEvaImageRules,
  type ImageRole,
  type ImageRuleEvidence,
} from './image-rules';
import { EVA_FIELD_ORDER, type EvaFieldKey } from './eva-export';
// Load the SAME shared fixture file the Python drift gate consumes
// (functions/evavalidation/tests/test_parity.py). resolveJsonModule is on and
// Vitest/Vite resolve this out-of-src JSON at runtime (the case-status choice-set
// parity test imports out-of-src JSON the same way). Importing the ONE file is
// the whole point: neither implementation can drift without a test going red.
import parityData from '../../../../functions/evavalidation/tests/parity_fixtures.json';

/* ============================================================
   TS <-> Python EVA-readiness PARITY gate — the TypeScript half of the drift
   gate described in functions/evavalidation/tests/test_parity.py.

   The Python side feeds each fixture's `case` + `evidence` through
   validation.validate_case and asserts the fixture's `expected`
   { fieldsValid, imagesValid, openIssueKinds, derivedStatus }. THIS file feeds
   the SAME fixtures through the CANONICAL TypeScript contracts that
   validation.py was ported from — image-rules.ts (evaluateEvaImageRules) and
   case-status.ts (missingRequiredFieldKeys / hasOpenReviewIssues /
   statusForReviewCase) — and asserts the IDENTICAL `expected`. Because both
   sides read one fixture file with one `expected` per case, neither the Code
   App readiness path nor the Function's port can drift silently: a mismatch on
   either side turns a build red.

   The fixtures are authored in the canonical snake_case CONTRACT shape and a
   raw Dataverse `cr1bd_*` shape (with int choice values). The TS contracts key
   on camelCase EvaFieldKey + STRING image/review enums, so this file applies
   the SAME normalization validation.py applies internally (case-insensitive
   key lookup, snake->camel via EVA_FIELD_ORDER, Dataverse-column + int-choice
   coercion) — it is a normalizer onto the TS types, NOT a second readiness
   implementation. The readiness verdict still comes wholly from the contracts.
   ============================================================ */

/* ----------  Fixture shape (mirrors parity_fixtures.json)  ---------- */
interface ParityExpected {
  fieldsValid: boolean;
  imagesValid: boolean;
  openIssueKinds: string[];
  derivedStatus: string;
}
interface ParityFixture {
  name: string;
  shape: 'contract' | 'dataverse';
  case: Record<string, unknown>;
  evidence: Record<string, unknown>[];
  expected: ParityExpected;
}
interface ParityData {
  requiredFieldKeys: string[];
  fixtures: ParityFixture[];
}
const DATA = parityData as unknown as ParityData;
const FIXTURES = DATA.fixtures;

/* The Dataverse Case column for a field is `cr1bd_eva` + its snake_case payload
   key with underscores removed (mirrors validation.py _FIELD_TO_COLUMN); derived
   inline per field from EVA_FIELD_ORDER below so it cannot drift from the contract. */

/* ----------  Dataverse int choice values (mirror the global choice sets +
   validation.py constants). Used to coerce the `dataverse`-shape fixtures back
   to the TS string enums. */
const EVIDENCE_KIND_IMAGE = 100000000; // evidence-kind.json image
const ROLE_INT_TO_STRING: Record<number, ImageRole> = {
  100000000: 'overview',
  100000001: 'damage_closeup',
  100000002: 'additional',
  100000003: 'unknown',
};
const REVIEW_INT_TO_STRING: Record<number, FieldReviewState> = {
  100000000: 'not_required',
  100000001: 'needs_review',
  100000002: 'reviewed',
  100000003: 'conflict',
};

/** Case-insensitive first-hit lookup over a plain object (mirror _ci_lookup). */
function ciLookup(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  const lowered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) lowered[k.toLowerCase()] = v;
  for (const k of keys) {
    const lk = k.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(lowered, lk)) return lowered[lk];
  }
  return undefined;
}

/** The dict actually holding the EVA fields: the `fields` sub-object if present
    (Code App wrapped shape), else the case itself (mirror _fields_container). */
function fieldsContainer(c: Record<string, unknown>): Record<string, unknown> {
  const nested = ciLookup(c, 'fields');
  return nested && typeof nested === 'object'
    ? (nested as Record<string, unknown>)
    : c;
}

/** Coerce a review-state cell (string name OR int choice value) to the TS union,
    or undefined when absent/unrecognized (mirror _coerce_review_state). */
function coerceReviewState(v: unknown): FieldReviewState | undefined {
  if (typeof v === 'boolean') return undefined; // guard: never a choice value
  if (typeof v === 'number') return REVIEW_INT_TO_STRING[v];
  if (typeof v === 'string') {
    const n = v.trim().toLowerCase() as FieldReviewState;
    return n in REVIEW_INT_TO_STRING ||
      ['not_required', 'needs_review', 'reviewed', 'conflict'].includes(n)
      ? n
      : undefined;
  }
  return undefined;
}

/**
 * Normalize ONE fixture `case` (any of the accepted shapes: flat snake_case,
 * Dataverse `cr1bd_*` columns of any casing, embedded {value, reviewState},
 * `fields`-wrapped, or an explicit `reviewStates` map) into the camelCase
 * `Record<EvaFieldKey, ReviewableField>` the TS contracts consume. Mirrors how
 * validation.py reads the value (_field_value) and the review state
 * (_review_states) for each of the 12 fields.
 */
function toEvaFields(
  c: Record<string, unknown>,
): Record<EvaFieldKey, ReviewableField> {
  const fields = fieldsContainer(c);
  const explicitStates = ciLookup(c, 'reviewStates');
  const hasExplicitStates =
    explicitStates !== null &&
    typeof explicitStates === 'object' &&
    !Array.isArray(explicitStates);

  const out = {} as Record<EvaFieldKey, ReviewableField>;
  for (const desc of EVA_FIELD_ORDER) {
    const snake = desc.payloadKey;
    const camel = desc.key;
    const column = `cr1bd_eva${snake.replace(/_/g, '')}`;

    // VALUE — tolerate snake_case key, Dataverse column (any casing), camelCase,
    // and an embedded {value,...} sub-object.
    let raw = ciLookup(fields, snake, column, camel);
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      raw = ciLookup(raw as Record<string, unknown>, 'value');
    }
    const value = raw === null || raw === undefined ? '' : String(raw);

    // REVIEW STATE — explicit `reviewStates` map wins; else an embedded
    // {reviewState} on the field cell; else default 'reviewed' (a present,
    // non-flagged value is treated as resolved, matching the Python absent =>
    // no-open-issue semantics for the gate).
    let reviewState: FieldReviewState = 'reviewed';
    if (hasExplicitStates) {
      const s = coerceReviewState(
        ciLookup(explicitStates as Record<string, unknown>, snake, camel),
      );
      if (s) reviewState = s;
    } else {
      const cell = ciLookup(fields, snake, column, camel);
      if (cell !== null && typeof cell === 'object' && !Array.isArray(cell)) {
        const s = coerceReviewState(
          ciLookup(cell as Record<string, unknown>, 'reviewState'),
        );
        if (s) reviewState = s;
      }
    }

    out[camel] = { value, reviewState };
  }
  return out;
}

/** Normalize ONE fixture evidence row into an ImageRuleEvidence (string enums),
    accepting the contract shape and the Dataverse `cr1bd_*` int-choice shape of
    any casing (mirror validation.py _is_accepted_image / role / reg reads). */
function toEvidence(rows: Record<string, unknown>[]): ImageRuleEvidence[] {
  return rows.map((ev) => {
    const kindRaw = ciLookup(ev, 'kind', 'cr1bd_kind');
    const kind =
      kindRaw === EVIDENCE_KIND_IMAGE
        ? 'image'
        : typeof kindRaw === 'string'
          ? kindRaw
          : String(kindRaw ?? '');

    const roleRaw = ciLookup(ev, 'imageRole', 'cr1bd_imagerole');
    const imageRole: ImageRole =
      typeof roleRaw === 'number'
        ? (ROLE_INT_TO_STRING[roleRaw] ?? 'unknown')
        : ((roleRaw as ImageRole) ?? 'unknown');

    return {
      kind,
      imageRole,
      registrationVisible: Boolean(
        ciLookup(ev, 'registrationVisible', 'cr1bd_registrationvisible'),
      ),
      acceptedForEva: Boolean(
        ciLookup(ev, 'acceptedForEva', 'cr1bd_acceptedforeva'),
      ),
      excluded: Boolean(ciLookup(ev, 'excluded', 'cr1bd_excluded')),
    };
  });
}

/* ----------  Map TS contract outputs -> the shared `openIssueKinds` SET  ----------
   Same categories the Python `_issue_kind` derives from validate_case's
   openIssues strings, but here mapped from the STRUCTURED TS results (image-rule
   `code`s + the missing-field / needs-review checks) — so the comparison is on
   stable kinds, not message wording. */
function openIssueKinds(
  evaFields: Record<EvaFieldKey, ReviewableField>,
  evidence: ImageRuleEvidence[],
): Set<string> {
  const kinds = new Set<string>();
  if (missingRequiredFieldKeys(evaFields).length > 0) kinds.add('missing_field');
  for (const f of evaluateEvaImageRules(evidence).failures) {
    if (f.code === 'min_count') kinds.add('image_min_count');
    else if (f.code === 'missing_overview') kinds.add('image_missing_overview');
    else if (f.code === 'missing_damage_closeup')
      kinds.add('image_missing_closeup');
  }
  if (hasOpenReviewIssues(evaFields)) kinds.add('needs_review');
  return kinds;
}

/* ----------  derivedStatus precedence (mirror Python `_derived_status`)  ----------
   The shared `expected.derivedStatus` is defined by the parity harness's
   load-bearing guard PRECEDENCE (case-status.ts statusForReviewCase order, with
   terminal-lock upstream of this Function):
       missing_required_fields > missing_images > needs_review > ready_for_eva.
   We reproduce it from the TS-computed fields/images/needs_review, exactly as
   test_parity.py reproduces it from validate_case's result — this is the verdict
   under comparison, NOT the full FIX-3 evidence-aware tree (which, for an
   evidence-LESS field-incomplete case, returns `needs_review` rather than
   `missing_required_fields`; that divergence is intentional and out of scope of
   THIS shared gate). statusForReviewCase is still exercised below where its tree
   agrees with the precedence (it must, for every non-evidence-less fixture). */
function derivedStatus(
  fieldsValid: boolean,
  imagesValid: boolean,
  kinds: Set<string>,
): string {
  if (!fieldsValid) return 'missing_required_fields';
  if (!imagesValid) return 'missing_images';
  if (kinds.has('needs_review')) return 'needs_review';
  return 'ready_for_eva';
}

/* ============================================================
   Tests
   ============================================================ */

describe('EVA-readiness TS<->Python parity (shared parity_fixtures.json)', () => {
  it('required-field set matches the contract REQUIRED set (snake_case)', () => {
    // The fixture pins the 7-of-12 required keys (snake_case). The TS authority
    // is EVA_FIELD_ORDER `required:true`. Compare the SAME snake_case set so a
    // change to `required` on either side fails this gate (mirror the Python
    // test_required_field_set_matches_eva_field_order).
    const contractRequiredSnake = EVA_FIELD_ORDER.filter((d) => d.required).map(
      (d) => d.payloadKey,
    );
    expect([...DATA.requiredFieldKeys].sort()).toEqual(
      [...contractRequiredSnake].sort(),
    );
    // ...and order-exact, since the fixture authored them in contract order.
    expect(DATA.requiredFieldKeys).toEqual(contractRequiredSnake);
  });

  it('fixture names are unique', () => {
    const names = FIXTURES.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('fixture set is non-trivial and exercises every guard branch', () => {
    // Guard against an accidentally-emptied fixture file silently passing the
    // gate (mirror the Python test_fixture_set_is_non_trivial).
    expect(FIXTURES.length).toBeGreaterThanOrEqual(15);
    const statuses = new Set(FIXTURES.map((f) => f.expected.derivedStatus));
    for (const s of [
      'ready_for_eva',
      'missing_required_fields',
      'missing_images',
      'needs_review',
    ]) {
      expect(statuses.has(s), `fixtures must exercise ${s}`).toBe(true);
    }
  });

  describe('each fixture yields the shared expected verdict via the TS contracts', () => {
    for (const fx of FIXTURES) {
      it(`${fx.name} (${fx.shape})`, () => {
        const evaFields = toEvaFields(fx.case);
        const evidence = toEvidence(fx.evidence);

        const fieldsValid = missingRequiredFieldKeys(evaFields).length === 0;
        const imagesValid = evaluateEvaImageRules(evidence).ok;
        const kinds = openIssueKinds(evaFields, evidence);

        expect(fieldsValid, `${fx.name}: fieldsValid`).toBe(
          fx.expected.fieldsValid,
        );
        expect(imagesValid, `${fx.name}: imagesValid`).toBe(
          fx.expected.imagesValid,
        );
        expect([...kinds].sort(), `${fx.name}: openIssueKinds`).toEqual(
          [...fx.expected.openIssueKinds].sort(),
        );
        expect(
          derivedStatus(fieldsValid, imagesValid, kinds),
          `${fx.name}: derivedStatus`,
        ).toEqual(fx.expected.derivedStatus);
      });
    }
  });

  describe('statusForReviewCase tracks the shared derivedStatus, modulo the evidence-less pending refinement', () => {
    // The canonical guard now consumes the same review-state rung as the parity
    // evaluator. Its sole deliberate status refinement is evidence-less pending:
    // no accepted images + no instructions remains needs_review rather than
    // prematurely becoming missing_required_fields.
    for (const fx of FIXTURES) {
      it(`${fx.name}`, () => {
        const evaFields = toEvaFields(fx.case);
        const evidence = toEvidence(fx.evidence);
        const input: StatusEvaluationInput = {
          status: 'needs_review', // non-terminal entry status (terminal-lock untested here)
          evaFields,
          evidence,
          // The legacy parity corpus predates explicit inspection decisions.
          // Give every non-empty fixture address its matching saved choice so
          // this gate remains focused on TS/Python field/image/review parity.
          inspectionDecision:
            evaFields.inspectionAddress.value.trim() === 'Image Based Assessment'
              ? 'image_based'
              : 'confirmed_physical',
        };
        const actual = statusForReviewCase(input);

        const acceptedImages = evidence.filter(
          (e) => e.kind === 'image' && e.acceptedForEva && e.excluded !== true,
        ).length;
        const instructionCount = evidence.filter(
          (e) => e.kind === 'instruction',
        ).length;

        // Evidence-less + field-incomplete -> held pending (needs_review).
        if (
          !fx.expected.fieldsValid &&
          !fx.expected.imagesValid &&
          acceptedImages === 0 &&
          instructionCount === 0
        ) {
          expect(actual).toBe('needs_review');
          return;
        }

        expect(actual).toBe(fx.expected.derivedStatus);
      });
    }
  });
});
