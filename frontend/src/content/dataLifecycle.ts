/**
 * Data-lifecycle wording shared by the banner, the modal, the results page and the
 * module screens.
 *
 * The statements here must stay true to the implementation:
 *
 * - the questionnaire and its results live in JavaScript memory only (enforced by
 *   `tools/verify-no-browser-storage.mjs` and `tests/zero_retention.test.php`);
 * - QuickRisk Live and Decision Lab persist only on an explicit save, into an anonymous
 *   server-side session whose TTL comes from `live.sessionTtlDays` (30 days by default,
 *   `server/includes/live/config.php`);
 * - a saved Decision Lab analysis deliberately does not contain the assessment answers.
 *
 * Keeping the numbers and sentences in one module means the UI cannot drift from the
 * documented behaviour without a failing test.
 */

import { formatIterations, formatMoney } from '@/lib/format';

/** Mirrors the default `live.sessionTtlDays` in `server/includes/live/config.php`. */
export const LIVE_SESSION_RETENTION_DAYS = 30;

export type SurfaceKey = 'assessment' | 'results' | 'live' | 'decision-lab';

export interface SurfaceLifecycle {
  readonly key: SurfaceKey;
  readonly name: string;
  readonly storage: string;
  readonly lifetime: string;
  readonly outputs: readonly string[];
}

export const DATA_LIFECYCLE: readonly SurfaceLifecycle[] = [
  {
    key: 'assessment',
    name: 'Assessment',
    storage: 'This browser tab only. The answers are held in JavaScript memory and are sent once to be calculated.',
    lifetime: 'Discarded when you refresh, close the tab or start over. Nothing is written to a database or to browser storage.',
    outputs: ['A printable report of the results (print or save as PDF).'],
  },
  {
    key: 'results',
    name: 'Results',
    storage: 'This browser tab only. The calculated response is kept in memory and is never given a results URL.',
    lifetime: 'Discarded with the assessment. A refresh discards the results; the answers are not stored to recover them.',
    outputs: ['On-screen dashboard', 'Printable report', 'Scenario detail and sensitivity view'],
  },
  {
    key: 'live',
    name: 'QuickRisk Live',
    storage:
      'Nothing until you save. A saved simulation is stored server-side against an anonymous session cookie — no name, email, organisation or IP address.',
    lifetime: 'Saved simulations expire with the anonymous session (30 days by default). Clearing cookies ends access immediately; archiving deletes the record from your list.',
    outputs: ['Saved simulation snapshot', 'Printable executive report', 'Read-only share link you can revoke'],
  },
  {
    key: 'decision-lab',
    name: 'Decision Lab',
    storage:
      'Nothing until you save. A saved analysis stores the result, the treatment set and the appetite status — not your questionnaire answers.',
    lifetime: 'Saved analyses expire with the anonymous session (30 days by default). Archiving removes the record and stops every share link.',
    outputs: ['Board Risk Pack (print or PDF)', 'Read-only Board Risk Pack link you can revoke', 'Saved analysis snapshot'],
  },
];

/** Sentence used wherever the questionnaire is on screen. */
export const ASSESSMENT_MEMORY_BANNER =
  'Your answers are held in this browser tab only. Nothing is saved while you answer, and refreshing or closing the tab discards them. They are sent to the server once, when you calculate the results.';

/** Sentence used on the results page. */
export const RESULTS_MEMORY_NOTE =
  'These results exist in this browser tab only. Refreshing or closing the page discards them. Use the printable report to keep a copy, or save a snapshot in QuickRisk Live or Decision Lab.';

/** How the three surfaces relate. Stated once, reused everywhere. */
export const CROSS_SURFACE_NOTE =
  'Live and Decision Lab both start from the assessment in this tab. Live copies one scenario\'s baseline exposure and applies a browser-side overlay; Decision Lab carries the portfolio baseline from the results page and recalculates the treated figures on the server with the same seed and iteration count. Neither one stores your questionnaire answers, and neither one changes the QuickRisk result.';

