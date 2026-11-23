import { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { DisclaimerBlock, PrivacyNotice } from '@/components/layout/DisclaimerBlock';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import {
  CORE_DISCLOSURE,
  DECISION_DISCLOSURE,
  LIVE_DISCLOSURE,
  type DisclosureRow,
} from '@/content/plainLanguage';
import { cn } from '@/lib/cn';
import { publicModel } from '@/model';

/**
 * Reference material, moved out of primary navigation.
 *
 * Methodology, data handling and the disclaimer were three of the eight top-level links,
 * which made reading them look like a destination. They are now modals opened from the
 * header, the footer and the landing trust strip, so the same words are one click away from
 * wherever the question is asked.
 *
 * The methodology modal is tabbed across the three surfaces that do their own arithmetic.
 * Each tab renders the published business-to-model mapping that already drives the
 * "How these numbers are produced" panel, so the reference cannot contradict the results
 * screens.
 */

type MethodologyTabKey = 'baseline' | 'live' | 'decision';

const METHODOLOGY_TABS: readonly { key: MethodologyTabKey; label: string; lede: string }[] = [
  {
    key: 'baseline',
    label: 'Baseline FAIR-QK',
    lede: 'The questionnaire, the five scenarios and the server-side simulation behind the results page.',
  },
  {
    key: 'live',
    label: 'Live SOC overlay',
    lede: 'The synthetic SOC multiplier that QuickRisk Live applies to one scenario in the browser.',
  },
  {
    key: 'decision',
    label: 'Decision Lab & FAIR-CAM',
    lede: 'Treatment effects, the appetite verdict and risk-reduction efficiency per euro spent.',
  },
];

function rowsFor(tab: MethodologyTabKey): readonly DisclosureRow[] {
  switch (tab) {
    case 'live':
      return LIVE_DISCLOSURE;
    case 'decision':
      return DECISION_DISCLOSURE;
    default:
      return CORE_DISCLOSURE;
  }
}

function DisclosureTable({ rows }: { rows: readonly DisclosureRow[] }) {
  return (
    <dl className="m-0 grid gap-3">
      {rows.map((row) => (
        <div key={row.business} className="rounded-card border border-border bg-canvas p-3">
          <dt className="m-0 text-small font-semibold text-heading">{row.business}</dt>
          <dd className="m-0 mt-1 grid gap-1 text-small text-muted">
            <p className="m-0">
              <span className="font-semibold text-ink">Model: </span>
              {row.model}
            </p>
            <p className="m-0">{row.formula}</p>
            <p className="m-0 text-micro">{row.source}</p>
          </dd>
        </div>
      ))}
    </dl>
  );
}


export function MethodologyModal({
  open,
  onClose,
  onOpenFullMethodology,
}: {
  open: boolean;
  onClose: () => void;
  onOpenFullMethodology: () => void;
}) {
  const [tab, setTab] = useState<MethodologyTabKey>('baseline');
  const { version } = publicModel;

  // Reopen on the baseline tab: a modal that remembers the last tab of a previous visit
  // starts the next reader inside a section they did not ask for.
  useEffect(() => {
    if (open) {
      setTab('baseline');
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} eyebrow="Reference" title="Methodology & calibration">
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Methodology sections">
          {METHODOLOGY_TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={tab === entry.key}
              onClick={() => setTab(entry.key)}
              className={cn(
                'min-h-9 rounded-control border px-3 text-small font-semibold transition-colors',
                tab === entry.key
                  ? 'border-accent-strong bg-accent-strong text-white'
                  : 'border-border bg-paper text-ink hover:bg-accent-soft hover:text-accent-strong',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <p className="m-0 text-small text-muted">
          {METHODOLOGY_TABS.find((entry) => entry.key === tab)?.lede}
        </p>

        <DisclosureTable rows={rowsFor(tab)} />

        <p className="m-0 text-micro text-muted">
          Model {version.modelId} model {version.modelVersion} · calibration {version.calibrationVersion} ·{' '}
          {version.defaultIterations.toLocaleString('en-GB')} simulated years per scenario · schema{' '}
          {version.schemaVersion}.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onClose();
              onOpenFullMethodology();
            }}
          >
            Open the full methodology page
            <ExternalLink aria-hidden="true" className="size-4" />
          </Button>
          <p className="m-0 text-micro text-muted">
            The full page also states the limitations, the evidence sources and the annualisation caveat.
          </p>
        </div>
      </div>
    </Modal>
  );
}

export function DisclaimerModal({
  open,
  onClose,
  onOpenFullDisclaimer,
}: {
  open: boolean;
  onClose: () => void;
  onOpenFullDisclaimer: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} eyebrow="Reference" title="Scope and disclaimer">
      <div className="grid gap-5">
        <DisclaimerBlock />
        <PrivacyNotice />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              onClose();
              onOpenFullDisclaimer();
            }}
          >
            Read the disclaimer and start
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
          <p className="m-0 text-micro text-muted">
            The assessment cannot start until the disclaimer is acknowledged. The acknowledgement stays in this
            page and is never stored.
          </p>
        </div>
      </div>
    </Modal>
  );
}

