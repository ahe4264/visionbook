/**
 * loop_helpers.js — helpers shared by the 3D (figure_loop.js) and 2D
 * (figure_loop_2d.js) generation loops.
 *
 * Both loops run the same plan → generate → verify → critique → orchestrate
 * shape, and both verifiers (verify.js / verify-2d.js) return the same
 * { ok, errors, warnings, checks, screenshot, mediaType } report contract, so
 * these two functions are medium-agnostic.
 */

/**
 * Fold a verify report into a real critic evaluation: append verify errors as
 * action items and attach the raw report for the audit trail. Does not mutate
 * `evaluation` — returns a new object. Called on EVERY attempt (verify no
 * longer gates whether the critic runs), so when report.errors is empty this
 * is a harmless no-op pass-through plus an empty `verification` field.
 */
function mergeVerificationIntoEvaluation(evaluation, report) {
    const verifyActionItems = report.errors.map(e => `[verify:${e.id}] ${e.message}`);
    return {
        ...evaluation,
        action_items: [...(evaluation.action_items || []), ...verifyActionItems],
        verification: { ok: report.ok, errors: report.errors, warnings: report.warnings },
    };
}

async function withRetry(label, fn, { retries = 3, baseDelay = 2500 } = {}) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const msg = err?.message || String(err);
            const code = err?.code || err?.cause?.code || '';
            const retryable = /UND_ERR_HEADERS_TIMEOUT|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND/i.test(code) ||
                /fetch failed|connection error|Headers Timeout|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN|ENOTFOUND|429|503|timeout/i.test(msg);
            if (!retryable || attempt >= retries) throw err;
            const delay = baseDelay * Math.pow(2, attempt);
            console.warn(`[${label}] retryable error (${attempt + 1}/${retries}): ${code ? `${code} ` : ''}${msg}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

module.exports = {
    mergeVerificationIntoEvaluation,
    withRetry,
};
