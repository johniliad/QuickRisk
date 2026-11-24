<?php

declare(strict_types=1);

/**
 * QuickRisk Decision Lab — request handlers.
 *
 * Two families of operation:
 *   compute    — run the existing QuickRisk engine once, then evaluate treatments, portfolios
 *                and break-even effectiveness on the paired sample. Nothing is stored.
 *   persist    — save, list, read, archive and share a decision analysis, and manage the
 *                session-owned custom treatments.
 *
 * PHP never calculates a risk value: the compute handlers drive the same engine the
 * calculator uses, and the persistence handlers validate ranges and store the result.
 */

require_once dirname(__DIR__) . '/live/config.php';
require_once dirname(__DIR__) . '/live/response.php';
require_once dirname(__DIR__) . '/live/security.php';
require_once dirname(__DIR__) . '/live/validation.php';
require_once dirname(__DIR__) . '/live/db.php';
require_once dirname(__DIR__) . '/live/handlers.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/validation.php';
require_once __DIR__ . '/treatment_library.php';
require_once __DIR__ . '/treatment_adapter.php';
require_once __DIR__ . '/decision_engine.php';
require_once __DIR__ . '/repository.php';
require_once dirname(__DIR__) . '/inference_repository.php';
require_once dirname(__DIR__) . '/risk_engine.php';

/** Production repository for decision persistence. */
function qk_decision_repository(array $liveConfig): QkDecisionRepository
{
    return new QkDecisionPdoRepository(qk_live_pdo($liveConfig));
}

/**
 * Resolves the treatments named in a request.
 *
 * @param array<string,mixed> $payload
 * @param array<string,mixed> $appConfig
 * @return array<int,array<string,mixed>>
 */
function qk_decision_resolved_treatments(array $payload, array $appConfig, int $maximum): array
{
    $selections = $payload['treatments'] ?? [];
    if (!is_array($selections) || !array_is_list($selections)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The treatments must be a list.');
    }
    if (count($selections) > $maximum) {
        throw new QkLiveHttpError(
            422,
            'VALIDATION_ERROR',
            'Too many treatments were selected for one analysis. The anonymous compute budget allows at most '
                . $maximum . ' candidate treatments in one request.'
        );
    }

    $treatments = [];
    $seen = [];
    foreach ($selections as $selection) {
        $treatment = qk_decision_treatment_selection($selection, $appConfig);
        if (isset($seen[$treatment['id']])) {
            throw new QkLiveHttpError(
                422,
                'VALIDATION_ERROR',
                'Two selected treatments resolve to the same identity. Remove or edit one.'
            );
        }
        $seen[$treatment['id']] = true;
        $treatments[] = $treatment;
    }

    return $treatments;
}

/**
 * The acronym definitions a page or report page may need. The frontend shows the first
 * occurrence of each acronym on a page with its definition (requirements 4, 8 and 42).
 *
 * @return array<string,array<string,string>>
 */
function qk_decision_acronyms(): array
{
    return [
        'EAL' => [
            'term' => 'Expected Annual Loss',
            'short' => 'The model\'s estimate of the average annual financial loss for the assessed scenarios.',
        ],
        'P10' => [
            'term' => '10th percentile',
            'short' => 'A lower modeled loss level; about 10% of modeled years fall below it.',
        ],
        'P50' => [
            'term' => '50th percentile',
            'short' => 'The midpoint of the modeled loss distribution.',
        ],
        'P90' => [
            'term' => '90th percentile',
            'short' => 'A high-end modeled loss level; about 10% of modeled years exceed it.',
        ],
        'RRE' => [
            'term' => 'Risk Reduction Efficiency',
            'short' => 'Modeled annual loss reduction per unit of annualised treatment cost. Not a financial return.',
        ],
    ];
}

/**
 * Computes a Decision Lab analysis. Nothing is persisted.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @return array<string,mixed>
 */
