<?php

declare(strict_types=1);

require_once __DIR__ . '/distributions.php';
require_once __DIR__ . '/percentile.php';
require_once __DIR__ . '/confidence.php';
require_once __DIR__ . '/bayesian_updater.php';
require_once __DIR__ . '/inference_repository.php';

/**
 * Joint posterior-predictive annual-loss engine.
 */
final class QkPosteriorEngine
{
    /**
     * @param array<string,mixed> $payload validated profileAnswers/scenarioAnswers/organisationEvidence
     * @return array<string,mixed>
     */
    public static function calculateAssessment(
        QkModel $model,
        QkInferenceRepository $inference,
        array $payload,
        int $seed,
        ?int $iterations = null
    ): array {
        if (!$inference->isActive()) {
            throw new QkInferenceException('The posterior inference package is not active.');
        }
        $iterations = self::resolveIterations($model, $iterations ?? $model->defaultIterations());
        $simulation = self::simulate($model, $inference, $payload, $seed, $iterations, false);
        $metadata = self::meta($model, $inference, $seed, $iterations, $simulation['evidenceMetadata']);
        $scenarios = [];
        $confidenceScores = [];
        foreach ($simulation['scenarios'] as $scenario) {
            $summary = self::scenarioResult($model, $inference, $scenario, $metadata);
            $scenarios[] = $summary;
            $confidenceScores[] = [
                'score' => (int) $summary['confidence']['score'],
                'level' => (string) $summary['confidence']['level'],
            ];
        }
        $portfolio = self::portfolioSummary($model, $inference, $simulation, $scenarios, $confidenceScores, $metadata);
        $profile = (array) ($payload['profileAnswers'] ?? []);
        $answers = (array) ($payload['scenarioAnswers'] ?? []);
        $portfolio['sensitivity'] = self::sensitivity($model, $inference, $profile, $answers);

        return [
            'status' => 'ok',
            'meta' => $metadata,
            'portfolio' => $portfolio,
            'scenarios' => $scenarios,
        ];
    }

