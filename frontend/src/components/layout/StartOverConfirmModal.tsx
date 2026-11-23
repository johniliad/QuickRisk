import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { LIVE_SESSION_RETENTION_DAYS } from '@/content/dataLifecycle';

/**
 * Confirmation for "Start over".
 *
 * Resetting the assessment silently discarded answers, results and the dependent Live
 * simulation. The confirmation states exactly what is lost and — equally important —
 * what survives in the anonymous session.
 */
export function StartOverConfirmModal({
  open,
  answered,
  total,
  hasAnswers,
  hasResults,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  answered: number;
  total: number;
  hasAnswers: boolean;
  hasResults: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} eyebrow="Assessment" title="Start a new assessment?">
      <div className="grid gap-4">
        <p className="m-0 text-small text-ink">This discards, immediately and without a copy:</p>
        <ul className="m-0 grid gap-1 pl-5 text-small text-ink">
          {hasAnswers ? (
            <li>
              Your answers — {answered} of {total} questions answered, held in this tab only.
            </li>
          ) : (
            <li>Any answers held in this tab (none at the moment).</li>
          )}
          {hasResults ? <li>Your computed results in this tab.</li> : null}
          <li>The Live simulation in this tab, unless you saved it.</li>
          <li>The Decision Lab analysis in this tab, unless you saved it.</li>
        </ul>
        <p className="m-0 text-small text-muted">
          Saved Live assessments and saved Decision Lab analyses stay in your anonymous session for up to{' '}
          {LIVE_SESSION_RETENTION_DAYS} days. Use History to archive them if you want them deleted.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm}>
            Discard and start over
          </Button>
        </div>
      </div>
    </Modal>
  );
}
