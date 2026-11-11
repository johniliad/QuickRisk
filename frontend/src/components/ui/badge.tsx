import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, CircleHelp, Info, ShieldAlert } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { precisionFor } from '@/content/plainLanguage';
import type { ConfidenceLevel } from '@/domain/results';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-control border px-2 py-0.5 text-micro font-semibold',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-canvas text-muted',
        accent: 'border-accent-strong/30 bg-accent-soft text-accent-strong',
        success: 'border-success/40 bg-success/10 text-success',
        warning: 'border-warning/40 bg-warning/10 text-warning',
        danger: 'border-danger/40 bg-danger/10 text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/**
 * Input-confidence indicator.
 *
 * This reports the heuristic input-confidence level returned by the model, never statistical
 * confidence. Colour is never the only signal: each level also carries an icon and its own
 * text label, so the meaning survives greyscale printing and colour-blind viewing.
 */
export function ConfidenceBadge({
  level,
  score,
  className,
}: {
  level: ConfidenceLevel;
  score?: number;
  className?: string;
}) {
  const tone = level === 'High' ? 'success' : level === 'Medium' ? 'warning' : 'danger';
  const Icon = level === 'High' ? CheckCircle2 : level === 'Medium' ? Info : AlertTriangle;
  const precision = precisionFor(level);

  return (
    <Badge tone={tone} className={className}>
      <Icon aria-hidden="true" className="size-3.5" />
      <span>
        Precision: {precision}
        {score === undefined ? '' : ` (${score}/100)`}
      </span>
    </Badge>
  );
}

/**
 * Risk indicator used for rankings and threshold probabilities. Always shows the
 * rank and the numeric value alongside any colour.
 */
export function RiskIndicator({
  label,
  value,
  tone = 'accent',
  className,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const Icon = tone === 'danger' ? ShieldAlert : tone === 'warning' ? AlertTriangle : CircleHelp;

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Icon aria-hidden="true" className="size-4 shrink-0 text-muted" />
      <span className="text-micro font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </span>
  );
}
