'use strict';

/**
 * classify_figures.js — Figure classifier using Gemini vision.
 * Classifies into: 3d_projection, 2d_diagram, other.
 * By default only classifies figures referenced in the chapter's .qmd file.
 *
 * Usage (CLI):
 *   node figure-platform/backend/classify_figures.js <chapter>
 *   node figure-platform/backend/classify_figures.js <chapter> --all-figures
 *   node figure-platform/backend/classify_figures.js <chapter> --no-split
 *
 * Usage (module):
 *   const { classifyChapter } = require('./classify_figures');
 *   const results = await classifyChapter('homography');
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// ── Fetch patch: route Gemini URLs through undici (same as models.js) ─────────
try {
  const undici = require('undici');
  const _geminiDispatcher = new undici.Agent({
    connect: { keepAlive: false },
    headersTimeout: 300_000,
    bodyTimeout: 0,
  });
  const _origFetch = globalThis.fetch;
  globalThis.fetch = (url, opts = {}) => {
    const urlStr = typeof url === 'string' ? url : String(url);
    if (urlStr.includes('generativelanguage.googleapis.com') || urlStr.includes('aiplatform.googleapis.com')) {
      return undici.fetch(url, { ...opts, dispatcher: _geminiDispatcher });
    }
    return _origFetch(url, opts);
  };
} catch (_) { /* undici unavailable — fall through to native fetch */ }

// ── Constants ─────────────────────────────────────────────────────────────────
const REPO_ROOT = path.join(__dirname, '..', '..');
const FIGURES_ROOT = path.join(REPO_ROOT, 'figures');
const GEMINI_MODEL = 'gemini-3.1-pro-preview';

const CATEGORIES = ['3d_projection', '2d_diagram', 'other'];
const CATEGORY_DESCRIPTIONS = {
  '3d_projection': 'a clean schematic explaining a 3D concept (projection, coordinate systems, camera geometry) with labeled axes and simple shapes — recreatable with basic 3D primitives; no photos',
  '2d_diagram': 'a clean 2D schematic, flowchart, or conceptual illustration with simple shapes, arrows, and/or equations — recreatable with basic 2D primitives and text; no photos',
  'other': 'anything hard to recreate interactively: photos or real-world imagery (even partially), data plots, tables, densely detailed or complex figures with many fine-grained shapes or lines',
};

const SKIP_SUFFIXES = new Set(['.pdf', '.eps', '.tex', '.bib', '.svg']);
const SKIP_STEM_RE = /(_[a-z]|-\d+)$/;
const FOLDER_MAP = { '2d_diagram': '2d', '3d_projection': '3d' };

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg']);

// ── Gemini client ─────────────────────────────────────────────────────────────
let _gemini = null;
async function getGemini() {
  if (!_gemini) {
    const key = process.env.GOOGLE_API_KEY;
    if (!key) throw new Error('GOOGLE_API_KEY is not set in .env');
    const { GoogleGenAI } = await import('@google/genai');
    _gemini = new GoogleGenAI({ apiKey: key });
  }
  return _gemini;
}

// ── Image preparation ─────────────────────────────────────────────────────────
async function readImageAsInlineData(imgPath) {
  const buf = fs.readFileSync(imgPath);
  const resized = await sharp(buf)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return { mimeType: 'image/jpeg', data: resized.toString('base64') };
}

