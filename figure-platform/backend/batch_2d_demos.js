/**
 * batch_2d_demos.js - two-version 2D interactive demo batch generator.
 *
 * For every discovered 2D candidate image, generates:
 *   1. standalone: full self-contained teaching demo
 *
 * Default discovery:
 *   - /Users/su/Documents/su/alex/figure-platform/chapter-figuresdemo (if present)
 *   - figure-platform/chapter-figures/<chapter>/diagrams_2d/<image>
 *     (current backend convention)
 *
 * The exact user-provided folder is currently missing in this checkout; this runner
 * records that clearly and exits without touching 3D outputs if no candidates exist.
 */

require('dotenv').config();

if (!process.env.PUPPETEER_CACHE_DIR || /cursor-sandbox-cache|\/T\//.test(process.env.PUPPETEER_CACHE_DIR)) {
  process.env.PUPPETEER_CACHE_DIR = `${process.env.HOME}/.cache/puppeteer`;
}

const fs = require('fs');
const path = require('path');
const { plan2dFigure } = require('./planner-2d');
const { generate2dDemoAgent } = require('./generation-2d-agent');
const { verify2dHtml } = require('./verify-2d');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REQUESTED_DIR = process.env.TWO_D_CANDIDATE_DIR || path.join(REPO_ROOT, 'figure-platform', 'chapter-figuresdemo');
const CHAPTER_FIGURES_DIR = path.join(REPO_ROOT, 'figure-platform', 'chapter-figures');
const OUT = path.join(__dirname, 'agent_2d_batch_out');
const MANIFEST = path.join(OUT, 'manifest.json');
const LOG = path.join(OUT, 'progress.log');
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const WAIT_FOR_3D = process.env.WAIT_FOR_3D === '1';
const FORCE = process.env.FORCE === '1';
const MAX_CANDIDATES = Number(process.env.TWO_D_MAX_CANDIDATES) || 0;
const MODES = ['standalone'];

fs.mkdirSync(OUT, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
}

function mediaTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function safeFilePart(s) {
  return String(s || '').replace(/[^a-z0-9_.-]+/gi, '_');
}

function candidateKey(candidate) {
  return `${safeFilePart(candidate.chapter)}__${safeFilePart(candidate.stem)}`;
}

function recordForCandidate(manifest, candidate) {
  const key = candidateKey(candidate);
  const direct = manifest.figures?.[key];
  if (direct) return direct;
  const legacy = manifest.figures?.[candidate.stem];
  return legacy && legacy.chapter === candidate.chapter ? legacy : null;
}

function withBackButton(html) {
  const back = `<a href="http://127.0.0.1:8977/gallery.html" style="position:fixed;left:14px;top:14px;z-index:2147483647;background:rgba(15,23,42,.92);color:#fff;border:1px solid rgba(148,163,184,.55);border-radius:999px;padding:8px 12px;font:600 13px system-ui,-apple-system,Segoe UI,sans-serif;text-decoration:none;box-shadow:0 10px 30px rgba(0,0,0,.25)">&#8249; Back to gallery</a>`;
  if (html.includes('data-gallery-back-button')) return html;
  const idx = html.toLowerCase().indexOf('<body');
  if (idx < 0) return `${back}${html}`;
  const close = html.indexOf('>', idx);
  if (close < 0) return `${back}${html}`;
  return `${html.slice(0, close + 1)}<div data-gallery-back-button>${back}</div>${html.slice(close + 1)}`;
}

function walkImages(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir)) {
      const p = path.join(dir, entry);
      const st = fs.statSync(p);
      if (st.isDirectory()) stack.push(p);
      else if (IMAGE_EXTS.has(path.extname(entry).toLowerCase())) out.push(p);
    }
  }
  return out.sort();
}

function discoverCandidates() {
  const candidates = [];

  if (fs.existsSync(REQUESTED_DIR)) {
    for (const file of walkImages(REQUESTED_DIR)) {
      const rel = path.relative(REQUESTED_DIR, file);
      const parts = rel.split(path.sep);
      const stem = path.basename(file, path.extname(file));
      candidates.push({
        stem,
        filename: path.basename(file),
        chapter: parts.length > 1 ? parts[0] : 'chapter-figuresdemo',
        imagePath: file,
        sourceRoot: REQUESTED_DIR,
      });
    }
  }

  if (!candidates.length && fs.existsSync(CHAPTER_FIGURES_DIR)) {
    for (const chapter of fs.readdirSync(CHAPTER_FIGURES_DIR).sort()) {
      const dir = path.join(CHAPTER_FIGURES_DIR, chapter, 'diagrams_2d');
      for (const file of walkImages(dir)) {
        candidates.push({
          stem: path.basename(file, path.extname(file)),
          filename: path.basename(file),
          chapter,
          imagePath: file,
          sourceRoot: dir,
        });
      }
    }
  }

  return MAX_CANDIDATES > 0 ? candidates.slice(0, MAX_CANDIDATES) : candidates;
}

