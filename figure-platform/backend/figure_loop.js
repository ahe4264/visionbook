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

const { planForFigure, refinePlan } = require('./planner');
const { generateCode } = require('./generation');
const { evaluateHtmlWithCritic } = require('./critic');
const { decideFigureRefinement } = require('./orchestrator');
const { verifyFigure, DEFAULT_VIEWPORTS } = require('./verify');

// Deterministic verification runs before the (expensive, stochastic) critic. Set
// VERIFY_GATE=off to disable and fall back to critic-only behaviour.
const VERIFY_GATE = process.env.VERIFY_GATE !== 'off';

/**
 * Turn a failed verification report into an evaluation-shaped object so the existing
 * refinement plumbing (single-shot refine + agent summarizeEvaluation) can consume it,
 * without ever calling the LLM critic on a mechanically-broken figure.
 */
function buildVerificationEvaluation(report) {
  const actionItems = report.errors.map(e => `[${e.id}] ${e.message}`);
  return {
    geometry_accuracy: 1,
    interactivity_usability: 1,
    faithfulness: 1,
    label_quality: 1,
    concept_accuracy: 1,
    overall_average: 1,
    visual_aesthetics: 1,
    failure_modes: [...new Set(report.errors.map(e => e.id))],
    discrepancies: [],
    notes: 'Automated verification failed before quality review — fix these mechanical/layout errors first.',
    action_items: actionItems,
    verification: { ok: false, errors: report.errors, warnings: report.warnings },
    source: 'verifier',
  };
}

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
        seedHtml = null,
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
    loopState.timings = { planMs: 0, attempts: [] };
    const fmt = ms => `${(ms / 1000).toFixed(1)}s`;

    try {

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: INITIAL PLAN
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`Starting loop for ${figureStem}`);
    loopState.status = 'planning';

    try {
        const _planStart = Date.now();
        loopState.currentPlan = await withRetry(`plan:${figureStem}`, () =>
            planForFigure(figureStem, chapterName, imageData, plannerModel, fewShot.planner !== false)
        );
        loopState.timings.planMs = Date.now() - _planStart;
        console.log(`[timing] PLAN ${figureStem}: ${fmt(loopState.timings.planMs)}`);
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

    if (seedHtml) {
        const seedAttempt = {
            iteration: 0,
            step: 'seed_critic',
            plan: loopState.currentPlan,
            html: seedHtml,
            evaluation: null,
            feedback: null,
            status: 'seeded',
            timings: { generateMs: 0, verifyMs: 0, critiqueMs: 0, decideMs: 0 },
        };

        console.log(`[Seed] Evaluating existing HTML before refinement...`);
        let seedScreenshot = null;
        let seedMediaType = 'image/jpeg';
        if (VERIFY_GATE) {
            try {
                const _seedVerStart = Date.now();
                const seedReport = await verifyFigure(seedHtml, { viewports: DEFAULT_VIEWPORTS });
                seedAttempt.timings.verifyMs = Date.now() - _seedVerStart;
                seedAttempt.verification = { ok: seedReport.ok, errors: seedReport.errors, warnings: seedReport.warnings };
                seedScreenshot = seedReport.screenshot;
                seedMediaType = seedReport.mediaType || 'image/jpeg';
                console.log(`[timing] VERIFY ${figureStem} seed: ${fmt(seedAttempt.timings.verifyMs)}`);
                console.log(`[Seed] Verification: ${seedReport.ok ? 'PASS' : 'FAIL'} (errors=${seedReport.errors.length}, warnings=${seedReport.warnings.length})`);
                if (!seedReport.ok) {
                    seedAttempt.evaluation = buildVerificationEvaluation(seedReport);
                }
            } catch (e) {
                console.warn(`[Seed] Verification threw (${e.message}); proceeding to critic.`);
            }
        }

        if (!seedAttempt.evaluation) {
            const _seedCritStart = Date.now();
            seedAttempt.evaluation = await withRetry(`critic:${figureStem}:seed`, () => evaluateHtmlWithCritic({
                html: seedHtml,
                evalImage: sourceBase64,
                evalMediaType: sourceMediaType,
                model: criticModel,
                useFewShot: fewShot.critic !== false,
                renderedScreenshot: seedScreenshot,
                renderedMediaType: seedMediaType,
            }));
            seedAttempt.timings.critiqueMs = Date.now() - _seedCritStart;
            console.log(`[timing] CRITIC ${figureStem} seed: ${fmt(seedAttempt.timings.critiqueMs)}`);
            console.log(`[Seed] Critic scores`, {
                overall: seedAttempt.evaluation.overall_average,
                failures: (seedAttempt.evaluation.failure_modes || []).length,
            });
        }

        const _seedDecideStart = Date.now();
        seedAttempt.feedback = await decideFigureRefinement({
            evaluation: seedAttempt.evaluation,
            model: criticModel,
            useFewShot: fewShot.orchestrator !== false,
        });
        seedAttempt.timings.decideMs = Date.now() - _seedDecideStart;
        console.log(`[timing] ORCHESTRATOR ${figureStem} seed: ${fmt(seedAttempt.timings.decideMs)}`);
        console.log(`[Seed] Feedback: ${seedAttempt.feedback.next_step}`, {
            overall: seedAttempt.evaluation.overall_average,
            actions: (seedAttempt.evaluation.action_items || []).length,
        });

        loopState.currentHtml = seedHtml;
        loopState.currentEvaluation = seedAttempt.evaluation;
        loopState.currentFeedback = seedAttempt.feedback;
        loopState.bestAttempt = { ...seedAttempt };
        loopState.bestScore = seedAttempt.evaluation.overall_average || 0;
        loopState.attempts.push(seedAttempt);
        loopState.timings.attempts.push({ iteration: 0, ...seedAttempt.timings });

        if (seedAttempt.feedback.next_step === 'pass') {
            loopState.status = 'passed';
            console.log(`\n✓ EXISTING HTML PASSED without regeneration`);
            return loopState;
        }
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
            timings: { generateMs: 0, critiqueMs: 0, decideMs: 0 },
        };

        // ───── GENERATE ─────
        console.log(`[Attempt ${attemptNum}/${maxAttempts}] Generating...`);
        loopState.status = 'generating';
        attempt.step = 'generate';

        try {
            const _genStart = Date.now();
            const previousAttempt = loopState.attempts[loopState.attempts.length - 1] || null;
            loopState.currentHtml = await withRetry(`generate:${figureStem}:attempt${attemptNum}`, () => generateCode({
                scaffold,
                plan: loopState.currentPlan,
                prevHtml: previousAttempt?.html || null,
                evaluation: previousAttempt?.evaluation || null,
                modelId: generatorModel,
                mediaType: imageData.mediaType,
                base64: imageData.base64,
                figureLabel: `${figureStem}:attempt${attemptNum}`,
            }));
            attempt.timings.generateMs = Date.now() - _genStart;
            attempt.html = loopState.currentHtml;
            // Attach the agent timeline for this attempt if the agentic generator ran.
            try {
                const { generateCodeAgent } = require('./generation-agent');
                if (generateCodeAgent.lastRun && generateCodeAgent.lastRun.label === `${figureStem}:attempt${attemptNum}`) {
                    attempt.agentRun = generateCodeAgent.lastRun;
                }
            } catch { /* agent module optional */ }
            console.log(`[timing] GENERATE ${figureStem} attempt ${attemptNum}: ${fmt(attempt.timings.generateMs)}${attempt.agentRun ? ` (agent: ${attempt.agentRun.turns} turns, ${attempt.agentRun.renders} renders, clean=${attempt.agentRun.clean})` : ''}`);
            console.log(`Generated HTML (${loopState.currentHtml.length} chars)`);
        } catch (e) {
            attempt.status = 'error';
            attempt.error = e.message;
            loopState.attempts.push(attempt);
            console.log(`GENERATION FAILED: ${e.message}`);
            loopState.status = 'failed_generation';
            break;
        }

        // ───── VERIFY (cheap, deterministic gate before the expensive critic) ─────
        // The critic is a stochastic quality judge; it should never be spent on a figure
        // that is mechanically broken (throws, blank, off-screen controls, overflow, NaN).
        // We verify first and, on failure, skip straight to regeneration with concrete
        // check-level feedback — cheaper and far more actionable than a fuzzy critic score.
        let verifyScreenshot = null;
        let verifyMediaType = 'image/jpeg';
        if (VERIFY_GATE) {
            loopState.status = 'verifying';
            let report;
            try {
                const _verStart = Date.now();
                report = await verifyFigure(loopState.currentHtml, { viewports: DEFAULT_VIEWPORTS });
                attempt.timings.verifyMs = Date.now() - _verStart;
                attempt.verification = { ok: report.ok, errors: report.errors, warnings: report.warnings };
                verifyScreenshot = report.screenshot;
                verifyMediaType = report.mediaType || 'image/jpeg';
                console.log(`[timing] VERIFY ${figureStem} attempt ${attemptNum}: ${fmt(attempt.timings.verifyMs)}`);
                console.log(`Verification: ${report.ok ? 'PASS' : 'FAIL'} (errors=${report.errors.length}, warnings=${report.warnings.length})`);
            } catch (e) {
                // Fail OPEN: a verifier crash must not block a possibly-good figure.
                console.warn(`Verification threw (${e.message}); proceeding to critic.`);
                report = { ok: true, errors: [], warnings: [] };
            }

            if (!report.ok) {
                const evaluation = buildVerificationEvaluation(report);
                loopState.currentEvaluation = evaluation;
                attempt.evaluation = evaluation;
                const actionItems = evaluation.action_items;
                loopState.currentFeedback = {
                    next_step: 'refine_generation',
                    reasoning: 'Automated verification failed; fixing mechanical/layout errors before quality review.',
                    action_items: actionItems,
                    actionItems,
                    scores: { overall: evaluation.overall_average },
                    source: 'verifier',
                };
                attempt.feedback = loopState.currentFeedback;
                attempt.refinement_type = 'generation';
                loopState.timings.attempts.push({ iteration: attemptNum, ...attempt.timings });
                // Keep *something* returnable if every attempt fails verification.
                if (!loopState.bestAttempt) { loopState.bestAttempt = { ...attempt }; loopState.bestScore = evaluation.overall_average; }

                console.log(`✗ Skipping critic — verification failed with ${report.errors.length} error(s): ${[...new Set(report.errors.map(e => e.id))].join(', ')}`);

                if (attemptNum >= maxAttempts) {
                    attempt.status = 'max_attempts_reached';
                    loopState.attempts.push(attempt);
                    loopState.status = 'failed_verification';
                    console.log(`\n✗ Max attempts (${maxAttempts}) reached (last attempt failed verification)`);
                    return loopState;
                }
                attempt.status = 'verify_failed';
                loopState.attempts.push(attempt);
                continue; // regenerate with verification feedback
            }
        }

        // ───── CRITIQUE ─────
        console.log(`Evaluating...`);
        loopState.status = 'critiquing';

        try {
            const _critStart = Date.now();
            loopState.currentEvaluation = await withRetry(`critic:${figureStem}:attempt${attemptNum}`, () => evaluateHtmlWithCritic({
                html: loopState.currentHtml,
                evalImage: sourceBase64,
                evalMediaType: sourceMediaType,
                model: criticModel,
                useFewShot: fewShot.critic !== false,
                // Reuse the verifier's screenshot so we don't render the figure twice.
                renderedScreenshot: verifyScreenshot,
                renderedMediaType: verifyMediaType,
            }));
            attempt.timings.critiqueMs = Date.now() - _critStart;
            attempt.evaluation = loopState.currentEvaluation;
            console.log(`[timing] CRITIC ${figureStem} attempt ${attemptNum}: ${fmt(attempt.timings.critiqueMs)}`);

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
        const _decideStart = Date.now();
        loopState.currentFeedback = await decideFigureRefinement({
            evaluation: loopState.currentEvaluation,
            model: criticModel,
            useFewShot: fewShot.orchestrator !== false,
        });
        attempt.timings.decideMs = Date.now() - _decideStart;
        console.log(`[timing] ORCHESTRATOR ${figureStem} attempt ${attemptNum}: ${fmt(attempt.timings.decideMs)}`);
        loopState.timings.attempts.push({ iteration: attemptNum, ...attempt.timings });

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

    } finally {
        loopState.generationDurationMs = Date.now() - _generationStart;

        // ── Full timing breakdown (plan / generate / critic / decide per attempt) ──
        try {
            const t = loopState.timings || { planMs: 0, attempts: [] };
            const totGen = (t.attempts || []).reduce((n, a) => n + (a.generateMs || 0), 0);
            const totVer = (t.attempts || []).reduce((n, a) => n + (a.verifyMs || 0), 0);
            const totCrit = (t.attempts || []).reduce((n, a) => n + (a.critiqueMs || 0), 0);
            const totDec = (t.attempts || []).reduce((n, a) => n + (a.decideMs || 0), 0);
            console.log(`\n[timing] ═══════ ${loopState.figureStem} TIMING SUMMARY ═══════`);
            console.log(`[timing]   plan:        ${fmt(t.planMs || 0)}`);
            for (const a of (t.attempts || [])) {
                console.log(`[timing]   attempt ${a.iteration}: generate=${fmt(a.generateMs)} verify=${fmt(a.verifyMs || 0)} critic=${fmt(a.critiqueMs)} decide=${fmt(a.decideMs)}`);
            }
            console.log(`[timing]   totals:      generate=${fmt(totGen)} verify=${fmt(totVer)} critic=${fmt(totCrit)} decide=${fmt(totDec)}`);
            console.log(`[timing]   TOTAL LOOP:  ${fmt(loopState.generationDurationMs)}`);
            console.log(`[timing] ══════════════════════════════════════════════════\n`);
        } catch { /* never let logging break the loop */ }
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

module.exports = {
    runFigureLoop,
    formatLoopResults,
};
