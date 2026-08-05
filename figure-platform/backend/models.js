/**
 * models.js — Unified multi-provider model router
 *
 * Abstracts OpenAI, Anthropic (Claude), Google (Gemini), and OpenRouter behind
 * a single `generateWithModel(modelId, { systemPrompt, userContent, maxTokens })`
 * call.
 *
 * The generator sends vision messages; this module handles the per-provider
 * image format differences so the rest of the server stays clean.
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const OpenAI = require('openai').default;
const Anthropic = require('@anthropic-ai/sdk').default;
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const { appendLLMInputLog, summarizeUserContent } = require('./llm_input_logger');

const GEMINI_HEADERS_TIMEOUT_MS = Number(process.env.GEMINI_HEADERS_TIMEOUT_MS) || 900_000;
const GEMINI_BODY_TIMEOUT_MS = Number(process.env.GEMINI_BODY_TIMEOUT_MS) || 0;

// ── URL-routed fetch patch — Gemini-only dispatcher ─────────────────────────
// The @google/genai SDK's ApiClient calls bare `fetch()` (globalThis.fetch)
// directly, ignoring any `fetch` option passed to the GoogleGenAI constructor.
// We therefore patch globalThis.fetch with URL-based routing:
//   • requests to generativelanguage.googleapis.com → undici dispatcher with
//     keepAlive=false (fresh TCP per call, avoids stale-socket UND_ERR_SOCKET)
//     and generous timeouts for long streaming generations.
//   • all other requests (OpenAI, Anthropic, etc.) → original fetch unchanged.
try {
  const undici = require('undici');
  const _geminiDispatcher = new undici.Agent({
    connect: { keepAlive: false },  // fresh TCP per request
    headersTimeout: GEMINI_HEADERS_TIMEOUT_MS,
    bodyTimeout: GEMINI_BODY_TIMEOUT_MS,
  });
  const _origFetch = globalThis.fetch;
  globalThis.fetch = (url, opts = {}) => {
    const urlStr = typeof url === 'string'
      ? url
      : (url instanceof URL ? url.href : (url && typeof url.url === 'string' ? url.url : String(url)));
    if (urlStr.includes('generativelanguage.googleapis.com') ||
      urlStr.includes('aiplatform.googleapis.com')) {
      return undici.fetch(url, { ...opts, dispatcher: _geminiDispatcher });
    }
    return _origFetch(url, opts);
  };
  console.log(`[models] fetch patched: Gemini URLs → undici (keepAlive=false, headersTimeout=${Math.round(GEMINI_HEADERS_TIMEOUT_MS / 1000)}s), others → native`);
} catch (_) {
  // undici not available — rely on default fetch with streaming as fallback
}

// ── OpenRouter dispatcher ────────────────────────────────────────────────────
// OpenRouter needs the same treatment as Gemini above, but cannot get it the
// same way: the openai SDK (v4) resolves fetch through its own node-fetch shim
// at import time and never consults globalThis, so the URL-routed patch above
// does not reach it. The constructor's `fetch` option is the only injection
// point that works, so we build the dispatcher-bound fetch here and hand it to
// the client in getOpenRouter().
//
// Two defaults were killing long generations:
//   • connection reuse — a pooled socket can be closed by the far side (or a
//     proxy) without Node noticing; the next request writes to a dead socket
//     and fails with ECONNRESET / "Premature close". keepAlive=false spends a
//     TCP handshake per call to avoid inheriting a corpse.
//   • bodyTimeout — undici's 300s default is the maximum gap *between chunks*,
//     not the total duration. Reasoning models go quiet while thinking, so a
//     slow generation trips it mid-stream and the abort surfaces as a truncated
//     response. 0 disables the cap, matching the Gemini dispatcher.
const OPENROUTER_HEADERS_TIMEOUT_MS = Number(process.env.OPENROUTER_HEADERS_TIMEOUT_MS) || 900_000;
const OPENROUTER_BODY_TIMEOUT_MS = Number(process.env.OPENROUTER_BODY_TIMEOUT_MS) || 0;
let _openrouterFetch = null;
try {
  const undici = require('undici');
  const dispatcher = new undici.Agent({
    connect: { keepAlive: false },
    headersTimeout: OPENROUTER_HEADERS_TIMEOUT_MS,
    bodyTimeout: OPENROUTER_BODY_TIMEOUT_MS,
  });
  _openrouterFetch = (url, opts = {}) => undici.fetch(url, { ...opts, dispatcher });
  console.log(`[models] OpenRouter fetch → undici (keepAlive=false, headersTimeout=${Math.round(OPENROUTER_HEADERS_TIMEOUT_MS / 1000)}s, bodyTimeout=${OPENROUTER_BODY_TIMEOUT_MS === 0 ? 'disabled' : `${Math.round(OPENROUTER_BODY_TIMEOUT_MS / 1000)}s`})`);
} catch (_) {
  // undici not available — the client falls back to the SDK's default fetch
}

// ── Lazy-init clients ────────────────────────────────────────────────────────
let _openai = null;
let _openrouter = null;
let _anthropic = null;
let _gemini = null;
let _googleGenAIClass = null;
let _geminiQueue = Promise.resolve();
let _openaiQueue = Promise.resolve();
let _lastGeminiRequestAt = 0;
let _lastOpenAIRequestAt = 0;

const GEMINI_MAX_IMAGE_DIMENSION = 2048;
const GEMINI_JPEG_QUALITY = 82;
const GEMINI_MIN_REQUEST_INTERVAL_MS = 1200;
const OPENAI_MIN_REQUEST_INTERVAL_MS = Number(process.env.OPENAI_MIN_REQUEST_INTERVAL_MS) || 1200;
const MODEL_CALL_TIMEOUT_MS = Number(process.env.MODEL_CALL_TIMEOUT_MS) || 600_000;
// Rate limiting needs a far longer backoff than a transient socket error: an
// upstream 429 on a busy model clears in seconds-to-minutes, not milliseconds.
const RATE_LIMIT_BASE_DELAY_MS = Number(process.env.RATE_LIMIT_BASE_DELAY_MS) || 8_000;
const OPENROUTER_MAX_RETRIES = Number(process.env.OPENROUTER_MAX_RETRIES) || 4;
// The share of max_tokens OpenRouter allots to reasoning at effort:'medium'.
// Lets that tier be expressed as an explicit token budget for endpoints that
// mishandle the effort keyword (see the qwen3.8-max registry entry).
const REASONING_MEDIUM_FRACTION = 0.5;

function withTimeout(promise, label, timeoutMs = MODEL_CALL_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function withRetry(label, fn, retries = 2, baseDelayMs = 1000) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err?.message || String(err);
      const code = err?.code || err?.cause?.code || '';
      const status = err?.status ?? err?.response?.status;
      // Dropped streams are transient and worth another attempt, but they were
      // landing outside both patterns below and failing on the first try:
      // "Premature close" (ERR_STREAM_PREMATURE_CLOSE) and undici's "terminated"
      // share no substring with anything already listed. Truncation at the token
      // budget is deliberately absent — that one is deterministic, so retrying
      // it just re-bills the same failure.
      const retryable = /UND_ERR_HEADERS_TIMEOUT|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|UND_ERR_BODY_TIMEOUT|ERR_STREAM_PREMATURE_CLOSE|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND/i.test(code) ||
        /fetch failed|connection error|Headers Timeout|Body Timeout|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN|ENOTFOUND|429|503|overloaded|timeout/i.test(msg) ||
        /premature close|other side closed|\bterminated\b|dropped mid-response|stream ended with no text content/i.test(msg);
      if (!retryable || attempt >= retries) throw err;
      // A 429 gets the longer base delay plus jitter — without jitter, parallel
      // workers that were rate-limited together retry in lockstep and re-trigger
      // the same limit on every attempt.
      const isRateLimit = status === 429 ||
        /\b429\b|rate.?limit|too many requests|exhausted all available targets/i.test(msg);
      const base = isRateLimit ? RATE_LIMIT_BASE_DELAY_MS : baseDelayMs;
      const jitter = isRateLimit ? 0.75 + Math.random() * 0.5 : 1;
      const delay = Math.round(base * Math.pow(2, attempt) * jitter);
      console.warn(`[models] ${label} ${isRateLimit ? 'rate-limit' : 'retryable'} error (attempt ${attempt + 1}/${retries}): ${code ? `${code} ` : ''}${msg} — retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function enqueueGemini(task) {
  const run = _geminiQueue.then(task, task);
  _geminiQueue = run.catch(() => { });
  return run;
}

function enqueueOpenAI(task) {
  const run = _openaiQueue.then(async () => {
    const waitMs = Math.max(0, OPENAI_MIN_REQUEST_INTERVAL_MS - (Date.now() - _lastOpenAIRequestAt));
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
    try {
      return await task();
    } finally {
      _lastOpenAIRequestAt = Date.now();
    }
  }, async () => task());
  _openaiQueue = run.catch(() => { });
  return run;
}

async function prepareGeminiImage(url) {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Gemini adapter: invalid data URL for image');

  const [, mimeType, data] = match;
  const input = Buffer.from(data, 'base64');

  const output = await sharp(input)
    .rotate()
    .resize({
      width: GEMINI_MAX_IMAGE_DIMENSION,
      height: GEMINI_MAX_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: GEMINI_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  return {
    inlineData: {
      mimeType: 'image/jpeg',
      data: output.toString('base64'),
    },
  };
}

function getOpenAI() {
  if (!_openai) {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key === 'your_openai_api_key_here')
      throw new Error('OPENAI_API_KEY is not set. Add it to backend/.env');
    _openai = new OpenAI({
      apiKey: key,
      timeout: MODEL_CALL_TIMEOUT_MS,
      maxRetries: Number(process.env.OPENAI_SDK_MAX_RETRIES) || 0,
    });
  }
  return _openai;
}

// OpenRouter speaks the OpenAI wire format, so we reuse the `openai` SDK with a
// different base URL. Kept as its own client so an OpenRouter key can never be
// sent to api.openai.com (and vice versa).
function getOpenRouter() {
  if (!_openrouter) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key || key === 'your_openrouter_api_key_here')
      throw new Error('OPENROUTER_API_KEY is not set. Add it to backend/.env');
    _openrouter = new OpenAI({
      apiKey: key,
      baseURL: 'https://openrouter.ai/api/v1',
      timeout: MODEL_CALL_TIMEOUT_MS,
      // Unlike the direct OpenAI client, this defaults to retrying: OpenRouter
      // passes upstream 429s through with a Retry-After header, and the SDK's
      // own retry is the layer that honors it. Set to 0 to disable.
      maxRetries: process.env.OPENROUTER_SDK_MAX_RETRIES !== undefined
        ? Number(process.env.OPENROUTER_SDK_MAX_RETRIES)
        : 3,
      // Note this only helps before the response arrives — once a 200 is
      // returned and the stream is open, a mid-stream drop is past the SDK's
      // reach and only withRetry can recover it.
      ...(_openrouterFetch ? { fetch: _openrouterFetch } : {}),
    });
  }
  return _openrouter;
}

function getAnthropic() {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key || key === 'your_anthropic_api_key_here')
      throw new Error('ANTHROPIC_API_KEY is not set. Add it to backend/.env');
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

async function getGemini() {
  if (!_gemini) {
    const key = process.env.GOOGLE_API_KEY;
    if (!key || key === 'your_google_api_key_here')
      throw new Error('GOOGLE_API_KEY is not set. Add it to backend/.env');
    if (!_googleGenAIClass) {
      ({ GoogleGenAI: _googleGenAIClass } = await import('@google/genai'));
    }
    // fetch option is NOT forwarded by @google/genai's ApiClient — it uses
    // globalThis.fetch directly. The URL-based fetch patch at module load time
    // handles the dispatcher routing without needing a custom fetch here.
    _gemini = new _googleGenAIClass({ apiKey: key });
  }
  return _gemini;
}

// ── Model registry ───────────────────────────────────────────────────────────
// Each entry: { provider, apiModel, label }
//   provider  — 'openai' | 'anthropic' | 'google' | 'openrouter'
//   apiModel  — the exact string sent to the provider's API
//   label     — human-readable name shown in the UI
const MODEL_REGISTRY = {
  // OpenAI
  'gpt-5.5': { provider: 'openai', apiModel: 'gpt-5.5', label: 'GPT-5.5' },
  'gpt-5.6-sol': { provider: 'openai', apiModel: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
  'gpt-5.4': { provider: 'openai', apiModel: 'gpt-5.4', label: 'GPT-5.4' },
  'gpt-4.1': { provider: 'openai', apiModel: 'gpt-4.1', label: 'GPT-4.1' },
  'gpt-4o': { provider: 'openai', apiModel: 'gpt-4o', label: 'GPT-4o' },
  'o4-mini': { provider: 'openai', apiModel: 'o4-mini', label: 'o4-mini' },

  // Anthropic (Claude)
  'claude-opus-4.7': { provider: 'anthropic', apiModel: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
  'claude-sonnet-4.6': { provider: 'anthropic', apiModel: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  'claude-haiku-4.5': { provider: 'anthropic', apiModel: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  'claude-opus-4.6': { provider: 'anthropic', apiModel: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  'claude-opus-4-old': { provider: 'anthropic', apiModel: 'claude-opus-4-20250514', label: 'Claude Opus 4 (old)' },
  'claude-sonnet-4': { provider: 'anthropic', apiModel: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (old)' },

  // Google (Gemini)
  'gemini-3.1-pro': { provider: 'google', apiModel: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  'gemini-3.5-flash': { provider: 'google', apiModel: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  'gemini-3-flash-preview': { provider: 'google', apiModel: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  'gemini-2.5-pro': { provider: 'google', apiModel: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  'gemini-2.5-flash': { provider: 'google', apiModel: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },

  // OpenRouter — models not reachable through the direct provider SDKs.
  // All three accept image input, which the figure pipeline requires.
  // Context limits: Kimi K3 1.05M, Qwen3.8 Max 1.00M, Gemma 4 31B 262k.
  //
  // `requestOptions` is merged into the OpenRouter request body verbatim. It may
  // be a function of maxTokens for options that have to scale with the budget.
  //
  // provider — a model is served by many upstream endpoints whose capabilities
  //   differ, and nothing in the model-level metadata exposes those differences,
  //   so bad endpoints can only be found by hitting them. Prefer `ignore` over
  //   pinning with `order`: these models are capacity-constrained, and narrowing
  //   to one endpoint trades a routing bug for a rate-limit problem.
  //     morph — rejects any request carrying a system prompt with "400 Multi-turn
  //             conversations are not supported" (a fast-apply endpoint, single
  //             user message only). Every pipeline call sends a system prompt,
  //             so leaving it in the pool fails ~1 request in 10.
  //
  // reasoning — reasoning tokens are output tokens: they bill at the completion
  //   rate and are drawn from the same max_tokens budget as the answer. Left
  //   unset, Kimi K3 consumed the planner's entire 10240-token budget thinking
  //   and returned no content at all. Effort is proportional to max_tokens
  //   (high ~80%, medium ~50%, low ~20%); 'medium' matches the default the
  //   OpenAI and Gemini calls run at, so benchmark comparisons stay tier-for-tier.
  'kimi-k3': {
    provider: 'openrouter', apiModel: 'moonshotai/kimi-k3', label: 'Kimi K3',
    requestOptions: { provider: { ignore: ['morph'] }, reasoning: { effort: 'medium' } },
  },
  // Qwen states the same tier as an explicit token budget, because the effort
  // keyword is broken on its only endpoint: Alibaba expands effort:'medium' into
  // a fixed thinking_budget of 32768 instead of a share of max_tokens, then
  // rejects the call for being smaller ("max_completion_tokens [10240] must be
  // greater than thinking_budget [32768]"). Only the multimodal path validates
  // that, so text calls passed while every figure call 400'd. A budget below
  // max_tokens sidesteps the expansion; reasoning cannot simply be turned off
  // either, since enabled:false comes back "mandatory". The fraction keeps the
  // share constant across pipeline stages, which a fixed number would not —
  // note this is a ceiling, not a target: left unset the model chose 71%.
  'qwen3.8-max': {
    provider: 'openrouter', apiModel: 'qwen/qwen3.8-max', label: 'Qwen3.8 Max',
    requestOptions: (maxTokens) => ({
      reasoning: { max_tokens: Math.round(maxTokens * REASONING_MEDIUM_FRACTION) },
    }),
  },
  'gemma-4-31b': { provider: 'openrouter', apiModel: 'google/gemma-4-31b-it', label: 'Gemma 4 31B' },
};

// The list the frontend will render in its dropdown
function getAvailableModels() {
  return Object.entries(MODEL_REGISTRY).map(([id, { label, provider }]) => ({
    id, label, provider,
  }));
}

// ── Provider-specific call implementations ───────────────────────────────────

/**
 * OpenAI chat-completions call.
 * userContent is an array of { type:'image_url'|'text', … } objects — already
 * in OpenAI format, so we pass through directly.
 */
