/**
 * QuickRisk Live — saved-result integrity wording.
 *
 * Option C of the P2.3 gate: Live remains a client-side engine. Saved and shared values are
 * user-recorded simulation data, not server-verified calculations. Keep this wording in one place
 * so every surface states the same limitation.
 */

export const USER_RECORDED_LABEL =
  'USER-RECORDED SIMULATION DATA — Not independently verified by the server';

export const USER_RECORDED_EXPLANATION =
  'Saved and shared QuickRisk Live values are calculated by the browser and recorded as user-supplied simulation data. The server validates structure, ranges, ownership and the methodology version, but does not recalculate or independently verify the risk result. A share link is a read-only record, not proof that the server calculated it.';
