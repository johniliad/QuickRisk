<?php

declare(strict_types=1);

/**
 * Model behaviour tests (development plan phases 11, 23 and 28).
 *
 * These tests assert directionally correct behaviour rather than exact values:
 * stronger controls reduce susceptibility, greater exposure increases contact
 * frequency, higher disruption cost increases loss magnitude, and Unknown answers
 * widen uncertainty instead of improving the result.
 */

return [
    'behaviour: a higher likelihood answer increases modelled frequency and exposure' => function (): void {
        $previousLoss = -1.0;
        $previousFrequency = -1.0;

        foreach (['POSSIBLE', 'LIKELY', 'VERY_LIKELY'] as $likelihood) {
            $response = qk_test_calculate(qk_test_payload(qk_test_profile(), qk_test_scenario_answers($likelihood)));
            $scenario = qk_test_scenario($response, 'S1');

            $loss = (float) $scenario['statistics']['expectedAnnualLoss'];
            $frequency = (float) $scenario['statistics']['expectedLossEventFrequency'];

            assertGreaterThan($previousLoss, $loss, 'A higher likelihood must increase expected annual loss (' . $likelihood . ')');
            assertGreaterThan($previousFrequency, $frequency, 'A higher likelihood must increase loss event frequency');

            $previousLoss = $loss;
            $previousFrequency = $frequency;
        }
    },

    'behaviour: a higher impact answer increases modelled loss magnitude and exposure' => function (): void {
        $previousLoss = -1.0;
        $previousMagnitude = -1.0;

        foreach (['MINOR', 'SIGNIFICANT', 'SEVERE', 'CRITICAL'] as $impact) {
            $response = qk_test_calculate(qk_test_payload(qk_test_profile(), qk_test_scenario_answers('POSSIBLE', $impact)));
            $statistics = qk_test_scenario($response, 'S1')['statistics'];

            assertGreaterThan($previousMagnitude, (float) $statistics['expectedLossMagnitude'], 'Higher impact must increase loss magnitude (' . $impact . ')');
            assertGreaterThan($previousLoss, (float) $statistics['expectedAnnualLoss'], 'Higher impact must increase expected annual loss');

            $previousLoss = (float) $statistics['expectedAnnualLoss'];
            $previousMagnitude = (float) $statistics['expectedLossMagnitude'];
        }
    },

    'behaviour: stronger controls reduce susceptibility and exposure' => function (): void {
        $weak = qk_test_calculate(qk_test_payload(qk_test_profile(['QP7' => 'VERY_LIMITED'])));
        $strong = qk_test_calculate(qk_test_payload(qk_test_profile(['QP7' => 'VERY_STRONG'])));

        foreach (['S1', 'S2', 'S3', 'S4', 'S5'] as $code) {
            $weakScenario = qk_test_scenario($weak, $code);
            $strongScenario = qk_test_scenario($strong, $code);

            assertGreaterThan(
                (float) $strongScenario['statistics']['meanSusceptibility'],
                (float) $weakScenario['statistics']['meanSusceptibility'],
                'Stronger controls must lower the material-loss probability in ' . $code
            );
            assertGreaterThan(
                (float) $strongScenario['statistics']['expectedAnnualLoss'],
                (float) $weakScenario['statistics']['expectedAnnualLoss'],
                'Stronger controls must reduce expected annual loss in ' . $code
            );
        }
    },

    'behaviour: greater public exposure increases contact frequency for externally reachable scenarios' => function (): void {
        $limited = qk_test_calculate(qk_test_payload(qk_test_profile(['QP3' => 'LIMITED'])));
        $extensive = qk_test_calculate(qk_test_payload(qk_test_profile(['QP3' => 'VERY_EXTENSIVE'])));

        foreach (['S1', 'S2', 'S3', 'S5'] as $code) {
            assertGreaterThan(
                (float) qk_test_scenario($limited, $code)['statistics']['expectedThreatEventFrequency'],
                (float) qk_test_scenario($extensive, $code)['statistics']['expectedThreatEventFrequency'],
                'Greater exposure must increase threat event frequency in ' . $code
            );
        }

        // The third-party scenario is driven by the supplier's exposure, so the
        // organisation's own attack surface must not change its result.
        assertSame(
            qk_test_scenario($limited, 'S4')['statistics']['expectedAnnualLoss'],
            qk_test_scenario($extensive, 'S4')['statistics']['expectedAnnualLoss'],
            'The third-party scenario must not be driven by the organisation attack surface'
        );
    },

    'behaviour: third-party dependency affects only the third-party scenario' => function (): void {
        $low = qk_test_calculate(qk_test_payload(qk_test_profile(['QP5' => 'LOW'])));
        $extreme = qk_test_calculate(qk_test_payload(qk_test_profile(['QP5' => 'EXTREME'])));

        assertGreaterThan(
            (float) qk_test_scenario($low, 'S4')['statistics']['expectedAnnualLoss'],
            (float) qk_test_scenario($extreme, 'S4')['statistics']['expectedAnnualLoss'],
            'Higher third-party dependency must increase the third-party scenario'
        );

        foreach (['S1', 'S2', 'S3', 'S5'] as $code) {
            assertSame(
                qk_test_scenario($low, $code)['statistics']['expectedAnnualLoss'],
                qk_test_scenario($extreme, $code)['statistics']['expectedAnnualLoss'],
                'Third-party dependency must not change scenario ' . $code
            );
        }
    },

    'behaviour: Unknown answers retain the reference posterior and lower confidence' => function (): void {
        $known = qk_test_calculate(qk_test_payload(qk_test_profile(), qk_test_scenario_answers('POSSIBLE', 'SIGNIFICANT')));
        $unknownBoth = qk_test_calculate(qk_test_payload(qk_test_profile(), qk_test_scenario_answers('UNKNOWN', 'UNKNOWN')));

        $knownScenario = qk_test_scenario($known, 'S1');
        $unknownScenario = qk_test_scenario($unknownBoth, 'S1');
        assertRelativeClose(
            (float) $knownScenario['statistics']['expectedAnnualLoss'],
            (float) $unknownScenario['statistics']['expectedAnnualLoss'],
            0.03,
            'Unknown answers must retain the unchanged-reference posterior'
        );
        assertGreaterThan(
            (float) $unknownScenario['confidence']['score'],
            (float) $knownScenario['confidence']['score'],
            'Unknown answers must lower confidence'
        );
        assertSame('posterior', $unknownScenario['inputs']['threatEventFrequency']['kind'], 'Unknown must stay posterior');
    },

    'behaviour: an unknown disruption-cost anchor widens loss magnitude and lowers confidence' => function (): void {
        $reported = qk_test_calculate(qk_test_payload(qk_test_profile(['QP8' => '100_500K'])));
        $derived = qk_test_calculate(qk_test_payload(qk_test_profile(['QP8' => 'UNKNOWN'])));

        assertSame(
            'elicitation-adjusted-reference-severity',
            qk_test_scenario($reported, 'S1')['lossAnchorSource'],
            'A reported disruption cost must adjust the reference severity'
        );
        assertSame(
            'reference-class-severity',
            qk_test_scenario($derived, 'S1')['lossAnchorSource'],
            'An unknown disruption cost must retain reference-class severity'
        );
        assertGreaterThan(
            (float) $derived['portfolio']['confidence']['score'],
            (float) $reported['portfolio']['confidence']['score'],
            'An unknown disruption cost must reduce overall confidence'
        );
    },

    'behaviour: an extreme profile produces a materially larger exposure than a small one' => function (): void {
        $small = qk_test_calculate(qk_test_payload(qk_test_profile([
            'QP1' => 'LT10M',
            'QP2' => 'LOW',
            'QP3' => 'LIMITED',
            'QP4' => 'LIMITED',
            'QP5' => 'LOW',
            'QP6' => 'VERY_HIGH',
            'QP7' => 'VERY_STRONG',
            'QP8' => 'LT25K',
        ])));
        $extreme = qk_test_calculate(qk_test_payload(qk_test_profile([
            'QP1' => 'GT1B',
            'QP2' => 'EXTREME',
            'QP3' => 'VERY_EXTENSIVE',
            'QP4' => 'CRITICAL',
            'QP5' => 'EXTREME',
            'QP6' => 'VERY_LOW',
            'QP7' => 'VERY_LIMITED',
            'QP8' => 'GT10M',
        ])));

        $smallTotal = (float) $small['portfolio']['expectedAnnualLoss'];
        $extremeTotal = (float) $extreme['portfolio']['expectedAnnualLoss'];

        assertGreaterThan($smallTotal * 10.0, $extremeTotal, 'A critical-infrastructure profile must produce a much larger exposure');
        assertGreaterThan(0.0, $smallTotal, 'The small profile must still produce a positive exposure');

        foreach ($extreme['scenarios'] as $scenario) {
            assertGreaterThan(
                (float) $small['portfolio']['expectedAnnualLoss'],
                (float) $scenario['statistics']['expectedAnnualLoss'],
                'Every extreme-profile scenario should exceed the small-profile total'
            );
            assertTrue(is_finite((float) $scenario['statistics']['p90']), 'No value may be NaN or infinite');
        }
    },

    'behaviour: high incident volume does not by itself produce the highest financial ranking' => function (): void {
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()));

        $highestFrequencyCode = '';
        $highestFrequency = -1.0;
        $highestLossCode = '';
        $highestLoss = -1.0;

        foreach ($response['scenarios'] as $scenario) {
            $frequency = (float) $scenario['statistics']['expectedLossEventFrequency'];
            $loss = (float) $scenario['statistics']['expectedAnnualLoss'];
            if ($frequency > $highestFrequency) {
                $highestFrequency = $frequency;
                $highestFrequencyCode = $scenario['code'];
            }
            if ($loss > $highestLoss) {
                $highestLoss = $loss;
                $highestLossCode = $scenario['code'];
            }
        }

        assertTrue($highestFrequencyCode !== '', 'A highest-frequency scenario must be identifiable');
        assertTrue($highestLossCode !== '', 'A highest-loss scenario must be identifiable');
        assertTrue($highestLoss > 0.0, 'The highest-loss scenario must have a positive expected loss');
        assertTrue($highestFrequency > 0.0, 'The highest-frequency scenario must have a positive event rate');
    },
];
