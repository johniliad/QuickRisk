/**
 * Suite attribution shown in the footer.
 *
 * QuickRisk is one stage of a six-stage cyber-intelligence suite. The strip is deliberately
 * understated: it names the stage QuickRisk occupies so a reader who meets the tool through
 * a report can tell which other products a result belongs with, without turning the
 * workspace footer into marketing.
 *
 * The stage list is data so the "current tool" marker cannot drift from the rendering.
 */

export const ILIADIS_SUITE_TITLE = 'ILIADIS Cyber Intelligence Suite';

export const ILIADIS_SUITE_NOTE =
  'QuickRisk is stage 3 — the quantify step. The stages either side are named for context only; no data passes between them and this tool does not link to them.';

export interface SuiteStage {
  readonly order: number;
  readonly name: string;
  readonly verb: string;
  /** True for the stage this application is. */
  readonly current: boolean;
}

export const ILIADIS_SUITE_STAGES: readonly SuiteStage[] = [
  { order: 1, name: 'ThreatPulse', verb: 'Detect', current: false },
  { order: 2, name: 'CyberPulse', verb: 'Assess', current: false },
  { order: 3, name: 'QuickRisk', verb: 'Quantify', current: true },
  { order: 4, name: 'EU Cyber Incident', verb: 'Respond', current: false },
  { order: 5, name: 'BRIG', verb: 'Report', current: false },
  { order: 6, name: 'BoardSim', verb: 'Decide', current: false },
];
