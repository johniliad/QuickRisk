import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Calculator } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { HelpText, OptionList } from '@/components/ui/field';
import type { QuestionStep } from '@/domain/assessment';
import type { OptionSet } from '@/domain/model';

/**
 * One question card at a time.
 *
 * The question text, help text and answer options all come from the authoritative
 * model, and the answer controls are keyboard-accessible radio options. Motion is
 * used only for a short transition between cards and never obscures values.
 */
export function QuestionCard({
  step,
  optionSet,
  value,
  error,
  isLast,
  onSelect,
  onBack,
  onNext,
}: {
  step: QuestionStep;
  optionSet: OptionSet;
  value: string | undefined;
  error: string | null;
  isLast: boolean;
  onSelect: (optionCode: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const headingId = `${step.key}-heading`;
  const helpId = `${step.key}-help`;

  return (
    <motion.div
      key={step.key}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="grid gap-4"
    >
      <Card>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <p className="m-0 text-micro font-bold uppercase tracking-[0.1em] text-accent-strong">
              {step.sectionLabel}
            </p>
            <h2 id={headingId} className="m-0 text-[1.22rem] font-semibold leading-snug text-heading">
              {step.text}
            </h2>
            <HelpText id={helpId}>{step.help}</HelpText>
          </div>

          <OptionList
            idPrefix={step.key}
            options={optionSet.options}
            value={value}
            onValueChange={onSelect}
            labelledBy={headingId}
            describedBy={helpId}
          />

          {step.required ? null : (
            <p className="m-0 text-micro text-muted">
              Optional. If you leave this unanswered, the model treats it as Unknown and widens the range.
            </p>
          )}

          {error === null ? null : (
            <Alert tone="warning" role="alert">
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back
        </Button>
        <Button size="lg" onClick={onNext} disabled={step.required && value === undefined}>
          {isLast ? (
            <>
              <Calculator aria-hidden="true" className="size-4" />
              Calculate indicative exposure
            </>
          ) : (
            <>
              Next
              <ArrowRight aria-hidden="true" className="size-4" />
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}
