import { expect, test } from '@playwright/test';
import { comparison, portfolioSearch, shareUrl } from './fixtures';
import { loadDecisionLab, mockDecisionLabApi } from './harness';

test('Decision Lab compares, recommends, saves and shares, then clears on input change', async ({
  page,
}) => {
  await mockDecisionLabApi(page);
  await loadDecisionLab(page);

  await expect(page.getByText('Not saved yet', { exact: true })).toBeVisible();

  await expect(page.getByText('Endpoint Detection and Response').first()).toBeVisible();
  await page.locator('#appetite-eal').fill('300000');
  await page.locator('#appetite-eal').press('Tab');
  await page.getByRole('checkbox').first().click();
  await page.getByRole('button', { name: 'Compare selected treatments' }).click();
  await expect(page.getByText('3. What would change?')).toBeVisible();

  await page.getByRole('button', { name: 'Evaluate portfolios' }).click();
  await expect(page.getByText('4. What are the options?')).toBeVisible();

  await page.getByRole('button', { name: 'Prepare recommended portfolio report' }).click();
  await expect(page.getByText('The report describes the recommended portfolio.')).toBeVisible();

  await page.getByRole('button', { name: 'Save decision analysis' }).click();
  await expect(page.getByRole('button', { name: 'Decision analysis saved' })).toBeVisible();
  await expect(page.getByText('Saved to your session', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Share Board Risk Pack' }).click();
  await expect(page.getByText(shareUrl)).toBeVisible();

  await page.locator('#appetite-eal').fill('400000');
  await page.locator('#appetite-eal').press('Tab');
  await expect(page.getByText('3. What would change?')).toHaveCount(0);
  // The saved identifier is cleared with the result, and the strip says "yet" rather than
  // claiming that nothing in the session is saved.
  await expect(page.getByText('Not saved yet', { exact: true })).toBeVisible();
});

test('Decision Lab rejects a probability appetite without a loss threshold', async ({ page }) => {
  await mockDecisionLabApi(page);
  await loadDecisionLab(page);

  const probability = page.locator('#appetite-probability');
  await expect(probability).toBeDisabled();

  await page.locator('#appetite-eal').fill('300000');
  await page.locator('#appetite-eal').press('Tab');
  await expect(probability).toBeEnabled();

  await probability.fill('0.25');
  await page.locator('#appetite-eal').fill('');
  await page.locator('#appetite-eal').press('Tab');
  await expect(probability).toBeDisabled();
  await expect(probability).toHaveValue('');
});

test('Decision Lab reports a comparison without claiming a portfolio search was performed', async ({
  page,
}) => {
  await mockDecisionLabApi(page);
  await loadDecisionLab(page);

  await page.getByRole('checkbox').first().click();
  await page.getByRole('button', { name: 'Compare selected treatments' }).click();
  await expect(page.getByText('3. What would change?')).toBeVisible();
  await expect(page.getByText('The report describes the selected treatment set.')).toBeVisible();

  await expect(
    page.getByText(
      'No portfolio search has been performed for this analysis. This report describes the selected treatment set only.',
    ),
  ).toBeVisible();
});

test('Decision Lab notices when the baseline no longer matches the results page', async ({ page }) => {
  await mockDecisionLabApi(page);
  await loadDecisionLab(page);

  await page.getByRole('checkbox').first().click();
  await page.getByRole('button', { name: 'Compare selected treatments' }).click();
  await expect(page.getByText('3. What would change?')).toBeVisible();

  // Nothing has moved yet, so the baseline reproduces the portfolio figure Results showed.
  const baseline = page.getByText(
    'Where this number comes from — Decision Lab baseline indicative annual exposure',
  );
  await baseline.click();
  await expect(page.getByText(/Carried from the results page/)).toHaveCount(1);

  // Editing an answer after the results were calculated leaves the in-memory Results
  // response describing the old answers. The next comparison is computed from the new
  // answers, so its baseline no longer reproduces the figure the results page still shows.
  await page.evaluate(async () => {
    const storeModuleUrl = '/src/state/assessmentStore.ts';
    const modelModuleUrl = '/src/model.ts';
    const store = await import(/* @vite-ignore */ storeModuleUrl);
    const modelModule = await import(/* @vite-ignore */ modelModuleUrl);
    const model = modelModule.publicModel as {
      scenarios: { code: string; likelihoodQuestion: { code: string; optionSet: string } }[];
      optionSets: Record<string, { options: { code: string }[] }>;
      unknownCode: string;
    };
    const scenario = model.scenarios[0];
    const question = scenario.likelihoodQuestion;
    const state = store.useAssessmentStore.getState();
    const current = state.scenarioAnswers[scenario.code]?.[question.code] ?? model.unknownCode;
    const replacement =
      model.optionSets[question.optionSet]?.options.find((option) => option.code !== current)?.code ?? current;
    store.useAssessmentStore.setState({
      scenarioAnswers: {
        ...state.scenarioAnswers,
        [scenario.code]: { ...(state.scenarioAnswers[scenario.code] ?? {}), [question.code]: replacement },
      },
    });
  });

  // The stub now answers for the new answers with a baseline that is not the Results figure.
  await page.route('**/live/api/decision-compute.php', (route) => {
    const body = (route.request().postDataJSON() ?? {}) as { action?: string };
    const data =
      body.action === 'portfolios'
        ? portfolioSearch
        : { ...comparison, baseline: { ...comparison.baseline, expectedAnnualLoss: 1_200_000, p90: 2_400_000 } };

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });

  await page.getByRole('button', { name: 'Compare selected treatments' }).click();

  await expect(
    page.getByText('The baseline no longer matches the results page', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/while the results page/)).toBeVisible();

  await page
    .getByText('Where this number comes from — Decision Lab baseline indicative annual exposure')
    .click();
  await expect(page.getByText(/further from the results figure/)).toBeVisible();
});

