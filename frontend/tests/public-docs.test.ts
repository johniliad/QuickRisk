import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexPath = new URL('../index.html', import.meta.url);
const methodologyPath = new URL('../public/methodology.html', import.meta.url);
const socialCardPath = new URL('../public/images/quickrisk-social-2026-11.jpg', import.meta.url);
const heroPath = new URL('../public/images/quickrisk-hero-2026-11.jpg', import.meta.url);

/**
 * Reads the pixel size out of a JPEG's start-of-frame segment, so the test can prove that the
 * declared Open Graph dimensions match the bytes actually served instead of trusting a
 * hand-edited meta tag. LinkedIn crops previews to 1.91:1, so a mismatch silently crops the
 * artwork.
 */
function jpegSize(path: URL): { width: number; height: number } {
  const bytes = readFileSync(path);
  let offset = 2; // skip the SOI marker
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  throw new Error(`No JPEG start-of-frame segment found in ${path.pathname}`);
}

describe('public documentation pages', () => {
  it('publishes a LinkedIn-sized social card whose declared dimensions match the file', () => {
    const html = readFileSync(indexPath, 'utf8');
    const ogImage = /property="og:image" content="([^"]+)"/.exec(html)?.[1];
    const twitterImage = /name="twitter:image" content="([^"]+)"/.exec(html)?.[1];

    expect(ogImage).toBe('https://quickrisk.iliadis.net/images/quickrisk-social-2026-11.jpg');
    expect(twitterImage).toBe(ogImage);
    expect(html).toContain('property="og:image:secure_url" content="' + ogImage! + '"');
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="627"');
    expect(html).toContain('property="og:image:alt"');

    // The served card is exactly the 1.91:1 link-preview ratio LinkedIn renders, and stays
    // well inside LinkedIn's 5 MB limit, so the platform has no reason to crop or reject it.
    expect(jpegSize(socialCardPath)).toEqual({ width: 1200, height: 627 });
    expect(statSync(socialCardPath).size).toBeLessThan(5 * 1024 * 1024);

    // The 3:2 landing hero stays untouched for the on-page artwork.
    expect(jpegSize(heroPath)).toEqual({ width: 1920, height: 1280 });
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