async function callOpenAI(apiModel, systemPrompt, userContent, maxTokens, fewShotExamples = []) {
  const run = async () => {
    const messages = [{ role: 'system', content: systemPrompt }];
    for (const ex of fewShotExamples) {
      messages.push({ role: 'user', content: [{ type: 'text', text: ex.userText }] });
      messages.push({ role: 'assistant', content: ex.assistantContent });
    }
    messages.push({ role: 'user', content: userContent });
    return withTimeout((async () => {
      const stream = await getOpenAI().chat.completions.create({
        model: apiModel,
        max_completion_tokens: maxTokens,
        messages,
        stream: true,
      });
      let text = '';
      for await (const chunk of stream) {
        text += chunk.choices?.[0]?.delta?.content || '';
      }
      return text;
    })(), `${apiModel} call`);
  };

  return run();
}

/**
 * OpenRouter chat-completions call.
 * OpenRouter speaks the OpenAI wire format, so userContent — including the
 * screenshot image_url blocks — passes through untouched; this is the one
 * provider needing no image adapter.
 *
 * Two deliberate differences from callOpenAI:
 *   • sends max_tokens, which is what these models declare support for,
 *     rather than OpenAI's max_completion_tokens.
 *   • inspects each chunk for an `error` field. OpenRouter reports upstream
 *     failures (model unavailable, provider rate limit, image rejected by a
 *     text-only model) inside a 200 response, so without this check they
 *     would surface as a silently empty string instead of a thrown error.
 */
