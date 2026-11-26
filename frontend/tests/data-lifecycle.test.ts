import { describe, expect, it } from 'vitest';
import {
  ASSESSMENT_MEMORY_BANNER,
  CROSS_SURFACE_NOTE,
  DATA_CONTROLS,
  DATA_LIFECYCLE,
  DECISION_UNSAVED_NOTE,
  DECISION_BRANCH_NOTE,
  FORK_CHOICE_PROMPT,
  HISTORY_BRANCH_NOTE,
  LIVE_BRANCH_NOTE,
  JOURNEY_FORK_NOTE,
  JOURNEY_MAP_TITLE,
  JOURNEY_NODES,
  LIVE_BASELINE_SELECTOR_HELP,
  LIVE_BASELINE_SELECTOR_LABEL,
  LIVE_EDITED_NOTE,
  LIVE_SESSION_RETENTION_DAYS,
  LIVE_UNSAVED_NOTE,
  RESULTS_MEMORY_NOTE,
  SAVED_SESSION_LABEL,
  SESSION_SAVE_NOTE,
  TRUST_STRIP_ITEMS,
  UNSAVED_CHANGES_LABEL,
  UNSAVED_SESSION_LABEL,
  branchPosition,
  decisionBaselineEalProvenance,
  decisionTreatedEalProvenance,
  lifecycleFor,
  liveBaselineEalProvenance,
  liveOverlayEalProvenance,
  resultsPortfolioEalProvenance,
  resultsScenarioEalProvenance,
  retentionSentence,
} from '@/content/dataLifecycle';

/**
 * The data-handling copy is a product promise, not decoration. These assertions keep it
 * aligned with the implementation: zero retention for the questionnaire, an anonymous
 * session with a 30-day TTL for saved Live and Decision Lab work, and no share link for
 * the assessment.
 */
describe('data-lifecycle statements', () => {
  it('states the documented anonymous-session retention', () => {
    expect(LIVE_SESSION_RETENTION_DAYS).toBe(30);
    expect(retentionSentence()).toContain('30 days');
    expect(SESSION_SAVE_NOTE).toContain('30 days');
  });

  it('reads the same saved state on both surfaces that write to the session', () => {
    // Switching from QuickRisk Live to Decision Lab used to turn "Saved to your session"
    // into an absolute "Not saved", which reads as if the saved snapshot had been lost.
    expect(SAVED_SESSION_LABEL).toBe('Saved to your session');
    expect(UNSAVED_SESSION_LABEL).toBe('Not saved yet');
    expect(UNSAVED_SESSION_LABEL.startsWith('Not saved yet')).toBe(true);
    expect(UNSAVED_CHANGES_LABEL).toBe('Unsaved changes');
    expect(DECISION_UNSAVED_NOTE).toContain('Decision Lab analysis');
    expect(DECISION_UNSAVED_NOTE).toContain('QuickRisk Live is separate');
    expect(LIVE_UNSAVED_NOTE).toContain('Live simulation');
    expect(LIVE_EDITED_NOTE).toContain('last saved state');
    expect(LIVE_EDITED_NOTE).not.toContain('Not saved');
  });

  it('describes the questionnaire as memory-only and printable, with no share link', () => {
    const assessment = lifecycleFor('assessment');
    const storage = assessment.storage.toLowerCase();
    const lifetime = assessment.lifetime.toLowerCase();
    const outputs = assessment.outputs.join(' ').toLowerCase();

    expect(storage).toContain('browser tab');
    expect(storage).toContain('memory');
    expect(lifetime).toContain('refresh');
    expect(outputs).toContain('printable report');
    expect(outputs).not.toContain('share link');
  });

  it('gives every surface a storage statement, a lifetime and at least one output', () => {
    expect(DATA_LIFECYCLE).toHaveLength(4);
    for (const surface of DATA_LIFECYCLE) {
      expect(surface.storage.length).toBeGreaterThan(20);
      expect(surface.lifetime.length).toBeGreaterThan(20);
      expect(surface.outputs.length).toBeGreaterThan(0);
    }
  });

  it('states that Live and Decision Lab store nothing until an explicit save', () => {
    expect(lifecycleFor('live').storage.toLowerCase()).toContain('nothing until you save');
    expect(lifecycleFor('live').storage.toLowerCase()).toContain('anonymous session');
    expect(lifecycleFor('decision-lab').storage.toLowerCase()).toContain('nothing until you save');
    expect(lifecycleFor('decision-lab').storage.toLowerCase()).toContain('not your questionnaire answers');
  });

  it('offers a read-only share link only for the two saved surfaces', () => {
    expect(lifecycleFor('live').outputs.join(' ').toLowerCase()).toContain('share link');
    expect(lifecycleFor('decision-lab').outputs.join(' ').toLowerCase()).toContain('link');
  });

  it('keeps the cross-surface statement honest about what is carried across', () => {
    const note = CROSS_SURFACE_NOTE.toLowerCase();
    expect(note).toContain('neither one stores your questionnaire answers');
    expect(note).toContain('neither one changes the quickrisk result');
  });

  it('states the three controls a visitor has over stored data', () => {
    expect(DATA_CONTROLS).toHaveLength(3);
    const controls = DATA_CONTROLS.join(' ');
    expect(controls).toContain('Start over');
    expect(controls).toContain('Archive');
    expect(controls).toContain('Revoke link');
  });

  it('warns that answers and results are discarded on refresh', () => {
    expect(ASSESSMENT_MEMORY_BANNER.toLowerCase()).toContain('refreshing');
    expect(RESULTS_MEMORY_NOTE.toLowerCase()).toContain('refreshing');
  });

  it('rejects an unknown surface instead of silently returning nothing', () => {
    // The helper is typed, so this mirrors a persisted or refactored key arriving late.
    expect(() => lifecycleFor('unknown' as never)).toThrow(/Unknown data-lifecycle surface/);
  });
});

