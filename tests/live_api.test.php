<?php

declare(strict_types=1);

/**
 * QuickRisk Live — API behaviour and security tests.
 *
 * These tests exercise the real handlers against the in-memory repository, so sessions,
 * ownership, sharing, archival, validation and the security rules are all covered without a
 * MySQL server.
 *
 * The numeric fixtures below are test data only. In production the result always comes from
 * the TypeScript engine; PHP never calculates it.
 */

require_once dirname(__DIR__) . '/server/includes/live/handlers.php';

/** A representative valid SOC state (active compromise, no controls). */
function qk_live_test_state(array $overrides = []): array
{
    return array_merge([
        'scenarioId' => 'S1',
        'incidentStage' => 'compromise',
        'iocCount' => 6,
        'iocConfidence' => 0.8,
        'alertVelocity' => 3.0,
        'isEdrIsolated' => false,
        'isNetworkBlocked' => false,
        'isIdentityRevoked' => false,
    ], $overrides);
}

/** The matching engine result for the fixture above (telemetry 100, multiplier 4.00x). */
function qk_live_test_result(array $overrides = []): array
{
    $state = qk_live_test_state();

    return array_merge([
        'telemetryScore' => 100.0,
        'mitigationFactor' => 1.0,
        'socMultiplier' => 4.0,
        'realTimeRisk' => 100,
        'riskBand' => 'Critical',
        'baselineEal' => 125000.0,
        'realTimeEal' => 500000.0,
        'methodologyVersion' => '1.0',
        'trace' => [
            'stage' => $state['incidentStage'],
            'iocContribution' => 57.6,
            'velocityContribution' => 20.0,
            'rawTelemetry' => 152.6,
            'cappedTelemetry' => 100.0,
        ],
    ], $overrides);
}

/** A complete save payload. */
function qk_live_test_payload(array $overrides = []): array
{
    $state = qk_live_test_state();
    $result = qk_live_test_result();

    return array_merge([
        'title' => 'Ransomware rehearsal',
        'scenarioId' => 'S1',
        'scenarioName' => 'Ransomware',
        'baselineEal' => 125000.0,
        'baselineSource' => ['modelId' => 'FAIR-QK-1.3', 'modelVersion' => '1.3.0'],
        'inputState' => $state,
        'riskResult' => $result,
        'timeline' => [
            [
                'offsetMs' => 0,
                'eventType' => 'STATE_RECORDED',
                'label' => 'Active compromise',
                'state' => $state,
                'result' => $result,
            ],
        ],
        'methodologyVersion' => '1.0',
    ], $overrides);
}

/** Two demo scenarios, mirroring the seeded library shape. */
function qk_live_test_scenarios(): array
{
    return [
        [
            'slug' => 'ransomware-outbreak',
            'name' => 'Ransomware Outbreak',
            'category' => 'intrusion',
            'short_description' => 'Escalation to active compromise.',
            'long_description' => 'A simulated ransomware sequence.',
            'scenario_version' => '1.0',
            'default_state_json' => json_encode(qk_live_test_state()),
            'timeline_json' => json_encode([
                ['offsetMs' => 0, 'label' => 'Active compromise', 'state' => qk_live_test_state()],
            ]),
            'executive_summary_template' => 'Simulated ransomware sequence.',
        ],
        [
            'slug' => 'soc-containment',
            'name' => 'SOC Containment',
            'category' => 'response',
            'short_description' => 'Response actions applied one at a time.',
            'long_description' => 'A simulated containment sequence.',
            'scenario_version' => '1.0',
            'default_state_json' => json_encode(qk_live_test_state(['isEdrIsolated' => true])),
            'timeline_json' => json_encode([]),
            'executive_summary_template' => 'Simulated containment sequence.',
        ],
    ];
}

/** Live configuration with rate limiting effectively disabled for the tests. */
function qk_live_test_config(): array
{
    $config = qk_config();
    $config['live'] = [
        'requireHttps' => false,
        'rateLimit' => [
            'windowSeconds' => 300,
            'session' => 100000,
            'save' => 100000,
            'update' => 100000,
            'shareCreate' => 100000,
            'shareRead' => 100000,
            'timelineWrite' => 100000,
            'list' => 100000,
        ],
    ];

    return $config;
}

