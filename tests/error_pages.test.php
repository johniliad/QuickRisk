<?php

declare(strict_types=1);

/**
 * The branded Apache error pages.
 *
 * They are served by `ErrorDocument` from the web-root policy, outside the React
 * application, so nothing about them is checked by the build. These tests pin the
 * part that is easy to lose: that they look like the site.
 *
 * The design tokens are compared with frontend/src/styles/index.css rather than
 * duplicated here, so a redesign that changes a token fails this test instead of
 * silently leaving four pages in an older palette.
 */

/** @var array<int,array{title:string,heading:string}> $qkErrorPages */
$qkErrorPages = [
    403 => ['title' => 'Access denied', 'heading' => 'Access to this page is not permitted'],
    404 => ['title' => 'Page not found', 'heading' => 'This page does not exist'],
    500 => ['title' => 'Something went wrong', 'heading' => 'Something went wrong at our end'],
    503 => ['title' => 'Temporarily unavailable', 'heading' => 'The service is temporarily unavailable'],
];

/** Token names that must agree between index.css (--color-x) and the pages (--x). */
$qkTokens = ['ink', 'heading', 'muted', 'paper', 'canvas', 'border', 'accent', 'accent-strong', 'focus'];

return [
    'error pages: every declared document exists' => function () use ($qkErrorPages): void {
        $root = qk_test_repository_root();

        foreach (array_keys($qkErrorPages) as $code) {
            $file = $root . '/frontend/public/errors/' . $code . '.html';
            assertTrue(is_file($file), 'The ' . $code . ' error page must exist at /errors/' . $code . '.html');
        }
    },

    'error pages: each page carries the site masthead, copy and footer' => function () use ($qkErrorPages): void {
        $root = qk_test_repository_root();

        foreach ($qkErrorPages as $code => $expected) {
            $html = (string) file_get_contents($root . '/frontend/public/errors/' . $code . '.html');
            $label = 'error ' . $code . ': ';

            assertContains('<!doctype html>', $html, $label . 'doctype');
            assertContains('<html lang="en">', $html, $label . 'language');
            assertContains('<title>' . $expected['title'] . ' | FAIR QuickRisk</title>', $html, $label . 'title');
            assertSame(1, substr_count($html, '<h1>'), $label . 'exactly one h1');
            assertContains('<h1>' . $expected['heading'] . '</h1>', $html, $label . 'heading');
            assertContains('Error ' . $code . ' · ', $html, $label . 'status badge');
            assertContains('name="robots" content="noindex, nofollow"', $html, $label . 'noindex');
            assertContains('name="theme-color" content="#075e65"', $html, $label . 'theme colour');

            // The masthead, word for word, as on the holding page and in the app.
            assertContains('class="brand-mark" aria-hidden="true">QR<', $html, $label . 'brand mark');
            assertContains('FAIR <span class="brand-accent">QuickRisk</span>', $html, $label . 'brand name');
            assertContains('Rapid quantitative cyber-risk estimation', $html, $label . 'tagline');
            assertContains('href="https://www.iliadis.net/">iliadis.net</a>', $html, $label . 'masthead link');

            // The footer disclaimer and the links that make the licence accessible.
            assertContains('not endorsed by', $html, $label . 'non-endorsement statement');
            assertContains('href="/"', $html, $label . 'home link');
            assertContains('href="/methodology.html"', $html, $label . 'methodology link');
            assertContains('href="/LICENSE.txt"', $html, $label . 'licence link');
            assertContains('href="/THIRD-PARTY-NOTICES.txt"', $html, $label . 'third-party notices link');
        }
    },

    'error pages: the design tokens match the application' => function () use ($qkErrorPages, $qkTokens): void {
        $root = qk_test_repository_root();
        $stylesheet = (string) file_get_contents($root . '/frontend/src/styles/index.css');

        foreach ($qkErrorPages as $code => $expected) {
            $html = (string) file_get_contents($root . '/frontend/public/errors/' . $code . '.html');

            foreach ($qkTokens as $token) {
                $pattern = '/--color-' . preg_quote($token, '/') . ':\s*(#[0-9a-fA-F]{6})/';
                assertSame(1, preg_match($pattern, $stylesheet, $application), 'index.css must define --color-' . $token);

                $pagePattern = '/--' . preg_quote($token, '/') . ':\s*(#[0-9a-fA-F]{6})/';
                assertSame(1, preg_match($pagePattern, $html, $page), 'error ' . $code . ' must define --' . $token);
                assertSame(
                    $application[1],
                    $page[1],
                    'error ' . $code . ': --' . $token . ' must match --color-' . $token . ' in index.css'
                );
            }

            assertContains('width: min(70rem, calc(100% - 3rem))', $html, 'error ' . $code . ': the 70rem shell');
            assertContains('border-radius: 0.25rem', $html, 'error ' . $code . ': the 0.25rem control radius');
        }
    },

    'error pages: self-contained, script-free and CSP-compatible' => function () use ($qkErrorPages): void {
        $root = qk_test_repository_root();

        foreach (array_keys($qkErrorPages) as $code) {
            $html = (string) file_get_contents($root . '/frontend/public/errors/' . $code . '.html');
            $label = 'error ' . $code . ': ';

            assertNotContains('<script', $html, $label . 'no scripts');
            assertNotContains('src=', $html, $label . 'no external resources');
            assertNotContains('http://', $html, $label . 'no insecure URLs');
            assertNotContains('http-equiv', $html, $label . 'no meta policy: a second CSP would be enforced');
            assertNotContains('default-src', $html, $label . 'no CSP directives');
            assertNotContains('onclick=', $html, $label . 'no inline handlers');
            assertNotContains('onerror=', $html, $label . 'no inline handlers');
            assertSame(1, substr_count($html, '<style>'), $label . 'one inline style block');
            assertSame(1, substr_count($html, '</style>'), $label . 'the style block is closed');
            assertSame(
                0,
                preg_match('/\b\d{1,3}(?:\.\d{1,3}){3}\b/', $html),
                $label . 'no IPv4 address may appear in a published page'
            );

            // No diagnostics: an error page must never explain the server to an attacker.
            assertNotContains('/home/', $html, $label . 'no filesystem paths');
            assertNotContains('Stack trace', $html, $label . 'no stack traces');
            assertNotContains('X-Origin-Secret', $html, $label . 'the origin gate is never disclosed');
        }
    },
];
