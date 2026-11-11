<?php

declare(strict_types=1);

/**
 * QuickRisk Live — in-memory repository.
 *
 * Used by the automated test suite so that every handler (sessions, ownership, sharing,
 * archival, timeline) can be exercised without MySQL. Production never uses this class: the
 * endpoint scripts construct the PDO repository.
 */
final class QkLiveArrayRepository implements QkLiveRepository
{
    /** @var array<int,array<string,mixed>> */
    private array $sessions = [];
    /** @var array<int,array<string,mixed>> */
    private array $assessments = [];
    /** @var array<int,array<int,array<string,mixed>>> */
    private array $events = [];
    /** @var array<int,array<string,mixed>> */
    private array $shares = [];
    /** @var array<int,array<string,mixed>> */
    private array $scenarios;
    /** @var array<int,string> */
    private array $methodologyVersions;

    private int $sessionCounter = 0;
    private int $assessmentCounter = 0;
    private int $shareCounter = 0;

    /**
     * @param array<int,array<string,mixed>> $scenarios
     * @param array<int,string> $methodologyVersions
     */
    public function __construct(array $scenarios = [], array $methodologyVersions = ['1.0'])
    {
        $this->scenarios = $scenarios;
        $this->methodologyVersions = $methodologyVersions;
    }

    public function createSession(string $tokenHash, string $csrfHash, string $now, string $expiresAt): int
    {
        $this->sessionCounter++;
        $this->sessions[$this->sessionCounter] = [
            'id' => $this->sessionCounter,
            'session_token_hash' => $tokenHash,
            'csrf_token_hash' => $csrfHash,
            'created_at' => $now,
            'last_seen_at' => $now,
            'expires_at' => $expiresAt,
        ];

        return $this->sessionCounter;
    }

    public function findSessionByTokenHash(string $tokenHash): ?array
    {
        foreach ($this->sessions as $session) {
            if (hash_equals((string) $session['session_token_hash'], $tokenHash)) {
                return $session;
            }
        }

        return null;
    }

    public function touchSession(int $sessionId, string $now, string $expiresAt): void
    {
        if (isset($this->sessions[$sessionId])) {
            $this->sessions[$sessionId]['last_seen_at'] = $now;
            $this->sessions[$sessionId]['expires_at'] = $expiresAt;
        }
    }

    public function rotateCsrfToken(int $sessionId, string $csrfHash): void
    {
        if (isset($this->sessions[$sessionId])) {
            $this->sessions[$sessionId]['csrf_token_hash'] = $csrfHash;
        }
    }

    public function countAssessments(int $sessionId): int
    {
        $total = 0;
        foreach ($this->assessments as $assessment) {
            if ((int) $assessment['session_id'] === $sessionId && $assessment['status'] !== 'archived') {
                $total++;
            }
        }

        return $total;
    }

    public function createAssessment(int $sessionId, array $record): array
    {
        $this->assessmentCounter++;
        $row = $record;
        $row['id'] = $this->assessmentCounter;
        $row['session_id'] = $sessionId;
        $row['has_active_share'] = 0;
        $this->assessments[$this->assessmentCounter] = $row;
        $this->events[$this->assessmentCounter] = [];

        return $row;
    }

    public function listAssessments(int $sessionId): array
    {
        $rows = [];
        foreach ($this->assessments as $assessment) {
            if ((int) $assessment['session_id'] !== $sessionId || $assessment['status'] === 'archived') {
                continue;
            }
            $assessment['has_active_share'] = $this->hasActiveShare((int) $assessment['id'], gmdate('Y-m-d H:i:s')) ? 1 : 0;
            $rows[] = $assessment;
        }

        return $rows;
    }

    public function findAssessment(int $sessionId, string $publicId): ?array
    {
        foreach ($this->assessments as $assessment) {
            if ((int) $assessment['session_id'] === $sessionId && $assessment['publicId'] === $publicId) {
                $assessment['has_active_share'] = $this->hasActiveShare((int) $assessment['id'], gmdate('Y-m-d H:i:s')) ? 1 : 0;

                return $assessment;
            }
        }

        return null;
    }

