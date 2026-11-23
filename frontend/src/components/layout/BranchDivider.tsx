import { Unlink } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Column template shared by the fork arms and the two lane cards.
 *
 * Both rows must use the same template, and the middle column must be a fixed width, or the
 * arms would be sized from their own empty content and the drops would miss the centre of
 * the lane cards. Exporting the template keeps the two rows in step by construction.
 */
export const FORK_GRID = 'lg:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)]';

/**
 * The visual statement that the two branches never join again.
 *
 * Two cards placed side by side still read as a sequence when they touch, so every place
 * that shows QuickRisk Live next to Decision Lab puts this divider between them: an explicit
 * "Not connected" pill, joined by a rule only when the lanes stack on narrow screens. On
 * wide screens the pill sits alone in the gap — a vertical rule there would draw a spine
 * joining the two branches, which is the reading the divider exists to prevent. The rule is
 * decoration; the label is the real sentence, so the meaning survives greyscale printing and
 * screen readers.
 */
export function BranchDivider({
  label = 'Not connected',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('flex items-center justify-center gap-2 self-stretch lg:flex-col lg:gap-1', className)}
    >
      <span aria-hidden="true" className="h-px flex-1 bg-border lg:hidden" />
      <span className="inline-flex shrink-0 items-center gap-1 rounded-control border border-dashed border-border bg-canvas px-2 py-1 text-micro font-bold uppercase tracking-[0.08em] text-muted">
        <Unlink aria-hidden="true" className="size-3.5" />
        {label}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-border lg:hidden" />
    </div>
  );
}

/**
 * The two arms that carry the branches away from their shared parent.
 *
 * Rendered as a row directly above the lane cards, using {@link FORK_GRID}: a bar leaves the
 * horizontal centre of the left lane, runs through the divider column, reaches the centre of
 * the right lane, and a stem rises from the middle of that bar towards the parent node and
 * its label. Without the geometry the two lanes read as two more rows in a list, which is
 * exactly the reading the fork exists to prevent. Purely decorative, so it is hidden from
 * assistive technology; the lane labels carry the meaning.
 */
export function ForkArms({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('hidden h-6 lg:grid lg:-mb-3', FORK_GRID, className)}>
      <div className="relative">
        <span className="absolute left-1/2 right-0 top-0 h-px bg-border" />
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border" />
      </div>
      <div className="relative">
        <span className="absolute inset-x-0 top-0 h-px bg-border" />
        <span className="absolute bottom-full left-1/2 h-3 w-px -translate-x-1/2 bg-border" />
      </div>
      <div className="relative">
        <span className="absolute left-0 right-1/2 top-0 h-px bg-border" />
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border" />
      </div>
    </div>
  );
}
