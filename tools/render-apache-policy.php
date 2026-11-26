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
 * --out must not name a path git tracks. The rendered file carries the origin secret, so
 * one `git add -A` would publish it. A path outside the repository is always allowed
 * (tools/deploy.sh writes the web root, tools/prepare-upload.php assembles the upload tree
 * in the system temp directory); a path inside it is allowed only when git confirms it is
 * untracked, such as frontend/dist/ or .tmp/.
 *
 * This script writes only the file named by --out. It never prints the secret.
 */

$qkRoot = dirname(__DIR__);
$qkOptions = ['out' => null, 'secret-file' => null, 'append' => [], 'check' => false, 'web-root' => null];

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
    } elseif (str_starts_with($qkArgument, '--web-root=')) {
        $qkOptions['web-root'] = substr($qkArgument, strlen('--web-root='));
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

if (!$qkOptions['check']) {
    qk_render_assert_output_is_not_versioned((string) $qkOptions['out'], $qkRoot);
}

$qkPolicyPath = $qkRoot . '/server/.htaccess';
if (!is_file($qkPolicyPath)) {
    qk_render_abort('The versioned policy was not found: ' . $qkPolicyPath);
}

$qkSecret = qk_render_secret($qkOptions, $qkRoot);
$qkRendered = qk_render_gate(qk_render_read($qkPolicyPath), $qkSecret);
$qkRendered = qk_render_style_hashes($qkRendered, $qkOptions['web-root'], $qkRoot);

foreach ($qkOptions['append'] as $qkFragmentPath) {
    if (!is_file($qkFragmentPath)) {
        qk_render_abort('The --append fragment was not found: ' . $qkFragmentPath);
    }
    $qkFragment = qk_render_read($qkFragmentPath);
    qk_render_assert_fragment_is_safe($qkFragment, $qkFragmentPath);
    $qkRendered .= "\n" . rtrim($qkFragment, "\n") . "\n";
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
echo "  content security: present, no 'unsafe-inline', inline styles by sha256 hash\n";
echo "  transport:        HSTS one year, includeSubDomains\n";
echo "  cross-origin:     all Access-Control-* headers removed\n";

exit(0);

function qk_render_usage(): void
{
    fwrite(STDOUT, <<<'TXT'
FAIR QuickRisk — render the deployed Apache policy.

  php tools/render-apache-policy.php --out PATH [--web-root PATH] [--secret-file PATH] [--append PATH]...
  php tools/render-apache-policy.php --check [--web-root PATH] [--secret-file PATH]

--web-root names the directory whose HTML documents are about to be published. The
renderer reads the inline <style> block of each one and writes its sha256 into the
style directive, so the policy allows exactly those blocks and nothing else. Pass
the real web root (deploy.sh and prepare-upload.php do); without it the repository
sources are hashed instead, which is what --check uses in the test suite.

The origin secret is read from --secret-file, QK_ORIGIN_SECRET, or one of:
  <repository>/quickrisk-config/cloudflare-origin-secret
  <home>/quickrisk-config/cloudflare-origin-secret
  <home>/.quickrisk/cloudflare-origin-secret

It must be 32-128 characters of [A-Za-z0-9_-]. Nothing is written when it is missing.

--out must not name a path git tracks: the rendered policy carries the secret, so the
renderer refuses a path that a commit could publish. Deploy to the web root, or to an
untracked tree such as the temporary upload folder.

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

/**
 * Refuses to write the rendered policy into a git-tracked path.
 *
 * The rendered file carries the Cloudflare origin secret, so a single `git add -A` would
 * publish it. Both publishing paths write outside the repository — tools/deploy.sh to the
 * web root, tools/prepare-upload.php into the system temp directory — so the guard only
 * interrogates git when --out points inside the repository, and then only accepts a path
 * that git reports as untracked (frontend/dist/, .tmp/).
 */
function qk_render_assert_output_is_not_versioned(string $target, string $root): void
{
    $outside = qk_render_relative_to_repository($target, $root);
    if ($outside === null) {
        return;
    }

    $tracked = qk_render_git_tracks($root, $outside);
    if ($tracked === true) {
        qk_render_abort(
            "Refusing to write the rendered policy to a path git tracks: {$target}\n"
            . "The rendered file carries the Cloudflare origin secret, so a commit would publish it.\n"
            . "Write to the web root (tools/deploy.sh) or to an untracked build tree\n"
            . "(tools/prepare-upload.php uses the system temp directory)."
        );
    }

    if ($tracked === null) {
        qk_render_abort(
            "Cannot confirm that this --out path is untracked: {$target}\n"
            . "git is unavailable here, so the renderer cannot prove that writing the secret\n"
            . "inside the repository is safe. Use an --out path outside the repository, or run\n"
            . "the renderer where git is on the PATH."
        );
    }
}

/**
 * Returns the path relative to the repository root, or null when it lies outside it.
 * The target need not exist yet: it is resolved lexically, never through the filesystem.
 */
function qk_render_relative_to_repository(string $target, string $root): ?string
{
    $absolute = qk_render_absolute_path($target);
    $repository = qk_render_absolute_path($root);

    // Windows resolves paths case-insensitively; git does not, but the filesystem does, so a
    // differently-cased Server/.htaccess would still overwrite a tracked file.
    if (DIRECTORY_SEPARATOR === '\\') {
        $absolute = strtolower($absolute);
        $repository = strtolower($repository);
    }

    if ($absolute === $repository) {
        return '';
    }

    if (!str_starts_with($absolute, rtrim($repository, '/') . '/')) {
        return null;
    }

    return substr($absolute, strlen(rtrim($repository, '/')) + 1);
}

/**
 * Makes a path absolute and removes "." and ".." segments without touching the filesystem.
 */
function qk_render_absolute_path(string $path): string
{
    $normalised = str_replace('\\', '/', $path);

    $prefix = '';
    if (preg_match('#^([A-Za-z]:)?/#', $normalised, $match) === 1) {
        $prefix = $match[0];
        $normalised = substr($normalised, strlen($prefix));
    } else {
        $prefix = str_replace('\\', '/', (string) getcwd()) . '/';
    }

    $segments = [];
    foreach (explode('/', $normalised) as $segment) {
        if ($segment === '' || $segment === '.') {
            continue;
        }
        if ($segment === '..') {
            array_pop($segments);
            continue;
        }
        $segments[] = $segment;
    }

    return $prefix . implode('/', $segments);
}

/**
 * Asks git whether it tracks the path.
 *
 * @return bool|null true when tracked, false when untracked, null when git cannot answer
 *                   (no git binary, not a work tree, or exec() disabled on the host).
 */
function qk_render_git_tracks(string $root, string $relative): ?bool
{
    if ($relative === '' || !function_exists('exec')) {
        return null;
    }

    [$exitCode, $output] = qk_render_git($root, ['rev-parse', '--is-inside-work-tree']);
    if ($exitCode !== 0 || trim($output) !== 'true') {
        return null;
    }

    [$listed] = qk_render_git($root, ['ls-files', '--error-unmatch', '--', $relative]);

    return $listed === 0;
}

/**
 * @param array<int,string> $arguments
 * @return array{0:int,1:string}
 */
function qk_render_git(string $root, array $arguments): array
{
    $command = 'git -C ' . escapeshellarg($root);
    foreach ($arguments as $argument) {
        $command .= ' ' . escapeshellarg($argument);
    }

    $output = [];
    $exitCode = 0;
    exec($command . ' 2>&1', $output, $exitCode);

    return [$exitCode, trim(implode("\n", $output))];
}

function qk_render_secret(array $options, string $root): string
{
    $candidates = [];
    if (is_string($options['secret-file'])) {
        $path = $options['secret-file'];
        if (!is_file($path)) {
            qk_render_abort('The --secret-file path does not exist: ' . $path);
        }
        $candidates[] = (string) file_get_contents($path);
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
        . "    # Internal error-document subrequests are exempt so that a refused request is\n"
        . "    # answered by the branded /errors/403.html page, not by Apache's bare fallback.\n"
        . "    # REDIRECT_STATUS is set by Apache during an internal redirect and cannot be\n"
        . "    # forged by a client, so every top-level request is still gated.\n"
        . '    RewriteCond %{ENV:REDIRECT_STATUS} ^$' . "\n"
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
    // The gate must not swallow its own error document. Apache serves
    // ErrorDocument /errors/403.html through an internal subrequest, so a gate that
    // denies subrequests too leaves the visitor on a bare Apache page.
    $subrequestAt = strpos($rendered, 'RewriteCond %{ENV:REDIRECT_STATUS} ^$');
    $secretAt = strpos($rendered, 'RewriteCond %{HTTP:X-Origin-Secret} !^');
    if ($subrequestAt === false) {
        $problems[] = 'the origin gate must exempt internal error-document subrequests (RewriteCond %{ENV:REDIRECT_STATUS} ^$)';
    } elseif ($secretAt === false || $subrequestAt > $secretAt) {
        $problems[] = 'the REDIRECT_STATUS exemption must come before the X-Origin-Secret condition, or it never runs';
    }
    if (substr_count($rendered, 'RewriteRule ^ - [F,L]') !== 1) {
        $problems[] = 'the gate must keep exactly one unconditional deny: RewriteRule ^ - [F,L]';
    }
    if (substr_count($rendered, $begin) !== 1) {
        $problems[] = 'the gate begin marker is missing or duplicated';
    }
    if (substr_count($rendered, $secret) !== 1) {
        $problems[] = 'the secret must appear exactly once in the rendered policy';
    }
    if (substr_count($rendered, 'Header always set Content-Security-Policy') !== 1) {
        $problems[] = 'the Content-Security-Policy must be stated exactly once';
    }

    // The content-security directive list, inspected as a value rather than as loose
    // text, so that a comment can never satisfy (or trip) this check.
    $csp = qk_render_csp_value($rendered);
    if ($csp === null) {
        $problems[] = 'the Content-Security-Policy value could not be read';
    } else {
        foreach ([
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self'",
            "media-src 'none'",
            "object-src 'none'",
            "frame-src 'none'",
            "child-src 'none'",
            "worker-src 'none'",
            "manifest-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ] as $directive) {
            if (!str_contains($csp, $directive)) {
                $problems[] = 'the Content-Security-Policy must keep the directive ' . $directive;
            }
        }
        if (str_contains(strtolower($csp), "'unsafe-inline'")) {
            $problems[] = "the style and script directives must not allow 'unsafe-inline'";
        }
        if (str_contains($csp, '*')) {
            $problems[] = 'the Content-Security-Policy must not contain a wildcard source';
        }
        if (preg_match_all('/sha256-[A-Za-z0-9+\/=]{43,44}/', $csp, $hashTokens) < 1) {
            $problems[] = 'the style directive must carry the sha256 hashes of the inline style blocks';
        } elseif (preg_match_all("/'sha256-[A-Za-z0-9+\/=]{43,44}'/", $csp) !== count($hashTokens[0])) {
            $problems[] = 'every inline-style hash must be a quoted source expression; an unquoted one is ignored by the browser';
        }
    }

    // Transport security: a short or zero max-age is the finding this policy exists to
    // prevent, so it is a hard failure rather than a warning.
    if (preg_match('/Header always set Strict-Transport-Security "max-age=(\d+)([^"]*)"/', $rendered, $hsts) !== 1) {
        $problems[] = 'the Strict-Transport-Security header must be set on every response';
    } else {
        if ((int) $hsts[1] < 15552000) {
            $problems[] = 'the Strict-Transport-Security max-age must be at least 15552000 seconds (180 days); 0 disables it';
        }
        if (!str_contains(strtolower($hsts[2]), 'includesubdomains')) {
            $problems[] = 'the Strict-Transport-Security header must cover subdomains';
        }
    }

    foreach ([
        'Header always set X-Content-Type-Options "nosniff"',
        'Header always set X-Frame-Options "DENY"',
        'Header always set Referrer-Policy "no-referrer"',
        'Header always set Cross-Origin-Opener-Policy "same-origin"',
        'Header always set X-Permitted-Cross-Domain-Policies "none"',
        'Header always unset Access-Control-Allow-Origin',
        'Header always unset Access-Control-Allow-Credentials',
    ] as $required) {
        if (!str_contains($rendered, $required)) {
            $problems[] = 'the policy must contain: ' . $required;
        }
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

/**
 * Returns the value of the single Content-Security-Policy header, or null.
 */
function qk_render_csp_value(string $policy): ?string
{
    if (preg_match('/Header\s+always\s+set\s+Content-Security-Policy\s+"([^"]*)"/', $policy, $match) !== 1) {
        return null;
    }

    return trim($match[1]);
}

/**
 * Rewrites the style directive so that it accepts exactly the inline <style> blocks of
 * the documents that are about to be published.
 *
 * 'unsafe-inline' is deliberately not used: it would also allow injected markup to
 * style, hide or overlay the page. A hash allows the three static documents that ship
 * their stylesheet inline (methodology, the branded error pages and the holding notice)
 * and nothing else.
 *
 * The hashes are computed from the bytes that are being deployed. Hash a different
 * copy of the file and a carriage return in the wrong place would silently leave the
 * error pages unstyled.
 */
function qk_render_style_hashes(string $policy, ?string $webRoot, string $root): string
{
    $hashes = qk_render_collect_style_hashes($webRoot, $root);

    $updated = preg_replace_callback(
        '/(style-src \'self\')([^;"]*)(;)/',
        static fn (array $match): string => $match[1]
            . ($hashes === [] ? '' : ' ' . implode(' ', $hashes))
            . $match[3],
        $policy,
        1,
        $count
    );

    if (!is_string($updated) || $count !== 1) {
        qk_render_abort('The policy must contain exactly one style-src directive to receive the inline-style hashes.');
    }

    return $updated;
}

/**
 * Collects sha256 hashes of the inline <style> blocks of the published documents.
 *
 * @return array<int,string>
 */
function qk_render_collect_style_hashes(?string $webRoot, string $root): array
{
    if (is_string($webRoot) && $webRoot !== '') {
        $base = rtrim(str_replace('\\', '/', $webRoot), '/');
        if (!is_dir($base)) {
            qk_render_abort('--web-root is not a directory: ' . $webRoot);
        }
        $relative = [
            'index.html',
            'methodology.html',
            'errors/403.html',
            'errors/404.html',
            'errors/500.html',
            'errors/503.html',
            'live/share/index.html',
            'UnderConstruction/UnderConstruction.html',
        ];
    } else {
        $base = rtrim(str_replace('\\', '/', $root), '/');
        $relative = [
            'frontend/index.html',
            'frontend/public/methodology.html',
            'frontend/public/errors/403.html',
            'frontend/public/errors/404.html',
            'frontend/public/errors/500.html',
            'frontend/public/errors/503.html',
            'frontend/live/share/index.html',
            'static-pages/UnderConstruction.html',
        ];
    }

    $hashes = [];
    foreach ($relative as $path) {
        $document = $base . '/' . $path;
        if (!is_file($document)) {
            continue;
        }
        // No line-ending normalisation here: the hash must match the bytes Apache serves.
        $html = (string) file_get_contents($document);
        if ($html === '') {
            continue;
        }
        if (preg_match_all('#<style\b[^>]*>(.*?)</style>#is', $html, $blocks) > 0) {
            foreach ($blocks[1] as $css) {
                // The HTML parser normalises CRLF to LF before the browser hashes an inline
                // style block, so the digest must be taken over the normalised text. This also
                // makes the value independent of the line endings in the repository.
                $normalised = str_replace(["\r\n", "\r"], "\n", (string) $css);
                // A hash source is a quoted token in the policy.
                $hashes[] = "'sha256-" . base64_encode(hash('sha256', $normalised, true)) . "'";
            }
        }
    }

    $hashes = array_values(array_unique($hashes));
    sort($hashes);

    return $hashes;
}


/**
 * Refuses an appended fragment that restates a security header.
 *
 * The beta gate is appended after the policy, so whatever it says wins. A gate that
 * carries its own transport, framing or cross-origin header silently downgrades the
 * published site — that is how a strict origin policy ends up answering with
 * 'max-age=0', 'X-Frame-Options: SAMEORIGIN' or a CORS wildcard.
 */
function qk_render_assert_fragment_is_safe(string $fragment, string $path): void
{
    $protected = '(Content-Security-Policy|Strict-Transport-Security|X-Frame-Options'
        . '|X-Content-Type-Options|Referrer-Policy|Permissions-Policy'
        . '|Cross-Origin-Opener-Policy|Cross-Origin-Resource-Policy'
        . '|X-Permitted-Cross-Domain-Policies|Access-Control-[A-Za-z-]+)';

    if (preg_match(
        '/^\s*Header\s+(?:always\s+|onsuccess\s+)?(?:set|add|append|merge|edit|unset|echo)\s+'
        . $protected . '\b/im',
        $fragment
    ) === 1) {
        qk_render_abort(
            "The appended fragment restates a security header and would override the policy:\n"
            . "  " . $path . "\n"
            . "It is appended after the policy, so its values win. Remove every Header line for\n"
            . "those headers from the gate: the policy already sets them for error responses too,\n"
            . "including the 403 holding notice."
        );
    }
}