    /**
     * Raw joint annual-loss vectors for Decision Lab.
     *
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    public static function lossVectors(
        QkModel $model,
        QkInferenceRepository $inference,
        array $payload,
        int $seed,
        int $iterations
    ): array {
        if (!$inference->isActive()) {
            throw new QkInferenceException('The posterior inference package is not active.');
        }
        $iterations = self::resolveIterations($model, $iterations);
        $simulation = self::simulate($model, $inference, $payload, $seed, $iterations, true);
        $scenarios = [];
        foreach ($simulation['scenarios'] as $scenario) {
            $scenarios[] = [
                'code' => (string) $scenario['code'],
                'name' => (string) $scenario['name'],
                'shortLabel' => (string) $scenario['shortLabel'],
                'losses' => $scenario['losses'],
                'events' => $scenario['events'],
                'frequencyUniforms' => $scenario['frequencyUniforms'],
                'materialRates' => $scenario['materialRates'],
                'inputs' => $scenario['inputs'],
                'inputExpectations' => [
                    'threatEventFrequency' => $scenario['expectedAttackRate'],
                    'susceptibility' => $scenario['expectedMaterialProbability'],
                    'lossMagnitudeAnchor' => $scenario['expectedEventSeverity'],
                    'lossMagnitude' => $scenario['expectedEventSeverity'],
                ],
                'clamps' => [],
            ];
        }

        return [
            'scenarios' => $scenarios,
            'portfolioLosses' => $simulation['portfolioLosses'],
            'meta' => [
                'seed' => $seed,
                'iterations' => $iterations,
                'scenarioOrder' => $model->scenarioOrder(),
                'thresholds' => $model->lossThresholds(),
                'jointPercentilesAvailable' => true,
                'inference' => $inference->metadata(),
                'evidenceUpdate' => $simulation['evidenceMetadata'],
                'annualisationMethod' => 'posterior-predictive-compound-poisson-annual-total',
                'realisedAnnualTotalsModelled' => true,
            ],
        ];
    }

    private static function resolveIterations(QkModel $model, int $iterations): int
    {
        $minimum = (int) ($model->parameters()['engineLimits']['minimumIterations'] ?? 1000);
        $maximum = min(
            $model->maximumIterations(),
            (int) ($model->parameters()['engineLimits']['maximumIterations'] ?? 50000)
        );

        return max($minimum, min($maximum, $iterations));
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private static function simulate(
        QkModel $model,
        QkInferenceRepository $inference,
        array $payload,
        int $seed,
        int $iterations,
        bool $retainEvents
    ): array {
        $profile = (array) ($payload['profileAnswers'] ?? []);
        $answers = (array) ($payload['scenarioAnswers'] ?? []);
        $evidenceCount = $payload['organisationEvidence']['materialLossEventCount'] ?? null;
        $evidenceCount = is_numeric($evidenceCount) ? (int) $evidenceCount : null;
        $profileUnknownCount = 0;
        foreach ($profile as $answerCode) {
            if ((string) $answerCode === $model->unknownCode()) {
                $profileUnknownCount++;
            }
        }
        $disruptionCostUnknown = (string) ($profile['QP8'] ?? $model->unknownCode()) === $model->unknownCode();
        $sizeCode = (string) ($profile['QP1'] ?? 'UNKNOWN');
        $class = $inference->referenceClass($sizeCode);
        $baseDraws = [];
        $drawCount = max(1, $inference->drawCount($class));
        for ($index = 0; $index < $drawCount; $index++) {
            $baseDraws[] = $inference->draw($class, $index);
        }
        $evidenceRng = new QkDistributions($seed);
        $updated = QkBayesianUpdater::update($baseDraws, $evidenceCount, $iterations, $evidenceRng);
        $draws = $updated['draws'];
        $scenarios = [];
        $scenarioRngs = [];
        foreach ($model->scenarioOrder() as $code) {
            $scenarioRngs[$code] = new QkDistributions(
                ($seed ^ (int) (crc32('scenario|' . $code) & 0x7FFFFFFF)) ?: 1
            );
            $scenario = $model->scenario($code);
            $scenarios[$code] = [
                'code' => $code,
                'name' => (string) $scenario['name'],
                'shortLabel' => (string) $scenario['shortLabel'],
                'losses' => [],
                'events' => [],
                'frequencyUniforms' => [],
                'materialRates' => [],
                'rateValues' => [],
                'materialProbabilityValues' => [],
                'eventSeverityValues' => [],
                'primaryValues' => [],
                'secondaryValues' => [],
                'secondaryYears' => 0,
                'materialRateSum' => 0.0,
                'attackRateSum' => 0.0,
                'materialProbabilitySum' => 0.0,
                'eventSeveritySum' => 0.0,
                'primarySum' => 0.0,
                'secondarySum' => 0.0,
                'retainEvents' => $retainEvents,
                'profileUnknownCount' => $profileUnknownCount,
                'disruptionCostUnknown' => $disruptionCostUnknown,
            ];
        }
        $portfolioLosses = array_fill(0, $iterations, 0.0);
        for ($iteration = 0; $iteration < $iterations; $iteration++) {
            $draw = (array) $draws[$iteration % count($draws)];
            foreach ($model->scenarioOrder() as $code) {
                $parameters = self::scenarioParameters(
                    $model,
                    $inference,
                    $profile,
                    (array) ($answers[$code] ?? []),
                    $code,
                    $draw
                );
                $scenarios[$code]['parameters'] = $parameters;
                $scenarioRng = $scenarioRngs[$code];
                $uniform = $scenarioRng->uniform();
                $count = QkDistributions::poissonQuantile($uniform, $parameters['materialRate']);
                $events = [];
                $annual = 0.0;
                $primaryTotal = 0.0;
                $secondaryTotal = 0.0;
                for ($eventIndex = 0; $eventIndex < $count; $eventIndex++) {
                    $severity = self::sampleLognormal(
                        $scenarioRng,
                        $parameters['severityMu'],
                        $parameters['severitySigma']
                    );
                    $primary = $severity * $parameters['primaryShare'];
                    $secondary = $severity - $primary;
                    $events[] = ['loss' => $severity, 'primary' => $primary, 'secondary' => $secondary];
                    $annual += $severity;
                    $primaryTotal += $primary;
                    $secondaryTotal += $secondary;
                }
                $scenarios[$code]['losses'][] = $annual;
                if ($retainEvents) {
                    $scenarios[$code]['events'][] = $events;
                    $scenarios[$code]['frequencyUniforms'][] = $uniform;
                    $scenarios[$code]['materialRates'][] = $parameters['materialRate'];
                }
                $scenarios[$code]['rateValues'][] = $parameters['attackRate'];
                $scenarios[$code]['materialProbabilityValues'][] = $parameters['materialProbability'];
                $scenarios[$code]['eventSeverityValues'][] = $count > 0 ? $annual / $count : 0.0;
                $scenarios[$code]['materialRateSum'] += $parameters['materialRate'];
                $scenarios[$code]['attackRateSum'] += $parameters['attackRate'];
                $scenarios[$code]['materialProbabilitySum'] += $parameters['materialProbability'];
                $scenarios[$code]['eventSeveritySum'] += $annual;
                $scenarios[$code]['primarySum'] += $primaryTotal;
                $scenarios[$code]['secondarySum'] += $secondaryTotal;
                if ($secondaryTotal > 0.0) {
                    $scenarios[$code]['secondaryYears']++;
                }
                $portfolioLosses[$iteration] += $annual;
            }
        }
        foreach ($scenarios as $code => $scenario) {
            $scenarios[$code]['inputs'] = self::posteriorInputSummaries($inference, $scenario);
            $scenarios[$code]['expectedAttackRate'] = $scenario['attackRateSum'] / $iterations;
            $scenarios[$code]['expectedMaterialProbability'] = $scenario['materialProbabilitySum'] / $iterations;
            $scenarios[$code]['expectedEventSeverity'] = $scenario['eventSeveritySum'] / $iterations;
            $scenarios[$code]['materialRateMean'] = $scenario['materialRateSum'] / $iterations;
            $scenarios[$code]['primaryMean'] = $scenario['primarySum'] / $iterations;
            $scenarios[$code]['secondaryMean'] = $scenario['secondarySum'] / $iterations;
            unset(
                $scenarios[$code]['rateValues'],
                $scenarios[$code]['materialProbabilityValues'],
                $scenarios[$code]['eventSeverityValues'],
                $scenarios[$code]['primaryValues'],
                $scenarios[$code]['secondaryValues'],
                $scenarios[$code]['materialRateSum'],
                $scenarios[$code]['attackRateSum'],
                $scenarios[$code]['materialProbabilitySum'],
                $scenarios[$code]['eventSeveritySum'],
                $scenarios[$code]['primarySum'],
                $scenarios[$code]['secondarySum']
            );
        }

        return [
            'scenarios' => array_values($scenarios),
            'portfolioLosses' => $portfolioLosses,
            'evidenceMetadata' => $updated['metadata'],
            'class' => $class,
        ];
    }

    /**
     * @param array<string,string> $profile
     * @param array<string,string> $answers
     * @param array<string,mixed> $draw
     * @return array<string,mixed>
     */
    private static function scenarioParameters(
        QkModel $model,
        QkInferenceRepository $inference,
        array $profile,
        array $answers,
        string $code,
        array $draw
    ): array {
        $scenario = $model->scenario($code);
        $likelihoodCode = (string) (
            $answers[(string) $scenario['likelihoodQuestion']['code']] ?? $model->unknownCode()
        );
        $impactCode = (string) (
            $answers[(string) $scenario['impactQuestion']['code']] ?? $model->unknownCode()
        );
        $questionnaire = $inference->questionnaireModel();
        $weightIndex = array_search($code, $inference->scenarioOrder(), true);
        $weightIndex = $weightIndex === false ? 0 : (int) $weightIndex;
        $weights = (array) ($draw['scenarioWeights'] ?? [0.2, 0.2, 0.2, 0.2, 0.2]);
        $frequencyOffsets = (array) ($draw['scenarioFrequencyLogOffsets'] ?? [0, 0, 0, 0, 0]);
        $severityOffsets = (array) ($draw['scenarioSeverityLogOffsets'] ?? [0, 0, 0, 0, 0]);
        $materialOffsets = (array) ($draw['scenarioMaterialityLogitOffsets'] ?? [0, 0, 0, 0, 0]);
        $frequencyFactors = (array) ($questionnaire['frequencyFactors'] ?? []);
        $impactFactors = (array) ($questionnaire['impactFactors'] ?? []);
        $frequencyFactor = (float) ($frequencyFactors[$likelihoodCode] ?? 1.0);
        $impactFactor = (float) ($impactFactors[$impactCode] ?? 1.0);

        $profileFrequency = 1.0;
        if ($code !== 'S4') {
            $map = (array) ($questionnaire['profileFrequencyFactors']['QP3'] ?? []);
            $profileFrequency *= (float) ($map[(string) ($profile['QP3'] ?? 'UNKNOWN')] ?? 1.0);
        } else {
            $map = (array) ($questionnaire['thirdPartyFrequencyFactor']['QP5'] ?? []);
            $profileFrequency *= (float) ($map[(string) ($profile['QP5'] ?? 'UNKNOWN')] ?? 1.0);
        }
        $maturityMap = (array) ($questionnaire['profileMaterialityOddsFactors']['QP7'] ?? []);
        $maturityOdds = max(0.01, (float) ($maturityMap[(string) ($profile['QP7'] ?? 'UNKNOWN')] ?? 1.0));

        $severityFactor = 1.0;
        foreach (['QP2', 'QP4', 'QP6'] as $questionCode) {
            $map = (array) ($questionnaire['profileSeverityFactors'][$questionCode] ?? []);
            $severityFactor *= max(
                0.01,
                (float) ($map[(string) ($profile[$questionCode] ?? 'UNKNOWN')] ?? 1.0)
            );
        }
        $qp8Factor = self::qp8SeverityFactor($model, (string) ($profile['QP8'] ?? 'UNKNOWN'), $questionnaire);
        $materialProbability = self::logistic(
            self::logit((float) $draw['materialProbability'])
            + (float) ($materialOffsets[$weightIndex] ?? 0.0)
            + log($maturityOdds)
        );
        $scenarioRate = max(0.0, (float) $draw['attackRate'])
            * (float) ($weights[$weightIndex] ?? 0.2)
            * exp((float) ($frequencyOffsets[$weightIndex] ?? 0.0))
            * $frequencyFactor
            * $profileFrequency;

        return [
            'attackRate' => $scenarioRate,
            'materialRate' => $scenarioRate * $materialProbability,
            'materialityOddsFactor' => $maturityOdds,
            'materialProbability' => $materialProbability,
            'severityMu' => (float) $draw['severityMu']
                + (float) ($severityOffsets[$weightIndex] ?? 0.0)
                + log(max(0.01, $impactFactor))
                + log(max(0.01, $severityFactor))
                + log(max(0.01, $qp8Factor)),
            'severitySigma' => max(0.05, (float) $draw['severitySigma']),
            'primaryShare' => min(0.995, max(0.005, (float) $draw['primaryShare'])),
            'likelihoodCode' => $likelihoodCode,
            'impactCode' => $impactCode,
            'frequencyFactor' => $frequencyFactor * $profileFrequency,
            'severityFactor' => $impactFactor * $severityFactor * $qp8Factor,
        ];
    }

