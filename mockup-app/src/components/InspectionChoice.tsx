import type { ReactNode } from 'react';
import {
  Field,
  Radio,
  RadioGroup,
  Textarea,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { Case } from '../data';

export type InspectionChoice = 'address' | 'image_based';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  options: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalXS,
  },
  addressControls: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
});

/** Reflect saved case truth. Provider defaults are applied server-side; this
 * helper never infers an image-based choice from a missing address. */
export function inspectionChoiceForCase(
  caseData: Pick<Case, 'inspectionDecision'>,
): InspectionChoice {
  return caseData.inspectionDecision === 'image_based' ? 'image_based' : 'address';
}

interface InspectionChoiceControlProps {
  choice: InspectionChoice;
  onChoiceChange: (choice: InspectionChoice) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  requireReason: boolean;
  children: ReactNode;
}

export function InspectionChoiceControl({
  choice,
  onChoiceChange,
  reason,
  onReasonChange,
  requireReason,
  children,
}: InspectionChoiceControlProps) {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <Field label="Choose an inspection address or set as Image Based Assessment">
        <RadioGroup
          className={styles.options}
          layout="horizontal"
          value={choice}
          onChange={(_event, data) => onChoiceChange(data.value as InspectionChoice)}
        >
          <Radio value="address" label="Inspection address" />
          <Radio value="image_based" label="Image Based Assessment" />
        </RadioGroup>
      </Field>

      {choice === 'address' ? (
        <div className={styles.addressControls} data-testid="inspection-address-controls">
          {children}
        </div>
      ) : requireReason ? (
        <Field label="Reason" required>
          <Textarea
            value={reason}
            onChange={(_event, data) => onReasonChange(data.value)}
            resize="vertical"
            rows={3}
          />
        </Field>
      ) : null}
    </div>
  );
}
