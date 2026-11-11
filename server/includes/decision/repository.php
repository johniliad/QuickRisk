<?php

declare(strict_types=1);

/**
 * QuickRisk Decision Lab — persistence.
 *
 * A narrow repository for decision assessments, their read-only share links and the
 * session-owned custom treatments. It stores inputs, provenance and results; it never stores a
 * calculated risk value that PHP produced, because PHP does not produce any.
 */

interface QkDecisionRepository
{
    /**
     * @param array<string,mixed> $record
     * @return array<string,mixed>
     */
    public function createDecision(int $sessionId, array $record): array;

    /** @return array<int,array<string,mixed>> */
    public function listDecisions(int $sessionId): array;

    /** @return array<string,mixed>|null */
    public function findDecision(int $sessionId, string $publicId): ?array;

    public function archiveDecision(string $publicId, int $sessionId, string $now): bool;

    public function createDecisionShare(string $publicId, string $tokenHash, ?string $expiresAt, string $now): void;

    /** Returns the decision row for an active share token, or null. */
    public function findActiveShareByHash(string $tokenHash, string $now): ?array;

    public function revokeDecisionShares(string $publicId, string $now): void;

    /** @return array<int,array<string,mixed>> */
    public function listCustomTreatments(int $sessionId): array;

    /**
     * @param array<string,mixed> $record
     * @return array<string,mixed>
     */
    public function createCustomTreatment(int $sessionId, array $record): array;

    public function deleteCustomTreatment(string $publicId, int $sessionId): bool;

    public function methodologyVersionEnabled(string $version): bool;
}

/**
 * PDO implementation. Every statement is prepared.
 */
