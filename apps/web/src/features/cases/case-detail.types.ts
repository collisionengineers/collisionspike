import type { Case, Evidence } from '../../data';

export interface CaseDetailViewProps {
  caseData: Case;
  images: Evidence[];
  /** True while the image set is still being fetched (evidence tab shows a skeleton). */
  imagesLoading: boolean;
  onRefreshImages: () => void;
}

/* The editing workspace. Receives the loaded Case + images; case-field and
   inspection edits stay in a local draft until the explicit Save succeeds. */
