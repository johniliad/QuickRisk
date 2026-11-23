import { describe, expect, it } from 'vitest';
import {
  BOARD_BRIEF_EMPTY_BODY,
  BOARD_BRIEF_LEDE,
  BOARD_BRIEF_TITLE,
  SAVED_PACKS_LEDE,
  SAVED_PACKS_TITLE,
  WORKSPACE_TABS,
  WORKSPACE_REFERENCE_NOTE,
  workspaceTabForView,
} from '@/content/workspaceNav';
import type { View } from '@/domain/assessment';

/**
 * The header used to list eight equal destinations, which made the mandatory disclaimer
 * look like a destination and left the main workspace unidentified. These assertions pin
 * the three tabs and the rule that decides which one is active.
 */
describe('workspace tabs', () => {
  it('exposes exactly three primary tabs', () => {
    expect(WORKSPACE_TABS.map((tab) => tab.key)).toEqual([
      'risk-calculator',
      'board-brief',
      'saved-packs',
    ]);
    expect(WORKSPACE_TABS.map((tab) => tab.label)).toEqual([
      'Risk Calculator',
      'Board Brief',
      'Saved Packs',
    ]);
  });

  it('describes what each tab is for', () => {
    for (const tab of WORKSPACE_TABS) {
      expect(tab.description.length).toBeGreaterThan(20);
    }
    expect(WORKSPACE_REFERENCE_NOTE).toContain('not separate destinations');
  });

  it('keeps every work view inside the Risk Calculator tab', () => {
    const calculatorViews: readonly View[] = [
      'landing',
      'disclaimer',
      'questionnaire',
      'calculating',
      'results',
      'scenario-detail',
      'methodology',
      'live',
      'live-executive',
      'live-methodology',
      'decision-lab',
    ];

    for (const view of calculatorViews) {
      expect(workspaceTabForView(view)).toBe('risk-calculator');
    }
  });

  it('puts the printable report in Board Brief', () => {
    expect(workspaceTabForView('board-brief')).toBe('board-brief');
    expect(workspaceTabForView('report')).toBe('board-brief');
  });

  it('puts saved work in Saved Packs', () => {
    expect(workspaceTabForView('saved-packs')).toBe('saved-packs');
    expect(workspaceTabForView('history')).toBe('saved-packs');
    expect(workspaceTabForView('live-history')).toBe('saved-packs');
    expect(workspaceTabForView('decision-history')).toBe('saved-packs');
  });

  it('states that Board Brief holds no data of its own', () => {
    expect(BOARD_BRIEF_TITLE).toBe('Board Brief');
    expect(BOARD_BRIEF_LEDE).toContain('no data of its own');
    expect(BOARD_BRIEF_EMPTY_BODY).toContain('Complete an assessment');
  });

  it('states that nothing is saved until the visitor saves', () => {
    expect(SAVED_PACKS_TITLE).toBe('Saved Packs');
    expect(SAVED_PACKS_LEDE).toContain('Saved QuickRisk Live assessments and Decision Lab analyses');
    expect(SAVED_PACKS_LEDE).toContain('Nothing appears here until you explicitly save');
  });
});
