/**
 * claude_code_provider.js — make Claude Code usable as a plain completion call.
 *
 * WHY THIS EXISTS: the `anthropic` provider in models.js talks to the Messages
 * API with ANTHROPIC_API_KEY, which bills the API organization. This provider
 * routes the identical prompt through the Claude Code runtime instead, which
 * authenticates with the Claude subscription credentials already on this machine
 * (~/.claude/.credentials.json, written by `claude login`). Same model, same
 * prompts, different meter.
 *
 * It is deliberately NOT agentic. maxTurns is 1, every tool is blocked and no
 * MCP server is attached, so a call is one request in and one block of text out
 * — the exact contract callAnthropic() offers. That is what lets the whole
 * existing pipeline (planner, generation, critic, orchestrator, refine) run
 * over it with no other change.
 *
 * Auth: the child process inherits our environment, so ANTHROPIC_API_KEY has to
 * be stripped explicitly — if it is present Claude Code prefers it and we would
 * silently bill the capped API key again, which is the one thing this file is
 * for avoiding.
 */
// 0 = no cap: run as wide as the caller asks, matching how the API path was
// driven (--concurrency 40). Each call is a Claude Code child process, so this
// is bounded by RAM rather than by sockets; set CLAUDE_CODE_CONCURRENCY to pin
// a ceiling if the machine starts swapping.
const CLAUDE_CODE_CONCURRENCY = Number(process.env.CLAUDE_CODE_CONCURRENCY) || 0;
const CLAUDE_CODE_TIMEOUT_MS = Number(process.env.CLAUDE_CODE_TIMEOUT_MS) || 900_000;
// Unset by default so the model's own default reasoning applies, matching what
// the API path did. Set CLAUDE_CODE_EFFORT=low|medium|high|xhigh|max to pin it.
const CLAUDE_CODE_EFFORT = process.env.CLAUDE_CODE_EFFORT || null;

let _sdk = null;
function loadSdk() {
  if (_sdk === null) {
    try {
      _sdk = require('@anthropic-ai/claude-agent-sdk');
    } catch (e) {
      _sdk = false;
      throw new Error(
        'claude-code provider needs @anthropic-ai/claude-agent-sdk: npm i @anthropic-ai/claude-agent-sdk'
      );
    }
  }
  if (_sdk === false) throw new Error('claude-code provider: SDK unavailable');
  return _sdk;
}

// Measured: each in-flight call is one claude.exe holding ~260 MB, so 40-wide
// is ~10 GB of child processes on top of the backend and the Chromium render
// queue. RAM is the ceiling here, not sockets — a 40-wide burst completed
// 40/40 in 31.5 s with no failures.
let _active = 0;
const _waiting = [];
function acquire() {
  if (!CLAUDE_CODE_CONCURRENCY || _active < CLAUDE_CODE_CONCURRENCY) { _active += 1; return Promise.resolve(); }
  return new Promise(resolve => _waiting.push(resolve));
}
function release() {
  const next = _waiting.shift();
  if (next) next();
  else _active -= 1;
}

// ── Plan rate-limit handling ─────────────────────────────────────────────────
// A subscription is metered by rolling windows, not by TPM, and this account's
// overage is `rejected / out_of_credits` — there is no spillover to pay through.
// So when the window closes, every in-flight call fails at once. That is exactly
// what stranded 33 figures when the API cap hit, because figure_loop_2d.js
// breaks on a generation error instead of retrying.
//
// Two mitigations, neither of which changes what the model sees:
//   - The thrown message carries "429", which is what withRetry() in models.js
//     keys on to back off with jitter rather than fail the figure outright.
//   - _blockedUntil makes the rest of a wide wave fail fast while the window is
//     shut, instead of 40 workers each burning their retries against a wall.
let _blockedUntil = 0;        // epoch ms; 0 = not blocked
let _blockedNote = '';

function noteRateLimit(info) {
  if (!info) return;
  const resetsAtMs = typeof info.resetsAt === 'number' ? info.resetsAt * 1000 : 0;
  if (info.status === 'rejected') {
    _blockedUntil = resetsAtMs || (Date.now() + 60_000);
    _blockedNote = `${info.rateLimitType || 'plan'} window exhausted`
      + (resetsAtMs ? `, resets ${new Date(resetsAtMs).toISOString()}` : '')
      + (info.overageStatus === 'rejected' ? ` (overage unavailable: ${info.overageDisabledReason || 'n/a'})` : '');
    console.warn(`[claude-code] RATE LIMITED — ${_blockedNote}`);
  } else if (info.status === 'allowed_warning') {
    console.warn(`[claude-code] approaching ${info.rateLimitType || 'plan'} limit`
      + (typeof info.utilization === 'number' ? ` (${info.utilization}% used)` : '')
      + (resetsAtMs ? `, resets ${new Date(resetsAtMs).toISOString()}` : ''));
  }
}

/** Retryable in withRetry()'s eyes: the message must contain "429". */
function rateLimitError(detail) {
  return new Error(`claude-code 429 rate_limit — ${detail}`);
}

/** OpenAI-style content blocks → Anthropic content blocks (same shape the SDK takes). */
function toAnthropicContent(blocks) {
  return blocks.map(block => {
    if (block.type === 'image_url') {
      const url = block.image_url.url;
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error('claude-code adapter: invalid data URL for image');
      return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
    }
    return { type: 'text', text: block.text };
  });
}