/** Shown next to a save control that writes to the anonymous session. */
export const SESSION_SAVE_NOTE = `Saved to an anonymous session that expires after ${LIVE_SESSION_RETENTION_DAYS} days. There is no account: clearing cookies or changing browser ends access.`;

/**
 * Status-strip wording for saved snapshots. QuickRisk Live and Decision Lab write into the
 * same anonymous session, so the same state has to read the same way in both: an absolute
 * "Not saved" next to a snapshot saved on the other screen reads as data loss, which is
 * exactly what a visitor switching from Live to Decision Lab used to see.
 */
export const SAVED_SESSION_LABEL = 'Saved to your session';
export const UNSAVED_SESSION_LABEL = 'Not saved yet';
export const UNSAVED_CHANGES_LABEL = 'Unsaved changes';

/** Detail shown while the surface's own snapshot has never been saved. */
export const DECISION_UNSAVED_NOTE =
  'This Decision Lab analysis lives in this tab only until you save it. Any input change clears the result and the saved identifier. A snapshot saved in QuickRisk Live is separate and is not affected.';

export const LIVE_UNSAVED_NOTE =
  'This Live simulation lives in this tab only until you save it. Saving stores a snapshot in your anonymous session; it does not publish it.';

/** Detail shown when a snapshot exists but the controls have moved since it was saved. */
export const LIVE_EDITED_NOTE =
  'The saved snapshot and any share link still describe the last saved state. Update the saved assessment to make them match this simulation.';

export function retentionSentence(days: number = LIVE_SESSION_RETENTION_DAYS): string {
  return `An anonymous server-side session keeps saved work for ${days} days, then deletes it.`;
}

/* ---------------------------------------------------------------------------------------
 * Where each number comes from.
 *
 * Results, QuickRisk Live and Decision Lab all show an expected annual loss, and they are
 * three different figures. Results is a sum of five server-calculated scenarios, Live is a
 * single scenario copied from Results and multiplied in the browser, and Decision Lab replays
 * the assessment with the published seed and the same iteration count, so its baseline is the
 * results page estimate rather than a second modelling choice, and applies treatments to those
 * same simulated years. Without saying so, a visitor reads three different euro values as three
 * different answers to one question.
 *
 * Every statement below is derived from values the surface actually holds, so the copy
 * cannot drift from the implementation without the caller passing a different fact.
 * ------------------------------------------------------------------------------------- */

/** One expected-annual-loss figure and its lineage. */
export interface EalProvenance {
  /** Short name of the figure this explanation belongs to. */
  readonly label: string;
  /** Where the number came from. */
  readonly source: string;
  /** How it was produced, naming the iteration count, seed or multiplier that matters. */
  readonly method: string;
  /** What this figure is explicitly not connected to. */
  readonly independentOf: readonly string[];
}

/** Copy for the portfolio total on the results page. */
export function resultsPortfolioEalProvenance(meta: {
  readonly iterations: number;
  readonly scenarioCount: number;
  readonly modelId: string;
  readonly modelVersion: string;
}): EalProvenance {
  const years = formatIterations(meta.iterations);
  return {
    label: 'Portfolio expected annual loss',
    source: `Sum of the ${meta.scenarioCount} scenario mean exposures, all produced by one server run of ${meta.modelId} model ${meta.modelVersion}.`,
    method: `Each scenario draws ${years} simulated years. The result is an annualised exposure approximation: the model does not draw a number of events per year and does not sum per-event losses.`,
    independentOf: [
      'It is not the figure QuickRisk Live shows. Live uses one scenario, not this sum.',
      'It is the Decision Lab starting point: Decision Lab replays this run with the published seed and the same iteration count, so its baseline agrees with this sum to within Monte Carlo noise.',
    ],
  };
}

