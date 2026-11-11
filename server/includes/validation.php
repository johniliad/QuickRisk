<?php

declare(strict_types=1);

/**
 * Raised when a submitted assessment payload fails validation. The code is a
 * fixed identifier; the message is safe to return to the browser.
 */
final class QkValidationException extends RuntimeException
{
    private string $errorCode;

    public function __construct(string $errorCode, string $message)
    {
        parent::__construct($message);
        $this->errorCode = $errorCode;
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }
}

/**
 * FAIR QuickRisk — server-side payload validation.
 *
 * PHP validates the complete payload independently of the browser. Unknown fields
 * are rejected rather than ignored, so an attempt to smuggle an assessment
 * identifier, token, seed or model parameter into the request fails outright.
 */
final class QkValidation
{
    private const CODE_PATTERN = '/^[A-Z0-9_]{1,32}$/';
    private const VERSION_PATTERN = '/^[0-9]{1,3}(\.[0-9]{1,3}){0,3}$/';
    private const MODEL_ID_PATTERN = '/^[A-Z0-9.\-]{1,32}$/';
    private const ALLOWED_TOP_LEVEL = ['schemaVersion', 'modelId', 'disclaimer', 'organisationAnswers', 'scenarioAnswers'];
    private const ALLOWED_DISCLAIMER = ['acknowledged', 'version'];
    private const ALLOWED_ANSWER = ['questionCode', 'optionCode'];
    private const ALLOWED_SCENARIO_ANSWER = ['scenarioCode', 'answers'];

    /**
     * @param array<string,mixed> $payload
     * @return array{profileAnswers:array<string,string>,scenarioAnswers:array<string,array<string,string>>}
     */
    public static function validatePayload(QkModel $model, array $payload): array
    {
        foreach (array_keys($payload) as $key) {
            if (!in_array((string) $key, self::ALLOWED_TOP_LEVEL, true)) {
                throw new QkValidationException(
                    'UNEXPECTED_FIELD',
                    'The request contained a field that is not part of the assessment schema.'
                );
            }
        }

        $manifest = $model->manifest();
        self::assertVersion(
            $payload['schemaVersion'] ?? null,
            (string) ($manifest['schemaVersion'] ?? ''),
            self::VERSION_PATTERN
        );
        self::assertVersion(
            $payload['modelId'] ?? null,
            (string) ($manifest['modelId'] ?? ''),
            self::MODEL_ID_PATTERN
        );

        self::validateDisclaimer($payload['disclaimer'] ?? null, (string) ($manifest['disclaimerVersion'] ?? ''));

        $profileAnswers = self::validateOrganisationAnswers($model, $payload['organisationAnswers'] ?? null);
        $scenarioAnswers = self::validateScenarioAnswers($model, $payload['scenarioAnswers'] ?? null);

        return [
            'profileAnswers' => $profileAnswers,
            'scenarioAnswers' => $scenarioAnswers,
        ];
    }

    /**
     * @param mixed $value
     */
    private static function validateDisclaimer($value, string $expectedVersion): void
    {
        if (!is_array($value)) {
            throw new QkValidationException('DISCLAIMER_MISSING', 'The disclaimer acknowledgement is missing.');
        }
        foreach (array_keys($value) as $key) {
            if (!in_array((string) $key, self::ALLOWED_DISCLAIMER, true)) {
                throw new QkValidationException('UNEXPECTED_FIELD', 'The disclaimer block contains an unexpected field.');
            }
        }
        if (($value['acknowledged'] ?? null) !== true) {
            throw new QkValidationException(
                'DISCLAIMER_NOT_ACKNOWLEDGED',
                'The disclaimer must be acknowledged before a calculation is performed.'
            );
        }
        $version = $value['version'] ?? null;
        if (!is_string($version) || $version !== $expectedVersion) {
            throw new QkValidationException(
                'DISCLAIMER_VERSION_MISMATCH',
                'The acknowledgement does not match the current disclaimer version.'
            );
        }
    }

    /**
     * @param mixed $value
     * @return array<string,string>
     */
    private static function validateOrganisationAnswers(QkModel $model, $value): array
    {
        if (!is_array($value) || $value === []) {
            throw new QkValidationException('PROFILE_ANSWERS_MISSING', 'The organisation profile answers are missing.');
        }

        $knownQuestions = [];
        foreach ($model->profileQuestions() as $question) {
            $knownQuestions[(string) $question['code']] = $question;
        }

        $answers = [];
        foreach ($value as $entry) {
            $entry = self::assertAnswerEntry($entry, self::ALLOWED_ANSWER);
            $questionCode = self::assertCode($entry['questionCode']);
            $optionCode = self::assertCode($entry['optionCode']);

            if (!isset($knownQuestions[$questionCode])) {
                throw new QkValidationException('UNKNOWN_QUESTION', 'An answer referred to a question that is not part of the model.');
            }
            if (isset($answers[$questionCode])) {
                throw new QkValidationException('DUPLICATE_ANSWER', 'A question was answered more than once.');
            }
            if (!$model->hasOption((string) $knownQuestions[$questionCode]['optionSet'], $optionCode)) {
                throw new QkValidationException('UNKNOWN_OPTION', 'An answer used an option code that is not part of the model.');
            }

            $answers[$questionCode] = $optionCode;
        }

        foreach ((array) ($model->manifest()['requiredProfileQuestions'] ?? []) as $required) {
            if (!isset($answers[(string) $required])) {
                throw new QkValidationException('REQUIRED_ANSWER_MISSING', 'A required organisation profile question was not answered.');
            }
        }

        return $answers;
    }

