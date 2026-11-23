import type { Page } from '@playwright/test';
import {
  assessmentResults,
  comparison,
  liveDetail,
  liveSummary,
  portfolioSearch,
  savedDecisionSummary,
  shareUrl,
  treatmentCatalogue,
} from './fixtures';

const json = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ ok: true, data }),
});

const session = {
  csrfToken: 'c'.repeat(64),
  expiresAt: '2026-11-22T12:00:00Z',
  sessionLabel: 'PLAYWRIGHTSESSION',
};

/** Installs the API responses needed by Decision Lab. */
export async function mockDecisionLabApi(page: Page): Promise<void> {
  await page.route('**/live/api/session.php', (route) => route.fulfill(json(session)));
  await page.route('**/live/api/decision-treatments.php', (route) => route.fulfill(json(treatmentCatalogue)));
  await page.route('**/live/api/decision-compute.php', (route) => {
    const body = (route.request().postDataJSON() ?? {}) as { action?: string };
    return route.fulfill(json(body.action === 'portfolios' ? portfolioSearch : comparison));
  });
  await page.route('**/live/api/decision-assessments.php', (route) =>
    route.fulfill(json(route.request().method() === 'POST' ? savedDecisionSummary : [savedDecisionSummary])),
  );
  await page.route('**/live/api/decision-share.php*', (route) => route.fulfill(json({ shareUrl })));
}

/** Boots the real app and places a completed assessment in memory. */
export async function loadDecisionLab(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async (results) => {
    const storeModuleUrl = '/src/state/assessmentStore.ts';
    const module = await import(/* @vite-ignore */ storeModuleUrl);
    module.useAssessmentStore.setState({
      view: 'decision-lab',
      results,
      selectedScenarioCode: 'S1',
    });
  }, assessmentResults);
}

/** Installs the API responses needed by the Live simulator. */
export async function mockLiveApi(page: Page): Promise<void> {
  await page.route('**/live/api/session.php', (route) => route.fulfill(json(session)));
  await page.route('**/live/api/scenarios.php', (route) => route.fulfill(json([])));
  await page.route('**/live/api/assessments.php', (route) =>
    route.fulfill(json(route.request().method() === 'POST' ? liveDetail : [liveSummary])),
  );
  await page.route('**/live/api/assessment.php*', (route) => route.fulfill(json(liveDetail)));
  await page.route('**/live/api/share.php*', (route) =>
    route.fulfill(json(route.request().method() === 'DELETE' ? { revoked: true } : { shareUrl })),
  );
}

/** Boots the real app and places a completed assessment in memory for Live. */
export async function loadLive(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async (results) => {
    const storeModuleUrl = '/src/state/assessmentStore.ts';
    const module = await import(/* @vite-ignore */ storeModuleUrl);
    module.useAssessmentStore.setState({
      view: 'live',
      results,
      selectedScenarioCode: 'S1',
    });
  }, assessmentResults);
}

/** Installs the API response for one public shared Live assessment. */
export async function mockSharedLiveApi(page: Page): Promise<void> {
  await page.route('**/live/api/shared.php*', (route) => route.fulfill(json(liveDetail)));
}

