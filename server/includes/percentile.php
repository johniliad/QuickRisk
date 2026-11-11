<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — percentile and summary statistics.
 *
 * All functions operate on plain float arrays held in memory for the duration of
 * a single request. Nothing here writes to disk.
 */
final class QkPercentile
{
    /**
     * Returns a sorted copy (ascending) of the supplied observations.
     *
     * @param array<int,float> $values
     * @return array<int,float>
     */
    public static function sorted(array $values): array
    {
        $copy = array_values($values);
        sort($copy, SORT_REGULAR);

        return $copy;
    }

    /**
     * Linear-interpolation percentile of an already-sorted array.
     *
     * @param array<int,float> $sortedValues
     */
    public static function percentile(array $sortedValues, float $p): float
    {
        $count = count($sortedValues);
        if ($count === 0) {
            return 0.0;
        }
        if ($count === 1) {
            return (float) $sortedValues[0];
        }

        $p = QkDistributions::clamp($p, 0.0, 1.0);
        $position = $p * ($count - 1);
        $lower = (int) floor($position);
        $upper = (int) ceil($position);

        if ($lower === $upper) {
            return (float) $sortedValues[$lower];
        }

        $fraction = $position - $lower;
        $value = (float) $sortedValues[$lower]
            + $fraction * ((float) $sortedValues[$upper] - (float) $sortedValues[$lower]);

        return is_finite($value) ? $value : (float) $sortedValues[$lower];
    }

    /**
     * Share of observations strictly greater than the threshold.
     *
     * @param array<int,float> $sortedValues
     */
    public static function probabilityGreaterThan(array $sortedValues, float $threshold): float
    {
        $count = count($sortedValues);
        if ($count === 0) {
            return 0.0;
        }

        $low = 0;
        $high = $count;
        while ($low < $high) {
            $mid = intdiv($low + $high, 2);
            if ((float) $sortedValues[$mid] > $threshold) {
                $high = $mid;
            } else {
                $low = $mid + 1;
            }
        }

        return ($count - $low) / $count;
    }

    /**
     * @param array<int,float> $values
     */
    public static function mean(array $values): float
    {
        $count = count($values);
        if ($count === 0) {
            return 0.0;
        }

        return array_sum($values) / $count;
    }

    /**
     * Population standard deviation.
     *
     * @param array<int,float> $values
     */
    public static function standardDeviation(array $values): float
    {
        $count = count($values);
        if ($count < 2) {
            return 0.0;
        }

        $mean = self::mean($values);
        $sumSquares = 0.0;
        foreach ($values as $value) {
            $delta = $value - $mean;
            $sumSquares += $delta * $delta;
        }

        $variance = $sumSquares / $count;

        return $variance > 0.0 ? sqrt($variance) : 0.0;
    }

    /**
     * Builds a fixed-width histogram for chart rendering.
     *
     * The final bin is an overflow bin that collects every observation greater
     * than or equal to the upper bound, so the counts always sum to the number of
     * observations and no tail information is silently discarded.
     *
     * @param array<int,float> $values
     * @return array{binEdges:array<int,float>,counts:array<int,int>,overflowFrom:float,overflowCount:int,binWidth:float}
     */
    public static function histogram(array $values, float $upperBound, int $bins): array
    {
        $bins = max(1, $bins);
        $count = count($values);

        if ($count === 0) {
            return [
                'binEdges' => [],
                'counts' => [],
                'overflowFrom' => 0.0,
                'overflowCount' => 0,
                'binWidth' => 0.0,
            ];
        }

        if (!is_finite($upperBound) || $upperBound <= 0.0) {
            $upperBound = max(1.0, (float) max($values));
        }

        $binWidth = $upperBound / $bins;
        $counts = array_fill(0, $bins, 0);
        $overflowCount = 0;

        foreach ($values as $value) {
            if ($value >= $upperBound) {
                $overflowCount++;
                continue;
            }
            $index = (int) floor($value / $binWidth);
            if ($index < 0) {
                $index = 0;
            }
            if ($index >= $bins) {
                $index = $bins - 1;
            }
            $counts[$index]++;
        }

        $edges = [];
        for ($i = 0; $i <= $bins; $i++) {
            $edges[] = round($i * $binWidth, 2);
        }

        return [
            'binEdges' => $edges,
            'counts' => $counts,
            'overflowFrom' => round($upperBound, 2),
            'overflowCount' => $overflowCount,
            'binWidth' => round($binWidth, 2),
        ];
    }

    /**
     * Coefficient of variation, used as the distribution-width signal for the
     * confidence indicator. Returns 0.0 when the mean is not positive.
     *
     * @param array<int,float> $values
     */
    public static function coefficientOfVariation(array $values): float
    {
        $mean = self::mean($values);
        if ($mean <= 0.0) {
            return 0.0;
        }

        return self::standardDeviation($values) / $mean;
    }
}
