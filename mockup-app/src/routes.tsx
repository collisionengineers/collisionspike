import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components';
import Dashboard from './screens/Dashboard';
import CaseList from './screens/CaseList';
import CaseDetail from './screens/CaseDetail';
import EvaSubmitDialog from './screens/EvaSubmitDialog';
import DedupDecisionDialog from './screens/DedupDecisionDialog';
import Admin from './screens/Admin';
import ManualIntake from './screens/ManualIntake';

/* Route map:
   /                      → Dashboard
   /queue/:name           → CaseList (name = needs-action|in-progress|ready|done)
   /case/:caseId          → CaseDetail
   /case/:caseId/submit   → CaseDetail with EvaSubmitDialog overlaid (nested)
   /case/:caseId/dedup    → CaseDetail with DedupDecisionDialog overlaid (Surface B)
   /admin                 → Admin / corpus surface (WorkProvider + read views) */

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'intake', element: <ManualIntake /> },
      { path: 'queue/:name', element: <CaseList /> },
      {
        path: 'case/:caseId',
        element: <CaseDetail />,
        children: [
          { path: 'submit', element: <EvaSubmitDialog /> },
          { path: 'dedup', element: <DedupDecisionDialog /> },
        ],
      },
      { path: 'admin', element: <Admin /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