final class QkDecisionPdoRepository implements QkDecisionRepository
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function createDecision(int $sessionId, array $record): array
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO decision_assessments (
                public_id, session_id, title, quickrisk_model_id, quickrisk_model_version,
                decision_methodology_version, board_pack_version, simulation_seed, iterations,
                appetite_status, baseline_eal, treated_eal, initial_investment, annual_operating_cost,
                recommended_portfolio_json, selection_json, appetite_json, result_json,
                status, created_at, updated_at
             ) VALUES (
                :public_id, :session_id, :title, :model_id, :model_version,
                :decision_version, :board_version, :seed, :iterations,
                :appetite_status, :baseline_eal, :treated_eal, :initial_investment, :annual_operating,
                :recommended_json, :selection_json, :appetite_json, :result_json,
                :status, :created_at, :updated_at
             )'
        );
        $statement->execute([
            ':public_id' => (string) $record['publicId'],
            ':session_id' => $sessionId,
            ':title' => (string) $record['title'],
            ':model_id' => (string) $record['quickriskModelId'],
            ':model_version' => (string) $record['quickriskModelVersion'],
            ':decision_version' => (string) $record['decisionMethodologyVersion'],
            ':board_version' => (string) $record['boardPackVersion'],
            ':seed' => (int) $record['simulationSeed'],
            ':iterations' => (int) $record['iterations'],
            ':appetite_status' => (string) $record['appetiteStatus'],
            ':baseline_eal' => (float) $record['baselineEal'],
            ':treated_eal' => (float) $record['treatedEal'],
            ':initial_investment' => (float) $record['initialInvestment'],
            ':annual_operating' => (float) $record['annualOperatingCost'],
            ':recommended_json' => (string) $record['recommendedJson'],
            ':selection_json' => (string) $record['selectionJson'],
            ':appetite_json' => (string) $record['appetiteJson'],
            ':result_json' => (string) $record['resultJson'],
            ':status' => 'saved',
            ':created_at' => (string) $record['createdAt'],
            ':updated_at' => (string) $record['updatedAt'],
        ]);

        return $this->findDecision($sessionId, (string) $record['publicId']) ?? [];
    }

    public function listDecisions(int $sessionId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT * FROM decision_assessments
             WHERE session_id = :session_id AND status <> :archived
             ORDER BY updated_at DESC LIMIT 100'
        );
        $statement->execute([':session_id' => $sessionId, ':archived' => 'archived']);

        $rows = [];
        foreach ($statement->fetchAll() as $row) {
            $rows[] = $this->hydrate($row, false);
        }

        return $rows;
    }

    public function findDecision(int $sessionId, string $publicId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT * FROM decision_assessments
             WHERE session_id = :session_id AND public_id = :public_id LIMIT 1'
        );
        $statement->execute([':session_id' => $sessionId, ':public_id' => $publicId]);
        $row = $statement->fetch();

        return is_array($row) ? $this->hydrate($row, true) : null;
    }

    public function archiveDecision(string $publicId, int $sessionId, string $now): bool
    {
        $statement = $this->pdo->prepare(
            'UPDATE decision_assessments SET status = :status, updated_at = :now
             WHERE public_id = :public_id AND session_id = :session_id'
        );
        $statement->execute([
            ':status' => 'archived',
            ':now' => $now,
            ':public_id' => $publicId,
            ':session_id' => $sessionId,
        ]);

        return $statement->rowCount() > 0;
    }

    public function createDecisionShare(string $publicId, string $tokenHash, ?string $expiresAt, string $now): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO decision_share_links (decision_id, token_hash, created_at, expires_at)
             SELECT id, :token_hash, :created_at, :expires_at
             FROM decision_assessments WHERE public_id = :public_id'
        );
        $statement->execute([
            ':token_hash' => $tokenHash,
            ':created_at' => $now,
            ':expires_at' => $expiresAt,
            ':public_id' => $publicId,
        ]);
    }

    public function findActiveShareByHash(string $tokenHash, string $now): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT d.* FROM decision_share_links s
             INNER JOIN decision_assessments d ON d.id = s.decision_id
             WHERE s.token_hash = :token_hash AND s.revoked_at IS NULL
               AND (s.expires_at IS NULL OR s.expires_at > :now)
             LIMIT 1'
        );
        $statement->execute([':token_hash' => $tokenHash, ':now' => $now]);
        $row = $statement->fetch();

        return is_array($row) ? $this->hydrate($row, true) : null;
    }

    public function revokeDecisionShares(string $publicId, string $now): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE decision_share_links s
             INNER JOIN decision_assessments d ON d.id = s.decision_id
             SET s.revoked_at = :now
             WHERE d.public_id = :public_id AND s.revoked_at IS NULL'
        );
        $statement->execute([':now' => $now, ':public_id' => $publicId]);
    }

    public function listCustomTreatments(int $sessionId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT public_id, treatment_id, name, mechanism_group, evidence_quality, definition_json, created_at
             FROM custom_treatments WHERE session_id = :session_id ORDER BY updated_at DESC LIMIT 100'
        );
        $statement->execute([':session_id' => $sessionId]);

        $rows = [];
        foreach ($statement->fetchAll() as $row) {
            $definition = json_decode((string) $row['definition_json'], true);
            $rows[] = [
                'publicId' => (string) $row['public_id'],
                'treatmentId' => (string) $row['treatment_id'],
                'name' => (string) $row['name'],
                'mechanismGroup' => (string) $row['mechanism_group'],
                'evidenceQuality' => (string) $row['evidence_quality'],
                'definition' => is_array($definition) ? $definition : [],
                'createdAt' => (string) $row['created_at'],
            ];
        }

        return $rows;
    }


    public function createCustomTreatment(int $sessionId, array $record): array
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO custom_treatments (
                public_id, session_id, treatment_id, name, mechanism_group, evidence_quality,
                definition_json, created_at, updated_at
             ) VALUES (
                :public_id, :session_id, :treatment_id, :name, :mechanism_group, :evidence_quality,
                :definition_json, :created_at, :updated_at
             )'
        );
        $statement->execute([
            ':public_id' => (string) $record['publicId'],
            ':session_id' => $sessionId,
            ':treatment_id' => (string) $record['treatmentId'],
            ':name' => (string) $record['name'],
            ':mechanism_group' => (string) $record['mechanismGroup'],
            ':evidence_quality' => (string) $record['evidenceQuality'],
            ':definition_json' => (string) $record['definitionJson'],
            ':created_at' => (string) $record['createdAt'],
            ':updated_at' => (string) $record['updatedAt'],
        ]);

        return [
            'publicId' => (string) $record['publicId'],
            'treatmentId' => (string) $record['treatmentId'],
            'name' => (string) $record['name'],
            'mechanismGroup' => (string) $record['mechanismGroup'],
            'evidenceQuality' => (string) $record['evidenceQuality'],
            'definition' => json_decode((string) $record['definitionJson'], true) ?: [],
            'createdAt' => (string) $record['createdAt'],
        ];
    }

    public function deleteCustomTreatment(string $publicId, int $sessionId): bool
    {
        $statement = $this->pdo->prepare(
            'DELETE FROM custom_treatments WHERE public_id = :public_id AND session_id = :session_id'
        );
        $statement->execute([':public_id' => $publicId, ':session_id' => $sessionId]);

        return $statement->rowCount() > 0;
    }

    public function methodologyVersionEnabled(string $version): bool
    {
        $statement = $this->pdo->prepare(
            'SELECT 1 FROM decision_methodology_versions WHERE version = :version AND enabled = 1 LIMIT 1'
        );
        $statement->execute([':version' => $version]);

        return $statement->fetchColumn() !== false;
    }

    /**
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private function hydrate(array $row, bool $withResult): array
    {
        $hydrated = [
            'publicId' => (string) $row['public_id'],
            'title' => (string) $row['title'],
            'quickriskModelId' => (string) $row['quickrisk_model_id'],
            'quickriskModelVersion' => (string) $row['quickrisk_model_version'],
            'decisionMethodologyVersion' => (string) $row['decision_methodology_version'],
            'boardPackVersion' => (string) $row['board_pack_version'],
            'simulationSeed' => (int) $row['simulation_seed'],
            'iterations' => (int) $row['iterations'],
            'appetiteStatus' => (string) $row['appetite_status'],
            'baselineEal' => (float) $row['baseline_eal'],
            'treatedEal' => (float) $row['treated_eal'],
            'initialInvestment' => (float) $row['initial_investment'],
            'annualOperatingCost' => (float) $row['annual_operating_cost'],
            'status' => (string) $row['status'],
            'createdAt' => (string) $row['created_at'],
            'updatedAt' => (string) $row['updated_at'],
        ];

        if ($withResult) {
            $hydrated['recommendedPortfolio'] = json_decode((string) $row['recommended_portfolio_json'], true) ?: [];
            $hydrated['selection'] = json_decode((string) $row['selection_json'], true) ?: [];
            $hydrated['appetite'] = json_decode((string) $row['appetite_json'], true) ?: [];
            $hydrated['result'] = json_decode((string) $row['result_json'], true) ?: [];
        }

        return $hydrated;
    }
}

