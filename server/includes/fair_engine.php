<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — simplified FAIR-informed risk engine.
 *
 * Conceptual chain implemented per Monte Carlo iteration:
 *
 *   TEF (threat event frequency)  x  Susceptibility  =  LEF (loss event frequency)
 *   Primary Loss  +  Secondary Loss (Bernoulli draw)  =  Loss Magnitude
 *   Annual Loss Exposure  =  LEF  x  Loss Magnitude
 *
 * Both frequency and susceptibility are sampled per iteration, so uncertainty in
 * event frequency and in event success is preserved. The engine is independent of
 * HTML generation and of the HTTP layer, holds everything in memory and never
 * writes assessment data anywhere.
 */
final class FairEngine
{
    /**
     * Builds every distribution used by one scenario.
     *
     * This is the single place where the model's inputs are assembled, so the Monte Carlo
     * path, the analytic expectation and the sensitivity analysis cannot diverge.
     *
     * Each returned range is either:
     *   ['kind' => 'triangular', 'min' => .., 'mode' => .., 'max' => .., 'components' => []]
     * or, for an Unknown answer:
     *   ['kind' => 'mixture', 'min' => .., 'mode' => .., 'max' => .., 'components' => [
     *        ['optionCode' => .., 'weight' => .., 'min' => .., 'mode' => .., 'max' => ..], ...
     *   ]]
     * where 'mode' of a mixture is the weighted average of the component modes, a
     * representative central value rather than a true mode.
     *
     * @param array<string,string> $profileAnswers
     * @return array<string,mixed>
     */
    private static function buildScenarioInputs(
        QkModel $model,
        string $code,
        array $profileAnswers,
        string $likelihoodOption,
        string $impactOption
    ): array {
        $parameters = $model->parameters();
        $unknown = $model->unknownCode();
        $scaling = (array) $parameters['scenarioScaling']['scenarios'][$code];
        $clamps = (array) $parameters['sampling']['clamps'];
        $modifiers = (array) $parameters['modifiers'];
        // Widening may not inflate a central estimate beyond the documented bound.
        $cap = (float) ($parameters['sampling']['wideningMeanShiftCap'] ?? 1.0);

        $frequencyUnknown = $likelihoodOption === $unknown;
        $impactUnknown = $impactOption === $unknown;

        // 1. Threat event frequency. The likelihood answer is interpreted as threat event
        //    frequency (attempts or contact), so control effectiveness is applied once, as
        //    susceptibility, and never inside this answer.
        $frequencyModifiers = QkModifiers::apply(
            $modifiers,
            $profileAnswers,
            $code,
            QkModifiers::TARGET_FREQUENCY,
            $unknown
        );
        $tefRange = $frequencyUnknown
            ? self::buildUnknownMixture(
                (array) $parameters['frequency'],
                (float) $scaling['frequencyScale'],
                $frequencyModifiers['multiplier'],
                $frequencyModifiers['widen'],
                $clamps['threatEventFrequency'],
                $cap
            )
            : self::triangularInput(
                self::applyRange(
                    self::scaleRange(
                        (array) $parameters['frequency']['bands'][$likelihoodOption],
                        (float) $scaling['frequencyScale']
                    ),
                    $frequencyModifiers['multiplier'],
                    $frequencyModifiers['widen'],
                    $clamps['threatEventFrequency'],
                    $cap
                )
            );

        // 2. Susceptibility: the single place where control effectiveness enters the model.
        $susceptibilityModifiers = QkModifiers::apply(
            $modifiers,
            $profileAnswers,
            $code,
            QkModifiers::TARGET_SUSCEPTIBILITY,
            $unknown
        );
        $susceptibilityRange = self::triangularInput(
            self::applyRange(
                (array) $scaling['susceptibility'],
                $susceptibilityModifiers['multiplier'],
                $susceptibilityModifiers['widen'],
                $clamps['susceptibility'],
                    $cap
            )
        );

        // 3. Loss-magnitude anchor (daily disruption cost) and its modifiers.
        $anchorQuestionCode = (string) ($parameters['disruptionCostAnchor']['questionCode'] ?? 'QP8');
        $anchorAnswer = $profileAnswers[$anchorQuestionCode] ?? $unknown;
        $anchorFromFallback = !isset($parameters['disruptionCostAnchor']['bands'][$anchorAnswer]);
        $anchorModifiers = [];
        if ($anchorFromFallback) {
            $fallbackModifiers = QkModifiers::apply(
                $modifiers,
                $profileAnswers,
                $code,
                QkModifiers::TARGET_ANCHOR_FALLBACK,
                $unknown
            );
            $anchorRange = self::triangularInput(
                self::applyRange(
                    (array) $parameters['disruptionCostAnchor']['fallback'],
                    $fallbackModifiers['multiplier'],
                    $fallbackModifiers['widen'],
                    $clamps['lossMagnitude'],
                    $cap
                )
            );
            $anchorModifiers = array_merge($anchorModifiers, $fallbackModifiers['applied']);
        } else {
            $anchorRange = self::triangularInput((array) $parameters['disruptionCostAnchor']['bands'][$anchorAnswer]);
        }

        $lossMagnitudeModifiers = QkModifiers::apply(
            $modifiers,
            $profileAnswers,
            $code,
            QkModifiers::TARGET_PRIMARY_LOSS,
            $unknown
        );
        $anchorRange = self::triangularInput(
            self::applyRange(
                $anchorRange,
                $lossMagnitudeModifiers['multiplier'],
                $lossMagnitudeModifiers['widen'],
                $clamps['lossMagnitude'],
                    $cap
            )
        );
        $anchorModifiers = array_merge($anchorModifiers, $lossMagnitudeModifiers['applied']);

        // 4. Impact multiplier. An Unknown answer is an equal-weight mixture over the
        //    available impact answers, so it widens without assuming an adverse extreme.
        $impactRange = $impactUnknown
            ? self::buildUnknownMixture(
                (array) $parameters['impactMultiplier'],
                (float) $scaling['impactScale'],
                1.0,
                1.0,
                $clamps['impactMultiplier'],
                $cap
            )
            : self::triangularInput(
                self::applyRange(
                    self::scaleRange(
                        (array) $parameters['impactMultiplier']['bands'][$impactOption],
                        (float) $scaling['impactScale']
                    ),
                    1.0,
                    1.0,
                    $clamps['impactMultiplier'],
                    $cap
                )
            );

        // 5. Secondary-loss probability, widened by unknown scenario/control answers.
        $secondaryWiden = 1.0;
        if ($impactUnknown) {
            $secondaryWiden *= (float) ($parameters['secondaryLoss']['probabilityWideningWhenImpactUnknown'] ?? 1.0);
        }
        if (($profileAnswers['QP7'] ?? $unknown) === $unknown) {
            $secondaryWiden *= (float) ($parameters['secondaryLoss']['probabilityWideningWhenControlMaturityUnknown'] ?? 1.0);
        }
        $secondaryProbabilityModifiers = QkModifiers::apply(
            $modifiers,
            $profileAnswers,
            $code,
            QkModifiers::TARGET_SECONDARY_PROBABILITY,
            $unknown
        );
        $secondaryProbabilityRange = self::triangularInput(
            self::applyRange(
                (array) $scaling['secondaryLossProbability'],
                $secondaryProbabilityModifiers['multiplier'],
                $secondaryProbabilityModifiers['widen'] * $secondaryWiden,
                $clamps['secondaryLossProbability'],
                    $cap
            )
        );

        $secondaryMultiplierRange = self::triangularInput(
            self::applyRange(
                (array) $scaling['secondaryLossMultiplier'],
                1.0,
                1.0,
                $clamps['impactMultiplier'],
                    $cap
            )
        );

        $primaryLossRange = self::triangularInput(
            QkModifiers::multiplyRanges($anchorRange, $impactRange, $clamps['lossMagnitude'])
        );
        $secondaryLossRange = self::triangularInput(
            QkModifiers::multiplyRanges($anchorRange, $secondaryMultiplierRange, $clamps['lossMagnitude'])
        );

        return [
            'ranges' => [
                'threatEventFrequency' => $tefRange,
                'susceptibility' => $susceptibilityRange,
                'lossMagnitudeAnchor' => $anchorRange,
                'impactMultiplier' => $impactRange,
                'primaryLossMagnitude' => $primaryLossRange,
                'secondaryLossProbability' => $secondaryProbabilityRange,
                'secondaryLossMagnitude' => $secondaryLossRange,
                'secondaryLossMultiplier' => $secondaryMultiplierRange,
            ],
            'appliedModifiers' => array_merge(
                $frequencyModifiers['applied'],
                $susceptibilityModifiers['applied'],
                $anchorModifiers,
                $secondaryProbabilityModifiers['applied']
            ),
            'anchorFromFallback' => $anchorFromFallback,
            'frequencyUnknown' => $frequencyUnknown,
            'impactUnknown' => $impactUnknown,
        ];
    }

