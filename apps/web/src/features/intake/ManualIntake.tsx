import { useManualIntake } from './manual-intake.controller';
import { ManualIntakeView } from './manual-intake.view';

export function ManualIntake() {
  return <ManualIntakeView {...useManualIntake()} />;
}

export default ManualIntake;
