import { AlertTriangle, Info, OctagonAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type AlertTone = 'info' | 'warning' | 'danger' | 'neutral';

const toneClasses: Record<AlertTone, string> = {
  info: 'border-accent-strong/25 bg-accent-soft text-ink',
  warning: 'border-warning/30 bg-warning/5 text-ink',
  danger: 'border-danger/35 bg-danger/5 text-ink',
  neutral: 'border-border bg-canvas text-ink',
};

const toneIcon: Record<AlertTone, ReactNode> = {
  info: <Info aria-hidden="true" className="size-5 shrink-0 text-accent-strong" />,
  warning: <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-warning" />,
  danger: <OctagonAlert aria-hidden="true" className="size-5 shrink-0 text-danger" />,
  neutral: <Info aria-hidden="true" className="size-5 shrink-0 text-muted" />,
};

export function Alert({
  tone = 'info',
  title,
  children,
  className,
  role = 'note',
}: {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  className?: string;
  role?: 'note' | 'alert' | 'status';
}) {
  return (
    <div
      role={role}
      className={cn('flex gap-3 rounded-card border p-4', toneClasses[tone], className)}
    >
      {toneIcon[tone]}
      <div className="grid gap-1">
        {title === undefined ? null : <p className="m-0 font-semibold text-heading">{title}</p>}
        <div className="m-0 text-small leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="qk-visually-hidden">{children}</span>;
}
