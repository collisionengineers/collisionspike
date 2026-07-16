import { forwardRef } from 'react';
import { DatePicker } from '@fluentui/react-datepicker-compat';
import { makeStyles } from '@fluentui/react-components';
import { formatDdmmyyyy, parseDdmmyyyy } from './date-format';

/* ============================================================
   DateField — a calendar date picker that STORES `DD/MM/YYYY` strings.

   Wraps the Fluent v9 `@fluentui/react-datepicker-compat` DatePicker so the EVA
   date fields (Date of Incident / Date of Instruction) and ManualIntake's
   inspection date get a real calendar popup AND keyboard entry, while the value
   the app reads/writes stays the contract `DD/MM/YYYY` string (work-todo-spike:
   ui-changes/calendar-box-on-date-fields). The Date <-> string bridge is the pure,
   unit-tested date-format module.

   `allowTextInput` keeps manual correction available (handlers often correct a
   date pulled from the instruction), and `parseDateFromString` accepts a typed
   `DD/MM/YYYY`. `onCommit` fires once on a calendar pick / parsed entry — the
   durable-save hook the CaseDetail field grid uses.
   ============================================================ */

const useStyles = makeStyles({
  // Let the picker fill the field cell like the plain Input it replaces.
  picker: { width: '100%' },
});

export interface DateFieldProps {
  /** Current value as `DD/MM/YYYY` (or '' for none). */
  value: string;
  /** Live edit handler — receives the new `DD/MM/YYYY` string (or ''). */
  onChange: (value: string) => void;
  /** Fired when a date is committed (calendar pick / parsed text). Durable-save hook. */
  onCommit?: (value: string) => void;
  placeholder?: string;
  'aria-label'?: string;
  /** Row id passthrough (CaseDetail deep-link scroll target). */
  id?: string;
  disabled?: boolean;
}

/** A Fluent DatePicker bound to a `DD/MM/YYYY` string value. */
export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(function DateField(
  { value, onChange, onCommit, placeholder = 'DD/MM/YYYY', id, disabled, ...rest },
  ref,
) {
  const styles = useStyles();
  return (
    <DatePicker
      ref={ref}
      id={id}
      className={styles.picker}
      disabled={disabled}
      value={parseDdmmyyyy(value)}
      formatDate={formatDdmmyyyy}
      parseDateFromString={parseDdmmyyyy}
      allowTextInput
      placeholder={placeholder}
      aria-label={rest['aria-label']}
      onSelectDate={(date) => {
        const next = formatDdmmyyyy(date ?? null);
        onChange(next);
        onCommit?.(next);
      }}
    />
  );
});

export default DateField;
