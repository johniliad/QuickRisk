<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — calculation endpoint.
 *
 * POST /api/calculate.php
 *
 * Stateless zero-retention behaviour:
 *   - the complete assessment is submitted once, in a single HTTPS POST;
 *   - answers are validated, processed in memory and discarded;
 *   - the response is returned directly to the browser;
 *   - no session, cookie, database row, file, queue entry, email, webhook or log
 *     record containing assessment content is created;
 *   - no persistent results URL exists.
 *
 * The request decision path lives in qk_dispatch_calculation() so that it can be
 * exercised by the automated test suite. Error responses never disclose internals, and
 * the log helper only ever writes a fixed event code.
 */

require_once dirname(__DIR__) . '/includes/bootstrap.php';

$config = qk_config();
$result = qk_dispatch_calculation($config, $_SERVER);

$payload = $result['payload'];
$status = $result['status'];
unset($result);

QkHttp::sendJson($payload, $status, $config);

unset($payload);