    /** @param array<string,mixed> $questionnaire */
    private static function qp8SeverityFactor(QkModel $model, string $answer, array $questionnaire): float
    {
        $band = $model->parameters()['disruptionCostAnchor']['bands'][$answer] ?? null;
        if (!is_array($band)) {
            return 1.0;
        }
        $reference = max(1.0, (float) ($questionnaire['qp8ReferenceDailyCostEUR'] ?? 200000.0));
        $elasticity = (float) ($questionnaire['qp8Elasticity'] ?? 0.25);

        return max(0.05, (((float) $band['mode']) / $reference) ** $elasticity);
    }

    private static function logistic(float $value): float
    {
        if ($value >= 50.0) {
            return 0.995;
        }
        if ($value <= -50.0) {
            return 0.005;
        }

        return min(0.995, max(0.005, 1.0 / (1.0 + exp(-$value))));
    }

    private static function logit(float $value): float
    {
        $value = min(0.995, max(0.005, $value));

        return log($value / (1.0 - $value));
    }

    private static function sampleLognormal(QkDistributions $rng, float $mu, float $sigma): float
    {
        $first = max(1.0e-12, $rng->uniform());
        $second = $rng->uniform();
        $normal = sqrt(-2.0 * log($first)) * cos(2.0 * M_PI * $second);
        $value = exp($mu + $sigma * $normal);

        return is_finite($value) ? max(1.0, $value) : exp(min(30.0, $mu));
    }

