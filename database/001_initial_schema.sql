-- FAIR QuickRisk Live — initial schema (migration 001)
--
-- InnoDB + utf8mb4. The risk mathematics is NOT stored here as a computation: these tables
-- persist the state and the result that the TypeScript engine calculated in the browser.
--
-- Run once, in order: 001 -> 002 -> 003.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS anonymous_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_token_hash CHAR(64) NOT NULL,
    csrf_token_hash CHAR(64) NOT NULL,
    created_at DATETIME NOT NULL,
    last_seen_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_anonymous_sessions_token (session_token_hash),
    KEY idx_anonymous_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assessments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(26) NOT NULL,
    session_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(160) NOT NULL DEFAULT '',
    scenario_id VARCHAR(64) NOT NULL,
    scenario_name_snapshot VARCHAR(160) NOT NULL,
    baseline_eal DECIMAL(18,2) NOT NULL,
    baseline_model_id VARCHAR(32) NOT NULL DEFAULT '',
    baseline_model_version VARCHAR(32) NOT NULL DEFAULT '',
    telemetry_score DECIMAL(6,2) NOT NULL,
    mitigation_factor DECIMAL(8,6) NOT NULL,
    soc_multiplier DECIMAL(8,4) NOT NULL,
    real_time_risk TINYINT UNSIGNED NOT NULL,
    risk_band VARCHAR(16) NOT NULL,
    real_time_eal DECIMAL(18,2) NOT NULL,
    methodology_version VARCHAR(32) NOT NULL,
    input_state_json JSON NOT NULL,
    risk_result_json JSON NOT NULL,
    calculation_trace_json JSON NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'saved',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_assessments_public_id (public_id),
    KEY idx_assessments_session (session_id, status, updated_at),
    CONSTRAINT fk_assessments_session FOREIGN KEY (session_id)
        REFERENCES anonymous_sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assessment_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    assessment_id BIGINT UNSIGNED NOT NULL,
    sequence_no INT UNSIGNED NOT NULL,
    simulation_offset_ms BIGINT UNSIGNED NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    event_label VARCHAR(160) NOT NULL DEFAULT '',
    state_json JSON NOT NULL,
    risk_result_json JSON NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_assessment_events_sequence (assessment_id, sequence_no),
    CONSTRAINT fk_assessment_events_assessment FOREIGN KEY (assessment_id)
        REFERENCES assessments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS share_links (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    assessment_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NULL DEFAULT NULL,
    revoked_at DATETIME NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_share_links_token (token_hash),
    KEY idx_share_links_assessment (assessment_id, revoked_at),
    CONSTRAINT fk_share_links_assessment FOREIGN KEY (assessment_id)
        REFERENCES assessments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scenario_library (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug VARCHAR(64) NOT NULL,
    name VARCHAR(160) NOT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'demonstration',
    short_description VARCHAR(255) NOT NULL DEFAULT '',
    long_description TEXT NOT NULL,
    scenario_version VARCHAR(16) NOT NULL DEFAULT '1.0',
    default_state_json JSON NOT NULL,
    timeline_json JSON NOT NULL,
    executive_summary_template TEXT NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_scenario_library_slug (slug),
    KEY idx_scenario_library_enabled (enabled, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS methodology_versions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    version VARCHAR(32) NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_methodology_versions_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assessment_snapshots (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    assessment_id BIGINT UNSIGNED NOT NULL,
    sequence_no INT UNSIGNED NOT NULL,
    snapshot_label VARCHAR(160) NOT NULL DEFAULT '',
    input_state_json JSON NOT NULL,
    risk_result_json JSON NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    KEY idx_assessment_snapshots_assessment (assessment_id, sequence_no),
    CONSTRAINT fk_assessment_snapshots_assessment FOREIGN KEY (assessment_id)
        REFERENCES assessments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
