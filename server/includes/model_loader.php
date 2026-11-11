<?php

declare(strict_types=1);

/**
 * Raised when the authoritative model files are missing, unreadable or invalid.
 */
final class QkModelException extends RuntimeException
{
}

/**
 * FAIR QuickRisk — authoritative model loader (read-only).
 *
 * Loads the version-controlled model from an absolute filesystem path outside the
 * public web root. The loader never writes to the model directory and never
 * caches assessment data. Validation is strict: a malformed or incompatible model
 * fails the request rather than producing a silently wrong calculation.
 */
final class QkModel
{
    /** @var array<string,mixed> */
    private array $manifest;

    /** @var array<string,mixed> */
    private array $content;

    /** @var array<string,mixed> */
    private array $questions;

    /** @var array<string,mixed> */
    private array $answerOptions;

    /** @var array<string,mixed> */
    private array $parameters;

    /** @var array<string,array<string,mixed>> */
    private array $scenariosByCode = [];

    /** @var array<int,string> */
    private array $scenarioOrder = [];

    private string $modelPath;

    private function __construct(string $modelPath)
    {
        $this->modelPath = $modelPath;
    }

    /**
     * Loads and validates the model.
     *
     * @param array<string,mixed> $config
     */
    public static function load(array $config): self
    {
        $modelPath = (string) ($config['modelPath'] ?? '');
        if ($modelPath === '' || !is_dir($modelPath)) {
            throw new QkModelException('MODEL_PATH_UNAVAILABLE');
        }

        $instance = new self($modelPath);
        $manifest = $instance->readJson('manifest.json');
        $instance->manifest = $manifest;

        $files = is_array($manifest['files'] ?? null) ? $manifest['files'] : [];
        $instance->content = $instance->readJson(self::fileName($files, 'content', 'content.json'));
        $instance->questions = $instance->readJson(self::fileName($files, 'questions', 'questions.json'));
        $instance->answerOptions = $instance->readJson(self::fileName($files, 'answerOptions', 'answer-options.json'));
        $scenarios = $instance->readJson(self::fileName($files, 'scenarios', 'scenarios.json'));
        $instance->parameters = $instance->readJson(self::fileName($files, 'parameters', 'parameters.json'));

        $instance->indexScenarios($scenarios);
        $instance->validate();

        return $instance;
    }

    public function modelPath(): string
    {
        return $this->modelPath;
    }

    /**
     * @return array<string,mixed>
     */
    public function manifest(): array
    {
        return $this->manifest;
    }

    /**
     * @return array<string,mixed>
     */
    public function content(): array
    {
        return $this->content;
    }

    /**
     * @return array<string,mixed>
     */
    public function parameters(): array
    {
        return $this->parameters;
    }

    /**
     * @return array<int,array<string,mixed>>
     */
    public function profileQuestions(): array
    {
        /** @var array<int,array<string,mixed>> $questions */
        $questions = $this->questions['profileQuestions'] ?? [];

        return $questions;
    }

    /**
     * @return array<int,array<string,mixed>>
     */
    public function scenarioQuestionTemplates(): array
    {
        /** @var array<int,array<string,mixed>> $templates */
        $templates = $this->questions['scenarioQuestionTemplates'] ?? [];

        return $templates;
    }

    /**
     * @return array<int,string>
     */
    public function scenarioOrder(): array
    {
        return $this->scenarioOrder;
    }

    /**
     * @return array<string,mixed>
     */
    public function scenario(string $code): array
    {
        if (!isset($this->scenariosByCode[$code])) {
            throw new QkModelException('UNKNOWN_SCENARIO');
        }

        return $this->scenariosByCode[$code];
    }

    /**
     * @return array<string,array<string,mixed>>
     */
    public function scenarios(): array
    {
        return $this->scenariosByCode;
    }

    /**
     * @return array<int,array<string,mixed>>
     */
    public function optionSet(string $name): array
    {
        $sets = $this->answerOptions['optionSets'] ?? null;
        if (!is_array($sets) || !isset($sets[$name]) || !is_array($sets[$name]['options'] ?? null)) {
            throw new QkModelException('UNKNOWN_OPTION_SET');
        }

        /** @var array<int,array<string,mixed>> $options */
        $options = $sets[$name]['options'];

        return $options;
    }

    public function hasOption(string $setName, string $optionCode): bool
    {
        foreach ($this->optionSet($setName) as $option) {
            if (($option['code'] ?? null) === $optionCode) {
                return true;
            }
        }

        return false;
    }

