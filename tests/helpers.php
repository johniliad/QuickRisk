<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — shared test helpers and fixtures.
 */

function qk_test_model(): QkModel
{
    return qk_load_model(qk_config());
}

/**
 * Baseline organisation profile used by most tests: a medium organisation with
 * moderate dependency, significant exposure and moderate controls.
 *
 * @return array<string,string>
 */
function qk_test_profile(array $overrides = []): array
{
    $profile = [
        'QP1' => '50_250M',
        'QP2' => 'HIGH',
        'QP3' => 'SIGNIFICANT',
        'QP4' => 'SIGNIFICANT',
        'QP5' => 'MODERATE',
        'QP6' => 'MODERATE',
        'QP7' => 'MODERATE',
        'QP8' => '100_500K',
    ];

    return array_replace($profile, $overrides);
}

/**
 * @param array<string,string> $profileAnswers
 * @param array<string,array<string,string>>|null $scenarioAnswers
 * @return array<string,mixed>
 */
function qk_test_payload(array $profileAnswers = [], ?array $scenarioAnswers = null): array
{
    $model = qk_test_model();

    $scenarioAnswers = $scenarioAnswers ?? qk_test_scenario_answers();

    $organisationAnswers = [];
    foreach ($profileAnswers as $questionCode => $optionCode) {
        $organisationAnswers[] = ['questionCode' => $questionCode, 'optionCode' => $optionCode];
    }

    $scenarios = [];
    foreach ($model->scenarioOrder() as $scenarioCode) {
        $answers = [];
        foreach ($scenarioAnswers[$scenarioCode] ?? [] as $questionCode => $optionCode) {
            $answers[] = ['questionCode' => $questionCode, 'optionCode' => $optionCode];
        }
        $scenarios[] = ['scenarioCode' => $scenarioCode, 'answers' => $answers];
    }

    return [
        'schemaVersion' => (string) $model->manifest()['schemaVersion'],
        'modelId' => $model->modelId(),
        'disclaimer' => [
            'acknowledged' => true,
            'version' => (string) $model->manifest()['disclaimerVersion'],
        ],
        'organisationAnswers' => $organisationAnswers,
        'scenarioAnswers' => $scenarios,
    ];
}

/**
 * Default scenario answers: "Possible" likelihood and "Significant" impact for all
 * five scenarios.
 *
 * @return array<string,array<string,string>>
 */
function qk_test_scenario_answers(string $likelihood = 'POSSIBLE', string $impact = 'SIGNIFICANT'): array
{
    $model = qk_test_model();
    $answers = [];

    foreach ($model->scenarioOrder() as $scenarioCode) {
        $scenario = $model->scenario($scenarioCode);
        $answers[$scenarioCode] = [
            (string) $scenario['likelihoodQuestion']['code'] => $likelihood,
            (string) $scenario['impactQuestion']['code'] => $impact,
        ];
    }

    return $answers;
}

/**
 * Runs a calculation with a fixed seed so that results are reproducible.
 *
 * @param array<string,mixed> $payload
 * @return array<string,mixed>
 */
function qk_test_calculate(array $payload, int $seed = 20261029, int $iterations = 5000): array
{
    return qk_handle_calculation(qk_config(), $payload, $iterations, $seed);
}

/**
 * @param array<string,mixed> $response
 * @return array<string,mixed>
 */
function qk_test_scenario(array $response, string $code): array
{
    foreach ($response['scenarios'] as $scenario) {
        if ($scenario['code'] === $code) {
            return $scenario;
        }
    }

    qk_fail('Scenario ' . $code . ' was not present in the response');
}

/**
 * @param array<string,mixed> $response
 */
function qk_test_sum_expected(array $response): float
{
    $total = 0.0;
    foreach ($response['scenarios'] as $scenario) {
        $total += (float) $scenario['statistics']['expectedAnnualLoss'];
    }

    return $total;
}

/**
 * Recursively scans a directory for files with one of the supplied extensions.
 *
 * @param array<int,string> $extensions
 * @return array<int,string>
 */
function qk_test_files(string $directory, array $extensions): array
{
    $matches = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS)
    );

    foreach ($iterator as $file) {
        /** @var SplFileInfo $file */
        if (!$file->isFile()) {
            continue;
        }
        if (in_array(strtolower($file->getExtension()), $extensions, true)) {
            $matches[] = $file->getPathname();
        }
    }

    sort($matches);

    return $matches;
}

function qk_test_repository_root(): string
{
    return dirname(__DIR__);
}
