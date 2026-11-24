<?php

declare(strict_types=1);

require_once __DIR__ . '/model_loader.php';

final class QkInferenceException extends RuntimeException
{
}

/** Read-only access to a validated, versioned Bayesian posterior package. */
final class QkInferenceRepository
{
    private const REQUIRED_CLASSES = ['micro', 'small', 'medium', 'large', 'large_enterprise', 'unknown'];

    /** @var array<string,mixed> */
    private array $manifest;

    /** @var array<string,mixed> */
    private array $reference;

    /** @var array<string,mixed> */
    private array $report;

    private bool $active;

    private string $path;

    /** @var array<string,array<int,array<string,mixed>>> */
    private array $classDrawCache = [];

    /** @var array<string,mixed>|null */
    private ?array $treatmentPackage = null;

    /**
     * @param array<string,mixed> $manifest
     * @param array<string,mixed> $reference
     * @param array<string,mixed> $report
     */
    private function __construct(string $path, array $manifest, array $reference, array $report, bool $active)
    {
        $this->path = $path;
        $this->manifest = $manifest;
        $this->reference = $reference;
        $this->report = $report;
        $this->active = $active;
    }

    /** @param array<string,mixed> $config */
    public static function load(array $config, QkModel $model): self
    {
        $default = $model->modelPath() . DIRECTORY_SEPARATOR . 'inference';
        $configured = $config['inferencePath'] ?? null;
        $path = is_string($configured) && $configured !== '' ? $configured : $default;
        $enabled = ($config['inferenceEnabled'] ?? true) === true;
        if (!$enabled || !is_dir($path)) {
            return new self($path, [], [], [], false);
        }

        try {
            $manifest = self::readObject($path . DIRECTORY_SEPARATOR . 'manifest.json');
            $reference = self::readObject($path . DIRECTORY_SEPARATOR . 'reference-classes.json');
            $reportFile = (string) ($manifest['validationReport'] ?? 'calibration-report.json');
            $report = self::readObject($path . DIRECTORY_SEPARATOR . $reportFile);
            self::validatePackage($manifest, $reference, $report, $model, $path);
            $active = ($manifest['active'] ?? false) === true;
            if (($manifest['synthetic'] ?? true) !== false) {
                $active = false;
            }

            return new self($path, $manifest, $reference, $report, $active);
        } catch (Throwable $exception) {
            return new self($path, [], [], ['status' => 'invalid'], false);
        }
    }

    public function isActive(): bool
    {
        return $this->active;
    }

    /** @return array<string,mixed> */
    public function metadata(): array
    {
        return [
            'mode' => $this->active ? 'posterior-reference-class' : 'legacy-heuristic',
            'active' => $this->active,
            'packageVersion' => (string) ($this->manifest['packageVersion'] ?? ''),
            'evidencePackageVersion' => (string) ($this->manifest['evidencePackageVersion'] ?? ''),
            'status' => (string) ($this->manifest['status'] ?? ($this->report['status'] ?? 'inactive')),
            'drawCount' => (int) ($this->manifest['drawCount'] ?? 0),
            'referencePackageHash' => (string) ($this->manifest['hashes']['reference-classes.json'] ?? ''),
            'validationScope' => (array) ($this->report['validationScope'] ?? []),
            'knownValidationGap' => (string) ($this->report['knownValidationGap'] ?? ''),
            'evidenceSources' => (array) ($this->report['evidenceSources'] ?? []),
        ];
    }

    public function referenceClass(string $organisationSizeCode): string
    {
        foreach (self::REQUIRED_CLASSES as $class) {
            $codes = (array) ($this->reference['classes'][$class]['qp1Codes'] ?? []);
            if (in_array($organisationSizeCode, $codes, true)) {
                return $class;
            }
        }

        return 'unknown';
    }

    /** @return array<string,mixed> */
    public function referenceClassModel(string $class): array
    {
        $class = $this->referenceClass($class);
        if (!isset($this->reference['classes'][$class])) {
            throw new QkInferenceException('Unknown reference class.');
        }

        return (array) $this->reference['classes'][$class];
    }

    public function drawCount(string $class): int
    {
        $class = $this->referenceClass($class);
        $file = $this->classFile($class);
        $data = self::readObject($this->path . DIRECTORY_SEPARATOR . $file);

        return (int) ($data['drawCount'] ?? 0);
    }

    /** @return array<string,mixed> */
    public function draw(string $class, int $index): array
    {
        $class = $this->referenceClass($class);
        if (!isset($this->classDrawCache[$class])) {
            $file = $this->classFile($class);
            $data = self::readObject($this->path . DIRECTORY_SEPARATOR . $file);
            if ((string) ($data['class'] ?? '') !== $class || !is_array($data['draws'] ?? null)) {
                throw new QkInferenceException('Posterior class package is malformed.');
            }
            $this->classDrawCache[$class] = array_values($data['draws']);
        }
        $draws = $this->classDrawCache[$class];
        if ($draws === []) {
            throw new QkInferenceException('Posterior class package is empty.');
        }
        $count = count($draws);

        return (array) $draws[(($index % $count) + $count) % $count];
    }