    public function findAssessmentByPublicId(string $publicId): ?array
    {
        foreach ($this->assessments as $assessment) {
            if ($assessment['publicId'] === $publicId) {
                return $assessment;
            }
        }

        return null;
    }

    public function updateAssessment(int $assessmentId, int $sessionId, array $record): bool
    {
        $assessment = $this->assessments[$assessmentId] ?? null;
        if ($assessment === null || (int) $assessment['session_id'] !== $sessionId) {
            return false;
        }
        $updated = array_merge($assessment, $record);
        $updated['id'] = $assessmentId;
        $updated['session_id'] = $sessionId;
        $this->assessments[$assessmentId] = $updated;

        return true;
    }

    public function archiveAssessment(int $assessmentId, int $sessionId, string $now): bool
    {
        $assessment = $this->assessments[$assessmentId] ?? null;
        if ($assessment === null || (int) $assessment['session_id'] !== $sessionId) {
            return false;
        }
        $this->assessments[$assessmentId]['status'] = 'archived';
        $this->assessments[$assessmentId]['updatedAt'] = $now;

        return true;
    }

    public function replaceEvents(int $assessmentId, array $events): void
    {
        $this->events[$assessmentId] = $events;
    }

    public function listEvents(int $assessmentId): array
    {
        return $this->events[$assessmentId] ?? [];
    }

    public function createShare(int $assessmentId, string $tokenHash, ?string $expiresAt, string $now): void
    {
        $this->shareCounter++;
        $this->shares[$this->shareCounter] = [
            'id' => $this->shareCounter,
            'assessment_id' => $assessmentId,
            'token_hash' => $tokenHash,
            'created_at' => $now,
            'expires_at' => $expiresAt,
            'revoked_at' => null,
        ];
    }

    public function findActiveShareByAssessment(int $assessmentId, string $now): ?array
    {
        $found = null;
        foreach ($this->shares as $share) {
            if ((int) $share['assessment_id'] === $assessmentId && $this->isActive($share, $now)) {
                $found = $share;
            }
        }

        return $found;
    }

    public function findActiveShareByHash(string $tokenHash, string $now): ?array
    {
        foreach ($this->shares as $share) {
            if (hash_equals((string) $share['token_hash'], $tokenHash) && $this->isActive($share, $now)) {
                $assessment = $this->assessments[(int) $share['assessment_id']] ?? null;

                return $assessment === null ? null : $assessment;
            }
        }

        return null;
    }

    public function revokeShares(int $assessmentId, string $now): void
    {
        foreach ($this->shares as $index => $share) {
            if ((int) $share['assessment_id'] === $assessmentId && $share['revoked_at'] === null) {
                $this->shares[$index]['revoked_at'] = $now;
            }
        }
    }

    public function listScenarios(): array
    {
        return $this->scenarios;
    }

    public function methodologyVersionEnabled(string $version): bool
    {
        return in_array($version, $this->methodologyVersions, true);
    }

    /** @param array<string,mixed> $share */
    private function isActive(array $share, string $now): bool
    {
        if ($share['revoked_at'] !== null) {
            return false;
        }
        $expiresAt = $share['expires_at'];

        return $expiresAt === null || strtotime((string) $expiresAt) > strtotime($now);
    }

    private function hasActiveShare(int $assessmentId, string $now): bool
    {
        return $this->findActiveShareByAssessment($assessmentId, $now) !== null;
    }

    /** Test helper: forces a share link to expire. */
    public function expireSharesForTesting(int $assessmentId): void
    {
        foreach ($this->shares as $index => $share) {
            if ((int) $share['assessment_id'] === $assessmentId) {
                $this->shares[$index]['expires_at'] = gmdate('Y-m-d H:i:s', time() - 3600);
            }
        }
    }
}