    public function optionLabel(string $setName, string $optionCode): string
    {
        foreach ($this->optionSet($setName) as $option) {
            if (($option['code'] ?? null) === $optionCode) {
                return (string) ($option['label'] ?? $optionCode);
            }
        }

        return $optionCode;
    }

    public function isUnknownOption(string $setName, string $optionCode): bool
    {
        if ($optionCode === $this->unknownCode()) {
            return true;
        }

        foreach ($this->optionSet($setName) as $option) {
            if (($option['code'] ?? null) === $optionCode) {
                return ($option['unknown'] ?? false) === true;
            }
        }

        return false;
    }

    public function unknownCode(): string
    {
        return (string) ($this->answerOptions['unknownCode'] ?? 'UNKNOWN');
    }

    /**
     * @return array<int,float>
     */
    public function lossThresholds(): array
    {
        /** @var array<int,mixed> $thresholds */
        $thresholds = $this->manifest['lossThresholds'] ?? [];

        return array_map(static fn ($value): float => (float) $value, $thresholds);
    }

    public function defaultIterations(): int
    {
        return (int) ($this->manifest['defaultIterations'] ?? 5000);
    }

    public function maximumIterations(): int
    {
        return (int) ($this->manifest['maxIterations'] ?? 50000);
    }

    public function modelId(): string
    {
        return (string) ($this->manifest['modelId'] ?? '');
    }

    /**
     * Version metadata returned with every calculation.
     *
     * @return array<string,mixed>
     */
    public function versionMeta(): array
    {
        return [
            'applicationVersion' => (string) ($this->manifest['applicationVersion'] ?? ''),
            'modelId' => (string) ($this->manifest['modelId'] ?? ''),
            'modelVersion' => (string) ($this->manifest['modelVersion'] ?? ''),
            'schemaVersion' => (string) ($this->manifest['schemaVersion'] ?? ''),
            'calibrationVersion' => (string) ($this->manifest['calibrationVersion'] ?? ''),
            'methodologyVersion' => (string) ($this->manifest['methodologyVersion'] ?? ''),
            'disclaimerVersion' => (string) ($this->manifest['disclaimerVersion'] ?? ''),
            'privacyNoticeVersion' => (string) ($this->manifest['privacyNoticeVersion'] ?? ''),
            'releaseStatus' => (string) ($this->manifest['releaseStatus'] ?? ''),
            'retentionMode' => (string) ($this->manifest['retentionMode'] ?? 'zero-retention'),
            'currency' => (string) ($this->manifest['currency'] ?? 'EUR'),
            'currencySymbol' => (string) ($this->manifest['currencySymbol'] ?? ''),
        ];
    }

    /**
     * @return array<string,mixed>
     */
    private function readJson(string $relativeFile): array
    {
        $path = $this->modelPath . DIRECTORY_SEPARATOR . $relativeFile;
        if (!is_file($path) || !is_readable($path)) {
            throw new QkModelException('MODEL_FILE_UNREADABLE');
        }

        $raw = file_get_contents($path);
        if ($raw === false || $raw === '') {
            throw new QkModelException('MODEL_FILE_UNREADABLE');
        }

        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            throw new QkModelException('MODEL_FILE_INVALID_JSON');
        }

