<?php

declare(strict_types=1);

/**
 * The temporary holding page.
 *
 * `static-pages/UnderConstruction.html` is deployed by hand while the site is being
 * changed. These tests keep it where it belongs and keep it self-contained:
 *
 *  - it must live outside `frontend/`, so the production build can never ship it;
 *  - it must not be copied into `frontend/public/` or `frontend/dist/`;
 *  - it must carry the beta-testing message and request no external resources, so it
 *    renders on a bare host with no network access beyond the page itself;
 *  - it must not be indexable.
 */

return [
    'holding page: the notice lives outside the frontend build' => function (): void {
        $root = qk_test_repository_root();

        assertTrue(
            is_file($root . '/static-pages/UnderConstruction.html'),
            'The holding page must exist in static-pages/'
        );

        foreach (['/frontend/public/UnderConstruction.html', '/frontend/dist/UnderConstruction.html', '/frontend/UnderConstruction.html'] as $copied) {
            assertFalse(
                is_file($root . $copied),
                'The holding page must not be copied into the build: ' . $copied
            );
        }
    },

    'holding page: the notice explains the beta programme and the coming release' => function (): void {
        $root = qk_test_repository_root();
        $page = (string) file_get_contents($root . '/static-pages/UnderConstruction.html');

        assertContains('beta testing programme', $page, 'The notice must explain the beta programme');
        assertContains('made available to everyone', $page, 'The notice must say the app will be opened to all');
        assertContains('being built', $page, 'The notice must say that features are being developed');

        // It must look like the rest of the site: the shared design tokens are inline.
        assertContains('--accent-strong: #075e65', $page, 'The notice must use the site accent colour');
        assertContains('--canvas: #f3f7f8', $page, 'The notice must use the site canvas colour');
        assertContains('FAIR ', $page, 'The notice must carry the product wordmark');
    },

    'holding page: the notice is self-contained and not indexable' => function (): void {
        $root = qk_test_repository_root();
        $page = (string) file_get_contents($root . '/static-pages/UnderConstruction.html');

        assertContains('noindex', $page, 'The temporary notice must not be indexed');
        assertNotContains('<script', strtolower($page), 'The notice must not load any script');
        assertNotContains('<link', strtolower($page), 'The notice must not load any stylesheet or font');
        assertNotContains('url(http', strtolower($page), 'The notice must not embed a remote asset');
        assertNotContains('@import', $page, 'The notice must not import a remote stylesheet');
        assertSame(1, substr_count($page, '<style'), 'The styling must be one inline block');
        assertSame(1, substr_count($page, '</style>'), 'The styling block must be closed');
    },
];
