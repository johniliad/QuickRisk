import { Button } from '@/components/ui/button';
import { useAssessmentStore } from '@/state/assessmentStore';
import { publicModel } from '@/model';

/**
 * Application footer.
 *
 * The disclaimer short form and the zero-retention statement are repeated here, as
 * required, and the model/version identifiers are always visible.
 */
export function Footer() {
  const setView = useAssessmentStore((state) => state.setView);
  const { version, content } = publicModel;

  return (
    <footer className="mt-12 border-t border-border bg-canvas">
      <div className="qk-shell grid gap-6 py-8">
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="grid gap-2">
            <p className="m-0 text-micro font-bold uppercase tracking-[0.09em] text-muted">
              {content.disclaimer.title}
            </p>
            <p className="m-0 max-w-[48rem] text-small text-muted">{content.disclaimer.shortForm}</p>
          </div>
          <div className="grid gap-2">
            <p className="m-0 text-micro font-bold uppercase tracking-[0.09em] text-muted">
              {content.privacyNotice.title}
            </p>
            <p className="m-0 text-small text-muted">{content.privacyNotice.statement}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button variant="ghost" size="sm" onClick={() => setView('methodology')}>
            Methodology and limitations
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setView('disclaimer')}>
            Full disclaimer
          </Button>
          <a
            className="text-small font-semibold text-accent-strong"
            href="https://www.iliadis.net/"
          >
            www.iliadis.net
          </a>
        </div>

        <div className="grid gap-1 text-micro text-muted">
          <p className="m-0">
            {content.positioning.attribution.before}
            <a className="text-accent-strong underline" href={content.positioning.attribution.url}>
              {content.positioning.attribution.name}
            </a>
            {content.positioning.attribution.after}
          </p>
          <p className="m-0">
            Model {version.modelId} · schema {version.schemaVersion} · calibration{' '}
            {version.calibrationVersion} · application {version.applicationVersion} · disclaimer{' '}
            {version.disclaimerVersion} · questionnaire retention mode: {version.retentionMode} · {version.defaultIterations}{' '}
            iterations per scenario.
          </p>
        </div>
      </div>
    </footer>
  );
}
