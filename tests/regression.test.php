<?php

declare(strict_types=1);

/**
 * Regression tests.
 *
 * A fixed assessment fixture is run with a fixed seed and compared against the recorded
 * envelope in tests/expected/baseline-<modelVersion>.json. The comparison uses the
 * tolerances stored alongside the baseline, because exact floating-point equality is not
 * promised across unrelated runtime changes.
 *
 * Regenerate the baseline only deliberately, with a new calibration or model version:
 *   php tools/generate-baseline.php
 */

return [
    'regression: the fixed fixture reproduces the recorded result envelope' => function (): void {
        $model = qk_test_model();
        $baselinePath = qk_test_repository_root()
            . '/tests/expected/baseline-'
            . (string) $model->manifest()['modelVersion']
            . '.json';

        assertTrue(
            is_file($baselinePath),
            'A regression baseline must exist. Generate it with: php tools/generate-baseline.php'
        );

        $baseline = json_decode((string) file_get_contents($baselinePath), true);
        assertTrue(is_array($baseline), 'The baseline file must be valid JSON');

        assertSame(
            $model->modelId(),
            $baseline['modelId'],
            'The baseline was generated for a different model; regenerate it deliberately'
        );
        assertSame(
            $model->manifest()['calibrationVersion'],
            $baseline['calibrationVersion'],
            'The baseline was generated for a different calibration version'
        );

        $fixture = $baseline['fixture'];
        $tolerances = $baseline['tolerances'];

        $profile = $fixture['profileAnswers'];
        $scenarioAnswers = [];
        foreach ($fixture['scenarioAnswers'] as $scenarioCode => $answers) {
            $scenarioAnswers[$scenarioCode] = $answers;
        }

        $response = qk_test_calculate(
            qk_test_payload($profile, $scenarioAnswers),
            (int) $fixture['seed'],
            (int) $fixture['iterations']
        );

        assertSame(
            (int) $fixture['iterations'],
            (int) $response['meta']['iterations'],
            'The fixture iteration count must be honoured'
        );

        $expectedPortfolio = (float) $baseline['portfolio']['expectedAnnualLoss'];
        $actualPortfolio = (float) $response['portfolio']['expectedAnnualLoss'];
        assertRelativeClose(
            $expectedPortfolio,
            $actualPortfolio,
            (float) $tolerances['portfolio'],
            'The portfolio expected annual loss moved outside the recorded envelope'
        );

        foreach ($baseline['scenarios'] as $scenarioCode => $expected) {
            $actual = qk_test_scenario($response, (string) $scenarioCode)['statistics'];

            assertRelativeClose(
                (float) $expected['expectedAnnualLoss'],
                (float) $actual['expectedAnnualLoss'],
                (float) $tolerances['expectedAnnualLoss'],
                'Expected annual loss changed for ' . $scenarioCode
            );

            foreach (['p10', 'p50', 'p90'] as $percentile) {
                assertRelativeClose(
                    (float) $expected[$percentile],
                    (float) $actual[$percentile],
                    (float) $tolerances['percentiles'],
                    strtoupper($percentile) . ' changed for ' . $scenarioCode
                );
            }

            assertRelativeClose(
                (float) $expected['expectedLossEventFrequency'],
                (float) $actual['expectedLossEventFrequency'],
                (float) $tolerances['expectedAnnualLoss'],
                'Loss event frequency changed for ' . $scenarioCode
            );

            assertRelativeClose(
                (float) $expected['expectedLossMagnitude'],
                (float) $actual['expectedLossMagnitude'],
                (float) $tolerances['expectedAnnualLoss'],
                'Loss magnitude changed for ' . $scenarioCode
            );

            foreach ((array) $expected['thresholdProbabilities'] as $threshold => $probability) {
                assertClose(
                    (float) $probability,
                    (float) $actual['thresholdProbabilities'][(string) $threshold],
                    (float) $tolerances['thresholdProbability'],
                    'Threshold probability changed for ' . $scenarioCode . ' at ' . $threshold
                );
            }
        }
    },

    'regression: the recorded confidence scores are stable' => function (): void {
        $model = qk_test_model();
        $baselinePath = qk_test_repository_root()
            . '/tests/expected/baseline-'
            . (string) $model->manifest()['modelVersion']
            . '.json';

        if (!is_file($baselinePath)) {
            qk_fail('A regression baseline must exist.');
        }

        $baseline = json_decode((string) file_get_contents($baselinePath), true);
        $fixture = $baseline['fixture'];

        $response = qk_test_calculate(
            qk_test_payload($fixture['profileAnswers'], $fixture['scenarioAnswers']),
            (int) $fixture['seed'],
            (int) $fixture['iterations']
        );

        assertSame(
            (int) $baseline['portfolio']['confidenceScore'],
            (int) $response['portfolio']['confidence']['score'],
            'The overall confidence score changed'
        );

        foreach ($baseline['scenarios'] as $scenarioCode => $expected) {
            assertSame(
                (int) $expected['confidenceScore'],
                (int) qk_test_scenario($response, (string) $scenarioCode)['confidence']['score'],
                'The confidence score changed for ' . $scenarioCode
            );
        }
    },
];
