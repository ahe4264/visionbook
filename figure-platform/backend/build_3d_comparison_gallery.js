/**
 * build_3d_comparison_gallery.js
 *
 * Rebuilds the main 3D gallery as:
 *   original | limited inline UI | new standalone-demo setup | refined standalone-demo setup
 *
 * It reads:
 *   - agent_batch_out/manifest.json      (completed benchmark / limited UI)
 *   - agent_batch_limited_refined_out/manifest.json (optional, limited UI + critic refinement)
 *   - agent_3d_demo_out/manifest.json    (optional, fills in as demo run finishes)
 *   - agent_3d_demo_refined_out/manifest.json (optional, second pass with critic iterations)
 */

const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const LIMITED_OUT = path.join(BASE, 'agent_batch_out');
const LIMITED_REFINED_OUT = path.join(BASE, 'agent_batch_limited_refined_out');
const DEMO_OUT = path.join(BASE, 'agent_3d_demo_out');
const REFINED_OUT = path.join(BASE, 'agent_3d_demo_refined_out');
const LIMITED_PORT = process.env.THREE_D_LIMITED_PORT || '8976';
const LIMITED_REFINED_PORT = process.env.THREE_D_LIMITED_REFINED_PORT || '8980';
const DEMO_PORT = process.env.THREE_D_DEMO_PORT || '8978';
const REFINED_PORT = process.env.THREE_D_REFINED_PORT || '8979';

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
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

function scoreOf(rec) {
  return rec?.scores?.overall ?? rec?.scores?.overall_average ?? rec?.bestScore ?? null;
}

function attemptInfo(outDir, rec, manifest) {
  if (!rec?.name) return '';
  let used = rec.attemptsUsed;
  let max = rec.maxAttempts || manifest?.params?.maxAttempts;
  if (!used) {
    const timing = readJson(path.join(outDir, `${rec.name}.timing.json`), null);
    used = timing?.timings?.attempts?.length || timing?.agentRuns?.filter(Boolean).length || null;
    max = max || timing?.maxAttempts;
  }
  return used ? `gen attempts ${used}/${max || '?'}` : '';
}

function displayStatus(rec, fallback) {
  if (!rec) return fallback;
  if (rec.status === 'failed_max_attempts' && rec.verification?.ok) return 'verified below threshold';
  if (rec.status === 'failed_verification') return 'verify failed';
  return rec.status || fallback;
}

function renderShot({ title, img, status, score, verify, attempts, link }) {
  return `<div class="pane">
    <h3>${esc(title)}</h3>
    ${img ? `<img src="${img}">` : '<div class="missing">pending</div>'}
    <div class="meta">
      ${status ? `<span>${esc(status)}</span>` : ''}
      ${score != null ? `<span>score ${esc(score)}/5</span>` : ''}
      ${verify ? `<span>${esc(verify)}</span>` : ''}
      ${attempts ? `<span>${esc(attempts)}</span>` : ''}
      ${link ? `<a href="${link}">open</a>` : ''}
    </div>
  </div>`;
}

