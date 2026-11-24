<?php

declare(strict_types=1);

/**
 * Release identity — the deployment database name and the version set.
 *
 * These tests make the release identity a permanent, checkable property instead of a
 * documentation convention:
 *
 *  - the MySQL database is `iliadis_quickrisk` and the account is `iliadis_quickrisk_user`,
 *    in every deployment document, the schema comments and the configuration template;
 *  - no retired database or account name may reappear in those artefacts;
 *  - every version identifier (model, schema, calibration, methodology, disclaimer and
 *    application) agrees across the manifest, the version record, the parameters, the
 *    content, the baseline fixture, the documentation and the frontend package metadata.
 *
 * Historical documents (the 1.0.0 and 1.1 audit records) are deliberately exempt: they
 * describe past releases and must not be rewritten.
 */

$qkHistoricalDocuments = [
    'AUDIT_RESPONSE_FAIR-QK-1.1.md',
    'MODEL_DOCUMENTATION_FAIR-QK-1.0.md',
];

$qkRetiredDatabasePatterns = [
    'CREATE DATABASE quickrisk',
    'DROP DATABASE quickrisk',
    'ON quickrisk.',
    "'quickrisk'@",
    'mysql -u quickrisk',
    "'name' => 'quickrisk'",
    "'user' => 'quickrisk'",
    'the same `quickrisk` database',
];

$qkRetiredVersionPatterns = ['FAIR-QK-1.2', 'CAL-1.2', 'METH-1.2', 'DISC-1.0'];

/**
 * Reads a document from the local-only `requirements` directory.
 *
 * That directory is deliberately outside version control, so a fresh clone has no copy. Returning
 * an empty string lets the identity checks skip only the assertions that need those documents
 * instead of failing the whole suite.
 */
$qkRequirementDocument = static function (string $root, string $name): string {
    $path = $root . '/requirements/' . $name;

    return is_file($path) ? (string) file_get_contents($path) : '';
};

/**
 * Current, operator-facing artefacts that must carry the live database name.
 *
 * The published guides live in `docs/`. The deployment plan and the release records live in
 * `requirements/`, which is deliberately outside version control and may therefore be absent
 * (for example on a fresh clone), so it is scanned only when it exists.
 */
$qkDatabaseDocuments = static function (string $root): array {
    $documents = [
        $root . '/README.md',
        $root . '/server/includes/live/config.php',
    ];

    foreach (['/docs', '/requirements'] as $directory) {
        if (is_dir($root . $directory)) {
            $documents = array_merge($documents, qk_test_files($root . $directory, ['md']));
        }
    }

    return array_merge($documents, qk_test_files($root . '/database', ['sql']));
};

