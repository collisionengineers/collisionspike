import { useCaseList } from './case-list.controller';
import { CaseListView } from './case-list.view';

export function CaseList() {
  return <CaseListView {...useCaseList()} />;
}

export default CaseList;