    private static function applyRange(
        array $range,
        float $multiplier,
        float $widen,
        array $clamp,
        float $meanShiftCap
    ): array {
        return QkModifiers::applyRange($range, $multiplier, $widen, $clamp, $meanShiftCap);
    }

    /**
     * Wraps a (min, mode, max) range as a triangular input.
     *
     * @param array<string,mixed> $range
     * @return array<string,mixed>
     */
    private static function triangularInput(array $range): array
    {
        [$min, $mode, $max] = QkDistributions::normaliseRange(
            (float) $range['min'],
            (float) $range['mode'],
            (float) $range['max']
        );

        return ['kind' => 'triangular', 'min' => $min, 'mode' => $mode, 'max' => $max, 'components' => []];
    }

    /**
     * Builds the equal-weight mixture used for an Unknown answer.
     *
     * The mixture keeps the central estimate inside the range of the answers the user could
     * have chosen, so an Unknown answer widens the distribution without being treated as
     * either a favourable answer or an adverse extreme.
     *
     * @param array<string,mixed> $group Frequency or impact parameter group
     * @param array{min:float,max:float} $clamp
     * @return array<string,mixed>
     */
    private static function buildUnknownMixture(
        array $group,
        float $scale,
        float $multiplier,
        float $widen,
        array $clamp,
        float $meanShiftCap
    ): array {
        $policy = (array) ($group['unknownPolicy'] ?? []);
        $weights = (array) ($policy['weights'] ?? []);
        $bands = (array) ($group['bands'] ?? []);

        $components = [];
        $minimum = INF;
        $maximum = -INF;
        $modeTotal = 0.0;
        $weightTotal = 0.0;

        foreach ($weights as $optionCode => $weight) {
            if (!isset($bands[$optionCode])) {
                continue;
            }
            $componentWeight = (float) $weight;
            if ($componentWeight <= 0.0) {
                continue;
            }

            $adjusted = self::applyRange(
                self::scaleRange((array) $bands[$optionCode], $scale),
                $multiplier,
                $widen,
                $clamp,
                $meanShiftCap
            );

            $components[] = [
                'optionCode' => (string) $optionCode,
                'weight' => $componentWeight,
                'min' => $adjusted['min'],
                'mode' => $adjusted['mode'],
                'max' => $adjusted['max'],
            ];

            $minimum = min($minimum, $adjusted['min']);
            $maximum = max($maximum, $adjusted['max']);
            $modeTotal += $componentWeight * $adjusted['mode'];
            $weightTotal += $componentWeight;
        }

        if ($components === []) {
            // A model without usable mixture weights is rejected by the model loader, so this
            // can only be reached by a corrupt model; fall back to a degenerate range.
            return self::triangularInput(['min' => 0.0, 'mode' => 0.0, 'max' => 0.0]);
        }

        return [
            'kind' => 'mixture',
            'min' => $minimum,
            'mode' => $weightTotal > 0.0 ? $modeTotal / $weightTotal : $minimum,
            'max' => $maximum,
            'components' => $components,
        ];
    }

