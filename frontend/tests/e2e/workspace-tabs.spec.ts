import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { mockLiveApi } from './harness';

/**
 * Phase 1 information architecture.
 *
 * The header used to expose eight equal destinations, so nothing identified the main
 * workspace and the mandatory disclaimer sat beside a methodology page. These tests pin the
 * replacement: three workspace tabs, reference material behind modals, and three entry
 * actions on the landing page.
 *
 * The first two cases pin reported regressions: the header brand must return to the site
 * root, and every view change must start at the top of the new screen.
 */
const capturedResponse = readFileSync(
  fileURLToPath(new URL('./fixtures/assessment-response.json', import.meta.url)),
  'utf8',
);

test('the header brand returns to the site root', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'FAIR QuickRisk home' })).toHaveAttribute(
    'href',
    'https://quickrisk.iliadis.net/',
  );
});

/**
 * A view change replaces the page content, so the new screen has to start at the top.
 * Choosing an entry path from the lower half of the landing page used to leave the
 * disclaimer gate at the previous scroll offset, so the agreement appeared mid-page.
 */
test('an entry path opens the disclaimer at the top of the page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const button = page.getByRole('button', { name: 'Start the quick check' });
  await button.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await button.click();
  await expect(page.getByRole('heading', { name: 'Purpose, limitations and disclaimer' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('the header exposes three workspace tabs and no eight-link row', async ({ page }) => {
  await page.goto('/');

  const workspace = page.getByRole('navigation', { name: 'Workspace' });
  await expect(workspace).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Risk Calculator' })).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Board Brief' })).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Saved Packs' })).toBeVisible();

  // The old destinations are gone from primary navigation.
  await expect(page.getByRole('banner').getByRole('button', { name: 'Overview', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Live methodology', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('banner').getByRole('button', { name: 'Your data', exact: true })).toHaveCount(0);
});

test('Board Brief states that it has no result to print', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Board Brief' }).click();

  await expect(page.getByRole('heading', { name: 'No result in this tab yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to the Risk Calculator entry' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Board Brief' }),
  ).toHaveAttribute('aria-current', 'page');
});

test('Saved Packs opens as its own workspace tab', async ({ page }) => {
  await mockLiveApi(page);

  await page.goto('/');
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Saved Packs' }).click();

  await expect(page.getByText('Workspace · Saved Packs')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your saved work', level: 1 })).toBeVisible();
  await expect(page.getByText(/30 days/).first()).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Saved Packs' }),
  ).toHaveAttribute('aria-current', 'page');
});


test('methodology opens in a modal and can switch between the three surfaces', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('banner').getByRole('button', { name: 'Methodology', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Methodology & calibration' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Baseline FAIR-QK' })).toHaveAttribute('aria-pressed', 'true');

  await dialog.getByRole('button', { name: 'Live SOC overlay' }).click();
  await expect(dialog.getByText(/SOC multiplier/).first()).toBeVisible();

  await dialog.getByRole('button', { name: 'Decision Lab & FAIR-CAM' }).click();
  await expect(dialog.getByText(/Risk Reduction Efficiency/).first()).toBeVisible();

  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the disclaimer opens in a modal without starting the assessment', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('banner').getByRole('button', { name: 'Disclaimer', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Scope and disclaimer' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Read the disclaimer and start' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('heading', { name: 'Your journey in three steps' })).toBeVisible();
});

test('the trust strip opens the explanation behind each claim', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Zero-retention by default' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Where your data goes' })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.getByRole('button', { name: 'Indicative FAIR-QK model' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Methodology & calibration' })).toBeVisible();
});

test('the landing page offers three ways in, cheapest first', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Choose how you start' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Load 60-Second Sample' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quick 1-Scenario Check' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Full 5-Scenario Assessment' })).toBeVisible();

  await expect(page.getByRole('button', { name: 'Load the 60-second sample' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start the quick check' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start the assessment' })).toBeVisible();

  // The quick path states what happens to the scenarios it does not ask.
  await expect(page.getByLabel('Scenario for the quick check')).toBeVisible();
});


test('the sample loads complete answers and calculates them after acknowledgement', async ({ page }) => {
  await page.route('**/api/calculate.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: capturedResponse }),
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Load the 60-second sample' }).click();

  // The sample does not acknowledge the disclaimer on the visitor's behalf.
  await expect(page.getByRole('heading', { name: 'Purpose, limitations and disclaimer' })).toBeVisible();
  await expect(page.getByText('The answers in this tab are already complete.')).toBeVisible();

  const calculate = page.getByRole('button', { name: 'Calculate these answers' });
  await expect(calculate).toBeDisabled();

  await page.getByRole('checkbox').first().click();
  await expect(calculate).toBeEnabled();
  await calculate.click();

  await expect(page.getByRole('heading', { name: 'Indicative annual cyber-loss exposure' })).toBeVisible({
    timeout: 20_000,
  });
});

test('the quick check asks the profile and one scenario only', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Scenario for the quick check').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Start the quick check' }).click();
  await page.getByRole('checkbox').first().click();
  await page.getByRole('button', { name: 'Start assessment' }).click();

  // Profile questions first, then the selected scenario's two questions, and nothing else.
  await expect(page.getByText('Quick check — one scenario')).toBeVisible();

  let steps = 0;
  for (let index = 0; index < 40; index += 1) {
    const calculate = page.getByRole('button', { name: 'Calculate indicative exposure' });
    if ((await calculate.count()) > 0) {
      break;
    }
    await page.getByRole('radio').first().click();
    await page.getByRole('button', { name: 'Next' }).click();
    steps += 1;
  }

  // 8 profile questions plus 2 scenario questions.
  expect(steps).toBeLessThanOrEqual(11);
});