function qk_decision_compute(array $server, array $appConfig, string $rawBody): array
{
    $liveConfig = qk_live_config($appConfig);
    $config = qk_decision_config($appConfig);
    // One budget for every compute request: this endpoint has no accounts, so a caller cannot
    // be identified as anything other than anonymous.
    $budget = qk_decision_compute_budget($config);
    qk_live_rate_limit($liveConfig, $server, 'decision');
    qk_live_assert_same_origin($server, $appConfig);
    qk_live_assert_json_request($server, $liveConfig, $rawBody);

    $payload = qk_live_decode_object($rawBody);
    $action = (string) ($payload['action'] ?? 'compare');
    if (!in_array($action, ['baseline', 'compare', 'portfolios', 'sensitivity'], true)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The requested action is not recognised.');
    }

    $model = qk_load_model($appConfig);
    // The assessment validator is strict about its schema, so only the assessment fields are
    // passed to it. The Decision Lab keys are validated separately, below.
    $assessmentFields = [
        'schemaVersion',
        'modelId',
        'disclaimer',
        'organisationAnswers',
        'scenarioAnswers',
        'organisationEvidence',
    ];
    $validated = QkValidation::validatePayload(
        $model,
        array_intersect_key($payload, array_flip($assessmentFields))
    );

    $seed = isset($payload['seed'])
        ? (int) qk_decision_number($payload['seed'], 'The simulation seed', 1.0, 2147483646.0)
        : random_int(1, 2147483646);
    $requestedIterations = isset($payload['iterations'])
        ? (int) qk_decision_number(
            $payload['iterations'],
            'The iteration count',
            (float) $budget['minIterations'],
            (float) $budget['maxIterations']
        )
        : max(
            $budget['minIterations'],
            min((int) $config['iterations'], $budget['maxIterations'])
        );

    $appetite = qk_decision_appetite($payload['appetite'] ?? null);
    if ($action === 'portfolios' && qk_decision_portfolio_appetite_criteria($appetite) === []) {
        throw new QkLiveHttpError(
            422,
            'VALIDATION_ERROR',
            'Portfolio evaluation requires an annual loss limit. High-end and exceedance criteria '
                . 'are not used to select portfolios because they depend on a joint distribution.'
        );
    }
    $constraints = qk_decision_constraints($payload['constraints'] ?? null);
    $treatments = qk_decision_resolved_treatments($payload, $appConfig, $budget['maxCandidates']);

    $inference = QkInferenceRepository::load($appConfig, $model);
    $vectors = QkRiskEngine::lossVectors($model, $inference, $validated, $seed, $requestedIterations);
    $realised = qk_decision_realise_effects(
        $treatments,
        $seed,
        (int) $vectors['meta']['iterations'],
        $inference
    );

    $versionMeta = $model->versionMeta();
    $candidates = [];
    if ($action === 'portfolios') {
        $candidates = qk_decision_resolved_treatments(
            ['treatments' => $payload['candidateTreatments'] ?? $payload['treatments'] ?? []],
            $appConfig,
            $budget['maxCandidates']
        );
    }
    $fingerprintTreatments = $action === 'portfolios' ? $candidates : $treatments;
    $inputFingerprint = qk_decision_input_fingerprint(
        $validated,
        $fingerprintTreatments,
        $appetite,
        $constraints,
        $seed,
        $requestedIterations,
        $versionMeta,
        $config
    );
    $provenance = [
        'quickriskModelId' => (string) $versionMeta['modelId'],
        'quickriskModelVersion' => (string) $versionMeta['modelVersion'],
        'decisionMethodologyVersion' => QK_DECISION_METHODOLOGY_VERSION,
        'boardPackVersion' => QK_BOARD_PACK_VERSION,
        'effectModel' => QK_DECISION_EFFECT_MODEL,
        'simulationSeed' => $seed,
        'inputFingerprint' => $inputFingerprint,
        'iterations' => (int) $vectors['meta']['iterations'],
        'computeBudget' => [
            'maxIterations' => $budget['maxIterations'],
            'maxCandidates' => $budget['maxCandidates'],
            'maxPortfolios' => $budget['maxPortfolios'],
        ],
        'planningHorizonYears' => (int) $config['planningHorizonYears'],
        'sameGroupIndependentCoverage' => (float) $config['sameGroupIndependentCoverage'],
        'generatedAt' => gmdate('Y-m-d\TH:i:s\Z'),
    ];

    if ($action === 'baseline') {
        $baselineFactors = [];
        foreach ($vectors['scenarios'] as $scenario) {
            $baselineFactors[(string) $scenario['code']] = 1.0;
        }
        $summary = qk_decision_portfolio_metrics($vectors, $baselineFactors, qk_decision_thresholds($vectors, $appetite));

        return QkLiveResponse::ok([
            'action' => 'baseline',
            'baseline' => $summary,
            'appetite' => qk_decision_evaluate_appetite_criteria($summary, qk_decision_appetite_criteria($appetite)),
            'provenance' => $provenance,
            'acronyms' => qk_decision_acronyms(),
        ]);
    }

    if ($action === 'portfolios') {
        $portfolioRealised = qk_decision_realise_effects(
            $candidates,
            $seed,
            (int) $vectors['meta']['iterations'],
            $inference
        );
        $search = qk_decision_portfolio_search(
            $vectors,
            $candidates,
            $portfolioRealised,
            $appetite,
            $constraints,
            $config
        );

        return QkLiveResponse::ok([
            'action' => 'portfolios',
            'baseline' => $search['baseline'],
            'portfolios' => $search['portfolios'],
            'recommendedId' => $search['recommendedId'],
            'paretoIds' => $search['paretoIds'],
            'noneSatisfies' => $search['noneSatisfies'],
            'noneSatisfiesMessage' => $search['noneSatisfiesMessage'],
            'evaluated' => $search['evaluated'],
            'truncated' => $search['truncated'],
            'candidatesConsidered' => $search['candidatesConsidered'],
            'appetiteDefined' => $search['appetiteDefined'],
            'portfolioAppetiteDefined' => $search['portfolioAppetiteDefined'],
            'appetiteBasis' => $search['appetiteBasis'],
            'portfolioCriteria' => $search['portfolioCriteria'],
            'excludedCriteria' => $search['excludedCriteria'],
            'notes' => $search['notes'],
            'effects' => qk_decision_public_effects($portfolioRealised),
            'provenance' => $provenance,
            'acronyms' => qk_decision_acronyms(),
        ]);
    }

    if ($action === 'sensitivity') {
        $sensitivity = qk_decision_sensitivity($vectors, $treatments, $realised, $appetite, $config);

        return QkLiveResponse::ok([
            'action' => 'sensitivity',
            'sensitivity' => $sensitivity,
            'effects' => qk_decision_public_effects($realised),
            'provenance' => $provenance,
        ]);
    }

    $comparison = qk_decision_compare($vectors, $treatments, $realised, $appetite, $config);

    return QkLiveResponse::ok([
        'action' => 'compare',
        'baseline' => $comparison['baseline'],
        'treated' => $comparison['treated'],
        'delta' => $comparison['delta'],
        'appetite' => $comparison['appetite'],
        'cost' => $comparison['cost'],
        'delayPhases' => $comparison['delayPhases'],
        'riskReductionEfficiency' => $comparison['riskReductionEfficiency'],
        'factors' => $comparison['factors'],
        'effects' => $comparison['effects'],
        'treatments' => $treatments,
        'provenance' => $provenance,
        'acronyms' => qk_decision_acronyms(),
    ]);
}

