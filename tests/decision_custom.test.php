<?php

declare(strict_types=1);

/**
 * QuickRisk Decision Lab — user-defined treatment identity.
 *
 * These tests pin the Phase 3 rule: a custom treatment is identified by its complete validated
 * definition, not by its display name. The saved-record resolver must reach the same identity,
 * otherwise a save would reject the analysis that produced it.
 */

require_once dirname(__DIR__) . '/server/includes/decision/handlers.php';
require_once dirname(__DIR__) . '/server/includes/decision/repository_array.php';

/** Test configuration with Live protections enabled but rate limiting relaxed. */
function qk_decision_custom_test_config(): array
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
function qk_decision_custom_test_server(array $overrides = []): array
{
    return array_merge([
        'REQUEST_METHOD' => 'POST',
        'HTTP_HOST' => 'test.local',
        'HTTP_ORIGIN' => 'https://test.local',
        'HTTP_X_QUICKRISK_LIVE' => '1',
        'CONTENT_TYPE' => 'application/json',
        'REMOTE_ADDR' => '192.0.2.10',
        'SCRIPT_NAME' => '/live/api/decision-treatments.php',
        'REQUEST_SCHEME' => 'https',
        'HTTPS' => 'on',
        'SERVER_PORT' => '443',
    ], $overrides);
}

/**
 * @return array{cookies:array<string,string>,csrf:string}
 */
function qk_decision_custom_test_session(
    QkLiveArrayRepository $liveRepository,
    array $config,
    array $server
): array {
    $result = qk_live_handle_session($server, $config, $liveRepository, []);
    $name = qk_live_cookie_name(qk_live_config($config));

    return [
        'cookies' => [$name => (string) $result['cookie']['token']],
        'csrf' => (string) $result['payload']['data']['csrfToken'],
    ];
}


/**
 * A complete, valid custom definition for identity tests.
 *
 * @param array<string,mixed> $overrides
 * @return array<string,mixed>
 */
function qk_decision_custom_test_definition(array $overrides = []): array
{
    return array_merge([
        'name' => 'Phishing-resistant MFA',
        'businessOutcome' => 'Reduce account-takeover losses',
        'shortDescription' => 'Require phishing-resistant MFA for privileged users.',
        'assumptionNotes' => 'Assumes full rollout within one quarter.',
        'mechanismGroup' => 'identity',
        'evidenceQuality' => 'industry',
        'applicableScenarios' => ['S2', 'S1'],
        'causalEffects' => [
            'frequency' => ['min' => 0.10, 'mostLikely' => 0.20, 'max' => 0.30],
            'magnitude' => null,
        ],
        'implementationDelayDays' => 30,
        'initialCost' => 25000,
        'annualOperatingCost' => 5000,
    ], $overrides);
}

/** @return array<string,mixed> */
function qk_decision_custom_test_resolve(array $definition): array
{
    return qk_decision_treatment_selection(
        ['source' => 'custom', 'definition' => $definition],
        qk_config()
    );
}

