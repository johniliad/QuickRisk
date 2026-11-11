import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LiveScenarioPreset } from '@/live/api/liveClient';

/**
 * Demonstration scenario library.
 *
 * The definitions come from MySQL through the PHP API. Applying one loads its deterministic
 * SOC state into the simulator; the risk engine recalculates the score, so a stored preset can
 * never carry a stale result.
 */
export function PresetLibrary({
  presets,
  onApply,
  disabled = false,
  emptyMessage = 'The demonstration library is not available right now. You can still use the simulator manually.',
}: {
  presets: readonly LiveScenarioPreset[];
  onApply: (preset: LiveScenarioPreset) => void;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Demonstration scenario library</CardTitle>
        <p className="m-0 text-small text-muted">
          Curated synthetic sequences. A demonstration scenario is separate from the QuickRisk quantitative
          scenario you selected: the same preset can be applied against any QuickRisk baseline.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        {presets.length === 0 ? (
          <p className="m-0 text-small text-muted">{emptyMessage}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {presets.map((preset) => (
              <div key={preset.slug} className="grid gap-2 rounded-card border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="m-0 font-semibold text-heading">{preset.name}</p>
                  <span className="text-micro font-semibold uppercase tracking-[0.08em] text-muted">
                    {preset.category}
                  </span>
                </div>
                <p className="m-0 text-small text-muted">{preset.shortDescription}</p>
                <p className="m-0 text-micro text-muted">
                  Scenario version {preset.scenarioVersion} · {preset.timeline.length} timeline steps
                </p>
                <div>
                  <Button size="sm" variant="secondary" onClick={() => onApply(preset)} disabled={disabled}>
                    Apply scenario
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
