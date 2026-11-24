<?php

declare(strict_types=1);

/**
 * QuickRisk Decision Lab — in-memory repository.
 *
 * Used by the automated test suite so save and share handlers can run without MySQL. Production
 * never uses this class: the endpoint scripts construct the PDO repository.
 */
final class QkDecisionArrayRepository implements QkDecisionRepository
{
    /** @var array<string,array<string,mixed>> */
    private array $decisions = [];
    /** @var array<int,array<string,mixed>> */
    private array $shares = [];
    /** @var array<int,array<string,mixed>> */
    private array $customTreatments = [];
    /** @var array<int,string> */
    private array $methodologyVersions;

    private int $decisionCounter = 0;
    private int $shareCounter = 0;
    private int $customCounter = 0;

    /** @param array<int,string> $methodologyVersions */
    public function __construct(array $methodologyVersions = ['2.0', '1.0'])
    {
        $this->methodologyVersions = $methodologyVersions;
    }

    public function createDecision(int $sessionId, array $record): array
    {
        $this->decisionCounter++;
        $row = $record;
        $row['id'] = $this->decisionCounter;
        $row['session_id'] = $sessionId;
        $row['status'] = 'saved';
        $row['hasActiveShare'] = false;
        $this->decisions[(string) $record['publicId']] = $row;

        return $row;
    }

    public function listDecisions(int $sessionId): array
    {
        $rows = [];
        foreach ($this->decisions as $row) {
            if ((int) $row['session_id'] === $sessionId && (string) $row['status'] !== 'archived') {
                $row['hasActiveShare'] = $this->hasActiveShareForDecision((string) $row['publicId']);
                $rows[] = $row;
            }
        }

        return array_reverse($rows);
    }

    public function findDecision(int $sessionId, string $publicId): ?array
    {
        $row = $this->decisions[$publicId] ?? null;
        if ($row === null || (int) $row['session_id'] !== $sessionId) {
            return null;
        }
        $row['hasActiveShare'] = $this->hasActiveShareForDecision($publicId);

        return $row;
    }

    public function archiveDecision(string $publicId, int $sessionId, string $now): bool
    {
        $row = $this->findDecision($sessionId, $publicId);
        if ($row === null) {
            return false;
        }
        $this->decisions[$publicId]['status'] = 'archived';
        $this->decisions[$publicId]['updatedAt'] = $now;

        return true;
    }

    public function createDecisionShare(string $publicId, string $tokenHash, ?string $expiresAt, string $now): void
    {
        $row = $this->decisions[$publicId] ?? null;
        if ($row === null) {
            return;
        }
        $this->shareCounter++;
        $this->shares[$this->shareCounter] = [
            'id' => $this->shareCounter,
            'decision_id' => (int) $row['id'],
            'token_hash' => $tokenHash,
            'created_at' => $now,
            'expires_at' => $expiresAt,
            'revoked_at' => null,
        ];
    }

    public function findActiveShareByHash(string $tokenHash, string $now): ?array
    {
        foreach ($this->shares as $share) {
            if (!hash_equals((string) $share['token_hash'], $tokenHash)) {
                continue;
            }
            if ($share['revoked_at'] !== null) {
                continue;
            }
            if ($share['expires_at'] !== null && strtotime((string) $share['expires_at']) <= strtotime($now)) {
                continue;
            }
            foreach ($this->decisions as $row) {
                if ((int) $row['id'] === (int) $share['decision_id'] && (string) $row['status'] !== 'archived') {
                    return $row;
                }
            }
        }

        return null;
    }

    public function revokeDecisionShares(string $publicId, string $now): void
    {
        $row = $this->decisions[$publicId] ?? null;
        if ($row === null) {
            return;
        }
        foreach ($this->shares as $index => $share) {
            if ((int) $share['decision_id'] === (int) $row['id'] && $share['revoked_at'] === null) {
                $this->shares[$index]['revoked_at'] = $now;
            }
        }
    }

    public function listCustomTreatments(int $sessionId): array
    {
        $rows = array_values(array_filter(
            $this->customTreatments,
            static fn (array $entry): bool => (int) $entry['session_id'] === $sessionId
        ));

        return array_map(fn (array $entry): array => $this->decodeCustomTreatment($entry), $rows);
    }

    public function createCustomTreatment(int $sessionId, array $record): array
    {
        $this->customCounter++;
        $row = $record;
        $row['id'] = $this->customCounter;
        $row['session_id'] = $sessionId;
        $this->customTreatments[$this->customCounter] = $row;

        return $this->decodeCustomTreatment($row);
    }

    /**
     * Mirrors the PDO repository, which returns the definition as decoded data rather than the
     * stored JSON text.
     *
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private function decodeCustomTreatment(array $row): array
    {
        if (isset($row['definitionJson'])) {
            $decoded = json_decode((string) $row['definitionJson'], true);
            $row['definition'] = is_array($decoded) ? $decoded : [];
            unset($row['definitionJson']);
        }

        return $row;
    }

    public function deleteCustomTreatment(string $publicId, int $sessionId): bool
    {
        foreach ($this->customTreatments as $index => $row) {
            if ((string) $row['publicId'] === $publicId && (int) $row['session_id'] === $sessionId) {
                unset($this->customTreatments[$index]);

                return true;
            }
        }

        return false;
    }

    public function methodologyVersionEnabled(string $version): bool
    {
        return in_array($version, $this->methodologyVersions, true);
    }

    /** True when the decision has a non-revoked, non-expired share link. */
    private function hasActiveShareForDecision(string $publicId): bool
    {
        $row = $this->decisions[$publicId] ?? null;
        if ($row === null) {
            return false;
        }
        $now = time();
        foreach ($this->shares as $share) {
            if ((int) $share['decision_id'] !== (int) $row['id'] || $share['revoked_at'] !== null) {
                continue;
            }
            $expiresAt = $share['expires_at'];
            if ($expiresAt === null || (strtotime((string) $expiresAt) > $now)) {
                return true;
            }
        }

        return false;
    }

    /** Test helper: number of stored decision analyses. */
    public function countDecisions(): int
    {
        return count($this->decisions);
    }

    /** Test helper: number of stored share links. */
    public function countShares(): int
    {
        return count($this->shares);
    }

    /** Test helper: mark a stored analysis archived without going through the handler. */
    public function markArchivedForTesting(string $publicId): void
    {
        if (isset($this->decisions[$publicId])) {
            $this->decisions[$publicId]['status'] = 'archived';
        }
    }
}
