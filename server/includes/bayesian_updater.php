<?php

declare(strict_types=1);

require_once __DIR__ . '/distributions.php';

/**
 * Likelihood-weighted posterior updating for the single optional incident count.
 */
final class QkBayesianUpdater
{
    /**
     * @param array<int,array<string,mixed>> $draws
     * @return array{draws:array<int,array<string,mixed>>,metadata:array<string,mixed>}
     */
    public static function update(
        array $draws,
        ?int $materialLossEventCount,
        int $outputCount,
        QkDistributions $rng
    ): array {
        if ($draws === []) {
            throw new InvalidArgumentException('Posterior draws are empty.');
        }
        $outputCount = max(1, $outputCount);
        if ($materialLossEventCount === null) {
            return [
                'draws' => self::cycle($draws, $outputCount),
                'metadata' => [
                    'evidenceUsed' => false,
                    'materialLossEventCount' => null,
                    'effectiveSampleSize' => (float) count($draws),
                ],
            ];
        }
        if ($materialLossEventCount < 0) {
            throw new InvalidArgumentException('Material loss event count cannot be negative.');
        }

        $logWeights = [];
        $maximum = -INF;
        foreach ($draws as $draw) {
            $logWeight = self::logLikelihood($draw, $materialLossEventCount);
            $logWeights[] = $logWeight;
            $maximum = max($maximum, $logWeight);
        }
        $weights = [];
        $total = 0.0;
        foreach ($logWeights as $logWeight) {
            $weight = exp($logWeight - $maximum);
            $weights[] = $weight;
            $total += $weight;
        }
        if ($total <= 0.0 || !is_finite($total)) {
            throw new RuntimeException('Posterior likelihood weights are not finite.');
        }
        foreach ($weights as $index => $weight) {
            $weights[$index] = $weight / $total;
        }
        $ess = self::effectiveSampleSize($weights);

        return [
            'draws' => self::systematicResample($weights, $draws, $outputCount, $rng->uniform()),
            'metadata' => [
                'evidenceUsed' => true,
                'materialLossEventCount' => $materialLossEventCount,
                'effectiveSampleSize' => $ess,
                'lowEffectiveSampleSize' => $ess < max(30.0, 0.1 * count($draws)),
            ],
        ];
    }

    /** @param array<string,mixed> $draw */
    private static function logLikelihood(array $draw, int $count): float
    {
        $rate = max(1.0e-12, (float) $draw['attackRate'] * (float) $draw['materialProbability']);

        return (-$rate + $count * log($rate)) - self::logFactorial($count);
    }

    /** @param array<int,float> $weights */
    public static function effectiveSampleSize(array $weights): float
    {
        $sum = 0.0;
        $sumSquares = 0.0;
        foreach ($weights as $weight) {
            $sum += $weight;
            $sumSquares += $weight * $weight;
        }

        return $sumSquares > 0.0 ? ($sum * $sum) / $sumSquares : 0.0;
    }

    /**
     * @param array<int,float> $weights
     * @param array<int,array<string,mixed>> $draws
     * @return array<int,array<string,mixed>>
     */
    private static function systematicResample(
        array $weights,
        array $draws,
        int $outputCount,
        float $uniform
    ): array {
        $output = [];
        $count = count($draws);
        $position = $uniform / $outputCount;
        $cumulative = (float) $weights[0];
        $index = 0;
        for ($sample = 0; $sample < $outputCount; $sample++) {
            while ($position > $cumulative && $index < $count - 1) {
                $index++;
                $cumulative += (float) $weights[$index];
            }
            $output[] = $draws[$index];
            $position += 1.0 / $outputCount;
        }

        return $output;
    }

    /**
     * @param array<int,array<string,mixed>> $draws
     * @return array<int,array<string,mixed>>
     */
    private static function cycle(array $draws, int $outputCount): array
    {
        $output = [];
        $count = count($draws);
        for ($index = 0; $index < $outputCount; $index++) {
            $output[] = $draws[$index % $count];
        }

        return $output;
    }

    private static function logFactorial(int $value): float
    {
        $total = 0.0;
        for ($index = 2; $index <= $value; $index++) {
            $total += log($index);
        }

        return $total;
    }
}
