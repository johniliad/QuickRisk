import { expect, test } from '@playwright/test';
import { liveDetail } from './fixtures';
import { mockSharedLiveApi } from './harness';

const token = 'd'.repeat(40);

test('the public Live share page replays a saved assessment with the user-recorded notice', async ({
  page,
}) => {
  await mockSharedLiveApi(page);
  // Let Vite transform the real share entry so its React refresh preamble is present.
  const shareHtml = await (await page.request.get('/live/share/index.html')).text();
  await page.route(`**/live/share/${token}`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: shareHtml }),
  );

  await page.goto(`/live/share/${token}`);

  await expect(
    page.getByText('USER-RECORDED SIMULATION DATA — Not independently verified by the server').first(),
  ).toBeVisible();
  await expect(page.getByText(liveDetail.title)).toBeVisible();
  await expect(page.getByText(/not proof that the server calculated it/).first()).toBeVisible();
});

