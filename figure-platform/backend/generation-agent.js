/**
 * generation-agent.js — agentic (Claude Code) generator for interactive 3D figures.
 *
 * This is a DROP-IN, OPT-IN alternative to the single-shot generator in generation.js.
 * Instead of emitting ~16k tokens of Three.js blind, it runs the Claude Agent SDK loop
 * with ONE in-process tool (`render_figure`) that merges the model's payload into the
 * scaffold, renders it headless, and hands back console errors, uncaught exceptions, a
 * blank-canvas flag, and a screenshot. The agent iterates until it renders cleanly (or
 * hits a hard turn/time budget), so mechanical runtime failures are fixed BEFORE the
 * result ever reaches the outer critic loop.
 *
 * Design guarantees (see figure_loop.js / generation.js integration):
 *   - Fully behind the GENERATOR_MODE flag; when unset, nothing here runs.
 *   - Every path returns a merged HTML string OR null. null == "fall back to single-shot".
 *   - Hard bounded: maxTurns + wall-clock AbortController timeout + concurrency semaphore.
 *   - Never throws into the loop: all failures degrade to null (caller falls back).
 *   - Only the source figure + the in-process render tool are exposed; no Bash/FS/web.
 */

const {
    buildGenerationSystemPrompt,
    buildGenerationUserText,
    mergePayloadIntoScaffold,
    fixGeneratedHtml,
    extractPayloadFromHtml,
    extractPayloadFromText,
    formatPayload,
} = require('./generation');
const { renderAndDiagnose } = require('./runtime-helpers');
const { verifyFigure, formatVerificationForAgent, DEFAULT_VIEWPORTS } = require('./verify');

// ── Config (all overridable via env) ─────────────────────────────────────────
// NOTE ON LATENCY: modern Claude models (Opus 4.6+) default to *adaptive* thinking
// with `effort: 'high'`. Left unbounded, the model can spend minutes "thinking" on
// the very first turn before ever calling the render tool — which is exactly how a
// run hits the wall-clock timeout. We therefore default to a fast model, low effort,
// and a hard thinking-token budget so the agent gets to the render→fix loop quickly.
const AGENT_GEN_MODEL = process.env.AGENT_GEN_MODEL || 'sonnet';       // Claude alias or full id
const AGENT_MAX_TURNS = Number(process.env.AGENT_GEN_MAX_TURNS) || 8;  // tool round-trips
const AGENT_TIMEOUT_MS = Number(process.env.AGENT_GEN_TIMEOUT_MS) || 240_000;
const AGENT_CONCURRENCY = Number(process.env.AGENT_GEN_CONCURRENCY) || 2;
const AGENT_RENDER_WAIT_MS = Number(process.env.AGENT_GEN_RENDER_WAIT_MS) || 3500;
const AGENT_NAV_TIMEOUT_MS = Number(process.env.AGENT_GEN_NAV_TIMEOUT_MS) || 15000;
// Which viewports the in-loop verifier renders at. 'all' = full multi-viewport battery
// (more thorough, ~2× render time); 'laptop' (default) = single laptop viewport for a
// fast repair loop. The final gate can always run 'all' regardless.
const AGENT_VERIFY_VIEWPORTS = (process.env.AGENT_GEN_VERIFY_VIEWPORTS || 'laptop').toLowerCase();
function agentViewports() {
    if (AGENT_VERIFY_VIEWPORTS === 'all') return DEFAULT_VIEWPORTS;
    return [{ name: 'laptop', width: 1366, height: 768 }];
}
const AGENT_EFFORT = process.env.AGENT_GEN_EFFORT || 'low';            // low|medium|high|xhigh|max
const AGENT_THINKING_TOKENS = Number(process.env.AGENT_GEN_THINKING_TOKENS) || 4096; // hard cap; 0 = disabled
const AGENT_MAX_BUDGET_USD = Number(process.env.AGENT_GEN_MAX_BUDGET_USD) || 2.5;     // per-figure cost guard

/** Build the SDK thinking config from env (bounded to avoid runaway first-turn latency). */
function buildThinkingConfig() {
    if (AGENT_THINKING_TOKENS <= 0) return { type: 'disabled' };
    return { type: 'enabled', budgetTokens: AGENT_THINKING_TOKENS };
}

// ── Lazy, failure-tolerant SDK loading ───────────────────────────────────────
let _sdk;   // undefined = untried, false = unavailable, object = loaded
let _zod;

function loadSdk() {
    if (_sdk === undefined) {
        try {
            _sdk = require('@anthropic-ai/claude-agent-sdk');
        } catch (e) {
            _sdk = false;
            console.warn('[agent-gen] @anthropic-ai/claude-agent-sdk not available:', e.message);
        }
    }
    return _sdk;
}

