import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Adds Subresource Integrity to every same-origin script and stylesheet that an HTML
 * entry references.
 *
 * The build already emits content-hashed file names, but a hash in the name is not an
 * integrity check: if the file served under that name is altered (a tampered CDN, a
 * compromised host, a rewriting proxy) the browser would execute it. An `integrity`
 * attribute makes the browser refuse a resource whose sha384 does not match, so the
 * page degrades to "nothing runs" instead of "the attacker's code runs".
 *
 * A passive security scan reports every <script src> and <link rel="stylesheet">
 * without this attribute as "Sub Resource Integrity Attribute Missing", so the plugin
 * keeps that finding closed by construction rather than by remembering to add it.
 *
 * The digests are taken from the files on disk in `writeBundle`, not from the in-memory
 * bundle: only the bytes the server will actually return can be hashed correctly. Two
 * consequences worth knowing: a proxy that minifies or rewrites the assets in flight
 * will break the page (do not enable such a feature), and dynamically imported chunks
 * are not covered, because the browser fetches those from JavaScript, not from the HTML.
 */
function subresourceIntegrity(): Plugin {
  let base = '/';
  let outDir = '';

  /** Recursively lists the files below a directory. */
  const walk = (directory: string): string[] => {
    const entries: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        entries.push(...walk(path));
      } else if (entry.isFile()) {
        entries.push(path);
      }
    }

    return entries;
  };

  return {
    name: 'quickrisk-subresource-integrity',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      base = config.base ?? '/';
      outDir = resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const hashes = new Map<string, string>();

      for (const file of walk(outDir)) {
        if (!/\.(?:m?js|css)$/i.test(file)) {
          continue;
        }
        const digest = createHash('sha384').update(readFileSync(file)).digest('base64');
        hashes.set(relative(outDir, file).split(sep).join('/'), `sha384-${digest}`);
      }

      for (const file of walk(outDir)) {
        if (!file.endsWith('.html')) {
          continue;
        }

        const html = readFileSync(file, 'utf8');
        const withIntegrity = html.replace(
          /<(script|link)\b([^>]*)>/g,
          (tag: string, name: string, attributes: string) => {
            if (/\bintegrity\s*=/.test(attributes)) {
              return tag;
            }
            if (name === 'link' && !/\brel\s*=\s*"(?:stylesheet|modulepreload)"/i.test(attributes)) {
              return tag;
            }
            const reference = /\b(?:src|href)\s*=\s*"([^"]+)"/i.exec(attributes);
            if (reference === null) {
              return tag;
            }
            const url = reference[1];
            if (!url.startsWith('/') || url.startsWith('//')) {
              return tag;
            }
            const path = url.startsWith(base) ? url.slice(base.length) : url.replace(/^\//, '');
            const integrity = hashes.get(path);
            if (integrity === undefined) {
              return tag;
            }

            return `<${name}${attributes} integrity="${integrity}">`;
          },
        );

        if (withIntegrity !== html) {
          writeFileSync(file, withIntegrity, 'utf8');
        }
      }
    },
  };
}

/**
 * FAIR QuickRisk — production build configuration.
 *
 * The build emits static HTML/CSS/JavaScript only. No Node.js runtime, application
 * server or development server is required in production; Apache serves the output
 * and PHP handles the calculation endpoint.
 *
 * Base path: the application is published at https://quickrisk.iliadis.net/, so the
 * default base is "/". Set VITE_BASE_PATH=/quickrisk/ to publish it under
 * https://www.iliadis.net/quickrisk/ instead.
 *
 * Source maps are deliberately disabled so that no TypeScript source is ever
 * exposed through the public URL.
 */
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), subresourceIntegrity()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The authoritative model is imported at BUILD TIME. Only the public
      // presentation files may be imported; parameters.json is server-only and is
      // guarded by tools/verify-frontend-boundary.mjs.
      '@model': fileURLToPath(new URL('../fairquickmodel', import.meta.url)),
    },
  },
  server: {
    fs: {
      // Development server only: allow reading the model directory above the root.
      allow: ['..'],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    assetsDir: 'assets',
    reportCompressedSize: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        // The main application.
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // The read-only share shell served at /live/share/{token}. It is a second HTML entry
        // because the application deliberately has no SPA router.
        'live/share': fileURLToPath(new URL('./live/share/index.html', import.meta.url)),
      },
    },
  },
});
