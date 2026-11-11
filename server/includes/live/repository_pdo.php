<?php

declare(strict_types=1);

/**
 * QuickRisk Live — PDO repository.
 *
 * Every statement is prepared; no SQL is ever assembled from request input.
 */
final class QkLivePdoRepository implements QkLiveRepository
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function createSession(string $tokenHash, string $csrfHash, string $now, string $expiresAt): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO anonymous_sessions (session_token_hash, csrf_token_hash, created_at, last_seen_at, expires_at)
             VALUES (:token_hash, :csrf_hash, :created_at, :last_seen_at, :expires_at)'
        );
        $statement->execute([
            ':token_hash' => $tokenHash,
            ':csrf_hash' => $csrfHash,
            ':created_at' => $now,
            ':last_seen_at' => $now,
            ':expires_at' => $expiresAt,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function findSessionByTokenHash(string $tokenHash): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, session_token_hash, csrf_token_hash, created_at, last_seen_at, expires_at
             FROM anonymous_sessions WHERE session_token_hash = :token_hash LIMIT 1'
        );
        $statement->execute([':token_hash' => $tokenHash]);
        $row = $statement->fetch();

        return is_array($row) ? $row : null;
    }

    public function touchSession(int $sessionId, string $now, string $expiresAt): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE anonymous_sessions SET last_seen_at = :now, expires_at = :expires_at WHERE id = :id'
        );
        $statement->execute([':now' => $now, ':expires_at' => $expiresAt, ':id' => $sessionId]);
    }

    public function rotateCsrfToken(int $sessionId, string $csrfHash): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE anonymous_sessions SET csrf_token_hash = :csrf_hash WHERE id = :id'
        );
        $statement->execute([':csrf_hash' => $csrfHash, ':id' => $sessionId]);
    }

    public function countAssessments(int $sessionId): int
    {
        $statement = $this->pdo->prepare(
            'SELECT COUNT(*) AS total FROM assessments WHERE session_id = :session_id AND status <> :archived'
        );
        $statement->execute([':session_id' => $sessionId, ':archived' => 'archived']);

        return (int) ($statement->fetchColumn() ?: 0);
    }

    public function createAssessment(int $sessionId, array $record): array
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO assessments (
                public_id, session_id, title, scenario_id, scenario_name_snapshot, baseline_eal,
                baseline_model_id, baseline_model_version, telemetry_score, mitigation_factor, soc_multiplier,
                real_time_risk, risk_band, real_time_eal, methodology_version, input_state_json,
                risk_result_json, calculation_trace_json, status, created_at, updated_at
             ) VALUES (
                :public_id, :session_id, :title, :scenario_id, :scenario_name, :baseline_eal,
                :baseline_model_id, :baseline_model_version, :telemetry_score, :mitigation_factor, :soc_multiplier,
                :real_time_risk, :risk_band, :real_time_eal, :methodology_version, :input_state_json,
                :risk_result_json, :calculation_trace_json, :status, :created_at, :updated_at
             )'
        );
        $statement->execute($this->assessmentParameters($sessionId, $record));

        $row = $this->findAssessment($sessionId, (string) $record['publicId']);

        return $row ?? [];
    }

    public function listAssessments(int $sessionId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT a.*, EXISTS(
                 SELECT 1 FROM share_links s
                 WHERE s.assessment_id = a.id AND s.revoked_at IS NULL
                   AND (s.expires_at IS NULL OR s.expires_at > :now)
             ) AS has_active_share
             FROM assessments a
             WHERE a.session_id = :session_id AND a.status <> :archived
             ORDER BY a.updated_at DESC
             LIMIT 100'
        );
        $statement->execute([
            ':session_id' => $sessionId,
            ':archived' => 'archived',
            ':now' => gmdate('Y-m-d H:i:s'),
        ]);

        $rows = [];
        foreach ($statement->fetchAll() as $row) {
            $rows[] = $this->hydrate($row);
        }

        return $rows;
    }

    public function findAssessment(int $sessionId, string $publicId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT a.*, EXISTS(
                 SELECT 1 FROM share_links s
                 WHERE s.assessment_id = a.id AND s.revoked_at IS NULL
                   AND (s.expires_at IS NULL OR s.expires_at > :now)
             ) AS has_active_share
             FROM assessments a
             WHERE a.session_id = :session_id AND a.public_id = :public_id
             LIMIT 1'
        );
        $statement->execute([
            ':session_id' => $sessionId,
            ':public_id' => $publicId,
            ':now' => gmdate('Y-m-d H:i:s'),
        ]);
        $row = $statement->fetch();

        return is_array($row) ? $this->hydrate($row) : null;
    }

    public function findAssessmentByPublicId(string $publicId): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM assessments WHERE public_id = :public_id LIMIT 1');
        $statement->execute([':public_id' => $publicId]);
        $row = $statement->fetch();

        return is_array($row) ? $this->hydrate($row) : null;
    }

    public function updateAssessment(int $assessmentId, int $sessionId, array $record): bool
    {
        $statement = $this->pdo->prepare(
            'UPDATE assessments SET
                title = :title,
                scenario_id = :scenario_id,
                scenario_name_snapshot = :scenario_name,
                baseline_eal = :baseline_eal,
                baseline_model_id = :baseline_model_id,
                baseline_model_version = :baseline_model_version,
                telemetry_score = :telemetry_score,
                mitigation_factor = :mitigation_factor,
                soc_multiplier = :soc_multiplier,
                real_time_risk = :real_time_risk,
                risk_band = :risk_band,
                real_time_eal = :real_time_eal,
                methodology_version = :methodology_version,
                input_state_json = :input_state_json,
                risk_result_json = :risk_result_json,
                calculation_trace_json = :calculation_trace_json,
                updated_at = :updated_at
             WHERE id = :id AND session_id = :session_id'
        );
        $parameters = $this->assessmentParameters($sessionId, $record);
        unset($parameters[':public_id'], $parameters[':status'], $parameters[':created_at']);
        $parameters[':id'] = $assessmentId;
        $statement->execute($parameters);

        return $statement->rowCount() >= 0;
    }

    public function archiveAssessment(int $assessmentId, int $sessionId, string $now): bool
    {
        $statement = $this->pdo->prepare(
            'UPDATE assessments SET status = :status, updated_at = :now WHERE id = :id AND session_id = :session_id'
        );
        $statement->execute([
            ':status' => 'archived',
            ':now' => $now,
            ':id' => $assessmentId,
            ':session_id' => $sessionId,
        ]);

        return $statement->rowCount() > 0;
    }

    public function replaceEvents(int $assessmentId, array $events): void
    {
        $delete = $this->pdo->prepare('DELETE FROM assessment_events WHERE assessment_id = :assessment_id');
        $delete->execute([':assessment_id' => $assessmentId]);

        if ($events === []) {
            return;
        }

        $insert = $this->pdo->prepare(
            'INSERT INTO assessment_events (
                assessment_id, sequence_no, simulation_offset_ms, event_type, event_label,
                state_json, risk_result_json, created_at
             ) VALUES (
                :assessment_id, :sequence_no, :offset_ms, :event_type, :label,
                :state_json, :risk_result_json, :created_at
             )'
        );

        foreach ($events as $index => $event) {
            $insert->execute([
                ':assessment_id' => $assessmentId,
                ':sequence_no' => $index + 1,
                ':offset_ms' => (int) ($event['offsetMs'] ?? 0),
                ':event_type' => (string) ($event['eventType'] ?? 'STATE_RECORDED'),
                ':label' => (string) ($event['label'] ?? ''),
                ':state_json' => (string) ($event['stateJson'] ?? '{}'),
                ':risk_result_json' => (string) ($event['resultJson'] ?? '{}'),
                ':created_at' => (string) ($event['createdAt'] ?? gmdate('Y-m-d H:i:s')),
            ]);
        }
    }

    public function listEvents(int $assessmentId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT sequence_no, simulation_offset_ms, event_type, event_label, state_json, risk_result_json
             FROM assessment_events WHERE assessment_id = :assessment_id ORDER BY sequence_no ASC'
        );
        $statement->execute([':assessment_id' => $assessmentId]);

        $events = [];
        foreach ($statement->fetchAll() as $row) {
            $events[] = [
                'sequenceNo' => (int) $row['sequence_no'],
                'offsetMs' => (int) $row['simulation_offset_ms'],
                'eventType' => (string) $row['event_type'],
                'label' => (string) $row['event_label'],
                'stateJson' => (string) $row['state_json'],
                'resultJson' => (string) $row['risk_result_json'],
            ];
        }

        return $events;
    }

    /**
     * Maps a database row to the repository's storage-agnostic shape.
     *
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private function hydrate(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'publicId' => (string) $row['public_id'],
            'sessionId' => (int) $row['session_id'],
            'title' => (string) $row['title'],
            'scenarioId' => (string) $row['scenario_id'],
            'scenarioName' => (string) $row['scenario_name_snapshot'],
            'baselineEal' => (float) $row['baseline_eal'],
            'baselineModelId' => (string) ($row['baseline_model_id'] ?? ''),
            'baselineModelVersion' => (string) ($row['baseline_model_version'] ?? ''),
            'telemetryScore' => (float) $row['telemetry_score'],
            'mitigationFactor' => (float) $row['mitigation_factor'],
            'socMultiplier' => (float) $row['soc_multiplier'],
            'realTimeRisk' => (int) $row['real_time_risk'],
            'riskBand' => (string) $row['risk_band'],
            'realTimeEal' => (float) $row['real_time_eal'],
            'methodologyVersion' => (string) $row['methodology_version'],
            'inputStateJson' => (string) $row['input_state_json'],
            'riskResultJson' => (string) $row['risk_result_json'],
            'traceJson' => (string) $row['calculation_trace_json'],
            'status' => (string) $row['status'],
            'createdAt' => (string) $row['created_at'],
            'updatedAt' => (string) $row['updated_at'],
            'has_active_share' => (int) ($row['has_active_share'] ?? 0),
        ];
    }

    public function createShare(int $assessmentId, string $tokenHash, ?string $expiresAt, string $now): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO share_links (assessment_id, token_hash, created_at, expires_at)
             VALUES (:assessment_id, :token_hash, :created_at, :expires_at)'
        );
        $statement->execute([
            ':assessment_id' => $assessmentId,
            ':token_hash' => $tokenHash,
            ':created_at' => $now,
            ':expires_at' => $expiresAt,
        ]);
    }

    public function findActiveShareByAssessment(int $assessmentId, string $now): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT * FROM share_links
             WHERE assessment_id = :assessment_id AND revoked_at IS NULL
               AND (expires_at IS NULL OR expires_at > :now)
             ORDER BY id DESC LIMIT 1'
        );
        $statement->execute([':assessment_id' => $assessmentId, ':now' => $now]);
        $row = $statement->fetch();

        return is_array($row) ? $row : null;
    }

    public function findActiveShareByHash(string $tokenHash, string $now): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT a.* FROM share_links s
             INNER JOIN assessments a ON a.id = s.assessment_id
             WHERE s.token_hash = :token_hash AND s.revoked_at IS NULL
               AND (s.expires_at IS NULL OR s.expires_at > :now)
             LIMIT 1'
        );
        $statement->execute([':token_hash' => $tokenHash, ':now' => $now]);
        $row = $statement->fetch();

        return is_array($row) ? $this->hydrate($row) : null;
    }

    public function revokeShares(int $assessmentId, string $now): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE share_links SET revoked_at = :now WHERE assessment_id = :assessment_id AND revoked_at IS NULL'
        );
        $statement->execute([':now' => $now, ':assessment_id' => $assessmentId]);
    }

    public function listScenarios(): array
    {
        $statement = $this->pdo->query(
            'SELECT slug, name, category, short_description, long_description, scenario_version,
                    default_state_json, timeline_json, executive_summary_template
             FROM scenario_library WHERE enabled = 1 ORDER BY sort_order ASC, name ASC'
        );

        return $statement->fetchAll();
    }

    public function methodologyVersionEnabled(string $version): bool
    {
        $statement = $this->pdo->prepare(
            'SELECT 1 FROM methodology_versions WHERE version = :version AND enabled = 1 LIMIT 1'
        );
        $statement->execute([':version' => $version]);

        return $statement->fetchColumn() !== false;
    }

    /**
     * @param array<string,mixed> $record
     * @return array<string,mixed>
     */
    private function assessmentParameters(int $sessionId, array $record): array
    {
        return [
            ':public_id' => (string) $record['publicId'],
            ':session_id' => $sessionId,
            ':title' => (string) $record['title'],
            ':scenario_id' => (string) $record['scenarioId'],
            ':scenario_name' => (string) $record['scenarioName'],
            ':baseline_eal' => (float) $record['baselineEal'],
            ':baseline_model_id' => (string) $record['baselineModelId'],
            ':baseline_model_version' => (string) $record['baselineModelVersion'],
            ':telemetry_score' => (float) $record['telemetryScore'],
            ':mitigation_factor' => (float) $record['mitigationFactor'],
            ':soc_multiplier' => (float) $record['socMultiplier'],
            ':real_time_risk' => (int) $record['realTimeRisk'],
            ':risk_band' => (string) $record['riskBand'],
            ':real_time_eal' => (float) $record['realTimeEal'],
            ':methodology_version' => (string) $record['methodologyVersion'],
            ':input_state_json' => (string) $record['inputStateJson'],
            ':risk_result_json' => (string) $record['riskResultJson'],
            ':calculation_trace_json' => (string) $record['traceJson'],
            ':status' => (string) $record['status'],
            ':created_at' => (string) $record['createdAt'],
            ':updated_at' => (string) $record['updatedAt'],
        ];
    }
}
