import { DisclaimerBlock, PrivacyNotice } from '@/components/layout/DisclaimerBlock';
import { PageShell, SectionHeading } from '@/components/layout/SectionHeading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { publicModel } from '@/model';

/**
 * Methodology view.
 *
 * Explains why the five scenarios were chosen, what is borrowed from FAIR, what is
 * simplified, how answers become ranges, how the simulation works, what the percentiles
 * mean, why uncertainty matters, how the model is versioned and what is out of scope.
 * The disclaimer is repeated here, as required.
 */
export function MethodologyView() {
  const {
    methodology,
    terminology,
    outOfScope,
    evidenceSources,
    limitations,
    positioning,
    confidenceNotice,
    annualisationNotice,
  } = publicModel.content;
  const { version } = publicModel;

  return (
    <PageShell>
      <SectionHeading
        as="h1"
        eyebrow="Methodology"
        title={methodology.title}
        lede={<p className="m-0">{methodology.summary}</p>}
      />

      <div className="mt-8 grid gap-8">
        <Card>
          <CardHeader>
            <CardTitle>How answers become ranges</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-small text-muted">
            <p className="m-0">
              The likelihood question asks how often the scenario is attempted or contacted in a typical 12-month
              period, before considering whether your defences would stop it. That answer is “how often” (the
              technical name is threat event frequency). Your defences are applied separately and only once, so the
              same control is never counted twice.
            </p>
            <p className="m-0">
              Likelihood and impact answers map to distributions stored in the versioned model files. The model runs{' '}
              {version.defaultIterations.toLocaleString('en-GB')} simulated trials per scenario on the server, samples
              frequency, susceptibility and loss magnitude in each trial, and summarises the resulting annualised
              exposure approximation.
            </p>
            <p className="m-0">
              Organisation-profile answers act as modifiers on those distributions. An Unknown answer is modelled as
              an equal-weight mixture of the available answers: it widens the range and lowers the input-confidence
              rating, while keeping the central estimate inside the range of the answers you could have chosen.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{annualisationNotice.title}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-small text-muted">
            <p className="m-0">{annualisationNotice.statement}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{confidenceNotice.title}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-small text-muted">
            <p className="m-0">{confidenceNotice.statement}</p>
            <ul className="m-0 grid gap-1 pl-5">
              {confidenceNotice.bullets.map((bullet) => (
                <li key={bullet.slice(0, 48)}>{bullet}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {methodology.sections.map((section) => (
          <section key={section.id} className="grid gap-2" aria-labelledby={`methodology-${section.id}`}>
            <h2
              id={`methodology-${section.id}`}
              className="m-0 text-[var(--text-section)] font-semibold text-heading"
            >
              {section.heading}
            </h2>
            {(section.paragraphs ?? []).map((paragraph) => (
              <p key={paragraph.slice(0, 48)} className="m-0 max-w-[52rem] text-ink">
                {paragraph}
              </p>
            ))}
            {(section.bullets ?? []).length === 0 ? null : (
              <ul className="m-0 grid max-w-[52rem] gap-1 pl-5 text-ink">
                {(section.bullets ?? []).map((bullet) => (
                  <li key={bullet.slice(0, 48)}>{bullet}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section className="grid gap-3" aria-labelledby="glossary-heading">
          <h2 id="glossary-heading" className="m-0 text-[var(--text-section)] font-semibold text-heading">
            Glossary in plain language
          </h2>
          <p className="m-0 max-w-[52rem] text-small text-muted">{terminology.intro}</p>
          <dl className="m-0 grid gap-3 md:grid-cols-2">
            {terminology.terms.map((entry) => (
              <div key={entry.term} className="rounded-card border border-border p-3">
                <dt className="font-semibold text-heading">{entry.term}</dt>
                <dd className="m-0 text-small text-muted">{entry.plain}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="grid gap-3" aria-labelledby="limitations-heading">
          <h2 id="limitations-heading" className="m-0 text-[var(--text-section)] font-semibold text-heading">
            {limitations.title}
          </h2>
          <ul className="m-0 grid max-w-[52rem] gap-1 pl-5">
            {limitations.items.map((item) => (
              <li key={item.slice(0, 48)}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="grid gap-3" aria-labelledby="out-of-scope-heading">
          <h2 id="out-of-scope-heading" className="m-0 text-[var(--text-section)] font-semibold text-heading">
            Explicitly out of scope in v1
          </h2>
          <ul className="m-0 grid max-w-[52rem] gap-1 pl-5">
            {outOfScope.map((item) => (
              <li key={item.slice(0, 48)}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="grid gap-3" aria-labelledby="evidence-heading">
          <h2 id="evidence-heading" className="m-0 text-[var(--text-section)] font-semibold text-heading">
            Contextual evidence sources
          </h2>
          <ul className="m-0 grid max-w-[52rem] gap-2 pl-5 text-small">
            {evidenceSources.map((source) => (
              <li key={source.url}>
                <a href={source.url} rel="noopener noreferrer" target="_blank">
                  {source.name}
                </a>{' '}
                <span className="text-muted">
                  — {source.publisher}. {source.note}
                </span>
              </li>
            ))}
          </ul>
          <p className="m-0 max-w-[52rem] text-micro text-muted">
            {positioning.attribution.before}
            <a className="text-accent-strong underline" href={positioning.attribution.url}>
              {positioning.attribution.name}
            </a>
            {positioning.attribution.after}
          </p>
        </section>

        <section className="grid gap-3" aria-labelledby="versioning-heading">
          <h2 id="versioning-heading" className="m-0 text-[var(--text-section)] font-semibold text-heading">
            Active model version
          </h2>
          <ul className="m-0 grid gap-1 pl-5 text-small">
            <li>Model identifier: {version.modelId}</li>
            <li>Model version: {version.modelVersion}</li>
            <li>Schema version: {version.schemaVersion}</li>
            <li>Calibration version: {version.calibrationVersion}</li>
            <li>Methodology version: {version.methodologyVersion}</li>
            <li>Disclaimer version: {version.disclaimerVersion}</li>
            <li>Default simulation: {version.defaultIterations.toLocaleString('en-GB')} iterations per scenario</li>
            <li>Retention mode: {version.retentionMode}</li>
          </ul>
        </section>

        <PrivacyNotice showDetail />
        <DisclaimerBlock />
      </div>
    </PageShell>
  );
}
