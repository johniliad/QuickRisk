<?php

declare(strict_types=1);

/**
 * Distribution utility tests (development plan phase 4).
 *
 * Required behaviour: every result lies between the bounds, the empirical
 * distribution is concentrated around the mode, the empirical mean approaches the
 * theoretical expectation, and no NaN/INF values are produced.
 */

return [
    'distributions: triangular(0,5,10) stays within bounds and is always finite' => function (): void {
        $rng = new QkDistributions(12345);
        $count = 0;
        $minimum = INF;
        $maximum = -INF;

        for ($i = 0; $i < 200000; $i++) {
            $value = $rng->sampleTriangular(0.0, 5.0, 10.0);
            if (!is_finite($value)) {
                qk_fail('A triangular sample was not finite.');
            }
            if ($value < 0.0 || $value > 10.0) {
                qk_fail('A triangular sample fell outside [0, 10]: ' . $value);
            }
            $minimum = min($minimum, $value);
            $maximum = max($maximum, $value);
            $count++;
        }

        assertSame(200000, $count, 'Every draw should be counted');
        assertBetween($minimum, 0.0, 10.0, 'Minimum sample must be in range');
        assertBetween($maximum, 0.0, 10.0, 'Maximum sample must be in range');
    },

    'distributions: triangular mean approaches the theoretical expectation' => function (): void {
        $rng = new QkDistributions(777);
        $total = 0.0;
        $draws = 200000;

        for ($i = 0; $i < $draws; $i++) {
            $total += $rng->sampleTriangular(0.0, 5.0, 10.0);
        }

        $mean = $total / $draws;
        $theoretical = QkDistributions::triangularMean(0.0, 5.0, 10.0);

        assertClose(5.0, $theoretical, 1e-9, 'Theoretical mean should be 5.0');
        assertClose($theoretical, $mean, 0.03, 'Empirical mean should approach the theoretical mean');
    },

    'distributions: triangular dispersion matches the theoretical variance' => function (): void {
        $rng = new QkDistributions(4242);
        $draws = 200000;
        $values = [];

        for ($i = 0; $i < $draws; $i++) {
            $values[] = $rng->sampleTriangular(0.0, 5.0, 10.0);
        }

        $theoreticalVariance = QkDistributions::triangularVariance(0.0, 5.0, 10.0);
        $empiricalSd = QkPercentile::standardDeviation($values);

        assertClose(sqrt($theoreticalVariance), $empiricalSd, 0.05, 'Empirical dispersion should match the theoretical value');
    },

    'distributions: draws are concentrated around the mode' => function (): void {
        $rng = new QkDistributions(2024);
        $draws = 100000;
        $nearMode = 0;

        for ($i = 0; $i < $draws; $i++) {
            $value = $rng->sampleTriangular(0.0, 5.0, 10.0);
            if ($value >= 3.0 && $value <= 7.0) {
                $nearMode++;
            }
        }

        // Theoretical P(3 <= X <= 7) for triangular(0, 5, 10) is 0.64.
        $proportion = $nearMode / $draws;
        assertClose(0.64, $proportion, 0.02, 'Most draws should be near the mode');
        assertGreaterThan(0.55, $proportion, 'Mode concentration should be visible');
    },

    'distributions: degenerate and boundary-mode ranges cannot produce invalid values' => function (): void {
        $rng = new QkDistributions(99);

        foreach ([
            [5.0, 5.0, 5.0],
            [0.0, 0.0, 10.0],
            [0.0, 10.0, 10.0],
            [10.0, 0.0, 0.0],
        ] as $range) {
            for ($i = 0; $i < 5000; $i++) {
                $value = $rng->sampleTriangular($range[0], $range[1], $range[2]);
                $low = min($range);
                $high = max($range);
                if (!is_finite($value) || $value < $low || $value > $high) {
                    qk_fail('A degenerate triangular range produced an invalid value: ' . var_export($value, true));
                }
            }
        }
    },

    'distributions: a fixed seed reproduces the same sequence and a different seed does not' => function (): void {
        $drawSequence = static function (int $seed, int $count): array {
            $rng = new QkDistributions($seed);
            $sequence = [];
            for ($i = 0; $i < $count; $i++) {
                $sequence[] = $rng->sampleTriangular(0.0, 5.0, 10.0);
            }

            return $sequence;
        };

        $first = $drawSequence(555, 25);
        $second = $drawSequence(555, 25);
        $third = $drawSequence(556, 25);

        assertSame($first, $second, 'The same seed must reproduce the same sequence');
        assertTrue($first !== $third, 'A different seed must produce a different sequence');
        assertSame($first, $drawSequence(555, 25), 'Re-seeding must reset the sequence deterministically');
    },

    'distributions: bernoulli honours its probability and its boundaries' => function (): void {
        $rng = new QkDistributions(31337);
        $draws = 100000;
        $hits = 0;

        for ($i = 0; $i < $draws; $i++) {
            if ($rng->sampleBernoulli(0.35)) {
                $hits++;
            }
        }

        assertClose(0.35, $hits / $draws, 0.01, 'Bernoulli draws should match the supplied probability');

        for ($i = 0; $i < 100; $i++) {
            assertFalse($rng->sampleBernoulli(0.0), 'A zero probability must never draw true');
            assertTrue($rng->sampleBernoulli(1.0), 'A probability of one must always draw true');
        }

        assertFalse($rng->sampleBernoulli(NAN), 'A non-finite probability must not draw true');
    },

    'distributions: PERT sampler is bounded, finite and centred on its mode' => function (): void {
        $rng = new QkDistributions(8080);
        $draws = 50000;
        $total = 0.0;

        for ($i = 0; $i < $draws; $i++) {
            $value = $rng->samplePert(0.0, 5.0, 10.0, 4.0);
            if (!is_finite($value) || $value < 0.0 || $value > 10.0) {
                qk_fail('A PERT sample was invalid: ' . var_export($value, true));
            }
            $total += $value;
        }

        // Modified PERT mean is (min + lambda * mode + max) / (lambda + 2).
        assertClose(5.0, $total / $draws, 0.06, 'PERT mean should approach the theoretical value');
    },

    'distributions: clamping and range normalisation are stable' => function (): void {
        assertSame(2.0, QkDistributions::clamp(5.0, 1.0, 2.0), 'Clamp should cap at the maximum');
        assertSame(1.0, QkDistributions::clamp(0.0, 1.0, 2.0), 'Clamp should raise to the minimum');

        [$min, $mode, $max] = QkDistributions::normaliseRange(10.0, 3.0, 0.0);
        assertSame(0.0, $min, 'Reversed bounds should be swapped');
        assertSame(10.0, $max, 'Reversed bounds should be swapped');
        assertBetween($mode, 0.0, 10.0, 'The mode must be clamped into the bounds');

        assertThrows(
            static fn () => QkDistributions::normaliseRange(NAN, 1.0, 2.0),
            InvalidArgumentException::class,
            'A non-finite range must be rejected'
        );
    },
];
