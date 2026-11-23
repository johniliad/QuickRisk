import { GitBranch } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * One line that names the branch an artefact belongs to.
 *
 * The full fork diagram is too much for a printed report or a saved list, but a reader who
 * arrives from the other branch still needs to know these figures are unrelated to it. The
 * icon is decorative; the sentence is the statement, so it survives greyscale printing and
 * screen readers.
 */
export function BranchNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'm-0 flex items-start gap-1.5 rounded-control border border-dashed border-border bg-canvas px-3 py-2 text-micro text-muted',
        className,
      )}
    >
      <GitBranch aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