/**
 * One completion through the Claude Code runtime.
 *
 * `maxTokens` has no SDK equivalent — Claude Code sets the response budget
 * itself — so it is accepted and ignored. That is a real behavioural difference
 * from callAnthropic(): a stage that relied on a 50k cap to bound output is no
 * longer bounded the same way.
 *
 * @returns {Promise<{text: string, usage: object|null}>}
 */
async function callClaudeCode(apiModel, systemPrompt, userContent, _maxTokens, fewShotExamples = []) {
  if (fewShotExamples && fewShotExamples.length) {
    throw new Error('claude-code adapter: fewShotExamples are not supported (no assistant-turn injection)');
  }
  const { query } = loadSdk();
  const content = toAnthropicContent(userContent);

  if (_blockedUntil && Date.now() < _blockedUntil) {
    throw rateLimitError(`${_blockedNote} — not retrying until then`);
  }

  await acquire();
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), CLAUDE_CODE_TIMEOUT_MS);

  try {
    async function* prompt() {
      yield { type: 'user', parent_tool_use_id: null, message: { role: 'user', content } };
    }

    const response = query({
      prompt: prompt(),
      options: {
        model: apiModel,
        maxTurns: 1,
        abortController,
        systemPrompt,               // a bare string REPLACES the Claude Code preset
        ...(CLAUDE_CODE_EFFORT ? { effort: CLAUDE_CODE_EFFORT } : {}),
        // Pure completion: nothing to call, nothing to search, nothing attached.
        mcpServers: {},
        strictMcpConfig: true,
        // `tools: []` is the knob that actually removes the built-ins from the
        // request. `allowedTools` only auto-approves what is already available,
        // and `disallowedTools` blocks execution while the definitions still
        // ship in the system prompt — neither gives a clean completion call.
        tools: [],
        permissionMode: 'dontAsk',
        // Ignore repo CLAUDE.md and .claude/settings: benchmark prompts must be
        // byte-identical to the API path or the comparison is meaningless.
        settingSources: [],
        includePartialMessages: false,
        executable: process.execPath,
        // Subscription auth. Both are cleared so a stray key in backend/.env
        // cannot quietly redirect this call back to the API organization.
        env: { ...process.env, ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: undefined },
      },
    });

    let text = '';
    let usage = null;
    let lastAssistantError = null;

    for await (const message of response) {
      if (message.type === 'rate_limit_event') {
        // Field name differs between the emitted event and the typings.
        noteRateLimit(message.rate_limit_info || message.rateLimitInfo);
      } else if (message.type === 'assistant') {
        // An assistant turn can carry its own error code (rate_limit, overloaded,
        // max_output_tokens, …) without the result subtype saying anything.
        if (message.message?.error) lastAssistantError = message.message.error;
        for (const block of message.message?.content || []) {
          if (block.type === 'text') text += block.text;
        }
      } else if (message.type === 'result') {
        usage = normalizeResultUsage(message);
        if (message.subtype !== 'success') {
          const detail = `${message.subtype}`
            + (message.terminal_reason ? ` / ${message.terminal_reason}` : '')
            + (message.errors?.length ? ` — ${message.errors.join('; ')}` : '');
          // blocking_limit and rapid_refill_breaker are the plan's limiters, not
          // model failures; they must read as 429s so the figure backs off and
          // lives rather than being marked failed_generation.
          const isLimit = message.terminal_reason === 'blocking_limit'
            || message.terminal_reason === 'rapid_refill_breaker'
            || lastAssistantError === 'rate_limit'
            || lastAssistantError === 'overloaded';
          const err = isLimit
            ? rateLimitError(`${apiModel}: ${detail}`)
            : new Error(`claude-code ${apiModel}: ${detail}`);
          err.usage = usage;
          throw err;
        }
        // `result` is only the LAST assistant message, not the whole turn. A
        // figure long enough to arrive as several assistant messages therefore
        // came back as its own tail: 64k output tokens reduced to 539 chars
        // ending in "// @FIGURE_CODE_END" with the opening markers gone, which
        // the scaffold contract then rejected as invalid HTML. Nine of round
        // one's twenty-four failures were this and nothing else.
        //
        // Keep it only as a fallback for the case it was added for — a turn
        // that streamed no assistant text blocks at all.
        if (!text && typeof message.result === 'string' && message.result.length) {
          text = message.result;
        }
      }
    }

    if (!text) {
      const err = new Error(`claude-code ${apiModel}: empty response`);
      err.usage = usage;
      throw err;
    }
    return { text, usage };
  } finally {
    clearTimeout(timer);
    release();
  }
}

/**
 * SDK result usage → the shape normalizeUsage('anthropic', …) produces, so the
 * llm log and costReport() read it without special-casing.
 *
 * costUsd is what the runtime actually reports. On a subscription that figure
 * is the API-equivalent list price, not money charged — the plan is flat-rate —
 * so treat it as a usage signal, not a bill.
 */
function normalizeResultUsage(message) {
  const raw = message?.usage;
  if (!raw || typeof raw !== 'object') return null;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const inputTokens = num(raw.input_tokens);
  const outputTokens = num(raw.output_tokens);
  const cachedInputTokens = num(raw.cache_read_input_tokens);
  const cacheWriteTokens = num(raw.cache_creation_input_tokens);
  const parts = [inputTokens, outputTokens, cachedInputTokens, cacheWriteTokens];
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    totalTokens: (inputTokens === undefined || outputTokens === undefined)
      ? undefined
      : parts.reduce((a, v) => a + (v || 0), 0),
    costUsd: num(message.total_cost_usd),
    numTurns: num(message.num_turns),
  };
}

module.exports = { callClaudeCode };
