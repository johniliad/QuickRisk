import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration.
 *
 * Unit tests cover pure logic only (formatting, model adapter, questionnaire progress,
 * request/response schemas and the in-memory store). They do not need the React or
 * Tailwind plugins.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@model': fileURLToPath(new URL('../fairquickmodel', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
  },
});
