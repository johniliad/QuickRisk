/**
 * Landing-page journey content.
 *
 * Three questions have to be answered before a visitor spends ten minutes on the
 * questionnaire: what the three surfaces are, who each one serves, and what the output
 * looks like. The copy lives here as typed data so the components stay presentational
 * and the claims can be pinned by unit tests instead of existing only in markup.
 *
 * The question count is deliberately not repeated here: `JourneyMap` derives it from the
 * active model. The sample preview below is illustrative only and says so on screen.
 */

export type LandingStepKey = 'assess' | 'results' | 'explore';

export interface LandingStep {
  readonly key: LandingStepKey;
  readonly position: number;
  readonly title: string;
  readonly summary: string;
  readonly points: readonly string[];
  readonly availability: string;
}

export const LANDING_STEPS: readonly LandingStep[] = [
  {
    key: 'assess',
    position: 1,
    title: 'Assess',
    summary:
      'A short questionnaire about your organisation and five cyber-risk scenarios, one decision at a time.',
    points: [
      'No account and no sign-in',
      'Nothing is stored while you answer',
      'Unknown is always an option, and it widens the range instead of guessing',
    ],
    availability: 'Available now',
  },
  {
    key: 'results',
    position: 2,
    title: 'Results',
    summary:
      'An indicative annual exposure for each scenario, with charts, threshold probabilities and a printable report.',
    points: [
      'Indicative annual exposure per scenario, in euros',
      'Typical-year to bad-year range (P10 to P90)',
      'Probability of exceeding each financial threshold',
      'Input-quality indicator and scenario detail',
    ],
    availability: 'Available once the calculation completes',
  },
  {
    key: 'explore',
    position: 3,
    title: 'Explore',
    summary:
      'Two optional tools that start from your assessment. Neither one changes the QuickRisk result.',
    points: [
      'Both tools save only when you explicitly save, into a session that expires',
      'Neither tool changes the exposure calculated on the results page',
      'You can open either branch first: one is not a step towards the other',
    ],
    availability: 'Available once a result exists in this tab',
  },
];

export type LandingBranchKey = 'live' | 'decision-lab';

/** One of the two branches that leave Results, as stated on the landing page. */
export interface LandingBranch {
  readonly key: LandingBranchKey;
  readonly label: string;
  readonly title: string;
  readonly summary: string;
  readonly receives: string;
  readonly produces: string;
}

/**
 * The fork, in the same words used inside the product.
 *
 * The landing page used to list Live and Decision Lab as two bullets inside a third step,
 * which made the whole journey read as a sequence of three screens. They are siblings, so
 * they are modelled as two branches and drawn as a fork.
 */
export const LANDING_BRANCHES: readonly LandingBranch[] = [
  {
    key: 'live',
    label: 'Branch A',
    title: 'QuickRisk Live',
    summary: 'Overlay synthetic SOC evidence and simulated response actions on one scenario.',
    receives: "one scenario's indicative annual exposure",
    produces: 'that baseline multiplied by a browser-side SOC overlay',
  },
  {
    key: 'decision-lab',
    label: 'Branch B',
    title: 'Decision Lab',
    summary: 'Compare risk treatments against a stated appetite and produce a Board Risk Pack.',
    receives: 'the portfolio baseline from Results, plus your answers for the treated calculation',
    produces: 'baseline versus treated exposure for the treatments you choose',
  },
];

/** Shown under the landing fork, where neither branch has been opened yet. */
export const LANDING_FORK_NOTE =
  'Both branches start from Results and neither one feeds the other. Open either one; you can come back for the other later.';

export type LandingRoleKey = 'board' | 'ciso' | 'risk-manager';

export interface LandingRole {
  readonly key: LandingRoleKey;
  readonly title: string;
  readonly summary: string;
  readonly outputs: readonly string[];
  readonly producedBy: string;
}

export const LANDING_ROLES: readonly LandingRole[] = [
  {
    key: 'board',
    title: 'For the board',
    summary:
      'A printable Board Risk Pack that compares treatments against your stated risk appetite, ready for a board discussion.',
    outputs: [
      'Board Risk Pack (print or PDF)',
      'Treatment cost against risk reduction',
      'Read-only share link you can revoke',
    ],
    producedBy: 'Produced by Decision Lab',
  },
  {
    key: 'ciso',
    title: 'For the CISO',
    summary:
      'Quantified exposure across five scenarios, so security investment can be prioritised and discussed in financial terms.',
    outputs: [
      'Scenario-level exposure estimates',
      'Probability of exceeding board-level thresholds',
      'Executive summary and charts',
    ],
    producedBy: 'Produced by the results dashboard',
  },
  {
    key: 'risk-manager',
    title: 'For the risk manager',
    summary:
      'Scenario detail with sensitivity views showing which inputs move the estimate, plus treatment effectiveness modelling.',
    outputs: [
      'Input-sensitivity ranking',
      'Estimate-precision and input-quality reasons',
      'Break-even treatment effectiveness',
    ],
    producedBy: 'Produced by the results dashboard and Decision Lab',
  },
];

