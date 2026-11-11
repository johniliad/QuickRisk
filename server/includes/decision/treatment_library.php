<?php

declare(strict_types=1);

/**
 * QuickRisk Decision Lab — curated treatment library.
 *
 * These are the shipped, reviewed starting points. Every entry states the business outcome,
 * the causal lever it pulls (event frequency and/or loss magnitude), a three-point effect
 * estimate, implementation delay, both cost components, evidence quality and the assumptions
 * a reviewer accepted.
 *
 * The effects are application assumptions, not measured product performance. Each entry is
 * labelled with the evidence that actually supports it; nothing here is described as
 * "validated" unless the evidence field says so.
 *
 * A treatment is applied to the *drivers* of the QuickRisk model:
 *   frequency effect  -> the probability that a threat event becomes a loss event
 *                        (the model's susceptibility input)
 *   magnitude effect  -> the loss-magnitude anchor of every event
 * Both transformations are linear in the annual loss of an iteration, which is what makes
 * paired (common-random-number) comparison exact.
 */

/**
 * Builds one curated treatment definition.
 *
 * @param array<int,string> $applicable
 * @param array<string,float>|null $frequency
 * @param array<string,float>|null $magnitude
 * @param array<int,string> $assumptions
 * @return array<string,mixed>
 */
function qk_decision_treatment(
    string $id,
    string $name,
    string $shortDescription,
    string $businessOutcome,
    array $applicable,
    ?array $frequency,
    ?array $magnitude,
    int $delayDays,
    float $initialCost,
    float $annualCost,
    string $evidence,
    string $group,
    array $assumptions
): array {
    return [
        'id' => $id,
        'version' => '1.0',
        'name' => $name,
        'shortDescription' => $shortDescription,
        'businessOutcome' => $businessOutcome,
        'applicableScenarios' => $applicable,
        'causalEffects' => [
            'frequency' => $frequency,
            'magnitude' => $magnitude,
        ],
        'implementationDelayDays' => $delayDays,
        'initialCost' => ['amount' => $initialCost, 'currency' => 'EUR'],
        'annualOperatingCost' => ['amount' => $annualCost, 'currency' => 'EUR'],
        'evidenceQuality' => $evidence,
        'mechanismGroup' => $group,
        'interactionDefaults' => ['sameGroupIndependentCoverage' => 0.65],
        'assumptions' => $assumptions,
        'reviewedAt' => '2026-11-07',
        'reviewOwner' => 'QuickRisk methodology owner',
        'evidenceReference' => 'Application assumption recorded in QuickRisk Decision Lab v1.0; not externally evidenced for this organisation.',
        'origin' => 'curated',
        'enabled' => true,
    ];
}

/**
 * The twelve curated treatments shipped with Decision Lab v1.0.
 *
 * @return array<int,array<string,mixed>>
 */
