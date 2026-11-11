-- FAIR QuickRisk Live — methodology versions (migration 002)
--
-- The API accepts a saved assessment only when its methodology version is enabled here. That
-- is why a stored assessment keeps its historical meaning: raising the methodology means adding
-- a new row, never editing an old one.

INSERT INTO methodology_versions (version, description, enabled, created_at)
VALUES
    ('1.0', 'QuickRisk Live deterministic SOC overlay, v1.0 coefficients and bands.', 1, UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE description = VALUES(description), enabled = VALUES(enabled);
