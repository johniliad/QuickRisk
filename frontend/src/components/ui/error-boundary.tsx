import { Component, type ErrorInfo, type ReactNode } from 'react';
import { PageShell } from '@/components/layout/SectionHeading';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * Last-resort error boundary for the on-demand views.
 *
 * A chunk that cannot be downloaded, or a view that throws while rendering, would
 * otherwise leave the Suspense fallback on screen for ever: React has no place to
 * report the failure, so the visitor waits on "Loading the results view…" with no
 * way out. This boundary turns that into a stated failure with two ways forward:
 * try again (re-render the same view) and reload the page (fetch fresh chunk names).
 *
 * Nothing is logged anywhere except the browser console, and the message never names
 * a file, a URL or an internal error, so no deployment detail is disclosed.
 */
export class ErrorBoundary extends Component<
  {
    children: ReactNode;
    /** Changing this value clears a previous failure, for example on a view change. */
    resetKey?: string | number;
    /** Called by "Try again" before the view is re-rendered. */
    onRetry?: () => void;
  },
  { failure: Error | null }
> {
  override state: { failure: Error | null } = { failure: null };

  static getDerivedStateFromError(error: unknown): { failure: Error } {
    return { failure: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('A view failed to render and was replaced by an error notice.', error, info.componentStack);
  }

  override componentDidUpdate(previous: Readonly<{ resetKey?: string | number }>): void {
    if (this.state.failure !== null && previous.resetKey !== this.props.resetKey) {
      this.setState({ failure: null });
    }
  }

  private readonly handleReload = (): void => {
    globalThis.location.reload();
  };

  private readonly handleRetry = (): void => {
    this.setState({ failure: null });
    this.props.onRetry?.();
  };

  override render(): ReactNode {
    if (this.state.failure === null) {
      return this.props.children;
    }

    return (
      <PageShell>
        <Alert tone="danger" role="alert" title="This view could not be displayed">
          <p className="m-0">
            Part of this page failed to load, so it has been stopped rather than left on a loading
            message. The calculation itself is not affected and nothing you entered has been sent
            anywhere else.
          </p>
          <p className="m-0 mt-2">
            Reloading the page is the reliable fix: it fetches the current version of every file.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={this.handleReload}>
              Reload the page
            </Button>
            <Button variant="secondary" size="sm" onClick={this.handleRetry}>
              Try again
            </Button>
          </div>
        </Alert>
      </PageShell>
    );
  }
}