/** Copy for a single scenario's expected annual loss on the results page. */
export function resultsScenarioEalProvenance(meta: {
  readonly iterations: number;
  readonly modelId: string;
  readonly modelVersion: string;
}): EalProvenance {
  const years = formatIterations(meta.iterations);
  return {
    label: 'Scenario expected annual loss',
    source: `The mean of ${years} simulated years for that one scenario, produced by ${meta.modelId} model ${meta.modelVersion} on the server.`,
    method:
      'Each simulated year multiplies a sampled event frequency by a sampled event magnitude. The mean of those years is the expected annual loss for that scenario alone.',
    independentOf: [
      'It is not a portfolio total: the five scenario figures are only added up in the portfolio card.',
      'QuickRisk Live copies one of these figures verbatim. It never recomputes it.',
    ],
  };
}

/** Copy for the baseline that QuickRisk Live copies from the results page. */
export function liveBaselineEalProvenance(input: {
  readonly scenarioCode: string;
  readonly scenarioName: string;
  readonly baselineEal: number;
  readonly currencySymbol: string;
  readonly resultsIterations: number | null;
}): EalProvenance {
  const amount = `${input.currencySymbol}${formatIterations(Math.round(input.baselineEal))}`;
  const lineage =
    input.resultsIterations === null
      ? 'Recorded from the QuickRisk result that was in memory when this snapshot was saved.'
      : `The same figure the server computed from ${formatIterations(input.resultsIterations)} simulated years on the results page.`;

  return {
    label: `Live baseline — ${input.scenarioCode} ${input.scenarioName}`,
    source: `Copied unchanged from the results page: scenario ${input.scenarioCode} (${input.scenarioName}), ${amount} per year.`,
    method: `${lineage} QuickRisk Live does not recalculate this number and holds no questionnaire answers of its own.`,
    independentOf: [
      'It is one scenario, not the portfolio sum shown on the results page.',
      'It is never sent to Decision Lab. Decision Lab rebuilds the portfolio baseline from your answers with the assessment seed and iteration count.',
    ],
  };
}

/** Copy for the simulated exposure QuickRisk Live derives from the baseline. */
export function liveOverlayEalProvenance(input: {
  readonly socMultiplier: number;
  readonly baselineEal: number;
  readonly realTimeEal: number;
  readonly currencySymbol: string;
}): EalProvenance {
  const baseline = `${input.currencySymbol}${formatIterations(Math.round(input.baselineEal))}`;
  const overlay = `${input.currencySymbol}${formatIterations(Math.round(input.realTimeEal))}`;

  return {
    label: 'Current simulated exposure',
    source: `Baseline ${baseline} × SOC multiplier ${input.socMultiplier.toFixed(2)}x = ${overlay} per year. Computed in this browser tab by the deterministic SOC engine.`,
    method:
      'The multiplier comes from the SOC inputs on this page (IOC count, confidence, incident stage, alert velocity and active controls) and is bounded to 0.20x–4.00x. No new Monte Carlo run and no new model draw take place.',
    independentOf: [
      'It does not change the results page: the baseline and the portfolio total stay exactly as calculated.',
      'It is never stored until you save a snapshot, and Decision Lab never reads it.',
    ],
  };
}

/**
 * Copy for the Decision Lab baseline.
 *
 * Decision Lab replays the assessment with the published assessment seed and the iteration
 * budget the results response reports. The assessment endpoint seeds each calculation randomly,
 * so the results figure is one draw from the same model and the replay is another: the two agree
 * to within Monte Carlo noise (measured under 0.5% on the reference profile at 5,000 iterations).
 * `baselineCarriedFromResults` is derived by the caller from the comparison it actually received,
 * so this copy cannot claim a carry-over that did not happen: when the gap is larger than noise
 * can explain, the caller passes `false` and the copy says the answers changed.
 */
