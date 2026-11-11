import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AnswerOption } from '@/domain/model';
import { cn } from '@/lib/cn';

export function Label({ className, ...props }: LabelPrimitive.LabelProps) {
  return <LabelPrimitive.Root className={cn('text-small font-semibold text-heading', className)} {...props} />;
}

export function HelpText({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="m-0 text-small text-muted">
      {children}
    </p>
  );
}

/**
 * Single-choice answer list. Implemented with a Radix radio group so that arrow-key
 * navigation, roving focus and screen-reader semantics are correct by construction.
 */
export function OptionList({
  idPrefix,
  options,
  value,
  onValueChange,
  labelledBy,
  describedBy,
  disabled = false,
}: {
  idPrefix: string;
  options: readonly AnswerOption[];
  value: string | undefined;
  onValueChange: (optionCode: string) => void;
  labelledBy?: string;
  describedBy?: string;
  disabled?: boolean;
}) {
  return (
    <RadioGroupPrimitive.Root
      className="grid gap-2"
      value={value ?? ''}
      onValueChange={onValueChange}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
    >
      {options.map((option) => {
        const optionId = `${idPrefix}-${option.code}`;
        const selected = value === option.code;
        return (
          <label
            key={option.code}
            htmlFor={optionId}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors',
              selected ? 'border-accent-strong bg-accent-soft' : 'border-border bg-paper hover:bg-canvas',
              option.unknown === true && 'text-muted',
            )}
          >
            <RadioGroupPrimitive.Item
              id={optionId}
              value={option.code}
              className="mt-[0.15rem] grid size-5 shrink-0 place-items-center rounded-full border-2 border-accent-strong data-[state=checked]:bg-accent-strong"
            >
              <RadioGroupPrimitive.Indicator className="grid place-items-center">
                <span aria-hidden="true" className="block size-2 rounded-full bg-white" />
              </RadioGroupPrimitive.Indicator>
            </RadioGroupPrimitive.Item>
            <span className="text-[0.95rem] leading-snug">{option.label}</span>
          </label>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}

export function Checkbox({
  id,
  checked,
  onCheckedChange,
  label,
  describedBy,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  describedBy?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <CheckboxPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        aria-describedby={describedBy}
        className="mt-[0.2rem] grid size-5 shrink-0 place-items-center rounded-[0.2rem] border-2 border-accent-strong data-[state=checked]:bg-accent-strong"
      >
        <CheckboxPrimitive.Indicator>
          <Check aria-hidden="true" className="size-4 text-white" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <LabelPrimitive.Root htmlFor={id} className="text-body font-normal text-ink">
        {label}
      </LabelPrimitive.Root>
    </div>
  );
}

export function Progress({
  value,
  max,
  label,
  valueText,
}: {
  value: number;
  max: number;
  label: string;
  valueText: string;
}) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((value / max) * 100)));

  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-small font-semibold text-heading">{label}</span>
        <span className="text-small text-muted">{valueText}</span>
      </div>
      <ProgressPrimitive.Root
        value={percent}
        max={100}
        aria-label={label}
        aria-valuetext={valueText}
        className="h-2 w-full overflow-hidden rounded-full bg-border"
      >
        <ProgressPrimitive.Indicator
          className="h-full rounded-full bg-accent-strong transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </ProgressPrimitive.Root>
    </div>
  );
}
