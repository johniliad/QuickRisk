<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — render the deployed Apache policy.
 *
 * Usage:
 *   php tools/render-apache-policy.php --out PATH [--secret-file PATH] [--append PATH]...
 *   php tools/render-apache-policy.php --check [--secret-file PATH]
 *
 * The committed server/.htaccess is FAIL-CLOSED: the origin gate block contains an
 * unconditional deny. This script replaces that block with the real
 * X-Origin-Secret condition, so the deployed policy refuses every request that did
 * not arrive from Cloudflare.
 *
 * The secret is never versioned. It is read, in order, from:
 *   1. --secret-file PATH
 *   2. the QK_ORIGIN_SECRET environment variable
 *   3. <repository>/quickrisk-config/cloudflare-origin-secret
 *   4. <home>/quickrisk-config/cloudflare-origin-secret
 *   5. <home>/.quickrisk/cloudflare-origin-secret
 *
 * It must be 32-128 characters of [A-Za-z0-9_-] (generate it with
 * `openssl rand -hex 32`). Anything else aborts without writing a file.
 *
 * --append copies an extra fragment (for example the unversioned beta gate) after
 * the rendered policy, matching what tools/deploy.sh does on the host.
 *
 * --check renders and validates in memory, writes nothing, and exits non-zero on
 * any defect. The test suite uses it.
 *
 * This script writes only the file named by --out. It never prints the secret.
 */

$qkRoot = dirname(__DIR__);
$qkOptions = ['out' => null, 'secret-file' => null, 'append' => [], 'check' => false];

foreach (array_slice($argv, 1) as $qkArgument) {
    if ($qkArgument === '--help' || $qkArgument === '-h') {
        qk_render_usage();
        exit(0);
    } elseif ($qkArgument === '--check') {
        $qkOptions['check'] = true;
    } elseif (str_starts_with($qkArgument, '--out=')) {
        $qkOptions['out'] = substr($qkArgument, strlen('--out='));
    } elseif (str_starts_with($qkArgument, '--secret-file=')) {
        $qkOptions['secret-file'] = substr($qkArgument, strlen('--secret-file='));
    } elseif (str_starts_with($qkArgument, '--append=')) {
        $qkOptions['append'][] = substr($qkArgument, strlen('--append='));
    } else {
        fwrite(STDERR, 'Unknown option: ' . $qkArgument . "\n");
        qk_render_usage();
        exit(2);
    }
}

if (!$qkOptions['check'] && !is_string($qkOptions['out'])) {
    fwrite(STDERR, "Pass --out PATH (or --check to validate only).\n");
    exit(2);
}

$qkPolicyPath = $qkRoot . '/server/.htaccess';
if (!is_file($qkPolicyPath)) {
    qk_render_abort('The versioned policy was not found: ' . $qkPolicyPath);
}

$qkSecret = qk_render_secret($qkOptions, $qkRoot);
$qkRendered = qk_render_gate(qk_render_read($qkPolicyPath), $qkSecret);

foreach ($qkOptions['append'] as $qkFragmentPath) {
    if (!is_file($qkFragmentPath)) {
        qk_render_abort('The --append fragment was not found: ' . $qkFragmentPath);
    }
    $qkRendered .= "\n" . rtrim(qk_render_read($qkFragmentPath), "\n") . "\n";
}

qk_render_validate($qkRendered, $qkSecret);

if (!$qkOptions['check']) {
    $qkTargetDirectory = dirname((string) $qkOptions['out']);
    if (!is_dir($qkTargetDirectory) && !mkdir($qkTargetDirectory, 0755, true) && !is_dir($qkTargetDirectory)) {
        qk_render_abort('Cannot create the output directory: ' . $qkTargetDirectory);
    }
    if (file_put_contents((string) $qkOptions['out'], $qkRendered, LOCK_EX) === false) {
        qk_render_abort('Cannot write the rendered policy: ' . $qkOptions['out']);
    }
}

echo 'Rendered Apache policy: ' . ($qkOptions['check'] ? '(check only, nothing written)' : $qkOptions['out']) . "\n";
echo "  origin gate:      rendered (X-Origin-Secret)\n";
echo "  .well-known:      exempt, before the gate\n";
echo "  error documents:  403 404 500 503\n";
echo "  content security: present\n";

exit(0);

function qk_render_usage(): void
{
    fwrite(STDOUT, <<<'TXT'
FAIR QuickRisk — render the deployed Apache policy.

  php tools/render-apache-policy.php --out PATH [--secret-file PATH] [--append PATH]...
  php tools/render-apache-policy.php --check [--secret-file PATH]

The origin secret is read from --secret-file, QK_ORIGIN_SECRET, or one of:
  <repository>/quickrisk-config/cloudflare-origin-secret
  <home>/quickrisk-config/cloudflare-origin-secret
  <home>/.quickrisk/cloudflare-origin-secret

It must be 32-128 characters of [A-Za-z0-9_-]. Nothing is written when it is missing.

TXT);
}

function qk_render_abort(string $message): never
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

