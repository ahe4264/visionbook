/**
 * generation-2d-agent.js - bounded coding-agent generator for 2D demos.
 *
 * Produces one complete self-contained HTML file for either:
 *   - standalone: full teaching demo page with visible controls/explanations
 *   - inline: minimal PDF/QMD augmentation, source-sized, hover/click popups
 */

const { verify2dHtml, format2dVerificationForAgent } = require('./verify-2d');

const AGENT_2D_MODEL = process.env.AGENT_2D_MODEL || process.env.AGENT_GEN_MODEL || 'sonnet';
const AGENT_2D_MAX_TURNS = Number(process.env.AGENT_2D_MAX_TURNS) || 7;
const AGENT_2D_TIMEOUT_MS = Number(process.env.AGENT_2D_TIMEOUT_MS) || 240000;
const AGENT_2D_CONCURRENCY = Number(process.env.AGENT_2D_CONCURRENCY) || 1;
const AGENT_2D_EFFORT = process.env.AGENT_2D_EFFORT || 'low';
const AGENT_2D_THINKING_TOKENS = Number(process.env.AGENT_2D_THINKING_TOKENS) || 4096;
const AGENT_2D_MAX_BUDGET_USD = Number(process.env.AGENT_2D_MAX_BUDGET_USD) || 2.0;

let _sdk;
let _zod;
let _active = 0;
const _waiters = [];

function loadSdk() {
  if (_sdk === undefined) {
    try { _sdk = require('@anthropic-ai/claude-agent-sdk'); }
    catch (e) { _sdk = false; console.warn('[2d-agent] SDK unavailable:', e.message); }
  }
  return _sdk;
}

function loadZod() {
  if (_zod === undefined) {
    try { _zod = require('zod').z; }
    catch (e) { _zod = false; console.warn('[2d-agent] zod unavailable:', e.message); }
  }
  return _zod;
}

function is2dAgentAvailable() {
  return Boolean(loadSdk() && loadZod() && process.env.ANTHROPIC_API_KEY);
}

function acquireSlot() {
  if (_active < AGENT_2D_CONCURRENCY) {
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

function thinkingConfig() {
  if (AGENT_2D_THINKING_TOKENS <= 0) return { type: 'disabled' };
  return { type: 'enabled', budgetTokens: AGENT_2D_THINKING_TOKENS };
}

async function* promptStream({ base64, mediaType, text }) {
  yield {
    type: 'user',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text },
      ],
    },
  };
}

function systemPrompt() {
  return `You are an expert web-visualization developer building reliable interactive 2D textbook demos.

Output discipline:
- You have exactly one tool: render_demo(html).
- The deliverable is ONLY the last HTML passed to render_demo. Plain text answers are discarded.
- Always call render_demo. If verification fails, fix the named issues and call render_demo again.
- Do not read files, run shell commands, or fetch the web.

Technical requirements:
- Produce one complete self-contained HTML file: <!DOCTYPE html> ... </html>.
- Vanilla HTML/CSS/SVG/JS only. No external libraries, no network assets, no original image embedding.
- Use SVG for diagrams/plots whenever possible.
- Wrap JS initialization in try/catch and show a small nonintrusive error message if something fails.
- Must render inside an iframe/PDF augmentation environment without horizontal overflow.
- Use responsive sizing: width:100%, max-width, preserveAspectRatio, and no fixed giant canvases.

Interaction requirements:
- Every interaction must teach the concept, not decorate it.
- Provide lightweight hover tooltips and click explainers.
- For inline mode, click explainers should use window.parent.postMessage({type:'alex-popup', title, body}, '*') and avoid fixed bulky panels.
- For standalone mode, you may include a compact side/bottom explanation panel, reset button, and 1-3 intuitive controls.
- Default view must be a faithful visual replacement for the source figure before interaction.

Verification checks include runtime errors, blank output, overflow/clipping, visible content, and explainer affordances.`;
}

function modeInstructions(mode) {
  if (mode === 'standalone') {
    return `VERSION: standalone teaching demo
- Make this a complete full-page demo that can be opened by itself.
- Include a concise title, short setup explanation, the reconstructed figure, and minimal intuitive controls.
- Controls should be compact and meaningful: reset, step-through only if the concept has steps, sliders/toggles only if parameters matter.
- Include visible click/hover explanations in-page; still keep the figure itself uncluttered.`;
  }
  return `VERSION: inline PDF/QMD augmentation
- The first frame should look like the original figure, with the same crop, zoom, whitespace, label density, and proportions.
- No title cards, toolbar chrome, bulky control panels, or visible descriptions by default.
- Use hover highlights/tooltips and click-to-popup via window.parent.postMessage({type:'alex-popup', title, body}, '*').
- Keep any controls minimal and edge-aligned; prefer clicking meaningful elements over extra UI.
- This should drop seamlessly into an inline PDF or QMD reader slot.`;
}

function userPrompt({ figureStem, chapterName, plan, mode, referenceNotes }) {
  return `Figure: ${figureStem}${chapterName ? ` (chapter: ${chapterName})` : ''}

${modeInstructions(mode)}

Planner blueprint (use it, but trust the image if the blueprint is incomplete):
${JSON.stringify(plan || {}, null, 2)}

Reference style notes:
${referenceNotes || 'Use a clean active-reader style: white page/card, subtle borders, direct manipulation, hover tooltips, click explainers, and readable typography.'}

Reconstruct the source image as code, then add concept-driven interactivity. Call render_demo(html) with the full HTML file.`;
}