/**
 * Results, Live and Decision Lab each show an indicative annual exposure, and they are three
 * different figures. The provenance copy has to say so using the facts the surface holds,
 * otherwise two screens showing different euro amounts look like a contradiction.
 */
describe('expected-annual-loss provenance', () => {
  const resultsMeta = {
    iterations: 5000,
    scenarioCount: 5,
    modelId: 'FAIR-QK-2.0',
    modelVersion: '2.0.0',
  };

  it('names the iteration count and joint annual totals for the portfolio figure', () => {
    const provenance = resultsPortfolioEalProvenance(resultsMeta);

    expect(provenance.label).toBe('Portfolio indicative annual exposure');
    expect(provenance.source).toContain('Joint annual totals from 5 scenarios');
    expect(provenance.source).toContain('FAIR-QK-2.0');
    expect(provenance.method).toContain('Poisson material-event counts');
    expect(provenance.independentOf.join(' ')).toContain('Live uses one scenario');
    expect(provenance.independentOf.join(' ')).toContain('posterior-predictive');
  });

  it('distinguishes a single scenario figure from the portfolio sum', () => {
    const provenance = resultsScenarioEalProvenance(resultsMeta);

    expect(provenance.source).toContain('5,000 simulated years');
    expect(provenance.independentOf.join(' ')).toContain('not a portfolio total');
    expect(provenance.independentOf.join(' ')).toContain('copies one of these figures verbatim');
  });

  it('states that the Live baseline is copied, not recalculated, and never reaches Decision Lab', () => {
    const provenance = liveBaselineEalProvenance({
      scenarioCode: 'S2',
      scenarioName: 'Identity compromise',
      baselineEal: 216312.73,
      currencySymbol: '€',
      resultsIterations: 5000,
    });

    expect(provenance.label).toContain('S2');
    expect(provenance.source).toContain('Copied unchanged from the results page');
    expect(provenance.source).toContain('€216,313');
    expect(provenance.method).toContain('does not recalculate this number');
    expect(provenance.independentOf.join(' ')).toContain('never sent to Decision Lab');
  });

  it('explains a saved baseline when the results page is no longer in memory', () => {
    const provenance = liveBaselineEalProvenance({
      scenarioCode: 'S1',
      scenarioName: 'Ransomware',
      baselineEal: 1000,
      currencySymbol: '€',
      resultsIterations: null,
    });

    expect(provenance.method).toContain('in memory when this snapshot was saved');
    expect(provenance.method).not.toContain('simulated years on the results page');
  });

  it('shows the Live overlay as a browser-side multiplier on the baseline', () => {
    const provenance = liveOverlayEalProvenance({
      socMultiplier: 1.5,
      baselineEal: 2000,
      realTimeEal: 3000,
      currencySymbol: '€',
    });

    expect(provenance.source).toContain('× SOC multiplier 1.50x');
    expect(provenance.source).toContain('€3,000');
    expect(provenance.method).toContain('No new Monte Carlo run');
    expect(provenance.independentOf.join(' ')).toContain('does not change the results page');
  });

  it('states that the Decision Lab baseline is carried from Results when the run matches', () => {
    const provenance = decisionBaselineEalProvenance({
      iterations: 5000,
      simulationSeed: 20261029,
      quickriskModelId: 'FAIR-QK-1.3',
      quickriskModelVersion: '1.3.0',
      questionCount: 18,
      baselineCarriedFromResults: true,
      resultsPortfolioEal: 216312.73,
    });

    expect(provenance.source).toContain('Carried from the results page');
    expect(provenance.method).toContain('seed 20261029');
    expect(provenance.method).toContain('5,000 simulated years');
    expect(provenance.method).toContain('results page estimate replayed');
    expect(provenance.method).toContain('Monte Carlo sampling noise');
    expect(provenance.independentOf.join(' ')).toContain('does not read QuickRisk Live');
    expect(provenance.independentOf.join(' ')).toContain('not a differently seeded re-estimate');
  });

  it('states that the baseline differs when the answers changed after Results', () => {
    const provenance = decisionBaselineEalProvenance({
      iterations: 5000,
      simulationSeed: 20261029,
      quickriskModelId: 'FAIR-QK-1.3',
      quickriskModelVersion: '1.3.0',
      questionCount: 18,
      baselineCarriedFromResults: false,
      resultsPortfolioEal: 216312.73,
    });

    expect(provenance.source).toContain('so your answers changed after the results were calculated');
    expect(provenance.source).toContain('€216k');
    expect(provenance.method).toContain('seed 20261029');
    expect(provenance.method).toContain('too large to be sampling noise');
    expect(provenance.independentOf.join(' ')).toContain('Recalculate the assessment');
  });

  it('does not claim a carry-over before there is a comparison to check', () => {
    const provenance = decisionBaselineEalProvenance({
      iterations: 5000,
      simulationSeed: 20261029,
      quickriskModelId: 'FAIR-QK-1.3',
      quickriskModelVersion: '1.3.0',
      questionCount: 18,
    });

    expect(provenance.source).toContain('using the same published assessment seed 20261029');
    expect(provenance.source).not.toContain('Carried from the results page');
    expect(provenance.method).toContain('5,000 simulated years');
  });

  it('pairs the treated figure with the baseline on identical simulated years', () => {
    const provenance = decisionTreatedEalProvenance({
      iterations: 5000,
      simulationSeed: 20261029,
      quickriskModelId: 'FAIR-QK-1.3',
      quickriskModelVersion: '1.3.0',
    });

    expect(provenance.source).toContain('with the selected treatments applied');
    expect(provenance.method).toContain('identical simulated years');
    expect(provenance.independentOf.join(' ')).toContain('does not alter the results page');
  });
});

