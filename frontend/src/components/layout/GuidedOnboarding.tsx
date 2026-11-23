import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Guided onboarding for a module that needs a completed assessment.
 *
 * The empty states used to be a two-sentence dead end ("needs a baseline first"). This
 * panel explains the prerequisite, lists the three steps that satisfy it, and offers the
 * action that starts them, so a visitor arriving early is never stranded.
 */
export function GuidedOnboarding({
  eyebrow,
  title,
  description,
  steps,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  footnote,
}: {
  eyebrow: string;
  title: string;
  description: string;
  steps: readonly string[];
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  footnote?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">{eyebrow}</p>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="m-0 max-w-[46rem] text-small leading-relaxed text-ink">{description}</p>
        <div className="grid gap-2">
          <p className="m-0 text-micro font-bold uppercase tracking-[0.08em] text-muted">What happens first</p>
          <ol className="m-0 grid gap-1 pl-5 text-small text-ink">
            {steps.map((step, index) => (
              <li key={step.slice(0, 40)}>
                <span className="font-semibold">{index + 1}.</span> {step}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onPrimary}>
            {primaryLabel}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
          {secondaryLabel === undefined || onSecondary === undefined ? null : (
            <Button variant="secondary" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
        </div>
        {footnote === undefined ? null : <p className="m-0 text-micro text-muted">{footnote}</p>}
      </CardContent>
    </Card>
  );
}
