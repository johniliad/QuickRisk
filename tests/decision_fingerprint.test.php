<?php

declare(strict_types=1);

/**
 * QuickRisk Decision Lab — server input fingerprint.
 *
 * The fingerprint must identify the complete compute input, not just the output. These tests pin
 * determinism, sensitivity to every input family, and presence on every compute action.
 */

require_once dirname(__DIR__) . '/server/includes/decision/handlers.php';

/** @return array<string,mixed> */
function qk_decision_fingerprint_test_config(): array
{
    $config = qk_config();
    $config['live'] = [
        'requireHttps' => false,
        'rateLimit' => [
            'windowSeconds' => 300,
            'decision' => 100000,
            'save' => 100000,
            'shareCreate' => 100000,
            'shareRead' => 100000,
            'list' => 100000,
            'update' => 100000,
        ],
    ];

    return $config;
}

/** @return array<string,mixed> */
function qk_decision_fingerprint_test_server(): array
{
    return [
        'REQUEST_METHOD' => 'POST',
        'HTTP_HOST' => 'test.local',
        'HTTP_ORIGIN' => 'https://test.local',
        'HTTP_X_QUICKRISK_LIVE' => '1',
        'CONTENT_TYPE' => 'application/json',
        'REMOTE_ADDR' => '192.0.2.20',
        'SCRIPT_NAME' => '/live/api/decision-compute.php',
        'REQUEST_SCHEME' => 'https',
        'HTTPS' => 'on',
        'SERVER_PORT' => '443',
    ];
}

/**
 * @param array<string,mixed> $overrides
 * @return array<string,mixed>
 */
function qk_decision_fingerprint_test_body(array $overrides = []): array
{
    return array_merge([
        'action' => 'compare',
        'seed' => 20261107,
        'iterations' => 1000,
        'appetite' => ['annualLossLimit' => 250000.0],
        'treatments' => [['source' => 'curated', 'id' => 'edr']],
    ], $overrides);
}

/** @param array<string,mixed> $body */
function qk_decision_fingerprint_test_compute(array $config, array $body): string
{
    $payload = array_merge(qk_test_payload(qk_test_profile()), $body);
    $response = qk_decision_compute(
        qk_decision_fingerprint_test_server(),
        $config,
        (string) json_encode($payload)
    );
    if (($response['status'] ?? 0) !== 200) {
        qk_fail('The fingerprint fixture failed with status ' . (string) ($response['status'] ?? 0));
    }

    $fingerprint = (string) ($response['payload']['data']['provenance']['inputFingerprint'] ?? '');
    if (preg_match('/^[a-f0-9]{64}$/', $fingerprint) !== 1) {
        qk_fail('The compute response did not contain a 64-hex input fingerprint.');
    }

    return $fingerprint;
}

return [
    'decision fingerprint: identical inputs and seed produce the same fingerprint' => function (): void {
        $config = qk_decision_fingerprint_test_config();
        $body = qk_decision_fingerprint_test_body();

        assertSame(
            qk_decision_fingerprint_test_compute($config, $body),
            qk_decision_fingerprint_test_compute($config, $body),
            'Identical compute inputs must produce the same fingerprint'
        );
    },

    'decision fingerprint: every input family changes the fingerprint' => function (): void {
        $config = qk_decision_fingerprint_test_config();
        $baseline = qk_decision_fingerprint_test_compute($config, qk_decision_fingerprint_test_body());
        $answers = qk_test_payload(qk_test_profile())['organisationAnswers'];
        $answers = array_map(
            static fn (array $answer): array => $answer['questionCode'] === 'QP1'
                ? ['questionCode' => 'QP1', 'optionCode' => '10_50M']
                : $answer,
            $answers
        );

        $variants = [
            'answer' => qk_decision_fingerprint_test_body(['organisationAnswers' => $answers]),
            'treatment' => qk_decision_fingerprint_test_body([
                'treatments' => [['source' => 'curated', 'id' => 'immutable-backup']],
            ]),
            'appetite' => qk_decision_fingerprint_test_body([
                'appetite' => ['annualLossLimit' => 300000.0],
            ]),
            'constraint' => qk_decision_fingerprint_test_body([
                'constraints' => ['maxInitialInvestment' => 50000],
            ]),
            'seed' => qk_decision_fingerprint_test_body(['seed' => 20261108]),
            'iterations' => qk_decision_fingerprint_test_body(['iterations' => 1200]),
        ];

        foreach ($variants as $label => $variant) {
            assertTrue(
                qk_decision_fingerprint_test_compute($config, $variant) !== $baseline,
                'Changing the ' . $label . ' must change the fingerprint'
            );
        }
    },

    'decision fingerprint: the same selected set matches across compare and portfolios' => function (): void {
        $config = qk_decision_fingerprint_test_config();
        $compare = qk_decision_fingerprint_test_compute($config, qk_decision_fingerprint_test_body());
        $portfolios = qk_decision_fingerprint_test_compute(
            $config,
            qk_decision_fingerprint_test_body([
                'action' => 'portfolios',
                'treatments' => [],
                'candidateTreatments' => [['source' => 'curated', 'id' => 'edr']],
            ])
        );

        assertSame(
            $compare,
            $portfolios,
            'The same selected set must produce the same fingerprint for compare and portfolios'
        );
    },

    'decision fingerprint: result-affecting configuration is included' => function (): void {
        $config = qk_decision_fingerprint_test_config();
        $baseline = qk_decision_fingerprint_test_compute($config, qk_decision_fingerprint_test_body());

        $variant = $config;
        $variant['decision'] = array_merge(
            qk_decision_config($variant),
            ['planningHorizonYears' => 5]
        );
        $changed = qk_decision_fingerprint_test_compute($variant, qk_decision_fingerprint_test_body());

        assertTrue(
            $changed !== $baseline,
            'Changing the planning horizon must change the result-input fingerprint'
        );
    },

    'decision fingerprint: every compute action carries it' => function (): void {
        $config = qk_decision_fingerprint_test_config();
        $actions = [
            'baseline' => qk_decision_fingerprint_test_body([
                'action' => 'baseline',
                'treatments' => [],
            ]),
            'compare' => qk_decision_fingerprint_test_body(),
            'portfolios' => qk_decision_fingerprint_test_body([
                'action' => 'portfolios',
                'treatments' => [],
                'candidateTreatments' => [
                    ['source' => 'curated', 'id' => 'edr'],
                    ['source' => 'curated', 'id' => 'immutable-backup'],
                ],
            ]),
            'sensitivity' => qk_decision_fingerprint_test_body([
                'action' => 'sensitivity',
                'treatments' => [['source' => 'curated', 'id' => 'immutable-backup']],
            ]),
        ];

        $fingerprints = [];
        foreach ($actions as $action => $body) {
            $fingerprints[$action] = qk_decision_fingerprint_test_compute($config, $body);
        }

        assertSame(count($actions), count($fingerprints), 'Every action must return a fingerprint');
        assertTrue(
            $fingerprints['portfolios'] !== $fingerprints['compare'],
            'A different candidate set must be part of the portfolio fingerprint'
        );
    },
];
