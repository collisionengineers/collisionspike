
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { Link, mergeClasses } from '@fluentui/react-components';
import { SectionHeading, ErrorState, CaseDetailSkeleton } from '../../shared/ui';
import { useCaseQuery, useImages } from '../../data';
import { useStyles } from './case-detail.styles';

import { CaseDetailWorkspace } from './case-detail.workspace';

export function CaseDetail() {
  const styles = useStyles();
  const navigate = useNavigate();
  const { caseId } = useParams<{ caseId: string }>();

  const caseQuery = useCaseQuery(caseId);
  const imagesQuery = useImages(caseId);

  // First-load (no case yet) — content-shaped skeleton; hard failure — error panel.
  if (caseQuery.loading && caseQuery.data === undefined) {
    return (
      <div className={mergeClasses('ce-enter', styles.page)}>
        <CaseDetailSkeleton />
        {/* Keep the nested submit dialog mountable during load. */}
        <Outlet />
      </div>
    );
  }
  if (caseQuery.error && caseQuery.data === undefined) {
    return (
      <div className={styles.page}>
        <ErrorState
          error={caseQuery.error}
          onRetry={caseQuery.refetch}
          title="Couldn’t load this case"
        />
        <Outlet />
      </div>
    );
  }
  if (!caseQuery.data) {
    return (
      <div className={styles.page}>
        <SectionHeading eyebrow="Case" heading="Case not found" />
        <Link inline as="button" onClick={() => navigate('/')}>
          Back to dashboard
        </Link>
        <Outlet />
      </div>
    );
  }

  return (
      <CaseDetailWorkspace
        key={`${caseQuery.data.id}:${caseQuery.data.version ?? 'unversioned'}`}
        caseData={caseQuery.data}
        images={imagesQuery.data ?? []}
        imagesLoading={imagesQuery.loading && imagesQuery.data === undefined}
        onRefreshImages={imagesQuery.refetch}
      />
    );
}


export default CaseDetail;
