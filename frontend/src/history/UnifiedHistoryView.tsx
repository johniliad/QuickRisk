import { useState } from 'react';
import { BranchNote } from '@/components/layout/BranchNote';
import { DecisionHistoryView } from '@/decision/DecisionHistoryView';
import { LiveHistoryView } from '@/live/LiveHistoryView';
import { HISTORY_BRANCH_NOTE, LIVE_SESSION_RETENTION_DAYS } from '@/content/dataLifecycle';
import { cn } from '@/lib/cn';

type HistoryTab = 'live' | 'decision';

const TABS: readonly { key: HistoryTab; label: string }[] = [
  { key: 'live', label: 'Live assessments — Branch A' },
  { key: 'decision', label: 'Decision analyses — Branch B' },
];

/**
 * One history destination for both saved surfaces.
 *
 * "History" in the header used to open QuickRisk Live only, while Decision Lab kept a
 * separate saved list inside its own screen. Both lists answer the same question, so
 * they now share one page with two tabs, and each tab keeps its existing behaviour.
 */
export function UnifiedHistoryView() {
  const [tab, setTab] = useState<HistoryTab>('live');

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">Saved work</p>
        <h1 className="m-0 text-title font-bold text-heading">Your saved work</h1>
        <p className="m-0 max-w-[46rem] text-small text-muted">
          Everything you have saved is listed here and belongs to this browser&apos;s anonymous session. It
          expires after {LIVE_SESSION_RETENTION_DAYS} days, and clearing cookies ends access immediately.
        </p>
        <p className="m-0 max-w-[46rem] text-small text-muted">
          Each saved record can be printed to PDF, and both surfaces can produce a read-only link that you can
          revoke without deleting the record.
        </p>
        <BranchNote>{HISTORY_BRANCH_NOTE}</BranchNote>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Saved work">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={tab === entry.key}
              className={cn(
                'rounded-control border px-3 py-1.5 text-small font-semibold',
                tab === entry.key
                  ? 'border-accent-strong bg-accent-soft text-accent-strong'
                  : 'border-border bg-paper text-muted hover:bg-accent-soft hover:text-accent-strong',
              )}
              onClick={() => setTab(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'live' ? <LiveHistoryView /> : <DecisionHistoryView />}
    </div>
  );
}