    /** @return array<string,mixed> */
    private static function meta(
        QkModel $model,
        QkInferenceRepository $inference,
        int $seed,
        int $iterations,
        array $evidenceMetadata
    ): array {
        $version = $model->versionMeta();
        $parameters = $model->parameters();

        return [
            ...$version,
            'iterations' => $iterations,
            'scenarioCount' => count($model->scenarioOrder()),
            'calculatedAt' => gmdate('Y-m-d\\TH:i:s\\Z'),
            'seedPersisted' => false,
            'seedDisclosed' => true,
            'simulationSeed' => $seed,
            'jointPercentilesAvailable' => true,
            'annualisationMethod' => 'posterior-predictive-compound-poisson-annual-total',
            'realisedAnnualTotalsModelled' => true,
            'annualisationLimitation' => (string) (
                $parameters['annualisation']['limitation']
                ?? 'Posterior predictive annual losses are model simulations, not guarantees.'
            ),
            'calibrationStatus' => (string) ($model->manifest()['releaseStatus'] ?? 'provisional-release'),
            'inference' => [
                ...$inference->metadata(),
                'evidenceUpdate' => $evidenceMetadata,
            ],
        ];
    }

    /** @return array<string,mixed> */
    private static function scenarioResult(
        QkModel $model,
        QkInferenceRepository $inference,
        array $scenario,
        array $metadata
    ): array {
        $losses = array_values(array_map('floatval', (array) $scenario['losses']));
        $iterations = count($losses);
        $sorted = QkPercentile::sorted($losses);
        $probabilities = [];
        $counts = [];
        $intervals = [];
        foreach ($model->lossThresholds() as $threshold) {
            $key = (string) (int) $threshold;
            $count = QkPercentile::countGreaterThan($sorted, (float) $threshold);
            $counts[$key] = $count;
            $probabilities[$key] = $iterations > 0 ? $count / $iterations : 0.0;
            $intervals[$key] = QkPercentile::exceedanceDiagnostics($count, $iterations);
        }
        $expected = QkPercentile::mean($losses);
        $coefficient = QkPercentile::coefficientOfVariation($losses);
        $materialFrequency = (float) ($scenario['materialRateMean'] ?? 0.0);
        $expectedPrimary = (float) ($scenario['primaryMean'] ?? 0.0);
        $expectedSecondary = (float) ($scenario['secondaryMean'] ?? 0.0);
        $scenarioData = $model->scenario((string) $scenario['code']);
        $answers = [
            self::answerEntry(
                $model,
                (array) $scenarioData['likelihoodQuestion'],
                (string) $scenario['parameters']['likelihoodCode']
            ),
            self::answerEntry(
                $model,
                (array) $scenarioData['impactQuestion'],
                (string) $scenario['parameters']['impactCode']
            ),
        ];
        $confidence = QkConfidence::scenario(
            [
                'frequencyUnknown' => (string) $scenario['parameters']['likelihoodCode'] === $model->unknownCode(),
                'impactUnknown' => (string) $scenario['parameters']['impactCode'] === $model->unknownCode(),
                'profileUnknownCount' => (int) ($scenario['profileUnknownCount'] ?? 0),
                'disruptionCostUnknown' => (bool) ($scenario['disruptionCostUnknown'] ?? false),
                'coefficientOfVariation' => $coefficient,
                'releaseStatus' => (string) ($model->manifest()['releaseStatus'] ?? ''),
            ],
            $model->parameters()
        );
        $histogramUpper = QkPercentile::percentile(
            $sorted,
            (float) ($model->parameters()['engineLimits']['histogramUpperPercentile'] ?? 0.99)
        );
        $distribution = QkPercentile::histogram(
            $losses,
            $histogramUpper,
            (int) ($model->parameters()['engineLimits']['histogramBins'] ?? 40)
        );
        $statistics = [
            'minimum' => $sorted === [] ? 0.0 : (float) $sorted[0],
            'p10' => QkPercentile::percentile($sorted, 0.10),
            'p25' => QkPercentile::percentile($sorted, 0.25),
            'p50' => QkPercentile::percentile($sorted, 0.50),
            'p75' => QkPercentile::percentile($sorted, 0.75),
            'p90' => QkPercentile::percentile($sorted, 0.90),
            'maximum' => $sorted === [] ? 0.0 : (float) $sorted[$iterations - 1],
            'expectedAnnualLoss' => $expected,
            'standardDeviation' => QkPercentile::standardDeviation($losses),
            'coefficientOfVariation' => $coefficient,
            'meanStandardError' => QkPercentile::standardError($losses),
            'expectedThreatEventFrequency' => (float) $scenario['expectedAttackRate'],
            'meanSusceptibility' => (float) $scenario['expectedMaterialProbability'],
            'expectedLossEventFrequency' => $materialFrequency,
            'expectedLossMagnitude' => $materialFrequency > 0.0 ? $expected / $materialFrequency : 0.0,
            'expectedPrimaryLossMagnitude' => $materialFrequency > 0.0
                ? $expectedPrimary / $materialFrequency
                : 0.0,
            'expectedSecondaryLossMagnitude' => $materialFrequency > 0.0
                ? $expectedSecondary / $materialFrequency
                : 0.0,
            'secondaryLossShare' => $expected > 0.0 ? $expectedSecondary / $expected : 0.0,
            'secondaryLossOccurrenceRate' => $iterations > 0
                ? ((int) $scenario['secondaryYears']) / $iterations
                : 0.0,
            'iterations' => $iterations,
            'thresholdProbabilities' => $probabilities,
            'thresholdExceedanceCounts' => $counts,
            'thresholdIntervals' => $intervals,
        ];

        return [
            'code' => (string) $scenario['code'],
            'order' => (int) ($scenarioData['order'] ?? 0),
            'name' => (string) $scenario['name'],
            'shortLabel' => (string) $scenario['shortLabel'],
            'shortDescription' => (string) ($scenarioData['shortDescription'] ?? ''),
            'statement' => (string) ($scenarioData['statement'] ?? ''),
            'answers' => $answers,
            'inputs' => $scenario['inputs'],
            'appliedModifiers' => [],
            'lossAnchorSource' => (bool) ($scenario['disruptionCostUnknown'] ?? false)
                ? 'reference-class-severity'
                : 'elicitation-adjusted-reference-severity',
            'statistics' => $statistics,
            'distribution' => $distribution,
            'confidence' => $confidence,
            'drivers' => self::drivers($expected, $scenario, $expectedSecondary),
            'driverIndex' => ['frequency' => 100, 'magnitude' => 100, 'secondary' => 0],
            'interpretation' => [
                'summary' => 'The posterior-predictive model estimates an expected annual loss of '
                    . QkFormatting::money($expected) . ' for ' . (string) $scenario['shortLabel'] . '.',
                'rangeStatement' => 'The P10 to P90 interval describes simulated annual total losses.',
                'thresholdStatement' => 'Threshold probabilities are posterior-predictive shares of simulated years.',
                'annualisationStatement' => 'Percentiles describe realised annual loss totals simulated from annual event counts and per-event severities.',
                'unknownStatement' => ((string) $scenario['parameters']['likelihoodCode'] === $model->unknownCode())
                    ? 'Unknown likelihood leaves the reference-class posterior unchanged for this scenario.'
                    : '',
                'doesNotMean' => (string) ($scenarioData['doesNotMean'] ?? ''),
                'investigationPromptNote' => 'Evidence-informed estimates are not organisation-specific validation.',
            ],
            'investigationPrompts' => array_values((array) ($scenarioData['investigationPrompts'] ?? [])),
        ];
    }

