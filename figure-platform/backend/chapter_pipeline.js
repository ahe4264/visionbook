'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const { classifyChapter } = require('./classify_figures');
const { runFigureLoop } = require('./figure_loop');
const { runFigureLoop2d } = require('./figure_loop_2d');
const { createResultRecord, saveRecord } = require('./figure_pipeline');
const { upsertEvaluation, upsertAttempts } = require('./result_schema');
const { getCriticContext } = require('./critic');
const { generateStitchedPanelHtml } = require('./html_stitcher');
const { findQmdFile } = require('./qmd_utils');
const { wrapPage, resolvePandocInvocation } = require('./chapter_editor');

const REPO_ROOT = path.join(__dirname, '..', '..');
const FIGURES_DIR = path.join(REPO_ROOT, 'figures');
const PIPELINE_RESULTS_DIR = path.join(__dirname, 'chapter_pipeline_results');
const QMD_CHAPTER_MAP_PATH = path.join(FIGURES_DIR, 'qmd_chapter_map.json');
const SCAFFOLD_PATH = path.join(__dirname, 'base_scene_new.html');
const QMD_DIR = REPO_ROOT;

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
};

// Matches classify_figures.py FOLDER_MAP
const CATEGORY_SUBFOLDER = { '3d_projection': '3d', '2d_diagram': '2d' };

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function withRetry(fn, { retries = 3, baseDelay = 2000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = /fetch failed|connection error|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN|429|503/i.test(err?.message || '');
      if (isRetryable && attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
}

// Load a regular (non-panel) figure image from figures/<chapter>/<filename>
async function loadFigureAsBase64(chapter, filename) {
  const imgPath = path.join(FIGURES_DIR, chapter, filename);
  const buf = await fs.promises.readFile(imgPath);
  const ext = path.extname(filename).slice(1).toLowerCase();
  const mediaType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
  return { base64: buf.toString('base64'), mediaType };
}

// Load a panel image from figures/<chapter>/<subfolder>/<filename>
// classify_figures.py copies panel crops to the category subfolder before deleting them.
async function loadPanelAsBase64(chapter, filename, category) {
  const subfolder = CATEGORY_SUBFOLDER[category];
  if (subfolder) {
    const subPath = path.join(FIGURES_DIR, chapter, subfolder, filename);
    if (fs.existsSync(subPath)) {
      const buf = await fs.promises.readFile(subPath);
      const ext = path.extname(filename).slice(1).toLowerCase();
      const mediaType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      return { base64: buf.toString('base64'), mediaType };
    }
  }
  // Fallback: try main chapter directory
  return loadFigureAsBase64(chapter, filename);
}

// Resolve figure folder(s) for a chapter using qmd_chapter_map.json,
// then classify each folder filtered to figures referenced in the chapter's QMD.
async function classifyChapterFigures(chapter, onProgress) {
  let map = {};
  try { map = JSON.parse(fs.readFileSync(QMD_CHAPTER_MAP_PATH, 'utf-8')); } catch { /* map missing — fall through */ }

  const mapped = map[`${chapter}.qmd`];
  const folders = mapped ? (Array.isArray(mapped) ? mapped : [mapped]) : [chapter];
  const qmdPath = findQmdFile(chapter) || undefined;

  if (!mapped) {
    console.warn(`[chapter-pipeline] ${chapter}.qmd not in qmd_chapter_map.json, trying figures/${chapter}/ directly`);
  }

  const progressCb = onProgress
    ? (done, total, filename) => onProgress({ type: 'classify_progress', done, total, filename })
    : null;

  const allResults = [];
  for (const folder of folders) {
    const results = await classifyChapter(folder, { qmdOnly: true, qmdPath, onProgress: progressCb });
    for (const r of results) r._folder = folder;
    allResults.push(...results);
  }
  return allResults;
}

async function generateOneFigure({ fig, chapter, scaffold, resolvedModel, resolvedPlannerModel, resolvedCriticModel, resolvedFewShot, criticVersion, runDir, isPanel }) {
  const figFolder = fig.folder || chapter;
  const { base64, mediaType } = isPanel
    ? await loadPanelAsBase64(figFolder, fig.filename, fig.category)
    : await loadFigureAsBase64(figFolder, fig.filename);

  const figureId = makeId();
  const timestamp = new Date().toISOString();
  let record;

  if (fig.category === '3d_projection') {
    const loopState = await runFigureLoop({
      figureStem: fig.stem,
      chapterName: chapter,
      imageData: { base64, mediaType },
      scaffold,
      sourceBase64: base64,
      sourceMediaType: mediaType,
      plannerModel: resolvedPlannerModel,
      generatorModel: resolvedModel,
      criticModel: resolvedCriticModel,
      fewShot: resolvedFewShot,
    });

    record = createResultRecord({
      id: figureId,
      filename: fig.filename,
      html: loopState.currentHtml || '',
      timestamp,
      source: 'chapter_pipeline',
      model: resolvedModel,
      plannerModel: resolvedPlannerModel,
      criticModel: resolvedCriticModel,
      experiment: `chapter_pipeline`,
      plan: loopState.currentPlan || null,
      fallbackBase64: base64,
      fallbackMediaType: mediaType,
      sourceBase64: base64,
      sourceMediaType: mediaType,
      extra: {
        type: '3d',
        loopStatus: loopState.status,
        generationDurationMs: loopState.generationDurationMs ?? null,
        generationStartedAt: loopState.generationStartedAt ?? null,
        pipeline: 'chapter_pipeline',
      },
    });

    record = upsertAttempts(record, loopState.attempts || []);
    if (loopState.currentEvaluation) {
      record = upsertEvaluation(record, resolvedCriticModel, loopState.currentEvaluation, timestamp, {
        criticVersion,
        criticModel: resolvedCriticModel,
        source: 'loop',
      });
    }
  } else {
    const loopState = await runFigureLoop2d({
      figureStem: fig.stem,
      chapterName: chapter,
      imageData: { base64, mediaType },
      sourceBase64: base64,
      sourceMediaType: mediaType,
      plannerModel: resolvedPlannerModel,
      generatorModel: resolvedModel,
      criticModel: resolvedCriticModel,
      fewShot: resolvedFewShot,
    });

    record = createResultRecord({
      id: figureId,
      filename: fig.filename,
      html: loopState.currentHtml || '',
      timestamp,
      source: 'chapter_pipeline',
      model: resolvedModel,
      plannerModel: resolvedPlannerModel,
      criticModel: resolvedCriticModel,
      experiment: `chapter_pipeline`,
      plan: loopState.currentPlan || null,
      fallbackBase64: base64,
      fallbackMediaType: mediaType,
      sourceBase64: base64,
      sourceMediaType: mediaType,
      extra: {
        type: '2d',
        loopStatus: loopState.status,
        generationDurationMs: loopState.generationDurationMs ?? null,
        generationStartedAt: loopState.generationStartedAt ?? null,
        pipeline: 'chapter_pipeline',
      },
    });

    record = upsertAttempts(record, loopState.attempts || []);
    if (loopState.currentEvaluation) {
      record = upsertEvaluation(record, resolvedCriticModel, loopState.currentEvaluation, timestamp, {
        criticVersion,
        criticModel: resolvedCriticModel,
        source: 'loop',
      });
    }
  }

  saveRecord(record, path.join(runDir, `${fig.stem}.json`));
  return figureId;
}

async function getOriginalFigureDimensions(chapter, parentStem, parentFilename) {
  const candidates = parentFilename
    ? [path.join(FIGURES_DIR, chapter, parentFilename)]
    : ['.png', '.jpg', '.jpeg'].map(ext => path.join(FIGURES_DIR, chapter, parentStem + ext));
  for (const imgPath of candidates) {
    if (!fs.existsSync(imgPath)) continue;
    try {
      const meta = await sharp(imgPath).metadata();
      if (meta.width && meta.height) return { width: meta.width, height: meta.height };
    } catch { /* try next candidate */ }
  }
  return null;
}

function orderPanelEntriesForParent(parentEntry, childEntries) {
  const byFilename = new Map(childEntries.map(entry => [entry.filename, entry]));
  const ordered = [];
  for (const filename of parentEntry.panels || []) {
    const entry = byFilename.get(filename);
    if (entry) ordered.push(entry);
  }
  for (const entry of childEntries) {
    if (!ordered.includes(entry)) ordered.push(entry);
  }
  return ordered;
}

async function stitchPanelGroup({ parentEntry, childEntries, chapter, runDir, resolvedModel }) {
  const orderedEntries = orderPanelEntriesForParent(parentEntry, childEntries);
  if (orderedEntries.length < 2) {
    throw new Error(`Need at least two generated panels to stitch ${parentEntry.stem}.`);
  }

  const panelRecords = orderedEntries.map(entry => {
    const recordPath = path.join(runDir, `${entry.stem}.json`);
    if (!fs.existsSync(recordPath)) throw new Error(`Missing generated panel result: ${entry.stem}`);
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf-8'));
    if (!record.html) throw new Error(`Generated panel result has no html: ${entry.stem}`);
    return { entry, record };
  });

  const parentFolder = parentEntry.folder || chapter;
  const { base64, mediaType } = await loadFigureAsBase64(parentFolder, parentEntry.filename);
  const grid = await inferPanelGrid(parentFolder, orderedEntries, parentEntry.stem, orderedEntries.length);
  const dims = await getOriginalFigureDimensions(parentFolder, parentEntry.stem, parentEntry.filename);
  const sourceAspectRatio = dims ? dims.width / dims.height : null;

  const stitchedHtml = await withRetry(() => generateStitchedPanelHtml({
    modelId: resolvedModel,
    parentStem: parentEntry.stem,
    parentFilename: parentEntry.filename,
    parentImageBase64: base64,
    parentMediaType: mediaType,
    sourceAspectRatio,
    panels: panelRecords.map(({ entry, record }) => ({
      stem: entry.stem,
      filename: entry.filename,
      html: record.html,
      sourceBase64: record.source_base64,
      sourceMediaType: record.source_media_type,
    })),
    grid,
  }));

  const stitchedRecord = createResultRecord({
    id: makeId(),
    filename: parentEntry.filename,
    html: stitchedHtml,
    timestamp: new Date().toISOString(),
    source: 'chapter_pipeline_stitcher',
    model: resolvedModel,
    experiment: 'chapter_pipeline_stitched_panels',
    plan: {
      parentStem: parentEntry.stem,
      panelStems: orderedEntries.map(entry => entry.stem),
      layoutHint: grid,
      sourceAspectRatio,
    },
    fallbackBase64: base64,
    fallbackMediaType: mediaType,
    sourceBase64: base64,
    sourceMediaType: mediaType,
    extra: {
      type: 'stitched_panel_group',
      pipeline: 'chapter_pipeline',
      parentStem: parentEntry.stem,
      panelStems: orderedEntries.map(entry => entry.stem),
      grid,
    },
  });

  saveRecord(stitchedRecord, path.join(runDir, `${parentEntry.stem}.json`));
  return stitchedRecord.id;
}

async function runChapterPipeline({ runId, chapter, model, plannerModel, criticModel, fewShot }, onProgress) {
  const runDir = path.join(PIPELINE_RESULTS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const scaffold = fs.readFileSync(SCAFFOLD_PATH, 'utf-8');
  const { criticVersion } = getCriticContext();
  const resolvedModel = model || 'gpt-5.5';
  const resolvedPlannerModel = plannerModel || 'gemini-3.5-flash';
  const resolvedCriticModel = criticModel || 'claude-opus-4.7';
  const resolvedFewShot = fewShot || { planner: false, critic: false, orchestrator: false };

  // Write initial meta immediately so the run appears in history even if classification fails
  const qmdFile = findQmdFile(chapter);
  const meta = {
    runId,
    chapter,
    qmdFile: qmdFile || null,
    timestamp: new Date().toISOString(),
    model: resolvedModel,
    plannerModel: resolvedPlannerModel,
    criticModel: resolvedCriticModel,
    status: 'classifying',
    figures: [],
  };
  fs.writeFileSync(path.join(runDir, 'meta.json'), JSON.stringify(meta, null, 2));

  onProgress({ type: 'classifying' });
  let classificationResults;
  try {
    classificationResults = await classifyChapterFigures(chapter, onProgress);
  } catch (e) {
    meta.status = 'error';
    meta.error = `Classification failed: ${e.message}`;
    fs.writeFileSync(path.join(runDir, 'meta.json'), JSON.stringify(meta, null, 2));
    onProgress({ type: 'error', error: `Classification failed: ${e.message}` });
    return;
  }

  // Build the figure list:
  // - Panel children (have 'parent' field): generate individually, load from category subfolder
  // - Regular figures (no 'parent', no 'split'): generate from main figures dir
  // - Multi-panel parents ('split': true): generate children, then ask the LLM to stitch them into one parent result
  // - 'other' category: skip
  const figuresToProcess = classificationResults
    .filter(r => r.category !== 'other' && !r.split)
    .map(r => ({
      stem: path.basename(r.filename, path.extname(r.filename)),
      filename: r.filename,
      category: r.category,
      confidence: r.confidence || 1,
      folder: r._folder || chapter,
      isPanel: Boolean(r.parent),
      parentStem: r.parent ? path.basename(r.parent, path.extname(r.parent)) : null,
      parentFilename: r.parent || null,
      status: 'pending',
    }));

  const panelParents = classificationResults
    .filter(r => r.category !== 'other' && r.split && Array.isArray(r.panels) && r.panels.length > 1)
    .map(r => ({
      stem: path.basename(r.filename, path.extname(r.filename)),
      filename: r.filename,
      category: r.category,
      confidence: r.confidence || 1,
      folder: r._folder || chapter,
      panels: r.panels,
      status: 'pending',
    }));

  const metaPath = path.join(runDir, 'meta.json');
  meta.status = 'running';
  meta.figures = figuresToProcess;
  meta.stitchedFigures = panelParents;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  onProgress({ type: 'classified', figures: figuresToProcess });
  onProgress({ type: 'generating' });

  let completedCount = 0;
  let errorCount = 0;
  const ctx = { scaffold, resolvedModel, resolvedPlannerModel, resolvedCriticModel, resolvedFewShot, criticVersion, runDir };

  const CONCURRENCY = 5;
  const queue = [...figuresToProcess];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const fig = queue.shift();
      if (!fig) break;
      onProgress({ type: 'figure_start', stem: fig.stem, category: fig.category, isPanel: fig.isPanel, parentStem: fig.parentStem });
      try {
        const resultId = await generateOneFigure({ fig, chapter, ...ctx, isPanel: fig.isPanel });
        completedCount++;
        fig.status = 'done';
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        onProgress({ type: 'figure_done', stem: fig.stem, resultId, parentStem: fig.parentStem });
      } catch (e) {
        errorCount++;
        fig.status = 'error';
        fig.errorMsg = e.message;
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        console.error(`[chapter-pipeline] Error generating ${fig.stem}:`, e.message);
        onProgress({ type: 'figure_error', stem: fig.stem, error: e.message, parentStem: fig.parentStem });
      }
    }
  });
  await Promise.all(workers);

  let stitchedCount = 0;
  let stitchErrorCount = 0;
  if (panelParents.length > 0) {
    onProgress({ type: 'stitching', groups: panelParents.length });
  }
  for (const parentEntry of panelParents) {
    const childEntries = figuresToProcess.filter(entry => entry.isPanel && entry.parentStem === parentEntry.stem && entry.status === 'done');
    onProgress({ type: 'stitch_start', stem: parentEntry.stem, panels: childEntries.map(entry => entry.stem) });
    try {
      const resultId = await stitchPanelGroup({ parentEntry, childEntries, chapter, runDir, resolvedModel });
      parentEntry.status = 'done';
      stitchedCount++;
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      onProgress({ type: 'stitch_done', stem: parentEntry.stem, resultId });
    } catch (e) {
      parentEntry.status = 'error';
      parentEntry.errorMsg = e.message;
      stitchErrorCount++;
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      console.error(`[chapter-pipeline] Error stitching ${parentEntry.stem}:`, e.message);
      onProgress({ type: 'stitch_error', stem: parentEntry.stem, error: e.message });
    }
  }

  meta.status = 'done';
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  onProgress({ type: 'done', runId, completedCount, errorCount, stitchedCount, stitchErrorCount });
}

