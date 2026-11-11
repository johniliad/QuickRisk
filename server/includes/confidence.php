<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — input-confidence scoring.
 *
 * This is a heuristic indicator of answer completeness, answer availability and the width of
 * the resulting distribution. It is deliberately NOT statistical confidence, NOT a confidence
 * interval and NOT a probability that the result is correct. Every response reports that basis
 * explicitly (basis = heuristic-input-quality, isStatisticalConfidence = false).
 *
 * While the calibration remains provisional the highest available level is capped at the
 * configured maximum, because the calibration values are heuristic and have not been
 * externally validated. All weights, thresholds and the cap come from the versioned model.
 */
final class QkConfidence
{
    public const LEVEL_HIGH = 'High';
    public const LEVEL_MEDIUM = 'Medium';
    public const LEVEL_LOW = 'Low';

    /**
     * @param array<string,mixed> $signals
     * @param array<string,mixed> $parameters
     * @return array{score:int,level:string,reasons:array<int,string>}
     */
    public static function scenario(array $signals, array $parameters): array
    {
        $config = (array) ($parameters['confidence'] ?? []);
        $penalties = (array) ($config['penalties'] ?? []);
        $thresholds = (array) ($config['thresholds'] ?? []);
        $widthThresholds = (array) ($config['distributionWidthThresholds'] ?? []);

        $score = (int) ($config['baseScore'] ?? 100);
        $reasons = [];

        $frequencyUnknown = ($signals['frequencyUnknown'] ?? false) === true;
        $impactUnknown = ($signals['impactUnknown'] ?? false) === true;
        $profileUnknownCount = max(0, (int) ($signals['profileUnknownCount'] ?? 0));
        $disruptionCostUnknown = ($signals['disruptionCostUnknown'] ?? false) === true;
        $coefficientOfVariation = (float) ($signals['coefficientOfVariation'] ?? 0.0);
        $releaseStatus = (string) ($signals['releaseStatus'] ?? '');

        if ($frequencyUnknown) {
            $score -= (int) ($penalties['frequencyUnknown'] ?? 0);
            $reasons[] = 'The likelihood answer for this scenario was Unknown, so the modelled frequency range is deliberately wide.';
        }
        if ($impactUnknown) {
            $score -= (int) ($penalties['impactUnknown'] ?? 0);
            $reasons[] = 'The impact answer for this scenario was Unknown, so the modelled loss range is deliberately wide.';
        }
        if ($disruptionCostUnknown) {
            $score -= (int) ($penalties['disruptionCostUnknown'] ?? 0);
            $reasons[] = 'The daily disruption-cost anchor was not provided, so loss magnitude was derived from a wider prior.';
        }
        if ($profileUnknownCount > 0) {
            $score -= $profileUnknownCount * (int) ($penalties['profileUnknown'] ?? 0);
            $reasons[] = $profileUnknownCount === 1
                ? 'One organisation-profile answer was Unknown.'
                : $profileUnknownCount . ' organisation-profile answers were Unknown.';
        }

        $veryWide = (float) ($widthThresholds['veryWide'] ?? 2.0);
        $wide = (float) ($widthThresholds['wide'] ?? 1.2);
        if ($coefficientOfVariation >= $veryWide) {
            $score -= (int) ($penalties['veryWideDistribution'] ?? 0);
            $reasons[] = 'The simulated loss distribution is very wide relative to its average.';
        } elseif ($coefficientOfVariation >= $wide) {
            $score -= (int) ($penalties['wideDistribution'] ?? 0);
            $reasons[] = 'The simulated loss distribution is wide relative to its average.';
        }

        $provisionalStatuses = (array) ($config['provisionalCalibrationStatuses'] ?? []);
        $isProvisional = in_array($releaseStatus, $provisionalStatuses, true);
        if ($isProvisional) {
            $score -= (int) ($penalties['provisionalCalibrationStatus'] ?? 0);
            $reasons[] = 'The active calibration is provisional: its values are heuristics and have not been externally validated.';
        }

        $score = max(0, min(100, $score));

        $high = (int) ($thresholds['high'] ?? 85);
        $medium = (int) ($thresholds['medium'] ?? 62);
        $level = $score >= $high ? self::LEVEL_HIGH : ($score >= $medium ? self::LEVEL_MEDIUM : self::LEVEL_LOW);

        $levelCapApplied = false;
        $maximumLevel = (string) ($config['maxLevelWhenProvisional'] ?? '');
        if ($isProvisional && $maximumLevel !== '' && self::levelRank($level) > self::levelRank($maximumLevel)) {
            $level = $maximumLevel;
            $levelCapApplied = true;
            $reasons[] = 'The highest available level is capped at ' . $maximumLevel
                . ' while the calibration remains provisional.';
        }

        if ($reasons === []) {
            $reasons[] = 'All required answers were provided and the simulated distribution is reasonably contained.';
        }

        return self::presentation($score, $level, $reasons, $config, $levelCapApplied, $maximumLevel);
    }