    /** @return array<string,mixed> */
    private static function portfolioSummary(
        QkModel $model,
        QkInferenceRepository $inference,
        array $simulation,
        array $scenarioResults,
        array $confidenceScores,
        array $metadata
    ): array {
        $losses = array_values(array_map('floatval', (array) $simulation['portfolioLosses']));
        $sorted = QkPercentile::sorted($losses);
        $iterations = count($losses);
        $expected = QkPercentile::mean($losses);
        $thresholds = $model->lossThresholds();
        $probabilities = [];
        $counts = [];
        $intervals = [];
        foreach ($thresholds as $threshold) {
            $key = (string) (int) $threshold;
            $count = QkPercentile::countGreaterThan($sorted, (float) $threshold);
            $counts[$key] = $count;
            $probabilities[$key] = $iterations > 0 ? $count / $iterations : 0.0;
            $intervals[$key] = QkPercentile::exceedanceDiagnostics($count, $iterations);
        }
        $ranked = [];
        foreach ($scenarioResults as $scenario) {
            $ranked[] = [
                'code' => $scenario['code'],
                'name' => $scenario['name'],
                'shortLabel' => $scenario['shortLabel'],
                'expectedAnnualLoss' => $scenario['statistics']['expectedAnnualLoss'],
                'confidence' => $scenario['confidence']['level'],
            ];
        }
        usort($ranked, static fn (array $left, array $right): int =>
            $right['expectedAnnualLoss'] <=> $left['expectedAnnualLoss']);
        foreach ($ranked as $index => $entry) {
            $ranked[$index]['rank'] = $index + 1;
        }
        $highestP90 = null;
        $highestThreshold = null;
        $million = 1000000.0;
        foreach ($scenarioResults as $scenario) {
            if ($highestP90 === null || $scenario['statistics']['p90'] > $highestP90['p90']) {
                $highestP90 = [
                    'code' => $scenario['code'],
                    'name' => $scenario['name'],
                    'shortLabel' => $scenario['shortLabel'],
                    'p90' => $scenario['statistics']['p90'],
                ];
            }
            $probability = (float) ($scenario['statistics']['thresholdProbabilities'][(string) (int) $million] ?? 0.0);
            if ($highestThreshold === null || $probability > $highestThreshold['probability']) {
                $highestThreshold = [
                    'code' => $scenario['code'],
                    'name' => $scenario['name'],
                    'shortLabel' => $scenario['shortLabel'],
                    'threshold' => $million,
                    'probability' => $probability,
                ];
            }
        }

        return [
            'label' => 'Posterior-predictive annual total loss',
            'expectedAnnualLoss' => $expected,
            'standardDeviation' => QkPercentile::standardDeviation($losses),
            'meanStandardError' => QkPercentile::standardError($losses),
            'p10' => QkPercentile::percentile($sorted, 0.10),
            'p25' => QkPercentile::percentile($sorted, 0.25),
            'p50' => QkPercentile::percentile($sorted, 0.50),
            'p75' => QkPercentile::percentile($sorted, 0.75),
            'p90' => QkPercentile::percentile($sorted, 0.90),
            'minimum' => $sorted === [] ? 0.0 : $sorted[0],
            'maximum' => $sorted === [] ? 0.0 : $sorted[$iterations - 1],
            'iterations' => $iterations,
            'thresholdProbabilities' => $probabilities,
            'thresholdExceedanceCounts' => $counts,
            'thresholdIntervals' => $intervals,
            'scenarioContributions' => array_map(
                static fn (array $entry): array => [
                    'code' => $entry['code'],
                    'name' => $entry['name'],
                    'shortLabel' => $entry['shortLabel'],
                    'expectedAnnualLoss' => $entry['statistics']['expectedAnnualLoss'],
                    'factor' => 1.0,
                ],
                $scenarioResults
            ),
            'annualisationNote' => 'P10/P50/P90 describe simulated annual total losses, including years with no material event. Because counts are zero-inflated and severities are heavy-tailed, the mean can exceed P90. These are posterior-predictive intervals, not confidence intervals or guarantees.',
            'topScenarios' => array_slice($ranked, 0, 3),
            'highestP90' => $highestP90,
            'highestProbabilityAboveThreshold' => $highestThreshold,
            'confidence' => QkConfidence::overall(
                $confidenceScores,
                $model->parameters(),
                (string) ($model->manifest()['releaseStatus'] ?? '')
            ),
            'summary' => 'The joint posterior-predictive mean annual loss is '
                . QkFormatting::money($expected) . '.',
            'jointPercentilesNote' => 'Scenario losses share the same posterior parameter draw and are simulated jointly; joint percentiles are available under the documented dependence model.',
            'sensitivity' => self::emptySensitivity(),
            'inference' => $metadata['inference'],
        ];
    }