function readReferenceNotes() {
  const explicit = process.env.TWO_D_REFERENCE_HTML;
  const candidates = [
    explicit,
    '/Users/su/Downloads/preview (3).html',
    '/Users/su/Downloads/preview (4).html',
  ].filter(Boolean);
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    return [
      `Reference file: ${file}`,
      'Use the reference as an active-reader interaction style guide, not as content to copy.',
      raw.replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000),
    ].join('\n');
  }
  return 'No reference HTML file found. Use clean active-reader style with inline hover/click explainers.';
}

function loadManifest() {
  if (fs.existsSync(MANIFEST)) {
    try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { /* fresh */ }
  }
  return {
    startedAt: new Date().toISOString(),
    requestedDir: REQUESTED_DIR,
    figures: {},
  };
}

async function waitFor3dBatchIfRequested() {
  if (!WAIT_FOR_3D) return;
  const manifestPath = path.join(__dirname, 'agent_batch_out', 'manifest.json');
  log('Waiting for 3D benchmark batch to finish before starting 2D generation...');
  for (;;) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const count = Object.values(m.figures || {}).filter(f => f.htmlFile || f.status === 'error').length;
      if (count >= 30 || m.finishedAt) {
        log(`3D batch appears complete (${count}/30). Starting 2D discovery.`);
        return;
      }
      log(`3D batch progress: ${count}/30. Waiting 60s.`);
    } catch {
      log('3D manifest not ready. Waiting 60s.');
    }
    await new Promise(r => setTimeout(r, 60000));
  }
}

