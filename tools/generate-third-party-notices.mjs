#!/usr/bin/env node
/**
 * FAIR QuickRisk — generate the notices that must travel with the compiled bundle.
 *
 * Usage:
 *   node tools/generate-third-party-notices.mjs          # write the files
 *   node tools/generate-third-party-notices.mjs --check  # verify they are current
 *
 * Writes two files into frontend/public/, so Vite copies them into the build and
 * they are served at /THIRD-PARTY-NOTICES.txt and /LICENSE.txt:
 *
 *   THIRD-PARTY-NOTICES.txt  every production dependency, its version, its licence
 *                            expression and the licence/NOTICE text it ships
 *   LICENSE.txt              an exact copy of the repository LICENSE
 *
 * The dependency set is the one npm resolves for production (npm ls --omit=dev),
 * which is the code that can end up in dist/. Dev-only tooling is not bundled and
 * is therefore not listed — though it remains licensed under its own terms.
 *
 * --check fails when a file is missing, out of date, or when a dependency carries a
 * licence outside the permissive allow-list. It is part of `npm run lint`.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const frontend = path.join(root, 'frontend');
const publicDir = path.join(frontend, 'public');
const noticesPath = path.join(publicDir, 'THIRD-PARTY-NOTICES.txt');
const licensePath = path.join(publicDir, 'LICENSE.txt');
const noticePath = path.join(publicDir, 'NOTICE.txt');
const checkOnly = process.argv.includes('--check');

/** Licences that may be bundled without further obligation beyond attribution. */
const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Apache-2.0',
  'Unlicense',
  'CC0-1.0',
  'BlueOak-1.0.0',
]);

function fail(message) {
  process.stderr.write('error: ' + message + '\n');
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function licenseExpression(pkg) {
  if (typeof pkg.license === 'string') return pkg.license.trim();
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type.trim();
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    return pkg.licenses
      .map((entry) => (typeof entry === 'string' ? entry : String(entry.type ?? '')))
      .filter(Boolean)
      .join(' OR ');
  }
  return '';
}

function permissive(expression) {
  const tokens = expression
    .replace(/[()]/g, ' ')
    .split(/\s+(?:AND|OR|WITH)\s+/i)
    .map((token) => token.trim())
    .filter(Boolean);

  return tokens.length > 0 && tokens.every((token) => ALLOWED.has(token));
}

function noticeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^(LICEN[CS]E|COPYING|NOTICE)/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function productionDirectories() {
  let listing = '';
  try {
    listing = execSync('npm ls --omit=dev --all --parseable', {
      cwd: frontend,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    fail('npm could not resolve the production dependency tree: ' + error.message);
  }

  const directories = new Set();
  for (const line of listing.split(/\r?\n/)) {
    const candidate = line.trim();
    if (candidate === '' || !candidate.includes('node_modules')) continue;
    if (existsSync(path.join(candidate, 'package.json'))) {
      directories.add(path.resolve(candidate));
    }
  }

  return [...directories].sort();
}

function collect() {
  const packages = [];
  const seen = new Set();
  const problems = [];

  for (const directory of productionDirectories()) {
    const pkg = readJson(path.join(directory, 'package.json'));
    if (typeof pkg.name !== 'string' || pkg.name === 'fair-quickrisk-frontend') continue;

    const key = pkg.name + '@' + pkg.version;
    if (seen.has(key)) continue;
    seen.add(key);

    const expression = licenseExpression(pkg);
    if (expression === '') {
      problems.push(key + ' declares no licence');
      continue;
    }
    if (!permissive(expression)) {
      problems.push(key + ' is licensed ' + expression + ', which is outside the allow-list');
      continue;
    }

    const files = noticeFiles(directory);
    const texts = files.map((name) => ({
      name,
      body: readFileSync(path.join(directory, name), 'utf8').replace(/\r\n?/g, '\n').trimEnd(),
    }));

    packages.push({ name: pkg.name, version: pkg.version, license: expression, texts });
  }

  if (problems.length > 0) {
    fail('the bundled dependencies are not all permissively licensed:\n  - ' + problems.join('\n  - '));
  }

  packages.sort((a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'));

  return packages;
}

function buildNotices(packages, notice) {
  const manifest = readJson(path.join(root, 'fairquickmodel', 'manifest.json'));
  const families = new Map();
  for (const entry of packages) {
    const family = ALLOWED.has(entry.license) ? entry.license : 'compound';
    families.set(family, (families.get(family) ?? 0) + 1);
  }
  const summary = [...families.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'en'))
    .map(([family, count]) => family + ' (' + count + ')')
    .join(', ');

  const bar = '='.repeat(80);
  const thin = '-'.repeat(80);
  const lines = [];

  lines.push('THIRD-PARTY NOTICES');
  lines.push(bar);
  lines.push('');
  lines.push('FAIR QuickRisk — application ' + manifest.applicationVersion + ', model ' + manifest.modelId + '.');
  lines.push('');
  lines.push('FAIR QuickRisk is licensed under the Apache License, Version 2.0. A copy');
  lines.push('travels with this file as LICENSE.txt and in the repository root.');
  lines.push('');
  lines.push('The project NOTICE is reproduced below and is also served as NOTICE.txt.');
  lines.push('');
  lines.push('The compiled browser assets bundle the third-party packages listed below.');
  lines.push('Each entry reproduces the licence text and attribution notice that the');
  lines.push('package ships, as those licences require. Packages that ship no licence');
  lines.push('file are listed with the licence their package metadata declares.');
  lines.push('');
  lines.push('Generated from the production dependency tree by');
  lines.push('tools/generate-third-party-notices.mjs. Do not edit by hand: run');
  lines.push('`npm run notices` in frontend/ and commit the result.');
  lines.push('');
  lines.push('Packages: ' + packages.length + '. Licence families: ' + summary + '.');
  lines.push('');
  lines.push(bar);
  lines.push('PROJECT NOTICE');
  lines.push(bar);
  lines.push('');
  for (const line of notice.trimEnd().split('\n')) {
    lines.push(line);
  }
  lines.push('');
  lines.push(thin);
  lines.push('INDEX');
  lines.push(thin);
  lines.push('');
  for (const entry of packages) {
    lines.push('  ' + entry.name + ' ' + entry.version + ' — ' + entry.license);
  }
  lines.push('');

  for (const entry of packages) {
    lines.push(bar);
    lines.push(entry.name + ' ' + entry.version + ' — ' + entry.license);
    lines.push(bar);
    lines.push('');
    if (entry.texts.length === 0) {
      lines.push('This package ships no licence file; its package metadata declares');
      lines.push(entry.license + '. The full text of that licence is reproduced with');
      lines.push('another package above or below that ships it.');
      lines.push('');
      continue;
    }
    for (const text of entry.texts) {
      if (entry.texts.length > 1) {
        lines.push('--- ' + text.name + ' ---');
        lines.push('');
      }
      lines.push(text.body);
      lines.push('');
    }
  }

  lines.push(bar);
  lines.push('END OF THIRD-PARTY NOTICES');
  lines.push(bar);
  lines.push('');

  return lines.join('\n');
}

const packages = collect();
const license = readFileSync(path.join(root, 'LICENSE'), 'utf8').replace(/\r\n?/g, '\n');
const notice = readFileSync(path.join(root, 'NOTICE'), 'utf8').replace(/\r\n?/g, '\n');
const notices = buildNotices(packages, notice);

function compare(file, expected) {
  if (!existsSync(file)) {
    fail(path.relative(root, file) + ' is missing. Run: node tools/generate-third-party-notices.mjs');
  }
  const actual = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  if (actual.trimEnd() !== expected.trimEnd()) {
    fail(path.relative(root, file) + ' is out of date. Run: node tools/generate-third-party-notices.mjs');
  }
}

if (checkOnly) {
  compare(noticesPath, notices);
  compare(licensePath, license);
  compare(noticePath, notice);
  process.stdout.write(
    'Licence notices are current: ' + packages.length + ' production packages, all permissive.\n'
  );
  process.exit(0);
}

writeFileSync(noticesPath, notices, 'utf8');
writeFileSync(licensePath, license, 'utf8');
writeFileSync(noticePath, notice, 'utf8');

process.stdout.write(
  'Wrote ' +
    path.relative(root, noticesPath) +
    ' (' +
    packages.length +
    ' packages), ' +
    path.relative(root, licensePath) +
    ' and ' +
    path.relative(root, noticePath) +
    '.\n'
);
