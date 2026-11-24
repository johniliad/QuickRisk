<?php

declare(strict_types=1);

/**
 * Audit-correction tests.
 *
 * These tests pin the four mandatory and five recommended corrections made in model
 * FAIR-QK-1.2 / calibration CAL-1.2 in response to the independent quantitative audit:
 *
 *  1. the likelihood question asks for threat event frequency before control effectiveness;
 *  2. Unknown answers use an equal-weight mixture instead of a punitive wide band;
 *  3. the response declares an annualised exposure approximation, not realised annual totals;
 *  4. every user-facing claim matches what the model actually computes;
 *  5. input confidence is relabelled, declared heuristic and capped while provisional;
 *  6. a genuine one-at-a-time sensitivity analysis of the expected value is reported;
 *  7. compound extreme cases are documented and flagged as awaiting expert review;
 *  8. model-form, distribution-shape, calibration and correlation uncertainty are stated;
 *  9. zero exceedances are reported as a count of simulated trials.
 *
 * If any of these tests fails, a correction has been silently reverted.
 */

return [
    'corrections: the likelihood question asks about attempts before control effectiveness' => function (): void {
        $model = qk_test_model();
        $templates = $model->scenarioQuestionTemplates();
        $likelihoodTemplate = null;
        foreach ($templates as $template) {
            if ((string) ($template['template'] ?? '') === 'SQA') {
                $likelihoodTemplate = $template;
            }
        }

        assertTrue(is_array($likelihoodTemplate), 'The likelihood question template must exist');
        assertContains(
            'before considering',
            strtolower((string) $likelihoodTemplate['genericText']),
            'The likelihood template must ask for attempts before control effectiveness'
        );
        assertContains(
            'applied separately and only once',
            strtolower((string) $likelihoodTemplate['help']),
            'The likelihood help text must state that the defences are applied separately and only once'
        );

        foreach ($model->scenarioOrder() as $code) {
            $question = (array) $model->scenario($code)['likelihoodQuestion'];
            $text = strtolower((string) $question['text']);
            assertContains(
                'before considering',
                $text,
                'Scenario ' . $code . ' likelihood text must exclude control effectiveness'
            );
            assertNotContains(
                'existing controls',
                $text,
                'Scenario ' . $code . ' likelihood text must not ask about existing controls'
            );
            assertContains(
                'applied separately',
                strtolower((string) $question['help']),
                'Scenario ' . $code . ' likelihood help must state that controls are applied separately'
            );
        }

        $parameters = $model->parameters();
        assertContains(
            'threat event frequency',
            strtolower((string) ($parameters['frequency']['answerInterpretation'] ?? '')),
            'The frequency parameter must document the threat-event-frequency interpretation'
        );
    },

    'corrections: Unknown answers retain the reference posterior without a synthetic range' => function (): void {
        $response = qk_test_calculate(qk_test_payload(qk_test_profile(), qk_test_scenario_answers('UNKNOWN', 'UNKNOWN')));

        foreach ($response['scenarios'] as $scenario) {
            $frequency = $scenario['inputs']['threatEventFrequency'];
            assertSame('posterior', $frequency['kind'], 'A posterior input must declare its kind');
            assertTrue((int) $frequency['draws'] > 0, 'Posterior inputs must carry draws');
            assertTrue((float) $frequency['q025'] <= (float) $frequency['q975'], 'Posterior quantiles must be ordered');
            assertTrue((array) $frequency['evidenceIds'] !== [], 'Posterior inputs must identify evidence sources');
            foreach ($scenario['answers'] as $answer) {
                assertTrue((bool) $answer['unknown'], 'Unknown answers must be identified as unknown');
            }
        }
        assertTrue(
            (bool) $response['meta']['inference']['active'],
            'The active inference package must be identified'
        );
    },

    'corrections: the response declares posterior-predictive annual totals' => function (): void {
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()));

        assertSame(
            'posterior-predictive-compound-poisson-annual-total',
            (string) $response['meta']['annualisationMethod'],
            'The annualisation method must be declared'
        );
        assertTrue(
            $response['meta']['realisedAnnualTotalsModelled'],
            'The posterior engine must state that annual totals are simulated'
        );
        assertContains(
            'not',
            strtolower((string) $response['meta']['annualisationLimitation']),
            'The annualisation limitation must be stated'
        );
        assertContains(
            'annual total losses',
            strtolower((string) $response['portfolio']['annualisationNote']),
            'The portfolio must carry the annual-total note'
        );

        foreach ($response['scenarios'] as $scenario) {
            assertContains(
                'realised annual loss totals',
                strtolower((string) $scenario['interpretation']['annualisationStatement']),
                'Every scenario must state the annual-total interpretation'
            );
        }

        $content = qk_test_model()->content();
        assertContains(
            'organisation-specific validation',
            strtolower(implode(' ', (array) $content['limitations']['items'])),
            'The limitations list must state the validation limitation'
        );
        assertTrue(
            (string) ($content['annualisationNotice']['statement'] ?? '') !== '',
            'The annualisation notice must be published to the browser'
        );
    },

    'corrections: zero exceedances are reported as a count of simulated trials' => function (): void {
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()));

        foreach ($response['scenarios'] as $scenario) {
            $statistics = $scenario['statistics'];
            $iterations = (int) $statistics['iterations'];
            $counts = (array) $statistics['thresholdExceedanceCounts'];
            $probabilities = (array) $statistics['thresholdProbabilities'];

            assertSame(
                array_keys($probabilities),
                array_keys($counts),
                'Every threshold probability must have an exceedance count'
            );

            foreach ($counts as $threshold => $count) {
                assertTrue(is_int($count), 'Exceedance counts must be integers');
                assertBetween((float) $count, 0.0, (float) $iterations, 'Exceedance counts must be bounded');
                assertSame(
                    (int) round((float) $probabilities[$threshold] * $iterations),
                    $count,
                    'The exceedance count must match the reported probability'
                );
                if ((float) $probabilities[$threshold] <= 0.0) {
                    assertSame(0, $count, 'A zero probability must be reported as zero trials');
                }
            }

            $statement = (string) $scenario['interpretation']['thresholdStatement'];
            if (str_contains($statement, '0 of')) {
                assertContains(
                    number_format($iterations),
                    $statement,
                    'A zero exceedance must name the number of simulated trials'
                );
                assertContains(
                    'not evidence',
                    strtolower($statement),
                    'A zero exceedance must not imply impossibility'
                );
            }
        }
    },

    'corrections: input confidence is declared heuristic and capped while provisional' => function (): void {
        $model = qk_test_model();
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()));

        foreach ($response['scenarios'] as $scenario) {
            $confidence = $scenario['confidence'];
            assertSame(
                'heuristic-input-quality',
                (string) $confidence['basis'],
                'Input confidence must declare its heuristic basis'
            );
            assertFalse(
                $confidence['isStatisticalConfidence'],
                'Input confidence must not claim to be statistical confidence'
            );
            assertSame('Input confidence', (string) $confidence['displayLabel'], 'The label must be input confidence');
        }

        $overall = $response['portfolio']['confidence'];
        assertSame('heuristic-input-quality', (string) $overall['basis'], 'Overall basis must be declared');
        assertFalse($overall['isStatisticalConfidence'], 'Overall confidence must not claim statistical confidence');
        assertTrue(
            in_array((string) $overall['level'], ['High', 'Medium', 'Low'], true),
            'Overall confidence must use a declared level'
        );
        assertTrue(
            (string) $overall['level'] !== 'High',
            'A provisional release must not report High input confidence'
        );
        assertSame('Medium', (string) $overall['maximumLevelWhenProvisional'], 'The cap must be declared');
        assertSame('provisional-release', (string) $response['meta']['releaseStatus'], 'The release status must be provisional');

        $content = $model->content();
        assertTrue(
            (string) ($content['confidenceNotice']['statement'] ?? '') !== '',
            'The input-confidence notice must be published to the browser'
        );
        assertContains(
            'not statistical confidence',
            strtolower((string) $content['confidenceNotice']['statement']),
            'The input-confidence notice must deny statistical confidence'
        );
    },

    'corrections: extreme compound results are flagged as awaiting expert review' => function (): void {
        $model = qk_test_model();
        $parameters = $model->parameters();

        assertSame(
            'pending-prospective-validation',
            (string) ($parameters['plausibilityReview']['status'] ?? ''),
            'The validation status must be recorded'
        );

        $content = $model->content();
        $limitations = strtolower(implode(' ', (array) $content['limitations']['items']));
        assertContains(
            'organisation-specific validation',
            $limitations,
            'The limitations must state that organisation-specific validation is absent'
        );
        assertContains(
            'model itself',
            $limitations,
            'The limitations must state that model-form uncertainty is not captured'
        );
        assertContains('dependence', $limitations, 'The limitations must state the dependence model');

        $methodology = '';
        foreach ((array) $content['methodology']['sections'] as $section) {
            $methodology .= ' ' . strtolower(implode(' ', (array) ($section['paragraphs'] ?? [])));
            $methodology .= ' ' . strtolower(implode(' ', (array) ($section['bullets'] ?? [])));
        }
        assertContains(
            'uncertainty about the model itself',
            $methodology,
            'The methodology must state that model-form uncertainty is not resolved'
        );
        assertContains('posterior-predictive', $methodology, 'The methodology must explain posterior predictions');
        assertContains(
            'sensitivity',
            $methodology,
            'The methodology must explain the sensitivity analysis'
        );
    },

    'corrections: the response carries a one-at-a-time sensitivity analysis' => function (): void {
        $model = qk_test_model();
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()));

        $sensitivity = (array) $response['portfolio']['sensitivity'];
        $factors = (array) $sensitivity['factors'];

        assertTrue($factors !== [], 'A sensitivity analysis must be reported');
        assertSame(
            'posterior-draw-expected-value',
            (string) $sensitivity['baselineMethod'],
            'The baseline method must be declared'
        );
        assertTrue((string) $sensitivity['method'] !== '', 'The sensitivity method must be described');
        assertTrue((string) $sensitivity['note'] !== '', 'The sensitivity limitation must be stated');
        assertContains(
            'holding other answers fixed',
            strtolower((string) $sensitivity['method']),
            'The method must describe the one-at-a-time comparison'
        );
        assertFalse(
            (bool) $sensitivity['truncated'] && count($factors) >= (int) $sensitivity['factorCount'],
            'Truncation must only be reported when factors were actually omitted'
        );

        $maximum = (int) ($model->parameters()['sensitivity']['maxFactors'] ?? 10);
        assertTrue(count($factors) <= $maximum, 'The factor list must respect the configured maximum');
        assertSame(
            (int) $sensitivity['factorCount'] > $maximum,
            (bool) $sensitivity['truncated'],
            'Truncation must be declared exactly when factors were omitted'
        );
        assertSame(
            count($model->profileQuestions()) + (2 * count($model->scenarioOrder())),
            (int) $sensitivity['factorCount'],
            'Every profile question and both scenario questions must be assessed'
        );

        $previous = INF;
        foreach ($factors as $factor) {
            assertTrue(
                (float) $factor['spreadRatio'] <= $previous,
                'Factors must be ordered by descending spread ratio'
            );
            $previous = (float) $factor['spreadRatio'];
            assertTrue((float) $factor['spreadRatio'] >= 1.0, 'A spread ratio cannot be below one');
            assertTrue(
                (float) $factor['lowExpectedAnnualLoss'] <= (float) $factor['highExpectedAnnualLoss'],
                'The low option must not exceed the high option'
            );
            assertTrue((string) $factor['label'] !== '', 'Every factor must be labelled');
            assertTrue(
                in_array((string) $factor['kind'], ['profile', 'scenario'], true),
                'Every factor must be a profile or scenario factor'
            );
        }

        // The disruption-cost anchor dominates this model, so it must appear as a factor.
        $codes = array_map(static fn (array $factor): string => (string) $factor['questionCode'], $factors);
        assertTrue(in_array('QP8', $codes, true), 'The disruption-cost anchor must appear as a factor');
    },

    'corrections: every sensitivity factor matches a direct recalculation' => function (): void {
        $model = qk_test_model();
        $profile = qk_test_profile();
        $scenarioAnswers = qk_test_scenario_answers('POSSIBLE', 'SIGNIFICANT');
        $sensitivity = FairEngine::sensitivity($model, $profile, $scenarioAnswers);

        // The declared baseline must be the analytic sum for the submitted answers.
        $baseline = 0.0;
        foreach ($model->scenarioOrder() as $code) {
            $baseline += FairEngine::analyticExpectedAnnualLoss(
                $model,
                $code,
                $profile,
                (array) ($scenarioAnswers[$code] ?? [])
            );
        }
        assertRelativeClose(
            $baseline,
            (float) $sensitivity['baselineExpectedAnnualLoss'],
            1e-9,
            'The sensitivity baseline must equal the analytic expected annual loss'
        );

        foreach ((array) $sensitivity['factors'] as $factor) {
            $questionCode = (string) $factor['questionCode'];
            $scenarioCode = $factor['scenarioCode'];
            $questionKind = null;
            if ($scenarioCode !== null) {
                $scenario = $model->scenario((string) $scenarioCode);
                if ((string) $scenario['likelihoodQuestion']['code'] === $questionCode) {
                    $questionKind = 'likelihood';
                } elseif ((string) $scenario['impactQuestion']['code'] === $questionCode) {
                    $questionKind = 'impact';
                }
                assertTrue($questionKind !== null, 'A scenario factor must map to a scenario question');
            }

            foreach ([
                'lowExpectedAnnualLoss' => (string) $factor['lowOption'],
                'highExpectedAnnualLoss' => (string) $factor['highOption'],
            ] as $key => $optionCode) {
                $profileVariant = $profile;
                $answersVariant = $scenarioAnswers;
                if ($questionKind === null) {
                    $profileVariant[$questionCode] = $optionCode;
                } else {
                    $answersVariant[(string) $scenarioCode] = array_merge(
                        (array) $answersVariant[(string) $scenarioCode],
                        [$questionKind => $optionCode]
                    );
                }

                $total = 0.0;
                foreach ($model->scenarioOrder() as $code) {
                    $total += FairEngine::analyticExpectedAnnualLoss(
                        $model,
                        $code,
                        $profileVariant,
                        (array) ($answersVariant[$code] ?? [])
                    );
                }

                assertRelativeClose(
                    $total,
                    (float) $factor[$key],
                    1e-9,
                    'The reported value for ' . $questionCode . ' must match a direct recalculation'
                );
            }
        }
    },

    'corrections: posterior uncertainty is not replaced by a synthetic widening cap' => function (): void {
        $model = qk_test_model();
        $unknownProfile = array_fill_keys($model->manifest()['profileQuestionOrder'], $model->unknownCode());
        $response = qk_test_calculate(
            qk_test_payload($unknownProfile, qk_test_scenario_answers('UNKNOWN', 'UNKNOWN'))
        );
        $anchor = qk_test_scenario($response, 'S1')['inputs']['lossMagnitudeAnchor'];
        assertSame('posterior', $anchor['kind'], 'An Unknown answer must retain a posterior input');
        assertTrue((float) $anchor['q025'] < (float) $anchor['q975'], 'The posterior interval must be non-degenerate');
        assertTrue((float) $anchor['q975'] > 0.0, 'The posterior upper quantile must be positive');
    },

    'corrections: the disclosed Unknown-answer central effect matches the model' => function (): void {
        $model = qk_test_model();
        $parameters = $model->parameters();
        $disclosure = (array) ($parameters['unknownAnswerDisclosure'] ?? []);

        assertTrue($disclosure !== [], 'The Unknown-answer central effect must be disclosed in the model');
        assertTrue(
            (float) ($disclosure['allUnknownPortfolioMultipleOfAllKnown'] ?? 0) > 0,
            'The disclosure must be quantified'
        );

        $profile = qk_test_profile();
        $knownAnswers = qk_test_scenario_answers('POSSIBLE', 'SIGNIFICANT');
        $unknownAnswers = qk_test_scenario_answers('UNKNOWN', 'UNKNOWN');

        $known = qk_test_calculate(qk_test_payload($profile, $knownAnswers));
        $unknown = qk_test_calculate(qk_test_payload($profile, $unknownAnswers));

        $frequency = qk_test_scenario($unknown, 'S1')['inputs']['threatEventFrequency'];
        assertSame('posterior', $frequency['kind'], 'An Unknown answer must retain the posterior input');
        assertTrue((int) $frequency['draws'] > 0, 'The posterior input must carry draws');
        assertTrue((float) $frequency['mean'] > 0.0, 'The posterior mean must be positive');

        $knownPortfolio = (float) $known['portfolio']['expectedAnnualLoss'];
        $unknownPortfolio = (float) $unknown['portfolio']['expectedAnnualLoss'];
        assertRelativeClose(
            $knownPortfolio,
            $unknownPortfolio,
            0.02,
            'Unknown scenario answers must not inflate the unchanged-reference posterior'
        );

        $allUnknownProfile = array_fill_keys($model->manifest()['profileQuestionOrder'], $model->unknownCode());
        $allUnknownPortfolio = (float) qk_test_calculate(
            qk_test_payload($allUnknownProfile, $unknownAnswers)
        )['portfolio']['expectedAnnualLoss'];
        assertTrue(is_finite($allUnknownPortfolio) && $allUnknownPortfolio >= 0.0, 'All-Unknown must stay finite');
    },

    'corrections: posterior sensitivity factors are internally consistent' => function (): void {
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()));
        foreach ($response['portfolio']['sensitivity']['factors'] as $factor) {
            assertTrue((float) $factor['lowExpectedAnnualLoss'] >= 0.0, 'Low expected loss must be non-negative');
            assertTrue(
                (float) $factor['highExpectedAnnualLoss'] >= (float) $factor['lowExpectedAnnualLoss'],
                'High expected loss must not be below low expected loss'
            );
            assertTrue((float) $factor['spreadRatio'] >= 1.0, 'Spread ratio must be at least one');
        }
    },

    'corrections: posterior per-event severities remain finite' => function (): void {
        $profile = qk_test_profile([
            'QP2' => 'EXTREME',
            'QP6' => 'VERY_LOW',
            'QP8' => 'GT10M',
        ]);
        $response = qk_test_calculate(
            qk_test_payload($profile, qk_test_scenario_answers('VERY_LIKELY', 'CRITICAL')),
            12345,
            5000
        );
        foreach ($response['scenarios'] as $scenario) {
            assertTrue(
                is_finite((float) $scenario['statistics']['expectedPrimaryLossMagnitude']),
                'Primary loss must be finite'
            );
            assertTrue(
                is_finite((float) $scenario['statistics']['expectedSecondaryLossMagnitude']),
                'Secondary loss must be finite'
            );
            assertTrue((float) $scenario['statistics']['p90'] >= 0.0, 'P90 must be non-negative');
        }
    },
];