function qk_decision_curated_treatments(): array
{
    $all = ['S1', 'S2', 'S3', 'S4', 'S5'];

    return [
        qk_decision_treatment(
            'privileged-mfa',
            'Privileged MFA',
            'Stronger authentication for administrative and privileged accounts.',
            'Fewer successful credential-based intrusions with administrative impact.',
            ['S1', 'S2', 'S3'],
            ['min' => 0.20, 'mostLikely' => 0.35, 'max' => 0.50],
            null,
            30,
            25000.0,
            12000.0,
            'industry',
            'identity',
            ['Assumes MFA is enforced on every privileged access path, including service accounts.']
        ),
        qk_decision_treatment(
            'edr',
            'Endpoint Detection and Response',
            'Endpoint monitoring with containment and response capabilities.',
            'Attacks are detected and stopped earlier, reducing both how often they succeed and how much they cost.',
            ['S1', 'S2', 'S3'],
            ['min' => 0.15, 'mostLikely' => 0.30, 'max' => 0.45],
            ['min' => 0.15, 'mostLikely' => 0.30, 'max' => 0.45],
            60,
            60000.0,
            45000.0,
            'vendor',
            'endpoint',
            ['Assumes endpoint coverage above 95% of the estate and a staffed response rota.']
        ),
        qk_decision_treatment(
            'immutable-backup',
            'Immutable Backup Resilience',
            'Offline, immutable copies with tested restoration.',
            'A destructive event costs less because recovery does not depend on the attacker.',
            ['S1', 'S2', 'S4'],
            null,
            ['min' => 0.25, 'mostLikely' => 0.45, 'max' => 0.65],
            90,
            90000.0,
            45000.0,
            'industry',
            'data-resilience',
            ['Assumes restoration exercises at least twice a year and a validated recovery-time objective.']
        ),
        qk_decision_treatment(
            'network-segmentation',
            'Network Segmentation',
            'Segmentation of critical zones with enforced east-west rules.',
            'Lateral movement is restricted, so a single compromise affects less of the business.',
            $all,
            ['min' => 0.10, 'mostLikely' => 0.25, 'max' => 0.40],
            ['min' => 0.10, 'mostLikely' => 0.25, 'max' => 0.40],
            180,
            150000.0,
            60000.0,
            'expert_judgement',
            'network',
            ['Assumes application dependency mapping is complete before enforcement.']
        ),
        qk_decision_treatment(
            'security-awareness',
            'Security Awareness Programme',
            'Sustained awareness and simulation programme for all staff.',
            'Fewer successful social-engineering and phishing events.',
            ['S2', 'S4'],
            ['min' => 0.10, 'mostLikely' => 0.20, 'max' => 0.35],
            null,
            120,
            20000.0,
            15000.0,
            'industry',
            'governance',
            ['Effect is assumed to persist only while the programme runs; no decay is modelled.']
        ),
        qk_decision_treatment(
            'email-security',
            'Email Security Enhancement',
            'Advanced filtering, attachment sandboxing and link protection.',
            'Fewer malicious messages reach users.',
            ['S1', 'S2'],
            ['min' => 0.15, 'mostLikely' => 0.30, 'max' => 0.45],
            null,
            45,
            35000.0,
            20000.0,
            'vendor',
            'email',
            ['Assumes mail-flow coverage for all inbound channels and no unmanaged personal mail use for business.']
        ),
        qk_decision_treatment(
            'vulnerability-management',
            'Vulnerability Management Improvement',
            'Continuous discovery, prioritisation and remediation of exploitable exposure.',
            'Fewer exploitable windows remain open on public-facing and internal systems.',
            ['S1', 'S3', 'S4'],
            ['min' => 0.15, 'mostLikely' => 0.30, 'max' => 0.50],
            null,
            120,
            40000.0,
            35000.0,
            'expert_judgement',
            'governance',
            ['Assumes remediation targets are enforced and internet-facing assets are inventoried.']
        ),
        qk_decision_treatment(
            'identity-monitoring',
            'Identity Monitoring',
            'Behavioural monitoring and alerting on identity anomalies.',
            'Compromised identities are detected and contained sooner.',
            ['S2', 'S3'],
            ['min' => 0.10, 'mostLikely' => 0.20, 'max' => 0.35],
            null,
            45,
            30000.0,
            25000.0,
            'vendor',
            'identity',
            ['Assumes directory telemetry is complete and alerts are triaged within the service level.']
        ),
        qk_decision_treatment(
            'incident-response',
            'Incident Response Improvement',
            'Retained responders, playbooks and regular exercises.',
            'Incidents are contained earlier, which reduces the financial impact of each event.',
            $all,
            null,
            ['min' => 0.10, 'mostLikely' => 0.25, 'max' => 0.40],
            90,
            50000.0,
            30000.0,
            'industry',
            'response',
            ['Assumes a documented plan, an exercised call tree and a tested escalation path.']
        ),
        qk_decision_treatment(
            'data-recovery',
            'Data Recovery Improvement',
            'Faster, tested recovery of critical data and services.',
            'Downtime and restoration cost per event fall.',
            ['S1', 'S5'],
            null,
            ['min' => 0.15, 'mostLikely' => 0.35, 'max' => 0.55],
            120,
            70000.0,
            35000.0,
            'expert_judgement',
            'data-resilience',
            ['Assumes validated recovery objectives per critical service and spare capacity for restore.']
        ),
        qk_decision_treatment(
            'ddos-protection',
            'DDoS Protection',
            'Always-on volumetric and application-layer mitigation.',
            'Service-disruption events are absorbed instead of degrading the service.',
            ['S5'],
            null,
            ['min' => 0.15, 'mostLikely' => 0.35, 'max' => 0.55],
            30,
            45000.0,
            30000.0,
            'vendor',
            'network',
            ['Assumes upstream scrubbing capacity and a tested failover path.']
        ),
        qk_decision_treatment(
            'privileged-access-management',
            'Privileged Access Management',
            'Vaulting, just-in-time elevation and session recording for privileged accounts.',
            'Privilege misuse and credential theft affect far fewer systems.',
            ['S1', 'S2', 'S4'],
            ['min' => 0.20, 'mostLikely' => 0.40, 'max' => 0.55],
            null,
            150,
            120000.0,
            50000.0,
            'industry',
            'identity',
            ['Assumes all privileged accounts are vaulted and break-glass access is monitored.']
        ),
    ];
}

/**
 * Finds a curated treatment by id.
 *
 * @return array<string,mixed>|null
 */
function qk_decision_curated_treatment(string $id): ?array
{
    foreach (qk_decision_curated_treatments() as $treatment) {
        if ((string) $treatment['id'] === $id) {
            return $treatment;
        }
    }

    return null;
}

