/**
 * Executive / Analyst view mode.
 *
 * Executive is the default: a few numbers and a plain-language sentence. Analyst
 * exposes distributions, driver factors, the simulation seed, methodology versions
 * and the Live telemetry internals. The mode is in-memory only, like everything else.
 */

import { create } from 'zustand';

export type ViewMode = 'executive' | 'analyst';

interface ViewModeState {
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  toggleMode: () => void;
}

export const useViewModeStore = create<ViewModeState>((set) => ({
  mode: 'executive',
  setMode: (mode) => set({ mode }),
  toggleMode: () => set((state) => ({ mode: state.mode === 'executive' ? 'analyst' : 'executive' })),
}));
