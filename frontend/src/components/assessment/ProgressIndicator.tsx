import { Progress } from '@/components/ui/field';
import { questionnaireMilestone, type QuestionnaireProgress } from '@/domain/assessment';

/**
 * Visible progress indicator for the questionnaire.
 *
 * Progress is computed from the model's question count, not from an estimate, and it
 * is announced through the progress element's aria-valuetext so that screen-reader
 * users hear the same information.
 *
 * The milestone line is the only forward-looking sentence in the questionnaire: it says
 * what finishes at the profile boundary and what finishes at the last scenario, so the
 * remaining effort is visible instead of being an unknown number of clicks.
 */
export function ProgressIndicator({
  progress,
  stepIndex,
  profileCount,
}: {
  progress: QuestionnaireProgress;
  stepIndex: number;
  profileCount: number;
}) {
  const milestone = questionnaireMilestone(stepIndex, profileCount, progress.total);

  return (
    <div className="grid gap-3 rounded-card border border-border bg-canvas p-4">
      <Progress
        value={progress.position}
        max={progress.total}
        label={`${progress.sectionLabel} — ${progress.questionLabel}`}
        valueText={`Step ${progress.position} of ${progress.total} · ${progress.answered} answered`}
      />
      {milestone === null ? null : (
        <p
          role="status"
          className="m-0 border-l-2 border-accent-strong pl-2 text-small font-semibold text-accent-strong"
        >
          {milestone}
        </p>
      )}
      <p className="m-0 text-micro text-muted">
        Answers stay in this page only. Nothing is saved, so refreshing or closing the page discards the
        assessment.
      </p>
    </div>
  );
}