
import { mergeClasses } from '@fluentui/react-components';
import { type useCaseDetailController } from './case-detail.controller';

type CaseDetailViewModel = ReturnType<typeof useCaseDetailController>;

import { CaseDetailHeader } from './case-detail-header';
import { CaseDetailMain } from './case-detail-main';
import { CaseDetailSidebar } from './case-detail-sidebar';
import { CaseDetailDialogs } from './case-detail-dialogs';

export function CaseDetailView(props: CaseDetailViewModel) {
  const { styles } = props;
  return (
    <div className={mergeClasses('ce-enter', styles.page)}>
      <CaseDetailHeader {...props} />
      <div className={styles.grid}>
        <CaseDetailMain {...props} />
        <CaseDetailSidebar {...props} />
      </div>
      <CaseDetailDialogs {...props} />
    </div>
  );
}
