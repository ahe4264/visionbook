#!/usr/bin/env node
/**
 * retry_asap.js — relaunch a figure the moment it fails, instead of at the end
 * of a round.
 *
 * regenerate_until_clean.js waits for every job in a round to settle before it
 * quarantines failures and starts the next round. With 16 figures running and a
 * spread of 7 to 20 minutes, a figure that dies at minute 7 sits idle for the
 * remaining 13. This watcher removes that wait: it polls the result directory,
 * and the instant a figure lands an error record it quarantines that record and
 * posts a fresh job for it.
 *
 * Not double-starting is the whole difficulty, because killing a driver does not
 * stop a server-side job — that is how boats and mrf ended up with several
 * records each. Three states are tracked separately:
 *
 *   mine      jobs this process started; polled by job id, so they are exact.
 *   adopted   jobs started by the previous driver. They have a recently written
 *             llm log but no record yet, so they are still running and must be
 *             left alone rather than restarted.
 *   startable everything else: no record or an error record, nothing in flight.
 *
 * A figure is only launched from `startable`, so nothing is ever run twice.
 *
 * Usage:
 *   node retry_asap.js --ids-file _retry_targets.txt --model claude-opus-5-cc \
 *        --adopt-since 2026-09-23T06:00:00Z
 */
const fs = require('fs');
const path = require('path');

const API = process.env.API_BASE || 'http://localhost:3001';
const RESULTS = path.join(__dirname, 'context_export_results');
const HTML_ROOT = path.join(__dirname, 'context_export_html');
const QUARANTINE = '_degraded';
const TICK_MS = 10_000;

function parseArgs(argv) {
  const o = {
    experiment: 'full-pipeline-claude-opus-5_FINAL',
    idsFile: '_retry_targets.txt',
    model: 'claude-opus-5-cc',
    maxAttempts: 3,
    adoptWindowMs: 20 * 60 * 1000,   // an llm log quiet this long means the job is gone
    maxLaunches: 8,        // per figure, a safety stop against an infinite loop
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--experiment') o.experiment = argv[++i];
    else if (a === '--ids-file') o.idsFile = argv[++i];
    else if (a === '--model') o.model = argv[++i];
    else if (a === '--max-attempts') o.maxAttempts = Number(argv[++i]) || 3;
    else if (a === '--adopt-window-min') o.adoptWindowMs = (Number(argv[++i]) || 20) * 60 * 1000;
    else if (a === '--max-launches') o.maxLaunches = Number(argv[++i]) || 8;
  }
  return o;
}

const norm = (id) => String(id || '').replace(/\./g, '_');
const stamp = () => new Date().toISOString().slice(11, 19);

/** figure -> {file, record} for this experiment, one entry per figure. */
function records(experiment) {
  const out = new Map();
  for (const f of fs.readdirSync(RESULTS)) {
    if (!f.endsWith('.json')) continue;
    let r;
    try { r = JSON.parse(fs.readFileSync(path.join(RESULTS, f), 'utf-8')); } catch { continue; }
    if (r.experiment !== experiment || !r.contextExportId) continue;
    out.set(norm(r.contextExportId), { file: f, record: r });
  }
  return out;
}

/**
 * Figures with an llm log touched within `windowMs` — something is still writing
 * to them, so a job is alive. A fixed "started after T" test cannot be used for
 * this: a job that dies without writing a record would stay adopted forever and
 * never be retried. Freshness expires on its own instead.
 */
function activeJobs(experiment, windowMs) {
  const dir = path.join(__dirname, 'context_export_llm_logs', experiment);
  const out = new Set();
  if (!fs.existsSync(dir)) return out;
  const cutoff = Date.now() - windowMs;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.jsonl')) continue;
    if (fs.statSync(path.join(dir, f)).mtimeMs < cutoff) continue;
    out.add(norm(f.split('__')[1] || ''));
  }
  return out;
}

