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
                'Stronger controls must raise modelled resistance in ' . $code
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

    'behaviour: an Unknown answer widens the range and lowers confidence without improving the result' => function (): void {
        $known = qk_test_calculate(qk_test_payload(qk_test_profile(), qk_test_scenario_answers('UNLIKELY', 'MODERATE')));
        $unknownFrequency = qk_test_calculate(qk_test_payload(qk_test_profile(), qk_test_scenario_answers('UNKNOWN', 'MODERATE')));
        $unknownBoth = qk_test_calculate(qk_test_payload(qk_test_profile(), qk_test_scenario_answers('UNKNOWN', 'UNKNOWN')));

        $knownScenario = qk_test_scenario($known, 'S1');
        $frequencyScenario = qk_test_scenario($unknownFrequency, 'S1');
        $bothScenario = qk_test_scenario($unknownBoth, 'S1');

        $knownSpread = (float) $knownScenario['statistics']['p90'] - (float) $knownScenario['statistics']['p10'];
        $frequencySpread = (float) $frequencyScenario['statistics']['p90'] - (float) $frequencyScenario['statistics']['p10'];
        $bothSpread = (float) $bothScenario['statistics']['p90'] - (float) $bothScenario['statistics']['p10'];

        assertGreaterThan($knownSpread, $frequencySpread, 'An Unknown likelihood must widen the modelled range');
        assertGreaterThan($frequencySpread, $bothSpread, 'Two Unknown answers must widen the range further');

        assertGreaterThan(
            (float) $frequencyScenario['confidence']['score'],
            (float) $knownScenario['confidence']['score'],
            'An Unknown likelihood must reduce confidence'
        );
        assertGreaterThan(
            (float) $bothScenario['confidence']['score'],
            (float) $frequencyScenario['confidence']['score'],
            'Two Unknown answers must reduce confidence further'
        );

        // "Not favourable" is expressed as: the modelled mean must not fall below
        // the known-answer case, and the low end must not improve dramatically.
        assertTrue(
            (float) $frequencyScenario['statistics']['expectedAnnualLoss'] >= (float) $knownScenario['statistics']['expectedAnnualLoss'],
            'An Unknown answer must not reduce expected annual loss'
        );
        assertTrue(
            (float) $frequencyScenario['statistics']['p10'] >= (float) $knownScenario['statistics']['p10'] * 0.5,
            'An Unknown answer must not dramatically improve the low end'
        );
    },

    'behaviour: an unknown disruption-cost anchor widens loss magnitude and lowers confidence' => function (): void {
        $reported = qk_test_calculate(qk_test_payload(qk_test_profile(['QP8' => '100_500K'])));
        $derived = qk_test_calculate(qk_test_payload(qk_test_profile(['QP8' => 'UNKNOWN'])));

        assertSame(
            'reported-daily-disruption-cost',
            qk_test_scenario($reported, 'S1')['lossAnchorSource'],
            'A reported disruption cost must be used directly'
        );
        assertSame(
            'derived-from-profile',
            qk_test_scenario($derived, 'S1')['lossAnchorSource'],
            'An unknown disruption cost must be derived from the profile'
        );

        $reportedSpread = (float) qk_test_scenario($reported, 'S1')['statistics']['p90']
            - (float) qk_test_scenario($reported, 'S1')['statistics']['p10'];
        $derivedSpread = (float) qk_test_scenario($derived, 'S1')['statistics']['p90']
            - (float) qk_test_scenario($derived, 'S1')['statistics']['p10'];

        assertGreaterThan($reportedSpread, $derivedSpread, 'A derived anchor must be wider than a reported one');
        assertGreaterThan(
            (float) $derived['portfolio']['confidence']['score'],
            (float) $reported['portfolio']['confidence']['score'],
            'A derived anchor must reduce overall confidence'
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

        assertSame('S5', $highestFrequencyCode, 'Denial-of-service should be the most frequent scenario');
        assertTrue($highestLossCode !== 'S5', 'The most frequent scenario must not automatically rank highest by loss');
    },
];