function makeRenderTool(state) {
  const { tool } = loadSdk();
  const z = loadZod();
  return tool(
    'render_demo',
    'Render and verify a complete self-contained 2D demo HTML file. Call this every attempt; the last clean HTML is saved.',
    { html: z.string().describe('Complete self-contained HTML document starting with <!DOCTYPE html>.') },
    async ({ html }) => {
      state.calls++;
      const call = state.calls;
      const started = Date.now();
      state.lastHtml = html || '';
      const report = await verify2dHtml(state.lastHtml);
      if (report.ok) state.lastGoodHtml = state.lastHtml;
      const ms = Date.now() - started;
      state.timeline.push({ phase: 'render', call, ms, ok: report.ok, errors: report.errors.length, warnings: report.warnings.length, htmlBytes: state.lastHtml.length });
      console.log(`[2d-agent] ${state.label}: render #${call} ${report.ok ? 'PASS' : `FAIL ${report.errors.length} err`} in ${(ms / 1000).toFixed(1)}s`);
      const content = [{ type: 'text', text: `${format2dVerificationForAgent(report)}\n\nCompare the screenshot to the source image. If visual fidelity is poor, revise and call render_demo again.` }];
      if (report.screenshot) content.push({ type: 'image', data: report.screenshot, mimeType: report.mediaType || 'image/jpeg' });
      return { content };
    }
  );
}

async function generate2dDemoAgent(opts = {}) {
  const {
    figureStem = 'figure',
    chapterName = null,
    base64,
    mediaType = 'image/png',
    plan = null,
    mode = 'inline',
    referenceNotes = '',
    model = AGENT_2D_MODEL,
    maxTurns = AGENT_2D_MAX_TURNS,
    timeoutMs = AGENT_2D_TIMEOUT_MS,
  } = opts;

  if (!base64 || !mediaType || !is2dAgentAvailable()) return null;
  const { query, createSdkMcpServer } = loadSdk();
  const state = { label: `${figureStem}:${mode}`, calls: 0, lastHtml: null, lastGoodHtml: null, timeline: [] };

  const queueStart = Date.now();
  await acquireSlot();
  const queueMs = Date.now() - queueStart;
  if (queueMs > 50) state.timeline.push({ phase: 'queue_wait', ms: queueMs });

  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeoutMs);
  const started = Date.now();
  let turns = 0;
  let lastTurnMark = started;
  let terminalReason = null;
  try {
    const server = createSdkMcpServer({
      name: 'figure-2d-runtime',
      version: '1.0.0',
      tools: [makeRenderTool(state)],
    });
    const response = query({
      prompt: promptStream({ base64, mediaType, text: userPrompt({ figureStem, chapterName, plan, mode, referenceNotes }) }),
      options: {
        model,
        maxTurns,
        abortController,
        effort: AGENT_2D_EFFORT,
        thinking: thinkingConfig(),
        maxBudgetUsd: AGENT_2D_MAX_BUDGET_USD,
        systemPrompt: systemPrompt(),
        mcpServers: { 'figure-2d-runtime': server },
        allowedTools: ['mcp__figure-2d-runtime__render_demo'],
        disallowedTools: ['Bash', 'Write', 'Edit', 'MultiEdit', 'Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Task', 'NotebookEdit', 'ToolSearch'],
        permissionMode: 'dontAsk',
        settingSources: [],
        strictMcpConfig: true,
        includePartialMessages: false,
        executable: process.execPath,
      },
    });

    for await (const message of response) {
      if (message.type === 'assistant') {
        turns++;
        const now = Date.now();
        const blocks = message.message?.content || [];
        const toolUses = blocks.filter(b => b?.type === 'tool_use').map(b => b.name);
        const textLen = blocks.filter(b => b?.type === 'text').reduce((n, b) => n + (b.text?.length || 0), 0);
        const action = toolUses.length ? `called ${toolUses.join(', ')}` : textLen ? `wrote ${textLen} chars` : 'thinking/no output';
        state.timeline.push({ phase: 'model_turn', turn: turns, ms: now - lastTurnMark, action, toolUses, textLen });
        lastTurnMark = now;
        console.log(`[2d-agent] ${state.label}: turn ${turns} ${action}`);
      } else if (message.type === 'result') {
        terminalReason = message.terminal_reason || message.subtype || null;
        if (message.usage) state.usage = message.usage;
      }
    }
    const elapsedMs = Date.now() - started;
    generate2dDemoAgent.lastRun = {
      label: state.label,
      elapsedMs,
      turns,
      renders: state.calls,
      clean: Boolean(state.lastGoodHtml),
      terminalReason,
      timeline: state.timeline,
      usage: state.usage || null,
    };
    return { html: state.lastGoodHtml || state.lastHtml, run: generate2dDemoAgent.lastRun };
  } catch (e) {
    const elapsedMs = Date.now() - started;
    generate2dDemoAgent.lastRun = {
      label: state.label,
      elapsedMs,
      turns,
      renders: state.calls,
      clean: Boolean(state.lastGoodHtml),
      terminalReason: abortController.signal.aborted ? 'timeout' : 'error',
      error: String(e?.message || e),
      timeline: state.timeline,
    };
    return state.lastGoodHtml || state.lastHtml ? { html: state.lastGoodHtml || state.lastHtml, run: generate2dDemoAgent.lastRun } : null;
  } finally {
    clearTimeout(timer);
    releaseSlot();
  }
}

module.exports = { generate2dDemoAgent, is2dAgentAvailable, AGENT_2D_MODEL };
