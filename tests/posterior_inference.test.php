<?php

declare(strict_types=1);

/** Posterior inference, evidence update and integrity tests for FAIR-QK-2.0. */

return [
    'posterior: object-local MT19937 matches PHP reference output' => function (): void {
        $generator = new QkMt19937(20261029);
        assertSame(1564096012, $generator->nextInt31(), 'The first MT19937 value must match PHP');
        assertSame(139650638, $generator->nextInt31(), 'The second MT19937 value must match PHP');

        mt_srand(20261029, MT_RAND_MT19937);
        $reference = [mt_rand(), mt_rand()];
        $local = new QkMt19937(20261029);
        assertSame($reference, [$local->nextInt31(), $local->nextInt31()], 'The sequence must remain compatible');
    },

    'posterior: Poisson sampler has the configured mean and ordered quantiles' => function (): void {
        $rng = new QkDistributions(4242);
        $total = 0;
        for ($draw = 0; $draw < 20000; $draw++) {
            $total += $rng->samplePoisson(4.5);
        }
        assertRelativeClose(4.5, $total / 20000, 0.04, 'The Poisson mean must converge');
        $previous = -1;
        foreach ([0.01, 0.1, 0.5, 0.9, 0.99] as $probability) {
            $value = QkDistributions::poissonQuantile($probability, 4.5);
            assertTrue($value >= $previous, 'The Poisson quantile must be monotone');
            $previous = $value;
        }
    },

    'posterior: the validated package activates with version and evidence provenance' => function (): void {
        $model = qk_test_model();
        $inference = QkInferenceRepository::load(qk_config(), $model);
        assertTrue($inference->isActive(), 'The generated reference package must activate');
        $metadata = $inference->metadata();
        assertSame('posterior-reference-class', (string) $metadata['mode'], 'The posterior mode must be declared');
        assertSame('reference-posterior-validated', (string) $metadata['status'], 'The validation status must be declared');
        assertTrue((string) $metadata['evidencePackageVersion'] !== '', 'The evidence package must be versioned');
        assertTrue((array) $metadata['evidenceSources'] !== [], 'The evidence sources must be listed');
        assertTrue((string) $metadata['knownValidationGap'] !== '', 'The validation gap must be disclosed');
    },

    'posterior: likelihood weighting reports effective sample size' => function (): void {
        $draws = [
            ['attackRate' => 0.1, 'materialProbability' => 0.2],
            ['attackRate' => 0.5, 'materialProbability' => 0.4],
            ['attackRate' => 1.0, 'materialProbability' => 0.6],
            ['attackRate' => 2.0, 'materialProbability' => 0.8],
        ];
        $rng = new QkDistributions(9);
        $unchanged = QkBayesianUpdater::update($draws, null, 10, $rng);
        assertFalse((bool) $unchanged['metadata']['evidenceUsed'], 'No count must mean no likelihood update');
        $updated = QkBayesianUpdater::update($draws, 3, 10, $rng);
        assertTrue((bool) $updated['metadata']['evidenceUsed'], 'A supplied count must update the posterior');
        assertSame(3, (int) $updated['metadata']['materialLossEventCount'], 'The supplied count must be reported');
        assertTrue((float) $updated['metadata']['effectiveSampleSize'] > 0.0, 'ESS must be positive');
        assertCount(10, $updated['draws'], 'The update must resample the requested number of draws');
    },

    'posterior: optional evidence changes the reported posterior and discloses ESS' => function (): void {
        $payload = qk_test_payload(qk_test_profile());
        $payload['organisationEvidence'] = ['materialLossEventCount' => 5];
        $response = qk_test_calculate($payload, 1234, 1000);
        $update = $response['meta']['inference']['evidenceUpdate'];
        assertTrue((bool) $update['evidenceUsed'], 'The evidence update must be declared');
        assertSame(5, (int) $update['materialLossEventCount'], 'The evidence count must be returned');
        assertTrue((float) $update['effectiveSampleSize'] > 0.0, 'The ESS must be returned');
        assertTrue(is_finite((float) $response['portfolio']['expectedAnnualLoss']), 'The updated loss must be finite');
    },

    'posterior: zero material events is accepted as evidence' => function (): void {
        $payload = qk_test_payload(qk_test_profile());
        $payload['organisationEvidence'] = ['materialLossEventCount' => 0];
        $response = qk_test_calculate($payload, 1234, 1000);
        assertTrue(
            (bool) $response['meta']['inference']['evidenceUpdate']['evidenceUsed'],
            'A zero count must be treated as observed evidence'
        );
        assertSame(
            0,
            (int) $response['meta']['inference']['evidenceUpdate']['materialLossEventCount'],
            'The zero count must be preserved'
        );
    },

    'posterior: joint portfolio percentiles are simulated from annual totals' => function (): void {
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()), 5678, 1000);
        assertTrue((bool) $response['meta']['jointPercentilesAvailable'], 'Joint percentiles must be available');
        assertTrue((float) $response['portfolio']['p90'] >= 0.0, 'The portfolio P90 must be finite');
        assertTrue(
            (float) $response['portfolio']['p90'] <= (float) $response['portfolio']['maximum'],
            'The portfolio P90 must lie inside the simulated maximum'
        );
        assertTrue(isset($response['portfolio']['thresholdIntervals']), 'Portfolio threshold intervals must be reported');
    },

    'posterior: Wilson diagnostics describe small exceedance counts' => function (): void {
        $zero = QkPercentile::exceedanceDiagnostics(0, 1000);
        assertTrue((float) $zero['lower'] >= 0.0 && (float) $zero['lower'] < 1.0e-12, 'Zero successes must have a zero lower bound');
        assertTrue((float) $zero['upper'] > 0.0, 'Zero successes must have a positive upper bound');
        assertFalse((bool) $zero['sufficientCount'], 'Zero successes must warn about precision');
        $ten = QkPercentile::exceedanceDiagnostics(10, 1000);
        assertTrue((bool) $ten['sufficientCount'], 'Ten successes must meet the warning threshold');
        assertTrue((float) $ten['lower'] <= (float) $ten['estimate'], 'The interval must contain the estimate');
        assertTrue((float) $ten['estimate'] <= (float) $ten['upper'], 'The interval must contain the estimate');
    },

    'posterior: treatment effects are integrated across iteration series' => function (): void {
        $model = qk_test_model();
        $inference = QkInferenceRepository::load(qk_config(), $model);
        $treatments = [qk_decision_curated_treatment('edr')];
        $realised = qk_decision_realise_effects($treatments, 20261124, 20, $inference);
        assertCount(20, $realised['series']['edr']['frequency'], 'A frequency effect series must be retained');
        assertCount(20, $realised['series']['edr']['magnitude'], 'A magnitude effect series must be retained');
        assertTrue(
            count(array_unique($realised['series']['edr']['frequency'])) > 1,
            'The treatment effect must not be one fixed draw'
        );
        $public = qk_decision_public_effects($realised);
        assertFalse(isset($public['series']), 'Server-only effect series must not be published');
    },

    'posterior: a tampered inference package fails closed to the legacy engine' => function (): void {
        $model = qk_test_model();
        $source = $model->modelPath() . '/inference';
        $target = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'qk-inference-' . bin2hex(random_bytes(4));
        mkdir($target, 0777, true);
        foreach (glob($source . '/*.json') ?: [] as $file) {
            copy($file, $target . DIRECTORY_SEPARATOR . basename($file));
        }
        file_put_contents($target . DIRECTORY_SEPARATOR . 'reference-classes.json', "\n");
        $config = qk_config();
        $config['inferencePath'] = $target;
        $inference = QkInferenceRepository::load($config, $model);
        assertFalse($inference->isActive(), 'A tampered package must not activate');

        $payload = QkValidation::validatePayload($model, qk_test_payload(qk_test_profile()));
        $response = QkRiskEngine::calculateAssessment($model, $inference, $payload, 1234, 1000);
        assertSame('legacy-heuristic', (string) $response['meta']['inference']['mode'], 'The fallback must be explicit');
        assertFalse((bool) $response['meta']['realisedAnnualTotalsModelled'], 'The fallback must not claim annual totals');

        foreach (glob($target . '/*') ?: [] as $file) {
            unlink($file);
        }
        rmdir($target);
    },
];