/** Move a failed record aside so the figure reads as outstanding again. */
function quarantine(experiment, entry) {
  const qRec = path.join(RESULTS, QUARANTINE);
  const qHtml = path.join(HTML_ROOT, experiment, QUARANTINE);
  fs.mkdirSync(qRec, { recursive: true });
  fs.mkdirSync(qHtml, { recursive: true });
  fs.renameSync(path.join(RESULTS, entry.file), path.join(qRec, entry.file));
  const html = entry.record.standaloneHtmlPath ? path.basename(entry.record.standaloneHtmlPath) : null;
  if (html) {
    const from = path.join(HTML_ROOT, experiment, html);
    if (fs.existsSync(from)) fs.renameSync(from, path.join(qHtml, html));
  }
}

async function launch(id, o) {
  const res = await fetch(`${API}/api/context-export-generate-async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      model: o.model,
      plannerModel: o.model,
      evalModel: o.model,
      experiment: o.experiment,
      criticVersion: 'context_export',
      maxAttempts: o.maxAttempts,
      noPlanner: false,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.jobId;
}

async function settled(jobId) {
  try {
    const res = await fetch(`${API}/api/generate-status/${encodeURIComponent(jobId)}`);
    const data = await res.json();
    if (!res.ok) return false;
    return data.status === 'done' || data.status === 'error';
  } catch {
    return false;            // a dropped poll is not a finished job
  }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const targets = fs.readFileSync(path.join(__dirname, o.idsFile), 'utf-8')
    .split(',').map(s => s.trim()).filter(Boolean);

  console.log(`retry_asap: ${targets.length} target(s)  model=${o.model}  experiment=${o.experiment}`);
  console.log(`treating a figure as in flight while its llm log has been touched in the last ${o.adoptWindowMs / 60000} min`);

  const mine = new Map();          // figure -> jobId
  const launches = new Map();      // figure -> count
  let done = false;

  while (!done) {
    const recs = records(o.experiment);
    const adopted = activeJobs(o.experiment, o.adoptWindowMs);

    // Retire finished jobs of our own so the figure can be re-evaluated.
    for (const [fig, jobId] of [...mine]) {
      if (await settled(jobId)) mine.delete(fig);
    }

    const outstanding = [];
    for (const t of targets) {
      const id = norm(t);
      const entry = recs.get(id);
      const attempts = entry ? (entry.record.attempts || []) : [];
      const last = attempts[attempts.length - 1] || {};
      if (entry && last.status !== 'error') continue;         // clean, nothing to do
      outstanding.push({ t, id, entry });
    }

    if (!outstanding.length) {
      console.log(`[${stamp()}] ALL CLEAN — ${targets.length}/${targets.length}`);
      done = true;
      break;
    }

    for (const { t, id, entry } of outstanding) {
      if (mine.has(id)) continue;                              // our job still running
      // A job we did not start is still running iff it has a log but no record.
      if (!entry && adopted.has(id)) continue;
      const n = launches.get(id) || 0;
      if (n >= o.maxLaunches) continue;

      if (entry) {
        quarantine(o.experiment, entry);
        console.log(`[${stamp()}] ${id} failed (${String(last_status(entry)).slice(0, 60)}) — quarantined`);
      }
      try {
        const jobId = await launch(t, o);
        mine.set(id, jobId);
        launches.set(id, n + 1);
        console.log(`[${stamp()}] → ${id} relaunched (job ${jobId}, launch ${n + 1})`);
      } catch (err) {
        console.log(`[${stamp()}] ✗ ${id} could not start: ${err.message}`);
      }
    }

    console.log(`[${stamp()}] outstanding=${outstanding.length}  mine=${mine.size}  adopted=${[...adopted].filter(a => !recs.has(a)).length}`);
    await new Promise(r => setTimeout(r, TICK_MS));
  }
}

function last_status(entry) {
  const att = entry.record.attempts || [];
  return (att[att.length - 1] || {}).error || 'error';
}

main().catch(err => { console.error('FAIL', err.message); process.exit(1); });