    /**
     * Samples one complete Monte Carlo iteration for a scenario.
     *
     * This is the single place where one simulated year is produced. Both the assessment
     * path (`calculateScenario`) and the Decision Lab path (`lossVectors`) call it, so the
     * treatment analysis can never drift from the model it is analysing.
     *
     * The draw order is fixed: TEF, susceptibility, anchor, impact multiplier, secondary
     * probability, Bernoulli, and — only when the secondary event occurs — the secondary
     * multiplier.
     *
     * @param array<string,mixed> $ranges
     * @return array<string,float|bool>
     */
    private static function simulateIteration(QkDistributions $rng, array $ranges): array
    {
        $tef = self::sampleInput($rng, $ranges['threatEventFrequency']);
        $susceptibility = self::sampleInput($rng, $ranges['susceptibility']);
        $lossEventFrequency = $tef * $susceptibility;

        $anchor = self::sampleInput($rng, $ranges['lossMagnitudeAnchor']);
        $impactMultiplier = self::sampleInput($rng, $ranges['impactMultiplier']);
        $primaryLoss = $anchor * $impactMultiplier;

        $secondaryLoss = 0.0;
        $secondaryProbability = self::sampleInput($rng, $ranges['secondaryLossProbability']);
        if ($rng->sampleBernoulli($secondaryProbability)) {
            $secondaryLoss = $anchor * self::sampleInput($rng, $ranges['secondaryLossMultiplier']);
        }

        $lossMagnitude = $primaryLoss + $secondaryLoss;

        return [
            'threatEventFrequency' => $tef,
            'susceptibility' => $susceptibility,
            'lossEventFrequency' => $lossEventFrequency,
            'lossMagnitudeAnchor' => $anchor,
            'impactMultiplier' => $impactMultiplier,
            'primaryLoss' => $primaryLoss,
            'secondaryLoss' => $secondaryLoss,
            'lossMagnitude' => $lossMagnitude,
            'annualLoss' => $lossEventFrequency * $lossMagnitude,
            'secondaryOccurred' => $secondaryLoss > 0.0,
        ];
    }

    /**
     * Builds the scenario inputs for one scenario.
     *
     * Exposed so that the Decision Lab treatment adapter reads exactly the inputs the model
     * samples, instead of recreating them.
     *
     * @param array<string,string> $profileAnswers
     * @return array<string,mixed>
     */
    public static function scenarioInputs(
        QkModel $model,
        string $scenarioCode,
        array $profileAnswers,
        string $likelihoodOption,
        string $impactOption
    ): array {
        return self::buildScenarioInputs($model, $scenarioCode, $profileAnswers, $likelihoodOption, $impactOption);
    }

    /**
     * Analytic mean of one built input (triangular or equal-weight mixture).
     *
     * @param array<string,mixed> $input
     */
    public static function inputExpectation(array $input): float
    {
        return self::inputMean($input);
    }

    /**
     * Clamps a requested iteration count to the model's documented limits.
     */
    public static function resolveIterations(QkModel $model, int $iterations): int
    {
        $minimum = (int) ($model->parameters()['engineLimits']['minimumIterations'] ?? 1000);
        $maximum = min(
            $model->maximumIterations(),
            (int) ($model->parameters()['engineLimits']['maximumIterations'] ?? 50000)
        );

        return max($minimum, min($maximum, $iterations));
    }

    /**
     * Per-iteration annual-loss vectors for every scenario, without summary statistics.
     *
     * Decision Lab uses these vectors to evaluate treatments and portfolios as exact linear
     * transformations of the same simulated years (common random numbers by construction):
     * a frequency/magnitude driver effect scales the annual loss of every iteration by the
     * same factor, so no second simulation and no second engine is needed.
     *
     * The vectors are held in server memory for one request and are never persisted or sent
     * to the browser.
     *
     * @param array<string,mixed> $payload profileAnswers + scenarioAnswers
     * @return array<string,mixed>
     */
    public static function lossVectors(QkModel $model, array $payload, int $seed, int $iterations): array
    {
        $iterations = self::resolveIterations($model, $iterations);
        $profileAnswers = (array) ($payload['profileAnswers'] ?? []);
        $scenarioAnswers = (array) ($payload['scenarioAnswers'] ?? []);
        $parameters = $model->parameters();
        $clamps = (array) ($parameters['sampling']['clamps'] ?? []);

        $scenarios = [];
        $index = 0;
        foreach ($model->scenarioOrder() as $code) {
            $index++;
            $scenario = $model->scenario($code);
            $answers = (array) ($scenarioAnswers[$code] ?? []);
            $scenarioSeed = ($seed + ($index * 104729)) % 2147483647;

            $inputs = self::buildScenarioInputs(
                $model,
                $code,
                $profileAnswers,
                (string) ($answers[(string) $scenario['likelihoodQuestion']['code']] ?? $model->unknownCode()),
                (string) ($answers[(string) $scenario['impactQuestion']['code']] ?? $model->unknownCode())
            );
            $ranges = $inputs['ranges'];

            $rng = new QkDistributions($scenarioSeed);
            $losses = [];
            for ($iteration = 0; $iteration < $iterations; $iteration++) {
                $losses[] = (float) self::simulateIteration($rng, $ranges)['annualLoss'];
            }

            $scenarios[] = [
                'code' => $code,
                'name' => (string) $scenario['name'],
                'shortLabel' => (string) $scenario['shortLabel'],
                'losses' => $losses,
                'inputExpectations' => [
                    'threatEventFrequency' => self::inputMean($ranges['threatEventFrequency']),
                    'susceptibility' => self::inputMean($ranges['susceptibility']),
                    'lossMagnitudeAnchor' => self::inputMean($ranges['lossMagnitudeAnchor']),
                ],
                'clamps' => [
                    'susceptibility' => (array) ($clamps['susceptibility'] ?? ['min' => 0.0, 'max' => 1.0]),
                    'lossMagnitude' => (array) ($clamps['lossMagnitude'] ?? ['min' => 0.0, 'max' => 1.0e12]),
                ],
                'ranges' => $ranges,
            ];
        }

        return [
            'scenarios' => $scenarios,
            'meta' => [
                'seed' => $seed,
                'iterations' => $iterations,
                'scenarioOrder' => $model->scenarioOrder(),
                'thresholds' => $model->lossThresholds(),
            ],
        ];
    }

