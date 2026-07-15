import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../shared/ui';
import Dashboard from '../features/dashboard/Dashboard';
import CaseList from '../features/cases/CaseList';
import CaseDetail from '../features/cases/CaseDetail';
import EvaSubmitDialog from '../features/cases/EvaSubmitDialog';
import MergeCaseDialog from '../features/cases/MergeCaseDialog';
import Admin from '../features/admin/Admin';
import ManualIntake from '../features/intake/ManualIntake';
import AddEvidence from '../features/cases/AddEvidence';
import ActionLogs from '../features/admin/ActionLogs';
import Inbox from '../features/inbox/Inbox';
import SearchResults from '../features/cases/SearchResults';
import CompletedList from '../features/cases/CompletedList';

/* Route map (review 190626 nav IA):
   /                      → Dashboard
   /inbox                 → Inbox (Phase 8 triage queue — faceted by category)
   /intake                → ManualIntake (new case)
   /evidence              → AddEvidence (second intake — link evidence to a case)
   /queue/:name           → CaseList (name = not-ready|review|held)
   /completed             → CompletedList (TKT-096 — terminal cases; browse/audit, NOT a queue)
   /case/:caseId          → CaseDetail
   /case/:caseId/submit   → CaseDetail with EvaSubmitDialog overlaid (nested)
   /case/:caseId/merge    → CaseDetail with MergeCaseDialog overlaid (staff manual merge)
   /admin                 → Provider settings (WorkProvider corpus + read views)
   /logs                  → Action logs (audit-event feed) */

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'inbox', element: <Inbox /> },
      { path: 'search', element: <SearchResults /> },
      { path: 'intake', element: <ManualIntake /> },
      { path: 'evidence', element: <AddEvidence /> },
      { path: 'queue/:name', element: <CaseList /> },
      { path: 'completed', element: <CompletedList /> },
      {
        path: 'case/:caseId',
        element: <CaseDetail />,
        children: [
          { path: 'submit', element: <EvaSubmitDialog /> },
          { path: 'merge', element: <MergeCaseDialog /> },
        ],
      },
      { path: 'admin', element: <Admin /> },
      { path: 'logs', element: <ActionLogs /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
