import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import '@/styles/index.css';

/**
 * Entry point.
 *
 * The whole assessment lives in memory. No browser storage API is used anywhere in this
 * application, and the build includes no service worker and no analytics.
 */
const container = document.getElementById('root');

if (container === null) {
  throw new Error('The application root element was not found in the document.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