export function decisionBaselineEalProvenance(provenance: {
  readonly iterations: number;
  readonly simulationSeed: number;
  readonly quickriskModelId: string;
  readonly quickriskModelVersion: string;
  readonly questionCount: number;
  readonly baselineCarriedFromResults?: boolean | null;
  readonly resultsPortfolioEal?: number | null;
}): EalProvenance {
  const run = `published assessment seed ${provenance.simulationSeed} and ${formatIterations(provenance.iterations)} simulated years`;

  if (provenance.baselineCarriedFromResults === false) {
    const resultsFigure =
      provenance.resultsPortfolioEal === null || provenance.resultsPortfolioEal === undefined
        ? 'the results figure'
        : `the results figure of ${formatMoney(provenance.resultsPortfolioEal)}`;

    return {
      label: 'Decision Lab baseline expected annual loss',
      source: `Recalculated on the server from your ${provenance.questionCount} answers by ${provenance.quickriskModelId} model ${provenance.quickriskModelVersion}. It is further from ${resultsFigure} than Monte Carlo noise explains, so your answers changed after the results were calculated.`,
      method: `Same ${run} as the results page. The difference is too large to be sampling noise, so it reflects changed answers rather than a different draw.`,
      independentOf: [
        'It does not read QuickRisk Live. Nothing you set in Live reaches this calculation.',
        'It no longer describes the same answers as the results page. Recalculate the assessment to make both screens agree.',
      ],
    };
  }

  return {
    label: 'Decision Lab baseline expected annual loss',
    source:
      provenance.baselineCarriedFromResults === true
        ? `Carried from the results page: the same five scenarios, summed, replayed with the ${run}.`
        : `Recalculated on the server from your ${provenance.questionCount} answers by ${provenance.quickriskModelId} model ${provenance.quickriskModelVersion}, using the same ${run} as the results page.`,
    method: `Same ${run} as the results page, so this is the results page estimate replayed rather than a second modelling choice; the two figures agree to within Monte Carlo sampling noise. Treatment effects are applied to these same simulated years.`,
    independentOf: [
      'It does not read QuickRisk Live. Nothing you set in Live reaches this calculation.',
      'It is the results page portfolio estimate replayed, not a differently seeded re-estimate of it.',
    ],
  };
}

/** Copy for the treated figures in Decision Lab. */
export function decisionTreatedEalProvenance(provenance: {
  readonly iterations: number;
  readonly simulationSeed: number;
  readonly quickriskModelId: string;
  readonly quickriskModelVersion: string;
}): EalProvenance {
  return {
    label: 'Decision Lab treated expected annual loss',
    source: `The baseline above with the selected treatments applied, recalculated on the server by ${provenance.quickriskModelId} model ${provenance.quickriskModelVersion}.`,
    method: `Same seed (${provenance.simulationSeed}) and ${formatIterations(provenance.iterations)} iterations as the baseline, so the pair is compared on identical simulated years. Each treatment's effect is realised once from a seed derived from the simulation seed, the treatment id and its version.`,
    independentOf: [
      'It is not stored unless you save the analysis, and a saved analysis keeps the result, not your answers.',
      'It does not alter the results page or the QuickRisk Live baseline.',
    ],
  };
}

/** Heading of the journey diagram. */
export const JOURNEY_MAP_TITLE = 'How these numbers flow';

/** One box in the journey diagram. */
export interface JourneyNode {
  readonly key: SurfaceKey;
  readonly name: string;
  readonly receives: string;
  readonly produces: string;
  readonly stores: string;
}

export const JOURNEY_NODES: readonly JourneyNode[] = [
  {
    key: 'assessment',
    name: 'Assessment',
    receives: 'Your 18 answers, held in this browser tab',
    produces: 'The answers, sent to the server once',
    stores: 'Nothing — memory only',
  },
  {
    key: 'results',
    name: 'Results',
    receives: 'One server calculation of all five scenarios',
    produces: 'A portfolio total plus one expected annual loss per scenario',
    stores: 'Nothing — memory only',
  },
  {
    key: 'live',
    name: 'QuickRisk Live',
    receives: "One scenario's expected annual loss, copied from Results",
    produces: 'That baseline multiplied by a synthetic SOC multiplier',
    stores: 'Only a snapshot you save explicitly',
  },
  {
    key: 'decision-lab',
    name: 'Decision Lab',
    receives: 'The portfolio baseline from Results, plus your answers re-sent for the treated calculation',
    produces: 'Baseline versus treated expected annual loss for the treatments you choose',
    stores: 'Only the result you save; never your answers',
  },
];

/**
 * The sentence that stops a visitor reading Results → Live → Decision Lab as one
 * cumulative chain. They are siblings: both start at Results and neither feeds the other.
 */