    /**
     * Samples one input, handling both triangular and mixture inputs.
     *
     * @param array<string,mixed> $input
     */
    private static function sampleInput(QkDistributions $rng, array $input): float
    {
        if (($input['kind'] ?? 'triangular') !== 'mixture') {
            return $rng->sampleTriangular(
                (float) $input['min'],
                (float) $input['mode'],
                (float) $input['max']
            );
        }

        $components = array_values((array) ($input['components'] ?? []));
        if ($components === []) {
            return (float) $input['mode'];
        }

        $draw = $rng->uniform();
        $cumulative = 0.0;
        foreach ($components as $component) {
            $cumulative += (float) $component['weight'];
            if ($draw < $cumulative) {
                return $rng->sampleTriangular(
                    (float) $component['min'],
                    (float) $component['mode'],
                    (float) $component['max']
                );
            }
        }

        $last = $components[count($components) - 1];

        return $rng->sampleTriangular(
            (float) $last['min'],
            (float) $last['mode'],
            (float) $last['max']
        );
    }

    /**
     * Analytic mean of a triangular or mixture input.
     *
     * @param array<string,mixed> $input
     */
    private static function inputMean(array $input): float
    {
        if (($input['kind'] ?? 'triangular') !== 'mixture') {
            return QkDistributions::triangularMean(
                (float) $input['min'],
                (float) $input['mode'],
                (float) $input['max']
            );
        }

        $total = 0.0;
        $weightTotal = 0.0;
        foreach ((array) ($input['components'] ?? []) as $component) {
            $weight = (float) $component['weight'];
            $total += $weight * QkDistributions::triangularMean(
                (float) $component['min'],
                (float) $component['mode'],
                (float) $component['max']
            );
            $weightTotal += $weight;
        }

        return $weightTotal > 0.0 ? $total / $weightTotal : 0.0;
    }

