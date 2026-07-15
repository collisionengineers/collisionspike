export const CASE_DETAIL_TABS = [
  'fields',
  'evidence',
  'address',
  'notes',
  'chasers',
  'emails',
] as const;

export type CaseDetailTab = (typeof CASE_DETAIL_TABS)[number];

const CASE_DETAIL_TAB_SET = new Set<string>(CASE_DETAIL_TABS);

/** Resolve a case-page tab from the URL without trusting arbitrary query text. */
export function caseDetailTabFromSearch(
  search: string | URLSearchParams,
): CaseDetailTab {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const requested = params.get('tab');
  return requested && CASE_DETAIL_TAB_SET.has(requested)
    ? (requested as CaseDetailTab)
    : 'fields';
}

/** Set the selected tab while preserving any unrelated case-page query state. */
export function caseDetailSearchForTab(
  search: string | URLSearchParams,
  tab: CaseDetailTab,
): URLSearchParams {
  const params = new URLSearchParams(
    typeof search === 'string' ? search : search.toString(),
  );
  params.set('tab', tab);
  return params;
}
