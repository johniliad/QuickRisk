/**
 * Decision Lab — user-defined treatment form.
 *
 * The form collects only the fields the server validates. It labels the result as user-defined
 * and never claims curated evidence quality. All limits are enforced again by PHP.
 */

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox, Label } from '@/components/ui/field';
import type {
  CustomTreatmentDefinition,
  EffectEstimate,
  EvidenceQuality,
  MechanismGroup,
} from '@/decision/domain/decisionTypes';

interface EffectDraft {
  readonly min: string;
  readonly mostLikely: string;
  readonly max: string;
}

const DEFAULT_EFFECT: EffectDraft = { min: '0.10', mostLikely: '0.20', max: '0.30' };

const inputClass =
  'min-h-9 w-full rounded-control border border-border bg-paper px-3 text-small text-ink';

const parseEffect = (draft: EffectDraft, label: string): EffectEstimate => {
  const raw = [draft.min, draft.mostLikely, draft.max];
  if (raw.some((entry) => entry.trim() === '')) {
    throw new Error(`${label} needs all three values: minimum, most likely and maximum.`);
  }
  const values = raw.map((entry) => Number(entry.trim()));
  if (values.some((entry) => !Number.isFinite(entry))) {
    throw new Error(`${label} needs a number for its minimum, most likely and maximum values.`);
  }
  const [min, mostLikely, max] = values;
  if (min < 0 || max > 0.95 || min > mostLikely || mostLikely > max) {
    throw new Error(`${label} must satisfy 0 ≤ minimum ≤ most likely ≤ maximum ≤ 0.95.`);
  }

  return { min, mostLikely, max };
};