async function callOpenRouter(apiModel, systemPrompt, userContent, maxTokens, fewShotExamples = [], requestOptions = null) {
  const messages = [{ role: 'system', content: systemPrompt }];
  for (const ex of fewShotExamples) {
    messages.push({ role: 'user', content: [{ type: 'text', text: ex.userText }] });
    messages.push({ role: 'assistant', content: ex.assistantContent });
  }
  messages.push({ role: 'user', content: userContent });

  return withTimeout((async () => {
    const stream = await getOpenRouter().chat.completions.create({
      model: apiModel,
      max_tokens: maxTokens,
      messages,
      stream: true,
      // Per-model options (provider routing, reasoning budget) travel as extra
      // body fields; the OpenAI SDK passes unknown params through untouched.
      ...(requestOptions || {}),
    });
    let text = '';
    let finishReason = null;
    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      // OpenRouter signals failure inside a 200 response in more than one shape:
      // a top-level `error` on the chunk, an `error` on the choice, or — once
      // streaming has already started — an otherwise normal-looking chunk
      // carrying finish_reason: 'error'. Missing the last one would let a
      // mid-stream rate limit fall through to the empty-output check below and
      // get reported as the wrong cause.
      const streamErr = chunk.error || choice?.error;
      if (streamErr || choice?.finish_reason === 'error') {
        const { message, code } = streamErr || {};
        throw new Error(`OpenRouter ${apiModel}: ` +
          (message || (streamErr ? JSON.stringify(streamErr) : 'stream terminated with finish_reason=error')) +
          (code ? ` (code ${code})` : ''));
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      text += choice?.delta?.content || '';
    }
    // Truncation at the token budget. Left undetected this returns partial code
    // that reads as a successful generation and only fails when the figure runs.
    if (finishReason === 'length') {
      throw new Error(`OpenRouter ${apiModel}: output truncated at the ${maxTokens}-token budget ` +
        `(finish_reason=length) after ${text.length} chars — raise maxTokens for this stage`);
    }
    // A stream that ends without ever reporting a finish reason did not end, it
    // was cut: the socket dropped mid-response. This is the case that used to be
    // silent, since the partial text looks like a normal return value.
    if (!finishReason) {
      throw new Error(`OpenRouter ${apiModel}: stream ended without a finish reason after ` +
        `${text.length} chars — connection dropped mid-response`);
    }
    // An empty completion downstream becomes a blank figure with no obvious
    // cause — usually a reasoning-only response. Fail loudly instead.
    if (!text.trim()) throw new Error(`OpenRouter ${apiModel}: stream ended with no text content`);
    return text;
  })(), `${apiModel} call`);
}

