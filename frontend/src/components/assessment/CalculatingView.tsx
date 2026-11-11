import { LoaderCircle } from 'lucide-react';
import { PrivacyNotice } from '@/components/layout/DisclaimerBlock';
import { PageShell, SectionHeading } from '@/components/layout/SectionHeading';
import { Card, CardContent } from '@/components/ui/card';
import { publicModel } from '@/model';

/**
 * Calculation-in-progress view.
 *
 * The simulation runs server-side. The browser sends the complete assessment once and
 * waits for the transient JSON response; nothing is stored at either end.
 */
export function CalculatingView() {
  const iterations = publicModel.version.defaultIterations;
  const scenarioCount = publicModel.scenarios.length;

  return (
    <PageShell>
      <SectionHeading
        as="h1"
        eyebrow="Simulation"
        title="Calculating indicative exposure"
        lede={
          <p className="m-0">
            {iterations.toLocaleString('en-GB')} simulated trials are being generated for each of the {scenarioCount}{' '}
            scenarios on the server. This normally takes a few seconds.
          </p>
        }
      />

      <div className="mt-8 grid gap-6">
        <Card>
          <CardContent className="flex items-center gap-4">
            <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-accent-strong motion-reduce:animate-none" />
            <div>
              <p className="m-0 font-semibold text-heading" role="status" aria-live="polite">
                Running the Monte Carlo simulation…
              </p>
              <p className="m-0 text-small text-muted">
                The calculation is stateless: if it fails you can retry without losing your answers.
              </p>
            </div>
          </CardContent>
        </Card>

        <PrivacyNotice />
      </div>
    </PageShell>
  );
}
