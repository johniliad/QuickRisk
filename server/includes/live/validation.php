<?php

declare(strict_types=1);

/**
 * QuickRisk Live — payload validation.
 *
 * Validation is not recalculation (base requirement 54). This module checks structure, types
 * and the documented ranges. It never reproduces the telemetry, mitigation, multiplier or
 * risk-index formulas.
 */

/**
 * @return array<string,mixed>
 */
function qk_live_decode_object(string $rawBody): array
{
    $decoded = json_decode($rawBody, true);
    if (!is_array($decoded) || array_is_list($decoded)) {
        throw new QkLiveHttpError(400, 'INVALID_JSON', 'The request body must be a JSON object.');
    }

    return $decoded;
}

/**
 * @param mixed $value
 */
function qk_live_number($value, string $label, float $minimum, float $maximum): float
{
    if (!is_numeric($value)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' must be a number.');
    }
    $number = (float) $value;
    if (!is_finite($number) || $number < $minimum || $number > $maximum) {
        throw new QkLiveHttpError(
            422,
            'VALIDATION_ERROR',
            sprintf('%s must be between %s and %s.', $label, (string) $minimum, (string) $maximum)
        );
    }

    return $number;
}

/**
 * @param mixed $value
 */
function qk_live_boolean($value, string $label): bool
{
    if (!is_bool($value)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' must be true or false.');
    }

    return $value;
}

/**
 * Character length without requiring the mbstring extension.
 */
function qk_live_text_length(string $value): int
{
    if (function_exists('mb_strlen')) {
        $length = mb_strlen($value, 'UTF-8');

        return is_int($length) ? $length : strlen($value);
    }

    // Without mbstring, count complete UTF-8 sequences; fall back to bytes if the text is not valid UTF-8.
    $count = preg_match_all('/./us', $value);

    return is_int($count) ? $count : strlen($value);
}

/**
 * @param mixed $value
 */
function qk_live_text($value, string $label, int $maximumLength, bool $allowEmpty = true): string
{
    if (!is_string($value)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' must be text.');
    }
    // Stored text is treated as untrusted; control characters are stripped and the renderer escapes it.
    $clean = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', $value) ?? '');
    if (!$allowEmpty && $clean === '') {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' must not be empty.');
    }
    if (qk_live_text_length($clean) > $maximumLength) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' is too long.');
    }

    return $clean;
}

/**
 * Validates the synthetic SOC state.
 *
 * @param mixed $state
 * @return array<string,mixed>
 */
function qk_live_validate_soc_state($state): array
{
    if (!is_array($state) || array_is_list($state)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The SOC state must be an object.');
    }

    $stage = $state['incidentStage'] ?? null;
    if (!is_string($stage) || !in_array($stage, ['none', 'triage', 'anomaly', 'compromise'], true)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The incident stage is not recognised.');
    }

    $iocCount = $state['iocCount'] ?? null;
    if (!is_int($iocCount) && !(is_float($iocCount) && floor($iocCount) === $iocCount)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The IOC count must be a whole number.');
    }
    $iocCount = (int) $iocCount;
    if ($iocCount < 0 || $iocCount > 15) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The IOC count must be between 0 and 15.');
    }

    return [
        'scenarioId' => qk_live_text($state['scenarioId'] ?? null, 'The scenario identifier', 64, false),
        'incidentStage' => $stage,
        'iocCount' => $iocCount,
        'iocConfidence' => qk_live_number($state['iocConfidence'] ?? null, 'IOC confidence', 0.1, 1.0),
        'alertVelocity' => qk_live_number($state['alertVelocity'] ?? null, 'Alert velocity', 1.0, 5.0),
        'isEdrIsolated' => qk_live_boolean($state['isEdrIsolated'] ?? null, 'The EDR control state'),
        'isNetworkBlocked' => qk_live_boolean($state['isNetworkBlocked'] ?? null, 'The network control state'),
        'isIdentityRevoked' => qk_live_boolean($state['isIdentityRevoked'] ?? null, 'The identity control state'),
    ];
}

/**
 * Validates the recorded simulation timeline.
 *
 * @param mixed $timeline
 * @param int $maximumEvents
 * @return array<int,array<string,mixed>>
 */
function qk_live_validate_timeline($timeline, int $maximumEvents): array
{
    if (!is_array($timeline) || !array_is_list($timeline)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The timeline must be a list of events.');
    }
    if (count($timeline) > $maximumEvents) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The timeline has too many events.');
    }

    $events = [];
    foreach ($timeline as $event) {
        if (!is_array($event)) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'Every timeline event must be an object.');
        }
        $offset = $event['offsetMs'] ?? null;
        if (!is_int($offset) || $offset < 0 || $offset > 86400000) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A timeline offset is out of range.');
        }
        $events[] = [
            'offsetMs' => $offset,
            'eventType' => qk_live_text($event['eventType'] ?? 'STATE_RECORDED', 'The event type', 64, false),
            'label' => qk_live_text($event['label'] ?? '', 'The event label', 160),
            'state' => qk_live_validate_soc_state($event['state'] ?? null),
            'result' => qk_live_validate_risk_result($event['result'] ?? null),
        ];
    }

    return $events;
}

