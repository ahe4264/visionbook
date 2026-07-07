/**
 * batch_3d_demo_experiment.js - parallel 3D standalone-demo prompt experiment.
 *
 * This is intentionally separate from the benchmark run:
 *   - output: agent_3d_demo_out/ by default, or THREE_D_DEMO_OUT
 *   - prompt profile: standalone-demo
 *   - runner: 5 figures concurrently by default
 */

require('dotenv').config();

process.env.GENERATOR_MODE = process.env.GENERATOR_MODE || 'agent';
process.env.PLANNER_PROFILE = process.env.PLANNER_PROFILE || 'standalone-demo';
process.env.GENERATION_PROFILE = process.env.GENERATION_PROFILE || 'standalone-demo';
process.env.AGENT_GEN_MODEL = process.env.AGENT_GEN_MODEL || 'sonnet';
process.env.AGENT_GEN_MAX_TURNS = process.env.AGENT_GEN_MAX_TURNS || '10';
process.env.AGENT_GEN_TIMEOUT_MS = process.env.AGENT_GEN_TIMEOUT_MS || '420000';
process.env.AGENT_GEN_CONCURRENCY = process.env.AGENT_GEN_CONCURRENCY || '5';
process.env.AGENT_GEN_RENDER_WAIT_MS = process.env.AGENT_GEN_RENDER_WAIT_MS || '3500';
process.env.AGENT_GEN_EFFORT = process.env.AGENT_GEN_EFFORT || 'low';
process.env.AGENT_GEN_THINKING_TOKENS = process.env.AGENT_GEN_THINKING_TOKENS || '4096';
process.env.TEST_MAX_ATTEMPTS = process.env.TEST_MAX_ATTEMPTS || '1';

if (!process.env.PUPPETEER_CACHE_DIR || /cursor-sandbox-cache|\/T\//.test(process.env.PUPPETEER_CACHE_DIR)) {
  process.env.PUPPETEER_CACHE_DIR = `${process.env.HOME}/.cache/puppeteer`;
}

const fs = require('fs');
const path = require('path');
const { runFigureLoop } = require('./figure_loop');
const { loadBaseScaffold } = require('./runtime-helpers');
const { verifyFigure, DEFAULT_VIEWPORTS } = require('./verify');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CH = path.join(REPO_ROOT, 'figure-platform', 'chapter-figures');
const OUT = path.resolve(__dirname, process.env.THREE_D_DEMO_OUT || 'agent_3d_demo_out');
const MANIFEST = path.join(OUT, 'manifest.json');
const LOG = path.join(OUT, 'progress.log');
const PORT = Number(process.env.THREE_D_DEMO_PORT) || 8978;
const FORCE = process.env.FORCE === '1';
const MAX_ATTEMPTS = Number(process.env.TEST_MAX_ATTEMPTS) || 1;
const PROFILE_LABEL = process.env.THREE_D_DEMO_LABEL || 'standalone-demo';
const PLANNER_MODEL = process.env.TEST_PLANNER_MODEL || 'gpt-4o';
const CRITIC_MODEL = process.env.TEST_CRITIC_MODEL || 'gpt-4o';
const FIGURE_TIMEOUT_MS = Number(process.env.FIGURE_HARD_TIMEOUT_MS) || 720000;
const RUNNER_CONCURRENCY = Number(process.env.THREE_D_DEMO_RUNNER_CONCURRENCY || process.env.AGENT_GEN_CONCURRENCY) || 5;

const FIRST_FIVE = [
  { name: 'brdf', chapter: 'imaging' },
  { name: 'epipolar_geometry', chapter: '3d_scene_understanding_stereo' },
  { name: 'gabors', chapter: 'spatial_filter_sets' },
  { name: 'homography_plane_geometry2', chapter: 'homography' },
  { name: 'yaw_pitch_roll', chapter: '2d_motion_from_3d' },
];

function withImagePath(f) {
  return { ...f, imagePath: f.imagePath || path.join(CH, f.chapter, 'candidates_3d', `${f.name}.png`) };
}

function loadBenchmarkFigures() {
  const manifestPath = path.join(__dirname, 'agent_batch_out', 'manifest.json');
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return Object.values(manifest.figures || {}).map(f => withImagePath({
      name: f.name,
      chapter: f.chapter,
      imagePath: f.imagePath,
    }));
  } catch {
    return FIRST_FIVE.map(withImagePath);
  }
}

function selectedFigures() {
  const scope = (process.env.THREE_D_DEMO_SCOPE || 'first5').toLowerCase();
  const first = FIRST_FIVE.map(withImagePath);
  if (scope === 'first5') return first;
  const all = loadBenchmarkFigures();
  const firstNames = new Set(first.map(f => f.name));
  if (scope === 'remaining') return all.filter(f => !firstNames.has(f.name));
  if (scope === 'all') return all;
  const names = new Set(scope.split(',').map(s => s.trim()).filter(Boolean));
  return all.filter(f => names.has(f.name));
}

