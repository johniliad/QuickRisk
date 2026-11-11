import { Alert } from '@/components/ui/alert';
import { publicModel } from '@/model';

/**
 * Mandatory disclaimer.
 *
 * The full wording is versioned in the authoritative model (DISC-1.2) and appears
 * before the assessment, in the footer, on the methodology view and on the report.
 * The acknowledgement is held in browser memory only and is never stored.
 */
export function DisclaimerBlock({ variant = 'full' }: { variant?: 'full' | 'short' }) {
  const { disclaimer } = publicModel.content;

  if (variant === 'short') {
    return (
      <Alert tone="warning" title={disclaimer.title}>
        <p className="m-0">{disclaimer.shortForm}</p>
      </Alert>
    );
  }

  return (
    <section aria-labelledby="disclaimer-heading" className="grid gap-3">
      <h2
        id="disclaimer-heading"
        className="m-0 rounded-control bg-danger/5 px-3 py-2 text-[1.05rem] font-bold uppercase tracking-[0.04em] text-danger"
      >
        {disclaimer.title}
      </h2>
      <div className="grid gap-3 text-[0.97rem] leading-relaxed text-ink">
        {disclaimer.paragraphs.map((paragraph) => (
          <p key={paragraph.slice(0, 48)} className="m-0">
            {paragraph}
          </p>
        ))}
      </div>
      <p className="m-0 text-micro text-muted">{disclaimer.legalReviewNote}</p>
    </section>
  );
}

/**
 * Zero-retention privacy statement. Shown before the assessment and again next to the
 * calculation controls.
 */
export function PrivacyNotice({ showDetail = false }: { showDetail?: boolean }) {
  const { privacyNotice } = publicModel.content;

  return (
    <section aria-labelledby="privacy-heading" className="grid gap-2">
      <h2 id="privacy-heading" className="m-0 text-[1.05rem] font-semibold text-heading">
        {privacyNotice.title}
      </h2>
      <p className="m-0 max-w-[48rem] text-small text-ink">{privacyNotice.statement}</p>
      {showDetail ? (
        <ul className="m-0 grid max-w-[52rem] gap-1 pl-5 text-small text-muted">
          {privacyNotice.detail.map((item) => (
            <li key={item.slice(0, 48)}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
