<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — deployment preflight.
 *
 * Usage:  php tools/preflight.php [--web-root=PATH] [--origin=https://HOST]
 *
 * Run it on the host. It answers the questions a bare 403, a missing header or an
 * ORIGIN_REJECTED never answer on their own:
 *
 *   1. Which origins does the deployed PHP actually accept?
 *   2. Did the deploy leave the security headers and the beta gate in the web-root .htaccess?
 *   3. Are the model, the database and the holding notice where the configuration says?
 *
 * Read-only: it writes nothing. It prints no password, salt or address — the beta gate is
 * reported as a count of allow-listed entries, never as the entries themselves.
 */

$qkOption = ['web-root' => (string) (getenv('WEB_DIR') ?: ''), 'origin' => ''];
foreach (array_slice($argv, 1) as $qkArgument) {
    if (str_starts_with($qkArgument, '--web-root=')) {
        $qkOption['web-root'] = substr($qkArgument, strlen('--web-root='));
    } elseif (str_starts_with($qkArgument, '--origin=')) {
        $qkOption['origin'] = substr($qkArgument, strlen('--origin='));
    }
}

if ($qkOption['web-root'] === '') {
    $qkHome = (string) (getenv('HOME') ?: getenv('USERPROFILE') ?: '');
    $qkOption['web-root'] = $qkHome . '/public_html/quickrisk';
}

$qkWebRoot = realpath($qkOption['web-root']);
if ($qkWebRoot === false || !is_dir($qkWebRoot)) {
    fwrite(STDERR, "The web root was not found: {$qkOption['web-root']}\n");
    fwrite(STDERR, "Pass it explicitly: php tools/preflight.php --web-root=/home/USER/public_html/quickrisk\n");
    exit(1);
}

$qkPassed = 0;
$qkFailed = 0;
$qkWarned = 0;

function qk_preflight_pass(string $text): void
{
    global $qkPassed;
    $qkPassed++;
    echo '  PASS   ' . $text . "\n";
}

function qk_preflight_fail(string $text): void
{
    global $qkFailed;
    $qkFailed++;
    echo '  FAIL   ' . $text . "\n";
}

function qk_preflight_warn(string $text): void
{
    global $qkWarned;
    $qkWarned++;
    echo '  WARN   ' . $text . "\n";
}

echo "FAIR QuickRisk deployment preflight\n";
echo '  web root: ' . $qkWebRoot . "\n\n";

// ---------------------------------------------------------------------------
// 1. The configuration the deployed PHP actually loads.
// ---------------------------------------------------------------------------
echo "Configuration\n";

$qkConfigFile = $qkWebRoot . '/includes/config.php';
if (!is_file($qkConfigFile)) {
    qk_preflight_fail('includes/config.php is missing from the web root: the deploy did not publish it');
    $qkConfig = [];
} else {
    /** @var array<string,mixed> $qkConfig */
    $qkConfig = require $qkConfigFile;
    qk_preflight_pass('includes/config.php loaded (' . count($qkConfig) . ' sections)');
}

$qkApplication = (array) ($qkConfig['application'] ?? []);
$qkOrigins = array_map(
    static fn ($origin): string => strtolower(rtrim((string) $origin, '/')),
    (array) ($qkApplication['allowedOrigins'] ?? [])
);
$qkSuffixes = array_map(
    static fn ($suffix): string => strtolower((string) $suffix),
    (array) ($qkApplication['allowedOriginSuffixes'] ?? [])
);

echo '         allowedOrigins: ' . ($qkOrigins === [] ? '(none)' : implode(', ', $qkOrigins)) . "\n";
echo '         allowedOriginSuffixes: ' . ($qkSuffixes === [] ? '(none)' : implode(', ', $qkSuffixes)) . "\n";
echo '         requireHttps: ' . (($qkApplication['requireHttps'] ?? true) === true ? 'true' : 'false') . "\n";

// A placeholder copied from a guide is the classic cause of ORIGIN_REJECTED.
foreach ($qkOrigins as $qkOrigin) {
    if (str_contains($qkOrigin, 'host') || !str_contains($qkOrigin, '://')) {
        qk_preflight_fail('allowedOrigins still contains a placeholder: ' . $qkOrigin);
    }
}

if ($qkOption['origin'] !== '') {
    $qkCandidate = strtolower(rtrim($qkOption['origin'], '/'));
    $qkAccepted = in_array($qkCandidate, $qkOrigins, true);
    foreach ($qkSuffixes as $qkSuffix) {
        if ($qkSuffix !== '' && str_ends_with($qkCandidate, $qkSuffix)) {
            $qkAccepted = true;
        }
    }

    if ($qkAccepted) {
        qk_preflight_pass('the origin ' . $qkCandidate . ' is accepted');
    } else {
        qk_preflight_fail(
            'the origin ' . $qkCandidate . ' is REJECTED by the calculation endpoint (ORIGIN_REJECTED); '
            . 'add exactly this scheme and host to allowedOrigins'
        );
    }
} else {
    echo "         pass --origin=https://your.address to test one against this list\n";
}

// ---------------------------------------------------------------------------
// 2. The authoritative model, outside the web root.
// ---------------------------------------------------------------------------
echo "\nModel\n";

$qkModelPath = (string) ($qkConfig['modelPath'] ?? '');
$qkManifest = $qkModelPath . '/manifest.json';

if ($qkModelPath === '') {
    qk_preflight_fail('modelPath is not configured');
} elseif (!is_dir($qkModelPath)) {
    qk_preflight_fail('the model directory does not exist: ' . $qkModelPath);
} elseif (str_starts_with($qkModelPath, $qkWebRoot)) {
    qk_preflight_fail('the model directory is inside the web root: ' . $qkModelPath);
} elseif (!is_readable($qkManifest)) {
    qk_preflight_fail('manifest.json is missing or unreadable in ' . $qkModelPath);
} else {
    /** @var array<string,mixed> $qkModel */
    $qkModel = json_decode((string) file_get_contents($qkManifest), true) ?: [];
    qk_preflight_pass(
        'model ' . (string) ($qkModel['modelId'] ?? '?')
        . ' version ' . (string) ($qkModel['applicationVersion'] ?? '?')
        . ' is readable outside the web root'
    );
}

// ---------------------------------------------------------------------------
// 3. The web-root .htaccess: headers, origin gate, ACME exemption, error pages,
//    the beta gate, and the line endings that break all of it.
// ---------------------------------------------------------------------------
echo "\nWeb-root .htaccess\n";

$qkHtaccessFile = $qkWebRoot . '/.htaccess';
if (!is_file($qkHtaccessFile)) {
    qk_preflight_fail('no .htaccess in the web root: no CSP, no HSTS and no beta gate');
} else {
    $qkHtaccess = (string) file_get_contents($qkHtaccessFile);

    if (str_contains($qkHtaccess, "\r\n")) {
        qk_preflight_fail(
            'the file has Windows (CRLF) line endings. Apache appends the carriage return to '
            . 'each pattern, so RewriteCond never matches; save it with Unix line endings'
        );
    } else {
        qk_preflight_pass('Unix line endings');
    }

    if (str_contains($qkHtaccess, 'Header always set Content-Security-Policy')) {
        qk_preflight_pass('the Content-Security-Policy is declared');
    } else {
        qk_preflight_fail('no Content-Security-Policy header: QuickRisk Live and Decision Lab cannot call the API');
    }

    if (str_contains($qkHtaccess, "connect-src 'self'")) {
        qk_preflight_pass('connect-src permits the same-origin API calls');
    } else {
        qk_preflight_fail("the policy lacks connect-src 'self': every fetch from the app is blocked");
    }

    // The always-on Cloudflare origin gate. A deployed stub means nothing works;
    // a missing gate means the origin answers anyone who finds its address.
    if (str_contains($qkHtaccess, 'Fail-closed stub')) {
        qk_preflight_fail('the origin gate is still the unrendered stub: every request is refused');
    } elseif (preg_match('/RewriteCond\s+%\{HTTP:X-Origin-Secret\}\s+!\^[A-Za-z0-9_-]{32,128}\$/', $qkHtaccess) === 1) {
        qk_preflight_pass('the Cloudflare origin gate is rendered');
    } else {
        qk_preflight_fail('no rendered Cloudflare origin gate: the origin answers anyone who finds it');
    }

    // /.well-known must stay reachable without the header, or renewal fails.
    $qkWellKnownAt = strpos($qkHtaccess, 'RewriteRule ^\\.well-known/');
    $qkGateAt = strpos($qkHtaccess, 'RewriteCond %{HTTP:X-Origin-Secret}');
    if ($qkWellKnownAt === false) {
        qk_preflight_fail('/.well-known is gated: Let\'s Encrypt renewal will fail with 403');
    } elseif ($qkGateAt !== false && $qkWellKnownAt > $qkGateAt) {
        qk_preflight_fail('the /.well-known exemption sits after the gate, so it never runs');
    } elseif (!str_contains($qkHtaccess, 'RewriteCond %{REQUEST_METHOD} ^(GET|HEAD)$')) {
        qk_preflight_fail('the /.well-known exemption is not limited to GET and HEAD');
    } else {
        qk_preflight_pass('/.well-known is exempt from the gate, for reading only');
    }

    if (is_dir($qkWebRoot . '/.well-known/acme-challenge')) {
        qk_preflight_pass('the ACME challenge directory exists');
    } else {
        qk_preflight_warn('no .well-known/acme-challenge yet: cPanel creates it on the next renewal');
    }

    // Branded error documents: declared, and pointing at files that exist.
    foreach ([403, 404, 500, 503] as $qkCode) {
        if (!str_contains($qkHtaccess, 'ErrorDocument ' . $qkCode . ' /errors/' . $qkCode . '.html')) {
            qk_preflight_warn('no branded ErrorDocument for ' . $qkCode);
        } elseif (!is_file($qkWebRoot . '/errors/' . $qkCode . '.html')) {
            qk_preflight_fail('ErrorDocument ' . $qkCode . ' points at a missing file: /errors/' . $qkCode . '.html');
        } else {
            qk_preflight_pass('the ' . $qkCode . ' error page exists');
        }
    }

    // Live probe, only when an origin was supplied. A 403 on the ACME path is a
    // renewal failure in waiting; anything else (404 for an absent probe) is fine.
    if ($qkOption['origin'] !== '') {
        $qkProbeUrl = rtrim($qkOption['origin'], '/') . '/.well-known/acme-challenge/qk-preflight-probe';
        $qkProbeContext = stream_context_create([
            'http' => ['method' => 'GET', 'timeout' => 6, 'ignore_errors' => true],
        ]);
        $qkProbeBody = @file_get_contents($qkProbeUrl, false, $qkProbeContext);
        $qkProbeStatus = $http_response_header[0] ?? '';
        if ($qkProbeBody === false || $qkProbeStatus === '') {
            qk_preflight_warn('the ACME probe could not reach ' . $qkProbeUrl);
        } elseif (str_contains($qkProbeStatus, ' 403')) {
            qk_preflight_fail('the ACME probe returned 403: certificate renewal will fail');
        } else {
            qk_preflight_pass('the ACME probe is not gated (' . trim($qkProbeStatus) . ')');
        }
    }

    if (str_contains($qkHtaccess, 'BETA ACCESS GATE')) {
        $qkGateEntries = substr_count($qkHtaccess, 'RewriteCond %{REMOTE_ADDR}');
        qk_preflight_pass('the beta gate is merged, allow-listing ' . $qkGateEntries . ' address(es)');

        if ($qkGateEntries === 0) {
            qk_preflight_warn('the gate block is present but allow-lists nothing: every visitor is blocked');
        }

        if (preg_match('/ErrorDocument\s+403\s+(\S+)/', $qkHtaccess, $qkMatch) === 1) {
            $qkNoticePath = $qkWebRoot . str_replace('/', DIRECTORY_SEPARATOR, rtrim($qkMatch[1], '/'));
            if (is_file($qkNoticePath)) {
                qk_preflight_pass('the 403 notice exists at ' . $qkMatch[1]);
            } else {
                qk_preflight_fail('the 403 notice is missing at ' . $qkMatch[1] . ': blocked visitors see an empty 403');
            }
        } else {
            qk_preflight_warn('the gate has no ErrorDocument, so blocked visitors get a bare 403');
        }
    } else {
        qk_preflight_warn(
            'no beta gate in this file. A by-hand deploy does not merge one: append '
            . '~/quickrisk-config/beta-gate.htaccess to it, or deploy with tools/deploy.sh'
        );
    }
}

// ---------------------------------------------------------------------------
// 4. The Live and Decision Lab database (one schema serves everything).
// ---------------------------------------------------------------------------
echo "\nDatabase\n";

$qkDatabase = (array) ($qkConfig['live']['database'] ?? []);
$qkDbName = (string) ($qkDatabase['name'] ?? '');
$qkDbUser = (string) ($qkDatabase['user'] ?? '');
$qkDbPassword = (string) ($qkDatabase['password'] ?? '');
$qkDbHost = (string) ($qkDatabase['host'] ?? '127.0.0.1');
$qkDbPort = (int) ($qkDatabase['port'] ?? 3306);

if (!extension_loaded('pdo_mysql')) {
    qk_preflight_fail('the pdo_mysql extension is not loaded: no QuickRisk Live, no Decision Lab');
} elseif ($qkDbName === '' || $qkDbUser === '') {
    qk_preflight_fail(
        'live.database.name or live.database.user is empty. The repository ships them empty on '
        . 'purpose; set them in ' . dirname($qkWebRoot) . '/quickrisk-config/config.php'
    );
} else {
    try {
        $qkPdo = new PDO(
            sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $qkDbHost, $qkDbPort, $qkDbName, (string) ($qkDatabase['charset'] ?? 'utf8mb4')),
            $qkDbUser,
            $qkDbPassword,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]
        );
        qk_preflight_pass('connected to ' . $qkDbName . ' as ' . $qkDbUser);

        $qkTables = $qkPdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) ?: [];
        $qkTables = array_map('strval', $qkTables);

        if (in_array('anonymous_sessions', $qkTables, true)) {
            qk_preflight_pass('the QuickRisk Live schema is present (' . count($qkTables) . ' tables)');
        } else {
            qk_preflight_fail('anonymous_sessions is missing: migrations 001-004 have not been applied');
        }

        $qkDecisionTables = array_filter($qkTables, static fn (string $name): bool => str_starts_with($name, 'decision'));
        if ($qkDecisionTables === []) {
            qk_preflight_fail('no decision tables: migration 005 has not been applied');
        } else {
            qk_preflight_pass('the Decision Lab schema is present (' . count($qkDecisionTables) . ' tables)');
        }
    } catch (Throwable $qkException) {
        $qkMessage = str_replace($qkDbPassword, '***', $qkException->getMessage());
        qk_preflight_fail('cannot use the database: ' . $qkMessage);
    }
}

