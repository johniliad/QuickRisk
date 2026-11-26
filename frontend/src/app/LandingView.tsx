import { Clock, FileCheck2, Lock } from 'lucide-react';
import { PageShell } from '@/components/layout/SectionHeading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EntryActions } from '@/components/landing/EntryActions';
import { JourneyMap } from '@/components/landing/JourneyMap';
import { RoleCards } from '@/components/landing/RoleCards';
import { SampleResultsPreview } from '@/components/landing/SampleResultsPreview';
import { TRUST_STRIP_ITEMS, type ReferenceModalKey } from '@/content/dataLifecycle';
import { LANDING_HERO_HEADLINE, LANDING_HERO_LEAD } from '@/content/landingJourney';
import { publicModel } from '@/model';

/**
 * Landing page.
 *
 * The page used to open with the retention prose, the disclaimer and a single
 * "Start the assessment" button, so a visitor had to read several hundred words and commit
 * to eighteen questions before seeing a number. It now opens with what the tool produces,
 * a one-line trust strip whose claims open the reference modals, and three ways in ordered
 * by cost — sample, one scenario, all five.
 *
 * Everything the earlier page promised that matters — the three-step journey, the fork
 * between Live and Decision Lab, the audiences, the sample output — still follows below.
 */
export function LandingView({
  onShowReference,
}: {
  onShowReference: (modal: ReferenceModalKey) => void;
}) {
  const { positioning, limitations } = publicModel.content;
  const { version } = publicModel;

  return (
    <PageShell>
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
        <div className="grid gap-3">
          <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">
            {positioning.tagline}
          </p>
          <h1 className="m-0 max-w-[44rem] text-display font-bold leading-[1.12] tracking-[-0.03em] text-heading">
            {LANDING_HERO_HEADLINE}
          </h1>
          <p className="m-0 max-w-[44rem] text-[1.1rem] text-ink">{LANDING_HERO_LEAD}</p>
          <p className="m-0 max-w-[44rem] text-small text-muted">{positioning.subheadline}</p>

          <ul className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0 text-small">
            {TRUST_STRIP_ITEMS.map((item, index) => (
              <li key={item.key} className="flex items-center gap-2">
                {index === 0 ? null : (
                  <span aria-hidden="true" className="text-muted">
                    ·
                  </span>
                )}
                <button
                  type="button"
                  className="rounded-control font-semibold text-accent-strong underline decoration-accent-strong/40 underline-offset-2 hover:bg-accent-soft"
                  onClick={() => onShowReference(item.modal)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>

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

        {/*
          The source is a 3:2 landscape marketing poster with a logo lockup, headline and the
          credit line baked into its corners. The frame takes the image's own aspect ratio, so
          nothing is cropped. With the concise headline, the output summary spans both columns
          below rather than leaving a tall, empty column beside the poster.
        */}
        <div>
          <div className="overflow-hidden rounded-card border border-border bg-paper">
            <img
              src={`${import.meta.env.BASE_URL}images/quickrisk-hero-2026-11.jpg`}
              alt="QuickRisk — Quantify Cyber Risk: identify key risk scenarios, quantify likelihood and financial impact, prioritise what matters most."
              width={1920}
              height={1280}
              loading="eager"
              fetchPriority="high"
              className="block h-auto w-full"
            />
          </div>
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>What you will receive</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-small md:grid-cols-2 md:gap-x-6">
            <p className="m-0">Indicative annual exposure for each of five scenarios, in euros.</p>
            <p className="m-0">
              A typical-year to bad-year (1 in 10) range that shows how uncertain the estimate is.
            </p>
            <p className="m-0">Probability of exceeding €100k, €500k, €1m, €5m and €10m.</p>
            <p className="m-0">An estimate-precision indicator and a print-friendly report.</p>
            <p className="m-0 text-muted md:col-span-2">
              Results are estimates produced from your assumptions. They are not a forecast, an audit or
              professional advice.
            </p>
          </CardContent>
        </Card>
      </section>

      <EntryActions />

      <JourneyMap />

      <section className="mt-10 grid gap-4" aria-labelledby="scenarios-heading">
        <h2 id="scenarios-heading" className="m-0 text-title font-bold text-heading">
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
        <p className="m-0 max-w-[52rem] text-small text-muted">
          {limitations.title}{' '}
          <button
            type="button"
            className="font-semibold text-accent-strong underline"
            onClick={() => onShowReference('disclaimer')}
          >
            Open the full scope, limitations and disclaimer
          </button>
          .
        </p>
      </section>

      <RoleCards />

      <SampleResultsPreview />

      <p className="mt-8 text-micro text-muted">
        {positioning.attribution.before}
        <a className="text-accent-strong underline" href={positioning.attribution.url}>
          {positioning.attribution.name}
        </a>
        {positioning.attribution.after}
      </p>
    </PageShell>
  );
}
