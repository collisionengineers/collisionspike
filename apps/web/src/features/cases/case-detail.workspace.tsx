import type { CaseDetailViewProps } from './case-detail.types';
import { useCaseDetailController } from './case-detail.controller';
import { CaseDetailView } from './case-detail.view';

export function CaseDetailWorkspace(props: CaseDetailViewProps) {
  return <CaseDetailView {...useCaseDetailController(props)} />;
}
