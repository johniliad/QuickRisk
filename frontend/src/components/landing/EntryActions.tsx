import { useState } from 'react';
import { ArrowRight, Clock, Gauge, ListChecks, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LANDING_ENTRY_ACTIONS,
  LANDING_ENTRY_NOTE,
  LANDING_QUICK_PICKER_HELP,
  LANDING_QUICK_PICKER_LABEL,
  type LandingEntryKey,
} from '@/content/landingJourney';
import { SAMPLE_ASSESSMENT_LABEL, SAMPLE_ASSESSMENT_NOTE } from '@/content/sampleAssessment';
import { cn } from '@/lib/cn';
import { publicModel } from '@/model';
import { useAssessmentStore } from '@/state/assessmentStore';

/**
 * The three ways in, ordered by cost.
 *
 * The landing page used to offer one button. That meant the cheapest way to see a dashboard —
 * a sample — was unavailable, and a visitor who only wanted a sanity check had to commit to
 * eighteen questions. Each action below ends at the same disclaimer gate: none of them
 * acknowledges the disclaimer or calculates on the visitor's behalf.
 */
const entryIcons: Record<LandingEntryKey, typeof Sparkles> = {
  sample: Sparkles,
  quick: Gauge,
  full: ListChecks,
};

export function EntryActions() {
  const setView = useAssessmentStore((state) => state.setView);
  const loadSampleAssessment = useAssessmentStore((state) => state.loadSampleAssessment);
  const startQuickCheck = useAssessmentStore((state) => state.startQuickCheck);
  const startFullAssessment = useAssessmentStore((state) => state.startFullAssessment);
  const results = useAssessmentStore((state) => state.results);
  const organisationAnswers = useAssessmentStore((state) => state.organisationAnswers);
  const scenarioAnswers = useAssessmentStore((state) => state.scenarioAnswers);

  const [quickScenario, setQuickScenario] = useState(publicModel.scenarios[0]?.code ?? '');

  const hasWorkInTab =
    results !== null ||
    Object.keys(organisationAnswers).length > 0 ||
    Object.keys(scenarioAnswers).length > 0;

  return (
    <section aria-labelledby="entry-actions-heading" id="start" className="mt-10 grid gap-4">
      <div className="grid gap-1">
        <h2 id="entry-actions-heading" className="m-0 text-title font-bold text-heading">
          Choose how you start
        </h2>
        <p className="m-0 max-w-[48rem] text-muted">
          All three paths end at the same disclaimer and the same server-side model.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {LANDING_ENTRY_ACTIONS.map((action) => {
          const Icon = entryIcons[action.key];

          return (
            <Card
              key={action.key}
              className={cn('h-full', action.primary ? 'border-accent-strong/40 bg-accent-soft/40' : undefined)}
            >
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Icon aria-hidden="true" className="size-5 text-accent-strong" />
                  <Badge tone={action.primary ? 'accent' : 'neutral'}>{action.eyebrow}</Badge>
                </div>
                <CardTitle>{action.title}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-small">
                <p className="m-0 text-muted">{action.description}</p>
                <p className="m-0 flex items-center gap-1 text-micro font-semibold text-muted">
                  <Clock aria-hidden="true" className="size-3.5" />
                  {action.timeEstimate}
                </p>

                {action.key === 'quick' ? (
                  <div className="grid gap-1.5">
                    <label
                      htmlFor="quick-check-scenario"
                      className="text-micro font-bold uppercase tracking-[0.08em] text-muted"
                    >
                      {LANDING_QUICK_PICKER_LABEL}
                    </label>
                    <select
                      id="quick-check-scenario"
                      value={quickScenario}
                      onChange={(event) => setQuickScenario(event.target.value)}
                      className="min-h-11 w-full rounded-control border border-border bg-paper px-3 text-small text-ink"
                    >
                      {publicModel.scenarios.map((scenario) => (
                        <option key={scenario.code} value={scenario.code}>
                          {scenario.name}
                        </option>
                      ))}
                    </select>
                    <p className="m-0 text-micro text-muted">{LANDING_QUICK_PICKER_HELP}</p>
                  </div>
                ) : null}

                {action.key === 'sample' ? (
                  <p className="m-0 text-micro text-muted">
                    <span className="font-semibold text-ink">{SAMPLE_ASSESSMENT_LABEL}. </span>
                    {SAMPLE_ASSESSMENT_NOTE}
                  </p>
                ) : null}

                <div>
                  <Button
                    size={action.primary ? 'lg' : 'md'}
                    variant={action.primary ? 'primary' : 'secondary'}
                    onClick={() => {
                      if (action.key === 'sample') {
                        loadSampleAssessment();
                        return;
                      }
                      if (action.key === 'quick') {
                        startQuickCheck(quickScenario);
                        return;
                      }
                      startFullAssessment();
                    }}
                  >
                    {action.ctaLabel}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="m-0 max-w-[52rem] text-small text-muted">{LANDING_ENTRY_NOTE}</p>

      {hasWorkInTab ? (
        <p className="m-0 max-w-[52rem] text-small text-muted" role="status">
          There is already work in this tab. Loading the sample or starting a path replaces the answers held here;
          saved Live and Decision Lab snapshots are unaffected.{' '}
          <button
            type="button"
            className="font-semibold text-accent-strong underline"
            onClick={() => setView(results === null ? 'questionnaire' : 'results')}
          >
            Return to the work in this tab
          </button>
          .
        </p>
      ) : null}
    </section>
  );
}