function qk_live_test_repository(): QkLiveArrayRepository
{
    return new QkLiveArrayRepository(qk_live_test_scenarios(), ['1.0']);
}

/** A same-origin request context. */
function qk_live_test_server(array $overrides = []): array
{
    return array_merge([
        'REQUEST_METHOD' => 'POST',
        'HTTP_HOST' => 'test.local',
        'HTTP_ORIGIN' => 'https://test.local',
        'HTTP_X_QUICKRISK_LIVE' => '1',
        'CONTENT_TYPE' => 'application/json',
        'REMOTE_ADDR' => '192.0.2.10',
        'SCRIPT_NAME' => '/live/api/share.php',
        'REQUEST_SCHEME' => 'https',
        'HTTPS' => 'on',
        'SERVER_PORT' => '443',
    ], $overrides);
}

/**
 * Creates a session and returns the cookie jar plus CSRF token.
 *
 * @return array{cookies:array<string,string>,csrf:string}
 */
function qk_live_test_session(QkLiveArrayRepository $repository, array $config, array $server): array
{
    $result = qk_live_handle_session($server, $config, $repository, []);
    $name = qk_live_cookie_name(qk_live_config($config));

    return [
        'cookies' => [$name => (string) $result['cookie']['token']],
        'csrf' => (string) $result['payload']['data']['csrfToken'],
    ];
}