    /**
     * @param array<string,string> $profile
     * @param array<string,array<string,string>> $answers
     * @return array<string,mixed>
     */
    private static function sensitivity(
        QkModel $model,
        QkInferenceRepository $inference,
        array $profile,
        array $answers
    ): array {
        $baseline = self::posteriorExpectedLoss($model, $inference, $profile, $answers);
        $factors = [];
        foreach ($model->profileQuestions() as $question) {
            $questionCode = (string) ($question['code'] ?? '');
            $optionSet = (string) ($question['optionSet'] ?? '');
            if ($questionCode === '' || $optionSet === '') {
                continue;
            }
            $evaluated = [];
            foreach ($model->optionSet($optionSet) as $option) {
                $optionCode = (string) ($option['code'] ?? '');
                $variant = $profile;
                $variant[$questionCode] = $optionCode;
                $evaluated[$optionCode] = self::posteriorExpectedLoss(
                    $model,
                    $inference,
                    $variant,
                    $answers
                );
            }
            $factors[] = self::sensitivityFactor(
                'profile',
                $questionCode,
                null,
                (string) ($question['shortLabel'] ?? $question['text'] ?? $questionCode),
                $evaluated,
                $baseline
            );
        }
        foreach ($model->scenarioOrder() as $scenarioCode) {
            $scenario = $model->scenario($scenarioCode);
            foreach (['likelihoodQuestion', 'impactQuestion'] as $key) {
                $question = (array) ($scenario[$key] ?? []);
                $questionCode = (string) ($question['code'] ?? '');
                $optionSet = (string) ($question['optionSet'] ?? '');
                $evaluated = [];
                foreach ($model->optionSet($optionSet) as $option) {
                    $optionCode = (string) ($option['code'] ?? '');
                    $variant = $answers;
                    $variant[$scenarioCode][$questionCode] = $optionCode;
                    $evaluated[$optionCode] = self::posteriorExpectedLoss(
                        $model,
                        $inference,
                        $profile,
                        $variant
                    );
                }
                $factors[] = self::sensitivityFactor(
                    'scenario',
                    $questionCode,
                    $scenarioCode,
                    (string) ($scenario['shortLabel'] ?? '') . ': ' . (string) ($question['text'] ?? ''),
                    $evaluated,
                    $baseline
                );
            }
        }
        $factorCount = count($factors);
        usort($factors, static fn (array $left, array $right): int =>
            $right['spreadRatio'] <=> $left['spreadRatio']);
        $maximum = max(1, (int) ($model->parameters()['sensitivity']['maxFactors'] ?? 10));
        $truncated = $factorCount > $maximum;

        return [
            'factors' => array_slice($factors, 0, $maximum),
            'factorCount' => $factorCount,
            'baselineExpectedAnnualLoss' => $baseline,
            'baselineMethod' => 'posterior-draw-expected-value',
            'method' => 'Expected annual loss is recomputed across the same posterior draws for each answer option, holding other answers fixed. This is a model sensitivity, not a causal effect.',
            'note' => 'Factors are ranked by spread. Questionnaire multipliers and scenario weights remain assumptions.',
            'truncated' => $truncated,
        ];
    }

