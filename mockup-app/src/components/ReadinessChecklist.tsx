import { makeStyles, tokens, Text } from '@fluentui/react-components';
import { Check, X } from 'lucide-react';
import type { Case } from '@cs/domain';
import { computeReadiness, type ReadinessResult } from './readiness';

/* Deterministic EVA readiness checklist for a Case. Renders the ✔/✖ items
   from computeReadiness() and surfaces the derived Missing list. */

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  item: { display: 'flex', alignItems: 'flex-start', gap: tokens.spacingHorizontalS, padding: '2px 0' },
  iconOk: { color: '#16833b', flexShrink: 0, marginTop: '1px' },
  iconBad: { color: '#db0816', flexShrink: 0, marginTop: '1px' },
  label: { fontSize: tokens.fontSizeBase300, color: tokens.colorNeutralForeground1 },
  detail: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  text: { display: 'flex', flexDirection: 'column' },
});

export interface ReadinessChecklistProps {
  case: Case;
  /** Receives the computed result (e.g. so a parent can gate a submit button). */
  onResult?: (result: ReadinessResult) => void;
}

/** Renders the readiness checklist. Computation is in computeReadiness(). */
export function ReadinessChecklist({ case: c, onResult }: ReadinessChecklistProps) {
  const styles = useStyles();
  const result = computeReadiness(c);
  // Report synchronously during render is unsafe; fire on mount/update is overkill
  // for a pure derive — callers can also call computeReadiness themselves.
  onResult?.(result);

  return (
    <div className={styles.root} role="list">
      {result.items.map((item) => (
        <div key={item.id} className={styles.item} role="listitem">
          {item.ok ? (
            <Check size={16} className={styles.iconOk} aria-label="Pass" />
          ) : (
            <X size={16} className={styles.iconBad} aria-label="Fail" />
          )}
          <span className={styles.text}>
            <Text className={styles.label}>{item.label}</Text>
            {!item.ok && item.detail && <Text className={styles.detail}>{item.detail}</Text>}
          </span>
        </div>
      ))}
    </div>
  );
}