/**
 * Validates a complete save or update payload and returns the normalised record.
 *
 * @param array<string,mixed> $payload
 * @param array<string,mixed> $liveConfig
 * @return array<string,mixed>
 */
function qk_live_validate_assessment_payload(array $payload, array $liveConfig): array
{
    $state = qk_live_validate_soc_state($payload['inputState'] ?? null);
    $result = qk_live_validate_risk_result($payload['riskResult'] ?? null);
    $timeline = qk_live_validate_timeline($payload['timeline'] ?? [], (int) ($liveConfig['maxTimelineEvents'] ?? 50));

    $scenarioId = qk_live_text($payload['scenarioId'] ?? null, 'The scenario identifier', 64, false);
    if (preg_match('/^[A-Za-z0-9_-]{1,64}$/', $scenarioId) !== 1) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The scenario identifier has an invalid format.');
    }
    if ($state['scenarioId'] !== $scenarioId) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The SOC state scenario does not match the payload scenario.');
    }

    $baselineEal = qk_live_number($payload['baselineEal'] ?? null, 'The baseline EAL', 0.0, 1.0e15);
    if (abs($baselineEal - (float) $result['baselineEal']) > 0.01) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The baseline EAL does not match the risk result.');
    }

    $methodologyVersion = qk_live_text($payload['methodologyVersion'] ?? null, 'The methodology version', 32, false);
    if ($methodologyVersion !== (string) $result['methodologyVersion']) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The methodology version does not match the risk result.');
    }

    $baselineSource = $payload['baselineSource'] ?? [];
    if (!is_array($baselineSource)) {
        $baselineSource = [];
    }

    $now = gmdate('Y-m-d H:i:s');

    return [
        'title' => qk_live_text($payload['title'] ?? '', 'The title', 160),
        'scenarioId' => $scenarioId,
        'scenarioName' => qk_live_text($payload['scenarioName'] ?? $scenarioId, 'The scenario name', 160, false),
        'baselineEal' => $baselineEal,
        'baselineModelId' => qk_live_text($baselineSource['modelId'] ?? '', 'The baseline model identifier', 32),
        'baselineModelVersion' => qk_live_text($baselineSource['modelVersion'] ?? '', 'The baseline model version', 32),
        'telemetryScore' => $result['telemetryScore'],
        'mitigationFactor' => $result['mitigationFactor'],
        'socMultiplier' => $result['socMultiplier'],
        'realTimeRisk' => $result['realTimeRisk'],
        'riskBand' => $result['riskBand'],
        'realTimeEal' => $result['realTimeEal'],
        'methodologyVersion' => $methodologyVersion,
        'inputStateJson' => qk_live_encode($state),
        'riskResultJson' => qk_live_encode($result),
        'traceJson' => qk_live_encode($result['trace']),
        'timeline' => $timeline,
        'createdAt' => $now,
        'updatedAt' => $now,
        'status' => 'saved',
    ];
}

/**
 * @param array<string,mixed>|array<int,mixed> $value
 */
function qk_live_encode(array $value): string
{
    $encoded = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    return is_string($encoded) ? $encoded : '{}';
}

/**
 * Validates the client-calculated risk result.
 *
 * Only the documented ranges are checked; the formulas stay in the TypeScript engine.
 *
 * @param mixed $result
 * @return array<string,mixed>
 */
function qk_live_validate_risk_result($result): array
{
    if (!is_array($result) || array_is_list($result)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The risk result must be an object.');
    }

    $risk = $result['realTimeRisk'] ?? null;
    if (!is_int($risk) && !(is_float($risk) && floor($risk) === $risk)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The real-time risk index must be a whole number.');
    }
    $risk = (int) $risk;
    if ($risk < 0 || $risk > 100) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The real-time risk index must be between 0 and 100.');
    }

    $band = $result['riskBand'] ?? null;
    if (!is_string($band) || !in_array($band, ['Low', 'Medium', 'High', 'Critical'], true)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The risk band is not recognised.');
    }

    $trace = $result['trace'] ?? [];
    if (!is_array($trace)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The calculation trace must be an object.');
    }

    return [
        'telemetryScore' => qk_live_number($result['telemetryScore'] ?? null, 'The telemetry score', 0.0, 100.0),
        'mitigationFactor' => qk_live_number($result['mitigationFactor'] ?? null, 'The mitigation factor', 0.0, 1.0),
        'socMultiplier' => qk_live_number($result['socMultiplier'] ?? null, 'The SOC multiplier', 0.2, 4.0),
        'realTimeRisk' => $risk,
        'riskBand' => $band,
        'baselineEal' => qk_live_number($result['baselineEal'] ?? null, 'The baseline EAL', 0.0, 1.0e15),
        'realTimeEal' => qk_live_number($result['realTimeEal'] ?? null, 'The real-time EAL', 0.0, 1.0e16),
        'methodologyVersion' => qk_live_text($result['methodologyVersion'] ?? null, 'The methodology version', 32, false),
        'trace' => $trace,
    ];
}
