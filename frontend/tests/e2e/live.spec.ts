import { expect, test } from '@playwright/test';
import { shareUrl } from './fixtures';
import { loadLive, mockLiveApi } from './harness';

test('Live saves, marks edits, updates and shares user-recorded data', async ({ page }) => {
  await mockLiveApi(page);
  await loadLive(page);

  await expect(page.getByRole('heading', { name: 'Simulated SOC risk state' })).toBeVisible();
  await expect(page.getByText('Not saved yet', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Save assessment' }).click();
  await expect(page.getByText('Saved. The stored assessment matches the current simulation.')).toBeVisible();
  await expect(page.getByText('Saved to your session', { exact: true })).toBeVisible();

  await page.locator('#live-stage').selectOption('compromise');
  await expect(
    page.getByText('Unsaved changes. The stored assessment and any share link still describe the last saved state.'),
  ).toBeVisible();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share assessment' })).toBeDisabled();

  await page.getByRole('button', { name: 'Update saved assessment' }).click();
  await expect(page.getByText('Saved. The stored assessment matches the current simulation.')).toBeVisible();

  await page.getByRole('button', { name: 'Share assessment' }).click();
  await expect(page.getByText(shareUrl)).toBeVisible();
  await expect(page.getByText(/recorded as user-supplied simulation data/)).toBeVisible();
});

test('Live history shows the user-recorded disclosure and reopens a saved assessment', async ({
  page,
}) => {
  await mockLiveApi(page);
  await loadLive(page);

  await page.getByRole('button', { name: 'Assessment history' }).click();
  await expect(page.getByRole('heading', { name: 'Saved QuickRisk Live assessments' })).toBeVisible();
  await expect(page.getByText('USER-RECORDED SIMULATION DATA — Not independently verified by the server').first()).toBeVisible();

  const opened = page.waitForResponse(
    (response) => response.url().includes('/live/api/assessment.php') && response.request().method() === 'GET',
  );
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await opened;
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Simulated SOC risk state' })).toBeVisible();
  await expect(page.getByLabel('Assessment title')).toHaveValue('Finance rehearsal');
  await expect(page.getByText('Saved. The stored assessment matches the current simulation.')).toBeVisible();
});

test('Live baseline change normalises the SOC state and clears a recorded timeline', async ({ page }) => {
  await mockLiveApi(page);
  await loadLive(page);

  await page.locator('#live-event-label').fill('First observation');
  await page.getByRole('button', { name: 'Record current state' }).click();
  await page.locator('#live-event-label').fill('Second observation');
  await page.getByRole('button', { name: 'Record current state' }).click();
  await expect(page.getByText('First observation')).toBeVisible();

  await page
    .getByLabel("Quantitative baseline — which scenario's EAL to use")
    .selectOption('S2');

  await expect(
    page.getByText(
      'Baseline changed. The simulation timeline was cleared because every recorded exposure depends on the baseline.',
    ),
  ).toBeVisible();
  await expect(page.getByText('No timeline entries yet.')).toBeVisible();
  await expect(
    page.getByLabel("Quantitative baseline — which scenario's EAL to use"),
  ).toHaveValue('S2');
});

