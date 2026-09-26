#!/usr/bin/env node
/**
 * batch_context_exports.js — drive a fixed set of context-export figures through
 * the full pipeline (plan → generate → verify → critique → decide, iterating)
 * without going through the Context Exports tab by hand.
 *
 * It POSTs the same body App.js:handleRun does and polls the same status route,
 * so every result lands in context_export_results/ + context_export_html/<experiment>/
 * exactly as a UI run would. Selecting 20 rows out of 250 by hand is the part
 * this replaces — nothing about the generation path differs.
 *
 * Resume is derived, not bookkept: a figure counts as done when a record for
 * (experiment, contextExportId) already exists on disk. Re-running after a crash
 * therefore picks up only what is actually missing, with no checkpoint file to
 * go stale. Pass FORCE=1 to regenerate regardless.
 *
 * Concurrency defaults to the full set at once. That is deliberate: the Anthropic
 * limits leave ~20x headroom at this size, and the render queue in
 * runtime-helpers.js serializes every verify screenshot process-wide anyway, so
 * the browser cannot be fanned out no matter what is set here.
 *
 * The server must already be running with the domain filter lifted:
 *   CONTEXT_EXPORT_DOMAINS=all node server.js
 *
 * Usage:  node batch_context_exports.js [--model claude-opus-5] [--experiment NAME]
 *                                       [--concurrency N] [--dry-run]
 */
const fs = require('fs');
const path = require('path');

const API = process.env.API_BASE || 'http://localhost:3001';
const CONTEXT_EXPORT_RESULTS_DIR = process.env.CONTEXT_EXPORT_RESULTS_DIR
  ? path.resolve(process.env.CONTEXT_EXPORT_RESULTS_DIR)
  : path.join(__dirname, 'context_export_results');

// The 20-figure benchmark subset (figure-platform/20_images). Spans both the
// original 100 rows and the 150-row `new_*` batch, which is why the server needs
// CONTEXT_EXPORT_DOMAINS=all — the default listing hides 16 of these.
const FIGURE_IDS = [
  '14_2_10', '14_3_10', '1_6_4', '24_4', '2_2', '5_8_4',
  'CNX_Calc_Figure_12_04_013', 'CNX_Chem_01_01_FuelCell', 'CNX_Chem_02_02_Rutherford',
  'CNX_Chem_06_03_Electrnin', 'CNX_Chem_12_07_Enzyme', 'CNX_UPhysics_15_05_SimplePend',
  'CNX_UPhysics_25_01_cylind', 'DiffusionUNet', 'GraphAdjoint',
  'no_picture_on_a_wall_aina', 'OChem_28_04_001', 'orthogonal_projection',
  'SupervisedOpt', 'telescope2',
];

// Opus 5 first-party rates, $/token. Used only for the closing cost report.
const PRICE_IN = 5.00 / 1e6;
const PRICE_OUT = 25.00 / 1e6;

function parseArgs(argv) {
  const options = {
    model: 'claude-opus-5',
    experiment: 'full-pipeline-claude-opus-5_FINAL',
    concurrency: 0,          // 0 → everything at once
    maxAttempts: 3,
    ids: null,              // explicit id list, overrides FIGURE_IDS
    limit: 0,               // 0 → no cap
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--model') options.model = argv[++i];
    else if (arg === '--experiment') options.experiment = argv[++i];
    else if (arg === '--concurrency') options.concurrency = Number(argv[++i]) || 0;
    else if (arg === '--max-attempts') options.maxAttempts = Number(argv[++i]) || 3;
    // --ids / --limit exist for running a bounded wave: a fixed set that starts
    // together and is never refilled from a backlog. With a rolling queue, a
    // run stopped at a deadline strands whatever is mid-generation; a bounded
    // wave finishes everything it started.
    else if (arg === '--ids') options.ids = String(argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (arg === '--limit') options.limit = Number(argv[++i]) || 0;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node batch_context_exports.js [--model M] [--experiment NAME] [--concurrency N] [--max-attempts N] [--dry-run]');
      process.exit(0);
    }
  }
  return options;
}

// A figure is addressed by two spellings of the same id: original_100_figures.json
// writes "14.3.10" while the context-export row — and therefore the saved record —
// canonicalises to "14_3_10". Comparing the raw strings makes every dotted id look
// outstanding forever, so a resume silently regenerates work that is already on
// disk and re-bills it. Normalise both sides before matching.
const normalizeId = (id) => String(id || '').replace(/\./g, '_');

/** Context-export ids that already have a record for this experiment, keyed by normalized id. */
function completedIds(experiment) {
  const done = new Map();
  if (!fs.existsSync(CONTEXT_EXPORT_RESULTS_DIR)) return done;
  for (const file of fs.readdirSync(CONTEXT_EXPORT_RESULTS_DIR)) {
    if (!file.endsWith('.json')) continue;
    try {
      const record = JSON.parse(fs.readFileSync(path.join(CONTEXT_EXPORT_RESULTS_DIR, file), 'utf-8'));
      if (record.experiment === experiment && record.contextExportId) {
        done.set(normalizeId(record.contextExportId), record.id);
      }
    } catch { /* unreadable record — treat as not done and regenerate */ }
  }
  return done;
}