// Infer the grid layout (numCols × numRows) for a group of panel children.
// Reads panel image dimensions from disk and optionally the original figure to
// compute the grid via round(origW / panelW). Falls back to finding the
// factorization of N whose overall grid AR is closest to square.
async function inferPanelGrid(chapter, panelFigEntries, parentStem, N) {
  // Read panel pixel dimensions from the category subfolder (or main dir).
  const dims = [];
  for (const entry of panelFigEntries) {
    const subfolder = CATEGORY_SUBFOLDER[entry.category] || '';
    const candidates = subfolder
      ? [path.join(FIGURES_DIR, chapter, subfolder, entry.filename),
      path.join(FIGURES_DIR, chapter, entry.filename)]
      : [path.join(FIGURES_DIR, chapter, entry.filename)];
    for (const imgPath of candidates) {
      if (fs.existsSync(imgPath)) {
        try {
          const m = await sharp(imgPath).metadata();
          if (m.width && m.height) dims.push({ w: m.width, h: m.height });
        } catch { /* skip unreadable panel */ }
        break;
      }
    }
  }

  const panelAR = dims.length > 0
    ? dims.reduce((s, d) => s + d.w / d.h, 0) / dims.length
    : null;

  // Primary: use original figure dimensions to derive grid via division.
  let numCols = null, numRows = null;
  if (dims.length > 0) {
    const meanW = dims.reduce((s, d) => s + d.w, 0) / dims.length;
    const meanH = dims.reduce((s, d) => s + d.h, 0) / dims.length;
    for (const ext of ['.png', '.jpg', '.jpeg']) {
      const origPath = path.join(FIGURES_DIR, chapter, parentStem + ext);
      if (fs.existsSync(origPath)) {
        try {
          const om = await sharp(origPath).metadata();
          if (om.width && om.height) {
            numCols = Math.max(1, Math.round(om.width / meanW));
            numRows = Math.max(1, Math.round(om.height / meanH));
          }
        } catch { /* fall through */ }
        break;
      }
    }
  }

  // Fallback: pick the exact factorization of N whose grid AR is closest to 1.
  if (numCols === null) {
    if (panelAR !== null) {
      let bestCols = N, bestScore = Infinity;
      for (let c = 1; c <= N; c++) {
        if (N % c !== 0) continue;
        const r = N / c;
        const score = Math.abs(Math.log((c / r) * panelAR));
        if (score < bestScore) { bestScore = score; bestCols = c; }
      }
      numCols = bestCols;
      numRows = N / bestCols;
    } else {
      numCols = N;
      numRows = 1;
    }
  }

  // Sanity: ensure the grid fits all N panels.
  if (numCols * numRows < N) numCols = Math.ceil(N / Math.max(1, numRows));
  return { numCols: Math.min(numCols, N), numRows: Math.max(1, numRows), panelAR };
}