    /**
     * Overall input confidence is the mean of the scenario scores, rounded. It is not
     * exposure-weighted, so it describes input quality rather than the size of the result. The
     * same provisional cap applies.
     *
     * @param array<int,array{score:int,level:string}> $scenarioScores
     * @param array<string,mixed> $parameters
     * @return array<string,mixed>
     */
    public static function overall(array $scenarioScores, array $parameters, string $releaseStatus = ''): array
    {
        $config = (array) ($parameters['confidence'] ?? []);
        $thresholds = (array) ($config['thresholds'] ?? []);

        if ($scenarioScores === []) {
            return self::presentation(0, self::LEVEL_LOW, ['No scenario results were available to assess input confidence.'], $config, false, '');
        }

        $total = 0;
        foreach ($scenarioScores as $entry) {
            $total += (int) ($entry['score'] ?? 0);
        }
        $score = max(0, min(100, (int) round($total / count($scenarioScores))));

        $high = (int) ($thresholds['high'] ?? 85);
        $medium = (int) ($thresholds['medium'] ?? 62);
        $level = $score >= $high ? self::LEVEL_HIGH : ($score >= $medium ? self::LEVEL_MEDIUM : self::LEVEL_LOW);

        $reasons = ['Overall input confidence is the average of the five scenario input-confidence scores.'];
        if ($level === self::LEVEL_LOW) {
            $reasons[] = 'Several answers were Unknown or the modelled ranges are wide, so the result should be treated as a directional indication only.';
        } elseif ($level === self::LEVEL_MEDIUM) {
            $reasons[] = 'Some uncertainty remains in the inputs or the calibration, so the range should be read as indicative.';
        }

        $levelCapApplied = false;
        $maximumLevel = (string) ($config['maxLevelWhenProvisional'] ?? '');
        $provisionalStatuses = (array) ($config['provisionalCalibrationStatuses'] ?? []);
        if (
            in_array($releaseStatus, $provisionalStatuses, true)
            && $maximumLevel !== ''
            && self::levelRank($level) > self::levelRank($maximumLevel)
        ) {
            $level = $maximumLevel;
            $levelCapApplied = true;
            $reasons[] = 'The highest available level is capped at ' . $maximumLevel
                . ' while the calibration remains provisional.';
        }

        return self::presentation($score, $level, $reasons, $config, $levelCapApplied, $maximumLevel);
    }

    /**
     * @param array<int,string> $reasons
     * @param array<string,mixed> $config
     * @return array<string,mixed>
     */
    private static function presentation(
        int $score,
        string $level,
        array $reasons,
        array $config,
        bool $levelCapApplied,
        string $maximumLevel
    ): array {
        return [
            'score' => $score,
            'level' => $level,
            'reasons' => $reasons,
            'basis' => (string) ($config['basis'] ?? 'heuristic-input-quality'),
            'isStatisticalConfidence' => (bool) ($config['isStatisticalConfidence'] ?? false),
            'displayLabel' => (string) ($config['displayLabel'] ?? 'Input confidence'),
            'levelCapApplied' => $levelCapApplied,
            'maximumLevelWhenProvisional' => $maximumLevel,
        ];
    }

    private static function levelRank(string $level): int
    {
        return match ($level) {
            self::LEVEL_HIGH => 3,
            self::LEVEL_MEDIUM => 2,
            default => 1,
        };
    }
}
