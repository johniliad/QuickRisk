import { expect, test } from '@playwright/test';

/**
 * Tailwind v4 treats text-[var(--text-…)] as a colour utility. The theme-derived
 * utilities must be used instead, otherwise every heading falls back to 16px.
 */
for (const viewport of [
  { width: 1440, height: 1000, display: '48px', title: '32px' },
  { width: 390, height: 844, display: '32px', title: '24px' },
]) {
  test(`landing headings use the theme type scale at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    const heading = page.getByRole('heading', { level: 1 });
    const lead = heading.locator('xpath=following-sibling::p[1]');
    const sectionHeading = page.getByRole('heading', { name: 'Choose how you start', exact: true });

    await expect(heading).toHaveCSS('font-size', viewport.display);
    await expect(sectionHeading).toHaveCSS('font-size', viewport.title);
    await expect(lead).toHaveCSS('font-size', '17.6px');

    const headingSize = await heading.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    const leadSize = await lead.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect(headingSize).toBeGreaterThan(leadSize);

    const image = page.locator('main > section').first().locator('img');
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS('object-fit', 'fill');
    const imageRatios = await image.evaluate((element: HTMLImageElement) => ({
      rendered: element.getBoundingClientRect().width / element.getBoundingClientRect().height,
      natural: element.naturalWidth / element.naturalHeight,
    }));
    expect(imageRatios.rendered).toBeCloseTo(imageRatios.natural, 2);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
}
