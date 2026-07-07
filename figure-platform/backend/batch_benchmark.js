/**
 * batch_benchmark.js — sequentially run the agentic figure generator over the
 * 30 benchmark source figures, ONE AT A TIME, exactly the way the single-figure
 * harness (test_agent_figure.js) runs one. No batching shortcuts, no compression:
 * each figure gets its own full plan → generate(AGENT) → verify → critique → decide
 * loop with identical parameters.
 *
 * Deliverables (written to agent_batch_out/):
 *   - <name>.html               the generated interactive 3D figure
 *   - <name>.final.jpg          a headless screenshot of the generated figure
 *   - <name>.timing.json        per-figure timing + agent timeline
 *   - manifest.json             running index of every figure's result
 *   - gallery.html              self-contained page: source vs generated + scores
 *   - progress.log              human-readable running log
 *
 * Usage:  node batch_benchmark.js
 * Safe to re-run: figures that already produced HTML are skipped unless FORCE=1.
 */

require('dotenv').config();

// ── Identical defaults to test_agent_figure.js (single-figure harness) ───────
process.env.GENERATOR_MODE = process.env.GENERATOR_MODE || 'agent';
process.env.AGENT_GEN_MODEL = process.env.AGENT_GEN_MODEL || 'sonnet';
process.env.AGENT_GEN_MAX_TURNS = process.env.AGENT_GEN_MAX_TURNS || '8';
process.env.AGENT_GEN_TIMEOUT_MS = process.env.AGENT_GEN_TIMEOUT_MS || '300000';
process.env.AGENT_GEN_CONCURRENCY = process.env.AGENT_GEN_CONCURRENCY || '1';
process.env.AGENT_GEN_RENDER_WAIT_MS = process.env.AGENT_GEN_RENDER_WAIT_MS || '3500';
process.env.AGENT_GEN_EFFORT = process.env.AGENT_GEN_EFFORT || 'low';
process.env.AGENT_GEN_THINKING_TOKENS = process.env.AGENT_GEN_THINKING_TOKENS || '4096';
// Force Puppeteer to the globally-installed Chrome (same reasoning as the harness).
if (!process.env.PUPPETEER_CACHE_DIR || /cursor-sandbox-cache|\/T\//.test(process.env.PUPPETEER_CACHE_DIR)) {
    process.env.PUPPETEER_CACHE_DIR = `${process.env.HOME}/.cache/puppeteer`;
}

const fs = require('fs');
const path = require('path');
const { runFigureLoop } = require('./figure_loop');
const { loadBaseScaffold } = require('./runtime-helpers');
const { verifyFigure, DEFAULT_VIEWPORTS } = require('./verify');

// Same loop/model config as the single-figure harness.
const PLANNER_MODEL = process.env.TEST_PLANNER_MODEL || 'gpt-4o';
const CRITIC_MODEL = process.env.TEST_CRITIC_MODEL || 'gpt-4o';
const MAX_ATTEMPTS = Number(process.env.TEST_MAX_ATTEMPTS) || 1;
const PASS_THRESHOLD = Number(process.env.TEST_PASS_THRESHOLD) || 4.0;
// Outer safety net so a single stuck figure can never stall the whole overnight
// run. The agent already self-times-out at AGENT_GEN_TIMEOUT_MS; this is a backstop.
const FIGURE_HARD_TIMEOUT_MS = Number(process.env.FIGURE_HARD_TIMEOUT_MS) || 600000; // 10 min
const FORCE = process.env.FORCE === '1';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CH = path.join(REPO_ROOT, 'figure-platform', 'chapter-figures');
const p = (chapter, name) => path.join(CH, chapter, 'candidates_3d', `${name}.png`);