async function runOne(candidate, referenceNotes) {
  const id = candidateKey(candidate);
  const mediaType = mediaTypeFor(candidate.imagePath);
  const rec = {
    ...candidate,
    id,
    mediaType,
    planMs: 0,
    plan: null,
    versions: {},
  };

  const reusable = MODES.every(mode => {
    const htmlFile = `${id}.${mode}.html`;
    const legacyHtmlFile = `${candidate.stem}.${mode}.html`;
    return fs.existsSync(path.join(OUT, htmlFile)) || fs.existsSync(path.join(OUT, legacyHtmlFile));
  });

  if (!FORCE && reusable) {
    for (const mode of MODES) {
      const htmlFile = `${id}.${mode}.html`;
      const legacyHtmlFile = `${candidate.stem}.${mode}.html`;
      const htmlPath = path.join(OUT, htmlFile);
      const legacyHtmlPath = path.join(OUT, legacyHtmlFile);
      if (!fs.existsSync(htmlPath) && fs.existsSync(legacyHtmlPath)) fs.copyFileSync(legacyHtmlPath, htmlPath);

      const legacyShot = path.join(OUT, `${candidate.stem}.${mode}.jpg`);
      let screenshotFile = `${id}.${mode}.jpg`;
      const shotPath = path.join(OUT, screenshotFile);
      if (!fs.existsSync(shotPath) && fs.existsSync(legacyShot)) fs.copyFileSync(legacyShot, shotPath);

      log(`  ${id}.${mode}: reuse existing HTML`);
      const html = fs.readFileSync(htmlPath, 'utf8');
      const report = await verify2dHtml(html);
      if (!fs.existsSync(shotPath) && report.screenshot) {
        fs.writeFileSync(shotPath, Buffer.from(report.screenshot, 'base64'));
      }
      if (!fs.existsSync(shotPath)) screenshotFile = null;
      rec.versions[mode] = {
        status: report.ok ? 'verified' : 'generated_with_warnings',
        htmlFile,
        screenshotFile,
        elapsedMs: 0,
        reused: true,
        verification: { ok: report.ok, errors: report.errors, warnings: report.warnings },
        agentRun: null,
      };
    }
    return rec;
  }

  const base64 = fs.readFileSync(candidate.imagePath).toString('base64');
  const planStart = Date.now();
  const plan = await plan2dFigure(candidate.stem, candidate.chapter, base64, mediaType);
  rec.plan = plan;
  rec.planMs = Date.now() - planStart;

  for (const mode of MODES) {
    const label = `${id}.${mode}`;
    const htmlFile = `${id}.${mode}.html`;
    const existingHtml = path.join(OUT, htmlFile);
    if (!FORCE && fs.existsSync(existingHtml)) {
      log(`  ${label}: reuse existing HTML`);
      const html = fs.readFileSync(existingHtml, 'utf8');
      const report = await verify2dHtml(html);
      let screenshotFile = `${id}.${mode}.jpg`;
      if (!fs.existsSync(path.join(OUT, screenshotFile)) && report.screenshot) {
        fs.writeFileSync(path.join(OUT, screenshotFile), Buffer.from(report.screenshot, 'base64'));
      }
      if (!fs.existsSync(path.join(OUT, screenshotFile))) screenshotFile = null;
      rec.versions[mode] = {
        status: report.ok ? 'verified' : 'generated_with_warnings',
        htmlFile,
        screenshotFile,
        elapsedMs: 0,
        reused: true,
        verification: { ok: report.ok, errors: report.errors, warnings: report.warnings },
        agentRun: null,
      };
      continue;
    }
    log(`  ${label}: start`);
    const start = Date.now();
    const generated = await generate2dDemoAgent({
      figureStem: candidate.stem,
      chapterName: candidate.chapter,
      base64,
      mediaType,
      plan,
      mode,
      referenceNotes,
    });
    const elapsedMs = Date.now() - start;
    if (!generated?.html) {
      rec.versions[mode] = { status: 'error', error: 'agent returned no HTML', elapsedMs };
      log(`  ${label}: ERROR no HTML`);
      continue;
    }
    fs.writeFileSync(path.join(OUT, htmlFile), withBackButton(generated.html));
    const report = await verify2dHtml(generated.html);
    let screenshotFile = null;
    if (report.screenshot) {
      screenshotFile = `${id}.${mode}.jpg`;
      fs.writeFileSync(path.join(OUT, screenshotFile), Buffer.from(report.screenshot, 'base64'));
    }
    rec.versions[mode] = {
      status: report.ok ? 'verified' : 'generated_with_warnings',
      htmlFile,
      screenshotFile,
      elapsedMs,
      verification: { ok: report.ok, errors: report.errors, warnings: report.warnings },
      agentRun: generated.run || null,
    };
    log(`  ${label}: ${report.ok ? 'PASS' : `FAIL ${report.errors.length} err`} ${(elapsedMs / 1000).toFixed(0)}s`);
  }

  return rec;
}

function ensureSourceThumb(candidate) {
  try {
    const dir = path.join(OUT, 'source_thumbs');
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(candidate.imagePath) || '.png';
    const file = `${safeFilePart(candidate.chapter)}__${safeFilePart(candidate.stem)}${ext}`;
    const dest = path.join(dir, file);
    if (!fs.existsSync(dest)) fs.copyFileSync(candidate.imagePath, dest);
    return `source_thumbs/${file}`;
  } catch {
    return null;
  }
}

