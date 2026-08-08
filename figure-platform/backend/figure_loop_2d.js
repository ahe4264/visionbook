/**
 * figure_loop_2d.js — plan → generate → verify → critique → orchestrate loop for
 * the 2D track (SVG.js / Chart.js / Mermaid).
 *
 * Mirrors figure_loop.js step for step, against the 2D components:
 *   planner-2d.js → generation-2d.js (scaffold path) → verify-2d.js → critic.js
 *   (mode:'2d') → orchestrator.js (mode:'2d')
 *
 * The returned loopState has the SAME shape as the 3D loop's — same keys, same
 * status vocabulary, same attempts[] entries, same timings — because
 * upsertAttempts() and the frontend attempts viewer consume it unchanged.
 *
 * Kept separate from figure_loop.js rather than generalised: the two tracks
 * differ in more than function identity (plan envelope vs raw blueprint, self-owned
 * scaffold, different refinePlan signatures, different viewports), and the 3D loop
 * is the hot path behind every existing score — a shared strategy object would
 * rewrite it for no 3D benefit.
 */

const { plan2dFigure, refinePlan2d, PLANNER_2D_MODEL } = require('./planner-2d');
const { generate2dCode, buildNoPlannerUser2dMessage } = require('./generation-2d');
const { evaluateHtmlWithCritic } = require('./critic');
const { decideFigureRefinement } = require('./orchestrator');
const { verify2dHtml, DEFAULT_2D_VIEWPORTS } = require('./verify-2d');
const { mergeVerificationIntoEvaluation } = require('./loop_helpers');

// Deterministic verification runs before the (expensive, stochastic) critic. Set
// VERIFY_GATE=off to disable and fall back to critic-only behaviour.
const VERIFY_GATE = process.env.VERIFY_GATE !== 'off';

/**
 * plan2dFigure never throws — on a JSON parse failure it returns a stub blueprint.
 * A try/catch is therefore not enough to detect planning failure; without this
 * guard the loop would burn all its attempts generating from an empty plan.
 */
function isStubPlan(plan) {
    return Boolean(
        plan &&
        plan.raw &&
        !(plan.elements || []).length &&
        !(plan.interactions || []).length
    );
}

/**
 * Main 2D loop orchestrator. Returns a full audit trail of all iterations.
 *
 * @param {object} opts
 * @param {string} opts.figureStem - e.g. "brdf"
 * @param {string} opts.chapterName - e.g. "imaging"
 * @param {object} opts.imageData - { base64, mediaType }
 * @param {string} opts.sourceBase64 - original figure image (for critic)
 * @param {string} [opts.sourceMediaType='image/png']
 * @param {number} [opts.maxAttempts=3] - max iterations before giving up
 * @param {string} [opts.plannerModel='gemini-3.5-flash']
 * @param {string} [opts.generatorModel='gpt-4o']
 * @param {string} [opts.criticModel='claude-opus-4.7']
 * @returns {object} - complete loop state and results
 */