// The 30 benchmark figures (from prompt_experiments/05_benchmark) mapped to their
// chapter + source 2D image in the pipeline's candidates_3d repository.
const BENCH = [
    { name: '2D_mapping_diagrams', chapter: 'neural_nets_as_distribution_transformers' },
    { name: 'DFTderivativeoperators', chapter: 'derivatives' },
    { name: 'DFTlaplacians', chapter: 'derivatives' },
    { name: 'barber_pole', chapter: 'optical_flow' },
    { name: 'basic_motion_point', chapter: '2d_motion_from_3d' },
    { name: 'bilinear_interp2', chapter: 'upsamplig_downsampling_2' },
    { name: 'bin2', chapter: 'blurring_2' },
    { name: 'box', chapter: 'blurring_2' },
    { name: 'brdf', chapter: 'imaging' },
    { name: 'clip_mapping_diagram_two_branch', chapter: 'VLMs' },
    { name: 'complexexponential', chapter: 'image_processing_fourier' },
    { name: 'epipolar_geometry', chapter: '3d_scene_understanding_stereo' },
    { name: 'flying_bird', chapter: '2d_motion_from_3d' },
    { name: 'gabor_spacetime_tiles', chapter: 'spatial_filter_sets' },
    { name: 'gabors', chapter: 'spatial_filter_sets' },
    { name: 'geometry_reconstruction_12', chapter: '3d_learning' },
    { name: 'homogeneousAndHeteregeneous_VS3', chapter: 'homogeneous_coordinates' },
    { name: 'homography_plane_geometry2', chapter: 'homography' },
    { name: 'mrf', chapter: 'graphical_models' },
    { name: 'nn_training_viz', chapter: 'neural_nets_as_distribution_transformers' },
    { name: 'no_picture_on_a_wall_aina', chapter: 'imaging' },
    { name: 'orthogonal_projection', chapter: 'imaging' },
    { name: 'pinhole_and_sensor', chapter: 'imaging_geometry' },
    { name: 'pinhole_geometry2', chapter: 'imaging' },
    { name: 'pinhole_names2', chapter: 'imaging' },
    { name: 'rep_gen_schematic', chapter: 'generative_modeling_and_rep_learning' },
    { name: 'reprojection_error', chapter: 'imaging_geometry' },
    { name: 'similar_triangles2', chapter: 'imaging' },
    { name: 'vit_mapping_plot', chapter: 'neural_nets_as_distribution_transformers' },
    { name: 'yaw_pitch_roll', chapter: '2d_motion_from_3d' },
].map(f => ({ ...f, imagePath: p(f.chapter, f.name) }));

const OUT = path.resolve(__dirname, process.env.BATCH_BENCHMARK_OUT || 'agent_batch_out');
const SEED_OUT = process.env.BATCH_SEED_OUT ? path.resolve(__dirname, process.env.BATCH_SEED_OUT) : null;
fs.mkdirSync(OUT, { recursive: true });
const MANIFEST = path.join(OUT, 'manifest.json');
const LOG = path.join(OUT, 'progress.log');

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG, line + '\n');
}

function loadManifest() {
    if (fs.existsSync(MANIFEST)) {
        try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { /* fresh */ }
    }
    return { startedAt: new Date().toISOString(), params: {
        generatorMode: process.env.GENERATOR_MODE, agentModel: process.env.AGENT_GEN_MODEL,
        plannerModel: PLANNER_MODEL, criticModel: CRITIC_MODEL,
        maxAttempts: MAX_ATTEMPTS, passThreshold: PASS_THRESHOLD,
    }, figures: {} };
}

function withTimeout(promise, ms, label) {
    let t;
    const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`hard timeout after ${ms}ms (${label})`)), ms); });
    return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
}

function withBackButton(html) {
    const back = `<a href="http://127.0.0.1:8976/gallery.html" style="position:fixed;left:14px;top:14px;z-index:2147483647;background:rgba(15,23,42,.92);color:#fff;border:1px solid rgba(148,163,184,.55);border-radius:999px;padding:8px 12px;font:600 13px system-ui,-apple-system,Segoe UI,sans-serif;text-decoration:none;box-shadow:0 10px 30px rgba(0,0,0,.25)">&#8249; Back to gallery</a>`;
    if (html.includes('data-gallery-back-button')) return html;
    const idx = html.toLowerCase().indexOf('<body');
    if (idx < 0) return `${back}${html}`;
    const close = html.indexOf('>', idx);
    if (close < 0) return `${back}${html}`;
    return `${html.slice(0, close + 1)}<div data-gallery-back-button>${back}</div>${html.slice(close + 1)}`;
}

