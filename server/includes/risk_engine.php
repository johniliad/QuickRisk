<?php

declare(strict_types=1);

require_once __DIR__ . '/fair_engine.php';
require_once __DIR__ . '/posterior_engine.php';
require_once __DIR__ . '/inference_repository.php';

/** Selects the validated posterior engine or the explicit legacy fallback. */
final class QkRiskEngine
{
    /** @param array<string,mixed> $payload */
    public static function calculateAssessment(
        QkModel $model,
        QkInferenceRepository $inference,
        array $payload,
        int $seed,
        ?int $iterations = null
    ): array {
        if (self::usesPosterior($inference)) {
            return QkPosteriorEngine::calculateAssessment($model, $inference, $payload, $seed, $iterations);
        }

        return FairEngine::calculateAssessment($model, $payload, $seed, $iterations);
    }

    /** @param array<string,mixed> $payload */
    public static function lossVectors(
        QkModel $model,
        QkInferenceRepository $inference,
        array $payload,
        int $seed,
        int $iterations
    ): array {
        if (self::usesPosterior($inference)) {
            return QkPosteriorEngine::lossVectors($model, $inference, $payload, $seed, $iterations);
        }

        return FairEngine::lossVectors($model, $payload, $seed, $iterations);
    }

    public static function usesPosterior(QkInferenceRepository $inference): bool
    {
        return $inference->isActive();
    }
}
