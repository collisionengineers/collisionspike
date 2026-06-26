/* TEST FIXTURES — fabricated activity feed. NOT shipped (tree-shaken out of
   dist). See __fixtures__/cases.ts. */
import type { ActivityEvent } from '@cs/domain';

/** Recent pipeline activity feed (newest first) for the dashboard. */
export const activity: ActivityEvent[] = [
  {
    id: 'act-001',
    caseId: 'case-007',
    vrm: 'RT22 ZAB',
    kind: 'intake',
    actor: 'System',
    timestamp: '17/06/2026 08:42',
    description: 'New email ingested from claims@ (Bridgen Claims). Awaiting parse.',
  },
  {
    id: 'act-002',
    caseId: 'case-004',
    vrm: 'GH15 PRS',
    kind: 'classify',
    actor: 'System',
    timestamp: '10/06/2026 14:31',
    description: 'Conflict detected: claimant name differs between PDF and email signature.',
  },
  {
    id: 'act-003',
    caseId: 'case-003',
    vrm: 'LD19 MNO',
    kind: 'dedup',
    actor: 'System',
    timestamp: '09/06/2026 11:02',
    description: 'Duplicate risk: two open cases share VRM with differing references.',
  },
  {
    id: 'act-004',
    caseId: 'case-002',
    vrm: 'XY68 RTQ',
    kind: 'chaser',
    actor: 'J. Mercer',
    timestamp: '06/06/2026 09:20',
    description: 'Image-request chaser drafted to Eastside Motors (email).',
  },
  {
    id: 'act-005',
    caseId: 'case-001',
    vrm: 'AB12 CDE',
    kind: 'review',
    actor: 'J. Mercer',
    timestamp: '03/06/2026 09:14',
    description: 'Review complete — marked ready for EVA.',
  },
  {
    id: 'act-006',
    caseId: 'case-005',
    vrm: 'KP20 TUV',
    kind: 'eva_submit',
    actor: 'J. Mercer',
    timestamp: '21/05/2026 16:48',
    description: 'Submitted to EVA test environment. Case/PO ccpy26050 assigned.',
  },
  {
    id: 'act-007',
    caseId: 'case-006',
    vrm: 'MN17 WXY',
    kind: 'box_sync',
    actor: 'System',
    timestamp: '30/04/2026 10:05',
    description: 'Archived to Box folder TEST26012.',
  },
];

/** Activity for a single case (newest first). */
export function activityForCase(caseId: string): ActivityEvent[] {
  return activity.filter((a) => a.caseId === caseId);
}
