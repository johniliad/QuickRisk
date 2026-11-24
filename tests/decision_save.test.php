<?php

declare(strict_types=1);

/**
 * QuickRisk Decision Lab — save-boundary and share-lifecycle tests.
 *
 * These tests drive the real handlers with the in-memory repositories, so the validation,
 * ownership and archival rules are exercised without MySQL.
 */

require_once dirname(__DIR__) . '/server/includes/decision/handlers.php';
require_once dirname(__DIR__) . '/server/includes/decision/repository_array.php';

/** Test configuration with Live protections enabled but rate limiting relaxed. */
function qk_decision_save_test_config(): array
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
function qk_decision_save_test_server(array $overrides = []): array
{
    return array_merge([
        'REQUEST_METHOD' => 'POST',
        'HTTP_HOST' => 'test.local',
        'HTTP_ORIGIN' => 'https://test.local',
        'HTTP_X_QUICKRISK_LIVE' => '1',
        'CONTENT_TYPE' => 'application/json',
        'REMOTE_ADDR' => '192.0.2.10',
        'SCRIPT_NAME' => '/live/api/decision-assessments.php',
        'REQUEST_SCHEME' => 'https',
        'HTTPS' => 'on',
        'SERVER_PORT' => '443',
    ], $overrides);
}

/**
 * @return array{cookies:array<string,string>,csrf:string}
 */