return [
    'decision custom identity: same name with different effects produces different ids' => function (): void {
        $first = qk_decision_custom_test_definition();
        $second = qk_decision_custom_test_definition([
            'causalEffects' => [
                'frequency' => ['min' => 0.10, 'mostLikely' => 0.20, 'max' => 0.30],
                'magnitude' => ['min' => 0.05, 'mostLikely' => 0.10, 'max' => 0.20],
            ],
        ]);

        $left = qk_decision_custom_test_resolve($first);
        $right = qk_decision_custom_test_resolve($second);

        assertSame($left['name'], $right['name'], 'The two definitions use the same display name');
        assertTrue($left['id'] !== $right['id'], 'Different effects must produce different identities');
        assertTrue(str_starts_with((string) $left['id'], 'custom-'), 'A custom identity must use the custom prefix');
    },

    'decision custom identity: the scenario set is order-insensitive' => function (): void {
        $first = qk_decision_custom_test_resolve(
            qk_decision_custom_test_definition(['applicableScenarios' => ['S2', 'S1']])
        );
        $second = qk_decision_custom_test_resolve(
            qk_decision_custom_test_definition(['applicableScenarios' => ['S1', 'S2', 'S1']])
        );

        assertSame($first['id'], $second['id'], 'The same scenario set must produce the same identity');
        assertSame(['S1', 'S2'], $first['applicableScenarios'], 'Scenarios must be stored in a stable order');
    },

    'decision custom identity: names differing only by case can still be distinct' => function (): void {
        $lower = qk_decision_custom_test_resolve(
            qk_decision_custom_test_definition([
                'name' => 'phishing-resistant mfa',
                'causalEffects' => [
                    'frequency' => ['min' => 0.10, 'mostLikely' => 0.20, 'max' => 0.30],
                    'magnitude' => null,
                ],
            ])
        );
        $upper = qk_decision_custom_test_resolve(
            qk_decision_custom_test_definition([
                'name' => 'Phishing-resistant MFA',
                'causalEffects' => [
                    'frequency' => ['min' => 0.10, 'mostLikely' => 0.20, 'max' => 0.40],
                    'magnitude' => null,
                ],
            ])
        );

        assertSame(strtolower($lower['name']), strtolower($upper['name']), 'The names differ only by case');
        assertTrue($lower['id'] !== $upper['id'], 'Different definitions must not share an identity');
        assertTrue(
            !in_array($lower['id'], array_column(qk_decision_curated_treatments(), 'id'), true),
            'A custom id must never collide with a curated id'
        );
    },

    'decision custom identity: every definition field changes the id' => function (): void {
        $baseline = qk_decision_custom_test_resolve(qk_decision_custom_test_definition());
        $variants = [
            'name' => ['name' => 'MFA for everyone'],
            'business outcome' => ['businessOutcome' => 'A different outcome'],
            'short description' => ['shortDescription' => 'A different description'],
            'assumption note' => ['assumptionNotes' => 'A different assumption.'],
            'mechanism group' => ['mechanismGroup' => 'endpoint'],
            'evidence quality' => ['evidenceQuality' => 'expert_judgement'],
            'applicable scenarios' => ['applicableScenarios' => ['S3']],
            'frequency effect' => [
                'causalEffects' => [
                    'frequency' => ['min' => 0.10, 'mostLikely' => 0.21, 'max' => 0.30],
                    'magnitude' => null,
                ],
            ],
            'magnitude effect' => [
                'causalEffects' => [
                    'frequency' => ['min' => 0.10, 'mostLikely' => 0.20, 'max' => 0.30],
                    'magnitude' => ['min' => 0.10, 'mostLikely' => 0.20, 'max' => 0.30],
                ],
            ],
            'implementation delay' => ['implementationDelayDays' => 45],
            'initial cost' => ['initialCost' => 25001],
            'annual operating cost' => ['annualOperatingCost' => 5001],
        ];

        foreach ($variants as $label => $overrides) {
            $variant = qk_decision_custom_test_resolve(qk_decision_custom_test_definition($overrides));
            assertTrue(
                $variant['id'] !== $baseline['id'],
                'Changing the ' . $label . ' must change the treatment identity'
            );
        }
    },

    'decision custom identity: the saved-record resolver reaches the same id' => function (): void {
        $resolved = qk_decision_custom_test_resolve(qk_decision_custom_test_definition());
        $again = qk_decision_saved_treatment_resolved($resolved, qk_config());

        assertSame($resolved['id'], $again['id'], 'A saved custom treatment must resolve to its stored identity');
        assertSame('custom', $again['origin'], 'The saved treatment must remain user-defined');
    },

    'decision custom identity: duplicate selections are rejected, not silently merged' => function (): void {
        $selection = ['source' => 'custom', 'definition' => qk_decision_custom_test_definition()];

        try {
            qk_decision_resolved_treatments(['treatments' => [$selection, $selection]], qk_config(), 10);
            qk_fail('Two identical custom selections must be rejected');
        } catch (QkLiveHttpError $error) {
            assertSame(422, $error->status, 'A duplicate treatment selection must return 422');
            assertTrue(
                str_contains($error->getMessage(), 'same identity'),
                'The error must explain that the treatments resolve to the same identity'
            );
        }
    },

    'decision custom identity: duplicate curated selections are also rejected' => function (): void {
        $selection = ['source' => 'curated', 'id' => 'edr'];

        try {
            qk_decision_resolved_treatments(['treatments' => [$selection, $selection]], qk_config(), 10);
            qk_fail('Two identical curated selections must be rejected');
        } catch (QkLiveHttpError $error) {
            assertSame(422, $error->status, 'A duplicate curated selection must return 422');
        }
    },

    'decision custom identity: the effect adapter rejects duplicate ids' => function (): void {
        $resolved = qk_decision_custom_test_resolve(qk_decision_custom_test_definition());

        try {
            qk_decision_realise_effects([$resolved, $resolved], 20261107);
            qk_fail('The effect adapter must reject duplicate treatment identities');
        } catch (InvalidArgumentException $error) {
            assertTrue(
                str_contains($error->getMessage(), $resolved['id']),
                'The adapter error must name the duplicate identity'
            );
        }
    },

    'decision custom lifecycle: create, list, compute with it and delete' => function (): void {
        $config = qk_decision_custom_test_config();
        $decisionRepository = new QkDecisionArrayRepository(['2.0', '1.0']);
        $liveRepository = new QkLiveArrayRepository([]);
        $server = qk_decision_custom_test_server();
        $session = qk_decision_custom_test_session($liveRepository, $config, $server);
        $server['HTTP_X_LIVE_CSRF'] = $session['csrf'];

        $created = qk_decision_custom_create(
            $server,
            $config,
            $decisionRepository,
            $session['cookies'],
            (string) json_encode(['definition' => qk_decision_custom_test_definition()]),
            $liveRepository
        );
        assertSame(201, $created['status'], 'A complete custom treatment must be created');
        $publicId = (string) $created['payload']['data']['publicId'];
        assertTrue($publicId !== '', 'The created treatment must have a public id');

        $catalogue = qk_decision_treatment_catalogue($server, $config, $decisionRepository, $session['cookies'], $liveRepository);
        $custom = $catalogue['payload']['data']['custom'];
        assertSame(1, count($custom), 'The catalogue must list the session-owned treatment');
        assertSame($publicId, (string) $custom[0]['publicId'], 'The catalogue must return the created treatment');
        assertSame('custom', (string) $custom[0]['definition']['origin'], 'The definition must remain user-defined');

        $body = array_merge(qk_test_payload(qk_test_profile()), [
            'action' => 'compare',
            'seed' => 20261107,
            'iterations' => 1000,
            'treatments' => [['source' => 'custom', 'definition' => qk_decision_custom_test_definition()]],
        ]);
        $computed = qk_decision_compute($server, $config, (string) json_encode($body));
        assertSame(200, $computed['status'], 'A comparison must accept the custom definition');
        $resolvedTreatment = $computed['payload']['data']['treatments'][0];
        assertSame($custom[0]['definition']['id'], (string) $resolvedTreatment['id'], 'The compute result must use the definition-derived id');
        assertSame('custom', (string) $resolvedTreatment['origin'], 'The compute result must preserve the custom origin');

        $deleted = qk_decision_custom_delete(
            $server,
            $config,
            $decisionRepository,
            $session['cookies'],
            $publicId,
            $liveRepository
        );
        assertSame(200, $deleted['status'], 'An owned custom treatment must be deleted');
        $after = qk_decision_treatment_catalogue($server, $config, $decisionRepository, $session['cookies'], $liveRepository);
        assertSame([], $after['payload']['data']['custom'], 'The deleted treatment must leave the catalogue');
    },

    'decision custom lifecycle: an incomplete definition is rejected and nothing is stored' => function (): void {
        $config = qk_decision_custom_test_config();
        $decisionRepository = new QkDecisionArrayRepository(['2.0', '1.0']);
        $liveRepository = new QkLiveArrayRepository([]);
        $server = qk_decision_custom_test_server();
        $session = qk_decision_custom_test_session($liveRepository, $config, $server);
        $server['HTTP_X_LIVE_CSRF'] = $session['csrf'];

        try {
            qk_decision_custom_create(
                $server,
                $config,
                $decisionRepository,
                $session['cookies'],
                (string) json_encode(['definition' => ['name' => 'Incomplete treatment']]),
                $liveRepository
            );
            qk_fail('An incomplete custom definition must be rejected');
        } catch (QkLiveHttpError $error) {
            assertSame(422, $error->status, 'An incomplete definition must return 422');
        }

        $catalogue = qk_decision_treatment_catalogue($server, $config, $decisionRepository, $session['cookies'], $liveRepository);
        assertSame([], $catalogue['payload']['data']['custom'], 'A rejected definition must not be stored');
    },

    'decision history: the saved-analysis list is scoped to the owning session' => function (): void {
        $config = qk_decision_custom_test_config();
        $decisionRepository = new QkDecisionArrayRepository(['2.0', '1.0']);
        $liveRepository = new QkLiveArrayRepository([]);
        $server = qk_decision_custom_test_server();
        $owner = qk_decision_custom_test_session($liveRepository, $config, $server);
        $foreign = qk_decision_custom_test_session($liveRepository, $config, $server);

        $decisionRepository->createDecision(1, [
            'publicId' => 'OWNERDECISION00000000000',
            'title' => 'Owner analysis',
        ]);
        $decisionRepository->createDecision(2, [
            'publicId' => 'FOREIGNDECISION0000000000',
            'title' => 'Foreign analysis',
        ]);

        $ownerList = qk_decision_list($server, $config, $decisionRepository, $owner['cookies'], $liveRepository);
        $foreignList = qk_decision_list($server, $config, $decisionRepository, $foreign['cookies'], $liveRepository);

        assertSame(1, count($ownerList['payload']['data']), 'The owner must see exactly one analysis');
        assertSame('Owner analysis', $ownerList['payload']['data'][0]['title'], 'The owner must see their analysis');
        assertSame(1, count($foreignList['payload']['data']), 'The foreign session must see exactly one analysis');
        assertSame('Foreign analysis', $foreignList['payload']['data'][0]['title'], 'The foreign session must not see the owner record');
    },
];
