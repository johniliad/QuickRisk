<?php

declare(strict_types=1);

/**
 * Licence compliance.
 *
 * FAIR QuickRisk is Apache-2.0, and its compiled bundle contains third-party code
 * whose licences require their notices to travel with it. These tests pin the parts
 * that a release must not lose:
 *
 *  - the licence text and the package metadata agree;
 *  - a NOTICE file exists and points at the attribution file;
 *  - the copies served to browsers are identical to (or generated from) the
 *    repository sources, so the deployed site is compliant on its own;
 *  - the third-party notices cover every direct production dependency and contain
 *    no copyleft licence.
 *
 * Freshness is enforced separately by `npm run verify:licenses`, which regenerates
 * the notices from the installed dependency tree and fails when they are stale.
 */

return [
    'licensing: the repository and the package metadata declare Apache-2.0' => function (): void {
        $root = qk_test_repository_root();
        $licence = (string) file_get_contents($root . '/LICENSE');

        assertContains('Apache License', $licence, 'LICENSE must be the Apache License');
        assertContains('Version 2.0, January 2004', $licence, 'LICENSE must be version 2.0');
        assertContains('END OF TERMS AND CONDITIONS', $licence, 'LICENSE must be the complete text');

        $package = json_decode((string) file_get_contents($root . '/frontend/package.json'), true);
        assertTrue(is_array($package), 'frontend/package.json must be valid JSON');
        assertSame('Apache-2.0', $package['license'] ?? null, 'The package metadata must declare the licence');
        assertSame(
            'node ../tools/generate-third-party-notices.mjs --check',
            $package['scripts']['verify:licenses'] ?? null,
            'The build must verify that the notices are current'
        );
    },

    'licensing: NOTICE states the copyright and points at the attribution file' => function (): void {
        $root = qk_test_repository_root();
        $notice = (string) file_get_contents($root . '/NOTICE');

        assertContains('FAIR QuickRisk', $notice, 'NOTICE must name the work');
        assertContains('Copyright 2026', $notice, 'NOTICE must state the copyright holder and year');
        assertContains('Apache License, Version 2.0', $notice, 'NOTICE must reference the licence');
        assertContains('THIRD-PARTY-NOTICES.txt', $notice, 'NOTICE must point at the attribution file');
        assertContains('not endorsed by', $notice, 'NOTICE must repeat the non-endorsement statement');
    },

    'licensing: the copies served to browsers match the repository' => function (): void {
        $root = qk_test_repository_root();
        $normalise = static fn (string $text): string => trim(str_replace(["\r\n", "\r"], "\n", $text));

        $licence = (string) file_get_contents($root . '/LICENSE');
        $servedLicence = (string) file_get_contents($root . '/frontend/public/LICENSE.txt');
        assertSame(
            $normalise($licence),
            $normalise($servedLicence),
            'The licence served at /LICENSE.txt must be an exact copy of LICENSE'
        );

        assertTrue(
            is_file($root . '/frontend/public/THIRD-PARTY-NOTICES.txt'),
            'The third-party notices must be served at /THIRD-PARTY-NOTICES.txt'
        );
    },

    'licensing: the notices cover every direct dependency and contain no copyleft' => function (): void {
        $root = qk_test_repository_root();
        $notices = (string) file_get_contents($root . '/frontend/public/THIRD-PARTY-NOTICES.txt');
        $package = json_decode((string) file_get_contents($root . '/frontend/package.json'), true);

        assertContains('THIRD-PARTY NOTICES', $notices, 'The notices must have their heading');
        assertContains('END OF THIRD-PARTY NOTICES', $notices, 'The notices must be complete');
        assertContains('Lodash', $notices, 'The derived-work attribution shipped by es-toolkit must be reproduced');
        assertContains('Apache-2.0', $notices, 'The Apache-2.0 dependency must be attributed');

        foreach (array_keys((array) ($package['dependencies'] ?? [])) as $dependency) {
            assertContains(
                (string) $dependency,
                $notices,
                'Every direct production dependency must appear in the notices: ' . $dependency
            );
        }

        foreach (['GNU General Public License', 'GNU Lesser General Public License', 'GNU Affero General Public License'] as $copyleft) {
            assertNotContains($copyleft, $notices, 'No copyleft licence may be bundled: ' . $copyleft);
        }
    },
];