async function buildPipelinePreviewHtml(runId) {
  const runDir = path.join(PIPELINE_RESULTS_DIR, runId);
  const meta = JSON.parse(fs.readFileSync(path.join(runDir, 'meta.json'), 'utf-8'));
  const { chapter, qmdFile } = meta;

  if (!qmdFile || !fs.existsSync(qmdFile)) {
    throw new Error(`QMD file not found for chapter: ${chapter}`);
  }

  // Index panel fig-entries by parentStem for inferPanelGrid.
  const panelEntryMap = {}; // parentStem -> figEntry[]
  for (const figEntry of (meta.figures || [])) {
    if (figEntry.isPanel && figEntry.parentStem) {
      (panelEntryMap[figEntry.parentStem] ??= []).push(figEntry);
    }
  }

  // Build figure HTML map:
  //   regularStem  -> htmlString              (single iframe)
  //   stitched parentStem -> htmlString       (LLM-composed parent wrapper)
  //   parentStem   -> { htmls, stems, gridCols, panelAR }  (panel children → CSS grid)
  const figureHtmlMap = {};
  const resultRecords = new Map();
  const stitchedParentStems = new Set();

  for (const file of fs.readdirSync(runDir)) {
    if (!file.endsWith('.json') || file === 'meta.json') continue;
    const stem = path.basename(file, '.json');
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(runDir, file), 'utf-8'));
      if (!rec.html) continue;
      resultRecords.set(stem, rec);
      if (rec.type === 'stitched_panel_group') stitchedParentStems.add(stem);
    } catch { /* skip corrupt result */ }
  }

  for (const [stem, rec] of resultRecords) {
    if (stitchedParentStems.has(stem)) {
      figureHtmlMap[stem] = rec.html;
      continue;
    }

    const figEntry = (meta.figures || []).find(f => f.stem === stem);
    if (figEntry && figEntry.isPanel && figEntry.parentStem) {
      if (stitchedParentStems.has(figEntry.parentStem)) continue;
      if (!figureHtmlMap[figEntry.parentStem]) {
        figureHtmlMap[figEntry.parentStem] = { htmls: [], stems: [] };
      }
      figureHtmlMap[figEntry.parentStem].htmls.push(rec.html);
      figureHtmlMap[figEntry.parentStem].stems.push(stem);
    } else {
      figureHtmlMap[stem] = rec.html;
    }
  }

  // Infer grid layout for each panel group (async, before pandoc).
  for (const [parentStem, entry] of Object.entries(figureHtmlMap)) {
    if (typeof entry !== 'object' || !entry.htmls) continue;
    // Sort panels by stem (label order: _a, _b, _c …).
    const pairs = entry.stems.map((s, i) => ({ stem: s, html: entry.htmls[i] }));
    pairs.sort((a, b) => a.stem.localeCompare(b.stem));
    entry.stems = pairs.map(p => p.stem);
    entry.htmls = pairs.map(p => p.html);
    const grid = await inferPanelGrid(chapter, panelEntryMap[parentStem] || [], parentStem, entry.htmls.length);
    entry.gridCols = grid.numCols;
    entry.panelAR = grid.panelAR;
  }

  // Pre-read original image dimensions so each figure iframe matches the
  // source image's aspect ratio instead of using fixed height buckets.
  // Must cover both regular figures (meta.figures) and stitched panel parents (meta.stitchedFigures).
  const allFigEntries = [...(meta.figures || []), ...(meta.stitchedFigures || [])];
  const imgDimsMap = {}; // stem -> paddingPct (image_height / image_width * 100)
  await Promise.all(
    Object.entries(figureHtmlMap)
      .filter(([, v]) => typeof v === 'string')
      .map(async ([stem]) => {
        const figEntry = allFigEntries.find(f => f.stem === stem);
        if (!figEntry) return;
        const imgPath = path.join(FIGURES_DIR, figEntry.folder || chapter, figEntry.filename);
        if (!fs.existsSync(imgPath)) return;
        try {
          const imgMeta = await sharp(imgPath).metadata();
          if (imgMeta.width && imgMeta.height) {
            imgDimsMap[stem] = (imgMeta.height / imgMeta.width) * 100;
          }
        } catch { /* skip unreadable */ }
      })
  );

  // Run pandoc
  const { command, prefixArgs } = resolvePandocInvocation();
  let bodyHtml;
  try {
    bodyHtml = execFileSync(command, [
      ...prefixArgs,
      '--from=markdown+tex_math_dollars+raw_html',
      '--to=html5',
      '--mathjax',
      qmdFile,
    ], { maxBuffer: 20 * 1024 * 1024, encoding: 'utf-8' });
  } catch (err) {
    const stderr = (err && err.stderr) ? String(err.stderr).trim() : '';
    throw new Error('Pandoc failed: ' + (stderr || err.message || String(err)));
  }

  // Substitute figures
  bodyHtml = bodyHtml.replace(
    /<img(\s[^>]*)src="(?:\.\/)?(figures\/[^/]+\/([^"]+))"([^>]*)\/>/g,
    (match, pre, _fullPath, filename, post) => {
      const stem = path.basename(filename, path.extname(filename));
      const result = figureHtmlMap[stem];
      if (!result) return match;

      if (typeof result === 'object' && result.htmls) {
        // Panel children: CSS grid with correct row/column structure.
        const { htmls, gridCols, panelAR } = result;
        // padding-top % trick gives each cell the panel's native aspect ratio.
        const paddingPct = panelAR ? (1 / panelAR * 100).toFixed(2) : null;
        const cells = htmls.map(html => {
          const src = 'data:text/html;charset=utf-8;base64,' + Buffer.from(html).toString('base64');
          if (paddingPct) {
            return `<div style="position:relative;padding-top:${paddingPct}%;"><iframe src="${src}" style="position:absolute;inset:0;width:100%;height:100%;border:none;" scrolling="no" allowfullscreen loading="lazy"></iframe></div>`;
          }
          return `<iframe class="fig-iframe" src="${src}" style="height:500px;border:none;" scrolling="no" allowfullscreen loading="lazy"></iframe>`;
        }).join('');
        return `<div style="display:grid;grid-template-columns:repeat(${gridCols},1fr);width:100%;gap:4px;">${cells}</div>`;
      }

      const src = 'data:text/html;charset=utf-8;base64,' + Buffer.from(result).toString('base64');
      const paddingPct = imgDimsMap[stem];
      const wPct = 100;
      if (paddingPct != null) {
        const adjPadding = (paddingPct * wPct / 100).toFixed(2);
        return `<div style="position:relative;width:${wPct.toFixed(1)}%;padding-top:${adjPadding}%;"><iframe src="${src}" style="position:absolute;inset:0;width:100%;height:100%;border:none;" scrolling="no" allowfullscreen loading="lazy"></iframe></div>`;
      }
      return `<iframe class="fig-iframe" src="${src}" style="width:${wPct.toFixed(1)}%;height:500px;border:none;display:block;margin:0 auto;" scrolling="no" allowfullscreen loading="lazy"></iframe>`;
    }
  );

  bodyHtml = bodyHtml.replace(/<p>\s*(<(?:iframe|div)[^>]*>[\s\S]*?<\/(?:iframe|div)>)\s*<\/p>/g, '$1');
  bodyHtml = bodyHtml.replace(/\s*\{#(?:eq|fig|tbl|sec|thm|lem|cor|prp|cnj|def|exm|exr|alg|hyp)-[^}]+\}/g, '');

  // Inline remaining static images as base64
  bodyHtml = bodyHtml.replace(
    /<img(\s[^>]*)src="((?:\.\/)?figures\/[^"]+)"([^>]*)\/>/g,
    (match, pre, relPath, post) => {
      const absPath = path.join(QMD_DIR, relPath.replace(/^\.\//, ''));
      const ext = path.extname(absPath).toLowerCase();
      const mime = MIME[ext];
      if (!mime || !fs.existsSync(absPath)) return match;
      const b64 = fs.readFileSync(absPath).toString('base64');
      return `<img${pre}src="data:${mime};base64,${b64}"${post}/>`;
    }
  );

  return { html: wrapPage(bodyHtml, chapter) };
}

function listChapterPipelineRuns() {
  if (!fs.existsSync(PIPELINE_RESULTS_DIR)) return [];
  return fs.readdirSync(PIPELINE_RESULTS_DIR)
    .filter(d => {
      try { return fs.statSync(path.join(PIPELINE_RESULTS_DIR, d)).isDirectory(); } catch { return false; }
    })
    .map(d => {
      try {
        const runDir = path.join(PIPELINE_RESULTS_DIR, d);
        const metaPath = path.join(runDir, 'meta.json');
        const run = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        // Backfill figure statuses for runs completed before incremental writes were added.
        let needsSave = false;
        for (const fig of (run.figures || [])) {
          if (fig.status === 'pending' && fs.existsSync(path.join(runDir, `${fig.stem}.json`))) {
            fig.status = 'done';
            needsSave = true;
          }
        }
        if (needsSave) fs.writeFileSync(metaPath, JSON.stringify(run, null, 2));
        return run;
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function resolveRunDir(runId) {
  const runDir = path.resolve(PIPELINE_RESULTS_DIR, String(runId || ''));
  const rootDir = path.resolve(PIPELINE_RESULTS_DIR);
  if (runDir === rootDir || !runDir.startsWith(rootDir + path.sep)) {
    const err = new Error(`Invalid run id: ${runId}`);
    err.statusCode = 400;
    throw err;
  }
  return runDir;
}

function getChapterPipelineRun(runId) {
  const runDir = resolveRunDir(runId);
  if (!fs.existsSync(runDir)) {
    const err = new Error(`Run not found: ${runId}`);
    err.statusCode = 404;
    throw err;
  }
  return JSON.parse(fs.readFileSync(path.join(runDir, 'meta.json'), 'utf-8'));
}

function updateChapterPipelineRun(runId, updates) {
  const runDir = resolveRunDir(runId);
  if (!fs.existsSync(runDir)) {
    const err = new Error(`Run not found: ${runId}`);
    err.statusCode = 404;
    throw err;
  }
  const metaPath = path.join(runDir, 'meta.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  const allowed = ['name'];
  for (const k of allowed) {
    if (k in updates) meta[k] = updates[k];
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  return meta;
}

function deleteChapterPipelineRun(runId) {
  const runDir = resolveRunDir(runId);
  if (!fs.existsSync(runDir)) {
    const err = new Error(`Run not found: ${runId}`);
    err.statusCode = 404;
    throw err;
  }
  fs.rmSync(runDir, { recursive: true, force: true });
  return { deleted: true, runId };
}

module.exports = {
  runChapterPipeline,
  buildPipelinePreviewHtml,
  listChapterPipelineRuns,
  getChapterPipelineRun,
  updateChapterPipelineRun,
  deleteChapterPipelineRun,
};