return [
    'live: an anonymous session is created with a CSRF token and an opaque cookie' => function (): void {
        $config = qk_live_test_config();
        $repository = qk_live_test_repository();

        $result = qk_live_handle_session(qk_live_test_server(), $config, $repository, []);

        assertSame(200, $result['status'], 'The session endpoint must succeed');
        $data = $result['payload']['data'];
        assertTrue(strlen($data['csrfToken']) === 64, 'The CSRF token must be 256 bits, hex encoded');
        assertTrue(isset($result['cookie']['token']), 'A session cookie must be issued');
        assertTrue(
            preg_match('/^[a-f0-9]{64}$/', (string) $result['cookie']['token']) === 1,
            'The session cookie must be an opaque random token'
        );
        assertTrue($result['cookie']['expiresAt'] > time(), 'The session must expire in the future');
        assertSame('1.0', qk_live_config($config)['methodologyVersion'], 'The methodology version must be declared');
    },

    'live: an existing session is reused and its CSRF token is rotated' => function (): void {
        $config = qk_live_test_config();
        $repository = qk_live_test_repository();
        $server = qk_live_test_server();

        $first = qk_live_test_session($repository, $config, $server);
        $second = qk_live_handle_session($server, $config, $repository, $first['cookies']);
        $name = qk_live_cookie_name(qk_live_config($config));

        assertTrue($second['payload']['data']['csrfToken'] !== $first['csrf'], 'The CSRF token must rotate');
        assertSame(
            $first['cookies'][$name],
            (string) $second['cookie']['token'],
            'An existing session must keep its cookie'
        );
    },

    'live: saving an assessment returns it and lists it in the same session only' => function (): void {
        $config = qk_live_test_config();
        $repository = qk_live_test_repository();
        $server = qk_live_test_server();
        $session = qk_live_test_session($repository, $config, $server);

        $created = qk_live_handle_create_assessment(
            array_merge($server, ['HTTP_X_LIVE_CSRF' => $session['csrf']]),
            $config,
            $repository,
            $session['cookies'],
            json_encode(qk_live_test_payload())
        );

        assertSame(201, $created['status'], 'Saving must return 201');
        $detail = $created['payload']['data'];
        assertSame('Ransomware rehearsal', $detail['title'], 'The title must be stored');
        assertSame(100, $detail['realTimeRisk'], 'The stored risk index must be returned unchanged');
        assertSame('Critical', $detail['riskBand'], 'The stored band must be returned unchanged');
        assertSame(500000.0, $detail['realTimeEal'], 'The stored real-time EAL must be returned unchanged');
        assertSame(1, count($detail['timeline']), 'The timeline must be persisted');
        assertSame('FAIR-QK-1.3', $detail['baselineModelId'], 'The baseline model must be recorded');

        $list = qk_live_handle_list_assessments($server, $config, $repository, $session['cookies']);
        assertSame(1, count($list['payload']['data']), 'The assessment must appear in the history');

        $other = qk_live_test_session($repository, $config, qk_live_test_server(['REMOTE_ADDR' => '198.51.100.25']));
        $otherList = qk_live_handle_list_assessments($server, $config, $repository, $other['cookies']);
        assertSame(0, count($otherList['payload']['data']), 'History must never list another session assessment');
    },

    'live: one session cannot read, update, archive or share another session assessment' => function (): void {
        $config = qk_live_test_config();
        $repository = qk_live_test_repository();
        $server = qk_live_test_server();
        $owner = qk_live_test_session($repository, $config, $server);

        $created = qk_live_handle_create_assessment(
            array_merge($server, ['HTTP_X_LIVE_CSRF' => $owner['csrf']]),
            $config,
            $repository,
            $owner['cookies'],
            json_encode(qk_live_test_payload())
        );
        $publicId = (string) $created['payload']['data']['publicId'];

        $intruder = qk_live_test_session($repository, $config, qk_live_test_server(['REMOTE_ADDR' => '203.0.113.44']));
        $intruderServer = array_merge($server, ['HTTP_X_LIVE_CSRF' => $intruder['csrf']]);

        $attempts = [
            'read' => static fn () => qk_live_handle_get_assessment($intruderServer, $config, $repository, $intruder['cookies'], $publicId),
            'update' => static fn () => qk_live_handle_update_assessment($intruderServer, $config, $repository, $intruder['cookies'], $publicId, json_encode(qk_live_test_payload())),
            'archive' => static fn () => qk_live_handle_archive($intruderServer, $config, $repository, $intruder['cookies'], $publicId),
            'share' => static fn () => qk_live_handle_create_share($intruderServer, $config, $repository, $intruder['cookies'], $publicId),
        ];

        foreach ($attempts as $action => $attempt) {
            try {
                $attempt();
                qk_fail('A foreign session must not be able to ' . $action . ' the assessment');
            } catch (QkLiveHttpError $error) {
                assertSame(404, $error->status, 'A foreign session must receive 404 for ' . $action);
            }
        }
    },

    'live: a request without a session is rejected, and a forged cookie resolves to none' => function (): void {
        $config = qk_live_test_config();
        $repository = qk_live_test_repository();
        $name = qk_live_cookie_name(qk_live_config($config));

        foreach (['no cookie' => [], 'forged cookie' => [$name => str_repeat('a', 64)]] as $label => $cookies) {
            try {
                qk_live_handle_list_assessments(qk_live_test_server(), $config, $repository, $cookies);
                qk_fail('A request with ' . $label . ' must be rejected');
            } catch (QkLiveHttpError $error) {
                assertSame(401, $error->status, 'A request with ' . $label . ' must require a session');
            }
        }
    },


    'live: a write without a valid CSRF token or origin is rejected' => function (): void {
        $config = qk_live_test_config();
        $repository = qk_live_test_repository();
        $server = qk_live_test_server();
        $session = qk_live_test_session($repository, $config, $server);
        $body = json_encode(qk_live_test_payload());

        $cases = [
            'missing CSRF header' => ['HTTP_X_LIVE_CSRF' => ''],
            'wrong CSRF header' => ['HTTP_X_LIVE_CSRF' => str_repeat('b', 64)],
            'foreign origin' => ['HTTP_X_LIVE_CSRF' => $session['csrf'], 'HTTP_ORIGIN' => 'https://evil.example'],
            'missing client header' => ['HTTP_X_LIVE_CSRF' => $session['csrf'], 'HTTP_X_QUICKRISK_LIVE' => ''],
        ];

        foreach ($cases as $label => $overrides) {
            try {
                qk_live_handle_create_assessment(
                    array_merge($server, $overrides),
                    $config,
                    $repository,
                    $session['cookies'],
                    $body
                );
                qk_fail('The write must be rejected: ' . $label);
            } catch (QkLiveHttpError $error) {
                assertSame(403, $error->status, 'Rejecting ' . $label . ' must be a 403');
            }
        }
    },

    'live: invalid payloads, ranges, JSON and methodology versions are rejected' => function (): void {
        $config = qk_live_test_config();
        $repository = qk_live_test_repository();
        $server = qk_live_test_server();
        $session = qk_live_test_session($repository, $config, $server);
        $request = array_merge($server, ['HTTP_X_LIVE_CSRF' => $session['csrf']]);

        $cases = [
            'not JSON' => 'this is not json',
            'IOC count above range' => json_encode(qk_live_test_payload([
                'inputState' => qk_live_test_state(['iocCount' => 16]),
            ])),
            'IOC count below range' => json_encode(qk_live_test_payload([
                'inputState' => qk_live_test_state(['iocCount' => -1]),
            ])),
            'confidence below range' => json_encode(qk_live_test_payload([
                'inputState' => qk_live_test_state(['iocConfidence' => 0.05]),
            ])),
            'velocity above range' => json_encode(qk_live_test_payload([
                'inputState' => qk_live_test_state(['alertVelocity' => 6]),
            ])),
            'risk above range' => json_encode(qk_live_test_payload([
                'riskResult' => qk_live_test_result(['realTimeRisk' => 101]),
            ])),
            'multiplier above range' => json_encode(qk_live_test_payload([
                'riskResult' => qk_live_test_result(['socMultiplier' => 4.5]),
            ])),
            'unknown methodology version' => json_encode(qk_live_test_payload(['methodologyVersion' => '9.9'])),
            'scenario mismatch' => json_encode(qk_live_test_payload(['scenarioId' => 'S9'])),
            'control not boolean' => json_encode(qk_live_test_payload([
                'inputState' => qk_live_test_state(['isEdrIsolated' => 'yes']),
            ])),
            'timeline offset out of range' => json_encode(qk_live_test_payload([
                'timeline' => [[
                    'offsetMs' => 999999999,
                    'eventType' => 'STATE_RECORDED',
                    'label' => 'bad',
                    'state' => qk_live_test_state(),
                    'result' => qk_live_test_result(),
                ]],
            ])),
        ];

        foreach ($cases as $label => $body) {
            try {
                qk_live_handle_create_assessment($request, $config, $repository, $session['cookies'], $body);
                qk_fail('The payload must be rejected: ' . $label);
            } catch (QkLiveHttpError $error) {
                assertTrue(
                    in_array($error->status, [400, 422], true),
                    'Rejecting ' . $label . ' must use 400 or 422, got ' . (string) $error->status
                );
            }
        }

        $list = qk_live_handle_list_assessments($server, $config, $repository, $session['cookies']);
        assertSame(0, count($list['payload']['data']), 'No rejected payload may have been stored');
    },

    'live: update replaces the stored state, result and timeline' => function (): void {
        $config = qk_live_test_config();
        $repository = qk_live_test_repository();
        $server = qk_live_test_server();
        $session = qk_live_test_session($repository, $config, $server);
        $request = array_merge($server, ['HTTP_X_LIVE_CSRF' => $session['csrf']]);

        $created = qk_live_handle_create_assessment($request, $config, $repository, $session['cookies'], json_encode(qk_live_test_payload()));
        $publicId = (string) $created['payload']['data']['publicId'];

        $containedState = qk_live_test_state([
            'isEdrIsolated' => true,
            'isNetworkBlocked' => true,
            'isIdentityRevoked' => true,
        ]);
        $containedResult = qk_live_test_result([
            'mitigationFactor' => 0.05,
            'socMultiplier' => 0.2,
            'realTimeRisk' => 5,
            'riskBand' => 'Low',
            'realTimeEal' => 25000.0,
        ]);

        $updated = qk_live_handle_update_assessment(
            $request,
            $config,
            $repository,
            $session['cookies'],
            $publicId,
            json_encode(qk_live_test_payload([
                'title' => 'Contained',
                'inputState' => $containedState,
                'riskResult' => $containedResult,
                'timeline' => [],
            ]))
        );

        assertSame(200, $updated['status'], 'Updating must succeed');
        $detail = $updated['payload']['data'];
        assertSame('Contained', $detail['title'], 'The title must be updated');
        assertSame(5, $detail['realTimeRisk'], 'The stored risk index must be updated');
        assertSame(0.2, $detail['socMultiplier'], 'The stored multiplier must be updated');
        assertSame([], $detail['timeline'], 'The timeline must be replaced');
    },

    'live: the timeline can be saved and is returned in sequence order' => function (): void {
        $config = qk_live_test_config();
        $repository = qk_live_test_repository();
        $server = qk_live_test_server();
        $session = qk_live_test_session($repository, $config, $server);
        $request = array_merge($server, ['HTTP_X_LIVE_CSRF' => $session['csrf']]);

        $created = qk_live_handle_create_assessment($request, $config, $repository, $session['cookies'], json_encode(qk_live_test_payload()));
        $publicId = (string) $created['payload']['data']['publicId'];

        $timeline = [
            [
                'offsetMs' => 0,
                'eventType' => 'STATE_RECORDED',
                'label' => 'Detection',
                'state' => qk_live_test_state(['incidentStage' => 'triage', 'iocCount' => 2]),
                'result' => qk_live_test_result(['realTimeRisk' => 40, 'riskBand' => 'Medium', 'socMultiplier' => 2.0, 'realTimeEal' => 250000.0]),
            ],
            [
                'offsetMs' => 60000,
                'eventType' => 'STATE_RECORDED',
                'label' => 'Containment',
                'state' => qk_live_test_state(['isEdrIsolated' => true]),
                'result' => qk_live_test_result(['realTimeRisk' => 25, 'riskBand' => 'Medium', 'socMultiplier' => 1.75, 'realTimeEal' => 218750.0]),
            ],
        ];

        $saved = qk_live_handle_save_timeline($request, $config, $repository, $session['cookies'], $publicId, json_encode(['timeline' => $timeline]));
        assertSame(200, $saved['status'], 'Saving the timeline must succeed');
        assertSame(2, count($saved['payload']['data']), 'Both events must be returned');
        assertSame('Detection', $saved['payload']['data'][0]['label'], 'Events must be returned in sequence order');
        assertSame(60000, $saved['payload']['data'][1]['offsetMs'], 'The simulated offset must be preserved');

        $reloaded = qk_live_handle_get_assessment($request, $config, $repository, $session['cookies'], $publicId);
        assertSame(2, count($reloaded['payload']['data']['timeline']), 'The stored timeline must be reloaded');
        assertSame(25, $reloaded['payload']['data']['timeline'][1]['result']['realTimeRisk'], 'Stored results must be reproducible');
    },

    'live: a share link is read-only, revocable and can be replaced' => function (): void {
        $config = qk_live_test_config();
        $repository = qk_live_test_repository();
        $server = qk_live_test_server();
        $session = qk_live_test_session($repository, $config, $server);
        $request = array_merge($server, ['HTTP_X_LIVE_CSRF' => $session['csrf']]);

        $created = qk_live_handle_create_assessment($request, $config, $repository, $session['cookies'], json_encode(qk_live_test_payload()));
        $publicId = (string) $created['payload']['data']['publicId'];

        $share = qk_live_handle_create_share($request, $config, $repository, $session['cookies'], $publicId);
        $shareUrl = (string) $share['payload']['data']['shareUrl'];
        $token = substr($shareUrl, strrpos($shareUrl, '/') + 1);
        assertTrue(preg_match('/^[a-f0-9]{64}$/', $token) === 1, 'The share token must be 256 bits, hex encoded');
        assertTrue(!str_contains($shareUrl, $publicId), 'The share URL must not expose the public id');

        $public = qk_live_handle_shared(qk_live_test_server(), $config, $repository, $token);
        assertSame(200, $public['status'], 'A valid share link must be readable');
        assertSame(100, $public['payload']['data']['realTimeRisk'], 'The shared view must show the stored risk');
        assertTrue(!isset($public['payload']['data']['sessionId']), 'The shared view must not expose the session');

        // Creating a new link revokes the previous one.
        $second = qk_live_handle_create_share($request, $config, $repository, $session['cookies'], $publicId);
        $secondUrl = (string) $second['payload']['data']['shareUrl'];
        $secondToken = substr($secondUrl, strrpos($secondUrl, '/') + 1);
        try {
            qk_live_handle_shared($server, $config, $repository, $token);
            qk_fail('Creating a new link must revoke the previous link');
        } catch (QkLiveHttpError $error) {
            assertSame(404, $error->status, 'A replaced link must return 404');
        }
        assertSame(200, qk_live_handle_shared($server, $config, $repository, $secondToken)['status'], 'The newest link must work');

        // Revocation.
        $revoked = qk_live_handle_revoke_share($request, $config, $repository, $session['cookies'], $publicId);
        assertSame(true, $revoked['payload']['data']['revoked'], 'Revocation must be confirmed');
        try {
            qk_live_handle_shared($server, $config, $repository, $secondToken);
            qk_fail('A revoked link must not be readable');
        } catch (QkLiveHttpError $error) {
            assertSame(404, $error->status, 'A revoked link must return 404');
        }

        // A malformed token is rejected without revealing whether it ever existed.
        try {
            qk_live_handle_shared($server, $config, $repository, 'not-a-token');
            qk_fail('A malformed token must not be readable');
        } catch (QkLiveHttpError $error) {
            assertSame(404, $error->status, 'A malformed token must return 404');
            assertContains('no longer available', strtolower($error->getMessage()), 'The message must not reveal token history');
        }
    },

    'live: an expired share link is unavailable' => function (): void {
        $config = qk_live_test_config();
        $repository = qk_live_test_repository();
        $server = qk_live_test_server();
        $session = qk_live_test_session($repository, $config, $server);
        $request = array_merge($server, ['HTTP_X_LIVE_CSRF' => $session['csrf']]);

        $created = qk_live_handle_create_assessment($request, $config, $repository, $session['cookies'], json_encode(qk_live_test_payload()));
        $publicId = (string) $created['payload']['data']['publicId'];
        $share = qk_live_handle_create_share($request, $config, $repository, $session['cookies'], $publicId);
        $url = (string) $share['payload']['data']['shareUrl'];
        $token = substr($url, strrpos($url, '/') + 1);

        $row = $repository->findAssessmentByPublicId($publicId);
        assertTrue($row !== null, 'The saved assessment must exist');
        $repository->expireSharesForTesting((int) $row['id']);

        try {
            qk_live_handle_shared($server, $config, $repository, $token);
            qk_fail('An expired link must not be readable');
        } catch (QkLiveHttpError $error) {
            assertSame(404, $error->status, 'An expired link must return 404');
        }
    },

    'live: archive removes the assessment from history and revokes its share link' => function (): void {
        $config = qk_live_test_config();
        $repository = qk_live_test_repository();
        $server = qk_live_test_server();
        $session = qk_live_test_session($repository, $config, $server);
        $request = array_merge($server, ['HTTP_X_LIVE_CSRF' => $session['csrf']]);

        $created = qk_live_handle_create_assessment($request, $config, $repository, $session['cookies'], json_encode(qk_live_test_payload()));
        $publicId = (string) $created['payload']['data']['publicId'];
        $share = qk_live_handle_create_share($request, $config, $repository, $session['cookies'], $publicId);
        $url = (string) $share['payload']['data']['shareUrl'];
        $token = substr($url, strrpos($url, '/') + 1);

        $archived = qk_live_handle_archive($request, $config, $repository, $session['cookies'], $publicId);
        assertSame(200, $archived['status'], 'Archiving must succeed');
        assertSame('archived', $archived['payload']['data']['status'], 'The status must become archived');

        $list = qk_live_handle_list_assessments($server, $config, $repository, $session['cookies']);
        assertSame(0, count($list['payload']['data']), 'An archived assessment must leave the history');

        try {
            qk_live_handle_shared($server, $config, $repository, $token);
            qk_fail('Archiving must revoke the share link');
        } catch (QkLiveHttpError $error) {
            assertSame(404, $error->status, 'A revoked share link must be unavailable');
        }
    },

    'live: the demonstration library is listed with valid states and no stored scores' => function (): void {
        $config = qk_live_test_config();
        $repository = qk_live_test_repository();

        $result = qk_live_handle_scenarios(qk_live_test_server(['REQUEST_METHOD' => 'GET']), $config, $repository);
        assertSame(200, $result['status'], 'The library must be readable');
        $scenarios = $result['payload']['data'];
        assertTrue(count($scenarios) >= 2, 'The library must contain the seeded scenarios');

        $keys = ['slug', 'name', 'category', 'shortDescription', 'longDescription', 'scenarioVersion', 'defaultState', 'timeline'];
        foreach ($scenarios as $scenario) {
            foreach ($keys as $key) {
                assertTrue(array_key_exists($key, $scenario), 'A scenario must include ' . $key);
            }
            $state = qk_live_validate_soc_state($scenario['defaultState']);
            assertSame('compromise', $state['incidentStage'], 'The fixture default state must validate');
            assertTrue(
                !array_key_exists('realTimeRisk', $scenario) && !array_key_exists('socMultiplier', $scenario),
                'A preset must not carry a stored score'
            );
        }
    },
];

