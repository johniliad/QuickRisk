import { expect, test } from '@playwright/test';

test('the real application boots and the assessment store is reachable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start the assessment' })).toBeVisible();

  const view = await page.evaluate(async () => {
    const storeModuleUrl = '/src/state/assessmentStore.ts';
    const module = await import(/* @vite-ignore */ storeModuleUrl);
    module.useAssessmentStore.setState({ view: 'methodology' });

    return module.useAssessmentStore.getState().view;
  });

  expect(view).toBe('methodology');
  await expect(page.getByText('Methodology', { exact: true }).first()).toBeVisible();
});