function loadZod() {
    if (_zod === undefined) {
        try {
            _zod = require('zod').z;
        } catch (e) {
            _zod = false;
            console.warn('[agent-gen] zod not available:', e.message);
        }
    }
    return _zod;
}

/** True when the agentic generator can actually run in this environment. */
function isAgentGenerationAvailable() {
    return Boolean(loadSdk() && loadZod() && process.env.ANTHROPIC_API_KEY);
}

// ── Simple concurrency semaphore (agents are heavier than single calls) ───────
let _active = 0;
const _waiters = [];
function acquireSlot() {
    if (_active < AGENT_CONCURRENCY) {
        _active++;
        return Promise.resolve();
    }
    return new Promise(resolve => _waiters.push(resolve)).then(() => { _active++; });
}
function releaseSlot() {
    _active = Math.max(0, _active - 1);
    const next = _waiters.shift();
    if (next) next();
}

// ── Prompt construction ───────────────────────────────────────────────────────
function buildAgentSystemPrompt(scaffold, plan) {
    // Reuse the exact scaffold rules the single-shot generator uses, then layer the
    // agentic contract on top so the model knows it must render-and-verify.
    return `${buildGenerationSystemPrompt(scaffold, plan)}

════════════════════════════════════════════════════════════════════════════════
AGENTIC WORKFLOW — you have a tool, use it before you are done:
- You have ONE tool: render_figure(uiHtml, codeJs). It inserts your payload into the
  scaffold, renders it in a REAL headless browser, runs a battery of automated checks, and
  returns a verification report (blocking errors + warnings) plus a screenshot.
- The verifier checks, among other things:
    * runtime: no uncaught exceptions, the scaffold error overlay is hidden, the render
      loop is actually alive (frames advancing).
    * technical: the GPU issued draw calls, the scene has drawable objects, no NaN
      coordinates, the canvas is not blank. (You cannot fake these by emitting markup.)
    * layout: no horizontal overflow, the control panel is on-screen and not clipped,
      labels are on-screen / not enormous / not heavily overlapping, equations fit.
- Procedure every attempt:
    1. Decide the primitives, then write the UI HTML (usually empty) and the module JS.
    2. Call render_figure with that payload.
    3. Read the verification report AND the screenshot. Compare the screenshot to the
       source figure that was provided in the first message.
    4. If the report has ANY blocking errors ("VERIFICATION FAILED"), you are NOT done:
       fix the specific named check and call render_figure again.
    5. Also iterate if the screenshot clearly does not resemble the source figure
       (wrong camera/view, missing elements, wrong primitives, missing labels).
- Stop calling the tool once verification PASSES (no blocking errors) AND the view is a
  reasonable drop-in replacement for the source figure. Address warnings if cheap. Do not
  keep polishing endlessly — you have a limited turn budget.
- CRITICAL — how your work is delivered: ONLY the payload you pass to render_figure is
  saved and used. Writing the code as a plain text answer (even between markers) does
  NOTHING — that text is discarded. The deliverable is your LAST render_figure call, so it
  must contain your best, complete payload AND it must have come back CLEAN.
- Therefore you MUST finish with a render_figure call, not a text explanation. If your most
  recent render_figure still reported errors or a blank canvas, you are NOT done: fix the
  cause and call render_figure again. Do not stop while the latest render is dirty and you
  still have turns left. Keep your prose to one short sentence per turn — spend the budget
  on rendering, not on writing.
- Common runtime pitfalls to avoid (they cause blank canvases / exceptions):
    * referencing a scaffold global that does not exist, or re-declaring one that does
    * calling setCameraView before geometry is added
    * NaN/undefined coordinates, or THREE API misuse that throws in the animate loop
    * forgetting to add objects to the scene
- Do NOT attempt to read files, run shell commands, or fetch the web. Only render_figure.`;
}

function buildAgentUserText(plan, { prevHtml, feedbackText } = {}) {
    let text = buildGenerationUserText(plan);
    if (prevHtml) {
        const prevPayload = extractPayloadFromHtml(prevHtml);
        if (prevPayload) {
            text += `\n\nSTARTING POINT — a previous attempt's payload (improve it, don't start from scratch):\n${formatPayload(prevPayload)}`;
        }
    }
    if (feedbackText) {
        text += `\n\nKNOWN ISSUES with the previous attempt to fix:\n${feedbackText}`;
    }
    text += `\n\nThe original source figure image is attached above. Build the 3D figure, then use render_figure to verify it runs cleanly and resembles the source before finishing.`;
    return text;
}