// ── Gemini classify ───────────────────────────────────────────────────────────
async function geminiClassify(imgPath, detectPanels = true) {
  const inlineData = await readImageAsInlineData(imgPath);
  const categoriesDesc = CATEGORIES.map(k => `- "${k}": ${CATEGORY_DESCRIPTIONS[k]}`).join('\n');

  const prompt = detectPanels
    ? `Analyze this figure. Classify it into one of these categories:\n${categoriesDesc}\n\nAlso determine if it contains multiple distinct panels (sub-figures labeled a, b, c... or arranged side-by-side/stacked with separate content) WHERE THE PANELS ARE 2D OR 3D DIAGRAMS (not photographs or non-diagram content). When panels are visually connected by arrows or transformation symbols (e.g. →), consider whether they may represent a single unified concept (such as a before/after or input/output relationship) rather than truly independent sub-figures.\n\nRespond with JSON only, no other text.\n\nIf multi-panel with diagram panels, include a "panels" array with normalized bounding boxes [x1, y1, x2, y2] (each value 0.0–1.0, origin at top-left):\n{"category": "<category_name>", "confidence": <0.0-1.0>, "reasoning": "<one sentence>", "panels": [{"label": "a", "bbox": [x1, y1, x2, y2]}, ...]}\n\nIf single panel (or panels are non-diagram):\n{"category": "<category_name>", "confidence": <0.0-1.0>, "reasoning": "<one sentence>"}`
    : `Classify this figure into exactly one of these categories:\n\n${categoriesDesc}\n\nRespond with JSON only, no other text:\n{"category": "<category_name>", "confidence": <0.0-1.0>, "reasoning": "<one sentence>"}`;

  const client = await getGemini();
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const stream = await client.models.generateContentStream({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ inlineData }, { text: prompt }] }],
      });
      let text = '';
      for await (const chunk of stream) text += chunk.text ?? '';

      text = text.trim();
      if (text.startsWith('```')) {
        text = text.split('```')[1];
        if (text.startsWith('json')) text = text.slice(4);
        text = text.trim();
      }

      const result = JSON.parse(text);
      let category = result.category || 'other';
      if (!CATEGORIES.includes(category)) category = 'other';

      const record = {
        category,
        confidence: Math.round(parseFloat(result.confidence ?? 0.9) * 10000) / 10000,
        method: 'gemini',
        low_confidence: false,
        reasoning: result.reasoning || '',
      };
      if (result.panels) record.panels = result.panels;
      return record;
    } catch (e) {
      if (attempt < maxRetries - 1) {
        const wait = Math.pow(2, attempt) * 2000;
        console.warn(`  ⚠ ${path.basename(imgPath)}: API error (attempt ${attempt + 1}/${maxRetries}), retrying in ${wait / 1000}s — ${e.message}`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        console.error(`  ✗ ${path.basename(imgPath)}: failed after ${maxRetries} attempts — ${e.message}`);
        return { category: 'other', confidence: 0, method: 'gemini', low_confidence: true, error: e.message };
      }
    }
  }
}

// ── Panel splitting ───────────────────────────────────────────────────────────
async function splitAndSavePanels(imgPath, panels) {
  const meta = await sharp(imgPath).metadata();
  const { width: w, height: h } = meta;
  const saved = [];

  for (const panel of panels) {
    const label = String(panel.label ?? saved.length);
    const [x1n, y1n, x2n, y2n] = panel.bbox;
    const left = Math.max(0, Math.round(x1n * w));
    const top = Math.max(0, Math.round(y1n * h));
    const right = Math.min(w, Math.round(x2n * w));
    const bottom = Math.min(h, Math.round(y2n * h));
    const pw = right - left;
    const ph = bottom - top;
    if (pw <= 0 || ph <= 0) continue;

    const stem = path.basename(imgPath, path.extname(imgPath));
    const outPath = path.join(path.dirname(imgPath), `${stem}_${label}.png`);
    await sharp(imgPath).extract({ left, top, width: pw, height: ph }).toFile(outPath);
    saved.push(outPath);
  }
  return saved;
}