    /**
     * @param array<string,float> $evaluated
     * @return array<string,mixed>
     */
    private static function sensitivityFactor(
        string $kind,
        string $questionCode,
        ?string $scenarioCode,
        string $label,
        array $evaluated,
        float $baseline
    ): array {
        $lowOption = '';
        $highOption = '';
        $low = INF;
        $high = -INF;
        foreach ($evaluated as $option => $value) {
            if ($value < $low) {
                $low = $value;
                $lowOption = (string) $option;
            }
            if ($value > $high) {
                $high = $value;
                $highOption = (string) $option;
            }
        }
        $low = is_finite($low) ? $low : 0.0;
        $high = is_finite($high) ? $high : 0.0;

        return [
            'kind' => $kind,
            'questionCode' => $questionCode,
            'scenarioCode' => $scenarioCode,
            'label' => $label,
            'lowOption' => $lowOption,
            'lowExpectedAnnualLoss' => $low,
            'highOption' => $highOption,
            'highExpectedAnnualLoss' => $high,
            'spreadRatio' => $low > 0.0 ? $high / $low : ($high > 0.0 ? 9999.0 : 1.0),
            'baselineExpectedAnnualLoss' => $baseline,
        ];
    }

    /**
     * @param array<string,string> $profile
     * @param array<string,array<string,string>> $answers
     */
    private static function posteriorExpectedLoss(
        QkModel $model,
        QkInferenceRepository $inference,
        array $profile,
        array $answers
    ): float {
        $class = $inference->referenceClass((string) ($profile['QP1'] ?? 'UNKNOWN'));
        $drawCount = $inference->drawCount($class);
        $sampleCount = min(24, $drawCount);
        $total = 0.0;
        for ($index = 0; $index < $sampleCount; $index++) {
            $drawIndex = (int) floor((($index + 0.5) / $sampleCount) * $drawCount);
            $draw = $inference->draw($class, $drawIndex);
            foreach ($model->scenarioOrder() as $scenarioCode) {
                $parameters = self::scenarioParameters(
                    $model,
                    $inference,
                    $profile,
                    (array) ($answers[$scenarioCode] ?? []),
                    $scenarioCode,
                    $draw
                );
                $sigma = $parameters['severitySigma'];
                $meanSeverity = exp($parameters['severityMu'] + 0.5 * $sigma * $sigma);
                $total += $parameters['materialRate'] * $meanSeverity;
            }
        }

        return $sampleCount > 0 ? $total / $sampleCount : 0.0;
    }

