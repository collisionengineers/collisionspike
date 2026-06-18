import { useEffect, useState, type ReactNode } from 'react';
import { getContext } from '@microsoft/power-apps/app';

/* ============================================================
   Collision Engineers — Code App: Power Platform SDK bootstrap.

   The canonical Power Apps Code App scaffold wraps the app in a PowerProvider
   that initialises the @microsoft/power-apps SDK before the app reads Dataverse.
   This is the host wrapper the Code App player expects; without it the first
   data call can race the SDK bridge (the "fetching your app" hang / late-or-empty
   data on the live player) and was the prime suspect for the runtime
   `React.createElement: type is invalid … got: undefined` console error.

   SDK-VERSION NOTE: this app is pinned to `@microsoft/power-apps@1.0.3`, which
   exports `getContext` / `setConfig` from `/app` but does NOT yet export
   `initialize` (that arrived in 1.0.4+, which the current docs' PowerProvider
   uses). In 1.0.3 the data-runtime bridge initialises LAZILY on the first plugin
   call; `getContext()` is exactly such a call (`executePluginAsync('AppLifecycle',
   'getContext')`), so awaiting it here performs the host handshake and warms the
   bridge before any Dataverse read fires — the 1.0.3-correct equivalent of the
   canonical `await initialize()`. (When the SDK is bumped to ≥1.0.4, swap the
   `getContext()` call below for `initialize()` from `@microsoft/power-apps/app`.)

   We render children immediately (do NOT gate on the handshake) so the app shell
   paints right away and the data hooks — which read through the seam and already
   show loading states — fetch once the bridge is ready. Offline / localhost where
   there is no host, `getContext()` rejects; we log and continue (the mock/empty
   data path still renders).
   ============================================================ */

interface PowerProviderProps {
  children: ReactNode;
}

export default function PowerProvider({ children }: PowerProviderProps) {
  // Tracks the handshake purely for diagnostics/StrictMode-safety; rendering is
  // never blocked on it (the shell + loading states cover the in-flight window).
  const [, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const initApp = async () => {
      try {
        // Warms the Power Apps host bridge (lazy SDK runtime init in 1.0.3).
        await getContext();
        if (!cancelled) setReady(true);
        console.log('Power Platform SDK initialized successfully');
      } catch (error) {
        // Expected offline / on localhost without a Power Apps host — the app
        // still renders; Dataverse reads simply have no host to answer them.
        console.error('Failed to initialize Power Platform SDK:', error);
      }
    };
    void initApp();
    return () => {
      cancelled = true;
    };
  }, []);

  return <>{children}</>;
}
