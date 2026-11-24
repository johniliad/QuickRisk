import { useId } from 'react';
import { useAssessmentStore } from '@/state/assessmentStore';

/**
 * Optional organisation-specific observation.
 *
 * Leaving the field blank retains the reference-class posterior. A supplied count is used as
 * a Poisson likelihood; it never leaves the in-memory request and is not persisted.
 */
export function EvidenceCard() {
  const inputId = useId();
  const evidence = useAssessmentStore((state) => state.organisationEvidence);
  const setOrganisationEvidence = useAssessmentStore((state) => state.setOrganisationEvidence);
  const value = evidence.materialLossEventCount;

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      className="rounded-panel border border-line-subtle bg-surface-raised p-5 shadow-panel"
    >
      <p className="m-0 text-eyebrow font-semibold uppercase tracking-[0.16em] text-ink-muted">
        Optional evidence
      </p>
      <h2 id={`${inputId}-heading`} className="mt-1 font-display text-xl text-ink-strong">
        Material loss events in the last 12 months
      </h2>
      <p className="mt-2 max-w-prose text-small text-ink-muted">
        Enter the number of incidents that caused a non-zero financial loss. This updates the
        reference-class posterior through a Poisson likelihood. Leave it blank if you do not know;
        the published reference evidence is then retained without a penalty.
      </p>
      <div className="mt-4 max-w-xs">
        <label htmlFor={inputId} className="text-small font-semibold text-ink-strong">
          Event count (0–1000)
        </label>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={0}
          max={1000}
          step={1}
          value={value ?? ''}
          placeholder="Unknown"
          className="mt-2 w-full rounded-control border border-line-strong bg-surface-base px-3 py-2 text-ink-strong outline-none focus-visible:ring-2 focus-visible:ring-accent-strong"
          onChange={(event) => {
            const raw = event.target.value.trim();
            if (raw === '') {
              setOrganisationEvidence({ materialLossEventCount: null });
              return;
            }
            const parsed = Number.parseInt(raw, 10);
            if (!Number.isFinite(parsed)) {
              return;
            }
            setOrganisationEvidence({
              materialLossEventCount: Math.min(1000, Math.max(0, parsed)),
            });
          }}
        />
      </div>
      <p className="mt-3 text-caption text-ink-muted">
        This observation is inferred from your answer and is held only in this tab. It is excluded
        from reports and Board Risk Packs.
      </p>
    </section>
  );
}
