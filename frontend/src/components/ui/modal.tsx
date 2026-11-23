import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Minimal modal used for the data-handling explanation and the start-over confirmation.
 *
 * It is deliberately small: an overlay, a labelled panel, Escape to dismiss and initial
 * focus on the panel so keyboard users do not stay behind the overlay. Closing by
 * clicking the overlay is supported, and the panel stops the click from bubbling.
 */
export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    panelRef.current?.focus();

    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'my-auto max-h-[85vh] w-full max-w-[52rem] overflow-y-auto rounded-card border border-border bg-paper p-5 shadow-raised outline-none sm:p-6',
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="grid gap-1">
            {eyebrow === undefined ? null : (
              <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">{eyebrow}</p>
            )}
            <h2 id={titleId} className="m-0 text-[var(--text-section)] font-bold text-heading">
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-control border border-border text-muted hover:bg-accent-soft hover:text-accent-strong"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
