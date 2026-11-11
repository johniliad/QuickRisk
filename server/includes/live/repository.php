<?php

declare(strict_types=1);

/**
 * QuickRisk Live — persistence contract.
 *
 * The handlers depend on this interface rather than on PDO directly, which keeps the request
 * logic testable without MySQL and keeps every query in one place. Two implementations exist:
 * a PDO implementation for production and an array implementation for the test suite.
 *
 * Nothing here calculates risk: the stored result is the value the TypeScript engine produced.
 */
interface QkLiveRepository
{
    public function createSession(string $tokenHash, string $csrfHash, string $now, string $expiresAt): int;

    /** @return array<string,mixed>|null */
    public function findSessionByTokenHash(string $tokenHash): ?array;

    public function touchSession(int $sessionId, string $now, string $expiresAt): void;

    /** Rotates the CSRF token hash stored with a session. */
    public function rotateCsrfToken(int $sessionId, string $csrfHash): void;

    public function countAssessments(int $sessionId): int;

    /**
     * @param array<string,mixed> $record
     * @return array<string,mixed>
     */
    public function createAssessment(int $sessionId, array $record): array;

    /** @return array<int,array<string,mixed>> */
    public function listAssessments(int $sessionId): array;

    /** @return array<string,mixed>|null */
    public function findAssessment(int $sessionId, string $publicId): ?array;

    /** @return array<string,mixed>|null */
    public function findAssessmentByPublicId(string $publicId): ?array;

    /**
     * @param array<string,mixed> $record
     */
    public function updateAssessment(int $assessmentId, int $sessionId, array $record): bool;

    public function archiveAssessment(int $assessmentId, int $sessionId, string $now): bool;

    /**
     * @param array<int,array<string,mixed>> $events
     */
    public function replaceEvents(int $assessmentId, array $events): void;

    /** @return array<int,array<string,mixed>> */
    public function listEvents(int $assessmentId): array;

    public function createShare(int $assessmentId, string $tokenHash, ?string $expiresAt, string $now): void;

    /** @return array<string,mixed>|null */
    public function findActiveShareByAssessment(int $assessmentId, string $now): ?array;

    /** @return array<string,mixed>|null */
    public function findActiveShareByHash(string $tokenHash, string $now): ?array;

    public function revokeShares(int $assessmentId, string $now): void;

    /** @return array<int,array<string,mixed>> */
    public function listScenarios(): array;

    public function methodologyVersionEnabled(string $version): bool;
}
