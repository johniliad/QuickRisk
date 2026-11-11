<?php

declare(strict_types=1);

/**
 * Payload validation and security tests (development plan phases 24 and 28).
 *
 * PHP must validate the complete assessment independently of the browser, and must
 * reject attempts to smuggle assessment identifiers, tokens, seeds or model
 * parameters into the request.
 */

return [
    'validation: a complete, well-formed payload is accepted' => function (): void {
        $model = qk_test_model();
        $validated = QkValidation::validatePayload($model, qk_test_payload(qk_test_profile()));

        assertCount(8, $validated['profileAnswers'], 'All eight profile answers should be validated');
        assertCount(5, $validated['scenarioAnswers'], 'All five scenarios should be validated');
        assertSame('POSSIBLE', $validated['scenarioAnswers']['S1']['S1A'], 'Scenario answers should be normalised');
    },

    'validation: the disclaimer must be acknowledged at the current version' => function (): void {
        $model = qk_test_model();

        $notAcknowledged = qk_test_payload(qk_test_profile());
        $notAcknowledged['disclaimer']['acknowledged'] = false;
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $notAcknowledged),
            QkValidationException::class,
            'An unacknowledged disclaimer must be rejected'
        );

        $missing = qk_test_payload(qk_test_profile());
        unset($missing['disclaimer']);
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $missing),
            QkValidationException::class,
            'A missing disclaimer block must be rejected'
        );

        $staleVersion = qk_test_payload(qk_test_profile());
        $staleVersion['disclaimer']['version'] = 'DISC-0.9';
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $staleVersion),
            QkValidationException::class,
            'An outdated disclaimer version must be rejected'
        );
    },

    'validation: assessment identifiers, tokens and model parameters cannot be submitted' => function (): void {
        $model = qk_test_model();

        foreach ([
            'assessmentId' => 'abc-123',
            'token' => 'deadbeef',
            'seed' => 12345,
            'iterations' => 100000,
            'modelParameters' => ['susceptibility' => 0.01],
            'userId' => 7,
            'organisationName' => 'Example Ltd',
            'retention' => 'forever',
        ] as $field => $value) {
            $payload = qk_test_payload(qk_test_profile());
            $payload[$field] = $value;

            $exception = assertThrows(
                static fn () => QkValidation::validatePayload($model, $payload),
                QkValidationException::class,
                'The field "' . $field . '" must be rejected'
            );
            assertSame('UNEXPECTED_FIELD', $exception->errorCode(), 'Unexpected fields must be reported as UNEXPECTED_FIELD');
        }
    },

    'validation: extra fields inside answers are rejected' => function (): void {
        $model = qk_test_model();

        $payload = qk_test_payload(qk_test_profile());
        $payload['organisationAnswers'][0]['weight'] = 2.5;
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $payload),
            QkValidationException::class,
            'An unexpected field inside an answer must be rejected'
        );

        $payload = qk_test_payload(qk_test_profile());
        $payload['scenarioAnswers'][0]['answers'][0]['probability'] = 0.99;
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $payload),
            QkValidationException::class,
            'An unexpected field inside a scenario answer must be rejected'
        );
    },
    'validation: unknown question, option and scenario codes are rejected' => function (): void {
        $model = qk_test_model();

        $unknownQuestion = qk_test_payload(qk_test_profile());
        $unknownQuestion['organisationAnswers'][0]['questionCode'] = 'QP99';
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $unknownQuestion),
            QkValidationException::class,
            'An unknown profile question must be rejected'
        );

        $unknownOption = qk_test_payload(qk_test_profile());
        $unknownOption['organisationAnswers'][0]['optionCode'] = 'ENORMOUS';
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $unknownOption),
            QkValidationException::class,
            'An unsupported answer code must be rejected'
        );

        $wrongSetOption = qk_test_payload(qk_test_profile());
        $wrongSetOption['organisationAnswers'][0]['optionCode'] = 'EXTREME';
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $wrongSetOption),
            QkValidationException::class,
            'An option from a different option set must be rejected'
        );

        $unknownScenario = qk_test_payload(qk_test_profile());
        $unknownScenario['scenarioAnswers'][] = [
            'scenarioCode' => 'S6',
            'answers' => [
                ['questionCode' => 'S6A', 'optionCode' => 'POSSIBLE'],
                ['questionCode' => 'S6B', 'optionCode' => 'SIGNIFICANT'],
            ],
        ];
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $unknownScenario),
            QkValidationException::class,
            'A sixth scenario must be rejected'
        );
    },

    'validation: incomplete submissions are rejected' => function (): void {
        $model = qk_test_model();

        $missingRequired = qk_test_payload(qk_test_profile());
        $missingRequired['organisationAnswers'] = array_values(array_filter(
            $missingRequired['organisationAnswers'],
            static fn (array $entry): bool => $entry['questionCode'] !== 'QP7'
        ));
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $missingRequired),
            QkValidationException::class,
            'A missing required profile answer must be rejected'
        );

        $missingScenario = qk_test_payload(qk_test_profile());
        array_pop($missingScenario['scenarioAnswers']);
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $missingScenario),
            QkValidationException::class,
            'A missing scenario must be rejected'
        );

        $missingImpact = qk_test_payload(qk_test_profile());
        $missingImpact['scenarioAnswers'][0]['answers'] = [$missingImpact['scenarioAnswers'][0]['answers'][0]];
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $missingImpact),
            QkValidationException::class,
            'A missing scenario impact answer must be rejected'
        );

        $duplicate = qk_test_payload(qk_test_profile());
        $duplicate['organisationAnswers'][] = ['questionCode' => 'QP1', 'optionCode' => 'GT1B'];
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $duplicate),
            QkValidationException::class,
            'A duplicated answer must be rejected'
        );
    },

    'validation: injection and malformed-code payloads are rejected' => function (): void {
        $model = qk_test_model();

        foreach ([
            'xss' => '<script>alert(1)</script>',
            'sql' => "'; DROP TABLE assessments; --",
            'path' => '../../fairquickmodel/parameters.json',
            'json' => '{"optionCode":"HIGH"}',
            'lowercase' => 'high',
            'long' => str_repeat('A', 64),
        ] as $label => $optionCode) {
            $payload = qk_test_payload(qk_test_profile());
            $payload['organisationAnswers'][1]['optionCode'] = $optionCode;

            $exception = assertThrows(
                static fn () => QkValidation::validatePayload($model, $payload),
                QkValidationException::class,
                'A malformed answer code must be rejected (' . $label . ')'
            );
            assertSame('ANSWER_CODE_INVALID', $exception->errorCode(), 'Malformed codes must be reported as ANSWER_CODE_INVALID');
        }

        $nonString = qk_test_payload(qk_test_profile());
        $nonString['organisationAnswers'][1]['optionCode'] = ['HIGH'];
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $nonString),
            QkValidationException::class,
            'A non-string answer code must be rejected'
        );
    },

    'validation: version mismatches are rejected' => function (): void {
        $model = qk_test_model();

        $wrongSchema = qk_test_payload(qk_test_profile());
        $wrongSchema['schemaVersion'] = '9.9.9';
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $wrongSchema),
            QkValidationException::class,
            'A schema version mismatch must be rejected'
        );

        $wrongModel = qk_test_payload(qk_test_profile());
        $wrongModel['modelId'] = 'FAIR-QK-2.0';
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $wrongModel),
            QkValidationException::class,
            'A model version mismatch must be rejected'
        );

        $missingVersion = qk_test_payload(qk_test_profile());
        unset($missingVersion['schemaVersion']);
        assertThrows(
            static fn () => QkValidation::validatePayload($model, $missingVersion),
            QkValidationException::class,
            'A missing schema version must be rejected'
        );
    },

    'validation: error messages never echo submitted values back' => function (): void {
        $model = qk_test_model();
        $payload = qk_test_payload(qk_test_profile());
        $payload['organisationAnswers'][0]['optionCode'] = 'ENORMOUS_SECRET_VALUE';

        $exception = assertThrows(
            static fn () => QkValidation::validatePayload($model, $payload),
            QkValidationException::class,
            'An unsupported option must be rejected'
        );

        assertNotContains(
            'ENORMOUS_SECRET_VALUE',
            $exception->getMessage(),
            'Validation messages must not echo submitted values'
        );
    },
];