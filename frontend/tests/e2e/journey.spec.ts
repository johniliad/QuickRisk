import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { mockDecisionLabApi, mockLiveApi, loadDecisionLab, loadLive } from './harness';

/**
 * The three surfaces are one journey, and the interface now says so.
 *
 * Regression: Live and Decision Lab were indistinguishable from Overview in the header,
 * their empty states were dead ends, and "Start over" discarded answers without a word.
 * These tests pin the stepper, the data-handling dialog, the guided onboarding and the
 * discard confirmation.
 */
const capturedResponse = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/assessment-response.json', import.meta.url)), 'utf8'),
) as Record<string, unknown>;

async function placeResultsInMemory(page: Page, view = 'results'): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    async ({ results, targetView }) => {
      const storeModuleUrl = '/src/state/assessmentStore.ts';
      const module = await import(/* @vite-ignore */ storeModuleUrl);
      module.useAssessmentStore.setState({
        view: targetView,
        results,
        selectedScenarioCode: 'S1',
      });
    },
    { results: capturedResponse, targetView: view },
  );
}

test('the journey stepper states the order and the dependency', async ({ page }) => {
  await page.goto('/');

  const journey = page.getByRole('navigation', { name: 'Assessment journey' });
  await expect(journey).toBeVisible();
  await expect(journey.getByText('Assess', { exact: true })).toBeVisible();
  await expect(journey.getByText('Results', { exact: true })).toBeVisible();
  await expect(journey.getByText('Explore', { exact: true })).toBeVisible();

  // Navigation is never blocked (a saved assessment is reachable from History), but the
  // dependency is stated and both buttons remain available.
  await expect(
    journey.getByText('Complete the assessment to unlock both tools; each screen explains what it needs.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Live', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Decision Lab', exact: true })).toBeEnabled();
});

test('the data-handling dialog states storage, deletion and retention', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'How your data works' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Where your data goes' })).toBeVisible();
  await expect(dialog.getByText(/browser tab only/i).first()).toBeVisible();
  await expect(dialog.getByText(/nothing until you save/i).first()).toBeVisible();
  await expect(dialog.getByText(/An anonymous server-side session keeps saved work for 30 days/)).toBeVisible();
  await expect(dialog.getByText(/Archive removes a saved Live assessment/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the results page offers both next steps and the stepper unlocks them', async ({ page }) => {
  await placeResultsInMemory(page);

  await expect(
    page.getByRole('heading', { name: 'Your exposure is ready. What next?' }),
  ).toBeVisible();
  await expect(page.getByText(/These results exist in this browser tab only/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Live', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Decision Lab', exact: true })).toBeEnabled();

  await page.getByRole('button', { name: 'Open Decision Lab' }).click();
  await expect(
    page.getByRole('heading', { name: 'Explore how different investments and risk treatments could change your cyber-risk exposure' }),
  ).toBeVisible({ timeout: 20_000 });
});

test('Decision Lab explains the missing baseline instead of showing a dead end', async ({ page }) => {
  await mockDecisionLabApi(page);
  await page.goto('/');
  await page.evaluate(async () => {
    const storeModuleUrl = '/src/state/assessmentStore.ts';
    const module = await import(/* @vite-ignore */ storeModuleUrl);
    module.useAssessmentStore.setState({ view: 'decision-lab', results: null });
  });

  await expect(
    page.getByRole('heading', { name: 'Decision Lab compares treatments against a QuickRisk assessment' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a new assessment' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open saved analyses' })).toBeVisible();
});

test('Live explains the missing baseline instead of showing a dead end', async ({ page }) => {
  await mockLiveApi(page);
  await page.goto('/');
  await page.evaluate(async () => {
    const storeModuleUrl = '/src/state/assessmentStore.ts';
    const module = await import(/* @vite-ignore */ storeModuleUrl);
    module.useAssessmentStore.setState({ view: 'live', results: null });
  });

  await expect(
    page.getByRole('heading', { name: 'Live overlays a SOC simulation on a QuickRisk baseline' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open a saved assessment' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a new assessment' })).toBeVisible();
});

test('starting over asks first and says what will be discarded', async ({ page }) => {
  await placeResultsInMemory(page);

  await page.getByRole('button', { name: /Discard assessment/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Start a new assessment?' })).toBeVisible();
  await expect(dialog.getByText(/Your computed results in this tab/)).toBeVisible();
  await expect(dialog.getByText(/Saved Live assessments and saved Decision Lab analyses stay/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Indicative annual cyber-loss exposure' })).toBeVisible();

  await page.getByRole('button', { name: /Discard assessment/ }).click();
  await page.getByRole('button', { name: 'Discard and start over' }).click();

  await expect(page.getByRole('heading', { name: 'Indicative annual cyber-loss exposure' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start the assessment' })).toBeVisible();
});

test('the landing page states the three-step journey before the first click', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Your journey in three steps' })).toBeVisible();
  for (const title of ['Assess', 'Results', 'Explore']) {
    await expect(page.getByRole('heading', { name: title, exact: true, level: 3 })).toBeVisible();
  }
  await expect(page.getByText(/18 questions in total/)).toBeVisible();

  // Step three is drawn as a fork, not a bullet list, so the first screen already says that
  // Live and Decision Lab are siblings rather than consecutive screens.
  await expect(page.getByText('Branch A', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Branch B', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Two independent branches from Results/).first()).toBeVisible();
  await expect(page.getByText('Not connected', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Begin the assessment' }).click();
  await expect(page.getByRole('heading', { name: 'Purpose, limitations and disclaimer' })).toBeVisible();
});

test('the landing page names the three audiences and what each one receives', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Who is this for?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'For the board', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'For the CISO', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'For the risk manager', exact: true })).toBeVisible();
  await expect(page.getByText('Produced by Decision Lab')).toBeVisible();
});

test('the sample results preview stays collapsed until it is asked for', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'See a sample dashboard' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);

  await page.getByRole('button', { name: 'Show sample' }).click();

  await expect(page.getByRole('heading', { name: 'Sample scenario exposure' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Sample probability of exceeding thresholds' }),
  ).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(2);
  await expect(page.getByText(/Illustrative sample, not a result/)).toBeVisible();

  await page.getByRole('button', { name: 'Hide sample' }).click();
  await expect(page.getByRole('table')).toHaveCount(0);
});
test('the landing journey map unlocks the later steps once a result exists', async ({ page }) => {
  await placeResultsInMemory(page);
  await page.evaluate(async () => {
    const storeModuleUrl = '/src/state/assessmentStore.ts';
    const module = await import(/* @vite-ignore */ storeModuleUrl);
    module.useAssessmentStore.setState({ view: 'landing' });
  });

  await expect(page.getByRole('heading', { name: 'Your journey in three steps' })).toBeVisible();
  await expect(page.getByText('Start here', { exact: true })).toBeVisible();
  await expect(page.getByText('Available now', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Locked', { exact: true })).toHaveCount(0);
});

/**
 * The three surfaces each show an expected annual loss, and they are three different
 * figures. The journey map draws the fork on every surface, and each figure carries a
 * collapsed provenance disclosure naming its source, method and what it is not connected
 * to. Without these, the three euro amounts read as a contradiction.
 */
test('every surface draws the same fork and explains where its EAL comes from', async ({ page }) => {
  await placeResultsInMemory(page);

  await expect(page.getByRole('heading', { name: 'How these numbers flow' })).toBeVisible();
  await expect(page.getByText(/Two independent branches from Results/).first()).toBeVisible();
  await expect(
    page.getByText(/Live never feeds Decision Lab, and Decision Lab never reads Live/).first(),
  ).toBeVisible();
  await expect(page.getByText('You are here', { exact: true })).toHaveCount(1);

  // The fork is drawn, not just described: both branch labels and the explicit "Not connected"
  // divider are visible next to the two cards, and the page says both branches start here.
  await expect(page.getByText('Branch A', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Branch B', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Not connected', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Both branches start here/)).toBeVisible();
  await expect(
    page.getByText('Where this number comes from — Portfolio expected annual loss'),
  ).toBeVisible();
  await expect(
    page.getByText('Where this number comes from — Scenario expected annual loss'),
  ).toBeVisible();

  // Expanding the portfolio disclosure states the sum, the iteration count and the two
  // things the figure is not.
  await page.getByText('Where this number comes from — Portfolio expected annual loss').click();
  await expect(page.getByText(/Sum of the 5 scenario mean exposures/)).toBeVisible();
  await expect(page.getByText(/5,000 simulated years/).first()).toBeVisible();
  await expect(page.getByText(/Live uses one scenario, not this sum/)).toBeVisible();
});

test('Live names the quantitative baseline and copies it from the results page', async ({ page }) => {
  await mockLiveApi(page);
  await loadLive(page);

  await expect(page.getByRole('heading', { name: 'How these numbers flow' })).toBeVisible();
  await expect(
    page.getByLabel("Quantitative baseline — which scenario's EAL to use"),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Synthetic SOC timeline library' })).toBeVisible();
  await expect(page.getByText(/does not change the quantitative baseline/)).toBeVisible();

  // This surface names its own branch and offers the sibling, so the fork is explicit even
  // if the diagram is not read.
  await expect(page.getByText('You are on Branch A — QuickRisk Live.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Switch to Branch B — Decision Lab' }),
  ).toBeVisible();

  const disclosure = page.getByText('Where this number comes from — Live baseline — S1 Ransomware');
  await expect(disclosure).toBeVisible();
  await disclosure.click();
  await expect(page.getByText(/Copied unchanged from the results page/)).toBeVisible();
  await expect(page.getByText(/It is never sent to Decision Lab/)).toBeVisible();
});

test('Decision Lab carries the Results baseline and never reads Live', async ({ page }) => {
  await mockDecisionLabApi(page);
  await loadDecisionLab(page);

  await expect(page.getByRole('heading', { name: 'How these numbers flow' })).toBeVisible();
  await expect(page.getByText(/Baseline carried from the results page/)).toBeVisible();

  await expect(page.getByText('You are on Branch B — Decision Lab.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Switch to Branch A — QuickRisk Live' }),
  ).toBeVisible();

  await page.getByRole('checkbox').first().click();
  await page.getByRole('button', { name: 'Compare selected treatments' }).click();
  await expect(page.getByText('3. What would change?')).toBeVisible();

  await expect(
    page.getByText(/Neither figure comes from QuickRisk Live/),
  ).toBeVisible();

  const baseline = page.getByText(
    'Where this number comes from — Decision Lab baseline expected annual loss',
  );
  await expect(baseline).toBeVisible();
  await baseline.click();
  await expect(page.getByText(/Carried from the results page/)).toBeVisible();
  await expect(page.getByText(/does not read QuickRisk Live/)).toBeVisible();
  await expect(
    page.getByText('Where this number comes from — Decision Lab treated expected annual loss'),
  ).toBeVisible();
});