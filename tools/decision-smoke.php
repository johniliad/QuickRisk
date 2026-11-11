<?php

declare(strict_types=1);

/**
 * QuickRisk Decision Lab — local smoke test.
 *
 * Drives the real Decision Lab handlers against the real QuickRisk engine, with no web server
 * and no database. It proves the compute path end to end:
 *
 *   QuickRisk answers -> existing engine -> paired loss vectors -> treatment comparison
 *   -> portfolio recommendation -> break-even effectiveness
 *
 * Usage:  php tools/decision-smoke.php
 */

$root = dirname(__DIR__);
require_once $root . '/tests/bootstrap.php';
require_once $root . '/server/includes/decision/handlers.php';

$config = qk_config();
$server = [
    'REQUEST_METHOD' => 'POST',
    'HTTP_HOST' => 'localhost:8080',
    'HTTP_ORIGIN' => 'http://localhost:8080',
    'HTTP_X_QUICKRISK_LIVE' => '1',
    'CONTENT_TYPE' => 'application/json',
    'REMOTE_ADDR' => '192.0.2.10',
    'SCRIPT_NAME' => '/live/api/decision-compute.php',
    'REQUEST_SCHEME' => 'http',
    'SERVER_PORT' => '8080',
];

$answers = qk_test_payload(qk_test_profile());
$appetite = ['annualLossLimit' => 250000.0, 'highEndLimit' => 900000.0];
$candidateIds = ['edr', 'immutable-backup', 'privileged-mfa', 'incident-response', 'network-segmentation'];

$step = static function (string $label): void {
    echo str_pad($label, 52, '.') . ' ';
};
$ok = static function (bool $condition, string $message): void {
    if (!$condition) {
        echo "FAIL\n  " . $message . "\n";
        exit(1);
    }
    echo "ok\n";
};

/** Builds a compute payload: the assessment answers plus the action and its own fields. */
$payload = static function (array $extra) use ($answers): array {
    return array_merge($answers, ['seed' => 20261107, 'iterations' => 2000], $extra);
};
$post = static function (array $body) use ($server, $config): array {
    return qk_decision_compute($server, $config, json_encode($body));
};

$step('baseline analysis');
$baseline = $post($payload(['action' => 'baseline', 'appetite' => $appetite]));
$ok(
    $baseline['payload']['ok'] === true && (float) $baseline['payload']['data']['baseline']['expectedAnnualLoss'] > 0,
    'The baseline must return a modeled expected annual loss'
);
$baselineEal = (float) $baseline['payload']['data']['baseline']['expectedAnnualLoss'];
echo '    baseline expected annual loss: ' . number_format($baselineEal, 2) . "\n";

$step('treatment comparison');
$comparison = $post($payload([
    'action' => 'compare',
    'appetite' => $appetite,
    'treatments' => [['source' => 'curated', 'id' => 'edr']],
]));
$data = $comparison['payload']['data'];
$ok(
    $comparison['payload']['ok'] === true
        && (float) $data['delta']['expectedAnnualLoss'] > 0
        && (float) $data['treated']['expectedAnnualLoss'] < $baselineEal,
    'A treatment must reduce the modeled exposure'
);
printf(
    "    residual: %s (-%s), S1 factor: %.3f, efficiency: %s\n",
    number_format((float) $data['treated']['expectedAnnualLoss'], 2),
    number_format((float) $data['delta']['expectedAnnualLoss'], 2),
    (float) $data['factors']['byScenario']['S1']['kappa'],
    $data['riskReductionEfficiency'] === null ? 'n/a' : number_format((float) $data['riskReductionEfficiency'], 2)
);

$step('portfolio recommendation');
$portfolios = $post($payload([
    'action' => 'portfolios',
    'appetite' => $appetite,
    'treatments' => [],
    'candidateTreatments' => array_map(static fn (string $id): array => ['source' => 'curated', 'id' => $id], $candidateIds),
]));
$search = $portfolios['payload']['data'];
$ok(
    $portfolios['payload']['ok'] === true
        && $search['evaluated'] === 32
        && $search['noneSatisfies'] === false
        && $search['recommendedId'] !== null,
    'The optimizer must evaluate every portfolio and recommend one'
);
$recommended = null;
foreach ($search['portfolios'] as $portfolio) {
    if ($portfolio['id'] === $search['recommendedId']) {
        $recommended = $portfolio;
    }
}
printf(
    "    %s: %s | investment %s | residual %s | %s\n",
    (string) $search['recommendedId'],
    implode(' + ', $recommended['treatmentIds']),
    number_format((float) $recommended['cost']['initialInvestment'], 0),
    number_format((float) $recommended['treated']['expectedAnnualLoss'], 2),
    (string) $recommended['label']
);

$step('break-even effectiveness');
$sensitivity = $post($payload([
    'action' => 'sensitivity',
    'appetite' => ['annualLossLimit' => 600000.0],
    'treatments' => [['source' => 'curated', 'id' => 'edr']],
]));
$ok(
    $sensitivity['payload']['ok'] === true
        && $sensitivity['payload']['data']['sensitivity']['available'] === true,
    'The break-even analysis must be available when appetite is defined'
);
echo '    ' . (string) $sensitivity['payload']['data']['sensitivity']['message'] . "\n";

$step('determinism (same seed, second run)');
$repeat = $post($payload([
    'action' => 'compare',
    'appetite' => $appetite,
    'treatments' => [['source' => 'curated', 'id' => 'edr']],
]));
$ok(
    $repeat['payload']['data']['treated']['expectedAnnualLoss'] === $data['treated']['expectedAnnualLoss'],
    'The same seed must produce the same treated exposure'
);

$step('custom treatment uses the structured causal form');
$custom = $post($payload([
    'action' => 'compare',
    'appetite' => $appetite,
    'treatments' => [[
        'source' => 'custom',
        'definition' => [
            'name' => 'Privileged Access Monitoring',
            'businessOutcome' => 'Reduce successful misuse of privileged accounts.',
            'applicableScenarios' => ['S1', 'S2'],
            'causalEffects' => [
                'frequency' => ['min' => 0.10, 'mostLikely' => 0.20, 'max' => 0.35],
                'magnitude' => ['min' => 0.0, 'mostLikely' => 0.10, 'max' => 0.20],
            ],
            'implementationDelayDays' => 60,
            'initialCost' => 75000,
            'annualOperatingCost' => 25000,
            'evidenceQuality' => 'expert_judgement',
            'mechanismGroup' => 'identity',
            'assumptionNotes' => 'Assumes directory telemetry is complete.',
        ],
    ]],
]));
$ok(
    $custom['payload']['ok'] === true
        && (float) $custom['payload']['data']['delta']['expectedAnnualLoss'] > 0
        && $custom['payload']['data']['treatments'][0]['origin'] === 'custom',
    'A custom treatment must be applied through its driver effects'
);

$step('a treatment without a causal lever is rejected');
try {
    $post($payload([
        'action' => 'compare',
        'treatments' => [['source' => 'custom', 'definition' => [
            'name' => 'Bare discount',
            'applicableScenarios' => ['S1'],
        ]]],
    ]));
    $ok(false, 'A treatment without a causal lever must be rejected');
} catch (QkLiveHttpError $error) {
    $ok($error->status === 422, 'A treatment without a causal lever must be a validation error');
}

echo "\nQuickRisk Decision Lab smoke test passed.\n";