export interface SampleScenarioResult {
  readonly name: string;
  readonly expectedAnnualLoss: number;
  readonly p10: number;
  readonly p90: number;
}

export const SAMPLE_SCENARIO_RESULTS: readonly SampleScenarioResult[] = [
  { name: 'Phishing and social engineering', expectedAnnualLoss: 285_000, p10: 45_000, p90: 720_000 },
  { name: 'Vulnerability exploitation', expectedAnnualLoss: 420_000, p10: 80_000, p90: 1_100_000 },
  { name: 'Ransomware and extortion', expectedAnnualLoss: 650_000, p10: 150_000, p90: 1_800_000 },
  { name: 'Third-party compromise', expectedAnnualLoss: 195_000, p10: 30_000, p90: 520_000 },
  { name: 'Denial of service', expectedAnnualLoss: 125_000, p10: 20_000, p90: 340_000 },
];

export const SAMPLE_THRESHOLDS: readonly number[] = [100_000, 500_000, 1_000_000];

export interface SampleThresholdRow {
  readonly scenario: string;
  readonly probabilities: readonly number[];
}

export const SAMPLE_THRESHOLD_ROWS: readonly SampleThresholdRow[] = [
  { scenario: 'Phishing and social engineering', probabilities: [0.72, 0.38, 0.18] },
  { scenario: 'Vulnerability exploitation', probabilities: [0.85, 0.52, 0.28] },
  { scenario: 'Ransomware and extortion', probabilities: [0.92, 0.68, 0.42] },
  { scenario: 'Third-party compromise', probabilities: [0.58, 0.28, 0.12] },
  { scenario: 'Denial of service', probabilities: [0.45, 0.18, 0.08] },
];

export const SAMPLE_PREVIEW_DISCLOSURE =
  'These numbers are illustrative only. Your results are produced by the server-side simulation from your own answers and will differ.';

/* ---------------------------------------------------------------------------------------
 * The entry section.
 *
 * The landing page used to open with the disclaimer and the retention prose, then offered a
 * single "Start the assessment" button. A visitor had to read several hundred words and
 * commit to eighteen questions before seeing any number. The three actions below are the
 * three ways in, ordered by cost, so the cheapest way to see the product is the first thing
 * on the page.
 * ------------------------------------------------------------------------------------- */

/** Headline of the redesigned hero. */
export const LANDING_HERO_HEADLINE = 'Quantify annual cyber-loss exposure';

/** One line under the headline, stating what the visitor actually does. */
export const LANDING_HERO_LEAD =
  'Answer a short questionnaire, get an indicative annual exposure estimate for five scenarios, then explore what makes the number worse or better.';

export type LandingEntryKey = 'sample' | 'quick' | 'full';

export interface LandingEntryAction {
  readonly key: LandingEntryKey;
  /** Short label above the title. */
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly timeEstimate: string;
  /** Label on the control that starts this path. */
  readonly ctaLabel: string;
  /** True for the default demo path, which carries the visual emphasis. */
  readonly primary: boolean;
}

export const LANDING_ENTRY_ACTIONS: readonly LandingEntryAction[] = [
  {
    key: 'sample',
    eyebrow: 'See it first',
    title: 'Load 60-Second Sample',
    description:
      'Loads a clearly labelled sample organisation — the middle answer for every question — so you can see the dashboard without answering anything. The sample is real model output, calculated on the server from those sample answers.',
    timeEstimate: 'about 1 minute',
    ctaLabel: 'Load the 60-second sample',
    primary: true,
  },
  {
    key: 'quick',
    eyebrow: 'Fast practitioner path',
    title: 'Quick 1-Scenario Check',
    description:
      'Answers the organisation profile and one scenario of your choice. The four scenarios you skip are submitted as Unknown, which widens their range instead of inventing a value.',
    timeEstimate: 'about 3 minutes',
    ctaLabel: 'Start the quick check',
    primary: false,
  },
  {
    key: 'full',
    eyebrow: 'Comprehensive path',
    title: 'Full 5-Scenario Assessment',
    description:
      'The complete guided assessment: organisation profile, then likelihood and impact for all five scenarios, with Unknown available at every step.',
    timeEstimate: '10–15 minutes',
    ctaLabel: 'Start the assessment',
    primary: false,
  },
];

/** Sentence under the three entry actions, naming what all three share. */
export const LANDING_ENTRY_NOTE =
  'All three paths run the same server-side model and the same five scenarios. Nothing is stored in any of them, and nothing is saved unless you explicitly save later in Live or Decision Lab.';

/** Label of the scenario picker inside the quick-check card. */
export const LANDING_QUICK_PICKER_LABEL = 'Scenario for the quick check';

/** Help under that picker. */
export const LANDING_QUICK_PICKER_HELP =
  'Only this scenario is asked. The other four are submitted as Unknown, so their ranges widen and the estimate precision drops rather than a favourable value being assumed.';