function build() {
  const limited = readJson(path.join(LIMITED_OUT, 'manifest.json'), { figures: {} });
  const limitedRefined = readJson(path.join(LIMITED_REFINED_OUT, 'manifest.json'), { figures: {} });
  const demo = readJson(path.join(DEMO_OUT, 'manifest.json'), { figures: {} });
  const refined = readJson(path.join(REFINED_OUT, 'manifest.json'), { figures: {} });
  const figures = Object.values(limited.figures || {});

  const rows = figures.map(f => {
    const source = dataUri(f.imagePath, 'image/png');
    const limitedRefinedRec = limitedRefined.figures?.[f.name] || null;
    const limitedShot = limitedRefinedRec?.screenshotFile
      ? `http://127.0.0.1:${LIMITED_REFINED_PORT}/${limitedRefinedRec.screenshotFile}`
      : (f.screenshotFile ? dataUri(path.join(LIMITED_OUT, f.screenshotFile), 'image/jpeg') : '');
    const limitedStatus = limitedRefinedRec
      ? displayStatus(limitedRefinedRec, '')
      : displayStatus(f, '');
    const limitedVerify = limitedRefinedRec
      ? (limitedRefinedRec.verification?.ok ? 'verified revised' : limitedRefinedRec.verification ? 'revision verify issues' : '')
      : (f.verification?.ok ? 'verified' : f.verification ? 'verify issues' : '');
    const limitedAttempts = limitedRefinedRec
      ? attemptInfo(LIMITED_REFINED_OUT, limitedRefinedRec, limitedRefined)
      : attemptInfo(LIMITED_OUT, f, limited);
    const limitedLink = limitedRefinedRec?.htmlFile
      ? `http://127.0.0.1:${LIMITED_REFINED_PORT}/${limitedRefinedRec.htmlFile}`
      : (f.htmlFile ? `http://127.0.0.1:${LIMITED_PORT}/${f.htmlFile}` : '');
    const demoRec = demo.figures?.[f.name] || null;
    const demoShot = demoRec?.screenshotFile ? `http://127.0.0.1:${DEMO_PORT}/${demoRec.screenshotFile}` : '';
    const refinedRec = refined.figures?.[f.name] || null;
    const refinedShot = refinedRec?.screenshotFile ? `http://127.0.0.1:${REFINED_PORT}/${refinedRec.screenshotFile}` : '';

    return `<section class="card">
      <div class="hd">
        <h2>${esc(f.name)}<small>${esc(f.chapter)}</small></h2>
      </div>
      <div class="cols">
        ${renderShot({ title: '1. original', img: source, status: 'source figure' })}
        ${renderShot({
          title: limitedRefinedRec ? '2. limited UI revised' : '2. limited UI',
          img: limitedShot,
          status: limitedStatus,
          score: scoreOf(limitedRefinedRec || f),
          verify: limitedVerify,
          attempts: limitedAttempts,
          link: limitedLink,
        })}
        ${renderShot({
          title: '3. new setup',
          img: demoShot,
          status: displayStatus(demoRec, demo.profile ? 'running/pending' : 'not selected'),
          score: scoreOf(demoRec),
          verify: demoRec?.verification?.ok ? 'verified' : demoRec?.verification ? 'verify issues' : '',
          attempts: attemptInfo(DEMO_OUT, demoRec, demo),
          link: demoRec?.htmlFile ? `http://127.0.0.1:${DEMO_PORT}/${demoRec.htmlFile}` : '',
        })}
        ${renderShot({
          title: '4. refined pass',
          img: refinedShot,
          status: displayStatus(refinedRec, refined.profile ? 'running/pending' : 'queued'),
          score: scoreOf(refinedRec),
          verify: refinedRec?.verification?.ok ? 'verified' : refinedRec?.verification ? 'verify issues' : '',
          attempts: attemptInfo(REFINED_OUT, refinedRec, refined),
          link: refinedRec?.htmlFile ? `http://127.0.0.1:${REFINED_PORT}/${refinedRec.htmlFile}` : '',
        })}
      </div>
    </section>`;
  }).join('\n');

  const demoDone = Object.values(demo.figures || {}).filter(f => f.htmlFile).length;
  const refinedDone = Object.values(refined.figures || {}).filter(f => f.htmlFile).length;
  const limitedRefinedDone = Object.values(limitedRefined.figures || {}).filter(f => f.htmlFile).length;
  const html = `<!doctype html><html><head><meta charset="utf-8"><base href="http://127.0.0.1:${LIMITED_PORT}/"><title>3D Figure Comparison Gallery</title><style>
  *{box-sizing:border-box}body{margin:0;background:#0d1117;color:#e6edf3;font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}header{position:sticky;top:0;z-index:5;background:#0d1117ee;backdrop-filter:blur(8px);border-bottom:1px solid #30363d;padding:18px 24px}h1{margin:0 0 4px;font-size:22px}.summary{color:#8b949e}.grid{display:grid;gap:18px;padding:18px}.card{background:#161b22;border:1px solid #30363d;border-radius:16px;padding:16px}.hd h2{margin:0 0 12px;font-size:18px}.hd small{display:block;color:#8b949e;font-size:12px;font-weight:500;margin-top:2px}.cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.pane h3{margin:0 0 6px;color:#8b949e;text-transform:uppercase;letter-spacing:.06em;font-size:12px}.pane img{width:100%;height:260px;object-fit:contain;background:#020617;border:1px solid #30363d;border-radius:10px}.missing{height:260px;display:grid;place-items:center;color:#8b949e;border:1px dashed #30363d;border-radius:10px;background:#0d1117}.meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;color:#8b949e;font-size:12px}.meta span{background:#21262d;border:1px solid #30363d;border-radius:999px;padding:2px 8px}.meta a{margin-left:auto;color:#58a6ff;text-decoration:none;font-weight:600}@media(max-width:1200px){.cols{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.cols{grid-template-columns:1fr}.pane img,.missing{height:240px}}</style></head><body>
  <header><h1>3D Figure Comparison Gallery</h1><div class="summary">Rows show: original source · limited UI (replaced in-place as revisions finish) · new setup first pass · refined pass. Limited UI revised: ${limitedRefinedDone}/${figures.length}; new setup complete: ${demoDone}/${figures.length}; refined pass complete: ${refinedDone}/${figures.length}.</div></header>
  <main class="grid">${rows}</main>
</body></html>`;

  fs.writeFileSync(path.join(LIMITED_OUT, 'gallery.html'), html);
}

build();