return [
    'release identity: the deployment documents name the iliadis_quickrisk database and account' => function () use ($qkRequirementDocument): void {
        $root = qk_test_repository_root();

        // The deployment plan lives in requirements/, which is not versioned: a fresh clone has
        // no copy, so those assertions run only where the document exists.
        $firstTime = $qkRequirementDocument($root, 'DEPLOYMENT_FIRST_TIME.md');
        if ($firstTime !== '') {
            assertContains(
                'CREATE DATABASE iliadis_quickrisk',
                $firstTime,
                'The first-time deployment guide must create the iliadis_quickrisk database'
            );
            assertContains(
                "CREATE USER 'iliadis_quickrisk_user'@'localhost'",
                $firstTime,
                'The first-time deployment guide must create the iliadis_quickrisk_user account'
            );
            assertContains(
                'GRANT SELECT, INSERT, UPDATE, DELETE ON iliadis_quickrisk.*',
                $firstTime,
                'The grant must be limited to the iliadis_quickrisk schema'
            );
            assertContains(
                "TO 'iliadis_quickrisk_user'@'localhost'",
                $firstTime,
                'The grant must be issued to the iliadis_quickrisk_user account'
            );
            assertContains(
                "'name' => 'iliadis_quickrisk',",
                $firstTime,
                'The configuration template must name the iliadis_quickrisk database'
            );
            assertContains(
                "'user' => 'iliadis_quickrisk_user',",
                $firstTime,
                'The configuration template must name the iliadis_quickrisk_user account'
            );
            assertContains(
                'mysql -u iliadis_quickrisk_user -p iliadis_quickrisk',
                $firstTime,
                'The seed, check and backup commands must use the renamed database and account'
            );
        }

        $live = (string) file_get_contents($root . '/docs/DEPLOYMENT_QUICKRISK_LIVE.md');
        assertContains(
            "CREATE USER 'iliadis_quickrisk_user'@'localhost'",
            $live,
            'The Live deployment guide must create the same account'
        );
        assertContains(
            "'name' => 'iliadis_quickrisk',",
            $live,
            'The Live configuration template must name the iliadis_quickrisk database'
        );

        $readme = (string) file_get_contents($root . '/README.md');
        assertContains(
            'iliadis_quickrisk',
            $readme,
            'The README must name the iliadis_quickrisk database'
        );

        // The runtime configuration ships empty: no database name or credential is hard-coded.
        $config = (string) file_get_contents($root . '/server/includes/live/config.php');
        assertContains("'name' => ''", $config, 'The shipped configuration must not hard-code the database name');
        assertContains("'user' => ''", $config, 'The shipped configuration must not hard-code the account name');
    },

    'release identity: no retired database or account name survives in the deployment artefacts' => function () use ($qkDatabaseDocuments, $qkRetiredDatabasePatterns): void {
        $root = qk_test_repository_root();
        $checked = 0;

        foreach ($qkDatabaseDocuments($root) as $document) {
            $contents = (string) file_get_contents($document);
            foreach ($qkRetiredDatabasePatterns as $needle) {
                assertNotContains(
                    $needle,
                    $contents,
                    basename($document) . ' must not name a retired database or account'
                );
            }
            $checked++;
        }

        assertTrue($checked >= 10, 'The deployment artefacts must all be present');
    },

    'release identity: every version identifier is raised by one and agrees across artefacts' => function () use ($qkRequirementDocument): void {
        $model = qk_test_model();
        $manifest = $model->manifest();
        $root = qk_test_repository_root();

        assertSame('FAIR-QK-2.0', (string) $manifest['modelId'], 'The model identifier must be FAIR-QK-2.0');
        assertSame('2.0.0', (string) $manifest['modelVersion'], 'The model version must be 2.0.0');
        assertSame(
            (string) $manifest['modelVersion'],
            (string) $manifest['schemaVersion'],
            'The schema version must track the model version'
        );
        assertSame('CAL-2.0', (string) $manifest['calibrationVersion'], 'The calibration version must be CAL-2.0');
        assertSame('METH-2.0', (string) $manifest['methodologyVersion'], 'The methodology version must be METH-2.0');
        assertSame('DISC-2.0', (string) $manifest['disclaimerVersion'], 'The disclaimer version must be DISC-2.0');
        assertSame('1.3.5', (string) $manifest['applicationVersion'], 'The application version must be 1.3.5');
        assertSame('1.3.0', (string) $manifest['supersedesModelVersion'], 'The release must supersede 1.3.0');

        $recordPath = $model->modelPath() . '/versions/' . $manifest['modelVersion'] . '.json';
        assertTrue(is_file($recordPath), 'The version record must be named after the model version');
        $record = json_decode((string) file_get_contents($recordPath), true);
        assertTrue(is_array($record), 'The version record must be valid JSON');
        assertSame((string) $manifest['modelId'], (string) $record['modelId'], 'The record must repeat the model identifier');
        assertSame((string) $manifest['modelVersion'], (string) $record['modelVersion'], 'The record must repeat the model version');
        assertSame((string) $manifest['schemaVersion'], (string) $record['schemaVersion'], 'The record must repeat the schema version');
        assertSame((string) $manifest['calibrationVersion'], (string) $record['calibrationVersion'], 'The record must repeat the calibration version');
        assertSame('1.3.0', (string) $record['supersedes'], 'The record must declare that it supersedes 1.3.0');

        $parameters = json_decode((string) file_get_contents($model->modelPath() . '/parameters.json'), true);
        assertSame((string) $manifest['calibrationVersion'], (string) $parameters['calibrationVersion'], 'The parameters must carry the calibration version');

        $content = json_decode((string) file_get_contents($model->modelPath() . '/content.json'), true);
        assertSame((string) $manifest['disclaimerVersion'], (string) $content['disclaimerVersion'], 'The content must carry the disclaimer version');

        // The baseline fixture and the model documentation are named after the release.
        assertTrue(
            is_file($root . '/tests/expected/baseline-' . $manifest['modelVersion'] . '.json'),
            'The known-answer baseline must be named after the model version'
        );
        assertTrue(
            is_file($root . '/docs/MODEL_DOCUMENTATION_' . $manifest['modelId'] . '.md'),
            'The model documentation must be named after the model identifier'
        );

        $checklist = $qkRequirementDocument($root, 'RELEASE_CHECKLIST.md');
        if ($checklist !== '') {
            assertContains('FAIR-QK-2.0', $checklist, 'The release checklist must document the current release');
            assertContains((string) $manifest['disclaimerVersion'], $checklist, 'The release checklist must state the disclaimer version');
        }

        $package = json_decode((string) file_get_contents($root . '/frontend/package.json'), true);
        assertSame(
            (string) $manifest['applicationVersion'],
            (string) $package['version'],
            'The frontend package metadata must match the application version'
        );
    },

    'release identity: no retired version identifier survives in the current documentation' => function () use ($qkHistoricalDocuments, $qkRetiredVersionPatterns): void {
        $root = qk_test_repository_root();
        $documents = [];
        // requirements/ is not versioned, so it is scanned only where a local copy exists.
        foreach (['/docs', '/requirements'] as $directory) {
            if (!is_dir($root . $directory)) {
                continue;
            }
            foreach (qk_test_files($root . $directory, ['md']) as $document) {
                if (!in_array(basename($document), $qkHistoricalDocuments, true)) {
                    $documents[] = $document;
                }
            }
        }
        $documents[] = $root . '/README.md';

        foreach ($documents as $document) {
            $contents = (string) file_get_contents($document);
            foreach ($qkRetiredVersionPatterns as $needle) {
                assertNotContains(
                    $needle,
                    $contents,
                    basename($document) . ' must not quote a retired version identifier'
                );
            }
        }
    },
];