/**
 * Anthropic messages call.
 * Converts OpenAI-style userContent → Anthropic format:
 *   image_url { url: "data:mime;base64,…" }  →  image { source: { type:'base64', media_type, data } }
 *   text { text }                              →  text { text }
 */
async function callAnthropic(apiModel, systemPrompt, userContent, maxTokens, fewShotExamples = []) {
  function toAnthropicContent(blocks) {
    return blocks.map(block => {
      if (block.type === 'image_url') {
        const url = block.image_url.url;
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) throw new Error('Anthropic adapter: invalid data URL for image');
        return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
      }
      return { type: 'text', text: block.text };
    });
  }

  const messages = [];
  for (const ex of fewShotExamples) {
    messages.push({ role: 'user', content: [{ type: 'text', text: ex.userText }] });
    messages.push({ role: 'assistant', content: ex.assistantContent });
  }
  messages.push({ role: 'user', content: toAnthropicContent(userContent) });

  return withTimeout((async () => {
    // Use streaming to avoid Anthropic's 10-minute timeout on large max_tokens
    const stream = getAnthropic().messages.stream({
      model: apiModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });

    const finalMessage = await stream.finalMessage();

    // Anthropic returns content as an array of blocks
    return finalMessage.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
  })(), `${apiModel} call`);
}