    /** @return array<string,array<string,mixed>|null>|null */
    public function treatmentEffect(string $treatmentId, string $version, int $index): ?array
    {
        if (!$this->active) {
            return null;
        }
        if ($this->treatmentPackage === null) {
            $file = (string) ($this->manifest['files']['treatmentPosteriors'] ?? 'treatment-posteriors.json');
            $path = $this->path . DIRECTORY_SEPARATOR . $file;
            $expected = (string) ($this->manifest['hashes'][$file] ?? '');
            if ($expected === '' || !is_file($path) || !hash_equals($expected, hash_file('sha256', $path))) {
                throw new QkInferenceException('Treatment posterior file failed integrity validation.');
            }
            $this->treatmentPackage = self::readObject($path);
        }
        $treatment = $this->treatmentPackage['treatments'][$treatmentId] ?? null;
        if (!is_array($treatment) || (string) ($treatment['version'] ?? '') !== $version) {
            return null;
        }

        $result = [];
        foreach (['frequency', 'magnitude'] as $lever) {
            $entry = $treatment[$lever] ?? null;
            if (!is_array($entry) || !is_array($entry['draws'] ?? null) || $entry['draws'] === []) {
                $result[$lever] = null;
                continue;
            }
            $draws = array_values($entry['draws']);
            $count = count($draws);
            $result[$lever] = [
                'value' => (float) $draws[(($index % $count) + $count) % $count],
                'mean' => (float) ($entry['mean'] ?? 0.0),
                'q025' => (float) ($entry['q025'] ?? 0.0),
                'q975' => (float) ($entry['q975'] ?? 0.0),
                'status' => (string) ($treatment['status'] ?? 'assumption-only'),
            ];
        }

        return $result;
    }

    /** @return array<string,mixed> */
    public function questionnaireModel(): array
    {
        return (array) ($this->reference['questionnaireModel'] ?? []);
    }

    /** @return array<int,string> */
    public function scenarioOrder(): array
    {
        return array_values((array) ($this->reference['scenarioOrder'] ?? []));
    }

    private function classFile(string $class): string
    {
        $safe = preg_replace('/[^a-z_]/', '', strtolower($class));
        if (!in_array($safe, self::REQUIRED_CLASSES, true)) {
            throw new QkInferenceException('Unknown posterior class file.');
        }
        $files = (array) ($this->manifest['files']['posteriorDraws'] ?? []);
        $file = (string) ($files[$safe] ?? '');
        if ($file === '' || basename($file) !== $file) {
            throw new QkInferenceException('Posterior draw file is missing.');
        }
        $path = $this->path . DIRECTORY_SEPARATOR . $file;
        $expected = (string) ($this->manifest['hashes'][$file] ?? '');
        if ($expected === '' || !is_file($path) || !hash_equals($expected, hash_file('sha256', $path))) {
            throw new QkInferenceException('Posterior draw file failed integrity validation.');
        }

        return $file;
    }

    /** @return array<string,mixed> */
    private static function readObject(string $path): array
    {
        if (!is_file($path) || !is_readable($path)) {
            throw new QkInferenceException('Inference file is unreadable.');
        }
        $raw = file_get_contents($path);
        if ($raw === false || $raw === '') {
            throw new QkInferenceException('Inference file is empty.');
        }
        try {
            $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new QkInferenceException('Inference file is invalid JSON.');
        }
        if (!is_array($decoded)) {
            throw new QkInferenceException('Inference file must contain an object.');
        }

        return $decoded;
    }

    /**
     * @param array<string,mixed> $manifest
     * @param array<string,mixed> $reference
     * @param array<string,mixed> $report
     */
    private static function validatePackage(
        array $manifest,
        array $reference,
        array $report,
        QkModel $model,
        string $path
    ): void {
        foreach (['modelId', 'modelVersion', 'calibrationVersion', 'methodologyVersion'] as $key) {
            if ((string) ($manifest[$key] ?? '') === '') {
                throw new QkInferenceException('Inference manifest is incomplete.');
            }
        }
        if ((string) $manifest['modelId'] !== $model->modelId()) {
            throw new QkInferenceException('Inference package model mismatch.');
        }
        if ((string) $manifest['modelVersion'] !== (string) $model->manifest()['modelVersion']) {
            throw new QkInferenceException('Inference package version mismatch.');
        }
        if ((string) $manifest['calibrationVersion'] !== (string) $model->manifest()['calibrationVersion']) {
            throw new QkInferenceException('Inference calibration mismatch.');
        }
        if (!is_array($reference['classes'] ?? null)) {
            throw new QkInferenceException('Reference classes are missing.');
        }
        foreach (self::REQUIRED_CLASSES as $class) {
            if (!isset($reference['classes'][$class]) || !is_array($reference['classes'][$class])) {
                throw new QkInferenceException('Reference class is missing: ' . $class);
            }
        }
        if ((int) ($manifest['drawCount'] ?? 0) < 100) {
            throw new QkInferenceException('Posterior draw count is too small.');
        }
        if ((string) ($manifest['status'] ?? '') !== (string) ($report['status'] ?? '')) {
            throw new QkInferenceException('Inference validation status mismatch.');
        }
        foreach (['reference-classes.json', 'calibration-report.json'] as $file) {
            $expected = (string) ($manifest['hashes'][$file] ?? '');
            $actual = hash_file('sha256', $path . DIRECTORY_SEPARATOR . $file);
            if ($expected === '' || $actual === false || !hash_equals($expected, $actual)) {
                throw new QkInferenceException('Inference file failed integrity validation: ' . $file);
            }
        }
        if (($manifest['active'] ?? false) === true
            && (string) ($report['status'] ?? '') !== 'reference-posterior-validated') {
            throw new QkInferenceException('An unvalidated package cannot be active.');
        }
    }
}