export const JOURNEY_FORK_NOTE =
  'QuickRisk Live and Decision Lab are two separate branches from Results, not one chain. Live copies a single scenario figure and applies a browser-side SOC overlay; Decision Lab carries the portfolio baseline from Results and recalculates the treated figures with the same seed and iteration count. Live never feeds Decision Lab, and Decision Lab never reads Live.';

/**
 * Which branch the visitor is currently standing on, and the control that opens the other one.
 *
 * The diagram alone still left visitors unsure whether the two tools were connected, so Live
 * and Decision Lab each state their own branch in words and offer a one-click route to the
 * sibling. The copy is derived from a single function so the two screens cannot drift.
 */
export interface BranchPosition {
  /** Sentence naming the branch the visitor is on. */
  readonly heading: string;
  /** Sentence naming the other branch and stating that no data passes between them. */
  readonly detail: string;
  /** The sibling surface this branch can switch to. */
  readonly siblingView: 'live' | 'decision-lab';
  /** Label of the control that opens the sibling branch. */
  readonly siblingAction: string;
}

export function branchPosition(surface: 'live' | 'decision-lab'): BranchPosition {
  if (surface === 'live') {
    return {
      heading: 'You are on Branch A — QuickRisk Live.',
      detail:
        'Decision Lab is the other branch. It does not read this simulation, and nothing you set here reaches it.',
      siblingView: 'decision-lab',
      siblingAction: 'Switch to Branch B — Decision Lab',
    };
  }

  return {
    heading: 'You are on Branch B — Decision Lab.',
    detail:
      'QuickRisk Live is the other branch. It does not read this analysis, and nothing you record there reaches it.',
    siblingView: 'live',
    siblingAction: 'Switch to Branch A — QuickRisk Live',
  };
}

/** Shown above the fork diagram on Results, where neither branch has been opened yet. */
export const FORK_CHOICE_PROMPT =
  'Both branches start here. Open either one — they do not depend on each other, and you can come back for the other at any time.';

/**
 * One-line branch statement for artefacts that do not carry the full fork diagram:
 * saved-work lists, the Live executive report and the Board Risk Pack.
 *
 * A printed report travels without the screen that produced it, so it has to name its own
 * branch. Otherwise a board reader who has also seen a Live simulation cannot tell whether
 * the two sets of figures are related.
 */
export const LIVE_BRANCH_NOTE =
  'Branch A — QuickRisk Live. Independent of Decision Lab: nothing here comes from, or feeds, a Decision Lab analysis.';

export const DECISION_BRANCH_NOTE =
  'Branch B — Decision Lab. Independent of QuickRisk Live: nothing here reads a Live simulation or a saved Live snapshot.';

export const HISTORY_BRANCH_NOTE =
  'Saved work from two independent branches: QuickRisk Live (Branch A) and Decision Lab (Branch B). Neither branch reads the other.';

/** Label on the dropdown that chooses which scenario's expected annual loss Live uses. */
export const LIVE_BASELINE_SELECTOR_LABEL = "Quantitative baseline — which scenario's EAL to use";

/** Help under that dropdown, stating what it does and does not change. */
export const LIVE_BASELINE_SELECTOR_HELP =
  'This chooses the one QuickRisk scenario whose expected annual loss becomes the Live baseline. It is not a demonstration scenario, and it does not change the results page. Switching it clears the timeline because every recorded exposure depends on the baseline.';

/** The three controls a visitor actually has over stored data. */
export const DATA_CONTROLS: readonly string[] = [
  'Start over discards everything held in this browser tab immediately.',
  'Archive removes a saved Live assessment or Decision Lab analysis from your list and stops its share links.',
  'Revoke link disables a read-only share link without deleting the saved record.',
];

export function lifecycleFor(key: SurfaceKey): SurfaceLifecycle {
  const entry = DATA_LIFECYCLE.find((surface) => surface.key === key);
  if (entry === undefined) {
    throw new Error(`Unknown data-lifecycle surface: ${key}`);
  }

  return entry;
}
