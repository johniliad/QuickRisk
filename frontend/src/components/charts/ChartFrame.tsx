import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Accessible chart frame.
 *
 * Every chart is accompanied by (a) a plain-language textual summary that is always
 * available to assistive technology and (b) a collapsed data table containing the
 * same numbers. Colour is therefore never the only way to read a value.
 */
export function ChartFrame({
  id,
  title,
  description,
  summary,
  table,
  height = 280,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: string;
  summary: string;
  table?: ReactNode;
  height?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn('m-0 grid gap-2', className)} aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="text-[1.02rem] font-semibold text-heading">
        {title}
      </figcaption>
      {description === undefined ? null : <p className="m-0 text-small text-muted">{description}</p>}
      <p className="qk-visually-hidden">{summary}</p>
      <div aria-hidden="true" style={{ height }} className="w-full">
        {children}
      </div>
      {table === undefined ? null : (
        <details className="text-small">
          <summary className="cursor-pointer font-semibold text-accent-strong">
            Show the underlying values
          </summary>
          <div className="mt-2 overflow-x-auto">{table}</div>
        </details>
      )}
    </figure>
  );
}

export const chartColours = {
  accent: '#087e83',
  accentStrong: '#075e65',
  accentSoft: '#e7f4f2',
  muted: '#526675',
  border: '#dce6e9',
  warning: '#8a4b00',
  danger: '#a32d2d',
  success: '#1f6f5c',
  ink: '#142b3b',
} as const;

export const axisProps = {
  tick: { fill: chartColours.muted, fontSize: 12 },
  stroke: chartColours.border,
} as const;