function buildGallery(manifest, candidates) {
  const completed = candidates.filter(c => recordForCandidate(manifest, c));
  const cards = completed.map(c => {
    const r = recordForCandidate(manifest, c);
    const thumb = ensureSourceThumb(c);
    const versions = MODES.map(mode => {
      const v = r?.versions?.[mode];
      return `<div class="version"><h3>${mode}</h3>${v?.screenshotFile ? `<img src="${v.screenshotFile}" alt="${escapeHtml(c.stem)} generated">` : '<div class="missing">pending</div>'}<div class="versionFooter"><span class="badge">${escapeHtml(v?.status || 'pending')}</span>${v?.htmlFile ? `<a href="${v.htmlFile}">open</a>` : ''}</div></div>`;
    }).join('');
    return `<section class="card"><h2>${escapeHtml(c.stem)}<small>${escapeHtml(c.chapter)}</small></h2><div class="cols"><div><h3>original figure</h3>${thumb ? `<img class="thumb" src="${thumb}" alt="${escapeHtml(c.stem)} original">` : '<div class="missing">source unavailable</div>'}<div class="sourceMeta"><b>chapter:</b> ${escapeHtml(c.chapter)}<br><b>name:</b> ${escapeHtml(c.stem)}</div></div>${versions}</div></section>`;
  }).join('\n');
  const html = `<!doctype html><html><head><meta charset="utf-8"><base href="http://127.0.0.1:8977/"><title>2D Demo Batch</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#172033;font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}header{position:sticky;top:0;background:#fffffff2;backdrop-filter:blur(8px);border-bottom:1px solid #d9dfeb;padding:16px 24px;z-index:2}h1{font-size:22px;margin:0 0 4px}.summary{color:#667085}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(720px,1fr));gap:18px;padding:18px}.card{background:#fff;border:1px solid #d9dfeb;border-radius:16px;padding:16px;box-shadow:0 8px 24px rgba(25,35,60,.06)}h2{margin:0 0 12px;font-size:18px}small{display:block;color:#667085;font-size:12px;font-weight:500;margin-top:2px}.cols{display:grid;grid-template-columns:minmax(240px,.85fr) minmax(360px,1.15fr);gap:14px;align-items:start}h3{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#667085}.thumb,.version img{width:100%;height:300px;object-fit:contain;background:#fff;border:1px solid #e5e7eb;border-radius:10px}.version img{background:#f8fafc}.missing{height:300px;display:grid;place-items:center;border:1px dashed #cbd5e1;border-radius:10px;color:#667085;background:#f8fafc}.sourceMeta{margin-top:8px;color:#667085;font-size:12px;line-height:1.45;word-break:break-word}.versionFooter{display:flex;align-items:center;gap:10px;margin-top:8px}.badge{font-size:12px;padding:2px 8px;border-radius:999px;background:#dcfce7;color:#166534}.version a{margin-left:auto;color:#2563eb;text-decoration:none;font-weight:600}@media(max-width:760px){.grid{grid-template-columns:1fr;padding:12px}.cols{grid-template-columns:1fr}.thumb,.version img,.missing{height:240px}}</style></head><body><header><h1>2D Standalone Demo Batch</h1><div class="summary">${Object.keys(manifest.figures || {}).length}/${candidates.length} figures generated · inline generation disabled · requestedDir=${escapeHtml(manifest.requestedDir)}</div></header><main class="grid">${cards}</main></body></html>`;
  fs.writeFileSync(path.join(OUT, 'gallery.html'), html);
}

(async () => {
  fs.writeFileSync(LOG, '');
  await waitFor3dBatchIfRequested();

  const manifest = loadManifest();
  const candidates = discoverCandidates();
  manifest.updatedAt = new Date().toISOString();
  manifest.discoveredCount = candidates.length;
  manifest.discovery = {
    requestedDir: REQUESTED_DIR,
    requestedDirExists: fs.existsSync(REQUESTED_DIR),
    fallbackConvention: path.join(CHAPTER_FIGURES_DIR, '*', 'diagrams_2d'),
  };

  if (!candidates.length) {
    manifest.status = 'blocked_no_2d_candidates';
    manifest.note = 'No images found in requested chapter-figuresdemo path, and no chapter-figures/*/diagrams_2d images exist.';
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    buildGallery(manifest, []);
    log(manifest.note);
    process.exit(0);
  }

  if (process.env.GALLERY_ONLY === '1') {
    buildGallery(manifest, candidates);
    log(`2D gallery rebuilt only. Gallery -> ${path.join(OUT, 'gallery.html')}`);
    process.exit(0);
  }

  const referenceNotes = readReferenceNotes();
  log(`2D batch start: ${candidates.length} candidates. requestedDirExists=${fs.existsSync(REQUESTED_DIR)}`);
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const key = candidateKey(c);
    if (recordForCandidate(manifest, c)?.versions?.standalone?.htmlFile && !FORCE) {
      log(`(${i + 1}/${candidates.length}) SKIP ${c.stem}`);
      continue;
    }
    log(`(${i + 1}/${candidates.length}) START ${c.stem} [${c.chapter}]`);
    try {
      manifest.figures[key] = await runOne(c, referenceNotes);
      log(`(${i + 1}/${candidates.length}) DONE ${c.stem}`);
    } catch (e) {
      manifest.figures[key] = { ...c, id: key, status: 'error', error: String(e?.message || e), finishedAt: new Date().toISOString() };
      log(`(${i + 1}/${candidates.length}) ERROR ${c.stem}: ${e.message}`);
    }
    manifest.updatedAt = new Date().toISOString();
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    buildGallery(manifest, candidates);
  }

  manifest.status = 'complete';
  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  buildGallery(manifest, candidates);
  log(`2D batch complete. Gallery -> ${path.join(OUT, 'gallery.html')}`);
})();
