import { ArrowRight, Clock } from 'lucide-react';
import { DisclaimerBlock, PrivacyNotice } from '@/components/layout/DisclaimerBlock';
import { PageShell, SectionHeading } from '@/components/layout/SectionHeading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, Separator } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/field';
import { publicModel } from '@/model';
import { useAssessmentStore } from '@/state/assessmentStore';

const ACKNOWLEDGEMENT_ID = 'disclaimer-acknowledgement';

/**
 * Mandatory disclaimer gate.
 *
 * The assessment cannot start until the disclaimer is acknowledged. The
 * acknowledgement lives in browser memory only: it is not stored, not timestamped on
 * the server and not associated with any record.
 */
export function DisclaimerGate() {
  const acknowledged = useAssessmentStore((state) => state.disclaimerAcknowledged);
  const acknowledgeDisclaimer = useAssessmentStore((state) => state.acknowledgeDisclaimer);
  const startAssessment = useAssessmentStore((state) => state.startAssessment);
  const setView = useAssessmentStore((state) => state.setView);

  const { disclaimer, positioning } = publicModel.content;

  return (
    <PageShell>
      <SectionHeading
        as="h1"
        eyebrow="Before you start"
        title="Purpose, limitations and disclaimer"
        lede={
          <p className="m-0">
            FAIR QuickRisk is a rapid, probabilistic estimate of financial cyber-risk exposure. Please read the
            limitations below before starting.
          </p>
        }
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="grid gap-8">
          <DisclaimerBlock />
          <PrivacyNotice showDetail />
        </div>

        <aside className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Start the assessment</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="m-0 text-small text-muted">
                <Clock aria-hidden="true" className="mr-1 inline size-4 align-[-2px]" />
                {positioning.timeEstimate}
              </p>
              <p className="m-0 text-small text-muted">
                {publicModel.profileQuestions.length} organisation-profile questions, then two questions for each
                of five scenarios. You can move backwards and forwards without losing your answers while this page
                stays open.
              </p>
              <Separator />
              <Checkbox
                id={ACKNOWLEDGEMENT_ID}
                checked={acknowledged}
                onCheckedChange={acknowledgeDisclaimer}
                label={disclaimer.acknowledgementLabel}
                describedBy="disclaimer-acknowledgement-help"
              />
              <p id="disclaimer-acknowledgement-help" className="m-0 text-micro text-muted">
                Required. Acknowledgement version {publicModel.version.disclaimerVersion}. Held in this page only.
              </p>
              <div className="grid gap-2">
                <Button
                  size="lg"
                  disabled={!acknowledged}
                  onClick={startAssessment}
                  aria-describedby="disclaimer-acknowledgement-help"
                >
                  Start assessment
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
                <Button variant="ghost" onClick={() => setView('landing')}>
                  Back to overview
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What you will get</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="m-0 grid gap-1 pl-5 text-small text-muted">
                <li>Expected annual loss per scenario</li>
                <li>P10 / P50 / P90 loss range</li>
                <li>Probability of exceeding €100k, €500k, €1m, €5m and €10m</li>
                <li>Confidence indicator and a printable report</li>
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}
