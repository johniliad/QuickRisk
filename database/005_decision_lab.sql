-- FAIR QuickRisk — Decision Lab and Board Risk Pack (migration 005)
--
-- Decision Lab reuses the QuickRisk engine for every number it reports. These tables store
-- the inputs, the provenance and the calculated result of a decision analysis; they never
-- store a calculation that PHP performed.
--
-- All tables live in the same `iliadis_quickrisk` database as the QuickRisk Live tables (001–004).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS treatment_library (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    treatment_id VARCHAR(64) NOT NULL,
    treatment_version VARCHAR(16) NOT NULL,
    name VARCHAR(160) NOT NULL,
    mechanism_group VARCHAR(32) NOT NULL,
    evidence_quality VARCHAR(32) NOT NULL,
    definition_json JSON NOT NULL,
    reviewed_at DATE NULL DEFAULT NULL,
    review_owner VARCHAR(160) NOT NULL DEFAULT '',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_treatment_library (treatment_id, treatment_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS custom_treatments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(26) NOT NULL,
    session_id BIGINT UNSIGNED NOT NULL,
    treatment_id VARCHAR(64) NOT NULL,
    name VARCHAR(160) NOT NULL,
    mechanism_group VARCHAR(32) NOT NULL,
    evidence_quality VARCHAR(32) NOT NULL,
    definition_json JSON NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_custom_treatments_public (public_id),
    KEY idx_custom_treatments_session (session_id, updated_at),
    CONSTRAINT fk_custom_treatments_session FOREIGN KEY (session_id)
        REFERENCES anonymous_sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS decision_assessments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(26) NOT NULL,
    session_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(160) NOT NULL DEFAULT '',
    quickrisk_model_id VARCHAR(32) NOT NULL,
    quickrisk_model_version VARCHAR(32) NOT NULL,
    decision_methodology_version VARCHAR(32) NOT NULL,
    board_pack_version VARCHAR(32) NOT NULL DEFAULT '',
    simulation_seed BIGINT UNSIGNED NOT NULL,
    iterations INT UNSIGNED NOT NULL,
    appetite_status VARCHAR(16) NOT NULL DEFAULT 'undefined',
    baseline_eal DECIMAL(18,2) NOT NULL,
    treated_eal DECIMAL(18,2) NOT NULL DEFAULT 0,
    initial_investment DECIMAL(18,2) NOT NULL DEFAULT 0,
    annual_operating_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
    recommended_portfolio_json JSON NOT NULL,
    selection_json JSON NOT NULL,
    appetite_json JSON NOT NULL,
    result_json JSON NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'saved',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_decision_assessments_public (public_id),
    KEY idx_decision_assessments_session (session_id, status, updated_at),
    CONSTRAINT fk_decision_assessments_session FOREIGN KEY (session_id)
        REFERENCES anonymous_sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS decision_share_links (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    decision_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NULL DEFAULT NULL,
    revoked_at DATETIME NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_decision_share_token (token_hash),
    KEY idx_decision_share_decision (decision_id, revoked_at),
    CONSTRAINT fk_decision_share_decision FOREIGN KEY (decision_id)
        REFERENCES decision_assessments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Decision Lab methodology versions accepted by the API.
CREATE TABLE IF NOT EXISTS decision_methodology_versions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    version VARCHAR(32) NOT NULL,
    description VARCHAR(255) NOT NULL DEFAULT '',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_decision_methodology_versions (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO decision_methodology_versions (version, description, enabled, created_at)
VALUES
    ('1.0', 'Decision Lab treatment analysis v1.0: paired driver effects, deterministic decision rules, Board Risk Pack 1.0.', 1, UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE description = VALUES(description), enabled = VALUES(enabled);
