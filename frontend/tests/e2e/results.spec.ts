import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * The results view must actually appear after a calculation.
 *
 * Regression: the results screen is a chunk that is downloaded on demand, so the
 * questionnaire ended on the Suspense fallback ("Loading the results view…"). A chunk
 * that failed or stalled left that message on screen for ever, because nothing in the
 * application could report the failure. These tests pin both halves: the happy path
 * renders the dashboard, and a chunk that cannot be downloaded is replaced by a stated
 * error with a reload control instead of an endless loading notice.
 *
 * `assessment-response.json` is a verbatim response captured from the deployed
 * endpoint, so the browser validates and renders the same shape the server sends. If
 * the response schema moves and this fixture is not refreshed, the dashboard stops
 * rendering and this test fails: that is the intended alarm.
 */
const capturedResponse = readFileSync(
  fileURLToPath(new URL('./fixtures/assessment-response.json', import.meta.url)),
  'utf8',
);

/** Answers every question with the first option and submits the assessment. */
async function completeQuestionnaire(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start the assessment' }).click();
  await page.getByRole('checkbox').first().click();
  await page.getByRole('button', { name: 'Start assessment' }).click();

  for (let step = 0; step < 40; step += 1) {
    await page.getByRole('radio').first().click();

    const calculate = page.getByRole('button', { name: 'Calculate indicative exposure' });
    if ((await calculate.count()) > 0) {
      await calculate.click();
      return;
    }

    await page.getByRole('button', { name: 'Next' }).click();
  }

  throw new Error('The questionnaire did not reach the calculate button.');
}

test('the results dashboard renders after a calculation', async ({ page }) => {
  await page.route('**/api/calculate.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: capturedResponse }),
  );

  await completeQuestionnaire(page);

  await expect(page.getByRole('heading', { name: 'Indicative annual cyber-loss exposure' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Loading this view…')).toHaveCount(0);
  await expect(page.getByText('Loading the results view…')).toHaveCount(0);
  // The charts are the part that needs the on-demand chunk, so one of them must exist.
  await expect(page.locator('svg').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open QuickRisk Live' })).toBeVisible();
});

test('a result chunk that cannot be downloaded is reported, not left loading', async ({ page }) => {
  const reported: string[] = [];
  page.on('pageerror', (error) => reported.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      reported.push(message.text());
    }
  });

  await page.route('**/api/calculate.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: capturedResponse }),
  );
  // The development server serves the module, not a hashed chunk, so this is the file
  // the lazy import has to fetch in this environment.
  await page.route('**/src/components/results/ResultsDashboard*', (route) => route.abort());

  await completeQuestionnaire(page);

  await expect(page.getByText('This view could not be displayed')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Reload the page' })).toBeVisible();
  await expect(page.getByText('Loading this view…')).toHaveCount(0);

  // The failure is reported to the developer console by the boundary, never swallowed.
  expect(reported.some((message) => message.includes('failed to render'))).toBe(true);
});