async function runOne(fig, scaffold) {
    const { name, chapter, imagePath } = fig;
    if (!fs.existsSync(imagePath)) throw new Error(`source image missing: ${imagePath}`);
    const base64 = fs.readFileSync(imagePath).toString('base64');
    const mediaType = 'image/png';
    const seedHtmlPath = SEED_OUT ? path.join(SEED_OUT, `${name}.html`) : null;
    const seedHtml = seedHtmlPath && fs.existsSync(seedHtmlPath)
        ? fs.readFileSync(seedHtmlPath, 'utf8')
        : null;
    if (SEED_OUT && !seedHtml) console.warn(`[seed] ${name}: no existing HTML found at ${seedHtmlPath}; generating from scratch`);

    const wallStart = Date.now();
    const loopState = await withTimeout(runFigureLoop({
        figureStem: name,
        chapterName: chapter,
        imageData: { base64, mediaType },
        scaffold,
        sourceBase64: base64,
        sourceMediaType: mediaType,
        maxAttempts: MAX_ATTEMPTS,
        passThreshold: PASS_THRESHOLD,
        plannerModel: PLANNER_MODEL,
        generatorModel: 'gpt-5.5', // only used if the agent falls back to single-shot
        criticModel: CRITIC_MODEL,
        fewShot: { planner: false, critic: false, orchestrator: false },
        seedHtml,
    }), FIGURE_HARD_TIMEOUT_MS, name);
    const wallMs = Date.now() - wallStart;

    // Persist HTML + timing.
    if (loopState.currentHtml) fs.writeFileSync(path.join(OUT, `${name}.html`), withBackButton(loopState.currentHtml));
    fs.writeFileSync(path.join(OUT, `${name}.timing.json`), JSON.stringify({
        figureStem: name, chapter, wallMs, status: loopState.status,
        bestScore: loopState.bestScore, timings: loopState.timings,
        maxAttempts: MAX_ATTEMPTS,
        seededFrom: seedHtml ? seedHtmlPath : null,
        agentRuns: (loopState.attempts || []).map(a => a.agentRun || null),
    }, null, 2));

    // Final multi-viewport verification + screenshot for the gallery.
    let verification = null, screenshotFile = null;
    if (loopState.currentHtml) {
        try {
            const report = await verifyFigure(loopState.currentHtml, { viewports: DEFAULT_VIEWPORTS });
            verification = { ok: report.ok, errors: report.errors.length, warnings: report.warnings.length };
            if (report.screenshot) {
                screenshotFile = `${name}.final.jpg`;
                fs.writeFileSync(path.join(OUT, screenshotFile), Buffer.from(report.screenshot, 'base64'));
            }
        } catch (e) { verification = { ok: false, error: e.message }; }
    }

    const ev = loopState.currentEvaluation || {};
    return {
        name, chapter, imagePath,
        status: loopState.status,
        bestScore: loopState.bestScore,
        attemptsUsed: (loopState.timings?.attempts || []).filter(a => a.iteration > 0).length,
        maxAttempts: MAX_ATTEMPTS,
        seededFrom: seedHtml ? seedHtmlPath : null,
        scores: {
            geometry: ev.geometry_accuracy ?? null,
            interactivity: ev.interactivity_usability ?? null,
            faithfulness: ev.faithfulness ?? null,
            labels: ev.label_quality ?? null,
            concept: ev.concept_accuracy ?? null,
            overall: ev.overall_average ?? null,
        },
        failureModes: ev.failure_modes || [],
        wallMs, verification,
        htmlFile: loopState.currentHtml ? `${name}.html` : null,
        screenshotFile,
        finishedAt: new Date().toISOString(),
    };
}