    /**
     * @param mixed $value
     * @return array<string,array<string,string>>
     */
    private static function validateScenarioAnswers(QkModel $model, $value): array
    {
        if (!is_array($value) || $value === []) {
            throw new QkValidationException('SCENARIO_ANSWERS_MISSING', 'The scenario answers are missing.');
        }

        $expectedScenarios = $model->scenarioOrder();
        $byScenario = [];

        foreach ($value as $entry) {
            $entry = self::assertAnswerEntry($entry, self::ALLOWED_SCENARIO_ANSWER);
            $scenarioCode = self::assertCode($entry['scenarioCode']);

            if (!in_array($scenarioCode, $expectedScenarios, true)) {
                throw new QkValidationException('UNKNOWN_SCENARIO', 'An answer referred to a scenario that is not part of the model.');
            }
            if (isset($byScenario[$scenarioCode])) {
                throw new QkValidationException('DUPLICATE_SCENARIO', 'A scenario was submitted more than once.');
            }

            $answers = $entry['answers'] ?? null;
            if (!is_array($answers)) {
                throw new QkValidationException('SCENARIO_ANSWER_INVALID', 'A scenario answer block did not contain answers.');
            }

            $scenario = $model->scenario($scenarioCode);
            $expectedQuestions = [
                (string) $scenario['likelihoodQuestion']['code'] => (string) $scenario['likelihoodQuestion']['optionSet'],
                (string) $scenario['impactQuestion']['code'] => (string) $scenario['impactQuestion']['optionSet'],
            ];

            $collected = [];
            foreach ($answers as $answer) {
                $answer = self::assertAnswerEntry($answer, self::ALLOWED_ANSWER);
                $questionCode = self::assertCode($answer['questionCode']);
                $optionCode = self::assertCode($answer['optionCode']);

                if (!isset($expectedQuestions[$questionCode])) {
                    throw new QkValidationException('UNKNOWN_QUESTION', 'A scenario answer referred to a question that is not part of this scenario.');
                }
                if (isset($collected[$questionCode])) {
                    throw new QkValidationException('DUPLICATE_ANSWER', 'A scenario question was answered more than once.');
                }
                if (!$model->hasOption($expectedQuestions[$questionCode], $optionCode)) {
                    throw new QkValidationException('UNKNOWN_OPTION', 'A scenario answer used an option code that is not part of the model.');
                }
                $collected[$questionCode] = $optionCode;
            }

            foreach (array_keys($expectedQuestions) as $requiredQuestion) {
                if (!isset($collected[$requiredQuestion])) {
                    throw new QkValidationException('REQUIRED_ANSWER_MISSING', 'A required scenario question was not answered.');
                }
            }

            $byScenario[$scenarioCode] = $collected;
        }

        foreach ($expectedScenarios as $scenarioCode) {
            if (!isset($byScenario[$scenarioCode])) {
                throw new QkValidationException('SCENARIO_MISSING', 'Not every scenario in the model was answered.');
            }
        }

        return $byScenario;
    }

    /**
     * @param mixed $entry
     * @param array<int,string> $allowedKeys
     * @return array<string,mixed>
     */
    private static function assertAnswerEntry($entry, array $allowedKeys): array
    {
        if (!is_array($entry)) {
            throw new QkValidationException('ANSWER_INVALID', 'An answer entry was malformed.');
        }
        foreach (array_keys($entry) as $key) {
            if (!in_array((string) $key, $allowedKeys, true)) {
                throw new QkValidationException('UNEXPECTED_FIELD', 'An answer entry contained an unexpected field.');
            }
        }

        return $entry;
    }

    /**
     * @param mixed $value
     */
    private static function assertCode($value): string
    {
        if (!is_string($value) || $value === '' || strlen($value) > 32) {
            throw new QkValidationException('ANSWER_CODE_INVALID', 'An answer code was missing or too long.');
        }
        if (preg_match(self::CODE_PATTERN, $value) !== 1) {
            throw new QkValidationException('ANSWER_CODE_INVALID', 'An answer code contained characters that are not permitted.');
        }

        return $value;
    }

    /**
     * @param mixed $value
     */
    private static function assertVersion($value, string $expected, string $pattern): void
    {
        if (!is_string($value) || $value === '' || strlen($value) > 32) {
            throw new QkValidationException('VERSION_INVALID', 'A version field was missing or too long.');
        }
        if (preg_match($pattern, $value) !== 1 || $value !== $expected) {
            throw new QkValidationException('VERSION_MISMATCH', 'The request does not match the active model version.');
        }
    }
}