const FIGURES = selectedFigures();

fs.mkdirSync(OUT, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

function loadManifest() {
  if (fs.existsSync(MANIFEST)) {
    try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { /* fresh */ }
  }
  return {
    startedAt: new Date().toISOString(),
    profile: PROFILE_LABEL,
    params: {
      plannerProfile: process.env.PLANNER_PROFILE,
      generationProfile: process.env.GENERATION_PROFILE,
      generatorMode: process.env.GENERATOR_MODE,
      agentModel: process.env.AGENT_GEN_MODEL,
      agentConcurrency: process.env.AGENT_GEN_CONCURRENCY,
      maxAttempts: MAX_ATTEMPTS,
      scope: process.env.THREE_D_DEMO_SCOPE || 'first5',
      effort: process.env.AGENT_GEN_EFFORT,
      thinkingTokens: process.env.AGENT_GEN_THINKING_TOKENS,
      maxTurns: process.env.AGENT_GEN_MAX_TURNS,
      timeoutMs: process.env.AGENT_GEN_TIMEOUT_MS,
      outputDir: OUT,
    },
    figures: {},
  };
}

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`hard timeout after ${ms}ms (${label})`)), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
}

function withBackButton(html) {
  const back = `<a href="http://127.0.0.1:8976/gallery.html" style="position:fixed;left:14px;top:14px;z-index:2147483647;background:rgba(15,23,42,.92);color:#fff;border:1px solid rgba(148,163,184,.55);border-radius:999px;padding:8px 12px;font:600 13px system-ui,-apple-system,Segoe UI,sans-serif;text-decoration:none;box-shadow:0 10px 30px rgba(0,0,0,.25)">&#8249; Back to gallery</a>`;
  if (html.includes('data-gallery-back-button')) return html;
  const marker = '<body';
  const idx = html.toLowerCase().indexOf(marker);
  if (idx < 0) return `${back}${html}`;
  const close = html.indexOf('>', idx);
  if (close < 0) return `${back}${html}`;
  return `${html.slice(0, close + 1)}<div data-gallery-back-button>${back}</div>${html.slice(close + 1)}`;
}

async function runOne(fig, scaffold) {
  if (!fs.existsSync(fig.imagePath)) throw new Error(`missing source image: ${fig.imagePath}`);
  const base64 = fs.readFileSync(fig.imagePath).toString('base64');
  const mediaType = 'image/png';
  const started = Date.now();
  const loopState = await withTimeout(runFigureLoop({
    figureStem: fig.name,
    chapterName: fig.chapter,
    imageData: { base64, mediaType },
    scaffold,
    sourceBase64: base64,
    sourceMediaType: mediaType,
    maxAttempts: MAX_ATTEMPTS,
    passThreshold: 4.0,
    plannerModel: PLANNER_MODEL,
    generatorModel: 'gpt-5.5',
    criticModel: CRITIC_MODEL,
    fewShot: { planner: false, critic: false, orchestrator: false },
  }), FIGURE_TIMEOUT_MS, fig.name);

  const wallMs = Date.now() - started;
  const htmlFile = `${fig.name}.demo.html`;
  const timingFile = `${fig.name}.timing.json`;
  if (loopState.currentHtml) fs.writeFileSync(path.join(OUT, htmlFile), withBackButton(loopState.currentHtml));

  let verification = null;
  let screenshotFile = null;
  if (loopState.currentHtml) {
    const report = await verifyFigure(loopState.currentHtml, { viewports: DEFAULT_VIEWPORTS });
    verification = { ok: report.ok, errors: report.errors, warnings: report.warnings };
    if (report.screenshot) {
      screenshotFile = `${fig.name}.demo.jpg`;
      fs.writeFileSync(path.join(OUT, screenshotFile), Buffer.from(report.screenshot, 'base64'));
    }
  }

  const rec = {
    ...fig,
    status: loopState.status,
    bestScore: loopState.bestScore,
    scores: loopState.currentEvaluation || null,
    attemptsUsed: loopState.timings?.attempts?.length || loopState.attempts?.length || 0,
    maxAttempts: MAX_ATTEMPTS,
    wallMs,
    verification,
    htmlFile: loopState.currentHtml ? htmlFile : null,
    screenshotFile,
    finishedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT, timingFile), JSON.stringify({
    figureStem: fig.name,
    chapter: fig.chapter,
    wallMs,
    status: loopState.status,
    bestScore: loopState.bestScore,
    timings: loopState.timings,
    agentRuns: (loopState.attempts || []).map(a => a.agentRun || null),
    profile: PROFILE_LABEL,
  }, null, 2));
  return rec;
}