function qk_decision_save_test_session(
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

/** Runs one real compute action for a fixed seed. @return array<string,mixed> */
function qk_decision_save_test_compute(array $config, array $extra): array
{
    $body = array_merge(
        qk_test_payload(qk_test_profile()),
        [
            'seed' => 20261107,
            'iterations' => 1000,
            'appetite' => ['annualLossLimit' => 250000.0, 'highEndLimit' => 900000.0],
        ],
        $extra
    );
    $response = qk_decision_compute(qk_decision_save_test_server(), $config, (string) json_encode($body));
    if (($response['status'] ?? 0) !== 200) {
        qk_fail('The compute fixture failed with status ' . (string) ($response['status'] ?? 0));
    }

    return $response['payload']['data'];
}

/** Builds the Phase 1 save contract from a real comparison. */
function qk_decision_save_test_payload(
    array $comparison,
    ?array $search = null,
    ?array $recommended = null,
    string $kind = 'comparison',
    ?array $appetite = null
): array {
    $provenance = $comparison['provenance'];
    $state = $kind === 'recommended-portfolio'
        ? 'recommended'
        : ($search === null
            ? 'not-evaluated'
            : ((bool) ($search['noneSatisfies'] ?? false) ? 'none-satisfies' : 'evaluated-other'));

    return [
        'title' => 'Phase 2 save test',
        'selection' => [
            'treatments' => $comparison['treatments'],
            'comparison' => $comparison,
            'portfolios' => $search,
            'sensitivity' => null,
            'reportBasis' => [
                'kind' => $kind,
                'inputKey' => 'phase-2-test-key',
                'recommendationState' => $state,
                'treatmentIds' => array_column($comparison['treatments'], 'id'),
            ],
        ],
        'appetite' => $appetite ?? ['annualLossLimit' => 250000.0, 'highEndLimit' => 900000.0],
        'recommended' => $recommended,
        'result' => $comparison,
        'quickriskModelId' => $provenance['quickriskModelId'],
        'quickriskModelVersion' => $provenance['quickriskModelVersion'],
        'decisionMethodologyVersion' => $provenance['decisionMethodologyVersion'],
        'boardPackVersion' => $provenance['boardPackVersion'],
        'simulationSeed' => $provenance['simulationSeed'],
        'iterations' => $provenance['iterations'],
    ];
}

/** @return array{0:array<string,mixed>,1:array<string,mixed>} comparison and portfolio search */
function qk_decision_save_test_fixtures(array $config): array
{
    $comparison = qk_decision_save_test_compute($config, [
        'action' => 'compare',
        'treatments' => [['source' => 'curated', 'id' => 'immutable-backup']],
    ]);
    $search = qk_decision_save_test_compute($config, [
        'action' => 'portfolios',
        'treatments' => [],
        'candidateTreatments' => [
            ['source' => 'curated', 'id' => 'privileged-mfa'],
            ['source' => 'curated', 'id' => 'incident-response'],
            ['source' => 'curated', 'id' => 'network-segmentation'],
        ],
    ]);

    return [$comparison, $search];
}

/** @return array{0:array<string,mixed>,1:array<string,mixed>,2:array<string,mixed>} */
function qk_decision_save_test_recommended_fixture(
    array $config,
    array $search,
    ?array $appetite = null
): array {
    $recommendedId = $search['recommendedId'] ?? null;
    if (!is_string($recommendedId)) {
        qk_fail('The fixture portfolio search must recommend a portfolio');
    }
    $recommended = null;
    foreach ($search['portfolios'] as $row) {
        if (($row['id'] ?? null) === $recommendedId) {
            $recommended = $row;
            break;
        }
    }
    if ($recommended === null) {
        qk_fail('The recommended portfolio row was not found');
    }
    $treatments = [];
    foreach ($recommended['treatmentIds'] as $id) {
        $treatments[] = ['source' => 'curated', 'id' => (string) $id];
    }
    $comparison = qk_decision_save_test_compute($config, array_filter([
        'action' => 'compare',
        'treatments' => $treatments,
        'appetite' => $appetite,
    ], static fn ($value): bool => $value !== null));

    return [$comparison, $recommended, $search];
}

/** Rotates the client address so each tampering attempt is independently rate-limited. */
function qk_decision_save_test_next_server(array $server, array $session): array
{
    static $counter = 0;
    $counter++;

    return array_merge($server, [
        'HTTP_X_LIVE_CSRF' => $session['csrf'],
        'REMOTE_ADDR' => '198.51.100.' . (($counter % 250) + 1),
    ]);
}

return [
    'decision save: a coherent comparison analysis is accepted' => function (): void {
        $config = qk_decision_save_test_config();
        [$comparison] = qk_decision_save_test_fixtures($config);
        $payload = qk_decision_save_test_payload($comparison);

        $decisionRepository = new QkDecisionArrayRepository(['2.0', '1.0']);
        $liveRepository = new QkLiveArrayRepository([]);
        $server = qk_decision_save_test_server();
        $session = qk_decision_save_test_session($liveRepository, $config, $server);

        $result = qk_decision_save(
            qk_decision_save_test_next_server($server, $session),
            $config,
            $decisionRepository,
            $session['cookies'],
            (string) json_encode($payload),
            $liveRepository
        );

        assertSame(201, $result['status'], 'A coherent comparison analysis must be saved');
        assertSame(1, $decisionRepository->countDecisions(), 'Exactly one analysis must be stored');
    },

    'decision save: an EAL recommendation is accepted even when joint P90 appetite is above' => function (): void {
        $config = qk_decision_save_test_config();
        $appetite = ['annualLossLimit' => 250000.0, 'highEndLimit' => 1.0];
        $search = qk_decision_save_test_compute($config, [
            'action' => 'portfolios',
            'appetite' => $appetite,
            'treatments' => [],
            'candidateTreatments' => [
                ['source' => 'curated', 'id' => 'privileged-mfa'],
                ['source' => 'curated', 'id' => 'incident-response'],
                ['source' => 'curated', 'id' => 'network-segmentation'],
            ],
        ]);
        [$comparison, $recommended] = qk_decision_save_test_recommended_fixture($config, $search, $appetite);
        assertSame('above', $comparison['appetite']['treated']['status'], 'The exact comparison must remain above full appetite');
        assertSame('within', $recommended['appetite']['status'], 'The portfolio row must meet the EAL criterion');

        $payload = qk_decision_save_test_payload(
            $comparison,
            $search,
            $recommended,
            'recommended-portfolio',
            $appetite
        );

        $decisionRepository = new QkDecisionArrayRepository(['2.0', '1.0']);
        $liveRepository = new QkLiveArrayRepository([]);
        $server = qk_decision_save_test_server();
        $session = qk_decision_save_test_session($liveRepository, $config, $server);

        $result = qk_decision_save(
            qk_decision_save_test_next_server($server, $session),
            $config,
            $decisionRepository,
            $session['cookies'],
            (string) json_encode($payload),
            $liveRepository
        );

        assertSame(201, $result['status'], 'The EAL-only recommendation must be accepted');
        assertSame(1, $decisionRepository->countDecisions(), 'The analysis must be stored');
    },

    'decision save: a coherent recommended-portfolio analysis is accepted' => function (): void {
        $config = qk_decision_save_test_config();
        [, $search] = qk_decision_save_test_fixtures($config);
        [$recommendedComparison, $recommended] = qk_decision_save_test_recommended_fixture($config, $search);
        $payload = qk_decision_save_test_payload(
            $recommendedComparison,
            $search,
            $recommended,
            'recommended-portfolio'
        );

        $decisionRepository = new QkDecisionArrayRepository(['2.0', '1.0']);
        $liveRepository = new QkLiveArrayRepository([]);
        $server = qk_decision_save_test_server();
        $session = qk_decision_save_test_session($liveRepository, $config, $server);

        $result = qk_decision_save(
            qk_decision_save_test_next_server($server, $session),
            $config,
            $decisionRepository,
            $session['cookies'],
            (string) json_encode($payload),
            $liveRepository
        );

        assertSame(201, $result['status'], 'A coherent recommended-portfolio analysis must be saved');
        assertSame(1, $decisionRepository->countDecisions(), 'Exactly one analysis must be stored');
    },

    'decision save: mutated arithmetic is rejected and nothing is stored' => function (): void {
        $config = qk_decision_save_test_config();
        $comparison = qk_decision_save_test_compute($config, [
            'action' => 'compare',
            'treatments' => [['source' => 'curated', 'id' => 'immutable-backup']],
        ]);
        $base = qk_decision_save_test_payload($comparison);

        $decisionRepository = new QkDecisionArrayRepository(['2.0', '1.0']);
        $liveRepository = new QkLiveArrayRepository([]);
        $server = qk_decision_save_test_server();
        $session = qk_decision_save_test_session($liveRepository, $config, $server);

        $cases = [
            'baseline EAL' => static function (array &$payload): void {
                $payload['result']['baseline']['expectedAnnualLoss'] += 1000.0;
                $payload['selection']['comparison']['baseline']['expectedAnnualLoss'] += 1000.0;
            },
            'residual EAL' => static function (array &$payload): void {
                $payload['result']['treated']['expectedAnnualLoss'] += 1000.0;
                $payload['selection']['comparison']['treated']['expectedAnnualLoss'] += 1000.0;
            },
            'delta EAL' => static function (array &$payload): void {
                $payload['result']['delta']['expectedAnnualLoss'] += 1.0;
                $payload['selection']['comparison']['delta']['expectedAnnualLoss'] += 1.0;
            },
            'delta P90' => static function (array &$payload): void {
                $payload['result']['delta']['p90'] += 1.0;
                $payload['selection']['comparison']['delta']['p90'] += 1.0;
            },
            'reduction share' => static function (array &$payload): void {
                $payload['result']['delta']['reductionShare'] += 0.01;
                $payload['selection']['comparison']['delta']['reductionShare'] += 0.01;
            },
            'implementation cost' => static function (array &$payload): void {
                $payload['result']['cost']['initialInvestment'] += 1.0;
                $payload['selection']['comparison']['cost']['initialInvestment'] += 1.0;
            },
            'operating cost' => static function (array &$payload): void {
                $payload['result']['cost']['annualOperatingCost'] += 1.0;
                $payload['selection']['comparison']['cost']['annualOperatingCost'] += 1.0;
            },
            'annualised cost' => static function (array &$payload): void {
                $payload['result']['cost']['annualisedTreatmentCost'] += 1.0;
                $payload['selection']['comparison']['cost']['annualisedTreatmentCost'] += 1.0;
            },
            'implementation delay' => static function (array &$payload): void {
                $payload['result']['cost']['implementationDelayDays'] += 1;
                $payload['selection']['comparison']['cost']['implementationDelayDays'] += 1;
            },
            'risk reduction efficiency' => static function (array &$payload): void {
                $payload['result']['riskReductionEfficiency'] += 1.0;
                $payload['selection']['comparison']['riskReductionEfficiency'] += 1.0;
            },
            'appetite actual' => static function (array &$payload): void {
                $payload['result']['appetite']['treated']['criteria'][0]['actual'] += 1.0;
                $payload['selection']['comparison']['appetite']['treated']['criteria'][0]['actual'] += 1.0;
            },
            'appetite pass flag' => static function (array &$payload): void {
                $payload['result']['appetite']['treated']['criteria'][0]['passes'] =
                    !$payload['result']['appetite']['treated']['criteria'][0]['passes'];
                $payload['selection']['comparison']['appetite']['treated']['criteria'][0]['passes'] =
                    $payload['result']['appetite']['treated']['criteria'][0]['passes'];
            },
            'appetite status' => static function (array &$payload): void {
                $status = $payload['result']['appetite']['treated']['status'] === 'within' ? 'above' : 'within';
                $payload['result']['appetite']['treated']['status'] = $status;
                $payload['selection']['comparison']['appetite']['treated']['status'] = $status;
            },
            'scenario contribution' => static function (array &$payload): void {
                $payload['result']['baseline']['scenarioContributions'][0]['expectedAnnualLoss'] += 1.0;
                $payload['selection']['comparison']['baseline']['scenarioContributions'][0]['expectedAnnualLoss'] += 1.0;
            },
            'appetite label' => static function (array &$payload): void {
                $payload['result']['appetite']['treated']['label'] = 'Tampered appetite label';
                $payload['selection']['comparison']['appetite']['treated']['label'] = 'Tampered appetite label';
            },
        ];

        foreach ($cases as $label => $mutate) {
            $candidate = $base;
            $mutate($candidate);
            try {
                qk_decision_save(
                    qk_decision_save_test_next_server($server, $session),
                    $config,
                    $decisionRepository,
                    $session['cookies'],
                    (string) json_encode($candidate),
                    $liveRepository
                );
                qk_fail('The mutated save must be rejected: ' . $label);
            } catch (QkLiveHttpError $error) {
                assertSame(422, $error->status, 'The mutated save must be a validation error: ' . $label);
            }
            assertSame(0, $decisionRepository->countDecisions(), 'No mutated save may be stored: ' . $label);
        }
    },

    'decision save: mutated provenance and report basis are rejected' => function (): void {
        $config = qk_decision_save_test_config();
        $comparison = qk_decision_save_test_compute($config, [
            'action' => 'compare',
            'treatments' => [['source' => 'curated', 'id' => 'immutable-backup']],
        ]);
        $base = qk_decision_save_test_payload($comparison);

        $decisionRepository = new QkDecisionArrayRepository(['2.0', '1.0']);
        $liveRepository = new QkLiveArrayRepository([]);
        $server = qk_decision_save_test_server();
        $session = qk_decision_save_test_session($liveRepository, $config, $server);

        $cases = [
            'recommendation without a search' => static function (array &$payload): void {
                $payload['recommended'] = ['id' => 'p0'];
            },
            'report basis kind' => static function (array &$payload): void {
                $payload['selection']['reportBasis']['kind'] = 'recommended-portfolio';
            },
            'report basis state' => static function (array &$payload): void {
                $payload['selection']['reportBasis']['recommendationState'] = 'recommended';
            },
            'report basis ids' => static function (array &$payload): void {
                $payload['selection']['reportBasis']['treatmentIds'][] = 'ghost-treatment';
            },
            'report basis input key' => static function (array &$payload): void {
                $payload['selection']['reportBasis']['inputKey'] = '';
            },
            'missing report basis' => static function (array &$payload): void {
                unset($payload['selection']['reportBasis']);
            },
            'missing comparison' => static function (array &$payload): void {
                unset($payload['selection']['comparison']);
            },
            'saved treatment name' => static function (array &$payload): void {
                $payload['selection']['treatments'][0]['name'] = 'Tampered treatment';
            },
            'saved treatment cost' => static function (array &$payload): void {
                $payload['selection']['treatments'][0]['initialCost']['amount'] += 1.0;
            },
            'saved treatment effects' => static function (array &$payload): void {
                $payload['selection']['treatments'][0]['causalEffects']['magnitude']['max'] = 0.95;
            },
            'result treatment name' => static function (array &$payload): void {
                $payload['result']['treatments'][0]['name'] = 'Tampered treatment';
                $payload['selection']['comparison']['treatments'][0]['name'] = 'Tampered treatment';
            },
            'result treatment effects' => static function (array &$payload): void {
                $payload['result']['treatments'][0]['causalEffects']['magnitude']['max'] = 0.95;
                $payload['selection']['comparison']['treatments'][0]['causalEffects']['magnitude']['max'] = 0.95;
            },
            'seed' => static function (array &$payload): void {
                $payload['simulationSeed'] += 1;
            },
            'iteration count' => static function (array &$payload): void {
                $payload['iterations'] += 1;
            },
            'methodology version' => static function (array &$payload): void {
                $payload['decisionMethodologyVersion'] = '9.9';
            },
            'board pack version' => static function (array &$payload): void {
                $payload['boardPackVersion'] = '9.9';
                $payload['result']['provenance']['boardPackVersion'] = '9.9';
                $payload['selection']['comparison']['provenance']['boardPackVersion'] = '9.9';
            },
            'model version' => static function (array &$payload): void {
                $payload['quickriskModelVersion'] = '9.9';
                $payload['result']['provenance']['quickriskModelVersion'] = '9.9';
                $payload['selection']['comparison']['provenance']['quickriskModelVersion'] = '9.9';
            },
            'cost horizon' => static function (array &$payload): void {
                $payload['result']['cost']['horizonYears'] += 1;
                $payload['selection']['comparison']['cost']['horizonYears'] += 1;
            },
        ];

        foreach ($cases as $label => $mutate) {
            $candidate = $base;
            $mutate($candidate);
            try {
                qk_decision_save(
                    qk_decision_save_test_next_server($server, $session),
                    $config,
                    $decisionRepository,
                    $session['cookies'],
                    (string) json_encode($candidate),
                    $liveRepository
                );
                qk_fail('The mutated save must be rejected: ' . $label);
            } catch (QkLiveHttpError $error) {
                assertSame(422, $error->status, 'The mutated save must be a validation error: ' . $label);
            }
            assertSame(0, $decisionRepository->countDecisions(), 'No mutated save may be stored: ' . $label);
        }
    },

    'decision save: a tampered recommended portfolio is rejected' => function (): void {
        $config = qk_decision_save_test_config();
        [, $search] = qk_decision_save_test_fixtures($config);
        [$recommendedComparison, $recommended] = qk_decision_save_test_recommended_fixture($config, $search);
        $base = qk_decision_save_test_payload(
            $recommendedComparison,
            $search,
            $recommended,
            'recommended-portfolio'
        );

        $decisionRepository = new QkDecisionArrayRepository(['2.0', '1.0']);
        $liveRepository = new QkLiveArrayRepository([]);
        $server = qk_decision_save_test_server();
        $session = qk_decision_save_test_session($liveRepository, $config, $server);

        $cases = [
            'recommended id' => static function (array &$payload): void {
                $payload['recommended']['id'] = 'p999';
            },
            'recommended treatment ids' => static function (array &$payload): void {
                $payload['recommended']['treatmentIds'][] = 'edr';
            },
            'recommended residual EAL' => static function (array &$payload): void {
                $payload['recommended']['treated']['expectedAnnualLoss'] += 1.0;
            },
            'recommended investment' => static function (array &$payload): void {
                $payload['recommended']['cost']['initialInvestment'] += 1.0;
            },
            'recommended within-appetite flag' => static function (array &$payload): void {
                $payload['recommended']['withinAppetite'] = !$payload['recommended']['withinAppetite'];
            },
            'portfolio baseline' => static function (array &$payload): void {
                $payload['selection']['portfolios']['baseline']['expectedAnnualLoss'] += 1.0;
            },
            'portfolio provenance' => static function (array &$payload): void {
                $payload['selection']['portfolios']['provenance']['simulationSeed'] += 1;
            },
            'portfolio recommended id' => static function (array &$payload): void {
                $payload['selection']['portfolios']['recommendedId'] = 'p-not-in-search';
            },
            'recommendation removed' => static function (array &$payload): void {
                $payload['recommended'] = null;
            },
            'report basis state changed' => static function (array &$payload): void {
                $payload['selection']['reportBasis']['recommendationState'] = 'evaluated-other';
            },
            'report basis kind changed' => static function (array &$payload): void {
                $payload['selection']['reportBasis']['kind'] = 'comparison';
            },
        ];

        foreach ($cases as $label => $mutate) {
            $candidate = $base;
            $mutate($candidate);
            try {
                qk_decision_save(
                    qk_decision_save_test_next_server($server, $session),
                    $config,
                    $decisionRepository,
                    $session['cookies'],
                    (string) json_encode($candidate),
                    $liveRepository
                );
                qk_fail('The recommended-portfolio mutation must be rejected: ' . $label);
            } catch (QkLiveHttpError $error) {
                assertSame(422, $error->status, 'The mutation must be a validation error: ' . $label);
            }
            assertSame(0, $decisionRepository->countDecisions(), 'No mutated save may be stored: ' . $label);
        }
    },

    'decision share: a saved analysis can still be shared' => function (): void {
        $config = qk_decision_save_test_config();
        $decisionRepository = new QkDecisionArrayRepository(['2.0', '1.0']);
        $liveRepository = new QkLiveArrayRepository([]);
        $server = qk_decision_save_test_server();
        $session = qk_decision_save_test_session($liveRepository, $config, $server);

        $publicId = 'SAVEDDECISION00000000001';
        $decisionRepository->createDecision(1, ['publicId' => $publicId, 'title' => 'Saved']);

        $result = qk_decision_share_create(
            qk_decision_save_test_next_server($server, $session),
            $config,
            $decisionRepository,
            $session['cookies'],
            $publicId,
            $liveRepository
        );

        assertSame(201, $result['status'], 'A saved analysis must remain shareable');
        assertSame(1, $decisionRepository->countShares(), 'A share link must be created');
        assertContains('/live/share/board/', (string) $result['payload']['data']['shareUrl'], 'The link must use the Board Risk Pack path');
    },

    'decision share: an archived analysis cannot be shared' => function (): void {
        $config = qk_decision_save_test_config();
        $decisionRepository = new QkDecisionArrayRepository(['2.0', '1.0']);
        $liveRepository = new QkLiveArrayRepository([]);
        $server = qk_decision_save_test_server();
        $session = qk_decision_save_test_session($liveRepository, $config, $server);

        $publicId = 'ARCHIVEDDECISION0000000000';
        $decisionRepository->createDecision(1, ['publicId' => $publicId, 'title' => 'Archived']);
        $decisionRepository->markArchivedForTesting($publicId);

        try {
            qk_decision_share_create(
                qk_decision_save_test_next_server($server, $session),
                $config,
                $decisionRepository,
                $session['cookies'],
                $publicId,
                $liveRepository
            );
            qk_fail('An archived analysis must not be shareable');
        } catch (QkLiveHttpError $error) {
            assertSame(409, $error->status, 'Sharing an archived analysis must return 409');
            assertContains('archived', strtolower($error->getMessage()), 'The error must explain that the analysis is archived');
        }
        assertSame(0, $decisionRepository->countShares(), 'No share link may be created for an archived analysis');

        $foreign = qk_decision_save_test_session($liveRepository, $config, $server);
        try {
            qk_decision_share_create(
                qk_decision_save_test_next_server($server, $foreign),
                $config,
                $decisionRepository,
                $foreign['cookies'],
                $publicId,
                $liveRepository
            );
            qk_fail('A foreign session must not share the analysis');
        } catch (QkLiveHttpError $error) {
            assertSame(404, $error->status, 'A foreign session must receive 404, never 409');
        }
    },

    'decision share: an archived analysis is no longer readable through its old link' => function (): void {
        $config = qk_decision_save_test_config();
        $decisionRepository = new QkDecisionArrayRepository(['2.0', '1.0']);
        $server = qk_decision_save_test_server();

        $publicId = 'SAVEDDECISION00000000000';
        $decisionRepository->createDecision(1, ['publicId' => $publicId, 'title' => 'Saved']);
        $token = str_repeat('a', 64);
        $decisionRepository->createDecisionShare($publicId, hash('sha256', $token), null, gmdate('Y-m-d H:i:s'));
        $decisionRepository->markArchivedForTesting($publicId);

        try {
            qk_decision_shared($server, $config, $decisionRepository, $token);
            qk_fail('An archived analysis must not be readable through its old share link');
        } catch (QkLiveHttpError $error) {
            assertSame(404, $error->status, 'An archived share link must return 404');
        }
    },

    'decision save: a comparison report with a portfolio search and sensitivity is accepted' => function (): void {
        $config = qk_decision_save_test_config();
        [$comparison, $search] = qk_decision_save_test_fixtures($config);
        $sensitivity = qk_decision_save_test_compute($config, [
            'action' => 'sensitivity',
            'treatments' => [['source' => 'curated', 'id' => 'immutable-backup']],
        ]);
        $payload = qk_decision_save_test_payload($comparison, $search);
        $payload['selection']['sensitivity'] = $sensitivity['sensitivity'];

        $decisionRepository = new QkDecisionArrayRepository(['2.0', '1.0']);
        $liveRepository = new QkLiveArrayRepository([]);
        $server = qk_decision_save_test_server();
        $session = qk_decision_save_test_session($liveRepository, $config, $server);

        $result = qk_decision_save(
            qk_decision_save_test_next_server($server, $session),
            $config,
            $decisionRepository,
            $session['cookies'],
            (string) json_encode($payload),
            $liveRepository
        );

        assertSame(201, $result['status'], 'A comparison report with a portfolio search and sensitivity must be saved');
        assertSame(1, $decisionRepository->countDecisions(), 'Exactly one analysis must be stored');
    },

    'decision save: an analysis with no appetite configured is accepted' => function (): void {
        $config = qk_decision_save_test_config();
        $comparison = qk_decision_save_test_compute($config, [
            'action' => 'compare',
            'treatments' => [['source' => 'curated', 'id' => 'immutable-backup']],
            'appetite' => null,
        ]);
        $payload = qk_decision_save_test_payload($comparison);
        unset($payload['appetite']);

        $decisionRepository = new QkDecisionArrayRepository(['2.0', '1.0']);
        $liveRepository = new QkLiveArrayRepository([]);
        $server = qk_decision_save_test_server();
        $session = qk_decision_save_test_session($liveRepository, $config, $server);

        $result = qk_decision_save(
            qk_decision_save_test_next_server($server, $session),
            $config,
            $decisionRepository,
            $session['cookies'],
            (string) json_encode($payload),
            $liveRepository
        );

        assertSame(201, $result['status'], 'An analysis with no appetite configured must be saved');
        assertSame(1, $decisionRepository->countDecisions(), 'Exactly one analysis must be stored');
    },
];