const parseAmount = (value: string, label: string): number => {
  const amount = Number(value.trim() === '' ? '0' : value.trim());
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} must be zero or a positive number.`);
  }

  return amount;
};

export function CustomTreatmentForm({
  scenarios,
  mechanismGroups,
  evidenceLevels,
  busy,
  onCreate,
}: {
  scenarios: readonly { readonly code: string; readonly shortLabel: string }[];
  mechanismGroups: Readonly<Record<string, string>>;
  evidenceLevels: Readonly<Record<string, { readonly label: string }>>;
  busy: boolean;
  onCreate: (definition: CustomTreatmentDefinition) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [businessOutcome, setBusinessOutcome] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [assumptionNotes, setAssumptionNotes] = useState('');
  const [mechanismGroup, setMechanismGroup] = useState<string>('identity');
  const [evidenceQuality, setEvidenceQuality] = useState<string>('illustrative');
  const [selectedScenarios, setSelectedScenarios] = useState<readonly string[]>(['S1']);
  const [frequencyEnabled, setFrequencyEnabled] = useState(false);
  const [magnitudeEnabled, setMagnitudeEnabled] = useState(true);
  const [frequency, setFrequency] = useState<EffectDraft>(DEFAULT_EFFECT);
  const [magnitude, setMagnitude] = useState<EffectDraft>(DEFAULT_EFFECT);
  const [delayDays, setDelayDays] = useState('0');
  const [initialCost, setInitialCost] = useState('0');
  const [annualOperatingCost, setAnnualOperatingCost] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setBusinessOutcome('');
    setShortDescription('');
    setAssumptionNotes('');
    setMechanismGroup('identity');
    setEvidenceQuality('illustrative');
    setSelectedScenarios(['S1']);
    setFrequencyEnabled(false);
    setMagnitudeEnabled(true);
    setFrequency(DEFAULT_EFFECT);
    setMagnitude(DEFAULT_EFFECT);
    setDelayDays('0');
    setInitialCost('0');
    setAnnualOperatingCost('0');
    setError(null);
  };

  const submit = async () => {
    setError(null);
    if (name.trim() === '' || businessOutcome.trim() === '' || shortDescription.trim() === '') {
      setError('Name, business outcome and short description are required.');
      return;
    }
    if (assumptionNotes.trim() === '') {
      setError('State the assumption behind this treatment. It is shown in the report.');
      return;
    }
    if (selectedScenarios.length === 0) {
      setError('Select at least one scenario this treatment applies to.');
      return;
    }
    if (!frequencyEnabled && !magnitudeEnabled) {
      setError('State whether the treatment affects event frequency, loss magnitude or both.');
      return;
    }

    let definition: CustomTreatmentDefinition;
    try {
      const parsedDelay = Number(delayDays.trim() === '' ? '0' : delayDays.trim());
      if (!Number.isInteger(parsedDelay) || parsedDelay < 0 || parsedDelay > 1095) {
        throw new Error('The implementation delay must be a whole number of days between 0 and 1095.');
      }
      definition = {
        name: name.trim(),
        businessOutcome: businessOutcome.trim(),
        shortDescription: shortDescription.trim(),
        assumptionNotes: assumptionNotes.trim(),
        mechanismGroup: mechanismGroup as MechanismGroup,
        evidenceQuality: evidenceQuality as EvidenceQuality,
        applicableScenarios: [...selectedScenarios],
        causalEffects: {
          frequency: frequencyEnabled ? parseEffect(frequency, 'The frequency effect') : null,
          magnitude: magnitudeEnabled ? parseEffect(magnitude, 'The magnitude effect') : null,
        },
        implementationDelayDays: parsedDelay,
        initialCost: parseAmount(initialCost, 'The implementation cost'),
        annualOperatingCost: parseAmount(annualOperatingCost, 'The annual operating cost'),
      };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The treatment definition is not valid.');
      return;
    }

    setSubmitting(true);
    try {
      await onCreate(definition);
      reset();
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The treatment could not be saved.');
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = busy || submitting;

  if (!open) {
    return (
      <div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Plus aria-hidden="true" className="size-4" />
          Create a user-defined treatment
        </Button>
      </div>
    );
  }

  const effectFields = (
    enabled: boolean,
    setEnabled: (next: boolean) => void,
    draft: EffectDraft,
    setDraft: (next: EffectDraft) => void,
    idPrefix: string,
    label: string,
    help: string,
  ) => (
    <div className="grid gap-2 rounded-control border border-border p-3">
      <Checkbox
        id={`${idPrefix}-enabled`}
        checked={enabled}
        onCheckedChange={setEnabled}
        label={label}
        describedBy={`${idPrefix}-help`}
      />
      <p id={`${idPrefix}-help`} className="m-0 text-micro text-muted">
        {help}
      </p>
      {enabled ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {(['min', 'mostLikely', 'max'] as const).map((key) => (
            <div key={key} className="grid gap-1">
              <Label htmlFor={`${idPrefix}-${key}`}>
                {key === 'min' ? 'Minimum' : key === 'mostLikely' ? 'Most likely' : 'Maximum'}
              </Label>
              <input
                id={`${idPrefix}-${key}`}
                className={inputClass}
                type="number"
                min={0}
                max={0.95}
                step={0.01}
                value={draft[key]}
                onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="grid gap-3 rounded-card border border-accent-strong/40 bg-canvas p-4">
      <div>
        <p className="m-0 font-semibold text-heading">New user-defined treatment</p>
        <p className="m-0 text-small text-muted">
          This treatment is saved to your anonymous session and labeled as user-defined in every report.
          It is never presented as curated evidence.
        </p>
      </div>
      {error === null ? null : <Alert tone="danger" role="alert">{error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="custom-name">Name</Label>
          <input
            id="custom-name"
            className={inputClass}
            value={name}
            maxLength={160}
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="custom-outcome">Business outcome</Label>
          <input
            id="custom-outcome"
            className={inputClass}
            value={businessOutcome}
            maxLength={400}
            disabled={disabled}
            onChange={(event) => setBusinessOutcome(event.target.value)}
          />
        </div>
        <div className="grid gap-1 sm:col-span-2">
          <Label htmlFor="custom-description">Short description</Label>
          <input
            id="custom-description"
            className={inputClass}
            value={shortDescription}
            maxLength={400}
            disabled={disabled}
            onChange={(event) => setShortDescription(event.target.value)}
          />
        </div>
        <div className="grid gap-1 sm:col-span-2">
          <Label htmlFor="custom-assumptions">Assumption behind the effect</Label>
          <textarea
            id="custom-assumptions"
            className={`${inputClass} min-h-20 py-2`}
            value={assumptionNotes}
            maxLength={1000}
            disabled={disabled}
            onChange={(event) => setAssumptionNotes(event.target.value)}
          />
          <p className="m-0 text-micro text-muted">
            This note is shown in the Board Risk Pack. State what must be true for the effect estimate to hold.
          </p>
        </div>
      </div>


      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor="custom-mechanism">Mechanism group</Label>
          <select
            id="custom-mechanism"
            className={inputClass}
            value={mechanismGroup}
            disabled={disabled}
            onChange={(event) => setMechanismGroup(event.target.value)}
          >
            {Object.entries(mechanismGroups).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="custom-evidence">Evidence quality</Label>
          <select
            id="custom-evidence"
            className={inputClass}
            value={evidenceQuality}
            disabled={disabled}
            onChange={(event) => setEvidenceQuality(event.target.value)}
          >
            {Object.entries(evidenceLevels).map(([value, level]) => (
              <option key={value} value={value}>
                {level.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="grid gap-2 border-0 p-0">
        <legend className="text-small font-semibold text-heading">Applies to scenarios</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {scenarios.map((scenario) => (
            <Checkbox
              key={scenario.code}
              id={`custom-scenario-${scenario.code}`}
              checked={selectedScenarios.includes(scenario.code)}
              onCheckedChange={(checked) =>
                setSelectedScenarios((current) =>
                  checked
                    ? current.includes(scenario.code)
                      ? current
                      : [...current, scenario.code]
                    : current.filter((code) => code !== scenario.code),
                )
              }
              label={`${scenario.code} — ${scenario.shortLabel}`}
            />
          ))}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <p className="m-0 text-small font-semibold text-heading">Modelled effect</p>
        {effectFields(
          frequencyEnabled,
          setFrequencyEnabled,
          frequency,
          setFrequency,
          'custom-frequency',
          'Affects how often the event happens',
          'Enter shares between 0 and 0.95. The server draws one value from this range for the simulation.',
        )}
        {effectFields(
          magnitudeEnabled,
          setMagnitudeEnabled,
          magnitude,
          setMagnitude,
          'custom-magnitude',
          'Affects how much each event costs',
          'Enter shares between 0 and 0.95. This is an assumption, not a measured outcome.',
        )}
      </div>


      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor="custom-delay">Implementation delay (days)</Label>
          <input
            id="custom-delay"
            className={inputClass}
            type="number"
            min={0}
            max={1095}
            step={1}
            value={delayDays}
            disabled={disabled}
            onChange={(event) => setDelayDays(event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="custom-initial">Initial cost</Label>
          <input
            id="custom-initial"
            className={inputClass}
            type="number"
            min={0}
            step={1}
            value={initialCost}
            disabled={disabled}
            onChange={(event) => setInitialCost(event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="custom-annual">Annual operating cost</Label>
          <input
            id="custom-annual"
            className={inputClass}
            type="number"
            min={0}
            step={1}
            value={annualOperatingCost}
            disabled={disabled}
            onChange={(event) => setAnnualOperatingCost(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void submit()} disabled={disabled}>
          Save user-defined treatment
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={disabled}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

