import { RouterProvider } from 'react-router-dom';
import { router } from './routes';

/** App root — drives the router. Theme + Toaster live in main.tsx. */
export default function App() {
  return <RouterProvider router={router} />;
}
