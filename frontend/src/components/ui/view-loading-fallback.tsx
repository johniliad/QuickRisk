import { useEffect, useState } from 'react';
import { PageShell } from '@/components/layout/SectionHeading';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** How long a chunk may take before the message stops promising that it is loading. */
export const SLOW_LOAD_AFTER_MS = 8_000;

/**
 * Suspense fallback for the on-demand views.
 *
 * The plain "Loading…" notice is honest for the second or two a chunk normally needs,
 * but a stalled download would leave it on screen for ever. After
 * `SLOW_LOAD_AFTER_MS` the notice says that the download is taking too long and offers
 * a reload, so a visitor is never stranded on a message that cannot end.
 */
export function ViewLoadingFallback({ label = 'Loading this view…' }: { label?: string }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setSlow(true), SLOW_LOAD_AFTER_MS);
    return () => globalThis.clearTimeout(timer);
  }, []);

  const reload = (): void => {
    globalThis.location.reload();
  };

  if (!slow) {
    return (
      <PageShell>
        <Alert tone="info" role="status">
          {label}
        </Alert>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Alert tone="warning" role="status" title="This is taking longer than expected">
        <p className="m-0">
          One of the page&rsquo;s scripts has not finished downloading. Your answers are still in
          this page; reloading fetches the current version of every file.
        </p>
        <div className="mt-3">
          <Button size="sm" onClick={reload}>
            Reload the page
          </Button>
        </div>
      </Alert>
    </PageShell>
  );
}
