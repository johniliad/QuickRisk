import { ArrowDown, ArrowRight, GitBranch } from 'lucide-react';
import { BranchDivider, ForkArms, FORK_GRID } from '@/components/layout/BranchDivider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FORK_CHOICE_PROMPT,
  JOURNEY_FORK_NOTE,
  JOURNEY_MAP_TITLE,
  JOURNEY_NODES,
  branchPosition,
  type JourneyNode,
  type SurfaceKey,
} from '@/content/dataLifecycle';
import { cn } from '@/lib/cn';
import { useAssessmentStore } from '@/state/assessmentStore';

/**
 * One diagram, shown on every surface, that states the actual topology of the data.
 *
 * Results is a single server calculation. QuickRisk Live and Decision Lab both start from
 * it, and neither feeds the other: Live copies one scenario figure and multiplies it in the
 * browser, Decision Lab carries the portfolio baseline and replays the same simulated years
 * with treatments applied. Reading the three screens as one cumulative chain is the single
 * most common misunderstanding the interface has to prevent, so the fork is drawn rather
 * than described: two differently coloured lanes, an explicit "Not connected" divider, and a
 * banner naming the branch the visitor is currently standing on with a one-click route to
 * the sibling branch.
 */
type BranchKey = Extract<SurfaceKey, 'live' | 'decision-lab'>;

function nodeFor(key: SurfaceKey): JourneyNode {
  const node = JOURNEY_NODES.find((entry) => entry.key === key);
  if (node === undefined) {
    throw new Error(`Unknown journey node: ${key}`);
  }

  return node;
}

const BRANCH_LABELS: Record<BranchKey, string> = {
  live: 'Branch A',
  'decision-lab': 'Branch B',
};

function BranchChip({ branch }: { branch: BranchKey }) {
  return (
    <span
      className={cn(
        'rounded-control border px-1.5 py-0.5 text-micro font-bold uppercase tracking-[0.08em]',
        branch === 'live'
          ? 'border-accent-strong/40 text-accent-strong'
          : 'border-success/40 text-success',
      )}
    >
      {BRANCH_LABELS[branch]}
    </span>
  );
}

function JourneyNodeCard({
  node,
  current,
  branch,
}: {
  node: JourneyNode;
  current: boolean;
  branch?: BranchKey;
}) {
  return (
    <div
      aria-current={current ? 'true' : undefined}
      className={cn(
        'grid gap-1 rounded-card border p-3',
        current
          ? 'border-2 border-accent-strong bg-accent-soft'
          : branch === 'live'
            ? 'border-accent-strong/40 bg-accent-soft/40'
            : branch === 'decision-lab'
              ? 'border-success/40 bg-success/5'
              : 'border-border bg-paper',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="m-0 text-small font-semibold text-heading">{node.name}</p>
          {branch === undefined ? null : <BranchChip branch={branch} />}
        </div>
        {current ? (
          <span className="rounded-control border border-accent-strong/40 px-1.5 py-0.5 text-micro font-bold uppercase tracking-[0.08em] text-accent-strong">
            You are here
          </span>
        ) : null}
      </div>
      <p className="m-0 text-micro text-muted">
        <span className="font-semibold text-ink">Receives:</span> {node.receives}
      </p>
      <p className="m-0 text-micro text-muted">
        <span className="font-semibold text-ink">Produces:</span> {node.produces}
      </p>
      <p className="m-0 text-micro text-muted">
        <span className="font-semibold text-ink">Stores:</span> {node.stores}
      </p>
    </div>
  );
}

function BranchPositionBanner({ currentSurface }: { currentSurface: SurfaceKey }) {
  const setView = useAssessmentStore((state) => state.setView);

  if (currentSurface !== 'live' && currentSurface !== 'decision-lab') {
    return (
      <p className="m-0 rounded-control border border-dashed border-border bg-canvas px-3 py-2 text-small text-muted">
        {FORK_CHOICE_PROMPT}
      </p>
    );
  }

  const position = branchPosition(currentSurface);
  const onLive = currentSurface === 'live';

  return (
    <div
      className={cn(
        'grid gap-1 rounded-control border px-3 py-2',
        onLive ? 'border-accent-strong/50 bg-accent-soft' : 'border-success/50 bg-success/5',
      )}
    >
      <p className="m-0 text-small font-semibold text-heading">{position.heading}</p>
      <p className="m-0 text-micro text-muted">{position.detail}</p>
      <div>
        <button
          type="button"
          onClick={() => setView(position.siblingView)}
          className="inline-flex items-center gap-1 rounded-control border border-accent-strong/40 bg-paper px-2 py-1 text-micro font-bold uppercase tracking-[0.06em] text-accent-strong hover:bg-accent-soft"
        >
          {position.siblingAction}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function JourneyMap({ currentSurface }: { currentSurface: SurfaceKey }) {
  const assessment = nodeFor('assessment');
  const results = nodeFor('results');
  const live = nodeFor('live');
  const decisionLab = nodeFor('decision-lab');

  return (
    <Card aria-labelledby="journey-map-heading">
      <CardHeader>
        <CardTitle id="journey-map-heading">{JOURNEY_MAP_TITLE}</CardTitle>
        <p className="m-0 text-small text-muted">
          Results is one server calculation. QuickRisk Live and Decision Lab are two separate tools
          that start from it — one is not a step towards the other.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        <BranchPositionBanner currentSurface={currentSurface} />

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
          <JourneyNodeCard node={assessment} current={currentSurface === 'assessment'} />
          <div className="grid place-items-center text-muted" aria-hidden="true">
            <ArrowDown className="size-4 sm:hidden" />
            <ArrowRight className="hidden size-4 sm:block" />
          </div>
          <JourneyNodeCard node={results} current={currentSurface === 'results'} />
        </div>

        <p className="m-0 flex items-center justify-center gap-1.5 text-micro font-bold uppercase tracking-[0.08em] text-muted">
          <GitBranch aria-hidden="true" className="size-3.5" />
          Two independent branches from Results
        </p>

        <ForkArms />

        <div className={cn('grid gap-3', FORK_GRID)}>
          <JourneyNodeCard node={live} current={currentSurface === 'live'} branch="live" />
          <BranchDivider className="lg:min-h-full" />
          <JourneyNodeCard
            node={decisionLab}
            current={currentSurface === 'decision-lab'}
            branch="decision-lab"
          />
        </div>

        <p className="m-0 text-small text-muted">{JOURNEY_FORK_NOTE}</p>
      </CardContent>
    </Card>
  );
}
