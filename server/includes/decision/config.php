<?php

declare(strict_types=1);

/**
 * QuickRisk Decision Lab — configuration and shared vocabulary.
 *
 * Decision Lab is a treatment-analysis layer over the existing QuickRisk Monte Carlo model.
 * It never re-implements the model: it reads the engine's inputs, applies a documented
 * driver-level transformation and evaluates the resulting loss distribution.
 */

/** Version of the Decision Lab methodology (labels, rules, interaction defaults). */
const QK_DECISION_METHODOLOGY_VERSION = '1.0';

/** Version of the Board Risk Pack report structure. */
const QK_BOARD_PACK_VERSION = '1.0';

/** Model of treatment effect combination (paired, multiplicative driver effects). */
const QK_DECISION_EFFECT_MODEL = 'paired-driver-multiplicative';

/**
 * Evidence quality vocabulary. The label describes the provenance of the treatment
 * assumption. It never changes a number.
 */
const QK_DECISION_EVIDENCE_LEVELS = [
    'measured_internal' => [
        'label' => 'Measured internal evidence',
        'confidence' => 'high',
        'definition' => 'Effect estimated from measurement inside the organisation.',
    ],
    'validated_benchmark' => [
        'label' => 'Validated benchmark',
        'confidence' => 'high',
        'definition' => 'Effect taken from an independently validated benchmark study.',
    ],
    'industry' => [
        'label' => 'Industry evidence',
        'confidence' => 'medium',
        'definition' => 'Effect taken from published industry data that has not been independently validated for this organisation.',
    ],
    'vendor' => [
        'label' => 'Vendor evidence',
        'confidence' => 'medium',
        'definition' => 'Effect reported by a product or service supplier. Supplier claims are not independent evidence.',
    ],
    'expert_judgement' => [
        'label' => 'Expert judgement',
        'confidence' => 'low',
        'definition' => 'Effect estimated by practitioners without measurement.',
    ],
    'illustrative' => [
        'label' => 'Illustrative assumption',
        'confidence' => 'low',
        'definition' => 'Effect chosen to explore a scenario. It is not an evidence claim.',
    ],
];

/** Mechanism groups, used to avoid silently double-counting overlapping controls. */
const QK_DECISION_MECHANISM_GROUPS = [
    'identity' => 'Identity and access',
    'endpoint' => 'Endpoint',
    'network' => 'Network and perimeter',
    'email' => 'Email and user channel',
    'data-resilience' => 'Data resilience and recovery',
    'response' => 'Detection and response',
    'governance' => 'Governance and process',
];

/**
 * Defaults for the Decision Lab. All values are application parameters, documented in
 * docs/QUICKRISK_DECISION_LAB.md.
 */
const QK_DECISION_DEFAULTS = [
    // Iterations used for comparative analysis. Lower than the assessment default because a
    // comparison evaluates many portfolios from one simulated sample.
    'iterations' => 5000,
    'portfolioIterations' => 2000,
    'minimumIterations' => 1000,
    // Planning horizon used to annualise a one-time implementation cost.
    'planningHorizonYears' => 3,
    // A later treatment in the same mechanism group is assumed to deliver only this share of
    // its standalone effect (35% overlap). Documented, configurable per treatment.
    'sameGroupIndependentCoverage' => 0.65,
    // Maximum number of candidate treatments for exhaustive enumeration (2^10 portfolios).
    'maxCandidates' => 10,
    // Absolute portfolios enumerated in one request (hard safety limit).
    'maxPortfolios' => 4096,
    // A portfolio that is not within appetite is still labelled "high value" if it removes at
    // least this share of the baseline expected annual loss.
    'highValueReductionShare' => 0.15,
    // Break-even search: tolerance and iteration cap (bisection over model runs).
    'breakEvenTolerance' => 0.005,
    'breakEvenIterations' => 14,
    // Implementation delay is expressed in whole days.
    'maxImplementationDelayDays' => 1095,
];

/**
 * Risk-appetite criteria identifiers, in evaluation order.
 */
const QK_DECISION_APPETITE_CRITERIA = [
    'annualLoss' => 'Expected annual loss',
    'highEndLoss' => 'High-end modeled loss',
    'exceedanceProbability' => 'Probability of exceeding the annual loss limit',
];

/**
 * Deterministic recommendation labels (requirement 34).
 */
const QK_DECISION_LABELS = [
    'recommended' => 'Recommended',
    'viable' => 'Viable alternative',
    'high_value' => 'High value / above appetite',
    'dominated' => 'Dominated',
    'infeasible' => 'Infeasible',
];

/**
 * Returns the configuration, allowing deployment overrides without changing the code.
 *
 * @param array<string,mixed> $appConfig
 * @return array<string,mixed>
 */
function qk_decision_config(array $appConfig): array
{
    $override = $appConfig['decision'] ?? [];
    if (!is_array($override)) {
        $override = [];
    }

    return array_replace(QK_DECISION_DEFAULTS, $override);
}