    /**
     * Calculates one scenario by Monte Carlo simulation.
     *
     * Inputs are built by buildScenarioInputs(); this method samples them, calculates the
     * annualised exposure approximation for each trial and summarises the result.
     *
     * @param array<string,mixed> $input
     * @return array<string,mixed>
     */
    public static function calculateScenario(
        QkModel $model,
        array $input,
        int $seed,
        int $iterations
    ): array {
        $parameters = $model->parameters();
        $code = (string) $input['scenarioCode'];
        $scenario = $model->scenario($code);
        $unknown = $model->unknownCode();
        $profileAnswers = (array) $input['profileAnswers'];

        $likelihoodOption = (string) $input['likelihoodOption'];
        $impactOption = (string) $input['impactOption'];
        $frequencyUnknown = $likelihoodOption === $unknown;
        $impactUnknown = $impactOption === $unknown;

        // Inputs are built once, in a single place, so that the Monte Carlo path and the
        // analytic sensitivity path can never diverge.
        $inputs = self::buildScenarioInputs($model, $code, $profileAnswers, $likelihoodOption, $impactOption);
        $ranges = $inputs['ranges'];
        $appliedModifiers = $inputs['appliedModifiers'];
        $anchorFromFallback = $inputs['anchorFromFallback'];
        $tefRange = $ranges['threatEventFrequency'];
        $susceptibilityRange = $ranges['susceptibility'];
        $anchorRange = $ranges['lossMagnitudeAnchor'];
        $impactRange = $ranges['impactMultiplier'];
        $secondaryProbabilityRange = $ranges['secondaryLossProbability'];
        $secondaryMultiplierRange = $ranges['secondaryLossMultiplier'];

        // 6. Monte Carlo simulation, entirely in server memory.
        $rng = new QkDistributions($seed);
        $annualLoss = [];
        $tefValues = [];
        $susceptibilityValues = [];
        $lefValues = [];
        $primaryLossValues = [];
        $secondaryLossValues = [];
        $lossMagnitudeValues = [];
        $secondaryOccurrences = 0;

        for ($iteration = 0; $iteration < $iterations; $iteration++) {
            $draw = self::simulateIteration($rng, $ranges);
            $tef = (float) $draw['threatEventFrequency'];
            $susceptibility = (float) $draw['susceptibility'];

            $tefValues[] = $tef;
            $susceptibilityValues[] = $susceptibility;
            $lefValues[] = (float) $draw['lossEventFrequency'];
            $primaryLossValues[] = (float) $draw['primaryLoss'];
            $secondaryLossValues[] = (float) $draw['secondaryLoss'];
            $lossMagnitudeValues[] = (float) $draw['lossMagnitude'];
            $annualLoss[] = (float) $draw['annualLoss'];
            if ($draw['secondaryOccurred'] === true) {
                $secondaryOccurrences++;
            }
        }

        // 7. Summary statistics.
        $sorted = QkPercentile::sorted($annualLoss);
        $thresholds = $model->lossThresholds();
        $probabilities = [];
        $exceedanceCounts = [];
        foreach ($thresholds as $threshold) {
            $key = (string) (int) $threshold;
            $probability = QkPercentile::probabilityGreaterThan($sorted, $threshold);
            $probabilities[$key] = $probability;
            // Reported as an explicit count so that a zero can be read as "no trial exceeded
            // this threshold in this run" rather than as an impossibility.
            $exceedanceCounts[$key] = (int) round($probability * $iterations);
        }

        $expectedAnnualLoss = QkPercentile::mean($annualLoss);
        $coefficientOfVariation = QkPercentile::coefficientOfVariation($annualLoss);
        $expectedPrimaryLoss = QkPercentile::mean($primaryLossValues);
        $expectedSecondaryLoss = QkPercentile::mean($secondaryLossValues);
        $expectedLossMagnitude = QkPercentile::mean($lossMagnitudeValues);
        $secondaryLossShare = $expectedLossMagnitude > 0.0 ? $expectedSecondaryLoss / $expectedLossMagnitude : 0.0;

        $statistics = [
            'minimum' => $sorted === [] ? 0.0 : (float) $sorted[0],
            'p10' => QkPercentile::percentile($sorted, 0.10),
            'p25' => QkPercentile::percentile($sorted, 0.25),
            'p50' => QkPercentile::percentile($sorted, 0.50),
            'p75' => QkPercentile::percentile($sorted, 0.75),
            'p90' => QkPercentile::percentile($sorted, 0.90),
            'maximum' => $sorted === [] ? 0.0 : (float) $sorted[count($sorted) - 1],
            'expectedAnnualLoss' => $expectedAnnualLoss,
            'standardDeviation' => QkPercentile::standardDeviation($annualLoss),
            'coefficientOfVariation' => $coefficientOfVariation,
            'expectedThreatEventFrequency' => QkPercentile::mean($tefValues),
            'meanSusceptibility' => QkPercentile::mean($susceptibilityValues),
            'expectedLossEventFrequency' => QkPercentile::mean($lefValues),
            'expectedLossMagnitude' => $expectedLossMagnitude,
            'expectedPrimaryLossMagnitude' => $expectedPrimaryLoss,
            'expectedSecondaryLossMagnitude' => $expectedSecondaryLoss,
            'secondaryLossShare' => $secondaryLossShare,
            'secondaryLossOccurrenceRate' => $iterations > 0 ? $secondaryOccurrences / $iterations : 0.0,
            'iterations' => $iterations,
            'thresholdProbabilities' => $probabilities,
            'thresholdExceedanceCounts' => $exceedanceCounts,
        ];

        // 8. Loss distribution for charting. The final bin is an overflow bin.
        $histogramBins = (int) ($parameters['engineLimits']['histogramBins'] ?? 40);
        $histogramUpper = QkPercentile::percentile($sorted, (float) ($parameters['engineLimits']['histogramUpperPercentile'] ?? 0.99));
        $distribution = QkPercentile::histogram($annualLoss, $histogramUpper, $histogramBins);

        // 9. Confidence.
        $profileUnknownCount = 0;
        foreach ($profileAnswers as $answer) {
            if ($answer === $unknown) {
                $profileUnknownCount++;
            }
        }
        $confidence = QkConfidence::scenario(
            [
                'frequencyUnknown' => $frequencyUnknown,
                'impactUnknown' => $impactUnknown,
                'profileUnknownCount' => $profileUnknownCount,
                'disruptionCostUnknown' => $anchorFromFallback,
                'coefficientOfVariation' => $coefficientOfVariation,
                'releaseStatus' => (string) ($model->manifest()['releaseStatus'] ?? ''),
            ],
            $parameters
        );

        // 10. Presentation of the answers, drivers and plain-language interpretation.
        $answers = [
            self::answerEntry($model, (array) $scenario['likelihoodQuestion'], $likelihoodOption),
            self::answerEntry($model, (array) $scenario['impactQuestion'], $impactOption),
        ];

        $drivers = [
            [
                'code' => 'threatEventFrequency',
                'label' => 'Expected threat events per year',
                'value' => $statistics['expectedThreatEventFrequency'],
                'unit' => 'events/year',
                'detail' => 'How often threat activity is modelled to reach your environment.',
            ],
            [
                'code' => 'susceptibility',
                'label' => 'Susceptibility',
                'value' => $statistics['meanSusceptibility'],
                'unit' => 'probability',
                'detail' => 'Modelled probability that a threat event becomes a loss event.',
            ],
            [
                'code' => 'lossEventFrequency',
                'label' => 'Expected loss events per year',
                'value' => $statistics['expectedLossEventFrequency'],
                'unit' => 'events/year',
                'detail' => 'Threat event frequency multiplied by susceptibility.',
            ],
            [
                'code' => 'primaryLossMagnitude',
                'label' => 'Expected primary loss per event',
                'value' => $statistics['expectedPrimaryLossMagnitude'],
                'unit' => 'currency',
                'detail' => 'Direct response and recovery cost of one event.',
            ],
            [
                'code' => 'secondaryLossProbability',
                'label' => 'Secondary-loss occurrence rate',
                'value' => $statistics['secondaryLossOccurrenceRate'],
                'unit' => 'probability',
                'detail' => 'Share of simulated trials in which a consequential loss was drawn.',
            ],
            [
                'code' => 'secondaryLossMagnitude',
                'label' => 'Expected secondary loss per event',
                'value' => $statistics['expectedSecondaryLossMagnitude'],
                'unit' => 'currency',
                'detail' => 'Consequential loss when it materialises. Modelled as a generic financial loss, not a legal estimate.',
            ],
            [
                'code' => 'secondaryLossShare',
                'label' => 'Share of expected annual loss from secondary loss',
                'value' => $secondaryLossShare,
                'unit' => 'probability',
                'detail' => 'How much of the expected annual loss comes from consequential rather than direct cost.',
            ],
        ];

        $templates = (array) ($parameters['interpretation']['templates'] ?? []);
        $shortLabel = (string) ($scenario['shortLabel'] ?? $scenario['name'] ?? $code);
        $replace = static function (string $template, array $values): string {
            return str_replace(array_keys($values), array_values($values), $template);
        };

        $spreadStatement = $replace((string) ($templates['spread'] ?? ''), [
            '{scenario}' => $shortLabel,
            '{p10}' => QkFormatting::money($statistics['p10']),
            '{p90}' => QkFormatting::money($statistics['p90']),
        ]);

        $p10 = $statistics['p10'];
        $p90 = $statistics['p90'];
        $spreadRatio = $p10 > 0.0 ? ($p90 / $p10) : ($p90 > 0.0 ? INF : 1.0);
        if ($spreadRatio >= (float) ($parameters['interpretation']['spreadRatioWide'] ?? 20)) {
            $spreadStatement = trim($spreadStatement . ' ' . (string) ($templates['spreadWide'] ?? ''));
        }

        $thresholdStatement = '';
        $materialThreshold = null;
        foreach (array_reverse($thresholds) as $threshold) {
            if (($probabilities[(string) (int) $threshold] ?? 0.0) >= 0.10) {
                $materialThreshold = $threshold;
                break;
            }
        }
        if ($materialThreshold === null && $thresholds !== []) {
            $materialThreshold = $thresholds[0];
        }
        if ($materialThreshold !== null) {
            $materialProbability = $probabilities[(string) (int) $materialThreshold] ?? 0.0;
            $thresholdStatement = $materialProbability <= 0.0
                ? $replace((string) ($templates['zeroExceedance'] ?? ''), [
                    '{threshold}' => QkFormatting::money($materialThreshold),
                    '{iterations}' => number_format($iterations),
                ])
                : $replace((string) ($templates['threshold'] ?? ''), [
                    '{scenario}' => $shortLabel,
                    '{threshold}' => QkFormatting::money($materialThreshold),
                    '{probability}' => QkFormatting::percent($materialProbability),
                ]);
        }

        $annualisationStatement = (string) ($templates['annualisation'] ?? '');
        $unknownStatement = ($frequencyUnknown || $impactUnknown)
            ? (string) ($templates['unknownMixture'] ?? '')
            : '';

        return [
            'code' => $code,
            'order' => (int) ($scenario['order'] ?? 0),
            'name' => (string) ($scenario['name'] ?? $code),
            'shortLabel' => $shortLabel,
            'shortDescription' => (string) ($scenario['shortDescription'] ?? ''),
            'statement' => (string) ($scenario['statement'] ?? ''),
            'answers' => $answers,
            'inputs' => $ranges,
            'appliedModifiers' => $appliedModifiers,
            'lossAnchorSource' => $anchorFromFallback ? 'derived-from-profile' : 'reported-daily-disruption-cost',
            'statistics' => $statistics,
            'distribution' => $distribution,
            'confidence' => $confidence,
            'drivers' => $drivers,
            'interpretation' => [
                'summary' => 'The model estimates an indicative expected annual loss of '
                    . QkFormatting::money($expectedAnnualLoss) . ' for ' . $shortLabel . '.',
                'rangeStatement' => $spreadStatement,
                'thresholdStatement' => $thresholdStatement,
                'annualisationStatement' => $annualisationStatement,
                'unknownStatement' => $unknownStatement,
                'doesNotMean' => (string) ($scenario['doesNotMean'] ?? ''),
                'investigationPromptNote' => (string) ($model->content()['limitations']['investigationPromptNote'] ?? ''),
            ],
            'investigationPrompts' => array_values((array) ($scenario['investigationPrompts'] ?? [])),
        ];
    }