function qk_render_read(string $path): string
{
    $contents = @file_get_contents($path);
    if ($contents === false) {
        qk_render_abort('Cannot read: ' . $path);
    }

    // Normalise every line ending so marker matching and Apache parsing agree.
    return str_replace(["\r\n", "\r"], "\n", (string) $contents);
}

function qk_render_secret(array $options, string $root): string
{
    $candidates = [];
    if (is_string($options['secret-file'])) {
        $candidates[] = $options['secret-file'];
    }

    $environment = getenv('QK_ORIGIN_SECRET');
    if (is_string($environment) && $environment !== '') {
        $candidates[] = $environment;
    }

    $home = (string) (getenv('HOME') ?: getenv('USERPROFILE') ?: '');
    $files = [$root . '/quickrisk-config/cloudflare-origin-secret'];
    if ($home !== '') {
        $files[] = $home . '/quickrisk-config/cloudflare-origin-secret';
        $files[] = $home . '/.quickrisk/cloudflare-origin-secret';
    }
    foreach ($files as $file) {
        if (is_file($file)) {
            $candidates[] = (string) file_get_contents($file);
        }
    }

    foreach ($candidates as $candidate) {
        $secret = trim((string) $candidate, " \t\n\r\0\x0B\xEF\xBB\xBF");
        if (preg_match('/^[A-Za-z0-9_-]{32,128}$/', $secret) === 1) {
            return $secret;
        }
    }

    qk_render_abort(
        "The Cloudflare origin secret is missing or invalid.\n"
        . "  Generate one:  openssl rand -hex 32\n"
        . "  Store it outside the repository and outside OneDrive, for example:\n"
        . "                 %USERPROFILE%\\.quickrisk\\cloudflare-origin-secret\n"
        . "  Or pass --secret-file PATH, or set QK_ORIGIN_SECRET.\n"
        . "  It must be 32-128 characters of A-Z, a-z, 0-9, underscore or hyphen.\n"
        . "Nothing was written: a policy without a usable gate must never be published."
    );
}

function qk_render_gate(string $policy, string $secret): string
{
    $begin = '# >>> QK-ORIGIN-GATE-BEGIN';
    $end = '# <<< QK-ORIGIN-GATE-END';

    if (substr_count($policy, $begin) !== 1 || substr_count($policy, $end) !== 1) {
        qk_render_abort('server/.htaccess must contain exactly one QK-ORIGIN-GATE block.');
    }

    $beginAt = strpos($policy, $begin);
    $endAt = strpos($policy, $end);
    if ($beginAt === false || $endAt === false || $endAt < $beginAt) {
        qk_render_abort('The QK-ORIGIN-GATE markers are in the wrong order.');
    }

    $rendered = $begin . "\n"
        . "<IfModule mod_rewrite.c>\n"
        . "    RewriteEngine On\n"
        . "    # Rendered by tools/render-apache-policy.php. Never version this value.\n"
        . '    RewriteCond %{HTTP:X-Origin-Secret} !^' . $secret . "$\n"
        . "    RewriteRule ^ - [F,L]\n"
        . "</IfModule>\n"
        . $end;

    return substr($policy, 0, $beginAt) . $rendered . substr($policy, $endAt + strlen($end));
}

function qk_render_validate(string $rendered, string $secret): void
{
    $begin = '# >>> QK-ORIGIN-GATE-BEGIN';
    $problems = [];

    if (substr_count($rendered, 'RewriteCond %{HTTP:X-Origin-Secret} !^') !== 1) {
        $problems[] = 'the origin gate must be rendered exactly once';
    }
    if (str_contains($rendered, 'Fail-closed stub')) {
        $problems[] = 'the fail-closed stub is still present';
    }
    if (substr_count($rendered, $begin) !== 1) {
        $problems[] = 'the gate begin marker is missing or duplicated';
    }
    if (substr_count($rendered, $secret) !== 1) {
        $problems[] = 'the secret must appear exactly once in the rendered policy';
    }
    if (substr_count($rendered, 'Content-Security-Policy') !== 1) {
        $problems[] = 'the Content-Security-Policy must be stated exactly once';
    }
    if (!str_contains($rendered, "connect-src 'self'")) {
        $problems[] = "the Content-Security-Policy must keep connect-src 'self'";
    }
    foreach ([403, 404, 500, 503] as $code) {
        if (!str_contains($rendered, 'ErrorDocument ' . $code . ' /errors/' . $code . '.html')) {
            $problems[] = 'the ErrorDocument for ' . $code . ' is missing';
        }
    }

    $wellKnownAt = strpos($rendered, 'RewriteRule ^\\.well-known/');
    if ($wellKnownAt === false) {
        $problems[] = 'the /.well-known exemption is missing';
    } else {
        $gateAt = strpos($rendered, $begin);
        if ($gateAt !== false && $wellKnownAt > $gateAt) {
            $problems[] = 'the /.well-known exemption must come before the origin gate';
        }
        if (!str_contains($rendered, 'RewriteCond %{REQUEST_METHOD} ^(GET|HEAD)$')) {
            $problems[] = 'the /.well-known exemption must be limited to GET and HEAD';
        }
    }

    if ($problems !== []) {
        qk_render_abort("The rendered policy is not safe to publish:\n  - " . implode("\n  - ", $problems));
    }
}