async function runFigureLoop2d(opts) {
    const {
        figureStem,
        chapterName,
        imageData,
        sourceBase64,
        sourceMediaType = 'image/png',
        maxAttempts = 3,
        plannerModel = PLANNER_2D_MODEL,
        generatorModel = 'gpt-4o',
        criticModel = 'claude-opus-4.7',
        fewShot = { planner: true, critic: true, orchestrator: true },
        plannerOptions = {},
        noPlanner = false,
    } = opts;

    if (!figureStem) throw new Error('figureStem is required');
    if (!imageData?.base64 || !imageData?.mediaType) throw new Error('imageData.base64 and imageData.mediaType are required');
    if (!sourceBase64) throw new Error('sourceBase64 (original figure image) is required');

    const loopState = {
        figureStem,
        chapterName: chapterName || null,
        status: 'planning',                    // planning | generating | critiquing | reviewing | passed | failed_max_attempts | failed_unrecoverable
        currentPlan: null,
        currentHtml: null,
        currentEvaluation: null,
        currentFeedback: null,
        currentScreenshot: null,               // verifier screenshot, reused by the server
        currentScreenshotMediaType: 'image/jpeg',
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
    console.log(`Starting 2D loop for ${figureStem}`);
    loopState.status = 'planning';

    // NO-PLANNER ABLATION — see the matching block in figure_loop.js. With no
    // blueprint there is also no figureType to route the library from, so
    // generation-2d.js offers all three libraries and lets the generator pick.
    const noPlannerUserText = noPlanner ? buildNoPlannerUser2dMessage(plannerOptions) : null;

    if (noPlanner) {
        console.log(`[no-planner] ${figureStem}: planning stage skipped; briefing the generator directly`);
    } else {
        try {
            const _planStart = Date.now();
            // Raw blueprint (not an envelope) — this is what generate2dCode expects.
            loopState.currentPlan = await plan2dFigure(
                figureStem,
                chapterName,
                imageData.base64,
                imageData.mediaType,
                plannerModel,
                fewShot.planner !== false,
                plannerOptions
            );
            if (isStubPlan(loopState.currentPlan)) {
                throw new Error('planner returned an unparseable stub blueprint (no elements, no interactions)');
            }
            loopState.timings.planMs = Date.now() - _planStart;
            console.log(`[timing] PLAN ${figureStem}: ${fmt(loopState.timings.planMs)}`);
            console.log(`Plan created`, {
                figureType: loopState.currentPlan.figureType,
                elements: (loopState.currentPlan.elements || []).length,
                interactions: (loopState.currentPlan.interactions || []).length,
            });
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
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN LOOP: GENERATE → VERIFY → CRITIQUE → REVIEW → DECIDE
    // ─────────────────────────────────────────────────────────────────────────
    let prevVerifyScreenshot = null;
    let prevVerifyScreenshotMediaType = 'image/jpeg';

    for (let attemptNum = 1; attemptNum <= maxAttempts; attemptNum++) {
        const attempt = {
            iteration: attemptNum,
            step: null,
            plan: loopState.currentPlan,
            html: null,
            evaluation: null,
            feedback: null,
            status: 'in-progress',
            timings: { generateMs: 0, verifyMs: 0, critiqueMs: 0, decideMs: 0 },
        };

        // ───── GENERATE ─────
        console.log(`[Attempt ${attemptNum}/${maxAttempts}] Generating...`);
        loopState.status = 'generating';
        attempt.step = 'generate';

        try {
            const _genStart = Date.now();
            // Passing the previous attempt's html+evaluation is what routes
            // generate2dCode to its refinement path.
            const previousAttempt = loopState.attempts[loopState.attempts.length - 1] || null;
            loopState.currentHtml = await generate2dCode({
                plan: loopState.currentPlan,
                noPlanner,
                userText: noPlannerUserText || undefined,
                prevHtml: previousAttempt?.html || null,
                evaluation: previousAttempt?.evaluation || null,
                prevScreenshot: previousAttempt ? prevVerifyScreenshot : null,
                prevScreenshotMediaType: prevVerifyScreenshotMediaType,
                modelId: generatorModel,
                mediaType: imageData.mediaType,
                base64: imageData.base64,
            });
            attempt.timings.generateMs = Date.now() - _genStart;
            attempt.html = loopState.currentHtml;
            console.log(`[timing] GENERATE ${figureStem} attempt ${attemptNum}: ${fmt(attempt.timings.generateMs)}`);
            console.log(`Generated HTML (${loopState.currentHtml.length} chars)`);
        } catch (e) {
            attempt.status = 'error';
            attempt.error = e.message;
            loopState.attempts.push(attempt);
            console.log(`GENERATION FAILED: ${e.message}`);
            loopState.status = 'failed_generation';
            break;
        }

        // ───── VERIFY (rendered, deterministic; screenshot reused by critic below;
        // no longer gates whether critic runs — see design doc 2026-07-29) ─────
        let verifyScreenshot = null;
        let verifyMediaType = 'image/jpeg';
        let report = { ok: true, errors: [], warnings: [] };
        if (VERIFY_GATE) {
            loopState.status = 'verifying';
            try {
                const _verStart = Date.now();
                report = await verify2dHtml(loopState.currentHtml, { viewports: DEFAULT_2D_VIEWPORTS });
                attempt.timings.verifyMs = Date.now() - _verStart;
                verifyScreenshot = report.screenshot;
                verifyMediaType = report.mediaType || 'image/jpeg';
                console.log(`[timing] VERIFY ${figureStem} attempt ${attemptNum}: ${fmt(attempt.timings.verifyMs)}`);
                console.log(`Verification: ${report.ok ? 'PASS' : 'FAIL'} (errors=${report.errors.length}, warnings=${report.warnings.length})`);
            } catch (e) {
                console.warn(`Verification threw (${e.message}); proceeding to critic.`);
                report = { ok: true, errors: [], warnings: [] };
            }
        }
        attempt.verification = { ok: report.ok, errors: report.errors, warnings: report.warnings };
        prevVerifyScreenshot = verifyScreenshot;
        prevVerifyScreenshotMediaType = verifyMediaType;

        // Hand the verifier's screenshot up so the server never renders a third time.
        loopState.currentScreenshot = verifyScreenshot;
        loopState.currentScreenshotMediaType = verifyMediaType;

        // ───── CRITIQUE ─────
        console.log(`Evaluating...`);
        loopState.status = 'critiquing';

        try {
            const _critStart = Date.now();
            loopState.currentEvaluation = mergeVerificationIntoEvaluation(
                await evaluateHtmlWithCritic({
                    html: loopState.currentHtml,
                    evalImage: sourceBase64,
                    evalMediaType: sourceMediaType,
                    model: criticModel,
                    useFewShot: fewShot.critic !== false,
                    mode: '2d',
                    // Reuse the verifier's screenshot so we don't render the figure twice.
                    renderedScreenshot: verifyScreenshot,
                    renderedMediaType: verifyMediaType,
                }),
                report
            );
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
        try {
            loopState.currentFeedback = await decideFigureRefinement({
                evaluation: loopState.currentEvaluation,
                model: criticModel,
                useFewShot: fewShot.orchestrator !== false,
                mode: '2d',
            });
        } catch (e) {
            console.warn(`[Orchestrator] failed (${e.message}); defaulting to refine_generation.`);
            loopState.currentFeedback = {
                next_step: 'refine_generation',
                rationale: `Fallback decision used because the orchestrator call failed: ${e.message}`,
            };
        }
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

        if (report.errors.length && loopState.currentFeedback.next_step !== 'refine_generation') {
            loopState.currentFeedback = { ...loopState.currentFeedback, next_step: 'refine_generation', source: 'verifier-override' };
            attempt.feedback = loopState.currentFeedback;
            console.log(`[Orchestrator] overridden by verify: forcing refine_generation (${report.errors.length} verify error(s))`);
        }

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
                // refinePlan2d takes no feedback object, unlike planner.js refinePlan.
                // It DOES throw on a parse failure, so this catch is real.
                loopState.currentPlan = await refinePlan2d(
                    loopState.currentPlan,
                    loopState.currentEvaluation,
                    figureStem,
                    plannerModel,
                    fewShot.planner !== false
                );
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

        // ── Full timing breakdown (plan / generate / verify / critic / decide) ──
        try {
            const t = loopState.timings || { planMs: 0, attempts: [] };
            const totGen = (t.attempts || []).reduce((n, a) => n + (a.generateMs || 0), 0);
            const totVer = (t.attempts || []).reduce((n, a) => n + (a.verifyMs || 0), 0);
            const totCrit = (t.attempts || []).reduce((n, a) => n + (a.critiqueMs || 0), 0);
            const totDec = (t.attempts || []).reduce((n, a) => n + (a.decideMs || 0), 0);
            console.log(`\n[timing] ═══════ ${loopState.figureStem} (2D) TIMING SUMMARY ═══════`);
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

module.exports = {
    runFigureLoop2d,
};