/**
 * The journey is a fork, not a chain. If these statements weaken, the interface starts
 * implying that Live feeds Decision Lab, which is exactly what confused visitors reported.
 */
describe('journey topology', () => {
  it('describes the four surfaces with receives, produces and stores', () => {
    expect(JOURNEY_MAP_TITLE.length).toBeGreaterThan(0);
    expect(JOURNEY_NODES).toHaveLength(4);

    for (const node of JOURNEY_NODES) {
      expect(node.name.length).toBeGreaterThan(0);
      expect(node.receives.length).toBeGreaterThan(10);
      expect(node.produces.length).toBeGreaterThan(10);
      expect(node.stores.length).toBeGreaterThan(10);
    }

    expect(JOURNEY_NODES.map((node) => node.key)).toEqual([
      'assessment',
      'results',
      'live',
      'decision-lab',
    ]);
  });

  it('says Live and Decision Lab are separate branches that never feed each other', () => {
    expect(JOURNEY_FORK_NOTE).toContain('two separate branches');
    expect(JOURNEY_FORK_NOTE).toContain('Live never feeds Decision Lab');
    expect(JOURNEY_FORK_NOTE).toContain('Decision Lab never reads Live');
    expect(JOURNEY_FORK_NOTE).not.toContain('then');
  });

  it('separates the quantitative baseline from the synthetic SOC library', () => {
    expect(LIVE_BASELINE_SELECTOR_LABEL).toContain("which scenario's EAL to use");
    expect(LIVE_BASELINE_SELECTOR_HELP).toContain('not a demonstration scenario');
    expect(LIVE_BASELINE_SELECTOR_HELP).toContain('does not change the results page');
  });
});

