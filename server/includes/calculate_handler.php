<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — calculation orchestration.
 *
 * Separated from the HTTP entry point so that the same code path can be executed
 * from the command line by the test suite and the release tools. Nothing in this
 * file writes assessment data to any storage medium.
 */

/**
 * Loads the active model once per request.
 *
 * @param array<string,mixed> $config
 */
function qk_load_model(array $config): QkModel
{
    static $model = null;

    if (!$model instanceof QkModel) {
        $model = QkModel::load($config);
    }

    return $model;
}

/**
 * Generates a calculation seed that exists only in process memory.
 *
 * The seed is never returned to the browser, never logged and never stored, so no
 * user assessment can be reconstructed or replayed afterwards.
 */
function qk_generate_seed(): int
{
    return random_int(1, 2147483646);
}

/**
 * Validates a payload, runs the simulation and returns the response array.
 *
 * @param array<string,mixed> $config
 * @param array<string,mixed> $payload
 * @return array<string,mixed>
 */
function qk_handle_calculation(array $config, array $payload, ?int $iterations = null, ?int $seed = null): array
{
    $model = qk_load_model($config);

    $validated = QkValidation::validatePayload($model, $payload);
    unset($payload);

    $response = FairEngine::calculateAssessment(
        $model,
        $validated,
        $seed ?? qk_generate_seed(),
        $iterations
    );

    unset($validated, $seed);

    return $response;
}

/**
 * Full request decision path for the calculation endpoint.
 *
 * Returns the HTTP status and the JSON payload that should be sent, so that the same
 * decisions can be exercised by the automated test suite without a web server. The
 * entry point itself (api/calculate.php) only sends what this function returns.
 *
 * @param array<string,mixed> $config
 * @param array<string,mixed> $server Request server variables
 * @param string|null $rawBody Pre-read body; null reads php://input
 * @return array{status:int,payload:array<string,mixed>}
 */
function qk_dispatch_calculation(
    array $config,
    array $server,
    ?string $rawBody = null,
    ?int $iterations = null,
    ?int $seed = null
): array {
    try {
        QkHttp::requirePost($server);
        QkCsrf::assertTrustedRequest($config, $server);
        QkRateLimiter::assertWithinLimit($config, QkHttp::clientIp($config, $server));

        $payload = QkHttp::readJsonBody($config, $server, $rawBody);
        $response = qk_handle_calculation($config, $payload, $iterations, $seed);
        unset($payload);

        QkLog::event('CALCULATION_COMPLETED', $config);

        return ['status' => 200, 'payload' => $response];
    } catch (QkRequestException $exception) {
        QkLog::event($exception->errorCode(), $config);

        $error = ['code' => $exception->errorCode(), 'message' => $exception->getMessage()];
        if ($exception->errorCode() === 'RATE_LIMITED') {
            $error['retryAfter'] = (int) ($config['rateLimit']['windowSeconds'] ?? 300);
        }

        return [
            'status' => $exception->httpStatus(),
            'payload' => ['status' => 'error', 'error' => $error],
        ];
    } catch (QkValidationException $exception) {
        QkLog::event('VALIDATION_FAILED', $config);

        return [
            'status' => 422,
            'payload' => [
                'status' => 'error',
                'error' => ['code' => $exception->errorCode(), 'message' => $exception->getMessage()],
            ],
        ];
    } catch (QkModelException $exception) {
        QkLog::event('MODEL_INVALID', $config);

        return [
            'status' => 503,
            'payload' => [
                'status' => 'error',
                'error' => [
                    'code' => 'MODEL_UNAVAILABLE',
                    'message' => 'The risk model is temporarily unavailable. Please try again later.',
                ],
            ],
        ];
    } catch (Throwable $exception) {
        QkLog::event('CALCULATION_FAILED', $config);

        return [
            'status' => 500,
            'payload' => [
                'status' => 'error',
                'error' => [
                    'code' => 'CALCULATION_FAILED',
                    'message' => 'The calculation could not be completed. Please try again.',
                ],
            ],
        ];
    }
}