/** Summarize a critic evaluation into a compact feedback string for the agent. */
function summarizeEvaluation(evaluation) {
    if (!evaluation) return '';
    return [
        ...(evaluation.failure_modes || []).map(m => `- failure mode: ${m}`),
        `- geometry_accuracy: ${evaluation.geometry_accuracy}/5`,
        `- faithfulness: ${evaluation.faithfulness}/5`,
        `- label_quality: ${evaluation.label_quality}/5`,
        `- concept_accuracy: ${evaluation.concept_accuracy}/5`,
        ...(evaluation.notes ? [`- notes: ${evaluation.notes}`] : []),
        ...(Array.isArray(evaluation.action_items) ? evaluation.action_items.map(a => `- action: ${a}`) : []),
    ].join('\n');
}

/** Summarize a runtime diagnosis (from renderAndDiagnose) into a feedback string. */
function summarizeDiagnosis(diag) {
    if (!diag) return '';
    const lines = [];
    if (diag.pageErrors?.length) lines.push(...diag.pageErrors.map(e => `- uncaught exception: ${e}`));
    if (diag.consoleErrors?.length) lines.push(...diag.consoleErrors.map(e => `- console: ${e}`));
    if (diag.blank) lines.push('- the canvas rendered blank (nothing visible) — likely an exception, missing scene.add(), off-screen camera, or NaN coordinates');
    return lines.join('\n');
}

/**
 * Build the async-iterable prompt so we can attach the source image as a real
 * image content block (Anthropic MessageParam format), not just text.
 */
