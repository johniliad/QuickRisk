import { ArrowRight, Clock, FileCheck2, Lock } from 'lucide-react';
import { DisclaimerBlock, PrivacyNotice } from '@/components/layout/DisclaimerBlock';
import { PageShell } from '@/components/layout/SectionHeading';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { publicModel } from '@/model';
import { useAssessmentStore } from '@/state/assessmentStore';

/**
 * Landing page.
 *
 * Positioned as a first-party iliadis.net tool: what it does, how long it takes, what
 * it is not, and what happens to the answers. The mandatory disclaimer gate is one
 * deliberate click away.
 */
export function LandingView() {
  const setView = useAssessmentStore((state) => state.setView);
  const { positioning, limitations } = publicModel.content;
  const { version } = publicModel;

  return (
    <PageShell>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:items-center">
        <div className="grid gap-4">
          <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">
            {positioning.tagline}
          </p>
          <h1 className="m-0 max-w-[42rem] text-[var(--text-display)] font-bold leading-[1.12] tracking-[-0.03em] text-heading">
            {positioning.headline}
          </h1>
          <p className="m-0 max-w-[42rem] text-[1.1rem] text-muted">{positioning.subheadline}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => setView('disclaimer')}>
              Start the assessment
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setView('methodology')}>
              Read the methodology
            </Button>
          </div>
          <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden="true" className="size-4" />
              {positioning.timeEstimate}
            </span>
            <span className="inline-flex items-center gap-1">
              <Lock aria-hidden="true" className="size-4" />
              No account, no storage unless you save
            </span>
            <span className="inline-flex items-center gap-1">
              <FileCheck2 aria-hidden="true" className="size-4" />
              {version.defaultIterations.toLocaleString('en-GB')} simulations per scenario
            </span>
          </p>
        </div>

        <div className="grid gap-6">
          <div className="overflow-hidden rounded-card border border-border bg-paper">
            <img
              src={`${import.meta.env.BASE_URL}images/quantify-cyber-risk-dashboard.png`}
              alt="Quantify Cyber Risk — example results dashboard"
              width={1536}
              height={1024}
              loading="eager"
              className="block h-auto w-full"
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>What you will receive</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-small">
              <p className="m-0">Expected annual loss for each of five scenarios, in euros.</p>
              <p className="m-0">A typical-year to bad-year (1 in 10) range that shows how uncertain the estimate is.</p>
              <p className="m-0">Probability of exceeding €100k, €500k, €1m, €5m and €10m.</p>
              <p className="m-0">An estimate-precision indicator and a print-friendly report.</p>
              <p className="m-0 text-muted">
                Results are estimates produced from your assumptions. They are not a forecast, an audit or
                professional advice.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mt-12 grid gap-4" aria-labelledby="scenarios-heading">
        <h2 id="scenarios-heading" className="m-0 text-[var(--text-title)] font-bold text-heading">
          The five assessed scenarios
        </h2>
        <p className="m-0 max-w-[48rem] text-muted">
          Each scenario is asked as two questions: how plausible it is in a typical 12-month period, and how large
          the financial impact would be if it occurred.
        </p>
        <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
          {publicModel.scenarios.map((scenario) => (
            <li key={scenario.code} className="rounded-card border border-border bg-paper p-4">
              <p className="m-0 text-micro font-bold uppercase tracking-[0.08em] text-accent-strong">
                Scenario {scenario.order}
              </p>
              <h3 className="m-0 mt-1 text-[1.02rem] font-semibold text-heading">{scenario.name}</h3>
              <p className="m-0 mt-1 text-small text-muted">{scenario.shortDescription}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 grid gap-4" aria-labelledby="how-heading">
        <h2 id="how-heading" className="m-0 text-[var(--text-title)] font-bold text-heading">
          How it works
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>1. A short questionnaire</CardTitle>
            </CardHeader>
            <CardContent className="text-small text-muted">
              {publicModel.profileQuestions.length} organisation-profile questions, then two questions for each of
              the five scenarios. One decision at a time, with a clear progress indicator and Unknown available
              throughout.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>2. Server-side simulation</CardTitle>
            </CardHeader>
            <CardContent className="text-small text-muted">
              Your answers are translated into ranges rather than single numbers, and the server runs{' '}
              {version.defaultIterations.toLocaleString('en-GB')} simulated trials per scenario using a simplified
              FAIR-informed model. The result is an annualised exposure estimate, not a realised annual loss total.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>3. An executive view</CardTitle>
            </CardHeader>
            <CardContent className="text-small text-muted">
              A ranked dashboard, scenario detail showing the assumptions you provided, threshold probabilities,
              modelled components, an input-sensitivity view and a printable report.
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mt-12 grid gap-4 lg:grid-cols-2" aria-labelledby="boundaries-heading">
        <div className="grid gap-3">
          <h2 id="boundaries-heading" className="m-0 text-[var(--text-title)] font-bold text-heading">
            What it is not
          </h2>
          <Alert tone="warning" title={limitations.title}>
            <ul className="m-0 grid gap-1 pl-5">
              {limitations.items.slice(0, 5).map((item) => (
                <li key={item.slice(0, 40)}>{item}</li>
              ))}
            </ul>
          </Alert>
          <p className="m-0 flex flex-wrap gap-2">
            <Badge tone="neutral">FAIR-informed</Badge>
            <Badge tone="neutral">Not a full FAIR analysis</Badge>
            <Badge tone="neutral">No statutory-fine prediction</Badge>
            <Badge tone="neutral">No cross-scenario correlation</Badge>
          </p>
        </div>
        <div className="grid gap-3">
          <h2 className="m-0 text-[var(--text-title)] font-bold text-heading">Your data</h2>
          <Card>
            <CardContent>
              <PrivacyNotice showDetail />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mt-12 grid gap-4" aria-labelledby="disclaimer-preview-heading">
        <h2 id="disclaimer-preview-heading" className="m-0 text-[var(--text-title)] font-bold text-heading">
          Before you begin
        </h2>
        <DisclaimerBlock variant="short" />
        <p className="m-0 max-w-[48rem] text-small text-muted">
          The full disclaimer must be acknowledged before the assessment can start. The acknowledgement is held in
          this page only and is never stored.
        </p>
        <div>
          <Button size="lg" onClick={() => setView('disclaimer')}>
            Read the disclaimer and start
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </section>

      <p className="mt-10 text-micro text-muted">
        {positioning.attribution.before}
        <a className="text-accent-strong underline" href={positioning.attribution.url}>
          {positioning.attribution.name}
        </a>
        {positioning.attribution.after}
      </p>
    </PageShell>
  );
}
