import { describe, expect, it } from 'vitest';
import {
  USER_RECORDED_EXPLANATION,
  USER_RECORDED_LABEL,
} from '@/live/content/liveIntegrity';

describe('QuickRisk Live user-recorded disclosure', () => {
  it('labels saved and shared values as user-recorded and not server-verified', () => {
    expect(USER_RECORDED_LABEL).toContain('USER-RECORDED');
    expect(USER_RECORDED_LABEL).toContain('Not independently verified by the server');
  });

  it('states the server validates but does not recalculate, and a link is not proof', () => {
    expect(USER_RECORDED_EXPLANATION).toContain('does not recalculate or independently verify');
    expect(USER_RECORDED_EXPLANATION).toContain('not proof that the server calculated it');
  });
});