/**
 * Google Gemini call — uses streaming to avoid the ~60 s HTTP connection
 * timeout that Google imposes on non-streaming generateContent requests.
 * With generateContentStream, tokens arrive immediately and we accumulate them.
 */
async function callGemini(apiModel, systemPrompt, userContent, maxTokens, fewShotExamples = []) {
  const client = await getGemini();

  const contents = [];
  for (const ex of fewShotExamples) {
    contents.push({ role: 'user', parts: [{ text: ex.userText }] });
    contents.push({ role: 'model', parts: [{ text: ex.assistantContent }] });
  }
  const parts = await Promise.all(userContent.map(async block => {
    if (block.type === 'image_url') {
      return prepareGeminiImage(block.image_url.url);
    }
    return { text: block.text };
  }));
  contents.push({ role: 'user', parts });

  return withTimeout((async () => {
    try {
      // Use streaming to avoid Google's ~60 s HTTP connection timeout.
      // generateContent (non-streaming) waits for full output before sending
      // the first byte, which exceeds the timeout for large HTML generations.
      const stream = await client.models.generateContentStream({
        model: apiModel,
        contents,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: maxTokens,
        },
      });

      let text = '';
      for await (const chunk of stream) {
        text += chunk.text ?? '';
      }
      return text;
    } catch (err) {
      const cause = err.cause;
      console.error(`[Gemini] ${apiModel} call failed: ${err.message}` +
        (cause ? ` | cause: ${cause.code || ''} ${cause.message || ''}` : ''));
      throw err;
    }
  })(), `${apiModel} call`);
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * generateWithModel — unified generation call.
 *
 * @param {string}   modelId      — key in MODEL_REGISTRY (e.g. 'gpt-5.4', 'claude-sonnet-4')
 * @param {string}   systemPrompt — the full system prompt
 * @param {Array}    userContent  — OpenAI-format content array
 *                                  [{ type:'image_url', image_url:{url} }, { type:'text', text }]
 * @param {number}   maxTokens    — max completion tokens (default 16384)
 * @returns {Promise<string>}     — raw text from the model
 */
