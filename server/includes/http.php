<?php

declare(strict_types=1);

/**
 * Raised for a rejected request. The code is a fixed identifier that is safe to
 * return to the browser and safe to log.
 */
final class QkRequestException extends RuntimeException
{
    private string $errorCode;

    private int $httpStatus;

    public function __construct(string $errorCode, string $message, int $httpStatus = 400)
    {
        parent::__construct($message);
        $this->errorCode = $errorCode;
        $this->httpStatus = $httpStatus;
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }

    public function httpStatus(): int
    {
        return $this->httpStatus;
    }
}

/**
 * FAIR QuickRisk — HTTP helpers for the calculation endpoint.
 *
 * Every response is JSON, cacheable-never, and free of internal detail. Request
 * bodies are read once, validated, processed in memory and then released.
 */
final class QkHttp
{
    public const CACHE_HEADERS = [
        'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma' => 'no-cache',
    ];

    /**
     * @param array<string,mixed> $config
     */
    public static function securityHeaders(array $config): void
    {
        foreach ((array) ($config['headers'] ?? []) as $name => $value) {
            self::setHeader((string) $name, (string) $value);
        }
    }

    /**
     * Sets a response header, safely ignoring the CLI SAPI and already-sent headers so
     * that the same code path can be exercised by the automated test suite.
     */
    public static function setHeader(string $name, string $value): void
    {
        if (PHP_SAPI === 'cli' || headers_sent()) {
            return;
        }

        header($name . ': ' . $value);
    }

    /**
     * @param array<string,mixed> $config
     */
    public static function sendJson(array $payload, int $status, array $config): void
    {
        self::securityHeaders($config);
        self::setHeader('Content-Type', 'application/json; charset=utf-8');
        if (PHP_SAPI !== 'cli' && !headers_sent()) {
            http_response_code($status);
        }
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /**
     * @param array<string,mixed> $config
     */
    public static function sendError(string $errorCode, string $message, int $status, array $config): void
    {
        self::sendJson([
            'status' => 'error',
            'error' => [
                'code' => $errorCode,
                'message' => $message,
            ],
        ], $status, $config);
    }

    /**
     * Reads and decodes the JSON request body with strict size and type limits.
     *
     * @param array<string,mixed> $config
     * @param array<string,mixed>|null $server Request server variables (defaults to $_SERVER)
     * @param string|null $rawBody Pre-read body (defaults to php://input); supplied by tests
     * @return array<string,mixed>
     */
    public static function readJsonBody(array $config, ?array $server = null, ?string $rawBody = null): array
    {
        $server ??= $_SERVER;
        $application = (array) ($config['application'] ?? []);
        $maxBytes = (int) ($application['maxRequestBytes'] ?? 8192);
        $allowedContentType = (string) ($application['allowedContentType'] ?? 'application/json');

        $contentType = (string) ($server['CONTENT_TYPE'] ?? '');
        if (stripos($contentType, $allowedContentType) !== 0) {
            throw new QkRequestException('CONTENT_TYPE_REJECTED', 'Unsupported request content type.', 415);
        }

        $declaredLength = (int) ($server['CONTENT_LENGTH'] ?? 0);
        if ($declaredLength > $maxBytes) {
            throw new QkRequestException('PAYLOAD_TOO_LARGE', 'The request payload is too large.', 413);
        }

        if ($rawBody === null) {
            $raw = file_get_contents('php://input');
        } else {
            $raw = $rawBody;
        }

        if ($raw === false || $raw === '') {
            throw new QkRequestException('PAYLOAD_UNREADABLE', 'The request body could not be read.', 400);
        }
        if (strlen($raw) > $maxBytes) {
            throw new QkRequestException('PAYLOAD_TOO_LARGE', 'The request payload is too large.', 413);
        }

        $decoded = json_decode($raw, true);
        unset($raw);

        if (!is_array($decoded) || $decoded === []) {
            throw new QkRequestException('PAYLOAD_UNREADABLE', 'The request body was not a valid JSON object.', 400);
        }

        return $decoded;
    }

    /**
     * @param array<string,mixed>|null $server
     */
    public static function requirePost(?array $server = null): void
    {
        $server ??= $_SERVER;
        $method = (string) ($server['REQUEST_METHOD'] ?? '');
        if ($method !== 'POST') {
            throw new QkRequestException('METHOD_NOT_ALLOWED', 'This endpoint accepts POST requests only.', 405);
        }
    }

    /**
     * Client identifier used only for rate limiting. It is salted and hashed
     * before use and is never stored in clear text or linked to an assessment.
     *
     * @param array<string,mixed> $config
     * @param array<string,mixed>|null $server
     */
    public static function clientIp(array $config, ?array $server = null): string
    {
        $server ??= $_SERVER;
        $application = (array) ($config['application'] ?? []);
        if (($application['trustProxyHeaders'] ?? false) === true) {
            $forwarded = (string) ($server['HTTP_X_FORWARDED_FOR'] ?? '');
            if ($forwarded !== '') {
                $first = trim(explode(',', $forwarded)[0]);
                if ($first !== '') {
                    return $first;
                }
            }
        }

        $remote = (string) ($server['REMOTE_ADDR'] ?? 'unknown');

        return $remote === '' ? 'unknown' : $remote;
    }
}