    /**
     * @param array<string,mixed> $question
     * @return array<string,mixed>
     */
    private static function answerEntry(QkModel $model, array $question, string $optionCode): array
    {
        $optionSet = (string) ($question['optionSet'] ?? '');

        return [
            'questionCode' => (string) ($question['code'] ?? ''),
            'questionText' => (string) ($question['text'] ?? ''),
            'optionCode' => $optionCode,
            'label' => $model->optionLabel($optionSet, $optionCode),
            'unknown' => $model->isUnknownOption($optionSet, $optionCode),
        ];
    }

    /**
     * Calculates all scenarios and the portfolio summary.
     *
     * The portfolio figure is deliberately limited to the sum of scenario expected
     * annual losses. No joint percentile is produced because scenario dependencies
     * are not modelled in v1.
     *
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    public static function calculateAssessment(
        QkModel $model,
        array $payload,
        int $seed,
        ?int $iterations = null
    ): array {
        $iterations = $iterations ?? $model->defaultIterations();
        $minimum = (int) ($model->parameters()['engineLimits']['minimumIterations'] ?? 1000);
        $maximum = min(
            $model->maximumIterations(),
            (int) ($model->parameters()['engineLimits']['maximumIterations'] ?? 50000)
        );
        $iterations = max($minimum, min($maximum, $iterations));

        $profileAnswers = (array) ($payload['profileAnswers'] ?? []);
        $scenarioAnswers = (array) ($payload['scenarioAnswers'] ?? []);

        $results = [];
        $confidenceScores = [];
        $index = 0;

        foreach ($model->scenarioOrder() as $code) {
            $index++;
            $scenario = $model->scenario($code);
            $answers = (array) ($scenarioAnswers[$code] ?? []);
            $scenarioSeed = ($seed + ($index * 104729)) % 2147483647;

            $result = self::calculateScenario(
                $model,
                [
                    'scenarioCode' => $code,
                    'likelihoodOption' => (string) ($answers[(string) $scenario['likelihoodQuestion']['code']] ?? $model->unknownCode()),
                    'impactOption' => (string) ($answers[(string) $scenario['impactQuestion']['code']] ?? $model->unknownCode()),
                    'profileAnswers' => $profileAnswers,
                ],
                $scenarioSeed,
                $iterations
            );

            $confidenceScores[] = [
                'score' => (int) $result['confidence']['score'],
                'level' => (string) $result['confidence']['level'],
            ];
            $results[] = $result;
        }

        // Relative driver indices, normalised across the scenarios for charting.
        $frequencyMax = 0.0;
        $magnitudeMax = 0.0;
        $secondaryMax = 0.0;
        foreach ($results as $result) {
            $frequencyMax = max($frequencyMax, (float) $result['statistics']['expectedLossEventFrequency']);
            $magnitudeMax = max($magnitudeMax, (float) $result['statistics']['expectedLossMagnitude']);
            $secondaryMax = max($secondaryMax, (float) $result['statistics']['secondaryLossShare']);
        }
        foreach ($results as $position => $result) {
            $results[$position]['driverIndex'] = [
                'frequency' => self::relativeIndex((float) $result['statistics']['expectedLossEventFrequency'], $frequencyMax),
                'magnitude' => self::relativeIndex((float) $result['statistics']['expectedLossMagnitude'], $magnitudeMax),
                'secondary' => self::relativeIndex((float) $result['statistics']['secondaryLossShare'], $secondaryMax),
            ];
        }

        return self::portfolioSummary($model, $results, $confidenceScores, $iterations, $profileAnswers, $scenarioAnswers);
    }

    /**
     * Builds the portfolio summary, rankings and response metadata.
     *
     * @param array<int,array<string,mixed>> $results
     * @param array<int,array{score:int,level:string}> $confidenceScores
     * @return array<string,mixed>
     */
    /**
     * Analytic expected annualised exposure for one scenario under the exact model above.
     *
     * Because the sampled inputs are independent, the expectation factorises, and for a
     * mixture input the mean is the weighted average of the component means. This gives a
     * deterministic reference that the Monte Carlo mean can be checked against, and it is
     * the basis of the sensitivity analysis.
     *
     * @param array<string,string> $profileAnswers
     * @param array<string,string> $answers likelihood and impact option codes
     */
    public static function analyticExpectedAnnualLoss(
        QkModel $model,
        string $scenarioCode,
        array $profileAnswers,
        array $answers
    ): float {
        $ranges = self::buildScenarioInputs(
            $model,
            $scenarioCode,
            $profileAnswers,
            (string) ($answers['likelihood'] ?? $model->unknownCode()),
            (string) ($answers['impact'] ?? $model->unknownCode())
        )['ranges'];

        $tef = self::inputMean($ranges['threatEventFrequency']);
        $susceptibility = self::inputMean($ranges['susceptibility']);
        $anchor = self::inputMean($ranges['lossMagnitudeAnchor']);
        $impact = self::inputMean($ranges['impactMultiplier']);
        $secondaryProbability = self::inputMean($ranges['secondaryLossProbability']);
        $secondaryMultiplier = self::inputMean($ranges['secondaryLossMultiplier']);

        $value = $tef * $susceptibility * ($anchor * $impact + $anchor * $secondaryMultiplier * $secondaryProbability);

        return is_finite($value) ? $value : 0.0;
    }