function dataUri(file, mime) {
  try { return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`; }
  catch { return ''; }
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function buildGallery(manifest) {
  const cards = FIGURES.map(fig => {
    const r = manifest.figures[fig.name] || {};
    const src = dataUri(fig.imagePath, 'image/png');
    const shot = r.screenshotFile ? dataUri(path.join(OUT, r.screenshotFile), 'image/jpeg') : '';
    const overall = r.scores?.overall_average ?? r.bestScore ?? null;
    return `<section class="card">
      <h2>${fig.name}<small>${fig.chapter}</small></h2>
      <div class="cols">
        <div><h3>source</h3>${src ? `<img src="${src}">` : '<div class="missing">missing</div>'}</div>
        <div><h3>standalone-demo profile</h3>${shot ? `<img src="${shot}">` : '<div class="missing">pending</div>'}
          <div class="meta"><span>${r.status || 'pending'}</span><span>score ${overall ?? '-'}/5</span><span>${r.verification?.ok ? 'verified' : r.verification ? 'verify issues' : ''}</span>${r.htmlFile ? `<a href="${r.htmlFile}">open</a>` : ''}</div>
        </div>
      </div>
    </section>`;
  }).join('\n');

  const done = Object.values(manifest.figures || {}).filter(f => f.htmlFile).length;
  const html = `<!doctype html><html><head><meta charset="utf-8"><base href="http://127.0.0.1:${PORT}/"><title>3D ${esc(PROFILE_LABEL)} Experiment</title><style>
  *{box-sizing:border-box}body{margin:0;background:#0f172a;color:#e5e7eb;font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}header{position:sticky;top:0;background:#111827ee;backdrop-filter:blur(8px);border-bottom:1px solid #334155;padding:18px 24px;z-index:2}h1{margin:0 0 4px;font-size:22px}.summary{color:#94a3b8}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(760px,1fr));gap:18px;padding:18px}.card{background:#111827;border:1px solid #334155;border-radius:16px;padding:16px}h2{margin:0 0 12px;font-size:18px}small{display:block;color:#94a3b8;font-size:12px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}h3{margin:0 0 6px;text-transform:uppercase;letter-spacing:.06em;font-size:12px;color:#94a3b8}img{width:100%;height:320px;object-fit:contain;background:#020617;border:1px solid #334155;border-radius:10px}.missing{height:320px;display:grid;place-items:center;border:1px dashed #334155;border-radius:10px;color:#94a3b8}.meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px;color:#94a3b8}.meta a{margin-left:auto;color:#60a5fa;text-decoration:none;font-weight:600}@media(max-width:800px){.grid{grid-template-columns:1fr}.cols{grid-template-columns:1fr}img,.missing{height:260px}}</style></head><body>
  <header><h1>3D ${esc(PROFILE_LABEL)} Prompt Experiment</h1><div class="summary">${done}/${FIGURES.length} complete · planner/generator profile: ${esc(process.env.GENERATION_PROFILE)} · attempts: ${MAX_ATTEMPTS} · agent effort: ${esc(process.env.AGENT_GEN_EFFORT)} · parallel agent calls: ${manifest.params?.agentConcurrency}</div></header>
  <main class="grid">${cards}</main></body></html>`;
  fs.writeFileSync(path.join(OUT, 'gallery.html'), html);
}

(async () => {
  fs.writeFileSync(LOG, '');
  const manifest = loadManifest();
  const { scaffold } = loadBaseScaffold(__dirname);
  buildGallery(manifest);

  log(`Starting 3D demo experiment (${FIGURES.length} figures) profile=${PROFILE_LABEL} concurrency=${RUNNER_CONCURRENCY}`);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const fig = FIGURES[cursor++];
      if (!fig) return;
    if (!FORCE && manifest.figures[fig.name]?.htmlFile) {
      log(`SKIP ${fig.name}`);
      continue;
    }
    log(`START ${fig.name} [${fig.chapter}]`);
    try {
      manifest.figures[fig.name] = await runOne(fig, scaffold);
      log(`DONE ${fig.name} status=${manifest.figures[fig.name].status} score=${manifest.figures[fig.name].bestScore}/5 verify=${manifest.figures[fig.name].verification?.ok ? 'PASS' : 'FAIL'}`);
    } catch (e) {
      manifest.figures[fig.name] = { ...fig, status: 'error', error: String(e?.message || e), finishedAt: new Date().toISOString() };
      log(`ERROR ${fig.name}: ${e.message}`);
    }
    manifest.updatedAt = new Date().toISOString();
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    buildGallery(manifest);
    }
  }
  await Promise.all(Array.from({ length: Math.min(RUNNER_CONCURRENCY, FIGURES.length) }, () => worker()));

  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  buildGallery(manifest);
  log(`3D demo experiment complete. Gallery -> ${path.join(OUT, 'gallery.html')}`);
})();
