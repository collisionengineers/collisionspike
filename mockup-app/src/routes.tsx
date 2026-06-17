import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components';
import Dashboard from './screens/Dashboard';
import CaseList from './screens/CaseList';
import CaseDetail from './screens/CaseDetail';
import EvaSubmitDialog from './screens/EvaSubmitDialog';

/* Route map:
   /                      → Dashboard
   /queue/:name           → CaseList (name = needs-action|in-progress|ready|done)
   /case/:caseId          → CaseDetail
   /case/:caseId/submit   → CaseDetail with EvaSubmitDialog overlaid (nested) */

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'queue/:name', element: <CaseList /> },
      {
        path: 'case/:caseId',
        element: <CaseDetail />,
        children: [{ path: 'submit', element: <EvaSubmitDialog /> }],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