    /**
     * Analytic expected annualised exposure for a whole assessment (sum of scenarios).
     *
     * @param array<string,string> $profileAnswers
     * @param array<string,array<string,string>> $scenarioAnswers
     */
    private static function analyticPortfolioExpectedAnnualLoss(
        QkModel $model,
        array $profileAnswers,
        array $scenarioAnswers
    ): float {
        $total = 0.0;
        foreach ($model->scenarioOrder() as $code) {
            $total += self::analyticExpectedAnnualLoss(
                $model,
                $code,
                $profileAnswers,
                (array) ($scenarioAnswers[$code] ?? [])
            );
        }

        return $total;
    }

    /**
     * Deterministic one-at-a-time sensitivity of the expected annualised exposure.
     *
     * For every answer option of every factor the model is re-evaluated with that option
     * substituted and all other answers held fixed. The factor's spread is the ratio of its
     * highest to its lowest expected exposure. This is a sensitivity of the expected value:
     * it is not a variance-based attribution, not a causal analysis and not a guarantee that
     * changing a control will produce the modelled change.
     *
     * @param array<string,string> $profileAnswers
     * @param array<string,array<string,string>> $scenarioAnswers
     * @return array<string,mixed>
     */
    public static function sensitivity(
        QkModel $model,
        array $profileAnswers,
        array $scenarioAnswers
    ): array {
        $parameters = $model->parameters();
        $settings = (array) ($parameters['sensitivity'] ?? []);
        $maximum = max(1, (int) ($settings['maxFactors'] ?? 10));
        $baseline = self::analyticPortfolioExpectedAnnualLoss($model, $profileAnswers, $scenarioAnswers);

        $factors = [];

        foreach ($model->profileQuestions() as $question) {
            $questionCode = (string) $question['code'];
            $optionSet = (string) $question['optionSet'];
            $values = [];
            foreach ($model->optionSet($optionSet) as $option) {
                $optionCode = (string) $option['code'];
                $variant = $profileAnswers;
                $variant[$questionCode] = $optionCode;
                $values[$optionCode] = self::analyticPortfolioExpectedAnnualLoss($model, $variant, $scenarioAnswers);
            }
            $factor = self::summariseSensitivityFactor(
                'profile',
                $questionCode,
                null,
                (string) ($question['shortLabel'] ?? $questionCode),
                $values,
                $baseline
            );
            if ($factor !== null) {
                $factors[] = $factor;
            }
        }

        foreach ($model->scenarioOrder() as $code) {
            $scenario = $model->scenario($code);
            $shortLabel = (string) ($scenario['shortLabel'] ?? $code);
            foreach ([
                'likelihood' => (array) $scenario['likelihoodQuestion'],
                'impact' => (array) $scenario['impactQuestion'],
            ] as $kind => $question) {
                $optionSet = (string) $question['optionSet'];
                $values = [];
                foreach ($model->optionSet($optionSet) as $option) {
                    $optionCode = (string) $option['code'];
                    $variant = $scenarioAnswers;
                    $variant[$code] = array_merge((array) ($variant[$code] ?? []), [$kind => $optionCode]);
                    $values[$optionCode] = self::analyticPortfolioExpectedAnnualLoss($model, $profileAnswers, $variant);
                }
                $factor = self::summariseSensitivityFactor(
                    'scenario',
                    (string) $question['code'],
                    $code,
                    $shortLabel . ' — ' . $kind,
                    $values,
                    $baseline
                );
                if ($factor !== null) {
                    $factors[] = $factor;
                }
            }
        }

        usort($factors, static function (array $left, array $right): int {
            return $right['spreadRatio'] <=> $left['spreadRatio'];
        });

        return [
            'factors' => array_slice($factors, 0, $maximum),
            'factorCount' => count($factors),
            'baselineExpectedAnnualLoss' => $baseline,
            'baselineMethod' => 'analytic-expected-value',
            'method' => (string) ($settings['method'] ?? ''),
            'note' => (string) ($settings['note'] ?? ''),
            'truncated' => count($factors) > $maximum,
        ];
    }

    /**
     * @param array<string,float> $values optionCode => expected annualised exposure
     * @return array<string,mixed>|null
     */
    private static function summariseSensitivityFactor(
        string $kind,
        string $questionCode,
        ?string $scenarioCode,
        string $label,
        array $values,
        float $baseline
    ): ?array {
        if ($values === []) {
            return null;
        }

        $lowOption = null;
        $lowValue = INF;
        $highOption = null;
        $highValue = -INF;
        foreach ($values as $optionCode => $value) {
            if ($value < $lowValue) {
                $lowValue = $value;
                $lowOption = $optionCode;
            }
            if ($value > $highValue) {
                $highValue = $value;
                $highOption = $optionCode;
            }
        }

        $spreadRatio = $lowValue > 0.0 ? $highValue / $lowValue : ($highValue > 0.0 ? INF : 1.0);

        return [
            'kind' => $kind,
            'questionCode' => $questionCode,
            'scenarioCode' => $scenarioCode,
            'label' => $label,
            'lowOption' => $lowOption,
            'lowExpectedAnnualLoss' => $lowValue,
            'highOption' => $highOption,
            'highExpectedAnnualLoss' => $highValue,
            'spreadRatio' => is_finite($spreadRatio) ? round($spreadRatio, 3) : 9999.0,
            'baselineExpectedAnnualLoss' => $baseline,
        ];
    }

