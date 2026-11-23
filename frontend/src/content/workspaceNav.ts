/**
 * Primary workspace navigation.
 *
 * The application used to expose eight top-level destinations (Overview, History,
 * Methodology, Live methodology, Analyst view, Your data, Disclaimer and the two tools).
 * Nothing said which of them was the main workspace, so a first-time visitor could not
 * tell where to start or why some screens were empty.
 *
 * Phase 1 replaces those eight links with three workspace tabs — the calculator where the
 * work happens, the board brief that carries the result out of the tool, and the saved
 * packs that hold explicit saves. Reference material (methodology, data handling,
 * disclaimer) moves into header triggers that open modals, because reading them is not a
 * destination.
 *
 * The mapping is a pure function so the active tab is pinned by a test rather than being
 * implied by component markup.
 */

import type { View } from '@/domain/assessment';

export type WorkspaceTabKey = 'risk-calculator' | 'board-brief' | 'saved-packs';

export interface WorkspaceTab {
  readonly key: WorkspaceTabKey;
  readonly label: string;
  /** One line saying what the tab is for, used as the tab's accessible description. */
  readonly description: string;
}

export const WORKSPACE_TABS: readonly WorkspaceTab[] = [
  {
    key: 'risk-calculator',
    label: 'Risk Calculator',
    description: 'Entry, questionnaire, results and the two simulation branches',
  },
  {
    key: 'board-brief',
    label: 'Board Brief',
    description: 'Executive memo and print-ready summary of the current result',
  },
  {
    key: 'saved-packs',
    label: 'Saved Packs',
    description: 'Saved Live and Decision Lab snapshots, share links and archiving',
  },
];

/**
 * Which workspace tab owns a view.
 *
 * The printable report belongs to the Board Brief because that view is the report; the
 * two histories belong to Saved Packs for the same reason. Everything else — landing,
 * questionnaire, results, Live, Decision Lab — is work inside the calculator.
 */
export function workspaceTabForView(view: View): WorkspaceTabKey {
  switch (view) {
    case 'board-brief':
    case 'report':
      return 'board-brief';
    case 'saved-packs':
    case 'history':
    case 'live-history':
    case 'decision-history':
      return 'saved-packs';
    default:
      return 'risk-calculator';
  }
}

/** Label for the Risk Calculator tab when an assessment is already in memory. */
export const RISK_CALCULATOR_RESUME_LABEL = 'Risk Calculator';

/** Stated under the tabs so the visitor knows the reference pages did not disappear. */
export const WORKSPACE_REFERENCE_NOTE =
  'Methodology, data handling and the disclaimer open from the bar below; they are not separate destinations.';

/** Copy for the Board Brief tab before a result exists. */
export const BOARD_BRIEF_EMPTY_TITLE = 'No result in this tab yet';

export const BOARD_BRIEF_EMPTY_BODY =
  'The Board Brief prints the result that is currently in this browser tab. Complete an assessment in the Risk Calculator and the same figure becomes a one-page memo, with the scope caveat and the model versions attached.';

/** Copy for the Board Brief tab header. */
export const BOARD_BRIEF_TITLE = 'Board Brief';

export const BOARD_BRIEF_LEDE =
  'The current result as a print-ready executive memo. This view holds no data of its own: it prints the result already in this tab, and discards it with the assessment.';

/** Copy for the Saved Packs tab header. */
export const SAVED_PACKS_TITLE = 'Saved Packs';

/**
 * Purpose line above the saved-work list. The retention rule and the archive and revoke
 * controls are stated by the list itself, so this line does not repeat them.
 */
export const SAVED_PACKS_LEDE =
  'Saved QuickRisk Live assessments and Decision Lab analyses. Nothing appears here until you explicitly save it.';