/**
 * Saves a computed decision analysis for the current anonymous session.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_decision_save(
    array $server,
    array $appConfig,
    QkDecisionRepository $repository,
    array $cookies,
    string $rawBody,
    ?QkLiveRepository $liveRepository = null
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'save');
    qk_live_assert_same_origin($server, $appConfig);
    qk_live_assert_json_request($server, $liveConfig, $rawBody);

    $liveRepository ??= new QkLivePdoRepository(qk_live_pdo($liveConfig));
    $session = qk_live_require_session($liveRepository, $cookies, $liveConfig, $server);
    qk_live_assert_csrf($server, $session);

    $payload = qk_live_decode_object($rawBody);
    $validated = qk_decision_validate_saved_result($payload, $appConfig);
    if (!$repository->methodologyVersionEnabled((string) $validated['decisionVersion'])) {
        throw new QkLiveHttpError(
            422,
            'METHODOLOGY_UNKNOWN',
            'This analysis uses a Decision Lab methodology version that this server does not accept.'
        );
    }

    $now = gmdate('Y-m-d H:i:s');

    $record = [
        'publicId' => qk_live_public_id(),
        'title' => qk_live_text($payload['title'] ?? '', 'The title', 160),
        'quickriskModelId' => (string) $validated['quickriskModelId'],
        'quickriskModelVersion' => (string) $validated['quickriskModelVersion'],
        'decisionMethodologyVersion' => (string) $validated['decisionVersion'],
        'boardPackVersion' => (string) $validated['boardPackVersion'],
        'simulationSeed' => (int) $validated['simulationSeed'],
        'iterations' => (int) $validated['iterations'],
        'appetiteStatus' => (string) $validated['status'],
        'baselineEal' => (float) $validated['baselineEal'],
        'treatedEal' => (float) $validated['treatedEal'],
        'initialInvestment' => (float) $validated['initialInvestment'],
        'annualOperatingCost' => (float) $validated['annualOperatingCost'],
        'recommendedJson' => qk_live_encode(is_array($validated['recommended']) ? $validated['recommended'] : []),
        'selectionJson' => qk_live_encode((array) $validated['selection']),
        'appetiteJson' => qk_live_encode(is_array($validated['appetite']) ? $validated['appetite'] : []),
        'resultJson' => qk_live_encode((array) $validated['result']),
        'createdAt' => $now,
        'updatedAt' => $now,
    ];

    return QkLiveResponse::ok($repository->createDecision((int) $session['id'], $record), 201);
}



/**
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_decision_list(
    array $server,
    array $appConfig,
    QkDecisionRepository $repository,
    array $cookies,
    ?QkLiveRepository $liveRepository = null
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'list');
    $liveRepository ??= new QkLivePdoRepository(qk_live_pdo($liveConfig));
    $session = qk_live_require_session(
        $liveRepository,
        $cookies,
        $liveConfig,
        $server
    );

    return QkLiveResponse::ok($repository->listDecisions((int) $session['id']));
}

/**
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_decision_get(
    array $server,
    array $appConfig,
    QkDecisionRepository $repository,
    array $cookies,
    string $publicId
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'list');
    $session = qk_live_require_session(
        new QkLivePdoRepository(qk_live_pdo($liveConfig)),
        $cookies,
        $liveConfig,
        $server
    );

    $record = $repository->findDecision((int) $session['id'], $publicId);
    if ($record === null) {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'Decision analysis not found.');
    }

    return QkLiveResponse::ok($record);
}

/**
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_decision_archive(
    array $server,
    array $appConfig,
    QkDecisionRepository $repository,
    array $cookies,
    string $publicId
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'update');
    qk_live_assert_same_origin($server, $appConfig);
    $session = qk_live_require_session(
        new QkLivePdoRepository(qk_live_pdo($liveConfig)),
        $cookies,
        $liveConfig,
        $server
    );
    qk_live_assert_csrf($server, $session);

    $now = gmdate('Y-m-d H:i:s');
    if (!$repository->archiveDecision($publicId, (int) $session['id'], $now)) {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'Decision analysis not found.');
    }
    $repository->revokeDecisionShares($publicId, $now);

    return QkLiveResponse::ok(['archived' => true]);
}


/**
 * Creates a read-only Board Risk Pack link (replacing any previous link).
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_decision_share_create(
    array $server,
    array $appConfig,
    QkDecisionRepository $repository,
    array $cookies,
    string $publicId,
    ?QkLiveRepository $liveRepository = null
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'shareCreate');
    qk_live_assert_same_origin($server, $appConfig);
    $liveRepository ??= new QkLivePdoRepository(qk_live_pdo($liveConfig));
    $session = qk_live_require_session($liveRepository, $cookies, $liveConfig, $server);
    qk_live_assert_csrf($server, $session);

    $record = $repository->findDecision((int) $session['id'], $publicId);
    if ($record === null) {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'Decision analysis not found.');
    }
    if ((string) ($record['status'] ?? '') === 'archived') {
        throw new QkLiveHttpError(409, 'CONFLICT', 'An archived analysis cannot be shared.');
    }

    $now = gmdate('Y-m-d H:i:s');
    $repository->revokeDecisionShares($publicId, $now);

    $token = qk_live_token();
    $ttlDays = $liveConfig['shareTtlDays'] ?? null;
    $expiresAt = null;
    if (is_int($ttlDays) && $ttlDays > 0) {
        $expiresAt = gmdate('Y-m-d H:i:s', time() + ($ttlDays * 86400));
    }

    $repository->createDecisionShare($publicId, hash('sha256', $token), $expiresAt, $now);

    $scheme = qk_live_is_https($server) ? 'https' : 'http';
    $host = (string) ($server['HTTP_HOST'] ?? 'localhost');
    $script = (string) ($server['SCRIPT_NAME'] ?? '/live/api/decision-share.php');
    $base = rtrim(str_replace('\\', '/', dirname(dirname(dirname($script)))), '/');

    return QkLiveResponse::ok(
        ['shareUrl' => $scheme . '://' . $host . $base . '/live/share/board/' . $token],
        201
    );
}

/**
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_decision_share_revoke(
    array $server,
    array $appConfig,
    QkDecisionRepository $repository,
    array $cookies,
    string $publicId
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'shareCreate');
    qk_live_assert_same_origin($server, $appConfig);
    $session = qk_live_require_session(
        new QkLivePdoRepository(qk_live_pdo($liveConfig)),
        $cookies,
        $liveConfig,
        $server
    );
    qk_live_assert_csrf($server, $session);

    if ($repository->findDecision((int) $session['id'], $publicId) === null) {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'Decision analysis not found.');
    }

    $repository->revokeDecisionShares($publicId, gmdate('Y-m-d H:i:s'));

    return QkLiveResponse::ok(['revoked' => true]);
}

/**
 * Public read-only Board Risk Pack retrieval by opaque token.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @return array<string,mixed>
 */