// ---------------------------------------------------------------------------
// 5. The rest of the configuration that bites on a first deployment.
// ---------------------------------------------------------------------------
echo "\nConfiguration hygiene\n";

$qkSalt = (string) ($qkConfig['rateLimit']['clientHashSalt'] ?? '');
if ($qkSalt === '' || str_contains($qkSalt, 'set-a-random-salt')) {
    qk_preflight_fail('rateLimit.clientHashSalt is still the placeholder: set a random value');
} else {
    qk_preflight_pass('rateLimit.clientHashSalt is set');
}

$qkStore = (string) ($qkConfig['rateLimit']['storePath'] ?? '');
if ($qkStore !== '' && !is_dir($qkStore) && !@mkdir($qkStore, 0700, true) && !is_dir($qkStore)) {
    qk_preflight_warn('the rate-limit store is not writable: ' . $qkStore . ' (the limiter may fall back or fail)');
} elseif ($qkStore !== '' && !is_writable($qkStore)) {
    qk_preflight_warn('the rate-limit store is not writable: ' . $qkStore);
} else {
    qk_preflight_pass('the rate-limit store is usable');
}

// ---------------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------------
echo "\n" . str_repeat('-', 78) . "\n";
printf("Preflight: %d passed, %d failed, %d warning(s)\n", $qkPassed, $qkFailed, $qkWarned);

if ($qkFailed > 0) {
    echo "\nFix the failures above before expecting the questionnaire, Live or the beta gate to work.\n";
    exit(1);
}

echo "\nEvery blocking check passed. If a visitor outside the allow-list still reaches the site,\n";
echo "the web server is not reading .htaccess at all: confirm AllowOverride includes FileInfo\n";
echo "(curl -s -o /dev/null -w '%{http_code}' https://HOST/includes/config.php must return 403).\n";
exit(0);

