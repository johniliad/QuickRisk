import { Progress } from '@/components/ui/field';
import type { QuestionnaireProgress } from '@/domain/assessment';

/**
 * Visible progress indicator for the questionnaire.
 *
 * Progress is computed from the model's question count, not from an estimate, and it
 * is announced through the progress element's aria-valuetext so that screen-reader
 * users hear the same information.
 */
export function ProgressIndicator({ progress }: { progress: QuestionnaireProgress }) {
  return (
    <div className="grid gap-3 rounded-card border border-border bg-canvas p-4">
      <Progress
        value={progress.position}
        max={progress.total}
        label={`${progress.sectionLabel} — ${progress.questionLabel}`}
        valueText={`Step ${progress.position} of ${progress.total} · ${progress.answered} answered`}
      />
      <p className="m-0 text-micro text-muted">
        Answers stay in this page only. Nothing is saved, so refreshing or closing the page discards the
        assessment.
      </p>
    </div>
  );
}