        return $decoded;
    }

    /**
     * @param array<string,mixed> $files
     */
    private static function fileName(array $files, string $key, string $fallback): string
    {
        $value = $files[$key] ?? $fallback;

        return is_string($value) && $value !== '' ? $value : $fallback;
    }

    /**
     * @param array<string,mixed> $scenariosFile
     */
    private function indexScenarios(array $scenariosFile): void
    {
        $list = $scenariosFile['scenarios'] ?? null;
        if (!is_array($list) || $list === []) {
            throw new QkModelException('MODEL_SCENARIOS_MISSING');
        }

        foreach ($list as $scenario) {
            if (!is_array($scenario)) {
                throw new QkModelException('MODEL_SCENARIO_INVALID');
            }
            $code = $scenario['code'] ?? null;
            if (!is_string($code) || $code === '') {
                throw new QkModelException('MODEL_SCENARIO_CODE_MISSING');
            }
            $this->scenariosByCode[$code] = $scenario;
        }

        /** @var array<int,mixed> $order */
        $order = $this->manifest['scenarioOrder'] ?? [];
        foreach ($order as $code) {
            if (!isset($this->scenariosByCode[(string) $code])) {
                throw new QkModelException('MODEL_SCENARIO_ORDER_MISMATCH');
            }
        }
        if (count($order) !== count($this->scenariosByCode)) {
            throw new QkModelException('MODEL_SCENARIO_ORDER_MISMATCH');
        }
        $this->scenarioOrder = array_map(static fn ($code): string => (string) $code, array_values($order));
    }

    private function validate(): void
    {
        $manifest = $this->manifest;
        $parameters = $this->parameters;

        if (($manifest['modelId'] ?? null) !== ($parameters['modelId'] ?? null)) {
            throw new QkModelException('MODEL_ID_MISMATCH');
        }
        if (($manifest['calibrationVersion'] ?? null) !== ($parameters['calibrationVersion'] ?? null)) {
            throw new QkModelException('MODEL_CALIBRATION_VERSION_MISMATCH');
        }

        $limits = $parameters['engineLimits'] ?? [];
        if ((int) ($limits['scenarioCount'] ?? 0) !== count($this->scenarioOrder)) {
            throw new QkModelException('MODEL_SCENARIO_COUNT_MISMATCH');
        }

        $thresholds = $this->lossThresholds();
        if ($thresholds === []) {
            throw new QkModelException('MODEL_THRESHOLDS_MISSING');
        }
        $previous = -1.0;
        foreach ($thresholds as $threshold) {
            if ($threshold <= $previous) {
                throw new QkModelException('MODEL_THRESHOLDS_NOT_ASCENDING');
            }
            $previous = $threshold;
        }

        $allowedIterations = $manifest['allowedIterations'] ?? [];
        if (!is_array($allowedIterations) || !in_array($manifest['defaultIterations'] ?? null, $allowedIterations, true)) {
            throw new QkModelException('MODEL_ITERATION_DEFAULTS_INVALID');
        }

        $this->validateQuestions();
        $this->validateCalibration();
        $this->validateModifiers();
        $this->validateContent();
    }

    private function validateQuestions(): void
    {
        $profileQuestions = $this->profileQuestions();
        if ($profileQuestions === []) {
            throw new QkModelException('MODEL_PROFILE_QUESTIONS_MISSING');
        }

        $codes = [];
        foreach ($profileQuestions as $question) {
            $code = $question['code'] ?? null;
            $optionSet = $question['optionSet'] ?? null;
            if (!is_string($code) || $code === '' || !is_string($optionSet) || $optionSet === '') {
                throw new QkModelException('MODEL_PROFILE_QUESTION_INVALID');
            }
            if (trim((string) ($question['shortLabel'] ?? '')) === '') {
                // The short label is used for the sensitivity factor names.
                throw new QkModelException('MODEL_PROFILE_QUESTION_LABEL_MISSING');
            }
            if (isset($codes[$code])) {
                throw new QkModelException('MODEL_PROFILE_QUESTION_DUPLICATE');
            }
            $codes[$code] = true;
            $this->optionSet($optionSet);
        }

        foreach ($this->manifest['profileQuestionOrder'] ?? [] as $ordered) {
            if (!isset($codes[(string) $ordered])) {
                throw new QkModelException('MODEL_PROFILE_ORDER_MISMATCH');
            }
        }

        $questionsPerScenario = (int) ($this->parameters['engineLimits']['questionsPerScenario'] ?? 0);
        if ($questionsPerScenario !== 2) {
            throw new QkModelException('MODEL_QUESTIONS_PER_SCENARIO_INVALID');
        }

        $expectedTemplates = $this->manifest['scenarioQuestionCodes'] ?? [];
        if (count($this->scenarioQuestionTemplates()) !== count($expectedTemplates)) {
            throw new QkModelException('MODEL_SCENARIO_TEMPLATES_INVALID');
        }

        foreach ($this->scenarioOrder as $scenarioCode) {
            $scenario = $this->scenario($scenarioCode);
            foreach (['likelihoodQuestion', 'impactQuestion'] as $key) {
                $question = $scenario[$key] ?? null;
                if (!is_array($question)) {
                    throw new QkModelException('MODEL_SCENARIO_QUESTION_MISSING');
                }
                $optionSet = $question['optionSet'] ?? null;
                if (!is_string($optionSet) || $optionSet === '') {
                    throw new QkModelException('MODEL_SCENARIO_QUESTION_INVALID');
                }
                $this->optionSet($optionSet);
            }
        }
    }

    private function validateCalibration(): void
    {
        $parameters = $this->parameters;
        $frequency = $parameters['frequency'] ?? [];
        $frequencyOptionSet = (string) ($frequency['optionSet'] ?? '');
        $this->optionSet($frequencyOptionSet);
        foreach (array_keys((array) ($frequency['bands'] ?? [])) as $optionCode) {
            if (!$this->hasOption($frequencyOptionSet, (string) $optionCode)) {
                throw new QkModelException('MODEL_FREQUENCY_BAND_UNKNOWN_OPTION');
            }
        }
        self::assertUnknownPolicy(
            $frequency['unknownPolicy'] ?? null,
            $frequencyOptionSet,
            $this,
            'MODEL_FREQUENCY_UNKNOWN_POLICY_INVALID'
        );

        $impact = $parameters['impactMultiplier'] ?? [];
        $impactOptionSet = (string) ($impact['optionSet'] ?? '');
        $this->optionSet($impactOptionSet);
        foreach (array_keys((array) ($impact['bands'] ?? [])) as $optionCode) {
            if (!$this->hasOption($impactOptionSet, (string) $optionCode)) {
                throw new QkModelException('MODEL_IMPACT_BAND_UNKNOWN_OPTION');
            }
        }
        self::assertUnknownPolicy(
            $impact['unknownPolicy'] ?? null,
            $impactOptionSet,
            $this,
            'MODEL_IMPACT_UNKNOWN_POLICY_INVALID'
        );

        $anchor = $parameters['disruptionCostAnchor'] ?? [];
        $anchorQuestion = (string) ($anchor['questionCode'] ?? '');
        $anchorOptionSet = $this->optionSetForQuestion($anchorQuestion);
        foreach (array_keys((array) ($anchor['bands'] ?? [])) as $optionCode) {
            if ($anchorOptionSet === null || !$this->hasOption($anchorOptionSet, (string) $optionCode)) {
                throw new QkModelException('MODEL_ANCHOR_BAND_UNKNOWN_OPTION');
            }
        }
        self::assertRange($anchor['fallback'] ?? null);

        $scaling = (array) ($parameters['scenarioScaling']['scenarios'] ?? []);
        foreach ($this->scenarioOrder as $scenarioCode) {
            $entry = $scaling[$scenarioCode] ?? null;
            if (!is_array($entry)) {
                throw new QkModelException('MODEL_SCENARIO_SCALING_MISSING');
            }
            self::assertRange($entry['susceptibility'] ?? null);
            self::assertRange($entry['secondaryLossProbability'] ?? null);
            self::assertRange($entry['secondaryLossMultiplier'] ?? null);
            if (!is_numeric($entry['frequencyScale'] ?? null) || !is_numeric($entry['impactScale'] ?? null)) {
                throw new QkModelException('MODEL_SCENARIO_SCALE_INVALID');
            }
        }

        foreach (['confidence', 'interpretation', 'engineLimits', 'sampling', 'secondaryLoss'] as $key) {
            if (!is_array($parameters[$key] ?? null)) {
                throw new QkModelException('MODEL_PARAMETERS_INCOMPLETE');
            }
        }

        // Corrections for the independent audit must not be silently reverted: the model has to
        // keep declaring that it reports an annualised exposure approximation and not realised
        // annual loss totals, and the confidence indicator must keep declaring its basis.
        $annualisation = $parameters['annualisation'] ?? null;
        if (!is_array($annualisation) || (string) ($annualisation['method'] ?? '') === '') {
            throw new QkModelException('MODEL_ANNUALISATION_MISSING');
        }
        if (($annualisation['realisedAnnualTotalsModelled'] ?? true) !== false) {
            throw new QkModelException('MODEL_ANNUALISATION_CLAIM_INVALID');
        }
        if (trim((string) ($annualisation['limitation'] ?? '')) === '') {
            throw new QkModelException('MODEL_ANNUALISATION_LIMITATION_MISSING');
        }
        if (($this->manifest['realisedAnnualTotalsModelled'] ?? true) !== false) {
            throw new QkModelException('MODEL_MANIFEST_ANNUALISATION_CLAIM_INVALID');
        }
        if ((string) ($this->manifest['annualisationMethod'] ?? '') !== (string) $annualisation['method']) {
            throw new QkModelException('MODEL_ANNUALISATION_METHOD_MISMATCH');
        }

        $confidence = (array) ($parameters['confidence'] ?? []);
        if (($confidence['isStatisticalConfidence'] ?? true) !== false) {
            throw new QkModelException('MODEL_CONFIDENCE_BASIS_INVALID');
        }
        if (trim((string) ($confidence['basis'] ?? '')) === '') {
            throw new QkModelException('MODEL_CONFIDENCE_BASIS_INVALID');
        }
        if (!isset($confidence['penalties']['provisionalCalibrationStatus'])) {
            throw new QkModelException('MODEL_CONFIDENCE_PROVISIONAL_PENALTY_MISSING');
        }
        if ((array) ($confidence['provisionalCalibrationStatuses'] ?? []) === []) {
            throw new QkModelException('MODEL_CONFIDENCE_PROVISIONAL_STATUSES_MISSING');
        }
        $maximumLevel = (string) ($confidence['maxLevelWhenProvisional'] ?? '');
        if (!in_array($maximumLevel, [QkConfidence::LEVEL_HIGH, QkConfidence::LEVEL_MEDIUM, QkConfidence::LEVEL_LOW], true)) {
            throw new QkModelException('MODEL_CONFIDENCE_LEVEL_CAP_INVALID');
        }
        if (
            in_array((string) ($this->manifest['releaseStatus'] ?? ''), (array) $confidence['provisionalCalibrationStatuses'], true)
            && $maximumLevel === QkConfidence::LEVEL_HIGH
        ) {
            throw new QkModelException('MODEL_CONFIDENCE_LEVEL_CAP_INEFFECTIVE');
        }

        $sensitivity = $parameters['sensitivity'] ?? null;
        if (!is_array($sensitivity) || (int) ($sensitivity['maxFactors'] ?? 0) < 1) {
            throw new QkModelException('MODEL_SENSITIVITY_INVALID');
        }

        // The widening mean-shift cap is what keeps an Unknown answer from inflating a central
        // estimate; the model is invalid without it, because unbounded widening silently moves
        // the expected value.
        $sampling = (array) ($parameters['sampling'] ?? []);
        $meanShiftCap = $sampling['wideningMeanShiftCap'] ?? null;
        if (!is_numeric($meanShiftCap) || (float) $meanShiftCap <= 1.0) {
            throw new QkModelException('MODEL_WIDENING_MEAN_SHIFT_CAP_INVALID');
        }
        if (trim((string) ($sampling['wideningMeanShiftCapRationale'] ?? '')) === '') {
            throw new QkModelException('MODEL_WIDENING_MEAN_SHIFT_CAP_UNDOCUMENTED');
        }

        // The measured central effect of an Unknown answer must stay disclosed and quantified.
        $disclosure = $parameters['unknownAnswerDisclosure'] ?? null;
        if (!is_array($disclosure)) {
            throw new QkModelException('MODEL_UNKNOWN_DISCLOSURE_MISSING');
        }
        foreach (['interpretation', 'whyNotLower', 'note'] as $key) {
            if (trim((string) ($disclosure[$key] ?? '')) === '') {
                throw new QkModelException('MODEL_UNKNOWN_DISCLOSURE_INCOMPLETE');
            }
        }
        foreach (['meanRatio', 'medianRatio', 'p90Ratio', 'allUnknownPortfolioMultipleOfAllKnown'] as $key) {
            if (!is_numeric($disclosure[$key] ?? null) || (float) $disclosure[$key] <= 0.0) {
                throw new QkModelException('MODEL_UNKNOWN_DISCLOSURE_UNQUANTIFIED');
            }
        }

        $plausibility = $parameters['plausibilityReview'] ?? null;
        if (!is_array($plausibility) || (string) ($plausibility['status'] ?? '') === '') {
            throw new QkModelException('MODEL_PLAUSIBILITY_REVIEW_MISSING');
        }

        foreach (['frequency', 'impactMultiplier'] as $groupKey) {
            if (trim((string) ($parameters[$groupKey]['answerInterpretation'] ?? '')) === '') {
                throw new QkModelException('MODEL_ANSWER_INTERPRETATION_MISSING');
            }
        }
    }

    /**
     * Validates an Unknown-answer mixture policy: it must reference real option codes and its
     * weights must be positive and sum to approximately one.
     *
     * @param mixed $policy
     */
    private static function assertUnknownPolicy($policy, string $optionSetName, self $model, string $errorCode): void
    {
        if (!is_array($policy)) {
            throw new QkModelException($errorCode);
        }
        if ((string) ($policy['type'] ?? '') !== 'mixture') {
            throw new QkModelException($errorCode);
        }

        $weights = $policy['weights'] ?? null;
        if (!is_array($weights) || $weights === []) {
            throw new QkModelException($errorCode);
        }

        $total = 0.0;
        foreach ($weights as $optionCode => $weight) {
            if (!$model->hasOption($optionSetName, (string) $optionCode)) {
                throw new QkModelException($errorCode);
            }
            if (!is_numeric($weight) || (float) $weight <= 0.0) {
                throw new QkModelException($errorCode);
            }
            $total += (float) $weight;
        }

        if (abs($total - 1.0) > 0.0001) {
            throw new QkModelException('MODEL_UNKNOWN_POLICY_WEIGHTS_INVALID');
        }

        if (trim((string) ($policy['note'] ?? '')) === '') {
            throw new QkModelException($errorCode);
        }
    }

    private function validateModifiers(): void
    {
        $modifiers = $this->parameters['modifiers'] ?? null;
        if (!is_array($modifiers) || $modifiers === []) {
            throw new QkModelException('MODEL_MODIFIERS_MISSING');
        }

        foreach ($modifiers as $modifier) {
            if (!is_array($modifier)) {
                throw new QkModelException('MODEL_MODIFIER_INVALID');
            }
            $questionCode = (string) ($modifier['questionCode'] ?? '');
            $optionSet = $this->optionSetForQuestion($questionCode);
            if ($optionSet === null) {
                throw new QkModelException('MODEL_MODIFIER_UNKNOWN_QUESTION');
            }
            $values = $modifier['values'] ?? null;
            if (!is_array($values) || $values === []) {
                throw new QkModelException('MODEL_MODIFIER_VALUES_MISSING');
            }
            foreach (array_keys($values) as $optionCode) {
                if (!$this->hasOption($optionSet, (string) $optionCode)) {
                    throw new QkModelException('MODEL_MODIFIER_UNKNOWN_OPTION');
                }
            }
            foreach ((array) ($modifier['appliesTo'] ?? []) as $scenarioCode) {
                if ($scenarioCode !== 'ALL' && !isset($this->scenariosByCode[(string) $scenarioCode])) {
                    throw new QkModelException('MODEL_MODIFIER_UNKNOWN_SCENARIO');
                }
            }
        }
    }

    private function validateContent(): void
    {
        $content = $this->content;
        $paragraphs = $content['disclaimer']['paragraphs'] ?? null;
        if (!is_array($paragraphs) || count($paragraphs) < 8) {
            throw new QkModelException('MODEL_DISCLAIMER_INCOMPLETE');
        }
        foreach (['privacyNotice', 'positioning', 'methodology', 'terminology', 'limitations', 'reportLabels'] as $key) {
            if (!is_array($content[$key] ?? null)) {
                throw new QkModelException('MODEL_CONTENT_INCOMPLETE');
            }
        }
        if (($content['disclaimerVersion'] ?? null) !== ($this->manifest['disclaimerVersion'] ?? null)) {
            throw new QkModelException('MODEL_DISCLAIMER_VERSION_MISMATCH');
        }
    }

    private function optionSetForQuestion(string $questionCode): ?string
    {
        foreach ($this->profileQuestions() as $question) {
            if (($question['code'] ?? null) === $questionCode) {
                $optionSet = $question['optionSet'] ?? null;

                return is_string($optionSet) ? $optionSet : null;
            }
        }

        return null;
    }

    /**
     * @param mixed $range
     */
    private static function assertRange($range): void
    {
        if (!is_array($range)) {
            throw new QkModelException('MODEL_RANGE_INVALID');
        }
        foreach (['min', 'mode', 'max'] as $key) {
            if (!isset($range[$key]) || !is_numeric($range[$key]) || !is_finite((float) $range[$key])) {
                throw new QkModelException('MODEL_RANGE_INVALID');
            }
        }
        if ((float) $range['min'] > (float) $range['max']) {
            throw new QkModelException('MODEL_RANGE_INVERTED');
        }
        if ((float) $range['mode'] < (float) $range['min'] || (float) $range['mode'] > (float) $range['max']) {
            throw new QkModelException('MODEL_RANGE_MODE_OUT_OF_BOUNDS');
        }
    }
}
