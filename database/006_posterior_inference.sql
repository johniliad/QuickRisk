-- FAIR QuickRisk 2.0 — Decision Lab methodology identity.
-- Existing 1.0 records remain readable; no assessment, evidence or posterior data is stored.

INSERT INTO decision_methodology_versions (version, description, enabled, created_at)
VALUES ('2.0', 'Decision Lab 2.0 — posterior-predictive treatment analysis; Board Risk Pack 2.0.', 1, UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE description = VALUES(description), enabled = 1;
