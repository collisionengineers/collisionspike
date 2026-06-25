import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components';
import Dashboard from './screens/Dashboard';
import CaseList from './screens/CaseList';
import CaseDetail from './screens/CaseDetail';
import EvaSubmitDialog from './screens/EvaSubmitDialog';
import MergeCaseDialog from './screens/MergeCaseDialog';
import Admin from './screens/Admin';
import ManualIntake from './screens/ManualIntake';
import AddEvidence from './screens/AddEvidence';
import ActionLogs from './screens/ActionLogs';
import Inbox from './screens/Inbox';

/* Route map (review 190626 nav IA):
   /                      → Dashboard
   /inbox                 → Inbox (Phase 8 triage queue — faceted by category)
   /intake                → ManualIntake (new case)
   /evidence              → AddEvidence (second intake — link evidence to a case)
   /queue/:name           → CaseList (name = not-ready|review|held)
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
      { path: 'intake', element: <ManualIntake /> },
      { path: 'evidence', element: <AddEvidence /> },
      { path: 'queue/:name', element: <CaseList /> },
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
