/**
 * figure_loop.js — orchestrates the complete plan → generate → critique → feedback loop
 *
 * Implements an auto-iterative workflow:
 *   1. PLAN: Generate interaction blueprint
 *   2. GENERATE: Create 3D code from plan
 *   3. CRITIQUE: Evaluate with critic (5 metrics + failure modes + feedback)
 *   4. DECIDE: Use orchestrator to route fix_plan vs. refine_generation
 *   5. LOOP or EXIT
 *
 * Tracks all iterations for audit trail and debugging.
 */

const { planForFigure, refinePlan, planGeometry } = require('./planner');
const { generateCode, generateGeometryHtml, generateRefinedGeometryHtml, generateContentLayerHtml, generateRefinedContentLayerHtml } = require('./generation');
const { evaluateHtmlWithCritic, GEOMETRY_PHASE_RUBRICS, CONTENT_PHASE_RUBRICS } = require('./critic');
const { decideFigureRefinement } = require('./orchestrator');

async function withRetry(label, fn, { retries = 3, baseDelay = 2500 } = {}) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const msg = err?.message || String(err);
            const retryable = /fetch failed|connection error|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN|ENOTFOUND|429|503|timeout/i.test(msg);
            if (!retryable || attempt >= retries) throw err;
            const delay = baseDelay * Math.pow(2, attempt);
            console.warn(`[${label}] retryable error (${attempt + 1}/${retries}): ${msg}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Main loop orchestrator.
 * Returns a full audit trail of all iterations.
 *
 * @param {object} opts
 * @param {string} opts.figureStem - e.g. "brdf"
 * @param {string} opts.chapterName - e.g. "imaging"
 * @param {object} opts.imageData - { base64, mediaType }
 * @param {string} opts.scaffold - base HTML scaffold
 * @param {string} opts.sourceBase64 - original figure image (for critic)
 * @param {string} opts.sourceMediaType - "image/png"
 * @param {number} [opts.maxAttempts=3] - max iterations before giving up
 * @param {number} [opts.passThreshold=4.0] - overall_average score needed to pass
 * @param {string} [opts.plannerModel='gpt-4o']
 * @param {string} [opts.generatorModel='gpt-4o']
 * @param {string} [opts.criticModel='claude-opus-4.7']
 * @returns {object} - complete loop state and results
 */
async function runFigureLoop(opts) {
    const {
        figureStem,
        chapterName,
        imageData,
        scaffold,
        sourceBase64,
        sourceMediaType = 'image/png',
        maxAttempts = 3,
        passThreshold = 4.0,
        plannerModel = 'gpt-4o',
        generatorModel = 'gpt-4o',
        criticModel = 'claude-opus-4.7',
        fewShot = { planner: true, critic: true, orchestrator: true },
    } = opts;

    if (!figureStem) throw new Error('figureStem is required');
    if (!scaffold) throw new Error('scaffold is required');
    if (!imageData?.base64 || !imageData?.mediaType) throw new Error('imageData.base64 and imageData.mediaType are required');
    if (!sourceBase64) throw new Error('sourceBase64 (original figure image) is required');

    // Initialize loop state
    const loopState = {
        figureStem,
        chapterName: chapterName || null,
        status: 'planning',                    // planning | generating | critiquing | reviewing | passed | failed_max_attempts | failed_unrecoverable
        currentPlan: null,
        currentHtml: null,
        currentEvaluation: null,
        currentFeedback: null,
        attempts: [],                          // Full audit trail of each iteration
        bestAttempt: null,                     // Iteration with highest overall_average score
        bestScore: 0,
    };

    const _generationStart = Date.now();
    loopState.generationStartedAt = new Date(_generationStart).toISOString();

    try {

        // ─────────────────────────────────────────────────────────────────────────
        // STEP 1: INITIAL PLAN
        // ─────────────────────────────────────────────────────────────────────────
        console.log(`Starting loop for ${figureStem}`);
        loopState.status = 'planning';

        try {
            loopState.currentPlan = await withRetry(`plan:${figureStem}`, () =>
                planForFigure(figureStem, chapterName, imageData, plannerModel, fewShot.planner !== false)
            );
            console.log(`Plan created`, { elements: loopState.currentPlan.interactionPlan?.elements?.length || 0 });
        } catch (e) {
            loopState.status = 'failed_planning';
            loopState.attempts.push({
                iteration: 0,
                step: 'plan',
                status: 'error',
                error: e.message,
            });
            console.log(`PLAN FAILED: ${e.message}`);
            return loopState;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // MAIN LOOP: GENERATE → CRITIQUE → REVIEW → DECIDE
        // ─────────────────────────────────────────────────────────────────────────
        for (let attemptNum = 1; attemptNum <= maxAttempts; attemptNum++) {
            const attempt = {
                iteration: attemptNum,
                step: null,
                plan: loopState.currentPlan,
                html: null,
                evaluation: null,
                feedback: null,
                status: 'in-progress',
            };

            // ───── GENERATE ─────
            console.log(`[Attempt ${attemptNum}/${maxAttempts}] Generating...`);
            loopState.status = 'generating';
            attempt.step = 'generate';

            try {
                loopState.currentHtml = await withRetry(`generate:${figureStem}:attempt${attemptNum}`, () => generateCode({
                    scaffold,
                    plan: loopState.currentPlan,
                    prevHtml: loopState.attempts[attemptNum - 2]?.html || null,
                    evaluation: loopState.attempts[attemptNum - 2]?.evaluation || null,
                    modelId: generatorModel,
                    mediaType: imageData.mediaType,
                    base64: imageData.base64,
                }));
                attempt.html = loopState.currentHtml;
                console.log(`Generated HTML (${loopState.currentHtml.length} chars)`);
            } catch (e) {
                attempt.status = 'error';
                attempt.error = e.message;
                loopState.attempts.push(attempt);
                console.log(`GENERATION FAILED: ${e.message}`);
                loopState.status = 'failed_generation';
                break;
            }

            // ───── CRITIQUE ─────
            console.log(`Evaluating...`);
            loopState.status = 'critiquing';

            try {
                loopState.currentEvaluation = await withRetry(`critic:${figureStem}:attempt${attemptNum}`, () => evaluateHtmlWithCritic({
                    html: loopState.currentHtml,
                    evalImage: sourceBase64,
                    evalMediaType: sourceMediaType,
                    plan: loopState.currentPlan,
                    chapterName: loopState.chapterName,
                    model: criticModel,
                    useFewShot: fewShot.critic !== false,
                }));
                attempt.evaluation = loopState.currentEvaluation;

                console.log(`Critic scores`, {
                    overall: loopState.currentEvaluation.overall_average,
                    failures: (loopState.currentEvaluation.failure_modes || []).length,
                });

                // Track best attempt
                if (loopState.currentEvaluation.overall_average > loopState.bestScore) {
                    loopState.bestScore = loopState.currentEvaluation.overall_average;
                    loopState.bestAttempt = { ...attempt };
                }
            } catch (e) {
                attempt.status = 'error';
                attempt.error = e.message;
                loopState.attempts.push(attempt);
                console.log(`EVALUATION FAILED: ${e.message}`);
                loopState.status = 'failed_evaluation';
                break;
            }

            // ───── EXTRACT FEEDBACK AND ASK ORCHESTRATOR ─────
            loopState.status = 'reviewing';

            const actionItems = loopState.currentEvaluation.action_items || [];

            console.log(`[Orchestrator] deciding next step from critic feedback...`);
            try {
                loopState.currentFeedback = await decideFigureRefinement({
                    evaluation: loopState.currentEvaluation,
                    model: criticModel,
                    useFewShot: fewShot.orchestrator !== false,
                });
            } catch (e) {
                attempt.status = 'orchestrator_error';
                attempt.error = e.message;
                loopState.attempts.push(attempt);
                console.warn(`ORCHESTRATOR FAILED: ${e.message}`);
                loopState.status = 'failed_orchestration';
                break;
            }

            const geometry = loopState.currentEvaluation.geometry_accuracy || 0;
            const interactivity = loopState.currentEvaluation.interactivity_usability || 0;
            const faithfulness = loopState.currentEvaluation.faithfulness || 0;
            const labels = loopState.currentEvaluation.label_quality || 0;
            const concept = loopState.currentEvaluation.concept_accuracy || 0;
            const overall = loopState.currentEvaluation.overall_average || 0;

            loopState.currentFeedback = {
                ...loopState.currentFeedback,
                action_items: actionItems,
                actionItems,
                scores: { geometry, interactivity, faithfulness, labels, concept, overall },
            };

            console.log(`[Orchestrator] decision: ${loopState.currentFeedback.next_step}`);
            attempt.feedback = loopState.currentFeedback;

            console.log(`Feedback: ${loopState.currentFeedback.next_step}`, {
                overall: overall,
                actions: actionItems.length,
            });

            // ───── CHECK: PASS? ─────
            if (loopState.currentFeedback.next_step === 'pass') {
                attempt.status = 'passed';
                loopState.attempts.push(attempt);
                loopState.status = 'passed';
                console.log(`\n✓ PASSED on attempt ${attemptNum}/${maxAttempts}`);
                console.log(`Final score: ${loopState.currentEvaluation.overall_average}/5`);
                return loopState;
            }

            // ───── CHECK: MAX ATTEMPTS? ─────
            if (attemptNum >= maxAttempts) {
                attempt.status = 'max_attempts_reached';
                loopState.attempts.push(attempt);
                loopState.status = 'failed_max_attempts';
                console.log(`\n✗ Max attempts (${maxAttempts}) reached`);
                console.log(`Best score achieved: ${loopState.bestScore}/5 on attempt ${loopState.bestAttempt?.iteration || '?'}`);
                return loopState;
            }

            // ───── DECIDE & REFINE ─────
            console.log(`\nDeciding on refinement strategy: ${loopState.currentFeedback.next_step}`);

            if (loopState.currentFeedback.next_step === 'fix_plan') {
                console.log(`Refining plan...`);
                attempt.refinement_type = 'plan';

                try {
                    loopState.currentPlan = await withRetry(`refine-plan:${figureStem}:attempt${attemptNum}`, () => refinePlan(
                        loopState.currentPlan,
                        loopState.currentEvaluation,
                        loopState.currentFeedback,
                        figureStem,
                        plannerModel,
                        fewShot.planner !== false
                    ));
                    console.log(`Plan refined`);
                } catch (e) {
                    attempt.status = 'plan_refinement_error';
                    attempt.error = e.message;
                    loopState.attempts.push(attempt);
                    console.log(`PLAN REFINEMENT FAILED: ${e.message}`);
                    loopState.status = 'failed_plan_refinement';
                    break;
                }
            } else if (loopState.currentFeedback.next_step === 'refine_generation') {
                console.log(`Will refine generation on next iteration (using critic feedback)`);
                attempt.refinement_type = 'generation';
            }

            attempt.status = 'refined';
            loopState.attempts.push(attempt);
        }

        // ─────────────────────────────────────────────────────────────────────────
        // EXIT: Return best attempt as fallback
        // ─────────────────────────────────────────────────────────────────────────
        if (loopState.bestAttempt && loopState.status !== 'passed') {
            console.log(`\nReturning best attempt (${loopState.bestScore}/5)`);
            loopState.currentHtml = loopState.bestAttempt.html;
            loopState.currentEvaluation = loopState.bestAttempt.evaluation;
            loopState.currentFeedback = loopState.bestAttempt.feedback;
        }

        return loopState;

    } catch (e) {
        e.partialLoopState = loopState;
        throw e;
    } finally {
        loopState.generationDurationMs = Date.now() - _generationStart;
    }
}

/**
 * Format loop results for display.
 * Useful for logging or returning to user.
 */
function formatLoopResults(loopState) {
    const lines = [
        `Figure: ${loopState.figureStem}`,
        `Status: ${loopState.status}`,
        `Attempts: ${loopState.attempts.length}`,
        `Best Score: ${loopState.bestScore}/5`,
        '',
        `Attempt History:`,
    ];

    for (const attempt of loopState.attempts) {
        const iterStr = `  [${attempt.iteration}] ${attempt.step}`;
        if (attempt.evaluation) {
            lines.push(`${iterStr}: ${attempt.evaluation.overall_average}/5`);
        } else if (attempt.status === 'error') {
            lines.push(`${iterStr}: ERROR - ${attempt.error}`);
        } else {
            lines.push(`${iterStr}: ${attempt.status}`);
        }
    }

    if (loopState.currentFeedback) {
        lines.push('', 'Final Feedback:');
        lines.push(...(loopState.currentFeedback.actionItems || loopState.currentFeedback.action_items || []).map(a => `  ${a}`));
    }

    return lines.join('\n');
}

const _ALL_SCORE_KEYS = ['geometry_accuracy', 'interactivity_usability', 'faithfulness', 'label_quality', 'concept_accuracy'];
const _GEO_KEYS = ['geometry_accuracy', 'faithfulness', 'label_quality'];

function withCriticActionItems(feedback, evaluation) {
    const actionItems = evaluation?.action_items || [];
    return {
        ...(feedback || {}),
        action_items: actionItems,
        actionItems,
    };
}

function mergePhaseEvaluations(geoEval, contentEval) {
    const merged = { ...(geoEval || {}), ...(contentEval || {}) };
    const presentKeys = _ALL_SCORE_KEYS.filter(k => merged[k] !== undefined && merged[k] !== null);
    if (presentKeys.length > 0) {
        merged.overall_average = Math.round(
            (presentKeys.reduce((s, k) => s + merged[k], 0) / presentKeys.length) * 10
        ) / 10;
    }
    if (_GEO_KEYS.every(k => merged[k] !== undefined)) {
        merged.visual_aesthetics = Math.round(
            ((merged.geometry_accuracy + merged.faithfulness + merged.label_quality) / 3) * 10
        ) / 10;
    }
    merged.action_items = [...new Set([...(geoEval?.action_items || []), ...(contentEval?.action_items || [])])];
    return merged;
}

async function runTwoPhaseLoop(opts) {
    const {
        figureStem,
        chapterName,
        imageData,
        scaffold,
        sourceBase64,
        sourceMediaType = 'image/png',
        maxGeometryAttempts = 3,
        maxContentAttempts = 3,
        plannerModel = 'gpt-4o',
        generatorModel = 'gpt-4o',
        criticModel = 'claude-opus-4.7',
        fewShot = { planner: true, critic: true, orchestrator: true },
        resumeFrom = null,
    } = opts;

    if (!figureStem) throw new Error('figureStem is required');
    if (!scaffold) throw new Error('scaffold is required');
    if (!imageData?.base64 || !imageData?.mediaType) throw new Error('imageData.base64 and imageData.mediaType are required');
    if (!sourceBase64) throw new Error('sourceBase64 (original figure image) is required');

    const loopState = {
        figureStem,
        chapterName: chapterName || null,
        status: 'phase1_geometry',
        geometryPlan: null,
        currentPlan: null,
        currentHtml: null,
        currentEvaluation: null,
        currentFeedback: null,
        attempts: [],
        bestAttempt: null,
        bestScore: 0,
        approvedGeometryHtml: null,
        phase1Status: null,
        phase2Status: 'not_reached',
    };

    const _generationStart = Date.now();
    loopState.generationStartedAt = new Date(_generationStart).toISOString();

    try {

        // ─────────────────────────────────────────────────────────────────────────
        // GEOMETRY PLANNING: lightweight elements + camera plan before Phase 1
        // ─────────────────────────────────────────────────────────────────────────
        if (!resumeFrom?.approvedGeometryHtml) {
            loopState.status = 'geometry_planning';
            try {
                loopState.geometryPlan = await withRetry(`geo-plan:${figureStem}`, () =>
                    planGeometry(figureStem, chapterName, imageData, plannerModel, fewShot.planner !== false)
                );
                console.log(`[TwoPhase] Geometry plan created`, { elements: loopState.geometryPlan.interactionPlan?.elements?.length || 0 });
            } catch (e) {
                console.warn(`[TwoPhase] Geometry planning failed, proceeding without plan: ${e.message}`);
                loopState.geometryPlan = null;
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // PHASE 1: GEOMETRY LOOP (skipped if resumeFrom supplies approved geometry)
        // ─────────────────────────────────────────────────────────────────────────
        let lastGeometryHtml = null;
        let lastGeometryEval = resumeFrom?.lastGeometryEval || null;
        let bestGeometryHtml = null;
        let bestGeometryEval = null;
        let bestGeometryScore = 0;

        if (resumeFrom?.approvedGeometryHtml) {
            loopState.approvedGeometryHtml = resumeFrom.approvedGeometryHtml;
            loopState.phase1Status = resumeFrom.phase1Status || 'passed';
            console.log(`[TwoPhase] Phase 1 skipped — resuming with approved geometry from previous run`);
        } else {
            console.log(`[TwoPhase] Phase 1 starting for ${figureStem}`);
            for (let geoAttempt = 1; geoAttempt <= maxGeometryAttempts; geoAttempt++) {
                const attempt = {
                    iteration: geoAttempt,
                    phase: 'geometry',
                    step: 'generate',
                    html: null,
                    evaluation: null,
                    feedback: null,
                    status: 'in-progress',
                };

                try {
                    // GENERATE
                    loopState.status = 'phase1_generating';
                    console.log(`[TwoPhase] Phase 1 attempt ${geoAttempt}/${maxGeometryAttempts}: generating geometry...`);

                    let currentHtml;
                    if (geoAttempt === 1 || !lastGeometryHtml || !lastGeometryEval) {
                        currentHtml = await withRetry(`geo-generate:${figureStem}:${geoAttempt}`, () => generateGeometryHtml({
                            scaffold,
                            plan: loopState.geometryPlan,
                            modelId: generatorModel,
                            mediaType: imageData.mediaType,
                            base64: imageData.base64,
                        }));
                    } else {
                        currentHtml = await withRetry(`geo-refine:${figureStem}:${geoAttempt}`, () => generateRefinedGeometryHtml({
                            scaffold,
                            plan: loopState.geometryPlan,
                            prevHtml: lastGeometryHtml,
                            evaluation: lastGeometryEval,
                            modelId: generatorModel,
                            mediaType: imageData.mediaType,
                            base64: imageData.base64,
                        }));
                    }
                    attempt.html = currentHtml;
                    lastGeometryHtml = currentHtml;

                    // CRITIQUE
                    loopState.status = 'phase1_critiquing';
                    console.log(`[TwoPhase] Phase 1 attempt ${geoAttempt}: critiquing geometry...`);
                    const geoEval = await withRetry(`geo-critic:${figureStem}:${geoAttempt}`, () => evaluateHtmlWithCritic({
                        html: currentHtml,
                        evalImage: sourceBase64,
                        evalMediaType: sourceMediaType,
                        model: criticModel,
                        rubrics: GEOMETRY_PHASE_RUBRICS,
                        useFewShot: fewShot.critic !== false,
                    }));
                    attempt.evaluation = geoEval;
                    lastGeometryEval = geoEval;

                    console.log(`[TwoPhase] Phase 1 scores: geo=${geoEval.geometry_accuracy} faith=${geoEval.faithfulness} labels=${geoEval.label_quality} avg=${geoEval.overall_average}`);

                    if (geoEval.overall_average >= bestGeometryScore) {
                        bestGeometryScore = geoEval.overall_average;
                        bestGeometryHtml = currentHtml;
                        bestGeometryEval = geoEval;
                    }

                    // ORCHESTRATE
                    loopState.status = 'phase1_reviewing';
                    const geoDecision = await decideFigureRefinement({
                        evaluation: geoEval,
                        model: criticModel,
                        allowedNextSteps: ['pass', 'refine_generation'],
                        mode: 'geometry',
                        useFewShot: fewShot.orchestrator !== false,
                    });
                    const geoFeedback = withCriticActionItems(geoDecision, geoEval);
                    attempt.feedback = geoFeedback;

                    console.log(`[TwoPhase] Phase 1 orchestrator: ${geoFeedback.next_step}`);

                    if (geoFeedback.next_step === 'pass') {
                        loopState.approvedGeometryHtml = currentHtml;
                        loopState.phase1Status = 'passed';
                        attempt.status = 'passed';
                        loopState.attempts.push(attempt);
                        console.log(`[TwoPhase] Phase 1 PASSED on attempt ${geoAttempt}`);
                        break;
                    }

                    if (geoAttempt >= maxGeometryAttempts) {
                        loopState.phase1Status = 'failed_max_attempts';
                        attempt.status = 'max_attempts_reached';
                        loopState.attempts.push(attempt);
                        console.log(`[TwoPhase] Phase 1 max attempts reached`);
                        break;
                    }

                    attempt.status = 'refined';
                    attempt.refinement_type = 'generation';
                    loopState.attempts.push(attempt);

                } catch (e) {
                    console.warn(`[TwoPhase] Phase 1 attempt ${geoAttempt} error: ${e.message}`);
                    attempt.status = 'error';
                    attempt.error = e.message;
                    loopState.attempts.push(attempt);
                    if (geoAttempt >= maxGeometryAttempts) {
                        loopState.phase1Status = 'failed_max_attempts';
                    }
                }
            }

            // Fallback: use best geometry if no attempt passed
            if (!loopState.approvedGeometryHtml) {
                loopState.approvedGeometryHtml = bestGeometryHtml;
                lastGeometryEval = bestGeometryEval || lastGeometryEval;
                if (loopState.phase1Status !== 'failed_max_attempts') {
                    loopState.phase1Status = 'best_attempt_used';
                }
                console.warn(`[TwoPhase] Phase 1 did not pass; using best attempt (score: ${bestGeometryScore}/5) for Phase 2`);
            }

            if (!loopState.approvedGeometryHtml) {
                loopState.status = 'failed_geometry';
                console.log(`[TwoPhase] Phase 1 produced no usable output — aborting`);
                return loopState;
            }
        } // end Phase 1 skip else

        // ─────────────────────────────────────────────────────────────────────────
        // PLANNING (between phases; skipped if resumeFrom supplies a plan)
        // ─────────────────────────────────────────────────────────────────────────
        if (resumeFrom?.currentPlan) {
            loopState.currentPlan = resumeFrom.currentPlan;
            console.log(`[TwoPhase] Planning skipped — resuming with existing plan`);
        } else {
            console.log(`[TwoPhase] Planning for ${figureStem}...`);
            loopState.status = 'planning';

            try {
                loopState.currentPlan = await withRetry(`plan:${figureStem}`, () =>
                    planForFigure(figureStem, chapterName, imageData, plannerModel, fewShot.planner !== false)
                );
                console.log(`[TwoPhase] Plan created`, { elements: loopState.currentPlan.interactionPlan?.elements?.length || 0 });
            } catch (e) {
                loopState.status = 'failed_planning';
                loopState.attempts.push({ phase: 'content', step: 'plan', status: 'error', error: e.message });
                loopState.currentHtml = loopState.approvedGeometryHtml;
                loopState.currentEvaluation = lastGeometryEval;
                console.log(`[TwoPhase] Planning FAILED: ${e.message}`);
                return loopState;
            }
        }

        // ─────────────────────────────────────────────────────────────────────────
        // PHASE 2: CONTENT LOOP
        // ─────────────────────────────────────────────────────────────────────────
        console.log(`[TwoPhase] Phase 2 starting for ${figureStem}`);
        loopState.phase2Status = 'in_progress';
        let lastContentHtml = null;
        let lastContentEval = null;
        let bestContentHtml = null;
        let bestContentScore = 0;

        for (let contentAttempt = 1; contentAttempt <= maxContentAttempts; contentAttempt++) {
            const attempt = {
                iteration: contentAttempt,
                phase: 'content',
                step: 'generate',
                plan: loopState.currentPlan,
                html: null,
                evaluation: null,
                feedback: null,
                status: 'in-progress',
            };

            try {
                // GENERATE
                loopState.status = 'phase2_generating';
                console.log(`[TwoPhase] Phase 2 attempt ${contentAttempt}/${maxContentAttempts}: generating content layer...`);

                let currentHtml;
                if (contentAttempt === 1 || !lastContentHtml || !lastContentEval) {
                    currentHtml = await withRetry(`content-generate:${figureStem}:${contentAttempt}`, () => generateContentLayerHtml({
                        scaffold,
                        approvedGeometryHtml: loopState.approvedGeometryHtml,
                        plan: loopState.currentPlan,
                        geoEvaluation: lastGeometryEval,
                        modelId: generatorModel,
                        mediaType: imageData.mediaType,
                        base64: imageData.base64,
                    }));
                } else {
                    currentHtml = await withRetry(`content-refine:${figureStem}:${contentAttempt}`, () => generateRefinedContentLayerHtml({
                        scaffold,
                        approvedGeometryHtml: loopState.approvedGeometryHtml,
                        plan: loopState.currentPlan,
                        prevHtml: lastContentHtml,
                        evaluation: lastContentEval,
                        modelId: generatorModel,
                        mediaType: imageData.mediaType,
                        base64: imageData.base64,
                    }));
                }
                attempt.html = currentHtml;
                lastContentHtml = currentHtml;

                // CRITIQUE
                loopState.status = 'phase2_critiquing';
                console.log(`[TwoPhase] Phase 2 attempt ${contentAttempt}: critiquing content...`);
                const contentEval = await withRetry(`content-critic:${figureStem}:${contentAttempt}`, () => evaluateHtmlWithCritic({
                    html: currentHtml,
                    evalImage: sourceBase64,
                    evalMediaType: sourceMediaType,
                    plan: loopState.currentPlan,
                    chapterName: loopState.chapterName,
                    model: criticModel,
                    rubrics: CONTENT_PHASE_RUBRICS,
                    useFewShot: fewShot.critic !== false,
                }));
                attempt.evaluation = contentEval;
                lastContentEval = contentEval;

                console.log(`[TwoPhase] Phase 2 scores: interactivity=${contentEval.interactivity_usability} concept=${contentEval.concept_accuracy} avg=${contentEval.overall_average}`);

                if (contentEval.overall_average > bestContentScore) {
                    bestContentScore = contentEval.overall_average;
                    bestContentHtml = currentHtml;
                    loopState.bestScore = bestContentScore;
                    loopState.bestAttempt = { ...attempt };
                }

                // ORCHESTRATE
                loopState.status = 'phase2_reviewing';
                const contentDecision = await decideFigureRefinement({
                    evaluation: contentEval,
                    model: criticModel,
                    allowedNextSteps: ['pass', 'fix_plan', 'refine_generation'],
                    mode: 'content',
                    useFewShot: fewShot.orchestrator !== false,
                });
                const contentFeedback = withCriticActionItems(contentDecision, contentEval);
                attempt.feedback = contentFeedback;
                loopState.currentFeedback = contentFeedback;

                console.log(`[TwoPhase] Phase 2 orchestrator: ${contentFeedback.next_step}`);

                if (contentFeedback.next_step === 'pass') {
                    loopState.phase2Status = 'passed';
                    loopState.status = 'passed';
                    attempt.status = 'passed';
                    loopState.attempts.push(attempt);
                    console.log(`[TwoPhase] Phase 2 PASSED on attempt ${contentAttempt}`);
                    break;
                }

                if (contentAttempt >= maxContentAttempts) {
                    loopState.phase2Status = 'failed_max_attempts';
                    loopState.status = 'failed_max_attempts';
                    attempt.status = 'max_attempts_reached';
                    loopState.attempts.push(attempt);
                    console.log(`[TwoPhase] Phase 2 max attempts reached`);
                    break;
                }

                if (contentFeedback.next_step === 'fix_plan') {
                    console.log(`[TwoPhase] Refining plan...`);
                    try {
                        loopState.currentPlan = await withRetry(`refine-plan:${figureStem}:${contentAttempt}`, () => refinePlan(
                            loopState.currentPlan,
                            contentEval,
                            contentFeedback,
                            figureStem,
                            plannerModel,
                            fewShot.planner !== false
                        ));
                        attempt.refinement_type = 'plan';
                        console.log(`[TwoPhase] Plan refined`);
                    } catch (e) {
                        console.warn(`[TwoPhase] Plan refinement failed: ${e.message} — falling back to refine_generation`);
                        attempt.refinement_type = 'generation';
                    }
                } else {
                    attempt.refinement_type = 'generation';
                }

                attempt.status = 'refined';
                loopState.attempts.push(attempt);

            } catch (e) {
                console.warn(`[TwoPhase] Phase 2 attempt ${contentAttempt} error: ${e.message}`);
                attempt.status = 'error';
                attempt.error = e.message;
                loopState.attempts.push(attempt);
                if (contentAttempt >= maxContentAttempts) {
                    loopState.phase2Status = 'failed_max_attempts';
                    loopState.status = 'failed_max_attempts';
                }
            }
        }

        // Final state assembly — keep phase evaluations split; use Phase 2 as primary
        loopState.currentHtml = bestContentHtml || loopState.approvedGeometryHtml;
        loopState.phase1Evaluation = lastGeometryEval || null;
        loopState.phase2Evaluation = lastContentEval || null;
        loopState.currentEvaluation = lastContentEval || lastGeometryEval || null;

        return loopState;

    } catch (e) {
        e.partialLoopState = loopState;
        throw e;
    } finally {
        loopState.generationDurationMs = Date.now() - _generationStart;
    }
}

module.exports = {
    runFigureLoop,
    runTwoPhaseLoop,
    formatLoopResults,
};