function qk_decision_shared(array $server, array $appConfig, QkDecisionRepository $repository, string $token): array
{
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'shareRead');

    if (preg_match('/^[a-f0-9]{64}$/', $token) !== 1) {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'This shared report is no longer available.');
    }

    $record = $repository->findActiveShareByHash(hash('sha256', $token), gmdate('Y-m-d H:i:s'));
    if ($record === null || ($record['status'] ?? '') === 'archived') {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'This shared report is no longer available.');
    }

    return QkLiveResponse::ok($record);
}


/**
 * Lists the curated library plus this session's own custom treatments.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_decision_treatment_catalogue(
    array $server,
    array $appConfig,
    QkDecisionRepository $repository,
    array $cookies,
    ?QkLiveRepository $liveRepository = null
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'list');
    $liveRepository ??= new QkLivePdoRepository(qk_live_pdo($liveConfig));
    $session = qk_live_require_session(
        $liveRepository,
        $cookies,
        $liveConfig,
        $server
    );

    $custom = [];
    foreach ($repository->listCustomTreatments((int) $session['id']) as $entry) {
        $entry['definition']['publicId'] = $entry['publicId'];
        $custom[] = $entry;
    }

    return QkLiveResponse::ok([
        'curated' => qk_decision_curated_treatments(),
        'custom' => $custom,
        'mechanismGroups' => QK_DECISION_MECHANISM_GROUPS,
        'evidenceLevels' => QK_DECISION_EVIDENCE_LEVELS,
        'methodologyVersion' => QK_DECISION_METHODOLOGY_VERSION,
    ]);
}

/**
 * Stores a custom treatment for the current anonymous session.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_decision_custom_create(
    array $server,
    array $appConfig,
    QkDecisionRepository $repository,
    array $cookies,
    string $rawBody,
    ?QkLiveRepository $liveRepository = null
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'update');
    qk_live_assert_same_origin($server, $appConfig);
    qk_live_assert_json_request($server, $liveConfig, $rawBody);
    $liveRepository ??= new QkLivePdoRepository(qk_live_pdo($liveConfig));
    $session = qk_live_require_session(
        $liveRepository,
        $cookies,
        $liveConfig,
        $server
    );
    qk_live_assert_csrf($server, $session);

    $payload = qk_live_decode_object($rawBody);
    $definition = qk_decision_treatment_selection(
        ['source' => 'custom', 'definition' => $payload['definition'] ?? null],
        $appConfig
    );

    $now = gmdate('Y-m-d H:i:s');
    $saved = $repository->createCustomTreatment((int) $session['id'], [
        'publicId' => qk_live_public_id(),
        'treatmentId' => (string) $definition['id'],
        'name' => (string) $definition['name'],
        'mechanismGroup' => (string) $definition['mechanismGroup'],
        'evidenceQuality' => (string) $definition['evidenceQuality'],
        'definitionJson' => qk_live_encode($definition),
        'createdAt' => $now,
        'updatedAt' => $now,
    ]);

    return QkLiveResponse::ok($saved, 201);
}

/**
 * Deletes a custom treatment owned by the current session.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_decision_custom_delete(
    array $server,
    array $appConfig,
    QkDecisionRepository $repository,
    array $cookies,
    string $publicId,
    ?QkLiveRepository $liveRepository = null
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'update');
    qk_live_assert_same_origin($server, $appConfig);
    $liveRepository ??= new QkLivePdoRepository(qk_live_pdo($liveConfig));
    $session = qk_live_require_session(
        $liveRepository,
        $cookies,
        $liveConfig,
        $server
    );
    qk_live_assert_csrf($server, $session);

    if (!$repository->deleteCustomTreatment($publicId, (int) $session['id'])) {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'Custom treatment not found.');
    }

    return QkLiveResponse::ok(['deleted' => true]);
}

