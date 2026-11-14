<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — assemble an upload tree for the manual cPanel/FTP deployment.
 *
 * Usage:
 *   php tools/prepare-upload.php [--out=DIR] [--append-beta-gate] [--secret-file=PATH] [--force]
 *
 * This is the manual equivalent of tools/deploy.sh. It copies the compiled
 * frontend, the PHP application and the rendered web-root .htaccess into one
 * folder that can be dragged into cPanel File Manager, so the fail-closed
 * server/.htaccess is never uploaded by hand.
 *
 * The rendered policy is produced by tools/render-apache-policy.php — the same
 * implementation the host deploy uses — so the two paths cannot diverge. The
 * output contains the origin secret: it is written outside the repository and
 * outside OneDrive by default, and must be deleted after the upload.
 *
 * --append-beta-gate merges <repository>/quickrisk-config/beta-gate.htaccess,
 * exactly as tools/deploy.sh does. --force allows a non-empty --out to be
 * replaced; the default temporary folder is always rebuilt.
 */

$qkRoot = dirname(__DIR__);
$qkDefaultOut = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'qk-upload';
$qkOptions = [
    'out' => $qkDefaultOut,
    'out-given' => false,
    'beta' => false,
    'secret-file' => null,
    'force' => false,
];

foreach (array_slice($argv, 1) as $qkArgument) {
    if ($qkArgument === '--help' || $qkArgument === '-h') {
        qk_upload_usage();
        exit(0);
    } elseif ($qkArgument === '--append-beta-gate') {
        $qkOptions['beta'] = true;
    } elseif ($qkArgument === '--force') {
        $qkOptions['force'] = true;
    } elseif (str_starts_with($qkArgument, '--out=')) {
        $qkOptions['out'] = substr($qkArgument, strlen('--out='));
        $qkOptions['out-given'] = true;
    } elseif (str_starts_with($qkArgument, '--secret-file=')) {
        $qkOptions['secret-file'] = substr($qkArgument, strlen('--secret-file='));
    } else {
        fwrite(STDERR, 'Unknown option: ' . $qkArgument . "\n");
        qk_upload_usage();
        exit(2);
    }
}

$qkDist = $qkRoot . '/frontend/dist';
$qkOut = rtrim((string) $qkOptions['out'], '/\\');

if (!is_file($qkDist . '/index.html')) {
    qk_upload_abort('The frontend build is missing. Run:  cd frontend; npm ci; npm run build');
}
if (qk_upload_find($qkDist, '.map') !== []) {
    qk_upload_abort('Source maps were found in the build output and must not be published.');
}
if (str_starts_with(str_replace('\\', '/', $qkOut) . '/', str_replace('\\', '/', $qkRoot) . '/')) {
    fwrite(STDERR, "Warning: the output folder is inside the repository. The rendered .htaccess\n");
    fwrite(STDERR, "contains the origin secret, and a OneDrive-synced folder would copy it to the cloud.\n");
    fwrite(STDERR, "Prefer the default temporary folder.\n\n");
}

if (is_dir($qkOut)) {
    $qkEntries = array_diff(scandir($qkOut) ?: [], ['.', '..']);
    if ($qkEntries !== [] && $qkOptions['out-given'] && !$qkOptions['force']) {
        qk_upload_abort(
            'The output folder is not empty: ' . $qkOut . "\n"
            . 'Delete it, choose another --out, or pass --force to replace its contents.'
        );
    }
    qk_upload_clear($qkOut);
} elseif (!mkdir($qkOut, 0755, true) && !is_dir($qkOut)) {
    qk_upload_abort('Cannot create the output folder: ' . $qkOut);
}

// The compiled site first: a .htaccess inside dist could never override the
// rendered policy written afterwards.
qk_upload_copy($qkDist, $qkOut);
qk_upload_copy($qkRoot . '/server/api', $qkOut . '/api');
qk_upload_copy($qkRoot . '/server/includes', $qkOut . '/includes');
qk_upload_copy($qkRoot . '/server/live', $qkOut . '/live');

$qkCommand = [PHP_BINARY, $qkRoot . '/tools/render-apache-policy.php', '--out=' . $qkOut . '/.htaccess'];
if (is_string($qkOptions['secret-file'])) {
    $qkCommand[] = '--secret-file=' . $qkOptions['secret-file'];
}
if ($qkOptions['beta']) {
    $qkBetaGate = $qkRoot . '/quickrisk-config/beta-gate.htaccess';
    if (!is_file($qkBetaGate)) {
        qk_upload_abort('--append-beta-gate was requested but this file is missing: ' . $qkBetaGate);
    }
    $qkCommand[] = '--append=' . $qkBetaGate;
}

passthru(implode(' ', array_map('escapeshellarg', $qkCommand)), $qkStatus);
if ($qkStatus !== 0) {
    qk_upload_abort('The policy renderer refused to produce a safe policy. Nothing has been prepared.');
}

