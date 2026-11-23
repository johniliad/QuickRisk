import { Archive, LayoutDashboard, Printer } from 'lucide-react';
import {
  WORKSPACE_TABS,
  workspaceTabForView,
  type WorkspaceTabKey,
} from '@/content/workspaceNav';
import { cn } from '@/lib/cn';
import { useAssessmentStore } from '@/state/assessmentStore';

/**
 * The three workspace tabs.
 *
 * They replace the eight top-level links the header used to carry. Two rules matter:
 *
 * - the active tab is derived from the view, so a screen reached from anywhere (a saved
 *   pack, a share link, the footer) still shows the visitor where they are;
 * - Risk Calculator returns to the furthest state the tab already holds — a result if one
 *   exists, the questionnaire if answers are being collected, the entry page otherwise —
 *   because a tab that throws away work is a tab nobody presses.
 */
const tabIcons: Record<WorkspaceTabKey, typeof LayoutDashboard> = {
  'risk-calculator': LayoutDashboard,
  'board-brief': Printer,
  'saved-packs': Archive,
};

export function WorkspaceTabs() {
  const view = useAssessmentStore((state) => state.view);
  const setView = useAssessmentStore((state) => state.setView);
  const results = useAssessmentStore((state) => state.results);
  const active = workspaceTabForView(view);

  const open = (key: WorkspaceTabKey) => {
    if (key === 'board-brief') {
      setView('board-brief');
      return;
    }

    if (key === 'saved-packs') {
      setView('saved-packs');
      return;
    }

    if (results !== null) {
      setView('results');
      return;
    }

    if (view === 'disclaimer' || view === 'questionnaire' || view === 'calculating') {
      // Already inside the calculator; keep the visitor where they were.
      return;
    }

    setView('landing');
  };

  return (
    <nav aria-label="Workspace" className="flex flex-wrap items-center gap-1">
      {WORKSPACE_TABS.map((tab) => {
        const Icon = tabIcons[tab.key];
        const isActive = tab.key === active;

        return (
          <button
            key={tab.key}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            title={tab.description}
            onClick={() => open(tab.key)}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-control border px-3 text-small font-semibold transition-colors',
              isActive
                ? 'border-accent-strong bg-accent-strong text-white'
                : 'border-border bg-paper text-ink hover:bg-accent-soft hover:text-accent-strong',
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
