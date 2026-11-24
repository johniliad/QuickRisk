import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexPath = new URL('../index.html', import.meta.url);
const methodologyPath = new URL('../public/methodology.html', import.meta.url);

describe('public documentation pages', () => {
  it('publishes the 2026 hero image with dimensions and alt text', () => {
    const html = readFileSync(indexPath, 'utf8');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('https://quickrisk.iliadis.net/images/quickrisk-hero-2026-11.jpg');
    expect(html).toContain('property="og:image:width" content="1920"');
    expect(html).toContain('property="og:image:height" content="1280"');
    expect(html).toContain('property="og:image:alt"');
    expect(html).toContain('name="twitter:image"');
  });

  it('describes the active posterior model on the public methodology page', () => {
    const html = readFileSync(methodologyPath, 'utf8');
    expect(html).toContain('FAIR-QK-2.0');
    expect(html).toContain('CAL-2.0');
    expect(html).toContain('Poisson count of material-loss events');
    expect(html).toContain('shared posterior draws');
    expect(html).toContain('posterior-predictive P10/P50/P90 annual totals');
  });

  it('does not publish retired annualised-exposure claims as current behaviour', () => {
    const index = readFileSync(indexPath, 'utf8');
    const methodology = readFileSync(methodologyPath, 'utf8');
    for (const html of [index, methodology]) {
      expect(html).not.toContain('annualised exposure approximation');
      expect(html).not.toContain('no joint portfolio percentile');
      expect(html).not.toContain('does not draw a number of events per year');
    }
  });
});
