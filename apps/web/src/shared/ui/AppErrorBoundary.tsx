import { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  Button,
  Text,
  Caption1,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import { Panel } from './Panel';

/* ============================================================
   AppErrorBoundary — defensive boundary around the routed <Outlet/>.

   A single bad route (or an undefined component reaching React.createElement)
   would otherwise blank the whole shell. This catches the throw, keeps the
   AppShell chrome (rail + logo) painted, and offers a recover affordance — so a
   render fault in one screen never takes down the entire app. It also logs the
   error + componentStack to the console, which is where the offending component
   name surfaces for diagnosis.

   Brand: the only red is var(--ce-red); never the print brand red (see theme.css).
   ============================================================ */

const useStyles = makeStyles({
  /* Layout only — border / radius / background / the critical accent rail come
     from the shared <Panel accent="critical"> (a render fault is a true error). */
  panel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
    textAlign: 'center',
  },
  icon: { color: 'var(--ce-red)' },
  title: { color: 'var(--ce-ink)', fontWeight: tokens.fontWeightSemibold },
  detail: {
    color: tokens.colorNeutralForeground3,
    maxWidth: '64ch',
    fontFamily: 'var(--ce-font-mono)',
  },
});

interface ErrorFallbackProps {
  error: Error;
  onReset: () => void;
}

/** Functional fallback (uses makeStyles, which a class can't). */
function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  const styles = useStyles();
  return (
    <Panel accent="critical" role="alert" className={styles.panel}>
      <AlertOctagon size={28} strokeWidth={1.75} className={styles.icon} aria-hidden />
      <Text className={styles.title}>This screen hit an unexpected error</Text>
      <Caption1 className={styles.detail}>
        {error.message || 'A component failed to render.'}
      </Caption1>
      <Button appearance="secondary" icon={<RefreshCw size={16} />} onClick={onReset}>
        Try again
      </Button>
    </Panel>
  );
}

interface AppErrorBoundaryProps {
  children: ReactNode;
  /** Bump this (e.g. the route key) to auto-reset the boundary on navigation. */
  resetKey?: string;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prev: AppErrorBoundaryProps) {
    // Clear the error when the route changes so a fresh screen can mount.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The componentStack names the offending component (the source of a
    // "type is invalid … got: undefined" fault) — log it for diagnosis.
    console.error('[AppErrorBoundary] render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} onReset={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
