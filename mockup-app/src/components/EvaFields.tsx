import {
  Button,
  Dropdown,
  Field,
  Input,
  Option,
  Spinner,
  Textarea,
  Tooltip,
  makeStyles,
  tokens,
  type InputOnChangeData,
} from '@fluentui/react-components';
import { AlertTriangle } from 'lucide-react';
import { ProvenanceBadge } from './ProvenanceBadge';
import { DateField } from './DateField';
import {
  EVA_FIELD_ORDER,
  type EvaField,
  type EvaFieldKey,
  type MileageUnit,
  type VatStatus,
} from '../data';

/* ============================================================
   EvaFields — the shared 12-field EVA review primitives.

   The CaseDetail review grid and the ManualIntake review form both render the
   same editable EVA field rows, the same label/required lookup, and the same
   VAT / mileage-unit option sets. These were copied VERBATIM into both screens
   and had begun to drift; this module is the single source so a relabel or a
   control change applies to both at once.

   - LABEL_FOR             : EvaFieldKey → { label, required }, off EVA_FIELD_ORDER.
   - FIELD_CLUSTERS        : the 12 keys grouped into legible clusters (the full
                             contract grouping; CaseDetail renders all of it,
                             ManualIntake renders a subset and keys the bespoke
                             make/model/mileage/inspection controls itself).
   - VAT_OPTIONS /
     MILEAGE_UNIT_OPTIONS  : the contract enum option lists.
   - EvaFieldRow           : one editable value + provenance row, used by both
                             screens. CaseDetail additionally passes a `rowId`
                             (for deep-link scroll/focus), a `registerRef` (to
                             focus the control), and `onCommit`/`saving`/`saveError`
                             (durable persistence + its state); ManualIntake passes
                             none of those (its fields persist only on case create).

   The two date fields (Date of Incident / Date of Instruction) render a calendar
   picker (DateField) that still stores DD/MM/YYYY strings; VAT / mileage unit
   render a Dropdown; circumstances / inspection address render a Textarea;
   everything else an Input.
   ============================================================ */

const useStyles = makeStyles({
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: tokens.spacingHorizontalM,
    alignItems: 'start',
    paddingBottom: tokens.spacingVerticalM,
  },
  fieldMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalXS,
    paddingTop: '26px',
  },
  saveErrorBtn: { color: 'var(--ce-red)', minWidth: 'auto' },
});

/** EvaFieldKey → { label, required }, derived from the contract descriptor so a
 *  contract relabel (e.g. "Date of Incident") flows through every screen. */
export const LABEL_FOR: Record<EvaFieldKey, { label: string; required: boolean }> =
  Object.fromEntries(
    EVA_FIELD_ORDER.map((d) => [d.key, { label: d.label, required: d.required }]),
  ) as Record<EvaFieldKey, { label: string; required: boolean }>;

/* The 12 EVA fields, grouped into legible clusters (order within a cluster
   preserves the contract order). The union of keys equals EVA_FIELD_ORDER. */
export const FIELD_CLUSTERS: { heading: string; keys: EvaFieldKey[] }[] = [
  { heading: 'Provider & claimant', keys: ['workProvider', 'claimantName', 'claimantTelephone', 'claimantEmail'] },
  { heading: 'Vehicle', keys: ['vehicleModel', 'mileage', 'mileageUnit', 'vatStatus'] },
  { heading: 'Incident', keys: ['accidentCircumstances', 'inspectionAddress'] },
  { heading: 'Dates', keys: ['dateOfLoss', 'dateOfInstruction'] },
];

export const VAT_OPTIONS: VatStatus[] = ['', 'Yes', 'No'];
export const MILEAGE_UNIT_OPTIONS: MileageUnit[] = ['', 'Miles', 'Km'];

export interface EvaFieldRowProps {
  fieldKey: EvaFieldKey;
  label: string;
  required: boolean;
  /** The field's value + provenance + review state. */
  field: EvaField;
  /** Staff edit handler — marks the field reviewed in the caller. */
  onChange: (key: EvaFieldKey, value: string) => void;
  /** Commit handler — fires when an edit is COMMITTED (blur, dropdown select, or
   *  calendar pick) so the caller can persist durably. Omitted = no persistence
   *  (ManualIntake, where fields persist only on case create). */
  onCommit?: (key: EvaFieldKey, value: string) => void;
  /** True while this field's durable save is in flight. */
  saving?: boolean;
  /** True when the last durable save failed (offers a retry affordance). */
  saveError?: boolean;
  /** Retry the failed save for this field. */
  onRetry?: () => void;
  /** Explicit edit-session validation. Supersedes the generic required message. */
  validationMessage?: string;
  /** Optional row id (CaseDetail's deep-link scroll target, e.g. `field-<key>`). */
  rowId?: string;
  /** Optional focus-target registrar (CaseDetail deep-links focus the control). */
  registerRef?: (key: EvaFieldKey, el: HTMLElement | null) => void;
}

