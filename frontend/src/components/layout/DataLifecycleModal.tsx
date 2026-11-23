import { History, RotateCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import {
  CROSS_SURFACE_NOTE,
  DATA_CONTROLS,
  DATA_LIFECYCLE,
  retentionSentence,
} from '@/content/dataLifecycle';

/**
 * "Where your data goes" — the one place that explains, for every surface, what is
 * stored, for how long and what the visitor gets out of it.
 *
 * The wording comes from `@/content/dataLifecycle`, which is pinned by a unit test, so
 * this panel cannot drift from the documented zero-retention and session behaviour.
 */
export function DataLifecycleModal({
  open,
  onClose,
  onStartOver,
  onOpenHistory,
}: {
  open: boolean;
  onClose: () => void;
  onStartOver: () => void;
  onOpenHistory: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} eyebrow="QuickRisk" title="Where your data goes">
      <div className="grid gap-4">
        <p className="m-0 text-small leading-relaxed text-ink">{CROSS_SURFACE_NOTE}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          {DATA_LIFECYCLE.map((surface) => (
            <div key={surface.key} className="grid gap-1.5 rounded-card border border-border bg-canvas p-3">
              <p className="m-0 text-micro font-bold uppercase tracking-[0.08em] text-accent-strong">
                {surface.name}
              </p>
              <p className="m-0 text-small text-ink">
                <span className="font-semibold">Stored: </span>
                {surface.storage}
              </p>
              <p className="m-0 text-small text-ink">
                <span className="font-semibold">Deleted: </span>
                {surface.lifetime}
              </p>
              <p className="m-0 text-micro text-muted">Outputs: {surface.outputs.join(' · ')}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-1">
          <p className="m-0 font-semibold text-heading">Your controls</p>
          <ul className="m-0 grid gap-1 pl-5 text-small text-muted">
            {DATA_CONTROLS.map((control) => (
              <li key={control.slice(0, 40)}>{control}</li>
            ))}
          </ul>
          <p className="m-0 text-micro text-muted">{retentionSentence()}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onOpenHistory}>
            <History aria-hidden="true" className="size-4" />
            Open saved work
          </Button>
          <Button size="sm" variant="ghost" onClick={onStartOver}>
            <RotateCcw aria-hidden="true" className="size-4" />
            Start over…
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <ShieldCheck aria-hidden="true" className="size-4" />
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