(async () => {
    fs.writeFileSync(LOG, ''); // reset log for this run
    log(`Batch benchmark: ${BENCH.length} figures  mode=${process.env.GENERATOR_MODE} agent=${process.env.AGENT_GEN_MODEL} maxAttempts=${MAX_ATTEMPTS}`);
    const { scaffold } = loadBaseScaffold(__dirname);
    const manifest = loadManifest();

    let done = 0, ok = 0, failed = 0;
    for (const fig of BENCH) {
        done++;
        const prior = manifest.figures[fig.name];
        if (prior && prior.htmlFile && !FORCE) {
            log(`(${done}/${BENCH.length}) SKIP ${fig.name} — already generated (status=${prior.status})`);
            continue;
        }
        log(`(${done}/${BENCH.length}) START ${fig.name}  [${fig.chapter}]`);
        try {
            const rec = await runOne(fig, scaffold);
            manifest.figures[fig.name] = rec;
            ok++;
            log(`(${done}/${BENCH.length}) DONE  ${fig.name}  status=${rec.status} overall=${rec.scores.overall ?? '?'}/5 verify=${rec.verification?.ok ? 'PASS' : 'FAIL'} ${(rec.wallMs / 1000).toFixed(0)}s`);
        } catch (e) {
            manifest.figures[fig.name] = {
                name: fig.name, chapter: fig.chapter, imagePath: fig.imagePath,
                status: 'error', error: e.message, finishedAt: new Date().toISOString(),
            };
            failed++;
            log(`(${done}/${BENCH.length}) ERROR ${fig.name}: ${e.message}`);
        }
        // Persist manifest + rebuild gallery after EVERY figure so partial progress is visible.
        manifest.updatedAt = new Date().toISOString();
        fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
        try { buildGallery(manifest); } catch (e) { log(`gallery build failed: ${e.message}`); }
    }

    manifest.finishedAt = new Date().toISOString();
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    buildGallery(manifest);
    log(`Batch complete: ${ok} generated, ${failed} errored, out of ${BENCH.length}. Gallery → ${path.join(OUT, 'gallery.html')}`);
    process.exit(0);
})();