async function* buildPromptStream({ base64, mediaType, userText }) {
    yield {
        type: 'user',
        parent_tool_use_id: null,
        message: {
            role: 'user',
            content: [
                { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
                { type: 'text', text: userText },
            ],
        },
    };
}

// ── The in-process render tool ────────────────────────────────────────────────
function makeRenderTool(scaffold, state) {
    const { tool } = loadSdk();
    const z = loadZod();

    return tool(
        'render_figure',
        'Insert a UI+JS payload into the fixed scaffold, render it headless in a real browser, and return uncaught exceptions, console errors, a blank-canvas flag, and a screenshot of the result. Call this to verify your figure actually runs and looks right.',
        {
            uiHtml: z.string().describe('HTML that goes inside <div id="ui"> (usually empty). No <html>/<head>/<body>/<script>/<style>.'),
            codeJs: z.string().describe('JavaScript that runs inside the existing module. No imports, no re-declaring scaffold globals.'),
        },
        async ({ uiHtml, codeJs }) => {
            state.calls++;
            const callNo = state.calls;
            const renderStart = Date.now();
            let html;
            try {
                html = fixGeneratedHtml(mergePayloadIntoScaffold(scaffold, { uiHtml: uiHtml || '', codeJs: codeJs || '' }));
            } catch (e) {
                const ms = Date.now() - renderStart;
                state.timeline.push({ phase: 'render', call: callNo, ms, ok: false, error: `merge failed: ${e.message}` });
                console.log(`[agent-gen] ${state.label}: render #${callNo} merge FAILED in ${ms}ms — ${e.message}`);
                return { content: [{ type: 'text', text: `Could not merge payload into scaffold: ${e.message}. Ensure you provide plain UI HTML and module JS.` }] };
            }

            state.lastHtml = html; // best-effort fallback even if imperfect

            // Structured, rendered verification: runtime + technical (non-tautological) +
            // layout checks. The agent repairs against these until there are no blocking errors.
            const report = await verifyFigure(html, {
                viewports: agentViewports(),
                waitMs: AGENT_RENDER_WAIT_MS,
                navTimeoutMs: AGENT_NAV_TIMEOUT_MS,
            });
            if (report.ok) state.lastGoodHtml = html;

            const renderMs = Date.now() - renderStart;
            state.timeline.push({
                phase: 'render',
                call: callNo,
                ms: renderMs,
                ok: report.ok,
                errors: report.errors.length,
                warnings: report.warnings.length,
                failedChecks: report.errors.map(e => e.id),
                htmlBytes: html.length,
            });
            const verdict = report.ok
                ? (report.warnings.length ? `PASS (${report.warnings.length} warn)` : 'PASS')
                : `FAIL ${report.errors.length} err: ${[...new Set(report.errors.map(e => e.id))].join(',')}`;
            console.log(`[agent-gen] ${state.label}: render #${callNo} took ${renderMs}ms → ${verdict}`);

            const content = [{ type: 'text', text: formatVerificationForAgent(report) + '\n\nAlso visually compare the screenshot below to the source figure and iterate if elements/camera/labels do not match.' }];
            if (report.screenshot) {
                content.push({ type: 'image', data: report.screenshot, mimeType: report.mediaType || 'image/jpeg' });
            } else {
                content.push({ type: 'text', text: '(screenshot capture failed — rely on the check report above)' });
            }
            return { content };
        }
    );
}

/**
 * Agentic generation entry point.
 *
 * @param {{
 *   scaffold: string,
 *   plan?: object,
 *   base64: string,
 *   mediaType: string,
 *   prevHtml?: string,
 *   feedbackText?: string,
 *   model?: string,
 *   maxTurns?: number,
 *   timeoutMs?: number,
 *   label?: string,
 * }} opts
 * @returns {Promise<string|null>} merged HTML, or null to signal the caller to fall back.
 */
async function generateCodeAgent(opts) {
    const {
        scaffold,
        plan,
        base64,
        mediaType,
        prevHtml,
        feedbackText,
        model = AGENT_GEN_MODEL,
        maxTurns = AGENT_MAX_TURNS,
        timeoutMs = AGENT_TIMEOUT_MS,
        label = 'figure',
    } = opts || {};

    if (!scaffold || !base64 || !mediaType) {
        console.warn('[agent-gen] missing scaffold/image; falling back.');
        return null;
    }
    if (!isAgentGenerationAvailable()) {
        console.warn('[agent-gen] agent SDK/zod/key unavailable; falling back.');
        return null;
    }

    const { query, createSdkMcpServer } = loadSdk();
    const state = { calls: 0, lastHtml: null, lastGoodHtml: null, label, timeline: [] };

    const queueWaitStart = Date.now();
    await acquireSlot();
    const queueWaitMs = Date.now() - queueWaitStart;
    if (queueWaitMs > 50) {
        state.timeline.push({ phase: 'queue_wait', ms: queueWaitMs });
        console.log(`[agent-gen] ${label}: waited ${queueWaitMs}ms for a concurrency slot`);
    }
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeoutMs);
    const startedAt = Date.now();
    let lastTurnMark = startedAt;
    let turnNo = 0;

    try {
        const server = createSdkMcpServer({
            name: 'figure-runtime',
            version: '1.0.0',
            tools: [makeRenderTool(scaffold, state)],
        });

        const userText = buildAgentUserText(plan, { prevHtml, feedbackText });

        const response = query({
            prompt: buildPromptStream({ base64, mediaType, userText }),
            options: {
                model,
                maxTurns,
                abortController,
                // Bound reasoning so the agent reaches the render→fix loop fast (see config note).
                effort: AGENT_EFFORT,
                thinking: buildThinkingConfig(),
                maxBudgetUsd: AGENT_MAX_BUDGET_USD,
                systemPrompt: buildAgentSystemPrompt(scaffold, plan),
                mcpServers: { 'figure-runtime': server },
                allowedTools: ['mcp__figure-runtime__render_figure'],
                // Block everything else, including the built-in ToolSearch (the model wasted
                // a turn "searching" for tools when only our one MCP tool is available).
                disallowedTools: ['Bash', 'Write', 'Edit', 'MultiEdit', 'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Task', 'NotebookEdit', 'ToolSearch'],
                permissionMode: 'dontAsk',
                settingSources: [],        // ignore repo CLAUDE.md / .claude settings
                strictMcpConfig: true,     // only our in-process server
                includePartialMessages: false,
                executable: process.execPath,
            },
        });

        let terminalReason = null;
        for await (const message of response) {
            if (message.type === 'assistant') {
                turnNo++;
                const now = Date.now();
                const thinkMs = now - lastTurnMark;
                lastTurnMark = now;

                const blocks = message.message?.content || [];
                const toolUses = blocks.filter(b => b?.type === 'tool_use').map(b => b.name);
                const textBlocks = blocks.filter(b => b?.type === 'text');
                const thinkBlocks = blocks.filter(b => b?.type === 'thinking' || b?.type === 'redacted_thinking');
                const textLen = textBlocks.reduce((n, b) => n + (b.text?.length || 0), 0);
                const thinkLen = thinkBlocks.reduce((n, b) => n + (b.thinking?.length || 0), 0);
                const parts = [];
                if (toolUses.length) parts.push(`called ${toolUses.join(', ')}`);
                if (textLen) parts.push(`wrote ${textLen} chars`);
                if (thinkLen) parts.push(`thought ${thinkLen} chars`);
                if (textLen) state.lastAssistantText = textBlocks.map(b => b.text || '').join('\n');
                const blockTypes = blocks.map(b => b?.type).filter(Boolean);
                const action = parts.length ? parts.join(' + ') : `produced no text/tool (blocks: ${blockTypes.join(',') || 'none'})`;

                state.timeline.push({ phase: 'model_turn', turn: turnNo, ms: thinkMs, action, toolUses, textLen, thinkLen, blockTypes });
                console.log(`[agent-gen] ${label}: turn ${turnNo} — model ${action} (took ${(thinkMs / 1000).toFixed(1)}s incl. any render)`);
            } else if (message.type === 'result') {
                terminalReason = message.terminal_reason || message.subtype || null;
                if (typeof message.usage === 'object' && message.usage) {
                    state.usage = message.usage;
                }
            }
        }

        // ── Salvage net: if the model ended by writing its payload as TEXT (markers)
        //    instead of a final render_figure call, recover it so its best work isn't lost.
        if (!state.lastGoodHtml && state.lastAssistantText) {
            try {
                const payload = extractPayloadFromText(state.lastAssistantText);
                if (payload && (payload.uiHtml || payload.codeJs)) {
                    const salvaged = fixGeneratedHtml(mergePayloadIntoScaffold(scaffold, payload));
                    const salStart = Date.now();
                    const report = await verifyFigure(salvaged, { viewports: agentViewports(), waitMs: AGENT_RENDER_WAIT_MS, navTimeoutMs: AGENT_NAV_TIMEOUT_MS });
                    const salMs = Date.now() - salStart;
                    state.calls++;
                    state.timeline.push({ phase: 'render', call: state.calls, ms: salMs, ok: report.ok, errors: report.errors.length, warnings: report.warnings.length, salvage: true });
                    console.log(`[agent-gen] ${label}: salvaged final text payload → render #${state.calls} ${salMs}ms → ${report.ok ? 'PASS' : 'still failing'}`);
                    // Prefer the salvaged version if it verifies, or if we had nothing before.
                    if (report.ok) state.lastGoodHtml = salvaged;
                    if (!state.lastHtml) state.lastHtml = salvaged;
                }
            } catch (e) {
                console.warn(`[agent-gen] ${label}: salvage parse failed (${e.message})`);
            }
        }

        const elapsed = Date.now() - startedAt;
        const chosen = state.lastGoodHtml || state.lastHtml || null;

        // ── Per-run timing summary ──────────────────────────────────────────────
        const renders = state.timeline.filter(t => t.phase === 'render');
        const totalRenderMs = renders.reduce((n, r) => n + r.ms, 0);
        console.log(`[agent-gen] ${label}: ── run summary ──`);
        console.log(`[agent-gen] ${label}:   turns=${turnNo} renders=${renders.length} clean=${Boolean(state.lastGoodHtml)} reason=${terminalReason}`);
        console.log(`[agent-gen] ${label}:   total=${(elapsed / 1000).toFixed(1)}s (render=${(totalRenderMs / 1000).toFixed(1)}s, model+overhead=${((elapsed - totalRenderMs) / 1000).toFixed(1)}s)`);
        if (terminalReason === 'max_turns') {
            console.warn(`[agent-gen] ${label}:   NOTE hit maxTurns cap (${maxTurns}) — consider raising AGENT_GEN_MAX_TURNS`);
        }

        // expose the timeline for callers that want to persist it
        generateCodeAgent.lastRun = {
            label, elapsedMs: elapsed, turns: turnNo, renders: renders.length,
            clean: Boolean(state.lastGoodHtml), terminalReason, timeline: state.timeline,
            usage: state.usage || null,
        };
        return chosen;
    } catch (err) {
        const aborted = abortController.signal.aborted;
        const elapsed = Date.now() - startedAt;
        console.warn(`[agent-gen] ${label}: ${aborted ? `TIMED OUT after ${(elapsed / 1000).toFixed(1)}s (timeout=${timeoutMs}ms)` : `errored (${err?.message || err})`} at turn ${turnNo}/${maxTurns}. Returning best-so-far (${state.lastGoodHtml ? 'clean' : state.lastHtml ? 'dirty' : 'none'}).`);
        generateCodeAgent.lastRun = {
            label, elapsedMs: elapsed, turns: turnNo, renders: state.calls,
            clean: Boolean(state.lastGoodHtml), terminalReason: aborted ? 'timeout' : 'error',
            timeline: state.timeline, error: String(err?.message || err),
        };
        return state.lastGoodHtml || state.lastHtml || null;
    } finally {
        clearTimeout(timer);
        releaseSlot();
    }
}

module.exports = {
    generateCodeAgent,
    isAgentGenerationAvailable,
    summarizeEvaluation,
    summarizeDiagnosis,
    AGENT_GEN_MODEL,
};