    /** @return array<string,mixed> */
    private static function emptySensitivity(): array
    {
        return [
            'factors' => [],
            'factorCount' => 0,
            'baselineExpectedAnnualLoss' => 0.0,
            'baselineMethod' => 'posterior-predictive-expected-value',
            'method' => 'Posterior sensitivity is reported in the audit and calibration report.',
            'note' => 'One-at-a-time questionnaire sensitivity is not used to claim causal effects.',
            'truncated' => false,
        ];
    }

    /**
     * @param array<string,mixed> $scenario
     * @return array<int,array<string,mixed>>
     */
    private static function drivers(float $expected, array $scenario, float $expectedSecondary): array
    {
        return [
            [
                'code' => 'threatEventFrequency',
                'label' => 'Expected scenario event rate',
                'value' => (float) $scenario['expectedAttackRate'],
                'unit' => 'events/year',
                'detail' => 'Posterior mean annual scenario event rate after questionnaire evidence.',
            ],
            [
                'code' => 'susceptibility',
                'label' => 'Material-loss probability',
                'value' => (float) $scenario['expectedMaterialProbability'],
                'unit' => 'probability',
                'detail' => 'Probability that an identified event carries a material financial cost.',
            ],
            [
                'code' => 'lossEventFrequency',
                'label' => 'Expected material loss events per year',
                'value' => (float) ($scenario['materialRateMean'] ?? 0.0),
                'unit' => 'events/year',
                'detail' => 'Posterior mean Poisson rate used to draw each simulated year.',
            ],
            [
                'code' => 'primaryLossMagnitude',
                'label' => 'Expected primary loss per event',
                'value' => (float) ($scenario['materialRateMean'] ?? 0.0) > 0.0
                    ? (float) ($scenario['primaryMean'] ?? 0.0) / (float) $scenario['materialRateMean']
                    : 0.0,
                'unit' => 'currency',
                'detail' => 'Allocated direct-loss share of simulated material event severity.',
            ],
            [
                'code' => 'secondaryLossProbability',
                'label' => 'Years with secondary loss',
                'value' => count((array) $scenario['losses']) > 0
                    ? ((int) $scenario['secondaryYears']) / count((array) $scenario['losses'])
                    : 0.0,
                'unit' => 'probability',
                'detail' => 'Share of simulated years containing a secondary-loss component.',
            ],
            [
                'code' => 'secondaryLossMagnitude',
                'label' => 'Expected secondary loss per event',
                'value' => (float) ($scenario['materialRateMean'] ?? 0.0) > 0.0
                    ? $expectedSecondary / (float) $scenario['materialRateMean']
                    : 0.0,
                'unit' => 'currency',
                'detail' => 'Allocated consequential share; the allocation is an elicitation assumption.',
            ],
            [
                'code' => 'secondaryLossShare',
                'label' => 'Share of expected annual loss from secondary loss',
                'value' => $expected > 0.0 ? $expectedSecondary / $expected : 0.0,
                'unit' => 'probability',
                'detail' => 'Modelled secondary share of annual total loss.',
            ],
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
     * @param array<string,mixed> $scenario
     * @return array<string,array<string,mixed>>
     */
    private static function posteriorInputSummaries(QkInferenceRepository $inference, array $scenario): array
    {
        $evidenceIds = array_map(
            static fn (array $source): string => (string) ($source['id'] ?? ''),
            (array) ($inference->metadata()['evidenceSources'] ?? [])
        );

        return [
            'threatEventFrequency' => self::posteriorInput(
                'scenarioEventRate',
                (array) $scenario['rateValues'],
                $evidenceIds
            ),
            'susceptibility' => self::posteriorInput(
                'materialLossProbability',
                (array) $scenario['materialProbabilityValues'],
                $evidenceIds
            ),
            'lossMagnitudeAnchor' => self::posteriorInput(
                'positiveEventSeverity',
                (array) $scenario['eventSeverityValues'],
                $evidenceIds
            ),
        ];
    }

    /**
     * @param array<int,float> $values
     * @param array<int,string> $evidenceIds
     * @return array<string,mixed>
     */
    private static function posteriorInput(string $parameter, array $values, array $evidenceIds): array
    {
        $values = array_values(array_map('floatval', $values));
        $sorted = QkPercentile::sorted($values);

        return [
            'kind' => 'posterior',
            'parameter' => $parameter,
            'min' => $sorted === [] ? 0.0 : $sorted[0],
            'mode' => QkPercentile::percentile($sorted, 0.5),
            'max' => $sorted === [] ? 0.0 : $sorted[count($sorted) - 1],
            'components' => [],
            'mean' => QkPercentile::mean($values),
            'standardDeviation' => QkPercentile::standardDeviation($values),
            'q025' => QkPercentile::percentile($sorted, 0.025),
            'q500' => QkPercentile::percentile($sorted, 0.5),
            'q975' => QkPercentile::percentile($sorted, 0.975),
            'draws' => count($values),
            'evidenceIds' => array_values(array_filter($evidenceIds)),
        ];
    }
}
