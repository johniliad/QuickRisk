/**
 * Public share entry point.
 *
 * Served at /live/share/{token}. The token is read from the path, never from a query string,
 * and the page renders a read-only view of exactly one saved assessment.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Footer } from '@/components/layout/Footer';
import { SharedAssessmentView } from '@/live/SharedAssessmentView';
import { SharedBoardPack } from '@/decision/board/SharedBoardPack';
import '@/styles/index.css';

const TOKEN_PATTERN = /^[A-Za-z0-9]{32,128}$/;

function readSharePath(): { token: string | null; board: boolean } {
  const segments = globalThis.location.pathname.split('/').filter((segment) => segment !== '');
  const last = segments[segments.length - 1] ?? '';
  const board = segments.includes('board');

  return { token: TOKEN_PATTERN.test(last) ? last : null, board };
}

function ShareRoot() {
  const { token, board } = readSharePath();
  const homeUrl = import.meta.env.BASE_URL;

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-border">
        <div className="qk-shell flex min-h-[72px] flex-wrap items-center justify-between gap-3 py-3">
          <a href={homeUrl} className="inline-flex items-center gap-3 text-ink no-underline">
            <span className="grid size-[38px] place-items-center rounded-control bg-accent-strong text-[0.8rem] font-bold text-white">
              QR
            </span>
            <span className="grid gap-0.5">
              <span className="text-[1.02rem] font-bold leading-tight">
                FAIR <span className="text-accent-strong">QuickRisk</span> Live
              </span>
              <span className="text-micro font-medium tracking-[0.07em] text-muted">
                SHARED ASSESSMENT — READ ONLY
              </span>
            </span>
          </a>
          <a className="text-small font-semibold text-accent-strong" href={homeUrl}>
            Open QuickRisk
          </a>
        </div>
      </header>
      <main className="qk-shell flex-1 py-8">
        {token === null ? (
          <p className="m-0">
            This link is not a valid QuickRisk share link. Ask the sender for a new link.
          </p>
        ) : board ? (
          <SharedBoardPack token={token} />
        ) : (
          <SharedAssessmentView token={token} />
        )}
      </main>
      <Footer />
    </div>
  );
}

const container = document.getElementById('root');

if (container === null) {
  throw new Error('The share page root element is missing.');
}

createRoot(container).render(
  <StrictMode>
    <ShareRoot />
  </StrictMode>,
);
