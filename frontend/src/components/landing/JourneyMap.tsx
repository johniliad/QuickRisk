import { ArrowRight, BarChart3, FlaskConical, GitBranch, Lock, Shield } from 'lucide-react';
import { BranchDivider, ForkArms, FORK_GRID } from '@/components/layout/BranchDivider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LANDING_BRANCHES,
  LANDING_FORK_NOTE,
  LANDING_STEPS,
  type LandingBranch,
  type LandingStepKey,
} from '@/content/landingJourney';
import { cn } from '@/lib/cn';
import { publicModel } from '@/model';
import { useAssessmentStore } from '@/state/assessmentStore';

/**
 * The whole product, stated before the first click.
 *
 * The landing page used to describe the questionnaire and then, much further down, two
 * optional tools. A first-time visitor could not tell that the assessment produces one
 * baseline and that Live and Decision Lab both start from it. This map puts the three
 * steps, their outputs and their dependencies in the first screenful after the hero.
 *
 * The step content comes from `@/content/landingJourney` so the copy is testable; the
 * question count is read from the active model so it cannot drift from the questionnaire.
 */
const stepIcons: Record<LandingStepKey, typeof Shield> = {
  assess: Shield,
  results: BarChart3,
  explore: FlaskConical,
};

function branchFor(key: LandingBranch['key']): LandingBranch {
  const branch = LANDING_BRANCHES.find((entry) => entry.key === key);
  if (branch === undefined) {
    throw new Error(`Unknown landing branch: ${key}`);
  }

  return branch;
}

/**
 * One branch of the landing fork.
 *
 * Kept deliberately quiet: the branch label, what it takes from Results, what it produces,
 * and a route to it once a result exists. It carries no availability badge of its own so the
 * step card above remains the single place the landing page states whether Explore is open.
 */
function LandingBranchCard({
  branch,
  unlocked,
  onOpen,
}: {
  branch: LandingBranch;
  unlocked: boolean;
  onOpen: () => void;
}) {
  const isLive = branch.key === 'live';

  return (
    <div
      className={cn(
        'grid gap-1 rounded-card border p-3 text-small',
        isLive ? 'border-accent-strong/40 bg-accent-soft/40' : 'border-success/40 bg-success/5',
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="m-0 font-semibold text-heading">{branch.title}</p>
        <span
          className={cn(
            'rounded-control border px-1.5 py-0.5 text-micro font-bold uppercase tracking-[0.08em]',
            isLive ? 'border-accent-strong/40 text-accent-strong' : 'border-success/40 text-success',
          )}
        >
          {branch.label}
        </span>
      </div>
      <p className="m-0 text-micro text-muted">{branch.summary}</p>
      <p className="m-0 text-micro text-muted">
        <span className="font-semibold text-ink">From Results:</span> {branch.receives}
      </p>
      <p className="m-0 text-micro text-muted">
        <span className="font-semibold text-ink">You get:</span> {branch.produces}
      </p>
      {unlocked ? (
        <div>
          <Button size="sm" variant="ghost" onClick={onOpen}>
            Open {branch.label}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function JourneyMap() {
  const setView = useAssessmentStore((state) => state.setView);
  const results = useAssessmentStore((state) => state.results);

  const questionCount = publicModel.profileQuestions.length + publicModel.scenarios.length * 2;

  return (
    <section aria-labelledby="journey-heading" className="mt-10 grid gap-4">
      <h2 id="journey-heading" className="m-0 text-title font-bold text-heading">
        Your journey in three steps
      </h2>
      <p className="m-0 max-w-[48rem] text-muted">
        The assessment is the entry point: it produces one baseline, and both exploration tools start from
        it. This is the whole product, before you begin.
      </p>
      <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
        {LANDING_STEPS.map((step) => {
          const Icon = stepIcons[step.key];
          const unlocked = step.key === 'assess' || results !== null;
          const isExplore = step.key === 'explore';

          return (
            <li key={step.key} className={isExplore ? 'md:col-span-2' : undefined}>
              <Card
                className={
                  step.key === 'assess' ? 'h-full border-accent-strong/30 bg-accent-soft/40' : 'h-full'
                }
              >
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="grid size-6 place-items-center rounded-full border border-border bg-canvas text-micro font-bold text-ink"
                    >
                      {step.position}
                    </span>
                    <Icon aria-hidden="true" className="size-5 text-accent-strong" />
                    <Badge tone={step.key === 'assess' ? 'accent' : unlocked ? 'success' : 'neutral'}>
                      {step.key === 'assess' ? 'Start here' : unlocked ? 'Available now' : 'Locked'}
                    </Badge>
                  </div>
                  <CardTitle>{step.title}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 text-small">
                  <p className="m-0 text-muted">{step.summary}</p>
                  {step.key === 'assess' ? (
                    <p className="m-0 text-micro text-muted">
                      {questionCount} questions in total. One decision at a time, with Unknown always
                      available.
                    </p>
                  ) : (
                    <p className="m-0 text-micro font-semibold text-muted">{step.availability}</p>
                  )}

                  {isExplore ? (
                    <div className="grid gap-2">
                      <p className="m-0 flex items-center justify-center gap-1.5 text-micro font-bold uppercase tracking-[0.08em] text-muted">
                        <GitBranch aria-hidden="true" className="size-3.5" />
                        Two independent branches from Results
                      </p>
                      <ForkArms />
                      <div className={cn('grid gap-3', FORK_GRID)}>
                        <LandingBranchCard
                          branch={branchFor('live')}
                          unlocked={unlocked}
                          onOpen={() => setView('live')}
                        />
                        <BranchDivider className="lg:min-h-full" />
                        <LandingBranchCard
                          branch={branchFor('decision-lab')}
                          unlocked={unlocked}
                          onOpen={() => setView('decision-lab')}
                        />
                      </div>
                      <p className="m-0 text-small text-muted">{LANDING_FORK_NOTE}</p>
                    </div>
                  ) : null}

                  <ul className="m-0 grid gap-1 pl-4 text-micro text-muted">
                    {step.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  {step.key === 'assess' ? (
                    <div>
                      <Button size="sm" onClick={() => setView('disclaimer')}>
                        Begin the assessment
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  ) : unlocked ? null : (
                    <p className="m-0 flex items-center gap-1 text-micro text-muted">
                      <Lock aria-hidden="true" className="size-3" />
                      Needs the step before it.
                    </p>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
    </section>
  );
}