    /**
     * Builds the portfolio summary, sensitivity analysis, rankings and response metadata.
     *
     * @param array<int,array<string,mixed>> $results
     * @param array<int,array{score:int,level:string}> $confidenceScores
     * @param array<string,string> $profileAnswers
     * @param array<string,array<string,string>> $scenarioAnswers
     * @return array<string,mixed>
     */
    private static function portfolioSummary(
        QkModel $model,
        array $results,
        array $confidenceScores,
        int $iterations,
        array $profileAnswers,
        array $scenarioAnswers
    ): array {
        $parameters = $model->parameters();
        $annualisation = (array) ($parameters['annualisation'] ?? []);

        $ranked = $results;
        usort($ranked, static function (array $left, array $right): int {
            return $right['statistics']['expectedAnnualLoss'] <=> $left['statistics']['expectedAnnualLoss'];
        });

        $topCount = max(1, (int) ($model->parameters()['interpretation']['topScenarioCount'] ?? 3));
        $topScenarios = [];
        foreach (array_slice($ranked, 0, $topCount) as $position => $result) {
            $topScenarios[] = [
                'rank' => $position + 1,
                'code' => $result['code'],
                'name' => $result['name'],
                'shortLabel' => $result['shortLabel'],
                'expectedAnnualLoss' => $result['statistics']['expectedAnnualLoss'],
                'confidence' => $result['confidence']['level'],
            ];
        }

        $highestP90 = $results[0] ?? null;
        foreach ($results as $result) {
            if ($highestP90 === null || $result['statistics']['p90'] > $highestP90['statistics']['p90']) {
                $highestP90 = $result;
            }
        }

        $thresholds = $model->lossThresholds();
        $millionThreshold = null;
        foreach ($thresholds as $threshold) {
            if ($threshold === 1000000.0) {
                $millionThreshold = $threshold;
                break;
            }
        }
        if ($millionThreshold === null) {
            $millionThreshold = $thresholds[count($thresholds) - 1] ?? 1000000.0;
        }

        $highestThresholdProbability = null;
        $highestProbability = -1.0;
        foreach ($results as $result) {
            $probability = (float) ($result['statistics']['thresholdProbabilities'][(string) (int) $millionThreshold] ?? 0.0);
            if ($probability > $highestProbability) {
                $highestProbability = $probability;
                $highestThresholdProbability = $result;
            }
        }

        $sumExpected = 0.0;
        foreach ($results as $result) {
            $sumExpected += (float) $result['statistics']['expectedAnnualLoss'];
        }

        $templates = (array) ($model->parameters()['interpretation']['templates'] ?? []);
        $top = $ranked[0] ?? null;
        $summarySentence = $top === null ? '' : str_replace(
            ['{scenario}'],
            [(string) $top['shortLabel']],
            (string) ($templates['topScenario'] ?? '')
        );

        $versionMeta = $model->versionMeta();

        return [
            'status' => 'ok',
            'meta' => [
                'applicationVersion' => $versionMeta['applicationVersion'],
                'modelId' => $versionMeta['modelId'],
                'modelVersion' => $versionMeta['modelVersion'],
                'schemaVersion' => $versionMeta['schemaVersion'],
                'calibrationVersion' => $versionMeta['calibrationVersion'],
                'methodologyVersion' => $versionMeta['methodologyVersion'],
                'disclaimerVersion' => $versionMeta['disclaimerVersion'],
                'privacyNoticeVersion' => $versionMeta['privacyNoticeVersion'],
                'releaseStatus' => $versionMeta['releaseStatus'],
                'retentionMode' => $versionMeta['retentionMode'],
                'currency' => $versionMeta['currency'],
                'currencySymbol' => $versionMeta['currencySymbol'],
                'iterations' => $iterations,
                'scenarioCount' => count($results),
                'calculatedAt' => gmdate('Y-m-d\TH:i:s\Z'),
                'seedPersisted' => false,
                'seedDisclosed' => false,
                'jointPercentilesAvailable' => false,
                'annualisationMethod' => (string) ($annualisation['method'] ?? 'frequency-times-severity-annualised-exposure'),
                'realisedAnnualTotalsModelled' => false,
                'annualisationLimitation' => (string) ($annualisation['limitation'] ?? ''),
                'calibrationStatus' => (string) ($parameters['plausibilityReview']['status'] ?? ''),
            ],
            'portfolio' => [
                'label' => 'Sum of scenario expected annual loss exposure',
                'expectedAnnualLoss' => $sumExpected,
                'annualisationNote' => (string) ($templates['annualisation'] ?? ''),
                'topScenarios' => $topScenarios,
                'highestP90' => $highestP90 === null ? null : [
                    'code' => $highestP90['code'],
                    'name' => $highestP90['name'],
                    'shortLabel' => $highestP90['shortLabel'],
                    'p90' => $highestP90['statistics']['p90'],
                ],
                'highestProbabilityAboveThreshold' => $highestThresholdProbability === null ? null : [
                    'code' => $highestThresholdProbability['code'],
                    'name' => $highestThresholdProbability['name'],
                    'shortLabel' => $highestThresholdProbability['shortLabel'],
                    'threshold' => $millionThreshold,
                    'probability' => $highestProbability,
                ],
                'confidence' => QkConfidence::overall(
                    $confidenceScores,
                    $model->parameters(),
                    (string) ($model->manifest()['releaseStatus'] ?? '')
                ),
                'summary' => $summarySentence,
                'jointPercentilesNote' => (string) ($templates['noJointPercentiles'] ?? ''),
                'sensitivity' => self::sensitivity($model, $profileAnswers, $scenarioAnswers),
            ],
            'scenarios' => $results,
        ];
    }

    private static function relativeIndex(float $value, float $maximum): int
    {
        if ($maximum <= 0.0 || $value <= 0.0) {
            return 0;
        }

        return (int) round(100.0 * $value / $maximum);
    }

    /**
     * Multiplies every element of a range by a scalar.
     *
     * @param array<string,mixed> $range
     * @return array{min:float,mode:float,max:float}
     */
    private static function scaleRange(array $range, float $scale): array
    {
        if ($scale <= 0.0 || !is_finite($scale)) {
            $scale = 1.0;
        }

        return [
            'min' => (float) $range['min'] * $scale,
            'mode' => (float) $range['mode'] * $scale,
            'max' => (float) $range['max'] * $scale,
        ];
    }
}