async function generateWithModel(modelId, { systemPrompt, userContent, maxTokens = 50000, fewShotExamples = [] }) {
  const entry = MODEL_REGISTRY[modelId];
  if (!entry) throw new Error(`Unknown model: "${modelId}". Available: ${Object.keys(MODEL_REGISTRY).join(', ')}`);

  const { provider, apiModel } = entry;
  // An entry may express its options as a function when they depend on the
  // caller's token budget, which differs per pipeline stage.
  const requestOptions = typeof entry.requestOptions === 'function'
    ? entry.requestOptions(maxTokens)
    : (entry.requestOptions || null);
  const callId = randomUUID();
  const startedAt = new Date().toISOString();
  const recordBase = {
    id: callId,
    startedAt,
    modelId,
    provider,
    apiModel,
  };
  appendLLMInputLog({
    ...recordBase,
    event: 'llm_input',
    systemPrompt,
    userContent: summarizeUserContent(userContent),
    fewShotExamples,
    maxTokens,
  });
  const finalize = (out, err) => {
    const finishedAt = new Date().toISOString();
    const durationMs = Date.parse(finishedAt) - Date.parse(startedAt);
    const outputText = typeof out === 'string' ? out : '';
    appendLLMInputLog({
      ...recordBase,
      event: 'call_end',
      finishedAt,
      durationMs,
      success: !err,
      outputChars: outputText.length,
      outputText,
      ...(err ? { error: String(err?.message || err) } : {}),
    });
  };
  switch (provider) {
    case 'openai':
      return withRetry(modelId, () =>
        callOpenAI(apiModel, systemPrompt, userContent, maxTokens, fewShotExamples)
          .then((out) => { finalize(out); return out; })
          .catch((e) => { finalize(null, e); throw e; })
      );
    case 'openrouter':
      return withRetry(modelId, () =>
        callOpenRouter(apiModel, systemPrompt, userContent, maxTokens, fewShotExamples, requestOptions)
          .then((out) => { finalize(out); return out; })
          .catch((e) => { finalize(null, e); throw e; }),
        OPENROUTER_MAX_RETRIES
      );
    case 'anthropic':
      return withRetry(modelId, () =>
        callAnthropic(apiModel, systemPrompt, userContent, maxTokens, fewShotExamples)
          .then((out) => { finalize(out); return out; })
          .catch((e) => { finalize(null, e); throw e; })
      );
    case 'google':
      return withRetry(modelId, () =>
        callGemini(apiModel, systemPrompt, userContent, maxTokens, fewShotExamples)
          .then((out) => { finalize(out); return out; })
          .catch((e) => { finalize(null, e); throw e; })
      );
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

module.exports = { generateWithModel, getAvailableModels, MODEL_REGISTRY };
