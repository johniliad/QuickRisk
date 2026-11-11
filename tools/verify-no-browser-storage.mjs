#!/usr/bin/env node
/**
 * Zero-retention guard for the browser build.
 *
 * Fails the build if any frontend source, HTML template or static asset references a
 * browser persistence API, a cookie, a service worker, a persistence middleware or a
 * persistent results URL. This is a release blocker: the application must not be able
 * to reconstruct an assessment after the page is closed.
 *
 * The forbidden identifiers are assembled from fragments so that this file itself does
 * not trip the same check when the PHP test suite scans the repository.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const scanTargets = [
  'frontend/src',
  'frontend/shared',
  'frontend/public',
].map((directory) => join(repositoryRoot, directory));
const scanFiles = [join(repositoryRoot, 'frontend/index.html')];
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html', '.txt', '.xml']);

const forbidden = [
  ['local', 'Storage'],
  ['session', 'Storage'],
  ['indexed', 'DB'],
  ['document', '.cookie'],
  ['cach', 'es.'],
  ['service', 'Worker'],
  ['zustand/', 'middleware'],
  ['pers', 'ist('],
  ['history.push', 'State'],
  ['history.replace', 'State'],
  ['location', '.hash'],
  ['?results', '='],
  ['assessment', 'Token'],
];

function collectFiles(directory, collected = []) {
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return collected;
  }

  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist') {
      continue;
    }
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectFiles(fullPath, collected);
    } else if (extensions.has(fullPath.slice(fullPath.lastIndexOf('.')))) {
      collected.push(fullPath);
    }
  }

  return collected;
}

const files = [...scanTargets.flatMap((directory) => collectFiles(directory)), ...scanFiles];
const failures = [];

for (const file of files) {
  const contents = readFileSync(file, 'utf8');
  const displayPath = relative(repositoryRoot, file).replaceAll('\\', '/');

  for (const fragments of forbidden) {
    const needle = fragments.join('');
    if (contents.includes(needle)) {
      failures.push(`${displayPath}: contains "${needle}"`);
    }
  }
}

if (files.length === 0) {
  console.error('Zero-retention check FAILED: no frontend sources were found to inspect.');
  process.exit(1);
}

if (failures.length > 0) {
  console.error('Zero-retention browser check FAILED:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`Zero-retention browser check passed (${files.length} files inspected).`);
