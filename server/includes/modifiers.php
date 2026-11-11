<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — organisation-profile modifiers.
 *
 * Converts organisation-profile answers into explicit multipliers and widening
 * factors. All modifier values come from the versioned model parameters; none are
 * hard-coded in PHP. The formula stays visible and testable:
 *
 *   $adjustedRange = QkModifiers::applyRange($baseRange, $multiplier, $widen, $clamp);
 */
final class QkModifiers
{
    public const TARGET_FREQUENCY = 'threatEventFrequency';
    public const TARGET_SUSCEPTIBILITY = 'susceptibility';
    public const TARGET_PRIMARY_LOSS = 'primaryLossMagnitude';
    public const TARGET_SECONDARY_PROBABILITY = 'secondaryLossProbability';
    public const TARGET_ANCHOR_FALLBACK = 'disruptionCostAnchorFallback';

    /**
     * Resolves every modifier that applies to a scenario/target pair.
     *
     * @param array<int,array<string,mixed>> $modifiers
     * @param array<string,string> $profileAnswers
     * @return array{multiplier:float,widen:float,applied:array<int,array<string,mixed>>}
     */
    public static function apply(
        array $modifiers,
        array $profileAnswers,
        string $scenarioCode,
        string $target,
        string $unknownCode
    ): array {
        $multiplier = 1.0;
        $widen = 1.0;
        $applied = [];

        foreach ($modifiers as $modifier) {
            if (!is_array($modifier) || ($modifier['target'] ?? null) !== $target) {
                continue;
            }
            if (!self::appliesTo($modifier, $scenarioCode)) {
                continue;
            }
            if (!self::conditionSatisfied($modifier, $profileAnswers, $unknownCode)) {
                continue;
            }

            $questionCode = (string) ($modifier['questionCode'] ?? '');
            $values = (array) ($modifier['values'] ?? []);
            $answerCode = $profileAnswers[$questionCode] ?? $unknownCode;

            $value = $values[$answerCode] ?? null;
            $answerMultiplier = is_numeric($value) ? (float) $value : 1.0;

            $unknownWiden = (float) ($modifier['unknownWiden'] ?? 1.0);
            $answerWiden = ($answerCode === $unknownCode) ? max(1.0, $unknownWiden) : 1.0;

            $multiplier *= $answerMultiplier;
            $widen *= $answerWiden;

            $applied[] = [
                'modifier' => (string) ($modifier['code'] ?? ''),
                'questionCode' => $questionCode,
                'answerCode' => $answerCode,
                'multiplier' => $answerMultiplier,
                'widen' => $answerWiden,
                'unknown' => $answerCode === $unknownCode,
            ];
        }

        return [
            'multiplier' => $multiplier,
            'widen' => $widen,
            'applied' => $applied,
        ];
    }

