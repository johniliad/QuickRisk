-- FAIR QuickRisk Live — additional demonstration scenarios (migration 004)
--
-- Same shape and rules as migration 003: deterministic states only, no stored scores.

SET NAMES utf8mb4;

INSERT INTO scenario_library
    (slug, name, category, short_description, long_description, scenario_version,
     default_state_json, timeline_json, executive_summary_template, enabled, sort_order, created_at, updated_at)
VALUES
(
    'identity-compromise',
    'Identity Compromise',
    'identity',
    'Credential anomaly escalates to identity confirmation, then identity response.',
    'A simulated identity sequence: a suspicious authentication is followed by a credential anomaly, the identity team confirms the compromise, and the account is revoked. It demonstrates how an early identity response keeps the modelled index below the critical band.',
    '1.0',
    '{"scenarioId":"S2","incidentStage":"anomaly","iocCount":3,"iocConfidence":0.85,"alertVelocity":2.0,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":true}',
    '[{"offsetMs":0,"label":"Suspicious authentication","state":{"scenarioId":"S2","incidentStage":"none","iocCount":1,"iocConfidence":0.7,"alertVelocity":1.5,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":false}},
      {"offsetMs":90000,"label":"Credential anomaly","state":{"scenarioId":"S2","incidentStage":"anomaly","iocCount":2,"iocConfidence":0.8,"alertVelocity":2.0,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":false}},
      {"offsetMs":180000,"label":"Identity confirmation","state":{"scenarioId":"S2","incidentStage":"anomaly","iocCount":3,"iocConfidence":0.85,"alertVelocity":2.0,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":false}},
      {"offsetMs":300000,"label":"Account revocation","state":{"scenarioId":"S2","incidentStage":"anomaly","iocCount":3,"iocConfidence":0.85,"alertVelocity":2.0,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":true}},
      {"offsetMs":420000,"label":"MFA enforcement","state":{"scenarioId":"S2","incidentStage":"triage","iocCount":2,"iocConfidence":0.8,"alertVelocity":1.5,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":true}},
      {"offsetMs":540000,"label":"Containment","state":{"scenarioId":"S2","incidentStage":"triage","iocCount":1,"iocConfidence":0.7,"alertVelocity":1.0,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":true}}]',
    'The selected QuickRisk scenario is being evaluated against a simulated identity-compromise SOC sequence. Identity response is applied early, which keeps the modelled index in the lower bands.',
    1, 20, UTC_TIMESTAMP(), UTC_TIMESTAMP()
),
(
    'public-vulnerability-exploitation',
    'Public Vulnerability Exploitation',
    'vulnerability',
    'Internet-facing exploitation with high-confidence indicators and network blocking.',
    'A simulated exploitation sequence against an internet-facing service: scanning, a high-confidence IOC match, confirmed exploitation activity, then network blocking and restoration. It demonstrates the effect of a high telemetry score combined with one strong control.',
    '1.0',
    '{"scenarioId":"S3","incidentStage":"compromise","iocCount":8,"iocConfidence":0.95,"alertVelocity":4.0,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":false}',
    '[{"offsetMs":0,"label":"External scanning","state":{"scenarioId":"S3","incidentStage":"triage","iocCount":2,"iocConfidence":0.8,"alertVelocity":2.0,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":120000,"label":"Exploit attempt detected","state":{"scenarioId":"S3","incidentStage":"anomaly","iocCount":5,"iocConfidence":0.9,"alertVelocity":3.0,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":240000,"label":"Exploitation confirmed","state":{"scenarioId":"S3","incidentStage":"compromise","iocCount":8,"iocConfidence":0.95,"alertVelocity":4.0,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":360000,"label":"Perimeter block","state":{"scenarioId":"S3","incidentStage":"compromise","iocCount":8,"iocConfidence":0.95,"alertVelocity":4.0,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":false}},
      {"offsetMs":480000,"label":"Service restored","state":{"scenarioId":"S3","incidentStage":"anomaly","iocCount":4,"iocConfidence":0.85,"alertVelocity":2.0,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":false}}]',
    'The selected QuickRisk scenario is being evaluated against a simulated exploitation sequence for a public-facing service. Telemetry is driven by high-confidence indicators and a fast alert rate.',
    1, 30, UTC_TIMESTAMP(), UTC_TIMESTAMP()
),
(
    'ddos-service-disruption',
    'DDoS',
    'availability',
    'High-volume denial-of-service pressure with mitigation, on an availability scenario.',
    'A simulated denial-of-service sequence: probing traffic rises, a volumetric attempt begins, mitigation is enabled and the service recovers. Alert velocity dominates the telemetry, which shows how volume alone drives the index without implying a compromise.',
    '1.0',
    '{"scenarioId":"S5","incidentStage":"triage","iocCount":4,"iocConfidence":0.7,"alertVelocity":4.0,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":false}',
    '[{"offsetMs":0,"label":"Probing traffic","state":{"scenarioId":"S5","incidentStage":"none","iocCount":1,"iocConfidence":0.6,"alertVelocity":2.0,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":60000,"label":"Volumetric attempt","state":{"scenarioId":"S5","incidentStage":"triage","iocCount":3,"iocConfidence":0.7,"alertVelocity":4.0,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":120000,"label":"Mitigation enabled","state":{"scenarioId":"S5","incidentStage":"triage","iocCount":4,"iocConfidence":0.7,"alertVelocity":4.5,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":false}},
      {"offsetMs":180000,"label":"Service recovered","state":{"scenarioId":"S5","incidentStage":"none","iocCount":1,"iocConfidence":0.6,"alertVelocity":1.5,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":false}}]',
    'The selected QuickRisk availability scenario is being evaluated against a simulated denial-of-service SOC sequence. The index is driven by alert volume and falls once mitigation is enabled.',
    1, 40, UTC_TIMESTAMP(), UTC_TIMESTAMP()
),
(
    'supplier-attack',
    'Supplier Attack',
    'supply-chain',
    'Supplier-originated incident with third-party telemetry and network containment.',
    'A simulated supplier-compromise sequence expressed through the supported SOC fields: third-party indicators, an anomaly report from the provider, then containment of the inbound path. Supplier-specific telemetry would require a methodology revision.',
    '1.0',
    '{"scenarioId":"S4","incidentStage":"anomaly","iocCount":5,"iocConfidence":0.75,"alertVelocity":2.5,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}',
    '[{"offsetMs":0,"label":"Provider advisory","state":{"scenarioId":"S4","incidentStage":"triage","iocCount":2,"iocConfidence":0.6,"alertVelocity":1.5,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":120000,"label":"Third-party indicators","state":{"scenarioId":"S4","incidentStage":"anomaly","iocCount":5,"iocConfidence":0.75,"alertVelocity":2.5,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":240000,"label":"Inbound path blocked","state":{"scenarioId":"S4","incidentStage":"anomaly","iocCount":5,"iocConfidence":0.75,"alertVelocity":2.5,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":false}},
      {"offsetMs":360000,"label":"Supplier containment confirmed","state":{"scenarioId":"S4","incidentStage":"triage","iocCount":2,"iocConfidence":0.6,"alertVelocity":1.0,"isEdrIsolated":false,"isNetworkBlocked":true,"isIdentityRevoked":false}}]',
    'The selected QuickRisk third-party scenario is being evaluated against a simulated supplier SOC sequence. The narrative is expressed through the supported telemetry fields.',
    1, 50, UTC_TIMESTAMP(), UTC_TIMESTAMP()
),
(
    'soc-containment',
    'SOC Containment',
    'response',
    'High telemetry with no mitigation, progressively contained by three response actions.',
    'A response-focused sequence: the highest telemetry state is held constant while EDR isolation, network blocking and identity response are enabled one at a time. It isolates the effect of the response actions from the effect of the telemetry.',
    '1.0',
    '{"scenarioId":"S1","incidentStage":"compromise","iocCount":10,"iocConfidence":0.9,"alertVelocity":4.0,"isEdrIsolated":true,"isNetworkBlocked":true,"isIdentityRevoked":true}',
    '[{"offsetMs":0,"label":"High telemetry, no controls","state":{"scenarioId":"S1","incidentStage":"compromise","iocCount":10,"iocConfidence":0.9,"alertVelocity":4.0,"isEdrIsolated":false,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":120000,"label":"EDR isolation enabled","state":{"scenarioId":"S1","incidentStage":"compromise","iocCount":10,"iocConfidence":0.9,"alertVelocity":4.0,"isEdrIsolated":true,"isNetworkBlocked":false,"isIdentityRevoked":false}},
      {"offsetMs":240000,"label":"Network blocking enabled","state":{"scenarioId":"S1","incidentStage":"compromise","iocCount":10,"iocConfidence":0.9,"alertVelocity":4.0,"isEdrIsolated":true,"isNetworkBlocked":true,"isIdentityRevoked":false}},
      {"offsetMs":360000,"label":"Identity response enabled","state":{"scenarioId":"S1","incidentStage":"compromise","iocCount":10,"iocConfidence":0.9,"alertVelocity":4.0,"isEdrIsolated":true,"isNetworkBlocked":true,"isIdentityRevoked":true}}]',
    'The selected QuickRisk scenario is being evaluated against a simulated containment sequence. Telemetry is held constant so the effect of each response action is visible.',
    1, 60, UTC_TIMESTAMP(), UTC_TIMESTAMP()
)
ON DUPLICATE KEY UPDATE name = VALUES(name), short_description = VALUES(short_description), long_description = VALUES(long_description), default_state_json = VALUES(default_state_json), timeline_json = VALUES(timeline_json), executive_summary_template = VALUES(executive_summary_template), scenario_version = VALUES(scenario_version), sort_order = VALUES(sort_order), updated_at = UTC_TIMESTAMP();