// ── QMD figure extraction ─────────────────────────────────────────────────────
function extractFiguresFromQmd(chapter, qmdPath) {
  const file = qmdPath || path.join(REPO_ROOT, `${chapter}.qmd`);
  if (!fs.existsSync(file)) {
    console.warn(`Warning: ${file} not found. Processing all figures.`);
    return null;
  }
  const content = fs.readFileSync(file, 'utf-8');
  const pattern = new RegExp(`!\\[[^\\]]*\\]\\(figures/${chapter}/([a-zA-Z0-9_.-]+\\.(?:png|jpg|JPG))\\)`, 'g');
  const used = new Set();
  let match;
  while ((match = pattern.exec(content)) !== null) used.add(match[1]);
  console.log(`Found ${used.size} figures referenced in ${file}`);
  return used;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function shouldSkip(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (SKIP_SUFFIXES.has(ext)) return true;
  const stem = path.basename(filePath, path.extname(filePath));
  return SKIP_STEM_RE.test(stem);
}

function copyToSubfolder(figuresDir, rec) {
  const folder = FOLDER_MAP[rec.category];
  if (!folder) return;
  const destDir = path.join(figuresDir, folder);
  fs.mkdirSync(destDir, { recursive: true });
  const src = path.join(figuresDir, rec.filename);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(destDir, rec.filename));
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Classify all figures in a chapter directory.
 * Returns the same JSON array written to classification_results.json.
 *
 * @param {string} chapter  - chapter folder name under figures/
 * @param {object} opts
 * @param {boolean} [opts.qmdOnly=true]   - only classify figures referenced in the .qmd
 * @param {string}  [opts.qmdPath=null]   - override path to the .qmd file
 * @param {boolean} [opts.noSplit=false]  - disable multi-panel detection
 * @param {string}  [opts.outputPath=null] - override output JSON path
 */
async function classifyChapter(chapter, { qmdOnly = true, qmdPath = null, noSplit = false, outputPath = null, onProgress = null } = {}) {
  const figuresDir = path.join(FIGURES_ROOT, chapter);
  if (!fs.existsSync(figuresDir)) {
    throw new Error(`figures/${chapter}/ does not exist`);
  }

  let files = fs.readdirSync(figuresDir)
    .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()) && !shouldSkip(path.join(figuresDir, f)))
    .map(f => path.join(figuresDir, f))
    .sort();

  if (qmdOnly) {
    const used = extractFiguresFromQmd(chapter, qmdPath);
    if (used !== null) files = files.filter(f => used.has(path.basename(f)));
  }

  if (files.length === 0) {
    console.log(`No images found in figures/${chapter}/`);
    return [];
  }

  const results = {};
  console.log(`\nClassifying ${files.length} figures in ${chapter}...`);

  for (let i = 0; i < files.length; i++) {
    const imgPath = files[i];
    const filename = path.basename(imgPath);
    process.stdout.write(`  [${i + 1}/${files.length}] ${filename}... `);

    const record = await geminiClassify(imgPath, !noSplit);
    record.filename = filename;

    if (!noSplit && record.panels) {
      const rawPanels = record.panels;
      delete record.panels;
      const panelPaths = await splitAndSavePanels(imgPath, rawPanels);
      const keptFilenames = [];

      for (const panelPath of panelPaths) {
        const panelRecord = {
          category: record.category,
          confidence: record.confidence,
          method: record.method,
          low_confidence: record.low_confidence,
          reasoning: record.reasoning,
          filename: path.basename(panelPath),
          parent: filename,
          multipart: false,
        };
        copyToSubfolder(figuresDir, panelRecord);
        fs.unlinkSync(panelPath);
        keptFilenames.push(panelRecord.filename);
        results[panelRecord.filename] = panelRecord;
      }

      record.split = true;
      record.multipart = true;
      record.panels = keptFilenames;
      results[filename] = record;
      process.stdout.write(`split → ${keptFilenames.length} panels\n`);
    } else {
      record.multipart = false;
      copyToSubfolder(figuresDir, record);
      results[filename] = record;
      process.stdout.write(`${record.category} (${Math.round(record.confidence * 100)}%)\n`);
    }

    if (onProgress) onProgress(i + 1, files.length, filename);
  }

  const output = Object.values(results);
  const resolvedOutputPath = outputPath || path.join(FIGURES_ROOT, chapter, 'classification_results.json');
  fs.writeFileSync(resolvedOutputPath, JSON.stringify(output, null, 2));

  const byCategory = {};
  for (const r of output) byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  console.log(`\nDone. ${output.length} figures → ${resolvedOutputPath}`);
  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  return output;
}

module.exports = { classifyChapter };

// ── CLI ───────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const chapter = args.find(a => !a.startsWith('--'));
  if (!chapter) {
    console.log('Usage: node figure-platform/backend/classify_figures.js <chapter> [--all-figures] [--no-split]');
    process.exit(1);
  }
  const qmdOnly = !args.includes('--all-figures');
  const noSplit = args.includes('--no-split');
  classifyChapter(chapter, { qmdOnly, noSplit })
    .then(() => process.exit(0))
    .catch(e => { console.error(e.message); process.exit(1); });
}
