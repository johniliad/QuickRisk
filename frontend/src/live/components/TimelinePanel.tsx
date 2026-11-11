import { Pause, Play, RotateCcw, Save, Square, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, TableWrap } from '@/components/ui/table';
import { formatMoney } from '@/lib/format';
import type { SOCInputState, TimelineEntry } from '@/live/domain/socTypes';

const formatOffset = (offsetMs: number): string => {
  const totalSeconds = Math.round(offsetMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/**
 * Simulation timeline and replay.
 *
 * The replay uses a synthetic clock derived from the recorded offsets: it never reads the
 * system clock and never re-runs any randomness, so replaying the same steps always shows
 * the same scores.
 */
export function TimelinePanel({
  entries,
  symbol,
  onRecord,
  onClear,
  onRemove,
  onLoadState,
  onSave,
  busy,
  canSave,
  recordLabel,
  onRecordLabelChange,
}: {
  entries: readonly TimelineEntry[];
  symbol: string;
  onRecord: () => void;
  onClear: () => void;
  onRemove: (index: number) => void;
  onLoadState: (state: SOCInputState) => void;
  onSave: () => void;
  busy: boolean;
  canSave: boolean;
  recordLabel: string;
  onRecordLabelChange: (label: string) => void;
}) {
  const [playIndex, setPlayIndex] = useState<number | null>(null);

  useEffect(() => {
    if (playIndex === null) {
      return undefined;
    }
    if (playIndex >= entries.length) {
      setPlayIndex(null);

      return undefined;
    }
    const entry = entries[playIndex];
    onLoadState(entry.state);
    const timer = globalThis.setTimeout(
      () => setPlayIndex((current) => (current === null ? null : current + 1)),
      900,
    );

    return () => globalThis.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playIndex, entries.length]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Simulation timeline</CardTitle>
        <p className="m-0 text-small text-muted">
          Record the states that matter, then replay them. Each entry keeps the state and the result that
          the engine calculated at the time, so the trajectory is reproducible.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <label
              className="text-micro font-semibold uppercase tracking-[0.08em] text-muted"
              htmlFor="live-event-label"
            >
              Event label
            </label>
            <input
              id="live-event-label"
              className="min-h-9 w-56 rounded-control border border-border bg-paper px-3 text-small"
              value={recordLabel}
              maxLength={160}
              onChange={(event) => onRecordLabelChange(event.target.value)}
              placeholder="e.g. IOC confirmed"
            />
          </div>
          <Button size="sm" onClick={onRecord} disabled={busy}>
            Record current state
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPlayIndex(0)}
            disabled={entries.length === 0 || playIndex !== null}
          >
            <Play aria-hidden="true" className="size-4" />
            Play
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPlayIndex(null)} disabled={playIndex === null}>
            <Pause aria-hidden="true" className="size-4" />
            Pause
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPlayIndex((current) => (current === null ? 0 : current + 1))}
            disabled={entries.length === 0}
          >
            <Square aria-hidden="true" className="size-3.5" />
            Step
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPlayIndex(null)}>
            <RotateCcw aria-hidden="true" className="size-4" />
            Reset replay
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear} disabled={entries.length === 0}>
            <Trash2 aria-hidden="true" className="size-4" />
            Clear timeline
          </Button>
          <Button size="sm" onClick={onSave} disabled={!canSave || busy || entries.length === 0}>
            <Save aria-hidden="true" className="size-4" />
            Save timeline
          </Button>
        </div>

        {entries.length === 0 ? (
          <p className="m-0 text-small text-muted">
            No timeline entries yet. Record a state, or apply a demonstration scenario to load a prepared
            sequence.
          </p>
        ) : (
          <TableWrap>
            <Table>
              <caption className="mb-2 text-left text-micro text-muted">
                Simulation time is relative to the first recorded state.
              </caption>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>#</TableHeaderCell>
                  <TableHeaderCell>Time</TableHeaderCell>
                  <TableHeaderCell>Event</TableHeaderCell>
                  <TableHeaderCell>Risk</TableHeaderCell>
                  <TableHeaderCell>Multiplier</TableHeaderCell>
                  <TableHeaderCell>Real-Time EAL</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((entry, index) => (
                  <TableRow key={`${entry.offsetMs}-${index}`}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{formatOffset(entry.offsetMs)}</TableCell>
                    <TableCell>{entry.label}</TableCell>
                    <TableCell className="font-semibold">
                      {entry.result.realTimeRisk} — {entry.result.riskBand}
                    </TableCell>
                    <TableCell>{entry.result.socMultiplier.toFixed(2)}x</TableCell>
                    <TableCell>{formatMoney(entry.result.realTimeEal, symbol)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => onLoadState(entry.state)}>
                          Load
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => onRemove(index)}>
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrap>
        )}
      </CardContent>
    </Card>
  );
}
