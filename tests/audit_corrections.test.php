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

    'corrections: Unknown answers are an equal-weight mixture of the available answers' => function (): void {
        $model = qk_test_model();
        $profile = qk_test_profile();
        $response = qk_test_calculate(qk_test_payload($profile, qk_test_scenario_answers('UNKNOWN', 'UNKNOWN')));

        foreach ($response['scenarios'] as $scenario) {
            $frequency = $scenario['inputs']['threatEventFrequency'];
            assertSame('mixture', $frequency['kind'], 'An Unknown likelihood must be a mixture input');
            assertCount(5, (array) $frequency['components'], 'The mixture must cover the five known answers');
            assertCount(5, (array) $scenario['inputs']['impactMultiplier']['components'], 'The impact mixture must cover the five known answers');

            $weightTotal = 0.0;
            foreach ($frequency['components'] as $component) {
                $weightTotal += (float) $component['weight'];
                assertTrue(
                    (float) $component['min'] <= (float) $component['mode']
                        && (float) $component['mode'] <= (float) $component['max'],
                    'Every mixture component must be a valid range'
                );
            }
            assertClose(1.0, $weightTotal, 1e-9, 'Mixture weights must sum to one');
        }

        // Neutrality: the Unknown central estimate must sit inside the range of the answers the
        // user could have chosen, not above all of them.
        $options = [];
        foreach ($model->optionSet('frequency5') as $option) {
            $options[] = (string) $option['code'];
        }
        $values = [];
        foreach ($options as $optionCode) {
            if ($optionCode === $model->unknownCode()) {
                continue;
            }
            $values[$optionCode] = FairEngine::analyticExpectedAnnualLoss(
                $model,
                'S1',
                $profile,
                ['likelihood' => $optionCode, 'impact' => 'SIGNIFICANT']
            );
        }
        $unknown = FairEngine::analyticExpectedAnnualLoss(
            $model,
            'S1',
            $profile,
            ['likelihood' => $model->unknownCode(), 'impact' => 'SIGNIFICANT']
        );

        assertTrue(
            $unknown >= min($values) && $unknown <= max($values),
            'An Unknown answer must not exceed the range of the available answers'
        );
        assertTrue(
            $unknown <= $values['LIKELY'],
            'An Unknown answer must not be more adverse than the Likely answer'
        );
        assertTrue(
            $unknown >= $values['POSSIBLE'] * 0.9,
            'An Unknown answer must not be materially more optimistic than the Possible answer'
        );
        assertTrue(
            $unknown <= $values['POSSIBLE'] * 4.0,
            'An Unknown answer must not inflate the central estimate by an extreme factor'
        );

        // The mixture envelope must span the extremes of the available answers.
        $mixture = $response['scenarios'][0]['inputs']['threatEventFrequency'];
        assertTrue(
            (float) $mixture['min'] < (float) $mixture['max'],
            'The mixture envelope must be a real range'
        );
        assertTrue(
            (float) $mixture['min'] <= (float) $mixture['components'][0]['min'],
            'The envelope minimum must cover the lowest component'
        );
    },

    'corrections: the response declares an annualised exposure approximation' => function (): void {
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()));

        assertSame(
            'frequency-times-severity-annualised-exposure',
            (string) $response['meta']['annualisationMethod'],
            'The annualisation method must be declared'
        );
        assertFalse(
            $response['meta']['realisedAnnualTotalsModelled'],
            'The response must state that realised annual totals are not modelled'
        );
        assertContains(
            'not',
            strtolower((string) $response['meta']['annualisationLimitation']),
            'The annualisation limitation must be stated'
        );
        assertContains(
            'annualised exposure',
            strtolower((string) $response['portfolio']['annualisationNote']),
            'The portfolio must carry the annualisation note'
        );

        foreach ($response['scenarios'] as $scenario) {
            assertContains(
                'not a distribution of realised annual loss totals',
                strtolower((string) $scenario['interpretation']['annualisationStatement']),
                'Every scenario must state the annualisation limitation'
            );
        }

        $content = qk_test_model()->content();
        assertContains(
            'realised annual loss totals',
            strtolower(implode(' ', (array) $content['limitations']['items'])),
            'The limitations list must state the annualisation limitation'
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
        assertSame('Medium', (string) $overall['level'], 'A provisional calibration must cap the level at Medium');
        assertTrue($overall['levelCapApplied'], 'The cap must be reported when it applies');
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
            'pending-expert-review',
            (string) ($parameters['plausibilityReview']['status'] ?? ''),
            'The plausibility review status must be recorded'
        );

        $content = $model->content();
        $limitations = strtolower(implode(' ', (array) $content['limitations']['items']));
        assertContains('extreme combinations', $limitations, 'The limitations must cover compound extremes');
        assertContains(
            'model itself',
            $limitations,
            'The limitations must state that model-form uncertainty is not captured'
        );
        assertContains('correlation', $limitations, 'The limitations must state that correlation is not modelled');

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
        assertContains('annualised exposure', $methodology, 'The methodology must explain annualised exposure');
        assertContains(
            'one-at-a-time sensitivity',
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
        assertSame('analytic-expected-value', (string) $sensitivity['baselineMethod'], 'The baseline method must be declared');
        assertTrue((string) $sensitivity['method'] !== '', 'The sensitivity method must be described');
        assertTrue((string) $sensitivity['note'] !== '', 'The sensitivity limitation must be stated');
        assertContains(
            'one-at-a-time',
            strtolower((string) $sensitivity['method']),
            'The method must be described as one-at-a-time'
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

    'corrections: widening cannot inflate a central estimate beyond the documented cap' => function (): void {
        $model = qk_test_model();
        $parameters = $model->parameters();
        $cap = (float) ($parameters['sampling']['wideningMeanShiftCap'] ?? 1.0);

        assertTrue($cap > 1.0, 'A widening mean-shift cap must be configured');
        assertTrue(
            trim((string) ($parameters['sampling']['wideningMeanShiftCapRationale'] ?? '')) !== '',
            'The cap must be documented'
        );

        $unknownProfile = array_fill_keys($model->manifest()['profileQuestionOrder'], $model->unknownCode());
        $response = qk_test_calculate(
            qk_test_payload($unknownProfile, qk_test_scenario_answers('UNKNOWN', 'UNKNOWN'))
        );

        $scenario = qk_test_scenario($response, 'S1');
        $anchor = $scenario['inputs']['lossMagnitudeAnchor'];
        $anchorMean = ((float) $anchor['min'] + (float) $anchor['mode'] + (float) $anchor['max']) / 3.0;

        $fallback = (array) $parameters['disruptionCostAnchor']['fallback'];
        $unwidenedMean = ((float) $fallback['min'] + (float) $fallback['mode'] + (float) $fallback['max']) / 3.0;

        // Two capped widenings compose (the fallback path and the loss-magnitude path), so the
        // bound is the cap applied once per stage; nothing may exceed it.
        $bound = $unwidenedMean * $cap * $cap * 1.05;
        assertLessThan(
            $bound,
            $anchorMean,
            'Widening must not raise the anchor mean beyond the documented cap applied per stage'
        );

        assertGreaterThan(
            (float) $fallback['max'],
            (float) $anchor['max'],
            'An Unknown disruption cost must still widen the upper tail'
        );
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

        // The mixture mean is the average of the five answer means by construction.
        $frequency = qk_test_scenario($unknown, 'S1')['inputs']['threatEventFrequency'];
        $componentMeanTotal = 0.0;
        $weightTotal = 0.0;
        foreach ($frequency['components'] as $component) {
            $componentMean = ((float) $component['min'] + (float) $component['mode'] + (float) $component['max']) / 3.0;
            $componentMeanTotal += (float) $component['weight'] * $componentMean;
            $weightTotal += (float) $component['weight'];
        }
        $mixtureMean = $componentMeanTotal / $weightTotal;

        $knownFrequencyMean = 0.0;
        foreach ($parameters['frequency']['bands'] as $band) {
            $knownFrequencyMean += ((float) $band['min'] + (float) $band['mode'] + (float) $band['max']) / 3.0;
        }
        $knownFrequencyMean /= count($parameters['frequency']['bands']);

        // By construction: the mixture mean is the average of the available answer means.
        assertRelativeClose(
            $knownFrequencyMean,
            $mixtureMean,
            1e-6,
            'The mixture mean must equal the average of the available answer means'
        );

        // And that average is the documented multiple of the middle answer.
        $middleBand = (array) $parameters['frequency']['bands']['POSSIBLE'];
        $middleAnswerMean = ((float) $middleBand['min'] + (float) $middleBand['mode'] + (float) $middleBand['max']) / 3.0;
        assertRelativeClose(
            $middleAnswerMean * (float) $disclosure['frequencyMeanRelativeToMiddleAnswer'],
            $mixtureMean,
            1e-6,
            'The disclosed mean ratio to the middle answer must match the model'
        );

        $knownScenario = qk_test_scenario($known, 'S1');
        $unknownScenario = qk_test_scenario($unknown, 'S1');

        // Widening without a favourable shift: the typical value barely moves and the tail widens.
        assertLessThan(
            (float) $knownScenario['statistics']['p50'] * 1.5,
            (float) $unknownScenario['statistics']['p50'],
            'An Unknown answer must not materially shift the typical (median) value'
        );
        assertGreaterThan(
            (float) $knownScenario['statistics']['p90'] * 3.0,
            (float) $unknownScenario['statistics']['p90'],
            'An Unknown answer must materially widen the upper tail'
        );

        // Documented portfolio-level bounds for an Unknown assessment.
        $knownPortfolio = (float) $known['portfolio']['expectedAnnualLoss'];
        $unknownPortfolio = (float) $unknown['portfolio']['expectedAnnualLoss'];
        assertLessThan(
            8.0,
            $unknownPortfolio / $knownPortfolio,
            'Answering both scenario questions as Unknown must stay within the documented bound'
        );

        $allUnknownProfile = array_fill_keys($model->manifest()['profileQuestionOrder'], $model->unknownCode());
        $allUnknownPortfolio = (float) qk_test_calculate(
            qk_test_payload($allUnknownProfile, $unknownAnswers)
        )['portfolio']['expectedAnnualLoss'];
        assertLessThan(
            60.0,
            $allUnknownPortfolio / $knownPortfolio,
            'An all-Unknown assessment must stay within the documented inflation bound'
        );

        $qp8UnknownPortfolio = (float) qk_test_calculate(
            qk_test_payload(array_merge($profile, ['QP8' => $model->unknownCode()]), $knownAnswers)
        )['portfolio']['expectedAnnualLoss'];
        assertLessThan(
            3.0,
            $qp8UnknownPortfolio / $knownPortfolio,
            'An Unknown disruption cost alone must stay within the documented bound'
        );
    },
];
