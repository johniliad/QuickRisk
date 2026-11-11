<?php

declare(strict_types=1);

/**
 * Authoritative model tests (development plan phases 2, 3, 6, 27).
 */

return [
    'model: the authoritative model loads and validates' => function (): void {
        $model = qk_test_model();

        assertSame('FAIR-QK-1.3', $model->modelId(), 'The model identifier must be explicit');
        assertSame('1.3.0', (string) $model->manifest()['modelVersion'], 'The model version must be explicit');
        assertSame('1.3.0', (string) $model->manifest()['schemaVersion'], 'The schema version must be explicit');
        assertSame('CAL-1.3', (string) $model->manifest()['calibrationVersion'], 'The calibration version must be explicit');
        assertTrue(is_dir($model->modelPath()), 'The model directory must exist');
    },

    'model: exactly five scenarios are defined with two questions each' => function (): void {
        $model = qk_test_model();

        assertSame(['S1', 'S2', 'S3', 'S4', 'S5'], $model->scenarioOrder(), 'The scenario set and order must be fixed');

        $questionCodes = [];
        foreach ($model->scenarioOrder() as $code) {
            $scenario = $model->scenario($code);
            foreach (['code', 'name', 'shortDescription', 'statement'] as $key) {
                assertTrue(isset($scenario[$key]) && (string) $scenario[$key] !== '', 'Scenario ' . $code . ' must define ' . $key);
            }
            assertTrue(
                count((array) $scenario['investigationPrompts']) >= 2,
                'Scenario ' . $code . ' must offer investigation prompts'
            );

            foreach (['likelihoodQuestion', 'impactQuestion'] as $key) {
                $question = $scenario[$key];
                assertTrue((string) $question['text'] !== '', 'Scenario ' . $code . ' ' . $key . ' must have text');
                assertTrue((string) $question['help'] !== '', 'Scenario ' . $code . ' ' . $key . ' must have help text');
                assertTrue($model->hasOption((string) $question['optionSet'], 'UNKNOWN'), 'Every scenario question must allow Unknown');
                $questionCodes[] = (string) $question['code'];
            }
        }

        assertSame(count($questionCodes), count(array_unique($questionCodes)), 'Scenario question codes must be unique');
    },

    'model: the organisation profile has seven required and one optional question' => function (): void {
        $model = qk_test_model();
        $manifest = $model->manifest();

        assertCount(8, $model->profileQuestions(), 'Eight organisation-profile questions are defined');
        assertCount(7, (array) $manifest['requiredProfileQuestions'], 'Seven profile questions are required');
        assertSame(['QP8'], (array) $manifest['optionalProfileQuestions'], 'QP8 is the optional profile question');

        foreach ($model->profileQuestions() as $question) {
            assertTrue(
                $model->hasOption((string) $question['optionSet'], 'UNKNOWN'),
                'Question ' . $question['code'] . ' must offer an Unknown option'
            );
            assertTrue(
                (string) $question['help'] !== '',
                'Question ' . $question['code'] . ' must explain its purpose to the user'
            );
        }
    },

    'model: loss thresholds are ascending and include one million' => function (): void {
        $thresholds = qk_test_model()->lossThresholds();

        assertCount(5, $thresholds, 'Five configurable thresholds are defined');
        $previous = -1.0;
        foreach ($thresholds as $threshold) {
            assertTrue($threshold > $previous, 'Thresholds must ascend');
            $previous = $threshold;
        }
        assertTrue(in_array(1000000.0, $thresholds, true), 'A one-million threshold must be configurable');
    },

    'model: every modifier covers every option of its question' => function (): void {
        $model = qk_test_model();
        $parameters = $model->parameters();

        foreach ($parameters['modifiers'] as $modifier) {
            $questionCode = (string) $modifier['questionCode'];
            $optionSet = '';
            foreach ($model->profileQuestions() as $question) {
                if ($question['code'] === $questionCode) {
                    $optionSet = (string) $question['optionSet'];
                }
            }
            assertTrue($optionSet !== '', 'Modifier ' . $modifier['code'] . ' must reference a known profile question');

            foreach ($model->optionSet($optionSet) as $option) {
                assertTrue(
                    isset($modifier['values'][$option['code']]),
                    'Modifier ' . $modifier['code'] . ' must define a value for option ' . $option['code']
                );
            }
            assertTrue(
                (float) $modifier['unknownWiden'] >= 1.0,
                'Modifier ' . $modifier['code'] . ' must widen rather than narrow an Unknown answer'
            );
        }
    },

    'model: calibration parameters are classified and sourced' => function (): void {
        $parameters = qk_test_model()->parameters();

        assertSame('CAL-1.3', $parameters['calibrationVersion'], 'The calibration version must be declared');
        assertTrue(isset($parameters['classificationLegend']), 'A classification legend must be documented');

        foreach (['frequency', 'impactMultiplier', 'disruptionCostAnchor', 'susceptibility', 'secondaryLoss', 'scenarioScaling'] as $group) {
            assertTrue(isset($parameters[$group]['classification']), 'Parameter group ' . $group . ' must be classified');
        }

        foreach (['frequency', 'impactMultiplier', 'disruptionCostAnchor'] as $group) {
            assertTrue(
                (string) $parameters[$group]['source'] !== '',
                'Parameter group ' . $group . ' must cite its source or state that it is an internal heuristic'
            );
        }

        foreach ($parameters['scenarioScaling']['scenarios'] as $code => $entry) {
            assertTrue(
                is_numeric($entry['frequencyScale']) && is_numeric($entry['impactScale']),
                'Scenario scaling must be numeric for ' . $code
            );
        }
    },

    'model: the version record matches the manifest' => function (): void {
        $model = qk_test_model();
        $path = $model->modelPath() . '/versions/' . $model->manifest()['modelVersion'] . '.json';
        assertTrue(is_file($path), 'A version record must exist for the active model version');

        $record = json_decode((string) file_get_contents($path), true);
        assertTrue(is_array($record), 'The version record must be valid JSON');
        assertSame($model->modelId(), $record['modelId'], 'The version record must match the model identifier');
        assertSame($model->manifest()['modelVersion'], $record['modelVersion'], 'The version record must match the model version');
        assertSame($model->manifest()['calibrationVersion'], $record['calibrationVersion'], 'The version record must match the calibration version');
        assertTrue(count((array) $record['changes']) > 0, 'The version record must describe what changed');
        assertTrue((string) $record['calibrationChangePolicy'] !== '', 'The calibration change policy must be recorded');
    },

    'model: the disclaimer and privacy content are complete and versioned' => function (): void {
        $model = qk_test_model();
        $content = $model->content();

        assertSame($model->manifest()['disclaimerVersion'], $content['disclaimerVersion'], 'The disclaimer version must match the manifest');
        assertTrue(count((array) $content['disclaimer']['paragraphs']) >= 10, 'The full disclaimer must be stored in the model');
        assertTrue((string) $content['disclaimer']['acknowledgementLabel'] !== '', 'The acknowledgement label must be defined');
        assertTrue((string) $content['privacyNotice']['statement'] !== '', 'The zero-retention statement must be defined');
        assertContains('does not store', (string) $content['privacyNotice']['statement'], 'The privacy statement must state non-retention');
        assertTrue(count((array) $content['methodology']['sections']) >= 12, 'The methodology must cover the required topics');
        assertTrue(count((array) $content['terminology']['terms']) >= 8, 'FAIR terminology must be explained in plain language');
        assertSame(
            'Indicative FAIR QuickRisk Assessment',
            $content['reportLabels']['title'],
            'The report title must not imply certification'
        );
    },

    'model: the model contains no assessment data or identity fields' => function (): void {
        $model = qk_test_model();
        $files = qk_test_files($model->modelPath(), ['json']);

        assertTrue(count($files) >= 7, 'The expected model files must be present');

        foreach ($files as $file) {
            $contents = (string) file_get_contents($file);
            foreach (['assessmentId', 'assessment_id', 'organisationName', 'respondent', 'sessionId', 'userId'] as $forbidden) {
                assertNotContains($forbidden, $contents, 'Model file ' . basename($file) . ' must not contain ' . $forbidden);
            }
        }
    },

    'model: parameters.json is server-only and never imported by the browser build' => function (): void {
        $model = qk_test_model();
        $visibility = (array) $model->manifest()['visibility'];

        assertTrue(
            in_array('parameters.json', (array) $visibility['serverOnly'], true),
            'parameters.json must be declared server-only'
        );

        $root = qk_test_repository_root();
        $sources = [];
        foreach (['/frontend/src', '/frontend/shared'] as $directory) {
            if (is_dir($root . $directory)) {
                $sources = array_merge($sources, qk_test_files($root . $directory, ['ts', 'tsx']));
            }
        }

        foreach ($sources as $file) {
            assertNotContains(
                'parameters.json',
                (string) file_get_contents($file),
                'Frontend source ' . basename($file) . ' must not import the calibration parameters'
            );
        }
    },
];