/**
 * The fork is only obvious if each branch names itself and points at its sibling. These
 * covers pin the banner copy: the surface must say which branch it is, must say the other
 * branch is independent, and must offer the sibling route.
 */
describe('branch position banner', () => {
  it('names Branch A on QuickRisk Live and routes to Decision Lab', () => {
    const position = branchPosition('live');

    expect(position.heading).toContain('Branch A');
    expect(position.heading).toContain('QuickRisk Live');
    expect(position.detail).toContain('Decision Lab is the other branch');
    expect(position.detail).toContain('does not read this simulation');
    expect(position.siblingView).toBe('decision-lab');
    expect(position.siblingAction).toContain('Branch B');
  });

  it('names Branch B on Decision Lab and routes to QuickRisk Live', () => {
    const position = branchPosition('decision-lab');

    expect(position.heading).toContain('Branch B');
    expect(position.heading).toContain('Decision Lab');
    expect(position.detail).toContain('QuickRisk Live is the other branch');
    expect(position.detail).toContain('does not read this analysis');
    expect(position.siblingView).toBe('live');
    expect(position.siblingAction).toContain('Branch A');
  });

  it('states that both branches start at Results without implying a sequence', () => {
    expect(FORK_CHOICE_PROMPT).toContain('Both branches start here');
    expect(FORK_CHOICE_PROMPT).toContain('do not depend on each other');
    expect(FORK_CHOICE_PROMPT).not.toContain('then');
  });

  /**
   * A printed report or a saved list travels without the diagram, so each artefact has to
   * name its own branch. These are the sentences that keep a Live report from being read as
   * an input to a Decision Lab analysis, or the reverse.
   */
  it('names the branch on artefacts that travel without the fork diagram', () => {
    expect(LIVE_BRANCH_NOTE).toContain('Branch A');
    expect(LIVE_BRANCH_NOTE).toContain('QuickRisk Live');
    expect(LIVE_BRANCH_NOTE).toContain('Independent of Decision Lab');

    expect(DECISION_BRANCH_NOTE).toContain('Branch B');
    expect(DECISION_BRANCH_NOTE).toContain('Decision Lab');
    expect(DECISION_BRANCH_NOTE).toContain('Independent of QuickRisk Live');

    expect(HISTORY_BRANCH_NOTE).toContain('two independent branches');
    expect(HISTORY_BRANCH_NOTE).toContain('Neither branch reads the other');
  });
});

/**
 * The landing page now states the storage promise in one line rather than a wall of prose.
 * The strip is only honest if each claim still opens the page that states it in full.
 */
describe('landing trust strip', () => {
  it('carries the three claims the entry page makes', () => {
    expect(TRUST_STRIP_ITEMS.map((item) => item.label)).toEqual([
      'Zero-retention by default',
      'Synthetic SOC signals',
      'Indicative FAIR-QK model',
    ]);
  });

  it('routes every claim to a reference modal that explains it', () => {
    const modals = new Set(TRUST_STRIP_ITEMS.map((item) => item.modal));

    expect(modals).toEqual(new Set(['privacy', 'methodology']));
    for (const item of TRUST_STRIP_ITEMS) {
      expect(item.label.length).toBeGreaterThan(10);
      expect(['privacy', 'methodology', 'disclaimer']).toContain(item.modal);
    }
  });

  it('uses a unique key per claim so the strip cannot collapse two claims into one', () => {
    const keys = TRUST_STRIP_ITEMS.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