/** A single editable EVA field row: value control + a compact provenance token
 *  (and, when durable, its save state). */
export function EvaFieldRow({
  fieldKey,
  label,
  required,
  field,
  onChange,
  onCommit,
  saving,
  saveError,
  onRetry,
  validationMessage,
  rowId,
  registerRef,
}: EvaFieldRowProps) {
  const styles = useStyles();
  const empty = field.value.trim().length === 0;
  const validation = validationMessage
    ? ({ validationState: 'error' as const, validationMessage })
    : required && empty
      ? ({ validationState: 'error' as const, validationMessage: 'Required' })
      : {};

  const change = (_: unknown, data: InputOnChangeData) => onChange(fieldKey, data.value);
  const commit = () => onCommit?.(fieldKey, field.value);
  const setRef = registerRef ? (el: HTMLElement | null) => registerRef(fieldKey, el) : undefined;

  let control: React.ReactNode;
  if (fieldKey === 'accidentCircumstances') {
    control = (
      <Textarea
        ref={setRef as ((el: HTMLTextAreaElement | null) => void) | undefined}
        value={field.value}
        onChange={(_, d) => onChange(fieldKey, d.value)}
        onBlur={commit}
        resize="vertical"
        rows={3}
      />
    );
  } else if (fieldKey === 'inspectionAddress') {
    control = (
      <Textarea
        ref={setRef as ((el: HTMLTextAreaElement | null) => void) | undefined}
        value={field.value}
        onChange={(_, d) => onChange(fieldKey, d.value)}
        onBlur={commit}
        resize="vertical"
        rows={6}
      />
    );
  } else if (fieldKey === 'dateOfLoss' || fieldKey === 'dateOfInstruction') {
    control = (
      <DateField
        ref={setRef as ((el: HTMLInputElement | null) => void) | undefined}
        value={field.value}
        onChange={(v) => onChange(fieldKey, v)}
        onCommit={(v) => onCommit?.(fieldKey, v)}
        aria-label={label}
      />
    );
  } else if (fieldKey === 'vatStatus') {
    control = (
      <Dropdown
        ref={setRef as ((el: HTMLButtonElement | null) => void) | undefined}
        value={field.value || '—'}
        selectedOptions={[field.value]}
        onOptionSelect={(_, d) => {
          const v = d.optionValue ?? '';
          onChange(fieldKey, v);
          onCommit?.(fieldKey, v);
        }}
      >
        {VAT_OPTIONS.map((o) => (
          <Option key={o || 'blank'} value={o} text={o || '—'}>
            {o || '—'}
          </Option>
        ))}
      </Dropdown>
    );
  } else if (fieldKey === 'mileageUnit') {
    control = (
      <Dropdown
        ref={setRef as ((el: HTMLButtonElement | null) => void) | undefined}
        value={field.value || '—'}
        selectedOptions={[field.value]}
        onOptionSelect={(_, d) => {
          const v = d.optionValue ?? '';
          onChange(fieldKey, v);
          onCommit?.(fieldKey, v);
        }}
      >
        {MILEAGE_UNIT_OPTIONS.map((o) => (
          <Option key={o || 'blank'} value={o} text={o || '—'}>
            {o || '—'}
          </Option>
        ))}
      </Dropdown>
    );
  } else {
    control = (
      <Input
        ref={setRef as ((el: HTMLInputElement | null) => void) | undefined}
        value={field.value}
        onChange={change}
        onBlur={commit}
      />
    );
  }

  return (
    <div className={styles.fieldRow} id={rowId}>
      {/* Fluent's `required` renders the asterisk AND exposes the required
          semantic to assistive tech (the hand-appended " *" did neither). */}
      <Field label={label} required={required} {...validation}>
        {control}
      </Field>
      <div className={styles.fieldMeta}>
        {saving ? (
          <Spinner size="tiny" aria-label="Saving" />
        ) : saveError ? (
          <Tooltip content="Couldn’t save — select to retry" relationship="label">
            <Button
              className={styles.saveErrorBtn}
              size="small"
              appearance="subtle"
              icon={<AlertTriangle size={14} />}
              onClick={onRetry}
              aria-label="Couldn’t save — retry"
            />
          </Tooltip>
        ) : null}
        <ProvenanceBadge
          variant="compact"
          provenance={field.provenance}
          reviewState={field.reviewState}
          fieldKey={fieldKey}
        />
      </div>
    </div>
  );
}

export default EvaFieldRow;