const stamp = () => new Date().toISOString().slice(11, 19);
const mins = (ms) => (ms / 60000).toFixed(1);

async function runOne(id, options, state) {
  const startedAt = Date.now();
  const body = {
    id,
    model: options.model,
    plannerModel: options.model,
    evalModel: options.model,
    experiment: options.experiment,
    criticVersion: 'context_export',
    maxAttempts: options.maxAttempts,
    noPlanner: false,
  };

  let jobId;
  try {
    const res = await fetch(`${API}/api/context-export-generate-async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    jobId = data.jobId;
  } catch (err) {
    console.log(`[${stamp()}] ✗ ${id} — failed to start: ${err.message}`);
    return { id, status: 'error', error: `start: ${err.message}` };
  }

  console.log(`[${stamp()}] → ${id} started (job ${jobId})`);

  // Poll until the job settles. A few consecutive poll failures are tolerated —
  // the generation itself is still running server-side, and a dropped poll is
  // not a reason to abandon a figure that may be minutes from finishing.
  let pollFailures = 0;
  for (let i = 0; i < 1800; i += 1) {          // 1800 × 4s ≈ 2 hours
    await new Promise(r => setTimeout(r, 4000));
    try {
      const res = await fetch(`${API}/api/generate-status/${encodeURIComponent(jobId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      pollFailures = 0;
      if (data.status === 'done') {
        const elapsed = Date.now() - startedAt;
        state.completed += 1;
        console.log(`[${stamp()}] ✓ ${id} — ${mins(elapsed)} min  (${state.completed}/${state.total} done)`);
        return { id, status: 'ok', figureId: data.result?.figureId, elapsed };
      }
      if (data.status === 'error') {
        const elapsed = Date.now() - startedAt;
        state.completed += 1;
        console.log(`[${stamp()}] ✗ ${id} — ${data.error} (after ${mins(elapsed)} min)`);
        return { id, status: 'error', error: data.error, elapsed };
      }
    } catch (err) {
      pollFailures += 1;
      if (pollFailures >= 10) {
        console.log(`[${stamp()}] ✗ ${id} — lost contact with server: ${err.message}`);
        return { id, status: 'error', error: `poll: ${err.message}` };
      }
    }
  }
  return { id, status: 'error', error: 'timed out waiting for job' };
}

/** Sum token spend for this experiment's log files, for the closing report. */
function costReport(experiment) {
  const dir = path.join(__dirname, 'context_export_llm_logs', experiment);
  if (!fs.existsSync(dir)) return null;
  let input = 0, output = 0, calls = 0;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.jsonl')) continue;
    for (const line of fs.readFileSync(path.join(dir, file), 'utf-8').trim().split(/\r?\n/)) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.event !== 'call_end' || !entry.usage) continue;
        input += entry.usage.inputTokens || 0;
        output += entry.usage.outputTokens || 0;
        calls += 1;
      } catch { /* skip malformed line */ }
    }
  }
  return { input, output, calls, cost: input * PRICE_IN + output * PRICE_OUT };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const done = completedIds(options.experiment);
  const force = process.env.FORCE === '1';
  const source = options.ids && options.ids.length ? options.ids : FIGURE_IDS;
  let queue = force ? [...source] : source.filter(id => !done.has(normalizeId(id)));
  const available = queue.length;
  if (options.limit > 0) queue = queue.slice(0, options.limit);
  const concurrency = options.concurrency > 0 ? Math.min(options.concurrency, queue.length) : queue.length;

  console.log(`model=${options.model}  experiment=${options.experiment}  maxAttempts=${options.maxAttempts}`);
  console.log(`${source.length} candidates, ${done.size} already done${force ? ' (ignored: FORCE=1)' : ''}, ${available} outstanding`);
  console.log(`running ${queue.length} at concurrency ${concurrency}${options.limit > 0 && available > queue.length ? ` (${available - queue.length} left for a later run)` : ''}`);
  if (!queue.length) { console.log('Nothing to do.'); return; }
  if (options.dryRun) { console.log('Dry run — would run:', queue.join(', ')); return; }

  const startedAt = Date.now();
  const state = { completed: 0, total: queue.length };
  const pending = [...queue];
  const results = [];
  const worker = async () => {
    while (pending.length) {
      const id = pending.shift();
      results.push(await runOne(id, options, state));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));

  const ok = results.filter(r => r.status === 'ok');
  const failed = results.filter(r => r.status !== 'ok');
  console.log(`\n═══ ${ok.length}/${results.length} succeeded in ${mins(Date.now() - startedAt)} min ═══`);
  for (const r of failed) console.log(`  ✗ ${r.id}: ${r.error}`);

  const cost = costReport(options.experiment);
  if (cost) {
    console.log(`\nToken spend for ${options.experiment} (all runs to date):`);
    console.log(`  ${cost.calls} calls  in=${cost.input.toLocaleString()}  out=${cost.output.toLocaleString()}  ≈ $${cost.cost.toFixed(2)}`);
  }
  if (failed.length) process.exitCode = 1;
}

main().catch(err => { console.error('FAIL', err.message); process.exit(1); });