// ── Self-contained gallery: source image vs generated screenshot + scores ────
function buildGallery(manifest) {
    const dataUri = (file, mime) => {
        try { return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`; }
        catch { return ''; }
    };
    const rows = BENCH.map(fig => {
        const r = manifest.figures[fig.name] || { status: 'pending' };
        const srcUri = dataUri(fig.imagePath, 'image/png');
        const genUri = r.screenshotFile ? dataUri(path.join(OUT, r.screenshotFile), 'image/jpeg') : '';
        const s = r.scores || {};
        const scoreBadge = (v) => v == null ? '<span class="na">–</span>' : `<span class="sc sc${Math.round(v)}">${v}</span>`;
        const verify = r.verification ? (r.verification.ok
            ? '<span class="pass">✓ verified</span>'
            : `<span class="fail">✗ ${r.verification.errors ?? ''} err</span>`) : '';
        const statusCls = r.status === 'passed' ? 'passed' : r.status === 'error' ? 'error' : r.status === 'pending' ? 'pending' : 'partial';
        return `
    <div class="card">
      <div class="hd"><span class="nm">${fig.name}</span><span class="ch">${fig.chapter}</span></div>
      <div class="imgs">
        <figure><figcaption>source 2D</figcaption>${srcUri ? `<img src="${srcUri}">` : '<div class="miss">missing</div>'}</figure>
        <figure><figcaption>generated 3D</figcaption>${genUri ? `<img src="${genUri}">` : '<div class="miss">–</div>'}</figure>
      </div>
      <div class="meta">
        <span class="status ${statusCls}">${r.status}</span>
        ${verify}
        ${r.wallMs ? `<span class="t">${(r.wallMs / 1000).toFixed(0)}s</span>` : ''}
        ${r.htmlFile ? `<a href="${r.htmlFile}">open</a>` : ''}
      </div>
      <table class="scores">
        <tr><th>geom</th><th>inter</th><th>faith</th><th>label</th><th>concept</th><th>overall</th></tr>
        <tr>${['geometry', 'interactivity', 'faithfulness', 'labels', 'concept', 'overall'].map(k => `<td>${scoreBadge(s[k])}</td>`).join('')}</tr>
      </table>
      ${r.error ? `<div class="err">${r.error}</div>` : ''}
    </div>`;
    }).join('\n');

    const generated = Object.values(manifest.figures).filter(f => f.htmlFile).length;
    const avgOverall = (() => {
        const vals = Object.values(manifest.figures).map(f => f.scores?.overall).filter(v => typeof v === 'number');
        return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : '–';
    })();
    const verified = Object.values(manifest.figures).filter(f => f.verification?.ok).length;

    const publicBase = process.env.BATCH_GALLERY_BASE_URL || 'http://127.0.0.1:8976/';
    const html = `<!doctype html><html><head><meta charset="utf-8"><base href="${publicBase}"><title>Benchmark — Agentic 3D Figure Generation</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#0d1117;color:#e6edf3;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}
  header{padding:20px 28px;border-bottom:1px solid #30363d;position:sticky;top:0;background:#0d1117ee;backdrop-filter:blur(6px)}
  header h1{margin:0 0 6px;font-size:20px}
  header .sum{color:#8b949e;font-size:13px}
  header .sum b{color:#e6edf3}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px;padding:20px 28px}
  .card{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px}
  .hd{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
  .nm{font-weight:600}
  .ch{color:#8b949e;font-size:12px}
  .imgs{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  figure{margin:0}
  figcaption{color:#8b949e;font-size:11px;margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em}
  .imgs img{width:100%;height:170px;object-fit:contain;background:#000;border:1px solid #30363d;border-radius:6px}
  .miss{height:170px;display:flex;align-items:center;justify-content:center;color:#6e7681;background:#0d1117;border:1px dashed #30363d;border-radius:6px}
  .meta{display:flex;align-items:center;gap:10px;font-size:12px;flex-wrap:wrap}
  .status{padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
  .status.passed{background:#1f6f3f;color:#c6f6d5}
  .status.partial{background:#8a6d00;color:#fff3c4}
  .status.error{background:#8a1f1f;color:#ffd0d0}
  .status.pending{background:#30363d;color:#8b949e}
  .pass{color:#3fb950}.fail{color:#f85149}
  .t{color:#8b949e}
  .meta a{color:#58a6ff;text-decoration:none;margin-left:auto}
  table.scores{width:100%;border-collapse:collapse;font-size:12px;text-align:center}
  table.scores th{color:#8b949e;font-weight:500;padding:2px}
  table.scores td{padding:2px}
  .sc{display:inline-block;min-width:20px;padding:1px 6px;border-radius:5px;font-weight:600;color:#0d1117}
  .sc5{background:#3fb950}.sc4{background:#7ee787}.sc3{background:#e3b341}.sc2{background:#f0883e}.sc1{background:#f85149}
  .na{color:#6e7681}
  .err{color:#f85149;font-size:12px;background:#2d1214;border:1px solid #5a1f21;border-radius:6px;padding:6px}
</style></head><body>
<header>
  <h1>Agentic 3D Figure Generation — 30-figure benchmark</h1>
  <div class="sum">Generated <b>${generated}/${BENCH.length}</b> · verified <b>${verified}</b> · avg overall <b>${avgOverall}/5</b>
   · agent=<b>${manifest.params?.agentModel}</b> planner/critic=<b>${manifest.params?.plannerModel}</b> · maxAttempts=<b>${manifest.params?.maxAttempts}</b>
   · updated ${manifest.updatedAt || ''}</div>
</header>
<div class="grid">${rows}</div>
</body></html>`;
    fs.writeFileSync(path.join(OUT, 'gallery.html'), html);
}
