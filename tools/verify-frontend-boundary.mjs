#!/usr/bin/env node
/**
 * Model-boundary guard.
 *
 * The browser build may import only the PUBLIC presentation files of the
 * authoritative model. parameters.json contains the calibration values and must
 * never be bundled into client-side JavaScript.
 *
 * Run as part of `npm run lint`, which `npm run build` depends on.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const scanDirectories = ['frontend/src', 'frontend/shared'].map((directory) =>
  join(repositoryRoot, directory),
);
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const allowedModelImports = new Set([
  '@model/manifest.json',
  '@model/content.json',
  '@model/questions.json',
  '@model/answer-options.json',
  '@model/scenarios.json',
]);

const forbiddenPatterns = [
  { pattern: /parameters\.json/g, reason: 'parameters.json is server-only and must not be bundled into the browser build' },
  { pattern: /fairquickmodel[/\\]parameters/g, reason: 'direct import of the calibration file is not permitted' },
  { pattern: /calibrationVersion\s*[:=]\s*['"]CAL/g, reason: 'calibration values must come from the manifest, not be hard-coded' },
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
    } else if (sourceExtensions.has(fullPath.slice(fullPath.lastIndexOf('.')))) {
      collected.push(fullPath);
    }
  }

  return collected;
}

const files = scanDirectories.flatMap((directory) => collectFiles(directory));
const failures = [];

for (const file of files) {
  const contents = readFileSync(file, 'utf8');
  const displayPath = relative(repositoryRoot, file).replaceAll('\\', '/');

  for (const { pattern, reason } of forbiddenPatterns) {
    if (pattern.test(contents)) {
      failures.push(`${displayPath}: ${reason}`);
    }
    pattern.lastIndex = 0;
  }

  const modelImportPattern = /from\s+['"](@model\/[^'"]+)['"]/g;
  let match;
  while ((match = modelImportPattern.exec(contents)) !== null) {
    if (!allowedModelImports.has(match[1])) {
      failures.push(`${displayPath}: import of ${match[1]} is not on the public model allow-list`);
    }
  }
}

if (failures.length > 0) {
  console.error('Model-boundary check FAILED:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`Model-boundary check passed (${files.length} browser source files inspected).`);