    /**
     * Applies a multiplier and a widening factor to a (min, mode, max) range and
     * clamps the result. Widening expands the tails around the most-likely value,
     * which is how an Unknown answer expresses additional uncertainty without
     * shifting the answer towards a favourable value.
     *
     * Widening a right-skewed range raises its arithmetic mean, because the upper tail is
     * expanded while the most-likely value is held. Left unbounded this would let an Unknown
     * answer inflate the central estimate rather than merely widen the distribution, which is
     * the defect corrected for the frequency and impact priors in CAL-1.2. To keep the policy
     * consistent, widening is therefore bounded by a mean-shift cap: if widening would move the
     * mean of the range by more than the cap factor, the effective widening is reduced until the
     * mean constraint is satisfied (and never increased above the requested widening).
     *
     * @param array<string,mixed> $range
     * @param array{min:float,max:float} $clamp
     * @param float $meanShiftCap Maximum allowed increase of the mean caused by widening (1.0 disables widening)
     * @return array{min:float,mode:float,max:float}
     */
    public static function applyRange(
        array $range,
        float $multiplier,
        float $widen,
        array $clamp,
        float $meanShiftCap = 1.0
    ): array {
        $min = (float) ($range['min'] ?? 0.0);
        $mode = (float) ($range['mode'] ?? 0.0);
        $max = (float) ($range['max'] ?? 0.0);

        if ($multiplier <= 0.0 || !is_finite($multiplier)) {
            $multiplier = 1.0;
        }
        if ($widen < 1.0 || !is_finite($widen)) {
            $widen = 1.0;
        }
        if ($meanShiftCap < 1.0 || !is_finite($meanShiftCap)) {
            $meanShiftCap = 1.0;
        }

        $build = static function (float $factor) use ($min, $mode, $max, $multiplier, $clamp): array {
            $adjustedMin = QkDistributions::clamp($min * $multiplier / $factor, $clamp['min'], $clamp['max']);
            $adjustedMode = QkDistributions::clamp($mode * $multiplier, $clamp['min'], $clamp['max']);
            $adjustedMax = QkDistributions::clamp($max * $multiplier * $factor, $clamp['min'], $clamp['max']);

            return QkDistributions::normaliseRange($adjustedMin, $adjustedMode, $adjustedMax);
        };

        [$normalisedMin, $normalisedMode, $normalisedMax] = $build(1.0);
        $unwidenMean = ($normalisedMin + $normalisedMode + $normalisedMax) / 3.0;

        if ($widen > 1.0 && $meanShiftCap > 1.0) {
            $allowedMean = $unwidenMean * $meanShiftCap;
            $effective = $widen;
            for ($attempt = 0; $attempt < 60; $attempt++) {
                [$candidateMin, $candidateMode, $candidateMax] = $build($effective);
                $candidateMean = ($candidateMin + $candidateMode + $candidateMax) / 3.0;
                if ($candidateMean <= $allowedMean + 1e-9 || $effective <= 1.0) {
                    $normalisedMin = $candidateMin;
                    $normalisedMode = $candidateMode;
                    $normalisedMax = $candidateMax;
                    break;
                }
                $effective = max(1.0, 1.0 + (($effective - 1.0) * 0.85));
            }
        }

        return ['min' => $normalisedMin, 'mode' => $normalisedMode, 'max' => $normalisedMax];
    }

    /**
     * Multiplies two ranges element-wise. This is a documented interval-arithmetic
     * simplification: it preserves the (min, mode, max) structure rather than
     * deriving an exact distribution for the product.
     *
     * @param array<string,mixed> $left
     * @param array<string,mixed> $right
     * @param array{min:float,max:float} $clamp
     * @return array{min:float,mode:float,max:float}
     */
    public static function multiplyRanges(array $left, array $right, array $clamp): array
    {
        $min = (float) $left['min'] * (float) $right['min'];
        $mode = (float) $left['mode'] * (float) $right['mode'];
        $max = (float) $left['max'] * (float) $right['max'];

        return self::applyRange(
            ['min' => $min, 'mode' => $mode, 'max' => $max],
            1.0,
            1.0,
            $clamp
        );
    }

    /**
     * @param array<string,mixed> $modifier
     */
    private static function appliesTo(array $modifier, string $scenarioCode): bool
    {
        foreach ((array) ($modifier['appliesTo'] ?? []) as $code) {
            if ($code === 'ALL' || $code === $scenarioCode) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param array<string,mixed> $modifier
     * @param array<string,string> $profileAnswers
     */
    private static function conditionSatisfied(array $modifier, array $profileAnswers, string $unknownCode): bool
    {
        $condition = $modifier['condition'] ?? null;
        if (!is_array($condition)) {
            return true;
        }

        $questionUnknown = $condition['questionUnknown'] ?? null;
        if (is_string($questionUnknown) && $questionUnknown !== '') {
            $answer = $profileAnswers[$questionUnknown] ?? $unknownCode;

            return $answer === $unknownCode;
        }

        return true;
    }
}
