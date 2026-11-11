-- FAIR QuickRisk Live — demonstration scenario library (migration 003)
--
-- These are deterministic synthetic SOC sequences. They store input states and timeline
-- steps only: the score is always recalculated by the TypeScript engine when a preset is
-- applied, so a preset can never carry a stale result.
--
-- The timeline object shape is {offsetMs,label,state}; each state is a SOCInputState.

SET NAMES utf8mb4;

INSERT INTO scenario_library
    (slug, name, category, short_description, long_description, scenario_version,
     default_state_json, timeline_json, executive_summary_template, enabled, sort_order, created_at, updated_at)
VALUES
(
    'ransomware-outbreak',
    'Ransomware Outbreak',
    'intrusion',
    'Criminal intrusion escalates to active compromise, followed by containment.',
    'A simulated ransomware sequence: an IOC match is confirmed by EDR, the incident reaches active compromise, an alert burst follows, and the response team then isolates the host, blocks the network path and revokes the compromised identity. The sequence demonstrates how telemetry raises the index and how response actions reduce it again.',
    '1.0',
    '{"scenarioId":"S1","incidentStage":"compromise","iocCount":6,"iocConfidence":0.8,"alertVelocity":3.0,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}',
    '[{"offsetMs":0,"label":"Suspicious activity","state":{"scenarioId":"S1","incidentStage":"none","iocCount":1,"iocConfidence":0.6,"alertVelocity":1.5,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":120000,"label":"IOC match","state":{"scenarioId":"S1","incidentStage":"triage","iocCount":2,"iocConfidence":0.7,"alertVelocity":2.0,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":240000,"label":"EDR confirmation","state":{"scenarioId":"S1","incidentStage":"triage","iocCount":3,"iocConfidence":0.8,"alertVelocity":2.5,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":360000,"label":"Active compromise","state":{"scenarioId":"S1","incidentStage":"compromise","iocCount":6,"iocConfidence":0.8,"alertVelocity":3.0,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":480000,"label":"Alert burst","state":{"scenarioId":"S1","incidentStage":"compromise","iocCount":9,"iocConfidence":0.85,"alertVelocity":4.5,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":600000,"label":"Host isolation","state":{"scenarioId":"S1","incidentStage":"compromise","iocCount":9,"iocConfidence":0.85,"alertVelocity":4.5,"isEdrIsolated":true,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":720000,"label":"Network block","state":{"scenarioId":"S1","incidentStage":"compromise","iocCount":9,"iocConfidence":0.85,"alertVelocity":4.0,"isEdrIsolated":true,"isNetworkBlocked":true,"isIdentityRevoked":false}},
      {"offsetMs":840000,"label":"Identity response","state":{"scenarioId":"S1","incidentStage":"compromise","iocCount":8,"iocConfidence":0.8,"alertVelocity":3.5,"isEdrIsolated":true,"isNetworkBlocked":true,"isIdentityRevoked":true}},
      {"offsetMs":960000,"label":"Containment","state":{"scenarioId":"S1","incidentStage":"triage","iocCount":4,"iocConfidence":0.7,"alertVelocity":2.0,"isEdrIsolated":true,"isNetworkBlocked":true,"isIdentityRevoked":true}}]',
    'The selected QuickRisk scenario is being evaluated against a simulated ransomware SOC sequence. Telemetry rises to active compromise and then falls as containment actions are applied.',
    1, 10, UTC_TIMESTAMP(), UTC_TIMESTAMP()
)
ON DUPLICATE KEY UPDATE name = VALUES(name), short_description = VALUES(short_description), long_description = VALUES(long_description), default_state_json = VALUES(default_state_json), timeline_json = VALUES(timeline_json), executive_summary_template = VALUES(executive_summary_template), scenario_version = VALUES(scenario_version), sort_order = VALUES(sort_order), updated_at = UTC_TIMESTAMP();