$qkPolicy = (string) file_get_contents($qkOut . '/.htaccess');
foreach (['RewriteCond %{HTTP:X-Origin-Secret} !^', 'ErrorDocument 404 /errors/404.html', 'RewriteRule ^\\.well-known/'] as $qkNeedle) {
    if (!str_contains($qkPolicy, $qkNeedle)) {
        qk_upload_abort('The rendered .htaccess is missing: ' . $qkNeedle);
    }
}
if (str_contains($qkPolicy, 'Fail-closed stub')) {
    qk_upload_abort('The rendered .htaccess still contains the fail-closed stub.');
}

foreach ([
    'errors/403.html',
    'errors/404.html',
    'errors/500.html',
    'errors/503.html',
    'LICENSE.txt',
    'NOTICE.txt',
    'THIRD-PARTY-NOTICES.txt',
    'api/calculate.php',
    'includes/live/handlers.php',
    'live/api/.htaccess',
] as $qkExpected) {
    if (!is_file($qkOut . '/' . $qkExpected)) {
        qk_upload_abort('The upload tree is incomplete: ' . $qkExpected . ' is missing.');
    }
}
if (qk_upload_find($qkOut, '.map') !== []) {
    qk_upload_abort('Source maps were found in the upload tree and must not be published.');
}

file_put_contents($qkOut . '/.qk-upload', "Delete this folder after uploading. It contains the origin secret.\n");

echo "Prepared upload tree: " . $qkOut . "\n\n";
echo "Upload it with cPanel File Manager:\n";
echo "  1. Open that folder and upload its CONTENTS into ~/public_html/quickrisk/,\n";
echo "     overwriting existing files. Include the .htaccess that is inside it.\n";
echo "  2. Never upload server/.htaccess, requirements/, docs/, quickrisk-config/ or\n";
echo "     fairquickmodel/. The first is the fail-closed stub; the rest must stay out\n";
echo "     of the web root. Model changes go separately to ~/fairquickmodel/.\n";
echo "  3. Do NOT delete .well-known/ on the server: Let's Encrypt writes the renewal\n";
echo "     challenge there, and the policy deliberately leaves it reachable.\n";
echo "  4. Delete this folder when the upload is done: its .htaccess contains the\n";
echo "     Cloudflare origin secret.\n\n";
echo "Verify:\n";
echo "  curl.exe -s -o NUL -w \"%{http_code}`n\" https://quickrisk.iliadis.net/\n";
echo "  curl.exe -s -o NUL -w \"%{http_code}`n\" https://quickrisk.iliadis.net/this-page-does-not-exist\n";

exit(0);

function qk_upload_usage(): void
{
    fwrite(STDOUT, <<<'TXT'
FAIR QuickRisk — assemble an upload tree for cPanel/FTP.

  php tools/prepare-upload.php [--out=DIR] [--append-beta-gate] [--secret-file=PATH] [--force]

  --out=DIR            target folder (default: <system temp>/qk-upload)
  --append-beta-gate   merge quickrisk-config/beta-gate.htaccess, as deploy.sh does
  --secret-file=PATH   read the Cloudflare origin secret from PATH
  --force              replace the contents of a non-empty --out folder

The folder contains the origin secret. Upload it, then delete it.

TXT);
}

function qk_upload_abort(string $message): never
{
    fwrite(STDERR, $message . "\n");
    exit(1);
}

/**
 * @return array<int,string>
 */
function qk_upload_find(string $directory, string $suffix): array
{
    if (!is_dir($directory)) {
        return [];
    }

    $matches = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS)
    );
    foreach ($iterator as $file) {
        /** @var SplFileInfo $file */
        if ($file->isFile() && str_ends_with(strtolower($file->getFilename()), $suffix)) {
            $matches[] = $file->getPathname();
        }
    }

    return $matches;
}

function qk_upload_clear(string $directory): void
{
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($iterator as $entry) {
        /** @var SplFileInfo $entry */
        $path = $entry->getPathname();
        if ($entry->isDir() && !$entry->isLink()) {
            @rmdir($path);
        } else {
            @unlink($path);
        }
    }
}

function qk_upload_copy(string $from, string $to): void
{
    if (!is_dir($from)) {
        qk_upload_abort('Not a directory: ' . $from);
    }
    if (!is_dir($to) && !mkdir($to, 0755, true) && !is_dir($to)) {
        qk_upload_abort('Cannot create the folder: ' . $to);
    }

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($from, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($iterator as $entry) {
        /** @var SplFileInfo $entry */
        $target = $to . DIRECTORY_SEPARATOR . $iterator->getSubPathname();
        if ($entry->isDir()) {
            if (!is_dir($target) && !mkdir($target, 0755, true) && !is_dir($target)) {
                qk_upload_abort('Cannot create the folder: ' . $target);
            }
        } elseif (!copy($entry->getPathname(), $target)) {
            qk_upload_abort('Cannot copy: ' . $entry->getPathname());
        }
    }
}