<?php

declare(strict_types=1);

/**
 * QuickRisk Live — JSON responses and request errors.
 *
 * Every response uses the same envelope:
 *   success: {"ok":true,"data":...}
 *   failure: {"ok":false,"error":{"code":"...","message":"..."}}
 *
 * Errors never disclose SQL, file paths, stack traces or PHP warnings.
 */

final class QkLiveHttpError extends RuntimeException
{
    public int $status;
    public string $errorCode;

    public function __construct(int $status, string $errorCode, string $message)
    {
        parent::__construct($message);
        $this->status = $status;
        $this->errorCode = $errorCode;
    }
}

final class QkLiveResponse
{
    /**
     * @param array<string,mixed> $data
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function ok(array $data, int $status = 200): array
    {
        return ['status' => $status, 'payload' => ['ok' => true, 'data' => $data]];
    }

    /**
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function error(int $status, string $code, string $message): array
    {
        return [
            'status' => $status,
            'payload' => ['ok' => false, 'error' => ['code' => $code, 'message' => $message]],
        ];
    }

    /**
     * @param array{status:int,payload:array<string,mixed>} $result
     * @param array<string,mixed> $appConfig
     */
    public static function send(array $result, array $appConfig): void
    {
        QkHttp::sendJson($result['payload'], $result['status'], $appConfig);
    }

    /**
     * Converts any throwable into a safe response.
     *
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function fromThrowable(Throwable $error): array
    {
        if ($error instanceof QkLiveHttpError) {
            return self::error($error->status, $error->errorCode, $error->getMessage());
        }
        if ($error instanceof QkLiveDbUnavailable) {
            return self::error(503, 'STORAGE_UNAVAILABLE', 'QuickRisk Live storage is temporarily unavailable.');
        }

        return self::error(500, 'INTERNAL_ERROR', 'The request could not be completed.');
    }
}
